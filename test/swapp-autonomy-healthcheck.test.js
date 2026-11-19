'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {probe, classify, verifyPayload} = require('../tools/swapp-autonomy-healthcheck');
const release = {service: 'swapp', complete: true, fingerprint: 'a'.repeat(64)};
const runtime = {success: true, firestoreRuntime: false, firebaseAppInitialized: false,
  legacySnapshotCron: false, legacyTrackedCron: false, accountsBackend: 'mysql',
  accountsReady: true, newsBackend: 'mysql'};
const ok = data => new Response(JSON.stringify(data), {status: 200, headers: {'content-type': 'application/json'}});
test('accepts meaningful release and runtime health proofs', async () => {
  const calls = [];
  const result = await probe({fetchImpl: async (url, opts) => {
    calls.push({url: String(url), opts});
    return url.pathname === '/api/release' ? ok(release) : ok(runtime);
  }});
  assert.equal(result.healthy, true);
  assert.deepEqual(result.results.map(r => r.state), ['ok', 'ok']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.opts.method === 'GET' && c.opts.redirect === 'manual'));
  assert.ok(calls.every(c => !c.url.includes('/api/actus')));
});
test('refuses editorial endpoints with GET-triggered MySQL adoption', async () => {
  await assert.rejects(() => probe({endpoints: [{name: 'news', path: '/api/actus'}]}), /Unsafe or duplicate endpoint/);
  await assert.rejects(() => probe({endpoints: [{name: 'cms', path: '/api/actus/release-status'}]}), /Unsafe or duplicate endpoint/);
});
test('never accepts redirect, firewall, 404, server failure as healthy', async () => {
  for (const [status, expected] of [[302, 'redirect'], [403, 'restricted'], [429, 'restricted'], [404, 'missing'], [503, 'unavailable']]) {
    const result = await probe({endpoints: [{name: 'release', path: '/api/release'}], fetchImpl: async () => new Response('', {status, headers: {location: '/login'}})});
    assert.equal(result.healthy, false);
    assert.equal(result.results[0].state, expected);
    assert.equal(classify(status), expected);
  }
});
test('detects fake 200 HTML challenge and false health payloads', async () => {
  const responses = [
    () => new Response('<html>challenge</html>', {headers: {'content-type': 'text/html'}}),
    () => ok({...release, complete: false}),
    () => new Response('not json', {headers: {'content-type': 'application/json'}})
  ];
  for (const [i, make] of responses.entries()) {
    const {results, healthy} = await probe({endpoints: [{name: 'release', path: '/api/release'}], fetchImpl: async () => make()});
    assert.equal(healthy, false);
    assert.equal(results[0].state, i === 0 ? 'invalid-type' : 'invalid-payload');
  }
  assert.equal(verifyPayload('runtime', {...runtime, accountsBackend: 'unavailable'}), false);
});
test('caps large payload and rejects unsafe configuration', async () => {
  const {results} = await probe({endpoints: [{name: 'release', path: '/api/release'}],
    fetchImpl: async () => new Response('a'.repeat(17000), {headers: {'content-type': 'application/json'}})});
  assert.equal(results[0].state, 'oversize');
  for (const baseUrl of ['https://user:pass@swapp.tv/', 'https://example.com/', 'http://swapp.tv/', 'https://swapp.tv/a']) {
    await assert.rejects(() => probe({baseUrl}), /Invalid origin/);
  }
  await assert.rejects(() => probe({endpoints: []}), /Unsafe or duplicate endpoint/);
  await assert.rejects(() => probe({endpoints: [{name: 'a', path: '/api/release'}, {name: 'b', path: '/api/release'}]}), /Unsafe or duplicate endpoint/);
});
test('timeout/failed network are reported without leaking responses', async () => {
  const response = await probe({endpoints: [{name: 'release', path: '/api/release'}],
    fetchImpl: async () => {const error = new Error('private-token'); error.name = 'AbortError'; throw error;}});
  assert.equal(response.results[0].state, 'timeout');
  assert.ok(!JSON.stringify(response).includes('private-token'));
});
