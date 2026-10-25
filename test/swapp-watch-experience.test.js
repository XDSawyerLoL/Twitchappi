'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('live immersion and chat controls keep the existing HLS and chat transports',()=>{
 const js=read('assets/swapp-watch-experience.js');
 new Function(js);
 assert.match(js,/data-channel-live="true"/);
 assert.match(js,/swapp-watch-immersion-btn/);
 assert.match(js,/swapp-watch-chat-btn/);
 assert.match(js,/aria-expanded/);
 assert.doesNotMatch(js,/sessionStorage/,'a previous hidden chat preference must not survive a fresh watch session');
 assert.match(js,/const mode=\{immersion:'off',chat:'shown'\}/);
 assert.doesNotMatch(js,/new Hls\(|MediaSource|WebSocket|socket\.emit|innerHTML\s*=\s*.*iframe/);
});
test('live style puts video first and immersion dims outside without touching chat messages',()=>{
 const css=read('assets/swapp-watch-experience.css');
 assert.match(css,/\.channelLiveLayout/);
 assert.match(css,/swapp-immersion-dimmer/);
 assert.match(css,/data-watch-chat="hidden"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/\.chatLog\s*\{display:none/);
});
test('creator route boot fallback checks active HLS before offering player',()=>{
 const js=read('assets/swapp-watch-experience.js');
 assert.match(js,/setTimeout\(async\(\)=>/);
 assert.match(js,/data\.active===true&&data\.segment_count>0/);
 assert.match(js,/\/api\/oryon\/local-relay\//);
 assert.match(js,/boot\.isConnected/);
 assert.match(js,/document\.getElementById\('channel'\)\?\.querySelector\('\.creatorRefine'\)/);
 assert.match(js,/Réessayer/);
});
test('channel loads watch refinements after original player and Pulse enhancements',()=>{
 const html=read('index.html');
 assert.match(html,/swapp-watch-experience\.css\?v=/);
 assert.match(html,/swapp-watch-experience\.js\?v=/);
 assert.ok(html.indexOf('/index_script.js')<html.indexOf('swapp-watch-experience.js'));
 assert.ok(html.indexOf('swapp-live-hearts.js')<html.indexOf('swapp-watch-experience.js'));
});

test('main creator viewer is the only active player on its own channel',()=>{
 const script=read('index_script.js');
 assert.match(script,/if\(state\.view==='channel'\)\{host\?\.remove\(\);return\}/,
  'mini player must be removed rather than covering the active channel');
 assert.match(script,/player\.style\.setProperty\('aspect-ratio','16\/9','important'\)/);
 assert.doesNotMatch(script,/const h = clamp\(420, Math\.min\(natural, available\), 760\)/,
  'remove forced height which distorts the player');
});
test('one stable grid and unhidden chat are the default on a live channel',()=>{
 const css=read('assets/swapp-watch-experience.css');
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(286px,336px\)/);
 assert.match(css,/#oryonMiniPlayer\{display:none!important\}/);
 assert.match(css,/aspect-ratio:16\/9!important/);
 const js=read('assets/swapp-watch-experience.js');
 assert.match(js,/chat:'shown'/);
 assert.doesNotMatch(js,/sessionStorage/);
});

test('public channel has early recovery independent from the large application script',()=>{
 const html=read('index.html');
 const early=read('assets/swapp-watch-early-recovery.js');
 new Function(early);
 assert.ok(html.indexOf('/assets/swapp-watch-early-recovery.js')>0);
 assert.ok(html.indexOf('/assets/swapp-watch-early-recovery.js')<html.indexOf('/index_script.js'));
 assert.match(early,/segment_count/);
 assert.match(early,/boot\.replaceChildren\(outer\)/);
 assert.match(early,/controller\.abort\(\)/);
 assert.match(early,/Ouvrir le direct/);
});

test('chat shares the player top edge and uses its actual measured height',()=>{
 const js=read('assets/swapp-watch-experience.js');
 const css=read('assets/swapp-watch-experience.css');
 const index=read('index_script.js');
 assert.match(js,/function syncChat\(page\)/);
 assert.match(js,/const videoRect=video\.getBoundingClientRect\(\)/);
 assert.match(js,/const h=Math\.round\(videoRect\.height\)/);
 assert.match(js,/new ResizeObserver/);
 assert.match(js,/watcher\.observe\(video\)/);
 assert.match(css,/column-gap:4px!important/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto auto auto auto/);
 assert.match(css,/swapp-chat-player-height/);
 assert.match(index,/const playerHeight=Math\.round\(rect\.height \|\| rect\.width\*9\/16\)/);
 assert.doesNotMatch(index,/Math\.round\(window\.innerHeight\*\.44\)/,
   'chat size must not be estimated from the viewport');
});

test('immersion keeps the entire media and chat bright and its scrim cannot block any controls',()=>{
 const js=read('assets/swapp-watch-experience.js');
 const css=read('assets/swapp-watch-experience.css');
 assert.match(js,/Mode Immersion/);
 assert.match(js,/Quitter Immersion/);
 assert.match(js,/swapp-immersion-dimmer/);
 assert.match(js,/const focus=page\.querySelector\('\.channelLiveLayout'\)/);
 assert.match(js,/document\.body\.appendChild\(wrapper\)/);
 assert.match(js,/disableImmersion\(\)/);
 assert.match(js,/event\.key==='Escape'/);
 assert.match(css,/\.swapp-immersion-dimmer>div/);
 assert.match(css,/pointer-events:none!important/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(js,/watchTheatre|Mode cinéma/);
});

test('direct chat has no legacy sticky offset and follows the video top at desktop resolutions',()=>{
 const css=read('assets/swapp-watch-experience.css');
 const js=read('assets/swapp-watch-experience.js');
 assert.match(css,/LIVE ALIGNMENT FIX/);
 assert.match(css,/\.channelLiveSidebar > \.chatPanel\s*\{\s*position:relative!important/);
 assert.match(css,/top:0!important/);
 assert.match(css,/inset-block-start:0!important/);
 assert.match(js,/const baselineTop=chatRect\.top-previousShift/);
 assert.match(js,/videoRect\.top-baselineTop/);
 assert.match(js,/const besideVideo=!mobile/);
 assert.match(js,/chat\.style\.setProperty\('translate'/);
 // This must not re-parent the chat or alter the iframe transport.
 assert.doesNotMatch(js,/appendChild\(chat\)|replaceChildren\(chat\)|new Hls\(/);
});
test('chat vertical correction remains stable across retries, and clears on mobile',()=>{
 const script=read('assets/swapp-watch-experience.js');
 const a=script.indexOf(' function syncChat(page){');
 const b=script.indexOf('\n function install(page){',a);
 assert.ok(a>=0&&b>a);
 const win={matchMedia:()=>({matches:false})};
 const sync=new Function('window',script.slice(a,b)+'\nreturn syncChat;')(win);
 const video={getBoundingClientRect:()=>({top:430,left:200,right:1190,width:990,height:557})};
 const values={};const style={setProperty(k,v){values[k]=v}};
 const chat={dataset:{},style,
  getBoundingClientRect(){const shift=Number(this.dataset.swappAlignShift||0);
   return {top:540+shift,left:1194,width:290,height:557}}
 };
 const page={isConnected:true,dataset:{watchChat:'shown'},
  querySelector(selector){return selector.includes('.channelMainPlayer >')?video:
   selector.includes('.channelLiveSidebar .chatPanel')?chat:null}
 };
 sync(page);
 assert.equal(values.translate,'0 -110px');
 assert.equal(values.height,'557px');
 sync(page);
 assert.equal(values.translate,'0 -110px','rechecks must not oscillate');
 win.matchMedia=()=>({matches:true});
 sync(page);
 assert.equal(values.translate,'0 0px','mobile uses stacked positioning');
});


test('offline creator chat is the same grid row as the player, without sticky 122px',()=>{
 const css=read('assets/swapp-watch-experience.css');
 const js=read('assets/swapp-watch-experience.js');
 const index=read('index.html');
 assert.match(css,/OFFLINE ROW ALIGNMENT/);
 assert.match(css,/data-channel-live="false"\] \.channelMainPlayer\s*\{\s*grid-column:1!important;\s*grid-row:1!important/);
 assert.match(css,/data-channel-live="false"\] \.channelLiveSidebar\s*\{\s*grid-column:2!important;\s*grid-row:1!important/);
 assert.match(css,/data-channel-live="false"\] \.channelLiveSidebar > \.chatPanel\s*\{[\s\S]*?position:relative!important;[\s\S]*?top:0!important;/);
 assert.match(css,/height:var\(--swapp-chat-player-height,100%\)!important/);
 assert.match(css,/@media\(max-width:1080px\)/);
 assert.match(js,/forEach\(installOfflineAlignment\)/);
 assert.match(js,/function installOfflineAlignment\(page\)/);
 assert.match(js,/ro\.observe\(player\)/);
 assert.equal((index.match(/20261025-offline-row-v2/g)||[]).length,2);
});
test('offline sync measures player but NEVER adds a translation to the chat',()=>{
 const script=read('assets/swapp-watch-experience.js');
 const a=script.indexOf(' function syncChat(page){');
 const b=script.indexOf('\n function installOfflineAlignment(page){',a);
 assert.ok(a>=0&&b>a,'offline sync boundaries found');
 const win={matchMedia:()=>({matches:false})};
 const sync=new Function('window',script.slice(a,b)+'return syncChat')(win);
 const values={},removed=[];
 const video={getBoundingClientRect:()=>({top:170,left:0,right:1240,width:1240,height:696})};
 const chat={dataset:{swappAlignShift:'-160'},style:{
  setProperty(key,value){values[key]=value},
  removeProperty(key){removed.push(key);delete values[key]}
 },getBoundingClientRect:()=>({top:330,left:1252,width:384,height:696})};
 const page={isConnected:true,dataset:{channelLive:'false',watchChat:'shown'},
  querySelector(q){return q.includes('.channelMainPlayer >')?video:
   q.includes('.channelLiveSidebar .chatPanel')?chat:null}};
 sync(page);
 assert.equal(values.height,'696px');
 assert.deepEqual(removed,['translate']);
 assert.equal(chat.dataset.swappAlignShift,'0');
 assert.equal(values.translate,undefined);
});
