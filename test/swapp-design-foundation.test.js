'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('design tokens reuse the same accent across SPA and native editorial pages',()=>{
 const css=read('assets/swapp-unified-nav.css');
 const home=read('index.html');
 const news=read('modules/swapp-news/site-shell.js');
 assert.match(css,/SWAPP DESIGN FOUNDATION 2026-10-25/);
 assert.match(css,/--swapp-accent-focus:var\(--swapp-page-accent,var\(--brand/);
 assert.match(css,/--swapp-radius-panel:14px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(forced-colors:active\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(home,/swapp-unified-nav\.css\?v=/);
 assert.match(news,/swapp-unified-nav\.css\?v=/);
});
test('merged rollout has a real free follow and opt-in notification path without fake paywall',()=>{
 const html=read('index.html');
 const module=read('modules/swapp-live-push.js');
 const video=read('assets/swapp-watch-experience.js');
 assert.match(html,/swapp-channel-follow\.js\?v=/);
 assert.match(html,/swapp-live-alert-bell\.js\?v=/);
 assert.match(module,/SWAPP_PUSH_ENABLED/);
 assert.match(video,/currentBroadcastTitle\(page\)/);
 assert.match(video,/function installOfflineAlignment\(page\)/);
});

test('release fingerprint tracks the public player and GIF UI as well as the central theme',()=>{
 const {RELEASE_FILES}=require('../tools/swapp-release');
 for(const p of ['assets/swapp-watch-experience.js','assets/swapp-watch-experience.css',
  'assets/swapp-chat-v2.js','assets/swapp-chat-v2.css','assets/swapp-unified-nav.css'])
  assert.ok(RELEASE_FILES.includes(p),'not fingerprinted: '+p);
});
