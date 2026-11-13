'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('missing optional catalogue module cannot interrupt the SWAPP server startup',()=>{
 const source=read('server.js');
 const i=source.indexOf("require('./modules/swapp-catalogue-lab').register(app);");
 assert.ok(i>0);
 const nearby=source.slice(i-30,i+390);
 assert.match(nearby,/try\{[\s\S]*require\('\.\/modules\/swapp-catalogue-lab'\)\.register\(app\);[\s\S]*catch\(error\)\{/);
 assert.match(nearby,/Page expérimentale indisponible/);
 const catchAll=source.indexOf("app.get(/^\\/([a-zA-Z0-9_]");
 assert.ok(catchAll>i,'optional lab remains before creator routes');
});
test('Hostinger ZIP packaging refuses partial archive missing the catalogue HTML, JS or CSS',()=>{
 const source=read('tools/swapp-hostinger-package.js');
 const start=source.indexOf('const mandatory='),end=source.indexOf('];',start);
 assert.ok(start>=0&&end>start);
 const mandatory=new Function(source.slice(start,end+2)+';return mandatory;')();
 for(const file of ['modules/swapp-catalogue-lab.js','assets/swapp-catalogue-lab.js','assets/swapp-catalogue-lab.css'])
  assert.ok(mandatory.includes(file),file);
 const {getTracked}=require('../tools/swapp-hostinger-package');
 const withoutJs=mandatory.filter(file=>file!=='assets/swapp-catalogue-lab.js');
 assert.throws(()=>getTracked(()=>withoutJs.join('\n')),/assets\/swapp-catalogue-lab\.js/);
 assert.deepEqual(getTracked(()=>mandatory.join('\n')),mandatory);
});
