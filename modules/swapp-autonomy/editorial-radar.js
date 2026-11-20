'use strict';
// Read-only editorial suggestions based on bounded, comparable Twitch samples.
// A change in a live sample is NEVER proof of a game update or news event.
const {equivalent, editorialGame} = require('../swapp-news/game-identity');
const ARTICLE_SLUG = /^[a-z0-9][a-z0-9-]{1,108}[a-z0-9]$/;
const MAX_RESULTS = 6;
const MAX_AGE_SECONDS = 900;
function publishedArticles(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 200)
    .filter(a => a && a.status === 'published' && ARTICLE_SLUG.test(String(a.slug || ''))
      && String(a.title || '').trim().length > 0 && String(editorialGame(a) || '').trim())
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}
function isGuide(a) {
  return /^(?:guide|guides)$/i.test(String(a.category || '').trim()) ||
    String(a.contentType || '').toLowerCase() === 'guide' ||
    (Array.isArray(a.tags) && a.tags.some(x => /^(?:guide|guides)$/i.test(String(x).trim())));
}
function safeRelated(a) {
  return a ? {
    title: String(a.title).slice(0, 150),
    url: '/actus/' + a.slug,
    publishedAt: typeof a.publishedAt === 'string' ? a.publishedAt.slice(0, 40) : null
  } : null;
}
function buildEditorialRadar({trends, articles = [], catalogueStatus = 'available', nowMs = Date.now()} = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('Invalid radar clock');
  if (!trends || trends.state !== 'ready' || trends.comparable !== true ||
    trends.source !== 'twitch-helix-fr-first100' ||
    trends.coverage !== 'bounded-provider-sample-not-market-share' ||
    !Array.isArray(trends.games) || !Number.isFinite(trends.ageSeconds) ||
    trends.ageSeconds < 0 || trends.ageSeconds > MAX_AGE_SECONDS ||
    !Number.isFinite(Date.parse(trends.sampledAt || '')) ||
    !Number.isFinite(Date.parse(trends.previousSampledAt || ''))) {
    return {state: 'awaiting-comparable-samples', actionable: false,
      reason: 'fresh_verified_comparable_history_required', opportunities: []};
  }
  const existing = publishedArticles(articles);
  const candidates = trends.games.slice(0, 15)
    .filter(g => g && typeof g.game === 'string' && g.game.trim().length > 1 &&
      Number.isInteger(g.streams) && g.streams >= 1 &&
      Number.isSafeInteger(g.observedViewers) && g.observedViewers >= 0 &&
      Number.isInteger(g.deltaStreams) && Number.isSafeInteger(g.deltaObservedViewers) &&
      Number.isInteger(g.deltaSmallStreams) &&
      (g.deltaStreams > 0 || g.deltaObservedViewers > 0 || g.deltaSmallStreams > 0))
    .sort((a, b) => Math.max(0, b.deltaStreams) - Math.max(0, a.deltaStreams) ||
      b.deltaObservedViewers - a.deltaObservedViewers ||
      b.deltaSmallStreams - a.deltaSmallStreams || a.game.localeCompare(b.game));
  const seen = new Set(), opportunities = [];
  for (const g of candidates) {
    const name = g.game.trim().slice(0, 100), key = String(g.gameId || name).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = existing.filter(a => equivalent(editorialGame(a), name));
    const last = matches[0] || null;
    const guide = matches.find(isGuide) || null;
    // Only publish a guide link that is actually backed by a public route.
    const guideLink = guide ? safeRelated(guide) :
      equivalent(name, 'Aion 2') ? {title: 'Guide Aion 2', url: '/guides/aion-2', publishedAt: null} : null;
    opportunities.push({
      game: name, gameId: String(g.gameId || '').slice(0, 30),
      observation: {
        streams: g.streams, observedViewers: g.observedViewers, smallStreams: g.smallStreams,
        deltaStreams: g.deltaStreams, deltaObservedViewers: g.deltaObservedViewers,
        deltaSmallStreams: g.deltaSmallStreams
      },
      editorial: {
        recommendedAction: guideLink ? 'review-existing-guide' : 'research-guide',
        sourceVerificationRequired: true, publicationAuthorized: false,
        relatedArticle: safeRelated(last), publishedGuide: guideLink,
        publishedArticleCountInBoundedIndex: matches.length
      }
    });
    if (opportunities.length >= MAX_RESULTS) break;
  }
  return {
    state: 'ready', actionable: opportunities.length > 0,
    basis: 'twitch-fr-first100-two-samples-editorial-ideas-only',
    sampledAt: trends.sampledAt, previousSampledAt: trends.previousSampledAt,
    coverage: trends.coverage, catalogueStatus,
    sampleLimit: 100, publishedIndexLimit: 200,
    publicationAuthorized: false,
    opportunities
  };
}
function createEditorialRadarService({getTrends, loadPublished, now = Date.now, cacheMs = 600000} = {}) {
  if (typeof getTrends !== 'function' || typeof loadPublished !== 'function' ||
      typeof now !== 'function' || !Number.isInteger(cacheMs) || cacheMs < 60000)
    throw new TypeError('Invalid editorial radar dependencies');
  let cached = null, inFlight = null;
  async function getPublished() {
    if (cached && now() < cached.until) return cached;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const items = await loadPublished();
        if (!Array.isArray(items) || items.length > 200) throw new TypeError('Invalid article list');
        cached = {until: now() + cacheMs, items, status: 'available'};
      } catch (_) {
        // Fail closed: never invent published article links; back off for 60s.
        cached = {until: now() + 60000, items: [], status: 'unavailable'};
      }
      return cached;
    })().finally(() => {inFlight = null;});
    return inFlight;
  }
  async function report() {
    try {
      const trends = await getTrends();
      if (!trends || trends.state !== 'ready' || trends.comparable !== true)
        return buildEditorialRadar({trends, nowMs: now()});
      const publicationIndex = await getPublished();
      return buildEditorialRadar({
        trends, articles: publicationIndex.items,
        catalogueStatus: publicationIndex.status, nowMs: now()
      });
    } catch (_) {
      return {state: 'unavailable', actionable: false, opportunities: []};
    }
  }
  return Object.freeze({report});
}
module.exports = {buildEditorialRadar, createEditorialRadarService, publishedArticles, isGuide};