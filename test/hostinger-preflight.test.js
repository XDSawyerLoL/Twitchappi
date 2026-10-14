'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inspectHostingerBuild} = require('../scripts/hostinger-preflight');
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swapp-preflight-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: 'swapp-live', version: '1.0.0', main: 'app.js', scripts: {start:'node app.js'},dependencies:{express:'^4.21.2'}}));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({name:'swapp-live',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'swapp-live',version:'1.0.0',dependencies:{express:'^4.21.2'}},'node_modules/express':{resolved:'https://registry.npmjs.org/express/-/express-4.21.2.tgz'}}}));
    fs.writeFileSync(path.join(root,'app.js'),"require('./server');\n");
    fs.writeFileSync(path.join(root,'server.js'),'module.exports = {};\n');
    fs.writeFileSync(path.join(root,'index_script.js'),'console.log("ok");\n');
    fs.writeFileSync(path.join(root,'index.html'),'<html></html>');
    return fn(root);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test('environnement conforme : tous les contrôles réussissent',()=>fixture(root=>{
  const r=inspectHostingerBuild(root,{nodeVersion:'22.16.0'});
  assert.equal(r.ok,true); assert.deepEqual(r.errors,[]);
}));
test('détecte un serveur manquant',()=>fixture(root=>{
  fs.rmSync(path.join(root,'server.js'));
  const r=inspectHostingerBuild(root,{nodeVersion:'22.16.0'});
  assert.equal(r.ok,false); assert.ok(r.errors.some(x=>x.includes('server.js')));
}));
test('détecte une incohérence du lockfile',()=>fixture(root=>{
  const p=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')); p.dependencies.express='^5.0.0';
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(p));
  const r=inspectHostingerBuild(root,{nodeVersion:'22.16.0'});
  assert.equal(r.ok,false); assert.ok(r.errors.some(x=>x.includes('express')));
}));
test('détecte un JavaScript invalide',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'server.js'),'const = ;');
  const r=inspectHostingerBuild(root,{nodeVersion:'22.16.0'});
  assert.equal(r.ok,false); assert.ok(r.errors.some(x=>x.includes('contrôle syntaxique')));
}));
test('avertit sans exposer les URL de registres privés',()=>fixture(root=>{
  const p=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  p.packages['node_modules/express'].resolved='https://npm.internal.example/a.tgz';
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(p));
  const r=inspectHostingerBuild(root,{nodeVersion:'22.16.0'});
  assert.equal(r.ok,true); assert.ok(r.warnings.some(x=>x.includes('hôte(s)')));
  assert.equal(JSON.stringify(r).includes('npm.internal.example'), false);
}));
test('signale Node.js trop ancien et avertit sur Node 20',()=>fixture(root=>{
  assert.equal(inspectHostingerBuild(root,{nodeVersion:'18.0.0'}).ok,false);
  assert.ok(inspectHostingerBuild(root,{nodeVersion:'20.0.0'}).warnings.some(x=>x.includes('Node.js 20')));
}));
