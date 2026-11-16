'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('one versioned obsidian canvas is used by both SPA and native SWAPP pages',()=>{
 const theme='swapp-obsidian-ice.css?v=20261116-unified-black-v23';
 assert.ok(read('index.html').includes(theme));
 assert.ok(read('modules/swapp-page-shell.js').includes(theme));
});
test('home, game universe, editorial, creator and SERVEUR+ use neutral black structural surfaces',()=>{
 const css=read('assets/swapp-obsidian-ice.css');
 for(const selector of ['body.swapp-servers-page .ss','body.swapp-editorial-route .game-portal',
  '#home.view.active','#actus.view.active','#discover.view.active','#channel.view.active',
  '.ss-toolbar','.ss-server-card','.story-card'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/--swapp-canvas:#030405/);
 assert.match(css,/--swapp-canvas-surface:#101215/);
 assert.match(css,/--swapp-canvas-line:rgba\(224,237,248,\.13\)/);
 assert.doesNotMatch(css,/img\s*\{[^}]*filter:|video\s*\{[^}]*filter:/i);
 assert.doesNotMatch(css,/img\{\s*opacity:0/);
});
