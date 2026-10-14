'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
test('ACTUS est une vue SWAPP native, pas un nouveau menu ni un nouvel onglet',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const spa=fs.readFileSync(path.join(root,'index_script.js'),'utf8');
 assert.match(html,/<section id="actus" class="view"/);
 assert.match(html,/assets\/swapp-actus-app\.js/);
 assert.ok(html.indexOf('src="/assets/swapp-actus-app.js"')<html.indexOf('src="/index_script.js'));
 assert.match(spa,/actus:'\/actus'/);
 assert.match(spa,/\/actus':'actus'/);
 assert.match(spa,/window\.SwappActus\?\.render\(\$\('#actus'\)\)/);
 assert.match(spa,/b\.onclick=\(\)=>setView\(item\.id\)/);
 assert.doesNotMatch(spa,/a\.href='\/actus'; a\.textContent='ACTUS'/);
});
test('la vue lit l’API de vrais articles et ne crée pas un faux site',()=>{
 const content=fs.readFileSync(path.join(root,'assets/swapp-actus-app.js'),'utf8');
 assert.match(content,/\/api\/actus/);
 assert.match(content,/\/api\/actus\//);
 assert.match(content,/window\.SwappActus/);
 assert.match(content,/history\.pushState/);
 assert.doesNotMatch(content,/<header class="site-header">/);
 assert.doesNotThrow(()=>new vm.Script(content));
});
test('les images n’utilisent pas une vignette JP générique',()=>{
 const script=fs.readFileSync(path.join(root,'assets/swapp-actus-app.js'),'utf8');
 assert.match(script,/article\.image\?\.url/);
 assert.match(script,/img\.src=source/);
 assert.doesNotMatch(script,/src=["'].*jp.*\.png/i);
});
