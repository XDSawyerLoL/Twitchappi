'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {installChannelProgramme,expand,calendarWindow,validate}=require('../modules/swapp-channel-programme');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function fixture(){
 const owner={id:'user1',login:'vnhz',channel_public:true,swapp_channel_programme:[]};
 const data={users:[owner]},routes={};let writes=0;
 const app={
  get:(name,...f)=>routes['GET '+name]=f.at(-1),
  post:(name,...f)=>routes['POST '+name]=f.at(-1),
  delete:(name,...f)=>routes['DELETE '+name]=f.at(-1)
 };
 installChannelProgramme({
  app,getUsers:()=>data,saveUsers:async()=>{writes++},findUser:name=>name==='vnhz'?owner:null,
  twitchAPI:async()=>({data:[]})
 });
 async function call(method,path,{identity=true,month,body={},id='',origin='https://swapp.tv'}={}){
  const req={params:{login:'vnhz',id},query:month?{month}:{},
   session:identity?{oryonUser:{id:'user1',login:'vnhz'}}:{},headers:{origin,host:'swapp.tv'},body};
  const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},
   status(n){this.code=n;return this},json(result){this.body=result;return this}};
  await routes[method+' '+path](req,res);return res;
 }
 return {owner,call,writes:()=>writes};
}
const route='/api/swapp/channel/:login/programme';
const ymd=d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
test('weekly stream stays at 20:00 in Paris after spring DST transition',()=>{
 const base=Date.UTC(2026,9,27,19);
 const range=calendarWindow('2027-04',Date.UTC(2026,9,26));
 const rows=expand([{id:'dst',title:'Direct du soir',start_at:new Date(base).toISOString(),
  timezone:'Europe/Paris',repeat:'weekly'}],Date.UTC(2026,9,26),range);
 assert.ok(rows.length>=4);
 const fmt=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'numeric',hourCycle:'h23'});
 assert.ok(rows.every(row=>fmt.format(new Date(row.start_at)).startsWith('20')));
});
test('unrecognized timezone rejected',()=>{
 assert.throws(()=>validate({title:'Direct',start_at:new Date(Date.now()+86400000).toISOString(),
  timezone:'Not/A_Zone'}),/invalid_timezone/);
});
test('monthly calendar range covers first/last partial weeks',()=>{
 const now=new Date(),month=ymd(now);
 const range=calendarWindow(month);
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).getTime();
 const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).getTime();
 assert.ok(range.from<=start-6*86400000);
 assert.ok(range.to>=end+6*86400000);
 assert.ok(range.to-range.from<75*86400000);
});
test('long-running weekly broadcasts recur in the requested month',async()=>{
 const f=fixture(),start=new Date(Date.now()-120*86400000).toISOString();
 f.owner.swapp_channel_programme=[{id:'series',title:'Aion 2 PvP',start_at:start,
  game:'Aion 2',duration_minutes:120,repeat:'weekly'}];
 const month=ymd(new Date());
 const reply=await f.call('GET',route,{identity:false,month});
 assert.equal(reply.code,200);
 assert.ok(reply.body.items.length>=4);
 assert.ok(reply.body.items.every(item=>item.id==='series'&&item.base_start_at===start));
 assert.ok(reply.body.items.every(item=>item.repeat==='weekly'));
});
test('current month accepts public reading, rejects invalid/far-future month',async()=>{
 const f=fixture(),month=ymd(new Date());
 assert.equal((await f.call('GET',route,{identity:false,month})).code,200);
 assert.equal((await f.call('GET',route,{identity:false,month:'2026-13'})).code,400);
 assert.equal((await f.call('GET',route,{identity:false,month:'2099-10'})).code,400);
});
test('past weekly origin can be edited without cancelling the series',async()=>{
 const f=fixture(),original=new Date(Date.now()-90*86400000).toISOString();
 f.owner.swapp_channel_programme=[{id:'weekly',title:'Ancien live',
  start_at:original,repeat:'weekly',duration_minutes:120,game:'',note:''}];
 const update=await f.call('POST',route,{body:{
  ...f.owner.swapp_channel_programme[0],title:'Nouveau programme',game:'Aion 2'
 }});
 assert.equal(update.code,200);
 assert.equal(f.owner.swapp_channel_programme[0].start_at,original);
 assert.equal(f.owner.swapp_channel_programme[0].title,'Nouveau programme');
 assert.equal(f.writes(),1);
});
test('visitor cannot write, and recurrence respects bounded date validation',async()=>{
 const f=fixture();
 const start_at=new Date(Date.now()+86400000).toISOString();
 assert.equal((await f.call('POST',route,{identity:false,body:{title:'test',start_at}})).code,401);
 assert.equal((await f.call('POST',route,{body:{title:'test',start_at},origin:'https://outside.example'})).code,403);
 assert.throws(()=>validate({title:'test',start_at:'invalid'}),/invalid_schedule_date/);
});
test('agenda client renders seven weekday columns and keeps every media element untouched',()=>{
 const js=read('assets/swapp-channel-programme.js');
 const css=read('assets/swapp-channel-programme.css');
 const html=read('index.html');
 new Function(js);
 assert.match(js,/\['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'\]/);
 assert.match(js,/swapp-agenda-grid/);
 assert.match(js,/monthKey\(model\.month\)/);
 assert.match(js,/data\.items/);
 assert.match(js,/base_start_at/);
 assert.match(js,/history\.pushState/);
 assert.doesNotMatch(js,/replaceChildren\(.*iframe|new Hls\(|srcObject|RTCPeerConnection/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/swapp-agenda-dots/);
 assert.match(html,/swapp-channel-programme\.js\?v=20261026-agenda-idempotent-v3/);
 assert.match(html,/swapp-channel-programme\.css\?v=20261026-agenda-v2/);
});

test('agenda tab install is idempotent under repeated DOM mutations',()=>{
 const js=read('assets/swapp-channel-programme.js');
 assert.doesNotMatch(js,/mounted\.button\?\.isConnected/);
 assert.match(js,/mounted\.tab\?\.isConnected/);
 const a=js.indexOf(' function install(){');
 const b=js.indexOf('\n let scheduled=false;',a);
 assert.ok(a>=0&&b>a);
 const children=[],panels=[],listeners=new Set(),nav={
  isConnected:true,hidden:false,
  append(tab){tab.isConnected=true;children.push(tab)},
  after(panel){panel.isConnected=true;panels.push(panel)},
  querySelectorAll(selector){
   if(selector==='[data-swapp-programme-tab]')return children.filter(x=>x.isConnected);
   return [];
  }
 };
 const page={isConnected:true,dataset:{},querySelector:()=>nav,
  querySelectorAll(selector){return selector==='[data-swapp-programme-page]'?
   panels.filter(x=>x.isConnected):[]}};
 const root={classList:{contains:()=>true},querySelector:()=>page};
 let models=0;
 const make=()=>({dataset:{},classList:{},setAttribute(){},addEventListener(){},remove(){
  this.isConnected=false}});
 const init=()=>{models++;return {name:'vnhz',panel:{isConnected:false,remove(){this.isConnected=false}}}};
 const window={addEventListener(event,fn){if(event==='popstate')listeners.add(fn)},
  removeEventListener(event,fn){if(event==='popstate')listeners.delete(fn)}};
 const fn=new Function('root','login','make','init','show','window','location','history','URL','URLSearchParams',
  'let mounted=null;\n'+js.slice(a,b)+'\nreturn {install,stats:()=>({mounted,models})}');
 const runtime=fn(root,()=> 'vnhz',make,init,()=>{},window,{href:'https://swapp.tv/vnhz',search:''},
  {pushState(){}},function URL(){},function Params(){this.get=()=>null});
 for(let i=0;i<80;i++)runtime.install();
 assert.equal(children.filter(x=>x.isConnected).length,1,'only one tab may survive');
 assert.equal(panels.filter(x=>x.isConnected).length,1,'only one agenda panel may survive');
 assert.equal(models,1,'repeated observer callbacks cannot rebuild the agenda');
 assert.equal(listeners.size,1);
 // When SPA replaces the existing tab, cleanup must not accumulate listeners.
 children[0].isConnected=false;
 runtime.install();
 assert.equal(children.filter(x=>x.isConnected).length,1);
 assert.equal(panels.filter(x=>x.isConnected).length,1);
 assert.equal(listeners.size,1);
 assert.equal(models,2);
});
