'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PROVIDERS,socialLink,normalizeChannelSocialLinks}=require('../modules/swapp-channel-social-links');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const live=src('assets/swapp-live-alert-bell.js'),
 actions=src('assets/swapp-live-viewer-actions.js'),
 network=src('assets/swapp-creator-social-shortcuts.js'),
 styling=src('assets/swapp-creator-social-shortcuts.css'),
 html=src('index.html'),server=src('server.js');
test('Four creator platforms accept real HTTPS profile/group links',()=>{
 assert.deepEqual(PROVIDERS,['signal','bluesky','mastodon','minds']);
 const input={
  signal:'https://signal.group/#abcdefgh',
  bluesky:'https://bsky.app/profile/creator.bsky.social',
  mastodon:'https://mastodon.social/@creator',
  minds:'https://www.minds.com/creator/'
 };
 assert.deepEqual(normalizeChannelSocialLinks(input),input);
 assert.equal(socialLink('https://signal.me/#eu/abcdefghijklmnop','signal'),
  'https://signal.me/#eu/abcdefghijklmnop');
 assert.equal(socialLink('https://mastodon.example/@creator','mastodon'),
  'https://mastodon.example/@creator');
 assert.equal(normalizeChannelSocialLinks({signal:''}).signal,'');
 assert.equal(socialLink('https://www.minds.com/@creator','minds'),
  'https://www.minds.com/@creator');
});
test('Reject forged network domains, javascript, credentials, local URLs and invalid paths',()=>{
 const invalid=[
  ['https://evil.com/?link=signal.group','signal'],
  ['https://signal.group.evil.com/#abc','signal'],
  ['http://bsky.app/profile/me','bluesky'],
  ['javascript:alert(1)','mastodon'],
  ['https://alice:pass@mastodon.social/@user','mastodon'],
  ['https://localhost/@user','mastodon'],
  ['https://127.0.0.1/@user','mastodon'],
  ['https://bsky.app/','bluesky'],
  ['https://minds.com/','minds'],
  ['https://mastodon.social/%ZZ','mastodon']
 ];
 for(const [value,provider] of invalid)assert.throws(()=>socialLink(value,provider),/swapp_social_link_invalid/);
});
test('Only logged-in account owner can save social links; result is public and persistent',()=>{
 assert.match(server,/user\.channel_social_links=normalizeChannelSocialLinks\(req\.body\.channel_social_links\)/);
 assert.match(server,/channel_social_links:normalizeChannelSocialLinks\(u\.channel_social_links\)/);
 assert.match(server,/user\.channel_social_links=normalizeChannelSocialLinks\(user\.channel_social_links\)/);
 assert.match(server,/await restoreOryonSessionFromRememberCookie\(req, res, \{allowUserRecovery:false\}\)/);
 assert.match(server,/if\(!cur\?\.id\) return res\.status\(401\)/);
 assert.match(server,/const persistResult = await writeOryonUsersAndWait\(data\)/);
});
test('Actual mini-icons are adjacent to the real player controls and public links are click-through',()=>{
 new Function(network);
 assert.match(network,/\.channelMainPlayer/);
 assert.match(network,/main\.querySelector\('\.swapp-watch-tools'\)\|\|main/);
 assert.match(network,/row\.replaceChildren\(\)/);
 assert.match(network,/\.target='_blank'/);
 assert.match(network,/\.rel='noopener noreferrer nofollow ugc'/);
 assert.match(network,/picture\(icon\)/);
 assert.match(network,/swapp-showcase-owner-menu \.swapp-showcase-menu-content/);
 assert.match(network,/body:JSON\.stringify\(\{channel_social_links:expected\}\)/);
 assert.match(network,/const verified=await publicProfile\(dialogFor\)/);
 assert.doesNotMatch(network,/\.channelMainPlayer.*\.style\.height|new Hls|MediaSource|RTCPeerConnection/);
 assert.match(styling,/margin-left:auto/);
 assert.match(styling,/@media\(max-width:800px\)/);
});
test('Bell remains visible even when Push configuration is unavailable, without faking activation',()=>{
 new Function(live);new Function(actions);
 assert.match(live,/button\.hidden=false;button\.disabled=false/);
 assert.match(live,/if\(!available\)\{/);
 assert.match(live,/service de notifications SWAPP doit être activé/);
 assert.match(live,/button\.dataset\.swappAlertAvailable='false'/);
 assert.doesNotMatch(live,/button\.hidden=true/);
 assert.match(live,/Notification\.requestPermission\(\)/);
 assert.match(live,/pushManager\.subscribe/);
 assert.match(actions,/swapp-live-alert-preview/);
 assert.match(actions,/toolbar\.querySelector\('\.swapp-live-alert-bell'\)/);
 assert.match(actions,/toolbar\.querySelector\('\.swapp-live-alert-preview'\)\?\.remove\(\)/);
 assert.doesNotMatch(actions,/new WebSocket|new Hls/);
});
test('Resources are included in the channel route with versions and without touching live dimensions',()=>{
 assert.match(html,/swapp-creator-social-shortcuts\.css\?v=20261026-social-shortcuts-v1/);
 assert.match(html,/swapp-creator-social-shortcuts\.js\?v=20261026-social-shortcuts-v1/);
 assert.match(html,/swapp-live-alert-bell\.js\?v=20261026-bell-visible-v3/);
 assert.match(html,/swapp-live-viewer-actions\.js\?v=20261026-bell-owner-v2/);
 assert.ok(html.indexOf('swapp-creator-social-shortcuts.js')>html.indexOf('swapp-live-viewer-actions.js'));
 assert.doesNotMatch(styling,/\.channelMainPlayer\s*\{[^}]*height/);
 assert.doesNotMatch(styling,/\.chatPanel\s*\{[^}]*height/);
 assert.equal(styling.split('{').length,styling.split('}').length);
});
