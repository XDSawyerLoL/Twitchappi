'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const spa=fs.readFileSync(path.join(root,'index_script.js'),'utf8');
const news=fs.readFileSync(path.join(root,'modules/swapp-news/router.js'),'utf8');

test('ACTUS is reserved from channel matching even without an editorial backend',()=>{
 const clean=server.match(/const SWAPP_CLEAN_VIEW_PATHS = new Set\((\[[^;]+\])\);/);
 const reserved=server.match(/const SWAPP_RESERVED_ROOT_PATHS = new Set\((\[[^;]+\])\);/);
 assert.ok(clean&&reserved,'clean view and reserved slug declarations must exist');
 assert.ok(JSON.parse(clean[1].replace(/'/g,'"')).includes('/actus'));
 assert.ok(JSON.parse(reserved[1].replace(/'/g,'"')).includes('actus'));
 assert.match(server,/app\.get\(Array\.from\(SWAPP_CLEAN_VIEW_PATHS\),/);
 assert.match(server,/if\(!isSwappCleanChannelSlug\(slug\)\) return next\(\)/);
 assert.doesNotMatch(server,/app\.get\('\/actus',\s*\(_req,res\) => res\.status\(503\)/);
 assert.match(server,/app\.get\('\/actus',\s*\(_req,res\) => \{ res\.set\('Cache-Control','no-store'\); return sendSwappUi\(res\)/);
 assert.match(news,/return sendApp\(res\)/);
});

test('all client-side public channel guards exclude actus',()=>{
 const guards=[...spa.matchAll(/(?:SWAPP_RESERVED_SLUGS|RESERVED)\s*=\s*new Set\(\[([^\]]+)\]\)/g)];
 assert.ok(guards.length>=4);
 for(const guard of guards)assert.match(guard[1],/'actus'/);
});

test('fresh ACTUS routes never display streamer channels, even with a stale channel hash',()=>{
 const beginning=spa.indexOf('const SWAPP_VIEW_PATHS=');
 const after=spa.indexOf('function swappIsBlockedTunnelUrl',beginning);
 const routeStart=spa.indexOf('function swappRouteFromLocation()');
 const routeEnd=spa.indexOf('async function swappOpenRoute(',routeStart);
 assert.ok(beginning>=0&&after>beginning&&routeStart>=0&&routeEnd>routeStart);
 const run=new Function('location','swappHasPasswordResetToken',
   spa.slice(beginning,after)+spa.slice(routeStart,routeEnd)+'\nreturn swappRouteFromLocation();');
 const location=pathname=>({pathname,search:'',hash:''});
 assert.equal(run(location('/actus'),()=>false).view,'actus');
 assert.equal(run(location('/actus/planet-zoo-2'),()=>false).view,'actus');
 assert.equal(run({...location('/actus'),hash:'#channel/actus'},()=>false).view,'actus');
 assert.equal(run(location('/decouvrir'),()=>false).view,'discover');
 assert.deepEqual(run(location('/legitstreamer'),()=>false),{view:'channel',watchRoom:'legitstreamer'});
});
