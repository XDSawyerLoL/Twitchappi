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
test('the homepage no longer mounts the unrelated X/Discord promotional block',()=>{
 const html=read('index.html'),home=read('assets/swapp-home-news.js');
 assert.doesNotMatch(html,/swapp-social-bridge\.css\?v=/);
 assert.doesNotMatch(html,/swapp-social-bridge\.js\?v=/);
 assert.doesNotMatch(home,/SwappSocialBridge\?\.mount/);
 assert.match(home,/swapp-home-story-grid/);
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

test('verified public invite appears; unconfigured or malicious webhooks never become join links',async()=>{
 const invoke=async payload=>{
  const window={},document={createElement:tag=>new Element(tag)};
  const fetch=async()=>({ok:true,json:async()=>payload});
  const navigator={clipboard:{writeText:async()=>{}}};
  vm.runInNewContext(read('assets/swapp-social-bridge.js'),{window,document,navigator,URLSearchParams,URL,fetch},{timeout:1200});
  const host=new Element('section'),panel=window.SwappSocialBridge.mount(host,[{slug:'official-news-story',title:'Actualité SWAPP'}]);
  await new Promise(resolve=>setImmediate(resolve));
  const nodes=flatten(panel);
  const join=nodes.find(n=>n.tagName==='a'&&n.textContent.includes('Rejoindre notre Discord'));
  const profileLinks=nodes.filter(n=>n.tagName==='a'&&n.textContent.includes('Suivre SWAPP sur'));
  return {join,profileLinks};
 };
 const normal=await invoke({success:true,discordInvite:'https://discord.gg/LegitSWAPP',xProfile:'https://x.com/SwappGaming',blueskyProfile:'https://bsky.app/profile/swapp.bsky.social'});
 assert.equal(normal.join.hidden,false);
 assert.equal(normal.join.href,'https://discord.gg/LegitSWAPP');
 assert.equal(normal.profileLinks.length,2);
 const malicious=await invoke({success:true,discordInvite:'https://discord.com/api/webhooks/123456789012345678/secret-string',xProfile:null,blueskyProfile:null});
 assert.equal(malicious.join.hidden,true);
 assert.equal(malicious.join.href,undefined);
 assert.equal(malicious.profileLinks.length,0);
});
