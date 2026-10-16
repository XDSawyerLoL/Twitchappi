'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TWITCH_OAUTH_COOKIE_NAME, TWITCH_OAUTH_TTL_MS,
  newTwitchOAuthState, verifyTwitchOAuthState
} = require('../lib/twitch-oauth-state');
const secret = 'stable-private-session-secret-for-tests';
const timestamp = 1781600000000;

test('SWAPP creates random Twitch OAuth state and a separately signed first-party cookie', () => {
  const one = newTwitchOAuthState(secret, timestamp);
  const two = newTwitchOAuthState(secret, timestamp);
  assert.equal(TWITCH_OAUTH_COOKIE_NAME, 'swapp.twitch.oauth');
  assert.match(one.state, /^[a-f0-9]{64}$/);
  assert.notEqual(one.state, two.state);
  assert.equal(one.cookieValue.split('.').length, 2);
  assert.ok(!one.cookieValue.includes(one.state));
});

test('session state remains accepted, including pre-migration 32-character states', () => {
  const {state} = newTwitchOAuthState(secret, timestamp);
  assert.equal(verifyTwitchOAuthState({state,sessionState:state,now:timestamp}), 'session');
  assert.equal(verifyTwitchOAuthState({state:'a'.repeat(32),sessionState:'a'.repeat(32)}), 'session');
});

test('signed cookie supports callback when server session no longer exists', () => {
  const {state,cookieValue} = newTwitchOAuthState(secret, timestamp);
  assert.equal(verifyTwitchOAuthState({state,cookieValue,secret,now:timestamp+90000}), 'signed-cookie');
});

test('absent, modified and mismatched authentication states cannot be used', () => {
  const {state,cookieValue} = newTwitchOAuthState(secret, timestamp);
  const tamperedCookie = cookieValue.slice(0,-1)+(cookieValue.endsWith('0')?'1':'0');
  for (const params of [
    {state,sessionState:null,cookieValue:null},
    {state:'f'.repeat(64),cookieValue},
    {state,cookieValue:tamperedCookie},
    {state,cookieValue,secret:'wrong-secret'},
    {state:'bad',cookieValue}
  ]) {
    assert.equal(verifyTwitchOAuthState({secret,now:timestamp,...params}), null);
  }
});

test('signed cookie rejects expired and future-dated states', () => {
  const {state,cookieValue} = newTwitchOAuthState(secret, timestamp);
  assert.equal(verifyTwitchOAuthState({state,cookieValue,secret,now:timestamp+TWITCH_OAUTH_TTL_MS+1}), null);
  assert.equal(verifyTwitchOAuthState({state,cookieValue,secret,now:timestamp-31000}), null);
});
