'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function articleHarness(){
 const listeners={},requests=[],actions=[];
 class Elem{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.isConnected=true;this.attributes={};
   this.classList={add(){},remove(){}};this.textContent='';this.onclick=null;}
  append(...xs){this.children.push(...xs)}
  prepend(...xs){this.children.unshift(...xs)}
  replaceChildren(...xs){this.children=xs}
  setAttribute(k,v){this.attributes[k]=v}
 }
 const win={scrollTo(){actions.push('top')}};
 const target=new Elem('section');
 const document={createElement:tag=>new Elem(tag),getElementById:id=>id==='actus'?target:null};
 const location={pathname:'/actus/jeu-test',origin:'https://swapp.tv'};
 const history={state:null,pushState(_a,_b,p){location.pathname=p;actions.push('push:'+p)}};
 const fetch=async(url,opts)=>{requests.push({url,signal:opts.signal});throw Error('Hors ligne')};
 // Simulate an older Safari environment: no AbortSignal.timeout.
 vm.runInNewContext(read('assets/swapp-actus-app.js'),{
  window:win,document,location,history,fetch,AbortController,setTimeout,clearTimeout,
  URL,Date,console
 });
 return {win,document,location,history,requests,actions,target};
}
test('iPhone article reader loads without AbortSignal.timeout and supplies usable recovery',async()=>{
 const h=articleHarness();
 await h.win.SwappActus.render(h.target);
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].url,'/api/actus/jeu-test');
 assert.ok(h.requests[0].signal,'AbortController signal is supplied');
 const body=h.target.children[0];
 const status=body.children.find(el=>el.tagName==='P');
 const tools=body.children.find(el=>el.tagName==='DIV');
 assert.match(status.textContent,/Hors ligne/);
 const retry=tools.children.find(el=>el.tagName==='BUTTON');
 const back=tools.children.find(el=>el.tagName==='A');
 assert.ok(retry&&back,'retry and route back must remain available');
 retry.onclick();
 assert.equal(h.requests.length,2,'user can retry the same article without a reload');
 let prevented=false;
 back.onclick({button:0,preventDefault(){prevented=true}});
 assert.ok(prevented,'internal back stays on SWAPP');
 assert.equal(h.location.pathname,'/actus');
});

function videoHarness(){
 const handlers={},windowHandlers={},created=[];
 let document;
 class Elem{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners={};
   this.dataset={};this.hidden=false;this.isConnected=false;this.className='';created.push(this);}
  append(...els){for(const el of els){this.children.push(el);el.parent=this;el.isConnected=this.isConnected}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.isConnected=false}
  setAttribute(k,v){this.attributes[k]=String(v)}
  addEventListener(k,fn){this.listeners[k]=fn}
  focus(){document.activeElement=this;this.focused=true}
  contains(node){return this===node||this.children.some(child=>child.contains(node))}
  querySelectorAll(){const result=[];function walk(e){for(const child of e.children){
   if(child.tagName==='BUTTON'||child.tagName==='A'&&child.href)result.push(child);
   walk(child);
  }}walk(this);return result}
 }
 const props=new Map([['overflow',{value:'clip',priority:''}]]);
 const style={
  getPropertyValue:key=>props.get(key)?.value||'',
  getPropertyPriority:key=>props.get(key)?.priority||'',
  setProperty:(key,value,priority='')=>props.set(key,{value,priority}),
  removeProperty:key=>props.delete(key)
 };
 const body=new Elem('body');body.isConnected=true;body.style=style;
 document={
  body,activeElement:null,createElement:tag=>new Elem(tag),
  addEventListener:(name,fn)=>{handlers[name]=fn}
 };
 const window={addEventListener:(name,fn)=>{windowHandlers[name]=fn}};
 const location={origin:'https://swapp.tv'};
 vm.runInNewContext(read('assets/swapp-video-player.js'),{window,document,location,URL});
 const trigger={dataset:{videoTitle:'Trailer',videoYoutube:'ABCDEFGHIJK',
  videoSource:'https://justplayer.fr/supporters/video_embeds/jeu-test'},
  isConnected:true,focus(){this.focused=true}};
 return {window,windowHandlers,handlers,created,document,body,style,trigger};
}
test('mobile trailer loads no third-party iframe before the visitor plays',()=>{
 const h=videoHarness();
 assert.equal(h.created.filter(x=>x.tagName==='IFRAME').length,0);
 h.window.SwappVideoViewer.open(h.trigger);
 assert.equal(h.created.filter(x=>x.tagName==='IFRAME').length,1);
 assert.equal(h.style.getPropertyValue('overflow'),'hidden');
 assert.match(h.created.find(x=>x.tagName==='IFRAME').src,/playsinline=1/);
});
test('video dialog traps keyboard focus and restores the prior scroll state after Escape',()=>{
 const h=videoHarness();
 h.window.SwappVideoViewer.open(h.trigger);
 const dialog=h.body.children[0];
 const buttons=dialog.querySelectorAll();
 assert.ok(buttons.length>=2);
 const first=buttons[0],last=buttons[buttons.length-1];
 h.document.activeElement=last;
 let prevented=false;
 h.handlers.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});
 assert.ok(prevented);assert.equal(h.document.activeElement,first);
 h.handlers.keydown({key:'Escape',preventDefault(){}});
 assert.equal(h.body.children.length,0);
 assert.equal(h.style.getPropertyValue('overflow'),'clip');
 assert.equal(h.trigger.focused,true);
});
test('video player closes on browser back without losing its former overflow setting',()=>{
 const h=videoHarness();
 h.window.SwappVideoViewer.open(h.trigger);
 h.windowHandlers.popstate();
 assert.equal(h.body.children.length,0);
 assert.equal(h.style.getPropertyValue('overflow'),'clip');
});
test('native video route and SPA load the same mobile video assets',()=>{
 const home=read('index.html'),hubs=read('modules/swapp-hubs.js');
 const js='swapp-video-player.js?v=20261016-ios-journey-1';
 const css='swapp-video-gallery.css?v=20261016-ios-journey-1';
 for(const source of [home,hubs]){assert.ok(source.includes(js));assert.ok(source.includes(css))}
 assert.match(home,/swapp-actus-app\.js\?v=20261016-ios-journey-1/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/Article reader lacks older-iPhone timeout compatibility/);
 assert.match(smoke,/Video player lacks focus, scroll-lock restoration/);
 const release=read('tools/swapp-release.js');
 for(const name of ['assets/swapp-actus-app.js','assets/swapp-video-player.js','assets/swapp-video-gallery.css']){
  assert.ok(release.includes("'"+name+"'"));
 }
});
