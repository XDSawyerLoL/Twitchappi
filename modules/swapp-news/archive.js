'use strict';

const POSTS = /^\/supporters\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const VIDEO = /^\/supporters\/video_embeds\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

function archiveUrlKey(value, kind = 'post') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['justplayer.fr', 'www.justplayer.fr'].includes(url.hostname)) return null;
    if (!(kind === 'video_embed' ? VIDEO : POSTS).test(url.pathname)) return null;
    return url.pathname.replace(/\/$/, '');
  } catch (_) { return null; }
}

function getPublicArchives(catalog, published = []) {
  const existingUrls = new Set(published.map(x => archiveUrlKey(x.legacyUrl)).filter(Boolean));
  const existingTitles = new Set(published.map(x => String(x.title || '').trim().toLocaleLowerCase('fr')).filter(Boolean));
  const seen = new Set();
  const entries = [];
  for (const item of (Array.isArray(catalog?.items) ? catalog.items : [])) {
    if (!['post','video_embed'].includes(item?.type)) continue;
    const key = archiveUrlKey(item.url, item.type);
    const title = String(item.title || '').trim().slice(0, 180);
    if (!key || title.length < 8 || seen.has(key)) continue;
    seen.add(key);
    if (existingUrls.has(key) || existingTitles.has(title.toLocaleLowerCase('fr'))) continue;
    const day = String(item.publishedAt || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) continue;
    entries.push({title, url: `https://justplayer.fr${key}`, publishedAt: day, type: item.type});
  }
  return entries.sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title,'fr')).slice(0,50);
}

module.exports = {archiveUrlKey, getPublicArchives};
