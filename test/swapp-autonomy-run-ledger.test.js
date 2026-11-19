'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRunLedger} = require('../modules/swapp-autonomy/run-ledger');
const job = {engineId: 'live', dedupKey: 'live:100'};
test('claim first execution uses bounded parameters and unique token', async () => {
  const calls = [];
  const ledger = createRunLedger({db: {execute: async (sql, params) => {calls.push({sql, params}); return [{affectedRows: 1}];}}});
  const result = await ledger.claim(job);
  assert.equal(result.claimed, true);
  assert.equal(result.reclaimed, false);
  assert.match(result.token, /^[a-f0-9-]{36}$/);
  assert.match(calls[0].sql, /INSERT IGNORE/);
  assert.deepEqual(calls[0].params.slice(0, 2), ['live', 'live:100']);
  assert.equal(calls[0].params[3], 180);
});
test('duplicate job cannot claim an unexpired lease', async () => {
  let calls = 0;
  const ledger = createRunLedger({db: {execute: async () => {calls++; return [{affectedRows: 0}];}}});
  assert.deepEqual(await ledger.claim(job), {claimed: false, token: null, reclaimed: false});
  assert.equal(calls, 2);
});
test('expired running lease is reclaimable with fenced replacement token', async () => {
  const sql = [];
  const ledger = createRunLedger({db: {execute: async (statement, args) => {
    sql.push([statement, args]); return [{affectedRows: sql.length === 1 ? 0 : 1}];
  }}});
  const state = await ledger.claim({...job, leaseSeconds: 60, maxAttempts: 3});
  assert.equal(state.claimed, true);
  assert.equal(state.reclaimed, true);
  assert.match(sql[1][0], /state='running'.*lease_expires_at < UTC_TIMESTAMP/);
  assert.equal(sql[1][1][4], 3);
});
test('finish and renew use fenced token and do not ignore expired leases', async () => {
  const calls = [];
  const ledger = createRunLedger({db: {execute: async (sql, params) => {calls.push({sql, params}); return [{affectedRows: 1}];}}});
  const claimed = await ledger.claim(job);
  assert.equal(await ledger.renew({...job, token: claimed.token, leaseSeconds: 45}), true);
  assert.equal(await ledger.finish({...job, token: claimed.token, outcome: 'done'}), true);
  assert.match(calls[1].sql, /lease_token=\?.*lease_expires_at > UTC_TIMESTAMP/);
  assert.match(calls[2].sql, /lease_token=\?.*lease_expires_at > UTC_TIMESTAMP/);
});
test('fails closed on missing MySQL and malformed input', async () => {
  assert.throws(() => createRunLedger(), /executor/);
  const ledger = createRunLedger({db: {execute: async () => {throw new Error('Database unavailable');}}});
  await assert.rejects(() => ledger.claim({engineId: 'unknown', dedupKey: 'unknown:10'}), /Invalid autonomy job/);
  await assert.rejects(() => ledger.claim({...job, leaseSeconds: 2}), /Invalid lease/);
  await assert.rejects(() => ledger.claim({...job, maxAttempts: 100}), /Invalid retry limit/);
  await assert.rejects(() => ledger.claim(job), /Database unavailable/);
});
test('refuses stale token and inconsistent SQL responses', async () => {
  const ledger = createRunLedger({db: {execute: async () => [{affectedRows: 0}]}});
  assert.equal(await ledger.finish({...job, token: 'a'.repeat(8) + '-bcd1-4e3f-acad-001122334455', outcome: 'failed'}), false);
  await assert.rejects(() => ledger.finish({...job, token: 'not-a-token', outcome: 'done'}), /Invalid token/);
  const malformed = createRunLedger({db: {execute: async () => [{affectedRows: 2}]}});
  await assert.rejects(() => malformed.claim(job), /Unexpected MySQL lease result/);
});
