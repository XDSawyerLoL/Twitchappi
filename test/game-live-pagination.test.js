'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
test('dedicated game discovery paginates Twitch streams independently from homepage cap',()=>{
 const begin=server.indexOf("app.get('/api/discovery/game-lives'");
 const end=server.indexOf("// Public Swapp channel directory:",begin);
 assert.ok(begin>=0&&end>begin);
 const route=server.slice(begin,end);
 assert.match(route,/games\?name=/);
 assert.match(route,/streams\?first=100&game_id=/);
 assert.match(route,/streams\.pagination\?\.cursor/);
 assert.match(route,/pages<5/);
 assert.match(route,/items\.length<Math\.max\(limit\*4,80\)/);
 assert.match(route,/encodeURIComponent\(cursor\)/);
 assert.doesNotMatch(route,/out\.slice\(0,limit\)/);
 assert.match(route,/swappAddLiveAvatars\(visible\)/);
 assert.match(server,/profile_image_url=url/);
 assert.match(server,/users\?'/);
});

test('followed streams restore and refresh a linked SWAPP Twitch session after F5',()=>{
 const start=server.indexOf("app.get('/api/twitch/followed/live'");
 const end=server.indexOf('// ORYON UX PREMIUM ROUTES',start);
 assert.ok(start>0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/restoreOryonSessionFromRememberCookie\(req,res,\{allowUserRecovery:false\}\)/);
 assert.match(route,/owner\?\.twitch_link/);
 assert.match(route,/refreshTwitchUserSession\(req\)/);
 assert.match(route,/if\(!tu\) return res\.status\(401\)/);
});
