'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRuntimeWatchdog} = require('../modules/swapp-autonomy/runtime-watchdog');
const good = () => ({releaseComplete: true, accountsMysqlReady: true,
  newsMysqlConfigured: true, firestoreDisabled: true, legacyCronsDisabled: true});
test('passive sample only reads local state and does not mutate it', () => {
  const state = good();
  const messages = [];
  const watch = createRuntimeWatchdog({readState: () => state, log: m => messages.push(m), now: () => 0});
  assert.equal(watch.status().state, 'warming');
  const first = watch.check();
  assert.equal(first.state, 'healthy');
  assert.equal(first.checkedAt, '1970-01-01T00:00:00.000Z');
  first.checks.accountsMysqlReady = false;
  assert.equal(watch.status().checks.accountsMysqlReady, true);
  assert.deepEqual(messages, []);
});
test('degradation and recovery are notified once per transition', () => {
  let value = {...good(), accountsMysqlReady: false};
  const messages = [];
  const watch = createRuntimeWatchdog({readState: () => value, log: m => messages.push(m)});
  assert.equal(watch.check().state, 'degraded');
  assert.equal(watch.check().state, 'degraded');
  value = good();
  assert.equal(watch.check().state, 'healthy');
  assert.deepEqual(messages, ['degraded', 'recovered']);
});
test('sampling exception is isolated and never exposes its message', () => {
  const messages = [];
  const watch = createRuntimeWatchdog({readState: () => {throw new Error('PRIVATE_PASSWORD');}, log: m => messages.push(m)});
  const sample = watch.check();
  assert.equal(sample.state, 'error');
  assert.ok(!JSON.stringify(sample).includes('PRIVATE_PASSWORD'));
  watch.check();
  assert.deepEqual(messages, ['sampling-error']);
});
test('timer is unrefed and start and stop are idempotent', () => {
  let scheduled, cancelled = 0, unrefed = 0;
  const handle = {unref(){unrefed++;}};
  const watch = createRuntimeWatchdog({readState: good,
    schedule(fn, delay){scheduled = {fn, delay}; return handle;},
    cancel(received){assert.equal(received, handle);cancelled++;}});
  assert.equal(watch.start(), true);
  assert.equal(watch.start(), false);
  assert.equal(scheduled.delay, 60_000);
  assert.equal(unrefed, 1);
  scheduled.fn();
  assert.equal(watch.status().state, 'healthy');
  assert.equal(watch.stop(), true);
  assert.equal(watch.stop(), false);
  assert.equal(cancelled, 1);
});
test('invalid configuration fails closed', () => {
  assert.throws(() => createRuntimeWatchdog(), /callbacks/);
  assert.throws(() => createRuntimeWatchdog({readState: good, intervalMs: 5}), /interval/);
  assert.throws(() => createRuntimeWatchdog({readState: good, intervalMs: 9999999}), /interval/);
});
