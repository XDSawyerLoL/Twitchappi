'use strict';
// In-process passive health monitoring: no HTTP calls, SQL writes or restart actions.
const CHECK_KEYS = Object.freeze([
  'releaseComplete', 'accountsMysqlReady', 'newsMysqlConfigured',
  'firestoreDisabled', 'legacyCronsDisabled'
]);
function createRuntimeWatchdog({readState, log = () => {}, intervalMs = 60_000,
  schedule = (fn, ms) => setInterval(fn, ms), cancel = handle => clearInterval(handle),
  now = () => Date.now()} = {}) {
  if (typeof readState !== 'function' || typeof log !== 'function' ||
    typeof schedule !== 'function' || typeof cancel !== 'function' || typeof now !== 'function')
    throw new TypeError('Watchdog callbacks required');
  if (!Number.isInteger(intervalMs) || intervalMs < 15_000 || intervalMs > 300_000)
    throw new RangeError('Invalid watchdog interval');
  let handle = null;
  let snapshot = {scope: 'single_node_process', state: 'warming', checkedAt: null, checks: null};
  function check() {
    const previous = snapshot.state;
    try {
      const value = readState();
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid local state');
      const checks = Object.fromEntries(CHECK_KEYS.map(key => [key, value[key] === true]));
      const state = Object.values(checks).every(Boolean) ? 'healthy' : 'degraded';
      snapshot = {scope: 'single_node_process', state, checkedAt: new Date(now()).toISOString(), checks};
      if (previous !== state && (state === 'degraded' || previous === 'degraded' || previous === 'error'))
        log(state === 'healthy' ? 'recovered' : 'degraded');
    } catch (_) {
      snapshot = {scope: 'single_node_process', state: 'error', checkedAt: new Date(now()).toISOString(), checks: null};
      if (previous !== 'error') log('sampling-error');
    }
    return status();
  }
  function status() {
    return {...snapshot, checks: snapshot.checks ? {...snapshot.checks} : null};
  }
  function start() {
    if (handle !== null) return false;
    // First sampling is deferred until after application startup has settled.
    handle = schedule(check, intervalMs);
    if (!handle) throw new Error('Watchdog schedule unavailable');
    if (typeof handle.unref === 'function') handle.unref();
    return true;
  }
  function stop() {
    if (handle === null) return false;
    cancel(handle);
    handle = null;
    return true;
  }
  return Object.freeze({check, status, start, stop});
}
module.exports = {createRuntimeWatchdog, CHECK_KEYS};
