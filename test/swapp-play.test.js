'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-play.js'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function harness(){
 const nodes=new Map(),events={};
 const create=(kind)=>{
  const classes=new Set(),attributes={};
  return {
   kind,isConnected:true,disabled:false,clicked:0,dataset:{},textContent:'',title:'',
   classList:{
    add(c){classes.add(c)},remove(c){classes.delete(c)},
    contains(c){return classes.has(c)},
    toggle(c,val){if(val===undefined)val=!classes.has(c);if(val)classes.add(c);else classes.delete(c);return val}
   },
   matches(sel){return kind==='article'&&sel.includes('.homeLiveCard1014')},
   getAttribute(k){return attributes[k]||null},
   setAttribute(k,v){attributes[k]=String(v)},
   closest(){return null},
   querySelector(selector){return kind==='article'&&selector.includes('homeLiveBadge1014')?{className:'homeLiveBadge1014'}:null},
   querySelectorAll(sel){return kind==='home'&&sel.includes('.homeLiveCard1014')?[article]:[]},
   getBoundingClientRect(){return {left:100,top:100,width:280,height:160}},
   focus(){document.activeElement=this},
   scrollIntoView(){},
   click(){this.clicked++},
   addEventListener(evt,fn){this['on'+evt]=fn},
   appendChild(child){if(child.id)nodes.set('#'+child.id,child)},
   insertBefore(child){this.appendChild(child)}
  };
 };
 const header=create('header'),user=create('user'),action=create('action'),article=create('article'),home=create('home'),body=create('body'),head=create('head');
 const document={
  body,head,hidden:false,activeElement:article,
  createElement:create,
  querySelector(q){
   if(q==='.topbar')return header;
   if(q==='.topbar .userArea')return user;
   if(q==='#home.view.active .homeHeroCopy1014 .homeActions1014')return action;
   if(q==='#home.view.active')return home;
   if(q==='.swapp-controller-focus')return article.classList.contains('swapp-controller-focus')?article:null;
   return nodes.get(q)||null;
  },
  querySelectorAll(q){
   if(q.includes('.topbar a[href]'))return [article,...Array.from(nodes.values())];
   if(q.includes('.homeLiveCard1014'))return [article];
   return [];
  },
  addEventListener(evt,fn){events[evt]=fn}
 };
 const pad={connected:true,buttons:Array.from({length:16},()=>({pressed:false})),axes:[0,0]},window={
  addEventListener(evt,fn){events[evt]=fn},
  setInterval(fn){window.poll=fn}
 };
 const context={window,document,navigator:{getGamepads:()=>[pad]},
  MutationObserver:class{observe(){}},getComputedStyle:()=>({display:'block',visibility:'visible'}),
  requestAnimationFrame:fn=>fn(),location:{pathname:'/'},history:{back(){events.wentBack=true}},
  performance:{now:()=>500}};
 vm.runInNewContext(source,context,{timeout:1000});
 return {article,pad,window,events,body,toggle:nodes.get('#swappPlayToggle'),surf:nodes.get('#swappPlaySurf')};
}

test('SWAPP Play is loaded within the existing page, and parses',()=>{
 assert.match(shell,/<script defer src="\/assets\/swapp-play\.js\?/);
 assert.doesNotThrow(()=>new Function(source));
 assert.doesNotMatch(source,/createElement\('section'\)/);
});
test('the controller toggle and discovery button mount in the real topbar and hero',()=>{
 const h=harness();
 assert.ok(h.toggle);
 assert.ok(h.surf);
 assert.equal(h.surf.textContent,'⤨ Surprends-moi');
});
test('SURF opens the actual live ARTICLE rather than searching for an anchor',()=>{
 const h=harness();
 h.surf.onclick();
 assert.equal(h.article.clicked,1);
});
test('connected gamepad activates mode and A opens the highlighted live',()=>{
 const h=harness();
 h.events.gamepadconnected();
 assert.equal(h.body.classList.contains('swapp-play-active'),true);
 assert.equal(h.article.classList.contains('swapp-controller-focus'),true);
 h.pad.buttons[0].pressed=true;
 h.window.poll();
 assert.equal(h.article.clicked,1);
});
test('B leaves lounge mode on the home page',()=>{
 const h=harness();
 h.events.gamepadconnected();
 h.pad.buttons[1].pressed=true;
 h.window.poll();
 assert.equal(h.body.classList.contains('swapp-play-active'),false);
});
test('pulse derives from the verified live badge and can be disabled by DOM refresh',()=>{
 const h=harness();
 assert.equal(h.article.classList.contains('swapp-pulse-live'),true);
 assert.match(source,/prefers-reduced-motion:reduce/);
 assert.match(source,/homeLiveBadge1014/);
});
