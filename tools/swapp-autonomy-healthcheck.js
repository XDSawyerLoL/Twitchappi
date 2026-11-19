'use strict';
// Side-effect-free, small public probes. Never poll the editorial GET routes:
// /api/actus and /api/actus/release-status can adopt releases into MySQL.
const MAX_BYTES = 16 * 1024;
const ALLOWED_PATHS = Object.freeze({
  '/api/release': 'release',
  '/api/swapp/storage-runtime': 'runtime'
});
const DEFAULT_ENDPOINTS = Object.freeze([
  Object.freeze({name: 'release', path: '/api/release'}),
  Object.freeze({name: 'storage-runtime', path: '/api/swapp/storage-runtime'})
]);
function classify(status) {
  if (status === 200) return 'ok';
  if ([401, 403, 429].includes(status)) return 'restricted';
  if (status >= 300 && status < 400) return 'redirect';
  if (status === 404) return 'missing';
  if (status >= 500) return 'unavailable';
  return 'unexpected';
}
function originUrl(baseUrl) {
  const root = new URL(baseUrl);
  const host = root.hostname.toLowerCase();
  const prod = root.protocol === 'https:' && ['swapp.tv', 'www.swapp.tv'].includes(host) && !root.port;
  const local = root.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(host);
  if (!(prod || local) || root.username || root.password || root.search || root.hash || root.pathname !== '/')
    throw new TypeError('Invalid origin');
  return root;
}
function verifyPayload(kind, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (kind === 'release') return data.service === 'swapp' && data.complete === true &&
    typeof data.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(data.fingerprint);
  if (kind === 'runtime') return data.success === true && data.firestoreRuntime === false &&
    data.firebaseAppInitialized === false && data.legacySnapshotCron === false &&
    data.legacyTrackedCron === false && data.accountsBackend === 'mysql' &&
    data.accountsReady === true && data.newsBackend === 'mysql';
  return false;
}
async function readBounded(response) {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_BYTES) throw new RangeError('Payload too large');
  if (!response.body || typeof response.body.getReader !== 'function') throw new TypeError('Unreadable response');
  const reader = response.body.getReader();
  let total = 0;
  const parts = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new RangeError('Payload too large');
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
async function probe({baseUrl = 'https://swapp.tv', fetchImpl = globalThis.fetch,
  endpoints = DEFAULT_ENDPOINTS, timeoutMs = 4500} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl required');
  const root = originUrl(baseUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000)
    throw new RangeError('Invalid timeout');
  if (!Array.isArray(endpoints) || !endpoints.length || endpoints.length > 2 ||
    new Set(endpoints.map(item => item?.path)).size !== endpoints.length ||
    endpoints.some(item => !item || typeof item.name !== 'string' || !item.name || !ALLOWED_PATHS[item.path]))
    throw new RangeError('Unsafe or duplicate endpoint');
  const results = [];
  for (const endpoint of endpoints) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(endpoint.path, root), {
        method: 'GET', signal: controller.signal, redirect: 'manual',
        headers: {accept: 'application/json', 'cache-control': 'no-cache'}
      });
      let state = classify(response.status);
      if (state === 'ok') {
        const type = response.headers?.get?.('content-type') || '';
        if (!/^application\/json(?:\s*;|\s*$)/i.test(type)) state = 'invalid-type';
        else {
          try {
            const data = JSON.parse(await readBounded(response));
            if (!verifyPayload(ALLOWED_PATHS[endpoint.path], data)) state = 'invalid-payload';
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            state = error instanceof RangeError ? 'oversize' : 'invalid-payload';
          }
        }
      }
      results.push({name: endpoint.name, path: endpoint.path, status: response.status,
        state, latencyMs: Date.now() - started});
    } catch (error) {
      results.push({name: endpoint.name, path: endpoint.path, status: null,
        state: error?.name === 'AbortError' ? 'timeout' : 'network-error',
        latencyMs: Date.now() - started});
    } finally { clearTimeout(timer); }
  }
  return {checkedAt: new Date().toISOString(), origin: root.origin,
    results, healthy: results.every(result => result.state === 'ok')};
}
module.exports = {probe, classify, DEFAULT_ENDPOINTS, verifyPayload, originUrl};
if (require.main === module) {
  probe({baseUrl: process.env.SWAPP_HEALTH_ORIGIN || 'https://swapp.tv'})
    .then(report => {process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exitCode = report.healthy ? 0 : 1;})
    .catch(error => {process.stderr.write(error.message + '\n'); process.exitCode = 2;});
}
