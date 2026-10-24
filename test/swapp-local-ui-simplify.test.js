'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const server=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
const tick=String.fromCharCode(96);
const start=server.indexOf('return String.raw'+tick+'<!doctype html>');
const end=server.indexOf('</script></body></html>'+tick+';',start);
assert.ok(start>=0&&end>start,'SWAPP Local interface must exist');
const html=server.slice(start,end+'</script></body></html>'.length);
const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));

test('SWAPP Local no longer shows redundant fixed site URL or three explanatory cards',()=>{
 assert.ok(!html.includes('id="oryonSite"'));
 assert.ok(!html.includes('Adresse du site Swapp'));
 assert.ok(!html.includes('Aperçu local. Le public'));
 assert.ok(!html.includes('class="steps"'));
 assert.ok(!html.includes('1. Connecte'));
 assert.ok(!html.includes('2. Lance OBS'));
 assert.ok(!html.includes('3. Démarre'));
 assert.match(script,/const site='\$\{DEFAULT_SWAPP_SITE_URL\}'/,'account login always targets SWAPP');
 assert.ok(!script.includes("document.getElementById('oryonSite')"));
});
test('SWAPP Local shows only the applicable account button and keeps its functional actions',()=>{
 assert.match(html,/id="connectBtn" class="btn\$\{login\?' hidden':''\}"/);
 assert.match(html,/id="disconnectBtn" class="btn secondary\$\{login\?'':' hidden'\}"/);
 for(const handler of ['connectWithBrowser','disconnectAccount','goLive','repairTunnel','stopTunnel'])assert.ok(script.includes('function '+handler+'('));
 assert.match(script,/setConnectedUi\(!!d.connected,d.user\?\.login\)/);
 assert.match(script,/\/api\/account\/disconnect/);
});
test('public live status is visible in the OBS section while diagnostics are collapsed',()=>{
 const statusPos=html.indexOf('id="publicUrl"');
 const detailPos=html.indexOf('<details');
 assert.ok(statusPos>0&&detailPos>0&&statusPos<detailPos);
 assert.ok(!html.includes('<details class="card technicalPanel" open'));
 assert.match(html,/id="simpleStatus"/);
 assert.match(html,/title="Aperçu vidéo OBS"/);
 assert.match(script,/● En direct sur SWAPP/);
 assert.match(script,/window\.__liveResultDisplayed/);
 assert.ok(!html.includes('Réparer le tunnel'));
 assert.match(html,/Vérifier la diffusion/);
 assert.match(html,/Arrêter le direct/);
 assert.ok(html.indexOf('id="frame"')<html.indexOf('Diagnostic technique'));
});
test('embedded interface JavaScript compiles and is no longer dependent on user supplied host',()=>{
 assert.doesNotThrow(()=>new vm.Script(script,{filename:'swapp-local-ui-inline.js'}));
 assert.ok(!script.includes('site_url:document.getElementById'));
 assert.match(script,/JSON\.stringify\(\{key:currentKey\(\)\}\)/);
 assert.match(server,/version:'1\.1\.1'/);
});
