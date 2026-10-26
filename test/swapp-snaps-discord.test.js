'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CHANNEL_ID, isDiscordWebhook, buildSnapMessage, createSnapsDiscordNotifier
} = require('../modules/swapp-snaps/discord-notifier');

const HOOK = 'https://discord.com/api/webhooks/123456789012345678/This_is_a_fake_discord_webhook_token_12345';
const VALID = {
  id: 'snap_1', type: 'snap', status: 'published', visibility: 'public',
  publicUrl: 'https://swapp.tv/snaps/snap_1', creatorName: '@creator',
  caption: 'Un instant sur SWAPP', publishedAt: '2026-10-26T15:00:00.000Z'
};

test('the configured channel is ONLY the requested Snaps channel', () => {
  assert.equal(CHANNEL_ID, '1563559744612999239');
  assert.equal(isDiscordWebhook(HOOK), true);
  assert.equal(isDiscordWebhook('https://evil.example/api/webhooks/123/abc'), false);
});

test('no notification for articles, lives, ordinary posts, drafts or private Snaps', () => {
  for (const change of [
    {type: 'article'}, {type: 'live'}, {type: 'post'},
    {status: 'draft'}, {visibility: 'private'},
    {publicUrl: 'https://example.com/snaps/snap_1'},
    {publicUrl: 'http://swapp.tv/snaps/snap_1'}
  ]) {
    assert.equal(buildSnapMessage({...VALID, ...change}), null);
  }
  const message = buildSnapMessage({...VALID, caption: '@everyone <@123456789012345678>'});
  assert.equal(message.allowed_mentions.parse.length, 0);
  assert.equal(message.embeds[0].url, VALID.publicUrl);
  assert.equal(message.username, 'SWAPP · Snaps');
});

test('webhook must belong to the dedicated Discord channel before posting', async () => {
  let calls = 0;
  const notify = createSnapsDiscordNotifier({
    env: {NODE_ENV: 'production', SWAPP_SNAPS_DISCORD_WEBHOOK_URL: HOOK},
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.method, 'GET');
      return {ok: true, json: async () => ({channel_id: '999999999999999999'})};
    }
  });
  await assert.rejects(notify.notifyPublished(VALID), /wrong_channel/);
  assert.equal(calls, 1);
});

test('valid webhook receives one safe card and Discord acknowledgment is checked', async () => {
  const calls = [];
  const notify = createSnapsDiscordNotifier({
    env: {NODE_ENV: 'production', SWAPP_SNAPS_DISCORD_WEBHOOK_URL: HOOK},
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      if (options.method === 'GET')
        return {ok: true, json: async () => ({channel_id: CHANNEL_ID})};
      const body = JSON.parse(options.body);
      assert.equal(body.allowed_mentions.parse.length, 0);
      assert.equal(body.embeds[0].url, VALID.publicUrl);
      assert.equal(body.embeds[0].title, 'Nouveau Snap sur SWAPP');
      assert.match(url, /wait=true/);
      return {ok: true, json: async () => ({id: '123456789012345678'})};
    }
  });
  assert.deepEqual(await notify.notifyPublished(VALID), {sent: true, messageId: '123456789012345678'});
  assert.equal(notify.status().channelVerified, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.body.includes('This_is_a_fake_discord_webhook_token'), false);
});

test('no webhook means no network request or accidental fallback to article webhook', async () => {
  const notify = createSnapsDiscordNotifier({
    env: {NODE_ENV:'production', SWAPP_DISCORD_WEBHOOK_URL: HOOK},
    fetchImpl: () => {throw Error('must never call fetch');}
  });
  assert.equal(notify.status().enabled, false);
  assert.deepEqual(await notify.notifyPublished(VALID), {sent:false, reason:'disabled'});
});

test('no confirmation is not recorded as sent', async () => {
  const notify = createSnapsDiscordNotifier({
    env: {NODE_ENV:'production', SWAPP_SNAPS_DISCORD_WEBHOOK_URL: HOOK},
    fetchImpl: async (_url, options) => options.method === 'GET'
      ? {ok:true, json:async()=>({channel_id:CHANNEL_ID})}
      : {ok:true, json:async()=>({})}
  });
  await assert.rejects(notify.notifyPublished(VALID), /unconfirmed/);
});
