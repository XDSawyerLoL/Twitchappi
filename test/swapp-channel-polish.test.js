'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {planFor}=require('../assets/swapp-channel-polish.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function channelFixture({live=false,owner=false,banner=false,avatar=false,bio='',panels=false,links=false}={}){
 const elem=(content='',attrs={})=>({textContent:content,...attrs});
 const found={
  '.offlinePremium':!live?elem():null,
  '#channelBioSection p':elem(bio||"Cette chaîne n'a pas encore ajouté de bio."),
  '.channelTopHero > img[src]:not([src=""])':banner?elem():null,
  '.channelIdentity > img.avatar[src]:not([src=""])':avatar?elem():null,
  '.vignetteGrid .vignetteCard:not(.vignetteEmpty)':panels?elem():null,
  '.linksSide .linkCard':links?elem():null
 };
 return {
  querySelector:selector=>found[selector]||null,
  querySelectorAll:selector=>selector==='.channelActionDock button'&&owner?
   [{getAttribute:()=> "setView('settings')"}]:[]
 };
}
test('empty public channel shows honest offline and no invented panels or profile details',()=>{
 assert.deepEqual(planFor(channelFixture()),{
  live:false,owner:false,banner:false,avatar:false,bio:false,panels:false,links:false
 });
});
test('owner empty channel allows editing without announcing false live',()=>{
 const value=planFor(channelFixture({owner:true}));
 assert.equal(value.owner,true);
 assert.equal(value.bio,false);
 assert.equal(value.live,false);
});
test('content-rich live channel keeps player, real panels and external links',()=>{
 assert.deepEqual(planFor(channelFixture({
  live:true,owner:false,banner:true,avatar:true,bio:'Je joue principalement à Aion 2',panels:true,links:true
 })),{live:true,owner:false,banner:true,avatar:true,bio:true,panels:true,links:true});
});
test('single primary nav points at real sections, no decorative duplicate tabs',()=>{
 const js=read('assets/swapp-channel-polish.js');
 assert.match(js,/label:'Direct'/);
 assert.match(js,/label:'Présentation'/);
 assert.match(js,/label:p\.owner\?'Personnalisation':'Liens et panneaux'/);
 assert.match(js,/if\(!nav\.childElementCount\)nav\.hidden=true/);
 assert.match(js,/nav\.replaceChildren\(\)/);
 assert.match(js,/btn\.addEventListener\('click'/);
});
test('offline profile removes only inapplicable surfaces and preserves live transport/chat hooks',()=>{
 const js=read('assets/swapp-channel-polish.js'),css=read('assets/swapp-channel-polish.css');
 assert.match(js,/\.vignetteEmpty/);
 assert.match(js,/\.linkCard/);
 assert.match(js,/copyCurrentChannelLink\(\)/);
 assert.match(css,/data-channel-live="false"\] \.softEntryCard/);
 assert.match(css,/data-channel-live="false"\] \[data-deck-lurker-slot\]/);
 assert.match(css,/data-channel-live="false"\] \.channelLiveLayout/);
 assert.doesNotMatch(js,/innerHTML\s*=|fetch\(|WebSocket|socket\.emit|sendChat\(/);
});
test('SWAPP native color, mobile controls and no extra header/cart modules',()=>{
 const css=read('assets/swapp-channel-polish.css');
 assert.match(css,/var\(--swapp-page-accent/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/chatForm/);
 assert.doesNotMatch(css,/#[0-9a-f]{6}\s*!important/gi);
});
test('index loads cache-busted assets and deployment fingerprints track both',()=>{
 const index=read('index.html'),release=read('tools/swapp-release.js');
 for(const name of ['swapp-channel-polish.css','swapp-channel-polish.js']){
  assert.match(index,new RegExp(name.replaceAll('.','\\.')+'\\?v=20261022-channel-premium-v1'));
  assert.match(release,new RegExp("assets/"+name.replaceAll('.','\\.')));
 }
});
