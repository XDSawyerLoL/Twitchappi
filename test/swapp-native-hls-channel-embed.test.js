'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index_script.js'),'utf8');
function extract(begin,end){
 const start=source.indexOf(begin),stop=source.indexOf(end,start+begin.length);
 assert.ok(start>=0&&stop>start,'source function not found: '+begin);
 return source.slice(start,stop);
}
const funcs=extract('function swappIsBlockedTunnelUrl(', 'function swappChannelPath(');
const render=extract('function fwLiveMediaHtml(', '\nasync function renderChannel()');
const context={URL,esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'),
 normalizePeerTubeEmbed:()=>'',state:{stream:null}};
vm.createContext(context);
vm.runInContext(funcs+'\n'+render,context);

test('internal same-origin OBS HLS player is allowed on /vnhz',()=>{
 const url='/api/oryon/local-relay/vnhz/player';
 assert.equal(context.swappSafeLocalPlayerUrl(url),url);
 const html=context.fwLiveMediaHtml({oryon_local_player_url:url},false,true,'','local-agent');
 assert.match(html,/<iframe /);
 assert.match(html,/src="\/api\/oryon\/local-relay\/vnhz\/player"/);
 assert.match(html,/allow="autoplay; fullscreen; picture-in-picture"/);
 assert.doesNotMatch(html,/id="remoteVideo"|offlinePanel/);
});
test('only strictly scoped relative player URLs are allowed',()=>{
 for(const raw of [
  '//attacker.invalid/api/oryon/local-relay/vnhz/player',
  '/api/oryon/local-relay/vnhz/player?next=https://evil.test',
  '/api/oryon/local-relay/../admin/player',
  '/api/oryon/local-relay/vnhz/player/../../admin',
  'http://localhost:3000/api/oryon/local-relay/vnhz/player',
  'javascript:alert(1)',
  ''
 ])assert.equal(context.swappSafeLocalPlayerUrl(raw),'',raw);
});
test('legacy absolute HTTPS player URLs still follow existing protection',()=>{
 assert.equal(context.swappSafeLocalPlayerUrl('https://video.example.net/player'),
  'https://video.example.net/player');
 assert.equal(context.swappSafeLocalPlayerUrl('https://foo.loca.lt/player'),'');
});
test('browser live still uses WebRTC, never the OBS iframe',()=>{
 const html=context.fwLiveMediaHtml({oryon_local_player_url:'/api/oryon/local-relay/vnhz/player'},
  false,true,'','browser-webrtc');
 assert.match(html,/id="remoteVideo"/);
 assert.doesNotMatch(html,/<iframe/);
});
