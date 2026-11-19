'use strict';
// Pure scheduling decision engine. Never executes work or writes to storage.
const ENGINE_RULES = Object.freeze([
  {id: 'watchdog', intervalMs: 60_000, requires: []},
  {id: 'live', intervalMs: 180_000, requires: ['mysql', 'liveApis']},
  {id: 'magazine', intervalMs: 14_400_000, requires: ['mysql', 'editorialReview']},
  {id: 'social-podcast', intervalMs: 86_400_000, requires: ['mysql', 'mediaRights', 'audioCapacity']},
  {id: 'storefront', intervalMs: 86_400_000, requires: ['mysql', 'catalogReady']},
  {id: 'market', intervalMs: 43_200_000, requires: ['mysql', 'legalSources']},
  {id: 'packaging', intervalMs: 86_400_000, requires: ['mysql', 'productApproved', 'mediaRights']},
  {id: 'commercial-seo', intervalMs: 86_400_000, requires: ['mysql', 'productApproved', 'priceApproved']},
  {id: 'support', intervalMs: 3_600_000, requires: ['mysql', 'faqApproved']}
].map(rule => Object.freeze({...rule, requires: Object.freeze(rule.requires)})));
function planRuns({nowMs, enabled = [], readiness = {}, lastAttemptMs = {}, maxJobs = 1} = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid clock');
  if (!Array.isArray(enabled) || enabled.some(id => typeof id !== 'string' || !ENGINE_RULES.some(rule => rule.id === id)) ||
      new Set(enabled).size !== enabled.length) throw new TypeError('Invalid enabled engines');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 3) throw new RangeError('Invalid job cap');
  const allowed = new Set(enabled);
  const jobs = [], skipped = [];
  for (const rule of ENGINE_RULES) {
    if (!allowed.has(rule.id)) { skipped.push({id: rule.id, reason: 'disabled'}); continue; }
    const missing = rule.requires.filter(key => readiness[key] !== true);
    if (missing.length) { skipped.push({id: rule.id, reason: 'unready', missing}); continue; }
    const last = lastAttemptMs[rule.id];
    if (last !== undefined && (!Number.isSafeInteger(last) || last < 0 || last > nowMs))
      throw new RangeError('Invalid attempt timestamp');
    if (last !== undefined && nowMs - last < rule.intervalMs) {
      skipped.push({id: rule.id, reason: 'cooldown'}); continue;
    }
    if (jobs.length >= maxJobs) { skipped.push({id: rule.id, reason: 'capacity'}); continue; }
    const slot = Math.floor(nowMs / rule.intervalMs);
    jobs.push({id: rule.id, intervalMs: rule.intervalMs, dedupKey: rule.id + ':' + slot});
  }
  return {jobs, skipped};
}
module.exports = {ENGINE_RULES, planRuns};
