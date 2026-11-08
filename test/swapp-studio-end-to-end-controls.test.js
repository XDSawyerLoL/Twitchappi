'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'local-agent/studio.html'),'utf8');
const script=fs.readFileSync(path.join(root,'local-agent/studio.js'),'utf8');

function makeHarness(){
 const state={signedIn:true,key:'SWAPP_key1',local:false,external:false,published:false,requests:[],copied:'',refresh:null};
 class Element{
  constructor(id='',kind='div'){
   this.id=id;this.kind=kind;this.hidden=false;this.disabled=false;this.value='';
   this.dataset={};this.classList={toggle(){}};this.style={};
   this.children=[];this.listeners={};this.textContent='';this.attributes={};
   this.muted=true;this.volume=0;this.readyState=0;this.paused=true;
   this.options=[];this.src='';this.type='text';
  }
  get selectedOptions(){return this.options.filter(x=>x.value===this.value).slice(0,1)}
  get childElementCount(){return this.children.length}
  get lastElementChild(){return this.children[this.children.length-1]}
  append(...items){for(const item of items){item.parent=this;this.children.push(item)}}
  prepend(item){item.parent=this;this.children.unshift(item)}
  remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1)}
  addEventListener(name,listener){(this.listeners[name]??=[]).push(listener)}
  async fire(name){for(const listener of this.listeners[name]||[])await listener()}
  removeAttribute(key){delete this.attributes[key]}
  setAttribute(key,value){this.attributes[key]=String(value)}
  querySelector(query){
   const m=query.match(/^option\[value="(.+)"\]$/);
   if(!m)return null;
   return this.options.find(x=>x.value===m[1])||null;
  }
  pause(){this.paused=true}
  play(){this.paused=false;return Promise.resolve()}
  load(){}
  canPlayType(){return 'maybe'}
 }
 const nodes=new Map;
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set(id,new Element(id));
 for(const [,id,inner] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
  const elem=nodes.get(id);
  elem.options=[...inner.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map(match=>
    ({value:match[1],textContent:match[2],disabled:false}));
  const selected=inner.match(/<option[^>]*value="([^"]+)"[^>]*selected[^>]*>/);
  elem.value=selected?selected[1]:elem.options[0]?.value||'';
 }
 for(const id of ['rtmpServer','streamKey'])nodes.get(id).type=id==='streamKey'?'password':'text';
 for(const [,key] of html.matchAll(/data-preset="([^"]+)"/g)){
  const p=new Element('preset-'+key,'button');p.dataset.preset=key;nodes.set(p.id,p);
 }
 const presetButtons=[...nodes.values()].filter(x=>x.dataset.preset);
 const document={
  getElementById(id){const x=nodes.get(id);if(!x)throw Error('Missing HTML element: '+id);return x},
  querySelectorAll(sel){if(sel==='[data-preset]')return presetButtons;throw Error('Unexpected selector: '+sel)},
  createElement(kind){return new Element('',kind)}
 };
 const store=new Map;
 const calls=state.requests;
 async function fetch(url,options={}){
  const method=options.method||'GET';
  calls.push({url,method,body:options.body||''});
  let result={success:true};
  if(url==='/api/setup/check')result.rtmp='rtmp://127.0.0.1:1935/live';
  else if(url==='/api/account/status')result={
   success:true,connected:state.signedIn,stream_key:state.signedIn?state.key:'',
   user:state.signedIn?{login:'player123'}:null
  };
  else if(url==='/api/screen/status')result={
   success:true,capturing:state.local,ready:state.local,method:'gdigrab',engine:'ffmpeg',
   key:state.key,libobsAvailable:false
  };
  else if(url.startsWith('/api/status?'))result={
   success:true,published:state.published,
   stream:{active:state.external||state.local,hls_exists:state.external||state.local,
    ffmpeg_running:state.external||state.local}
  };
  else if(url==='/api/screen/audio-devices')result={success:true,devices:[]};
  else if(url==='/api/screen/start'){
   state.local=true;result={success:true,key:state.key,engine:'ffmpeg',method:'gdigrab',
    recovery:'Capture de secours via GDI après changement de mode vidéo.'};
  }else if(url==='/api/screen/stop')state.local=false;
  else if(url==='/api/go-live')state.published=true;
  else if(url==='/api/tunnel/stop')state.published=false;
  else if(url==='/api/account/disconnect')state.signedIn=false;
  else if(url==='/api/tunnel/repair')result={success:true,provider:'manual'};
  else throw Error('Unexpected API: '+url);
  return {ok:true,status:200,json:async()=>result};
 }
 const context={
  document,fetch,
  window:{addEventListener(){},open(){}},
  navigator:{clipboard:{writeText:async value=>{state.copied=value}},sendBeacon(){}},
  localStorage:{getItem:x=>store.get(x)||null,setItem:(x,v)=>store.set(x,v)},
  location:{port:'8081'},
  setInterval:(fn,time)=>{if(time===4000)state.refresh=fn;return 1},
  Hls:{isSupported:()=>false},
  Date,console
 };
 return {state,nodes,presetButtons,context,run:()=>vm.runInNewContext(script,context,{timeout:2000}),
  wait:async()=>new Promise(resolve=>setImmediate(resolve))};
}

test('Creator Studio buttons connect key, capture preview, go-live, repair and stop through real local API endpoints',async()=>{
 const app=makeHarness();app.run();await app.wait();
 const {nodes,state}=app;
 assert.equal(nodes.get('streamKey').value,'SWAPP_key1');
 assert.equal(nodes.get('streamKey').type,'password','key must start hidden');
 assert.equal(nodes.get('rtmpServer').value,'rtmp://127.0.0.1:1935/live');
 await nodes.get('copyKey').fire('click');
 assert.equal(state.copied,'SWAPP_key1');
 await nodes.get('revealKey').fire('click');
 assert.equal(nodes.get('streamKey').type,'text');
 await nodes.get('revealKey').fire('click');
 assert.equal(nodes.get('streamKey').type,'password');
 assert.equal(nodes.get('previewButton').disabled,false,'logged in users may preview');
 await nodes.get('previewButton').fire('click');
 assert.equal(state.local,true);
 assert.equal(nodes.get('liveButton').disabled,true,'cannot publish before actual preview frames');
 await nodes.get('video').fire('loadeddata');
 assert.equal(nodes.get('liveButton').disabled,false);
 await nodes.get('liveButton').fire('click');
 assert.equal(state.published,true);
 assert.equal(nodes.get('topLiveState').textContent,'EN DIRECT');
 await nodes.get('repairButton').fire('click');
 assert.equal(state.requests.filter(x=>x.url==='/api/tunnel/repair').length,1);
 await nodes.get('stopButton').fire('click');
 assert.equal(state.published,false);assert.equal(state.local,false);
 assert.ok(state.requests.some(x=>x.url==='/api/screen/stop'&&x.method==='POST'));
 assert.ok(state.requests.some(x=>x.url==='/api/go-live'&&x.method==='POST'));
 await nodes.get('disconnectButton').fire('click');
 assert.equal(state.signedIn,false);
 assert.equal(nodes.get('streamKey').value,'');
});

test('external OBS RTMP stream uses existing studio canvas and Go Live, stop never kills external capture',async()=>{
 const app=makeHarness();app.run();await app.wait();
 const {nodes,state,presetButtons}=app;
 const ext=presetButtons.find(x=>x.dataset.preset==='external');
 await ext.fire('click');
 assert.equal(nodes.get('captureMode').value,'external');
 assert.equal(nodes.get('previewButton').disabled,true,'external sender uses existing RTMP input, not a second capture');
 state.external=true;
 await state.refresh();
 assert.equal(nodes.get('previewButton').disabled,true);
 assert.equal(nodes.get('activeSourceText').textContent,'Source : Signal OBS/RTMP externe');
 await nodes.get('video').fire('loadeddata');
 assert.equal(nodes.get('liveButton').disabled,false);
 await nodes.get('liveButton').fire('click');
 assert.equal(state.published,true);
 const stopsBefore=state.requests.filter(x=>x.url==='/api/screen/stop').length;
 await nodes.get('stopButton').fire('click');
 assert.equal(state.external,true);
 assert.equal(state.published,false);
 assert.equal(state.requests.filter(x=>x.url==='/api/screen/stop').length,stopsBefore,
  'never terminate independently owned OBS input when stopping only public live');
 assert.equal(nodes.get('topLiveState').textContent,'APERÇU LOCAL');
});
