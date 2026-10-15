'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'assets/swapp-route-bootstrap.js'),'utf8');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');

function browser(pathname,initial=false){
 const events={window:{},document:{}},tasks=[];
 const makeNode=active=>{
  const classes=new Set(active?['view','active']:['view']);
  let rendered=false;
  return {
   classList:{
    add:s=>classes.add(s),remove:s=>classes.delete(s),
    contains:s=>classes.has(s)
   },
   querySelector:s=>s==='.swapp-actus-native'&&rendered?{}:null,
   markRendered:()=>{rendered=true}
  };
 };
 const home=makeNode(true),actus=makeNode(false);
 const location={pathname};
 const history={replacements:[],replaceState(_state,_title,url){this.replacements.push(url);location.pathname=url}};
 let viewCalls=0;
 const window={
  __SWAPP_DIRECT_ACTUS_ENTRY__:initial,
  addEventListener:(name,fn)=>{events.window[name]=fn},
  SwappActus:{render:async()=>{actus.markRendered()}},
  setView:async view=>{
   viewCalls++;
   if(view==='actus'){
    home.classList.remove('active');
    actus.classList.add('active');
    actus.markRendered();
   }
  }
 };
 const document={
  getElementById:id=>id==='home'?home:id==='actus'?actus:null,
  addEventListener:(name,fn)=>{events.document[name]=fn}
 };
 const context={location,history,document,window,setTimeout:(fn,delay)=>tasks.push({fn,delay}),console};
 vm.runInNewContext(boot,context);
 return {location,history,home,actus,window,events,tasks,get viewCalls(){return viewCalls}};
}
test('a F5 on /actus does not present the homepage while sessions load',async()=>{
 const app=browser('/actus');
 assert.equal(app.home.classList.contains('active'),false);
 assert.equal(app.actus.classList.contains('active'),true);
 assert.equal(app.tasks.length,5);
 await app.tasks[0].fn();
 assert.equal(app.viewCalls,1);
 assert.equal(app.location.pathname,'/actus');
});
test('a direct /actus entry recovers even if legacy boot rewrites the URL',async()=>{
 const app=browser('/actus',true);
 app.location.pathname='/';
 await app.tasks[0].fn();
 assert.equal(app.location.pathname,'/actus');
 assert.deepEqual(app.history.replacements,['/actus']);
 assert.equal(app.viewCalls,1);
});
test('boot recovery must never undo an intentional navigation away',async()=>{
 const app=browser('/actus');
 app.events.document.click({target:{closest:()=>({})}});
 app.location.pathname='/';
 await app.tasks[0].fn();
 assert.equal(app.location.pathname,'/');
 assert.equal(app.history.replacements.length,0);
 assert.equal(app.viewCalls,0);
});
test('normal homepage loads do not install ACTUS restoration',()=>{
 const app=browser('/');
 assert.equal(app.tasks.length,0);
 assert.equal(app.home.classList.contains('active'),true);
});
test('ACTUS initial document selects the correct view before loading the SPA',()=>{
 assert.match(shell,/window\.__SWAPP_DIRECT_ACTUS_ENTRY__=true/);
 assert.match(shell,/src="\/assets\/swapp-route-bootstrap\.js\?v=20261015-route-31"/);
 assert.match(shell,/href="\/assets\/swapp-art-direction\.css\?v=[^"]+"/);
 const css=fs.readFileSync(path.join(root,'assets/swapp-art-direction.css'),'utf8');
 assert.match(css,/#actus\.view\.active\s*\{/);
 assert.match(css,/#actus\.view\.active[\s\S]*?var\(--swapp-side-light,var\(--brand,#22d3ee\)\)/);
});
