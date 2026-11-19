'use strict';
// Optional MySQL idempotency ledger. No schema migration or calls at module load.
const {randomUUID} = require('node:crypto');
const {ENGINE_RULES} = require('./planner');
const ENGINES = new Set(ENGINE_RULES.map(rule => rule.id));
const TABLE = 'swapp_autonomy_runs';
function validateJob(engineId, dedupKey) {
  if (!ENGINES.has(engineId) || typeof dedupKey !== 'string' ||
      !/^[a-z-]+:[0-9]{1,16}$/.test(dedupKey) || !dedupKey.startsWith(engineId + ':'))
    throw new TypeError('Invalid autonomy job');
}
function validateLease(leaseSeconds) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 3600)
    throw new RangeError('Invalid lease');
}
function checkResult(result) {
  if (!result || !Number.isInteger(result.affectedRows) || ![0, 1].includes(result.affectedRows))
    throw new Error('Unexpected MySQL lease result');
  return result.affectedRows === 1;
}
function createRunLedger({db} = {}) {
  if (!db || typeof db.execute !== 'function') throw new TypeError('MySQL executor required');
  async function claim({engineId, dedupKey, leaseSeconds = 180, maxAttempts = 2} = {}) {
    validateJob(engineId, dedupKey);
    validateLease(leaseSeconds);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3)
      throw new RangeError('Invalid retry limit');
    const token = randomUUID();
    const [created] = await db.execute(
      `INSERT IGNORE INTO ${TABLE} (engine_id,dedup_key,lease_token,state,attempts,started_at,lease_expires_at) VALUES (?, ?, ?, 'running', 1, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))`,
      [engineId, dedupKey, token, leaseSeconds]
    );
    if (checkResult(created)) return {claimed: true, token, reclaimed: false};
    // Atomic row update: a crashed worker can be reclaimed at most maxAttempts times.
    const [reclaimed] = await db.execute(
      `UPDATE ${TABLE} SET lease_token=?, attempts=attempts+1, started_at=UTC_TIMESTAMP(6), lease_expires_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND) WHERE engine_id=? AND dedup_key=? AND state='running' AND lease_expires_at < UTC_TIMESTAMP(6) AND attempts < ?`,
      [token, leaseSeconds, engineId, dedupKey, maxAttempts]
    );
    const acquired = checkResult(reclaimed);
    return {claimed: acquired, token: acquired ? token : null, reclaimed: acquired};
  }
  async function renew({engineId, dedupKey, token, leaseSeconds = 180} = {}) {
    validateJob(engineId, dedupKey);
    validateLease(leaseSeconds);
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) throw new TypeError('Invalid token');
    const [result] = await db.execute(
      `UPDATE ${TABLE} SET lease_expires_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND) WHERE engine_id=? AND dedup_key=? AND lease_token=? AND state='running' AND lease_expires_at > UTC_TIMESTAMP(6)`,
      [leaseSeconds, engineId, dedupKey, token]
    );
    return checkResult(result);
  }
  async function finish({engineId, dedupKey, token, outcome} = {}) {
    validateJob(engineId, dedupKey);
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) throw new TypeError('Invalid token');
    if (!['done', 'failed'].includes(outcome)) throw new TypeError('Invalid outcome');
    const [result] = await db.execute(
      `UPDATE ${TABLE} SET state=?, completed_at=UTC_TIMESTAMP(6), lease_expires_at=NULL WHERE engine_id=? AND dedup_key=? AND lease_token=? AND state='running' AND lease_expires_at > UTC_TIMESTAMP(6)`,
      [outcome, engineId, dedupKey, token]
    );
    return checkResult(result);
  }
  return Object.freeze({claim, renew, finish});
}
module.exports = {createRunLedger};
