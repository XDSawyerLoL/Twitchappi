'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {panelImagePayload,panelMediaUrl,DDL,MAX_PANEL_IMAGE_BYTES}=require('../modules/swapp-channel-panel-media');
const {createMysqlAccountsStore}=require('../modules/swapp-oryon-mysql-accounts');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const jpg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,255,217]);
const dataUrl='data:image/jpeg;base64,'+jpg.toString('base64');
test('accepts signature-checked jpeg media and generates stable public image url',()=>{
 const image=panelImagePayload(dataUrl);
 assert.equal(image.mime,'image/jpeg');
 assert.equal(image.bytes.length,jpg.length);
 assert.match(image.hash,/^[a-f0-9]{64}$/);
 assert.equal(panelMediaUrl('vnhz',image.hash),'/api/oryon/panel-image/vnhz/'+image.hash);
});
test('rejects forged file types, SVG, empty and oversized user images',()=>{
 for(const invalid of [
  'data:image/svg+xml;base64,'+jpg.toString('base64'),
  'data:image/png;base64,'+jpg.toString('base64'),
  'data:image/jpeg;base64,',
  'data:text/html;base64,PHNjcmlwdD4=',
  'data:image/jpeg;base64,'+Buffer.alloc(MAX_PANEL_IMAGE_BYTES+1,4).toString('base64')
 ]) assert.throws(()=>panelImagePayload(invalid));
 assert.throws(()=>panelMediaUrl('other/123','a'.repeat(64)));
});
test('media has its own MySQL table instead of occupying account JSON limit',async()=>{
 const calls=[],saved=new Map();
 const pool={
  query:async sql=>{calls.push(sql);return [[],[]]},
  execute:async(sql,args=[])=>{
   calls.push(sql);
   if(sql.startsWith('INSERT IGNORE INTO swapp_channel_panel_images')){
    saved.set(args[0]+':'+args[1],{mime:args[2],bytes:args[3]});
    return [{affectedRows:1},[]];
   }
   if(sql.startsWith('SELECT mime,image_data FROM swapp_channel_panel_images')){
    const found=saved.get(args[0]+':'+args[1]);
    return [found?[{mime:found.mime,image_data:found.bytes}]:[],[]];
   }
   throw Error('Unexpected SQL '+sql);
  }
 };
 const store=createMysqlAccountsStore({pool});
 const a=await store.savePanelImage('a1b2c3',dataUrl);
 assert.match(a.hash,/^[0-9a-f]{64}$/);
 const result=await store.getPanelImage('a1b2c3',a.hash);
 assert.equal(result.mime,'image/jpeg');
 assert.deepEqual(result.bytes,jpg);
 assert.equal(await store.getPanelImage('someoneelse',a.hash),null);
 assert.ok(calls.some(x=>x.includes('CREATE TABLE IF NOT EXISTS swapp_channel_panel_images')));
 assert.match(DDL,/image_data MEDIUMBLOB/);
});
test('public image endpoint never serves unpublished or private channel drafts',()=>{
 const server=source('server.js');
 const from=server.indexOf("app.get('/api/oryon/panel-image/:login/:hash'");
 const end=server.indexOf("app.post('/api/oryon/profile'",from);
 assert.ok(from>0&&end>from);
 const endpoint=server.slice(from,end);
 assert.match(endpoint,/u\.channel_public!==false/);
 assert.match(endpoint,/panels\.some\(p=>p\.image_url===url\)/);
 assert.match(endpoint,/getPanelImage\(user\.id,hash\)/);
 assert.match(endpoint,/X-Content-Type-Options/);
});
test('profile saves convert local data URLs before persisting panel metadata',()=>{
 const server=source('server.js');
 assert.match(server,/savePanelImage\(user\.id,image_url\)/);
 assert.match(server,/image_url=panelMediaUrl\(user\.login,media\.hash\)/);
 assert.match(server,/await writeOryonUsersAndWait\(data\)/);
 assert.match(server,/if\(supplied\('bio'\)\)/);
 assert.match(server,/if\(supplied\('banner_url'\)\)/);
 assert.match(server,/if\(supplied\('peertube_watch_url'\)\)/);
});
test('owner automatically migrates both legacy localStorage backups only after real session validation',()=>{
 const script=source('assets/swapp-channel-mosaic.js');
 for(const str of [
  'oryon_channel_vignettes_250_','oryon_channel_vignettes_',
  "fetch('/api/oryon/session'","credentials:'same-origin'",
  "session.local.login!==login","String(session.local.id)!==String(profile()?.id)",
  "verifiedPublish(panels,login)",'Réessayer la publication',
  "fetch('/api/oryon/profile/'+encodeURIComponent(login)"
 ]) assert.ok(script.includes(str),str);
 assert.match(script,/if\(isOwner&&panels\.length&&/);
});
test('publish confirmation reads public JSON and verifies public binary files',()=>{
 const script=source('assets/swapp-channel-mosaic.js');
 assert.match(script,/publicPanels\.length!==panels\.length/);
 assert.match(script,/credentials:'omit'/);
 assert.match(script,/!check\.ok/);
 assert.match(script,/Une image enregistrée n’est pas accessible publiquement/);
});
test('cache bust and release integrity cover both new panel media features',()=>{
 const html=source('index.html'),release=source('tools/swapp-release.js');
 for(const a of ['swapp-channel-mosaic.js','swapp-channel-mosaic.css'])
  assert.match(html,new RegExp(a.replaceAll('.','\\.')+'\\?v=20261022-public-v2'));
 assert.match(release,/swapp-channel-panel-media\.js/);
 assert.match(release,/swapp-oryon-mysql-accounts\.js/);
});
