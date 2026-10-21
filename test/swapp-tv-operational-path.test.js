'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('TV queue login remains valid without Spotlight feature activation',()=>{
 const server=read('server.js');
 assert.match(server,/async function spotlightAuthorized\(req,res,\{tv=false\}=\{\}\)/);
 assert.match(server,/tv\?SWAPP_TV_QUEUE_ENABLED:SWAPP_SPOTLIGHT_ENABLED/);
 const queue=server.slice(server.indexOf("app.post('/api/swapp-tv/queue'"),server.indexOf("app.get('/agenda'"));
 assert.match(queue,/spotlightAuthorized\(req,res,\{tv:true\}\)/);
 assert.match(queue,/spotlightPublishedGame\(game\)/);
 assert.match(queue,/twitchCategoryIdByName\(game\)/);
});
test('TV queue and director status are reported truthfully',()=>{
 const server=read('server.js'),ui=read('assets/swapp-program.js');
 assert.match(server,/director_enabled:SWAPP_TV_DIRECTOR_ENABLED/);
 assert.match(ui,/queue\.director_enabled/);
 assert.match(ui,/data\.director_enabled/);
});
