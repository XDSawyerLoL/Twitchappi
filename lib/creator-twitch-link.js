'use strict';

/** Short-lived, account-bound proof for Twitch OAuth linking on SWAPP Creator. */
const crypto = require('node:crypto');
const COOKIE_NAME = 'swapp.creator.twitch.link';
const LINK_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

function hmac(state, userId, issuedAt, secret) {
  return crypto.createHmac('sha256', secret)
    .update('swapp-creator-twitch-link:v1\n' + state + '\n' + userId + '\n' + issuedAt)
    .digest('hex');
}

function secureMatch(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function issueCreatorTwitchLinkProof({ state, userId, secret, now = Date.now() }) {
  if (!/^[a-f0-9]{64}$/.test(String(state || '')) || !userId || !secret) throw new Error('Invalid creator link proof request');
  const issuedAt = Math.floor(now);
  const encodedId = Buffer.from(String(userId), 'utf8').toString('base64url');
  return issuedAt + '.' + encodedId + '.' + hmac(state, String(userId), issuedAt, secret);
}

function verifyCreatorTwitchLinkProof({ state, cookieValue, secret, now = Date.now() }) {
  if (!/^[a-f0-9]{64}$/.test(String(state || '')) || !secret) return null;
  const parts = /^(\d{13})\.([a-zA-Z0-9_-]{1,256})\.([a-f0-9]{64})$/.exec(String(cookieValue || ''));
  if (!parts) return null;
  const issuedAt = Number(parts[1]);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > LINK_TTL_MS) return null;
  const userId = Buffer.from(parts[2], 'base64url').toString('utf8');
  if (!userId || userId.length > 128) return null;
  return secureMatch(parts[3], hmac(state, userId, issuedAt, secret)) ? userId : null;
}

function findExistingTwitchOwner(users, twitchId, currentUserId) {
  const id = String(twitchId || '');
  if (!id) return null;
  return (Array.isArray(users) ? users : []).find(u =>
    String(u?.id || '') !== String(currentUserId || '') &&
    String(u?.twitch_link?.id || '') === id
  ) || null;
}

module.exports = {
  COOKIE_NAME, LINK_TTL_MS, issueCreatorTwitchLinkProof,
  verifyCreatorTwitchLinkProof, findExistingTwitchOwner
};
