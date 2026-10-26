'use strict';
/*
 * SWAPP Snaps -> dedicated Discord text channel.
 * The Discord webhook token lives ONLY in the Hostinger Node environment.
 * This module does not publish articles, lives, ordinary SOCIAL posts,
 * private posts, or browser-local Shorts.
 *
 * Call notifyPublished() AFTER a real public Snap publication commits.
 * The producer must use its persistent outbox to prevent repeat dispatch.
 */
const CHANNEL_ID = '1563559744612999239';

function isDiscordWebhook(raw) {
  try {
    const url = new URL(String(raw || ''));
    return url.protocol === 'https:' && url.hostname === 'discord.com'
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/api\/webhooks\/[0-9]{16,22}\/[A-Za-z0-9_-]{20,}$/.test(url.pathname);
  } catch { return false; }
}

function clean(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function canonicalSnapUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.origin !== 'https://swapp.tv' || url.pathname === '/' || url.username || url.password)
      return null;
    url.hash = '';
    url.search = '';
    return url.href;
  } catch { return null; }
}

function safeImage(raw) {
  try {
    const url = new URL(String(raw || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function buildSnapMessage(snap) {
  // Fail closed: only explicit, published, PUBLIC Snaps are ever announced.
  if (!snap || snap.type !== 'snap' || snap.status !== 'published'
    || snap.visibility !== 'public' || !snap.id) return null;

  const url = canonicalSnapUrl(snap.publicUrl || snap.url);
  if (!url) return null;

  const creator = clean(snap.creatorName || snap.authorName || 'Créateur SWAPP', 80);
  const caption = clean(snap.caption || snap.description || 'Nouveau Snap à découvrir.', 280);
  const image = safeImage(snap.thumbnailUrl || snap.posterUrl);
  const embed = {
    title: 'Nouveau Snap sur SWAPP',
    description: caption,
    url,
    color: 0xf97316,
    author: { name: creator },
    footer: { text: 'SWAPP · Snaps' }
  };
  if (image) embed.image = { url: image };
  if (snap.publishedAt && !Number.isNaN(Date.parse(snap.publishedAt)))
    embed.timestamp = new Date(snap.publishedAt).toISOString();

  return {
    username: 'SWAPP · Snaps',
    content: '🎬 **NOUVEAU SNAP** · ' + creator + '\n' + url,
    embeds: [embed],
    allowed_mentions: { parse: [] },
    tts: false
  };
}

function createSnapsDiscordNotifier({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  const webhook = env.SWAPP_SNAPS_DISCORD_WEBHOOK_URL;
  const configured = Boolean(webhook);
  const webhookValid = isDiscordWebhook(webhook);
  const enabled = env.NODE_ENV === 'production' && webhookValid
    && env.SWAPP_SNAPS_DISCORD_ENABLED !== 'false';
  let verifiedChannel = false;
  let verifying = null;

  async function verifyChannel() {
    if (!enabled) return false;
    if (verifiedChannel) return true;
    if (verifying) return verifying;
    verifying = (async () => {
      const response = await fetchImpl(webhook, {method: 'GET', headers: {'accept': 'application/json'}});
      if (!response.ok) throw Error('discord_snap_webhook_http_' + response.status);
      const data = await response.json();
      if (String(data?.channel_id || '') !== CHANNEL_ID)
        throw Error('discord_snap_webhook_wrong_channel');
      verifiedChannel = true;
      return true;
    })().finally(() => { verifying = null; });
    return verifying;
  }

  async function notifyPublished(snap) {
    if (!enabled) return {sent: false, reason: 'disabled'};
    const message = buildSnapMessage(snap);
    if (!message) return {sent: false, reason: 'not_public_published_snap'};
    await verifyChannel(); // Never post into articles or any other Discord channel.
    const url = new URL(webhook);
    url.searchParams.set('wait', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify(message), signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw Error('discord_snap_delivery_http_' + response.status);
    const data = await response.json();
    if (!/^[0-9]{16,22}$/.test(String(data?.id || '')))
      throw Error('discord_snap_message_unconfirmed');
    return {sent: true, messageId: String(data.id)};
  }

  return {
    notifyPublished, verifyChannel,
    status: () => ({channelId: CHANNEL_ID, configured, webhookValid, enabled, channelVerified: verifiedChannel})
  };
}

module.exports = {CHANNEL_ID, isDiscordWebhook, buildSnapMessage, createSnapsDiscordNotifier};
