'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const legacy=read('assets/swapp-home-news.js');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');

test('canonical SWAPP home has one article shelf, no second newsroom script',()=>{
 const served=renderIntoSpa(read('index.html'));
 assert.equal((served.match(/id="scl-articles"/g)||[]).length,1);
 assert.equal((served.match(/id="swapp-catalogue-lab"/g)||[]).length,1);
 assert.doesNotMatch(served,/<script[^>]*src="\/assets\/swapp-home-news\.js/);
 assert.match(served,/<script[^>]*src="\/assets\/swapp-catalogue-lab\.js/);
 for(const id of ['scl-live','scl-games','scl-small','scl-favorites'])assert.ok(served.includes('id="'+id+'"'));
});

test('cached legacy renderer is inert on catalogue and cleans any stale second shelf',()=>{
 let removed=0,lookups=0,queries=0;
 const old=[{remove(){removed++}},{remove(){removed++}}];
 const home={
  querySelector(s){queries++;return s==='#swapp-catalogue-lab'?{id:'swapp-catalogue-lab'}:null},
  querySelectorAll(s){assert.equal(s,'[data-swapp-home-editorial]');return old}
 };
 const document={getElementById(id){lookups++;return id==='home'?home:null}};
 const context={document,window:{}};
 vm.runInNewContext(legacy,context,{timeout:2000});
 assert.equal(removed,2);assert.equal(lookups,1);assert.equal(queries,1);
 assert.equal(context.window.SwappHomeEditorial,undefined);
});

test('obsolete content is removed at source; production smoke prevents its return',()=>{
 assert.match(legacy,/function mount\(\)/);
 assert.match(legacy,/spaHome\?\.querySelector\('#swapp-catalogue-lab'\)/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/Duplicate legacy Dernières actualités/);
 assert.match(smoke,/!home\.body\.includes\('src="\/assets\/swapp-home-news\.js'\)/);
});
