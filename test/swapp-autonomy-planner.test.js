'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ENGINE_RULES, planRuns} = require('../modules/swapp-autonomy/planner');
test('all nine engines are described but opt-in only', () => {
  assert.equal(ENGINE_RULES.length, 9);
  assert.equal(planRuns({nowMs: 1_800_000}).jobs.length, 0);
  assert.equal(planRuns({nowMs: 1_800_000}).skipped.length, 9);
});
test('only readiness-approved engines are queued', () => {
  const result = planRuns({nowMs: 1_800_000, enabled: ['live', 'magazine'], readiness: {mysql: true, liveApis: true}});
  assert.deepEqual(result.jobs.map(job => job.id), ['live']);
  assert.deepEqual(result.skipped.find(item => item.id === 'magazine').missing, ['editorialReview']);
});
test('concurrency cap and cooldown protect Hostinger', () => {
  const result = planRuns({nowMs: 1_800_000, enabled: ['watchdog', 'live'], readiness: {mysql: true, liveApis: true}, maxJobs: 1});
  assert.deepEqual(result.jobs.map(item => item.id), ['watchdog']);
  assert.equal(result.skipped.find(item => item.id === 'live').reason, 'capacity');
  const cooldown = planRuns({nowMs: 1_800_000, enabled: ['watchdog'], lastAttemptMs: {watchdog: 1_799_999}});
  assert.deepEqual(cooldown.jobs, []);
  assert.equal(cooldown.skipped.find(item => item.id === 'watchdog').reason, 'cooldown');
});
test('dedup key stable for one slot and moves in next slot', () => {
  const opts = {enabled: ['watchdog'], readiness: {}};
  const a = planRuns({...opts, nowMs: 180_005}).jobs[0].dedupKey;
  assert.equal(a, planRuns({...opts, nowMs: 180_999}).jobs[0].dedupKey);
  assert.notEqual(a, planRuns({...opts, nowMs: 240_000}).jobs[0].dedupKey);
});
test('commercial price changes require explicit readiness', () => {
  const common = {nowMs: 100_000_000, enabled: ['commercial-seo'], readiness: {mysql: true, productApproved: true}};
  assert.equal(planRuns(common).jobs.length, 0);
  assert.deepEqual(planRuns(common).skipped.find(x => x.id === 'commercial-seo').missing, ['priceApproved']);
});
test('invalid schedules fail closed', () => {
  assert.throws(() => planRuns({nowMs: NaN}), /clock/);
  assert.throws(() => planRuns({nowMs: 123, enabled: ['payment']}), /enabled/);
  assert.throws(() => planRuns({nowMs: 123, enabled: ['live', 'live']}), /enabled/);
  assert.throws(() => planRuns({nowMs: 123, maxJobs: 50}), /cap/);
  assert.throws(() => planRuns({nowMs: 123, enabled: ['watchdog'], lastAttemptMs: {watchdog: 124}}), /timestamp/);
});
