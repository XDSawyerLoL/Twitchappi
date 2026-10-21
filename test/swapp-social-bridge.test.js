'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.isConnected=true;this.className='';this.textContent='';this.attrs={};this.listeners={};}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(k,v){this.attrs[k]=v}
 querySelector(selector){
  if(selector==='h2')return this.children.find(n=>n.tagName==='h2')||null;
  if(selector==='[data-swapp-social-bridge]')return this.children.find(n=>n.dataset?.swappSocialBridge)||null;
  return null;
 }
 addEventListener(event,fn){this.listeners[event]=fn}
}
function flatten(root,out=[]){
 for(const el of root.children||[]){out.push(el);flatten(el,out)}
 return out;
}
test('the home page imports a real first-party X/Discord visual in correct order',()=>{
 const html=read('index.html'),home=read('assets/swapp-home-news.js');
 assert.match(html,/swapp-social-bridge\.css\?v=20261021-join-bridge-v2/);
 assert.match(html,/swapp-social-bridge\.js\?v=20261021-join-bridge-v2/);
 assert.ok(html.indexOf('swapp-social-bridge.js')<html.indexOf('swapp-home-news.js'));
 assert.match(home,/SwappSocialBridge\?\.mount\(section,valid\)/);
 assert.doesNotMatch(read('assets/swapp-social-bridge.js'),/DISCORD_WEBHOOK_URL|\/api\/webhooks\/\d+\/[^ ]+/);
});
test('X composer is correct; Discord receives the canonical article link once, and duplicate mount is prevented',async()=>{
 const window={},document={createElement:tag=>new Element(tag)};
 let copied='';
 const navigator={clipboard:{writeText:async value=>{copied=value}}};
 vm.runInNewContext(read('assets/swapp-social-bridge.js'),{window,document,navigator,URLSearchParams,URL},{timeout:1200});
 const parent=new Element('section');
 const article={slug:'cyberpunk-2077-mise-a-jour-2-5-edgerunners-2',title:'Cyberpunk 2077 : la mise à jour 2.5'};
 const panel=window.SwappSocialBridge.mount(parent,[article]);
 assert.ok(panel);
 assert.equal(parent.children.length,1);
 assert.equal(window.SwappSocialBridge.mount(parent,[article]),panel);
 const nodes=flatten(panel);
 const x=nodes.find(node=>node.tagName==='a');
 const discord=nodes.find(node=>node.tagName==='button');
 assert.ok(x&&discord);
 const address=new URL(x.href);
 assert.equal(address.hostname,'x.com');
 assert.equal(address.pathname,'/intent/tweet');
 assert.equal(address.searchParams.get('url'),'https://swapp.tv/actus/'+article.slug);
 assert.match(address.searchParams.get('text'),/Cyberpunk 2077/);
 await discord.listeners.click();
 assert.equal(copied,'https://swapp.tv/actus/'+article.slug);
 assert.equal(discord.textContent,'Lien copié ✓');
});
