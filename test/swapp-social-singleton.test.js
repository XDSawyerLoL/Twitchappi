'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../assets/swapp-social-native');
test('every SOCIAL ES module imports exactly one core state singleton',()=>{
 const modules=['app.js','views.js','session.js','render.js'];
 const ids=[];
 for(const name of modules){
  const content=fs.readFileSync(path.join(base,name),'utf8');
  const imports=[...content.matchAll(/from\s+['"]([^'"]*\/core\.js[^'"]*)['"]/g)].map(x=>x[1]);
  assert.equal(imports.length,1,name+' imports exactly one core');
  const resolved=new URL(imports[0],new URL('https://swapp.tv/assets/swapp-social-native/'+name));
  ids.push(resolved.href);
  assert.equal(resolved.search,'',name+' must not import a versioned core duplicate');
 }
 assert.equal(new Set(ids).size,1,'every feature must share the same session and view state');
});
test('a single session module powers both the app and views',()=>{
 const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
 const views=fs.readFileSync(path.join(base,'views.js'),'utf8');
 const read=x=>[...x.matchAll(/from\s+['"]([^'"]*\/session\.js[^'"]*)['"]/g)].map(z=>z[1]);
 assert.deepEqual(read(app),['./session.js']);
 assert.deepEqual(read(views),['./session.js']);
});
