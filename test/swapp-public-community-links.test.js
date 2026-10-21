'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {discordInvite,xProfile,blueskyProfile,publicCommunityLinks}=require('../modules/swapp-public-community-links');
const {gameHubs,renderGamePage}=require('../modules/swapp-game-pages');
test('webhooks and external redirects never become public server invitations',()=>{
 assert.equal(discordInvite('https://discord.gg/SwappGaming'), 'https://discord.gg/SwappGaming');
 assert.equal(discordInvite('https://discord.com/invite/SwappGaming'), 'https://discord.gg/SwappGaming');
 for(const value of [
  'https://discord.com/api/webhooks/1562391994284638231/secret_please_do_not_publish',
  'http://discord.gg/SwappGaming','https://discord.gg/SwappGaming?tracking=1',
  'https://discord.gg/SwappGaming#frag','https://evil.example/invite/SwappGaming',
  'https://discord.gg.evil.example/SwappGaming','https://discord.com/invite/../../secret'
 ]) assert.equal(discordInvite(value),null,value);
});
test('only real public X/Bluesky profiles pass validation',()=>{
 assert.equal(xProfile('https://twitter.com/SwappGaming'), 'https://x.com/SwappGaming');
 assert.equal(xProfile('https://x.com/intent'),null);
 assert.equal(xProfile('https://x.com/SwappGaming?user=admin'),null);
 assert.equal(blueskyProfile('https://bsky.app/profile/swapp.bsky.social'),'https://bsky.app/profile/swapp.bsky.social');
 assert.equal(blueskyProfile('https://bsky.app/profile/swapp.bsky.social?token=foo'),null);
});
test('SWAPP owner Discord invite is available by default and can be overridden in the future',()=>{
 const defaultLinks=publicCommunityLinks({});
 assert.equal(defaultLinks.discordInvite,'https://discord.gg/AYKJYYJrTJ');
 assert.equal(publicCommunityLinks({SWAPP_DISCORD_INVITE_URL:'https://discord.gg/OtherValidCode'}).discordInvite,'https://discord.gg/OtherValidCode');
 assert.equal(publicCommunityLinks({SWAPP_DISCORD_INVITE_URL:'https://discord.com/api/webhooks/123456789012345678/not-a-public-invite'}).discordInvite,'https://discord.gg/AYKJYYJrTJ');
});
test('browser receives validated public links, not a private Discord webhook',()=>{
 const env={
  SWAPP_DISCORD_INVITE_URL:'https://discord.gg/SWAPP2026',
  SWAPP_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/secret',
  SWAPP_X_PROFILE_URL:'https://x.com/SwappGaming',
  SWAPP_BLUESKY_PROFILE_URL:'https://bsky.app/profile/swapp.bsky.social'
 };
 const actual=publicCommunityLinks(env);
 assert.deepEqual(actual,{
  discordInvite:'https://discord.gg/SWAPP2026',xProfile:'https://x.com/SwappGaming',
  blueskyProfile:'https://bsky.app/profile/swapp.bsky.social'
 });
 assert.doesNotMatch(JSON.stringify(actual),/webhooks|secret|SWAPP_DISCORD_WEBHOOK_URL/);
});
test('GAME UNIVERSE retains its real article & play discovery while offering safe social sharing',()=>{
 const article={slug:'news-game-sample',game:'Elden Ring',title:'Elden Ring : actualité vérifiée',summary:'Vraie actualité confirmée.',status:'published'};
 const group=gameHubs([article])[0];
 assert.ok(group);
 const html=renderGamePage(group);
 assert.match(html,/Partager ce jeu sur X/);
 assert.match(html,/Discuter sur SWAPP SOCIAL/);
 assert.match(html,/https:\/\/x\.com\/intent\/tweet/);
 assert.match(html,/bsky\.app\/intent\/compose/);
 assert.match(html,/\/social\?game=Elden%20Ring/);
 assert.match(html,/data-swapp-live-shelf/);
 assert.match(html,/href="\/actus\/news-game-sample"/);
});
test('public community endpoint is read only, no secrets, cached briefly',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const segment=server.split("app.get('/api/swapp/community-links'")[1]?.split("app.get('/api/release'")[0]||'';
 assert.match(segment,/publicCommunityLinks/);
 assert.match(segment,/max-age=300/);
 assert.doesNotMatch(segment,/DISCORD_WEBHOOK_URL|SWAPP_MYSQL_URL|appPassword|post\(/);
});
