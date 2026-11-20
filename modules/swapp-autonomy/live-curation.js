'use strict';
// "Surprends-moi" from streams already fetched by Home Discovery.
// A sample of home cards is NOT a platform-wide trending chart.
const {replayTitle, rotationRank, MIN_FEATURE_VIEWERS} = require('../swapp-discovery-diversity');
const NON_GAME = new Set(['just chatting', "i'm only sleeping", 'music', 'art', 'talk shows & podcasts']);
const THREE_MINUTES = 180000;
function normalizedGame(row) {
  return String(row?.game_name || row?.game || row?.category || '').trim().slice(0,100);
}
function eligible(item) {
  const viewers = Number(item?.viewer_count ?? item?.viewers);
  const game = normalizedGame(item);
  if (!item || typeof item !== 'object' || replayTitle(item) ||
    !Number.isInteger(viewers) || viewers < MIN_FEATURE_VIEWERS || viewers >= 150 ||
    !game || NON_GAME.has(game.toLowerCase()) ||
    (item.type && item.type !== 'live')) return false;
  return /^(twitch|oryon|swapp)$/.test(String(item.platform || '').toLowerCase()) &&
    /^[a-z0-9_-]{2,40}$/i.test(String(item.login || item.user_login || ''));
}
function createLiveCuration({items = [], candidates = items, nowMs = Date.now()} = {}) {
  if (!Array.isArray(items) || !Array.isArray(candidates) ||
    !Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('Invalid live curation input');
  // Pointers always target the existing signed Home items, not cloned cards.
  const small = items.map((item,index) => ({item,index})).filter(x => eligible(x.item));
  const slot = Math.floor(nowMs / THREE_MINUTES);
  const ordered = small.slice().sort((a,b) =>
    rotationRank(a.item,slot) - rotationRank(b.item,slot) || a.index-b.index);
  const games = new Map();
  for (const {item} of small) {
    const game = normalizedGame(item);
    const key = game.toLocaleLowerCase('en');
    const previous = games.get(key) || {game,streams:0,viewersInSample:0};
    previous.streams++;
    previous.viewersInSample += Number(item.viewer_count ?? item.viewers);
    games.set(key,previous);
  }
  return {
    basis: 'home-sample-only',
    refreshWindowSeconds: THREE_MINUTES / 1000,
    sampledAt: new Date(nowMs).toISOString(),
    candidateCount: candidates.length,
    homeCount: items.length,
    eligibleSmallCount: small.length,
    excludedReplayCandidates: candidates.filter(row => row && replayTitle(row)).length,
    surpriseIndex: ordered.length ? ordered[0].index : null,
    gamesInSample: [...games.values()]
      .sort((a,b) => b.streams-a.streams || b.viewersInSample-a.viewersInSample || a.game.localeCompare(b.game))
      .slice(0,6)
  };
}
module.exports = {createLiveCuration, eligible};
