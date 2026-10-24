'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=()=>fs.readFileSync(path.join(__dirname,'..','assets/swapp-actus-app.css'),'utf8');
const page=()=>fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('ACTUS article covers use a genuine 16:9 size-constrained viewport',()=>{
 const text=css();
 const selector='#actus .swapp-actus-card .swapp-actus-cover{';
 const rule=text.slice(text.lastIndexOf(selector),text.indexOf('}',text.lastIndexOf(selector))+1);
 assert.match(rule,/position:relative/);
 assert.match(rule,/display:block/);
 assert.match(rule,/aspect-ratio:16\/9/);
 assert.match(rule,/overflow:hidden/);
 assert.match(rule,/min-height:0/);
 assert.match(rule,/flex:0 0 auto/);
});
test('image cannot extend its parent grid track; embedded top and bottom letterbox are center-cropped',()=>{
 const text=css();
 const selector='#actus .swapp-actus-card .swapp-actus-cover:not(.swapp-actus-cover-fallback)>img{';
 const start=text.lastIndexOf(selector);
 assert.ok(start>=0);
 const rule=text.slice(start,text.indexOf('}',start)+1);
 for(const value of [/position:absolute/,/inset:0/,/width:100%/,/height:100%/,/object-fit:cover/,/object-position:center/]){
  assert.match(rule,value);
 }
 // YouTube hqdefault is 480×360; 16:9 card is 480×270.
 // A centered cover crop therefore removes 45 pixels per side.
 assert.equal((360-(480*9/16))/2,45);
});
test('CSS preserves fallback when no valid image is available',()=>{
 const text=css();
 const start=text.lastIndexOf('#actus .swapp-actus-card .swapp-actus-cover.swapp-actus-cover-fallback{');
 assert.ok(start>=0);
 const rule=text.slice(start,text.indexOf('}',start)+1);
 assert.match(rule,/display:grid/);
 assert.match(rule,/place-items:center/);
});
test('latest ACTUS correction is cache-busted and scoped to article cards',()=>{
 assert.match(page(),/swapp-actus-app\.css\?v=20261024-letterbox-cover-v1/);
 assert.doesNotMatch(css().slice(css().lastIndexOf('Editorial 16:9 artwork')),/#home|#social|\.swapp-channel-mosaic/);
});
