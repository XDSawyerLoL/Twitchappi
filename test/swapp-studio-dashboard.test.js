'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const html=read('local-agent/studio.html'),css=read('local-agent/studio.css'),js=read('local-agent/studio.js');

test('premium studio layout contains actual source dock, playable canvas, actions and live state',()=>{
 for(const label of ['Écran principal','Écran secondaire','Bureau complet','Jeu plein écran','Contrôle du direct',"Journal d'activité"]){
  assert.ok(html.includes(label),'Missing '+label);
 }
 for(const name of ['primary','secondary','desktop','game','external'])assert.ok(html.includes('data-preset="'+name+'"'));
 for(const id of ['video','emptyPreview','previewExplanation','topLiveState','previewStateLabel','previewButton','liveButton','stopButton','soundToggle','activityList','channelLink','account','connectButton','nativeNotice']){
  assert.ok(html.includes('id="'+id+'"'),'Missing UI control '+id);
 }
 assert.match(html,/href="\/studio\.css"/);
 assert.match(html,/href="#rtmp"/);
 assert.match(html,/src="\/studio\.js"/);
 assert.match(css,/grid-template-columns:262px minmax\(385px,1fr\) 290px/);
 assert.match(css,/@media\(max-width:1070px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
});

test('all javascript DOM selectors resolve and no duplicate IDs exist',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(a=>a[1]);
 assert.equal(new Set(ids).size,ids.length,'Duplicate HTML ID');
 const declared=new Set(ids);
 for(const [,id] of js.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(declared.has(id),'JS references missing HTML id '+id);
 }
 for(const id of ['display','fps','bitrate','audio','mic','encoder','captureMode','obsSource']){
  assert.ok(declared.has(id),'Missing capture setting '+id);
 }
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});

test('studio uses the real local APIs, never invents a chat, fake stream or a scene compositor',()=>{
 const studioRoutes=read('local-agent/swapp-screen-studio.js');
 assert.match(studioRoutes,/app\.get\('\/studio\.css'/);
 assert.match(js,/\/api\/screen\/start/);
 assert.match(js,/\/api\/screen\/status/);
 assert.match(js,/\/api\/account\/status/);
 assert.match(js,/\/api\/go-live/);
 assert.match(js,/\/api\/screen\/stop/);
 assert.match(js,/\/api\/tunnel\/stop/);
 assert.match(js,/\/api\/account\/disconnect/);
 assert.match(js,/\/api\/setup\/check/);
 assert.match(js,/\/api\/tunnel\/repair/);
 assert.match(js,/\/api\/status\?key=/);
 assert.match(html,/id="streamKey"/);
 assert.match(html,/id="rtmpServer"/);
 assert.match(html,/id="disconnectButton"/);
 assert.match(html,/id="copyKey"/);
 assert.match(html,/id="copyRtmp"/);
 assert.match(js,/feed\.prepend\(entry\)/);
 assert.match(js,/localStorage\.setItem\(storageKey/);
 assert.match(js,/video\.addEventListener\('loadeddata'/);
 assert.match(html,/Le chat SWAPP s’ouvre dans ton navigateur/);
 assert.match(html,/Nécessite le moteur libobs/);
 assert.match(html,/Paramètre, pas une mesure/);
});

test('desktop UI release has incremented, workspace has adequate width',()=>{
 const pkg=JSON.parse(read('local-agent/package.json'));
 const electron=read('local-agent/main.js');
 assert.equal(pkg.version,'1.2.1');
 assert.match(electron,/width:1510,height:920/);
 assert.match(read('local-agent/BUILD-WINDOWS.bat'),/SWAPP-Live-Setup-1\.2\.1-x64\.exe/);
});
