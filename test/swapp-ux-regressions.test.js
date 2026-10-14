'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('account menu keeps theme choices compact and below primary actions',()=>{
 const script=read('assets/swapp-account-menu.js');
 const styles=read('assets/swapp-visual-polish.css');
 assert.match(script,/className='swapp-account-appearance'/);
 assert.match(script,/menu\.append\(details\)/);
 assert.match(script,/\.topThemeColors button/);
 assert.match(script,/observer\.observe\(menu,\{childList:true\}\)/);
 assert.match(script,/event\.key==='Escape'/);
 assert.match(script,/menu\.classList\.remove\('open'\)/);
 assert.match(styles,/#userMenu \.topThemeColors/);
 assert.match(styles,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)!important/);
});
test('home article cards and navigation remain wired up',()=>{
 const home=read('assets/swapp-home-news.js');
 const article=read('assets/swapp-actus-app.js');
 const shell=read('index.html');
 assert.match(home,/fetchItems\('\/api\/actus'/);
 assert.match(home,/grid\.append\(story\(item,i\)\)/);
 assert.match(home,/const base=modern\|\|legacy\|\|home/);
 assert.match(home,/window\.setView\('actus'\)/);
 assert.match(home,/window\.setView\('discover'\)/);
 assert.match(article,/window\.SwappActus=Object\.freeze\(\{render,open,home\}\)/);
 assert.match(article,/history\.pushState\(\{view:'actus'\}/);
 assert.match(shell,/src="\/assets\/swapp-home-news\.js\?v=/);
});
test('direct /actus and in-app ACTUS converge',()=>{
 const router=read('modules/swapp-news/router.js');
 const server=read('server.js');
 assert.match(router,/router\.get\('\/actus',\(req,res,next\)=>/);
 assert.match(router,/return sendApp\(res\)/);
 assert.match(server,/sendApp: sendSwappUi/);
});
