'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function sizingHarness({resizeObserver=true}={}){
 const source=fs.readFileSync(path.join(root,'assets/swapp-social-native/app.js'),'utf8');
 const start=source.indexOf('function installSocialHeaderOffset(){');
 const end=source.indexOf('\ninstallSocialHeaderOffset();',start);
 assert.ok(start>=0&&end>start,'Header sizing implementation not found');
 const state={header:72,stack:150},vars={},events={},watch=[];
 const fakeHeader={getBoundingClientRect:()=>({height:state.header})};
 const fakeStack={getBoundingClientRect:()=>({height:state.stack})};
 const tabs={};
 const document={
  querySelector:q=>q==='header.top'?fakeHeader:q==='.swapp-social-sticky-stack'?fakeStack:null,
  getElementById:id=>id==='feed-tabs'?tabs:null,
  documentElement:{style:{setProperty:(key,value)=>{vars[key]=value}}}
 };
 const ctx={
  document,window:{addEventListener:(name,fn)=>{events[name]=fn}},
  MutationObserver:class {constructor(fn){this.update=fn}observe(el,options){watch.push({type:'mutation',el,options,callback:this.update})}},
  ResizeObserver:resizeObserver?class {constructor(fn){this.update=fn}observe(el){watch.push({type:'resize',el,callback:this.update})}}:undefined
 };
 vm.runInNewContext(source.slice(start,end)+'\ninstallSocialHeaderOffset();',ctx);
 return {state,vars,events,watch,tabs};
}
test('SOCIAL header offset reads the actual SWAPP header height',()=>{
 const h=sizingHarness();
 assert.equal(h.vars['--swapp-social-header-height'],'72px');
 assert.equal(h.vars['--swapp-social-stack-height'],'150px');
 assert.equal(h.watch.filter(x=>x.type==='resize').length,2);
 assert.ok(!('scroll' in h.events));
});
test('SOCIAL fixed layout immediately remeasures changed feed tab height',()=>{
 const h=sizingHarness();
 h.state.stack=102;
 const observer=h.watch.find(x=>x.type==='mutation');
 assert.ok(observer);
 assert.deepEqual([...observer.options.attributeFilter],['hidden']);
 observer.callback();
 assert.equal(h.vars['--swapp-social-stack-height'],'102px');
 h.state.header=84;
 h.watch.find(x=>x.type==='resize').callback();
 assert.equal(h.vars['--swapp-social-header-height'],'84px');
});
test('SOCIAL offset still updates on window resize without ResizeObserver',()=>{
 const h=sizingHarness({resizeObserver:false});
 assert.equal(h.watch.filter(x=>x.type==='resize').length,0);
 h.state.header=95;h.state.stack=112;
 h.events.resize();
 assert.equal(h.vars['--swapp-social-header-height'],'95px');
 assert.equal(h.vars['--swapp-social-stack-height'],'112px');
});
test('SOCIAL fixed stack and spacer adapt on phones and are absent on desktop',()=>{
 const html=fs.readFileSync(path.join(root,'assets/swapp-social-native/social-body.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'assets/swapp-social-native/social-swapp.css'),'utf8');
 const app=fs.readFileSync(path.join(root,'assets/swapp-social-native/app.js'),'utf8');
 assert.equal((html.match(/class="swapp-social-mobile-offset"/g)||[]).length,1);
 assert.match(css,/\.swapp-social-viewport \.swapp-social-sticky-stack\{\s*display:block!important;\s*position:fixed!important/);
 assert.match(css,/\.swapp-social-viewport \.swapp-social-mobile-offset\{display:none\}/);
 assert.match(css,/height:var\(--swapp-social-stack-height,150px\)/);
 assert.match(css,/\.swapp-social-viewport \[hidden\]\{display:none!important\}/);
 assert.match(app,/observer\.observe\(stack\)/);
});
