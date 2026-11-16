'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('Creator story UI is loaded with real content on the existing channel',()=>{
 const html=read('index.html'),js=read('assets/swapp-creator-stories.js'),css=read('assets/swapp-creator-stories.css');
 assert.match(html,/swapp-creator-stories\.js\?v=20261116-stories-v1/);
 assert.match(html,/swapp-creator-stories\.css\?v=20261116-stories-v1/);
 assert.match(js,/\/api\/creator\/stories\//);
 assert.match(js,/void load\(page,true\)/);
 assert.match(js,/showModal\(\)/);
 assert.match(js,/new MutationObserver/);
 assert.match(css,/aspect-ratio:9\/16/);
 assert.match(css,/swapp-story-photo/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.doesNotMatch(js,/iframe|autoplay|MediaRecorder/);
 assert.match(js,/referrerPolicy='no-referrer'/);
 new Function(js);
});
test('stories support three themes, video artwork, a text editor and 24-hour server expiry',()=>{
 const js=read('assets/swapp-creator-stories.js'),route=read('modules/swapp-creator-story-routes.js');
 const store=read('modules/swapp-creator-story-store.js');
 assert.match(js,/['"]obsidian['"]/);
 assert.match(js,/['"]glacier['"]/);
 assert.match(js,/['"]ember['"]/);
 assert.match(js,/const preview=el\('div','swapp-story-composer-preview'\)/);
 assert.match(js,/const link=el\('input'\)/);
 assert.match(js,/videoLink\(story\)/);
 assert.match(route,/channel_public===false/);
 assert.match(route,/mutationLimiter/);
 assert.match(store,/DATE_ADD\(UTC_TIMESTAMP\(3\),INTERVAL 1 DAY\)/);
});
test('stories and MySQL migration sources enter release parity fingerprint',()=>{
 const r=read('tools/swapp-release.js');
 for(const file of ['swapp-creator-stories.js','swapp-creator-stories.css',
  'lib/swapp-creator-stories.js','modules/swapp-creator-story-routes.js',
  'modules/swapp-creator-story-store.js'])assert.ok(r.includes(file),file);
});
