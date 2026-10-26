'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('premium showcase files load after native channel modules',()=>{
 const html=read('index.html');
 const css=read('assets/swapp-channel-showcase.css');
 const js=read('assets/swapp-channel-showcase.js');
 new Function(js);
 assert.match(html,/swapp-channel-showcase\.css\?v=20261026-fixed-actions-v3/);
 assert.match(html,/swapp-channel-showcase\.js\?v=20261026-fixed-actions-v3/);
 assert.ok(html.indexOf('swapp-live-alert-bell.js')<html.indexOf('swapp-channel-showcase.js'));
 assert.match(css,/data-channel-live="true"/);
});
test('showcase preserves video, chat and live transport',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 assert.doesNotMatch(src,/server\.listen|requestOffer|new Hls|RTCPeerConnection/);
 assert.doesNotMatch(src,/\.channelMainPlayer[^']*\.style|\.chatPanel[^']*\.style/);
 assert.match(src,/layout\.after\(section\)/);
 assert.match(src,/page\.dataset\.swappShowcaseReady='1'/);
 assert.match(src,/new MutationObserver\(schedule\)\.observe\(root,\{childList:true\}\)/);
});
test('owner actions keep original DOM nodes and remain keyboard accessible',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 assert.match(src,/const owner=page\.dataset\.channelOwner==='true'/);
 assert.match(src,/if\(eligible\(node\)\)group\.content\.append\(node\)/);
 assert.match(src,/make\('details',cls\)/);
 assert.match(src,/make\('summary','swapp-showcase-summary',label\)/);
 assert.match(src,/swapp-showcase-owner-menu/);
 const css=read('assets/swapp-channel-showcase.css');
 assert.match(css,/\.swapp-showcase-summary:focus-visible/);
 assert.match(css,/\.swapp-showcase-floating-menu/);
});
test('visitor follow and real Push bell remain outside the overflow menu',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 assert.match(src,/!node\.classList\?\.contains\('swapp-channel-follow-btn'\)/);
 assert.match(src,/!node\.classList\?\.contains\('swapp-live-alert-bell'\)/);
 assert.match(src,/includes\('followOryon'\)/);
});
test('upcoming schedule is fetched from the existing public authenticated-safe API',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 assert.match(src,/api\/swapp\/channel\/'\+encodeURIComponent\(login\)\+'\/programme\?month=/);
 assert.match(src,/for\(let i=0;i<2;i\+\+\)/);
 assert.match(src,/completed===0\)return/);
 assert.match(src,/upcoming\.sort\(\(a,b\)=>Date\.parse/);
 assert.match(src,/upcoming\[0\]\|\|null/);
 assert.match(src,/encodeURIComponent\(login\)\+'\?tab=programme'/);
 assert.match(src,/credentials:'same-origin',cache:'no-store'/);
});
test('live and offline banner are distinct, with no video-size changes',()=>{
 const css=read('assets/swapp-channel-showcase.css');
 assert.match(css,/data-channel-live="true"[\s\S]*?min-height:192px!important/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/--showcase-accent:var\(--channel-accent/);
 assert.doesNotMatch(css,/\.channelMainPlayer[\s\S]{0,90}height:|\.channelLiveSidebar[\s\S]{0,90}height:/);
});

test('owner edit stays fixed and late controls are collected inside a menu',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 const studio=read('assets/swapp-browser-studio.js');
 const focus=read('assets/swapp-channel-focus-20261026.css');
 assert.match(src,/function ownerEdit\(dock\)/);
 assert.match(src,/dock\.prepend\(button\)/);
 assert.match(src,/SwappBrowserStudio\?\.editLive\?\.\(\)/);
 assert.match(src,/observer\.observe\(dock,\{childList:true\}\)/);
 assert.match(src,/group\.details\.hidden=group\.content\.childElementCount===0/);
 assert.match(studio,/if\(page\.dataset\.channelOwner!=='true'\)existing\?\.remove\(\)/);
 assert.match(focus,/display:inline-flex!important; \/\* permanent action/);
 assert.match(focus,/display:none!important; \/\* no duplicate/);
});
test('the owner menu floats outside the video/layout and remains dismissible',()=>{
 const src=read('assets/swapp-channel-showcase.js');
 const css=read('assets/swapp-channel-showcase.css');
 const atmosphere=read('assets/swapp-channel-atmosphere.js');
 assert.match(src,/document\.body\.append\(content\)/);
 assert.match(src,/classList\.add\('swapp-showcase-floating-menu'\)/);
 assert.match(src,/classList\.remove\('swapp-showcase-floating-menu'\)/);
 assert.match(src,/addEventListener\('pointerdown',onOutside,true\)/);
 assert.match(src,/addEventListener\('scroll',position,true\)/);
 assert.match(css,/\.swapp-showcase-floating-menu\s*\{[\s\S]*?position:fixed!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.doesNotMatch(atmosphere,/ownerMenu&&liveEdit\)ownerMenu\.append\(liveEdit\)/);
});
