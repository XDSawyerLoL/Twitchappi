'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildArchive,safeUrl,page}=require('../modules/swapp-independence');
test('independence archive exports only the owner profile and own following list',()=>{
 const user={login:'creator_one',email:'creator@example.test',display_name:'Creator',bio:'Test',
  following:['alpha','beta','alpha'],followers_count:42,tags:['fps'],
  password_hash:'private',remember_token_hash:'private',stream_key:'secret',twitch_link:{access_token:'secret'},
  channel_links:[{title:'Site',url:'https://example.org'}],
  channel_panels:[{title:'About',text:'Hi',image_url:'/panel.png'}]};
 const archive=buildArchive(user,{now:new Date('2026-10-25T18:00:00Z')});
 assert.equal(archive.version,1);assert.deepEqual(archive.community.following,['alpha','beta']);
 assert.equal(archive.community.followers_count,42);assert.equal(archive.community.followers_exported,false);
 assert.equal(archive.channel.panels[0].title,'About');
 assert.equal(archive.exported_at,'2026-10-25T18:00:00.000Z');
 const serialized=JSON.stringify(archive);
 for(const secret of ['password_hash','remember_token_hash','stream_key','access_token','secret'])
  assert.ok(!serialized.includes(secret),secret);
});
test('independence archive rejects unsafe links and invalid identities',()=>{
 assert.equal(safeUrl('javascript:alert(1)'),'');
 assert.equal(safeUrl('data:text/html,attack'),'');
 assert.equal(safeUrl('//evil.test'),'');
 assert.equal(safeUrl('/images/creator.png'),'/images/creator.png');
 assert.equal(safeUrl('https://domain.test/page'),'https://domain.test/page');
 assert.throws(()=>buildArchive({login:'<script>'}),/invalid_owner/);
});
test('independence landing explains privacy and requests auth by download',()=>{
 const html=page();
 assert.match(html,/Télécharger mes données/);
 assert.match(html,/api\/oryon\/independence\/export/);
 assert.match(html,/donnée privée de tes abonnés/);
});
test('independence endpoint never exports data about arbitrary users',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const start=server.indexOf("app.get('/api/oryon/independence/export'");
 const end=server.indexOf("app.get('/tv'",start);
 assert.ok(start>=0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/req\.session\?\.oryonUser\?\.id/);
 assert.match(route,/\.find\(u=>u\.id===ownerId\)/);
 assert.doesNotMatch(route,/req\.query\.(?:login|user|id)/);
 assert.match(route,/Content-Disposition/);
 assert.match(route,/no-store/);
});
