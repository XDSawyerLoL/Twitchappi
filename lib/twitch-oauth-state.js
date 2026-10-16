'use strict';

const crypto = require('node:crypto');

const TWITCH_OAUTH_COOKIE_NAME = 'swapp.twitch.oauth';
const TWITCH_OAUTH_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

function secureEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a, 'utf8');
  const second = Buffer.from(b, 'utf8');
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function signatureFor(state, issuedAt, secret) {
  return crypto.createHmac('sha256', secret).update(`${state}.${issuedAt}`).digest('hex');
}

function newTwitchOAuthState(secret, now = Date.now()) {
  if (!secret) throw new Error('Twitch OAuth state signing secret required');
  const state = crypto.randomBytes(32).toString('hex');
  const issuedAt = Math.floor(now);
  return {
    state,
    cookieValue: `${issuedAt}.${signatureFor(state, issuedAt, secret)}`
  };
}

function verifyTwitchOAuthState({ state, sessionState, cookieValue, secret, now = Date.now() }) {
  if (typeof state !== 'string' || !/^[a-f0-9]{32}(?:[a-f0-9]{32})?$/.test(state)) return null;
  // Maintain compatibility with in-flight sessions started before deployment.
  if (secureEquals(state, sessionState)) return 'session';
  if (typeof cookieValue !== 'string' || !secret) return null;
  const parts = /^(\d{13})\.([a-f0-9]{64})$/.exec(cookieValue);
  if (!parts) return null;
  const issuedAt = Number(parts[1]);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > TWITCH_OAUTH_TTL_MS) return null;
  return secureEquals(parts[2], signatureFor(state, issuedAt, secret)) ? 'signed-cookie' : null;
}

module.exports = { TWITCH_OAUTH_COOKIE_NAME, TWITCH_OAUTH_TTL_MS, newTwitchOAuthState, verifyTwitchOAuthState };
