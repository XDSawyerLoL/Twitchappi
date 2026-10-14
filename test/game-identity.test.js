'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {equivalent,searchNames}=require('../modules/swapp-news/game-identity');
test('matches known aliases, spelling and accents',()=>{
 assert.equal(equivalent('GTA 6','Grand Theft Auto VI'),true);
 assert.equal(equivalent('Final Fantasy 7','Final Fantasy VII'),true);
 assert.equal(equivalent('MARVEL Tokon Fighting Souls','MARVEL Tōkon: Fighting Souls'),true);
 assert.ok(searchNames('GTA 6').includes('Grand Theft Auto VI'));
});
test('rejects unrelated games rather than matching partial words',()=>{
 assert.equal(equivalent('Planet Zoo','Planet Zoo 2'),false);
 assert.equal(equivalent('Road 96','Road 96: Mile 0'),false);
 assert.equal(equivalent('GTA 5','GTA 6'),false);
});
