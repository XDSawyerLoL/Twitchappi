'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {startTechWatch,INTERVAL_MS}=require('../modules/swapp-tech-watch-scheduler');
test('scheduler is disabled by default when explicitly configured',()=>{
 let calls=0;const watcher=startTechWatch({enabled:false,execute:()=>{calls++;}});
 assert.equal(watcher.enabled,false);watcher.stop();assert.equal(calls,0);
});
test('scheduler interval is six hours',()=>assert.equal(INTERVAL_MS,21600000));
