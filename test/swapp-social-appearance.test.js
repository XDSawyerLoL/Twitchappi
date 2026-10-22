'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('SOCIAL and Store have no page-specific appearance controls',()=>{
 const hub=read('modules/swapp-hubs.js');
 const pageCSS=read('assets/swapp-page-colors.css');
 assert.doesNotMatch(hub,/swapp-page-colors\.js|pageColors/);
 assert.doesNotMatch(pageCSS,/swapp-page-appearance|swapp-appearance-swatch/);
 assert.match(pageCSS,/--social-accent:var\(--swapp-page-accent/);
 assert.match(pageCSS,/body:has\(\.swapp-store\)/);
});
test('all server-rendered pages use the global saved accent from the shared shell',()=>{
 const shell=read('modules/swapp-news/site-shell.js');
 const script=read('assets/swapp-editorial-color.js');
 const nav=read('assets/swapp-unified-nav.css');
 assert.match(shell,/swapp-editorial-color\.js/);
 assert.match(shell,/swapp-page-colors\.css\?v=20261022-global-color-v1/);
 assert.match(nav,/--swapp-page-accent:var\(--brand,#22d3ee\)/);
 assert.match(script,/oryon_viewer_accent/);
 assert.match(script,/setProperty\('--swapp-page-accent',chosen\)/);
 assert.doesNotMatch(script,/setItem\(/);
});
test('SOCIAL styling follows the global accent but provides no extra palette',()=>{
 const css=read('assets/swapp-social-appearance.css');
 assert.match(css,/var\(--swapp-page-accent,#22d3ee\)/);
 const hub=read('modules/swapp-hubs.js');
 assert.doesNotMatch(hub,/script defer src="\/assets\/swapp-page-colors\.js/);
});
