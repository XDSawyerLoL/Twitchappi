'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {candidate,candidates,rank,gameOptions}=require('../assets/swapp-portail.js');
const {page}=require('../modules/swapp-portail');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const valid=(login,game='Aion 2')=>({
 platform:'swapp',media:'hls',media_verified:true,
 login,game,title:'Un vrai direct',display_name:login,
 player_url:'/api/oryon/local-relay/'+login+'/player',
 broadcast_id:'broadcast-test'
});
const data=items=>({success:true,verified:true,source:'swapp-direct-hls',items});

test('PORTAIL shows only verified first-party HLS streams',()=>{
 assert.equal(candidate(valid('vnhz')).login,'vnhz');
 for(const bad of [
  {...valid('vnhz'),media_verified:false},
  {...valid('vnhz'),media:'webrtc'},
  {...valid('vnhz'),platform:'twitch'},
  {...valid('vnhz'),player_url:'https://twitch.tv/vnhz'},
  {...valid('vnhz'),login:'../../malicious'},
  {...valid('vnhz'),player_url:'/api/oryon/local-relay/other/player'}
 ])assert.equal(candidate(bad),null);
 assert.deepEqual(candidates(data([valid('vnhz'),valid('vnhz'),valid('creator02')] ))
  .map(x=>x.login),['vnhz','creator02']);
 assert.deepEqual(candidates({...data([valid('vnhz')]),verified:false}),[]);
 assert.deepEqual(candidates({...data([valid('vnhz')]),source:'unknown'}),[]);
});

test('rotation does not use viewer identifiers or popularity and is order independent',()=>{
 const items=candidates(data([valid('creator02'),valid('vnhz'),valid('creator03')]));
 const expected=rank(items,1234).map(x=>x.login);
 assert.deepEqual(rank([...items].reverse(),1234).map(x=>x.login),expected);
 assert.equal(new Set(expected).size,3);
 assert.equal(gameOptions(items).length,1);
 const script=read('assets/swapp-portail.js');
 assert.match(script,/Math\.floor\(Date\.now\(\)\/900000\)/);
 assert.doesNotMatch(script,/viewer_count|viewers|localStorage|sessionStorage|document\.cookie|navigator\.geolocation|Math\.random/);
 assert.match(script,/credentials:'omit'/);
});

test('public page renders a useful offline state and never auto-starts an iframe',()=>{
 const html=page();
 for(const marker of ['id="swapp-portail"','id="sp-next"','id="sp-watch"',
   'id="sp-game"','id="sp-status"','id="sp-refresh"',
   '/assets/swapp-portail.js','/assets/swapp-portail.css','https://swapp.tv/portail'])
  assert.ok(html.includes(marker),marker);
 assert.match(html,/Pas de course aux spectateurs/);
 assert.doesNotMatch(html,/<iframe[^>]+src="\/api\/oryon\/local-relay/);
 const script=read('assets/swapp-portail.js');
 assert.match(script,/if\(!pool\.length\)/);
 assert.match(script,/watch\.href=next\.href;watch\.hidden=false/);
 assert.doesNotMatch(script,/video\.play\(|new Hls\(/);
});

test('PORTAIL links from SWAPP TV but does not alter the TV broadcast engine',()=>{
 const tv=read('modules/swapp-program.js'),css=read('assets/swapp-program.css');
 const server=read('server.js'),fingerprint=read('tools/swapp-release.js');
 assert.equal((tv.match(/href="\/portail"/g)||[]).length,1);
 assert.match(css,/stv-portail-entry/);
 assert.match(server,/app\.get\('\/portail'/);
 assert.match(server,/require\('\.\/modules\/swapp-portail'\)\.page\(\)/);
 for(const file of ['modules/swapp-portail.js','assets/swapp-portail.js','assets/swapp-portail.css'])
  assert.ok(fingerprint.includes("'"+file+"'"),file+' must be fingerprinted');
});
