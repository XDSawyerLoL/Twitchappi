'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {page}=require('../modules/swapp-program');
test('desktop side dock starts beside the player and contains three compact mutually exclusive tabs',()=>{
 const h=page('tv');
 const stage=h.indexOf('class="stv-stage"'),side=h.indexOf('class="stv-rail stv-dock"'),end=h.indexOf('</aside>',side);
 assert.ok(stage>0&&side>stage&&end>side);
 assert.match(h,/class="stv-dock-tabs" role="tablist"/);
 for(const id of ['stv-tab-twitch','stv-tab-swapp','stv-tab-queue','stv-pane-queue','stv-pane-swapp','stv-pane-twitch','stv-chat-area'])
  assert.equal((h.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(h,/id="stv-tab-twitch" role="tab" aria-selected="true"/);
 assert.match(h,/id="stv-tab-swapp" role="tab" aria-selected="false"/);
 assert.match(h,/id="stv-tab-queue" role="tab" aria-selected="false"/);
 assert.match(h,/id="stv-pane-swapp"[^>]+hidden/);
 assert.match(h,/id="stv-pane-queue"[^>]+hidden/);
 assert.doesNotMatch(h,/class="stv-chat-heading"|class="stv-chat-tabs"/);
});
test('queue replaces chat in the dock without creating another section under the video',()=>{
 const h=page('tv'),tv=h.slice(h.indexOf('<main id="swapp-tv"'),h.indexOf('<dialog id="stv-program-dialog"'));
 assert.match(tv,/<aside class="stv-rail stv-dock"[\s\S]+?id="stv-pane-queue"[\s\S]+?id="stv-creator-access"[\s\S]+?id="stv-chat-area"[\s\S]+?<\/aside>/);
 assert.doesNotMatch(tv,/class="stv-bottom"|class="stv-queue-tease"|id="stv-queue-list"/);
 const js=read('assets/swapp-tv-broadcast.js');
 assert.match(js,/activeDock=kind/);
 assert.match(js,/\$\('stv-chat-area'\)\.hidden=kind==='queue'/);
 assert.match(js,/x\.pane\.hidden=!active/);
 assert.match(js,/if\(kind==='twitch'\)updateTwitchChat\(\)/);
});
test('desktop uses two columns down to 981px, then a keyboard-accessible drawer rather than below-video chat',()=>{
 const css=read('assets/swapp-program.css'),js=read('assets/swapp-tv-broadcast.js'),h=page('tv');
 assert.match(css,/\.stv \.stv-broadcast\{display:grid!important;grid-template-columns:minmax\(0,1fr\) clamp\(310px,27vw,365px\)!important/);
 assert.match(css,/@media \(max-width:1150px\) and \(min-width:981px\)/);
 assert.match(css,/@media \(max-width:980px\)/);
 assert.match(css,/\.stv \.stv-dock\{position:fixed!important/);
 assert.match(css,/\.stv \.stv-dock\.is-open\{visibility:visible/);
 assert.match(css,/\.stv \.stv-dock-scrim:not\(\[hidden\]\)/);
 for(const id of ['stv-dock-toggle','stv-dock-close','stv-dock-scrim'])assert.match(h,new RegExp('id="'+id+'"'));
 assert.match(js,/dock\.inert=mobile&&!open/);
 assert.match(js,/dockToggle\.setAttribute\('aria-expanded',String\(open\)\)/);
 assert.match(js,/if\(e\.key==='Escape'&&dock\.classList\.contains\('is-open'\)\)closeDock\(\)/);
 assert.match(js,/ArrowLeft','ArrowRight','Home','End'/);
});
test('the Twitch chat iframe remains associated with selected viewer and the mode retains immersion',()=>{
 const js=read('assets/swapp-tv-broadcast.js'),css=read('assets/swapp-program.css');
 assert.match(js,/https:\/\/www\.twitch\.tv\/embed\//);
 assert.match(js,/parent:location\.hostname/);
 assert.match(js,/let embeddedTwitch='';/);
 assert.match(css,/\.stv \.stv-twitch-chat iframe\{height:100%!important\}/);
 assert.match(css,/\.stv\.tv-immersive \.stv-dock\{display:none!important\}/);
 assert.match(js,/if\(enabled&&dock\.classList\.contains\('is-open'\)\)closeDock\(\)/);
});