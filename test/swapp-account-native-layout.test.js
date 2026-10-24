'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=()=>fs.readFileSync(path.join(__dirname,'..','index_script.js'),'utf8');
const css=()=>fs.readFileSync(path.join(__dirname,'..','assets/swapp-creator-workspace.css'),'utf8');
function account(){
 const bundle=script(),start=bundle.indexOf('function swappAccountTab(tab){');
 const end=bundle.indexOf('\nasync function renderChannel(){',start);
 assert.ok(start>=0&&end>start);
 return bundle.slice(start,end);
}
function makeView(user){
 const script=account();
 const buttons=['overview','profile','stream'].map(name=>({
  dataset:{accountTab:name},attributes:{},classList:{toggle(){}},
  setAttribute(name,value){this.attributes[name]=value}
 }));
 const panels=['overview','profile','stream'].map(name=>({dataset:{accountPanel:name},hidden:false}));
 const root={innerHTML:'',querySelectorAll(q){return q==='[data-account-tab]'?buttons:q==='[data-account-panel]'?panels:[]},
  querySelector(q){return q==='.swapp-acct-nav'?{addEventListener(){},querySelectorAll:()=>buttons}:null}};
 const doc={getElementById:id=>id==='settings'?root:null};
 const window={swappViewerSnapshot:()=>({likes:[{login:'mychannel',name:'My Channel',game:'Minecraft',platform:'oryon'}],saved:[{login:'example'}]})};
 const calls=[];
 const state={session:{local:user||null,twitch:null},swappHistory:{enabled:false}};
 const f=new Function('document','window','state','api','esc','viewerProfileV2','savedLives','localStorage',
  'authSettings','profileSettings','renderPlanning','bindSettingsForms','loadFoundation',script+'\nreturn {renderSettings,swappAccountTab};');
 const view=f(doc,window,state,async()=>({success:true,user}),v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  ()=>({likedChannels:[]}),()=>[],{getItem:()=> '#22d3ee'},
  ()=>'<form id="loginForm"></form>',
  ()=>'<form id="profileForm"><input id="profileDisplay"></form>',
  ()=>calls.push('planning'),()=>calls.push('forms'),()=>calls.push('foundation'));
 return {view,root,buttons,panels,calls};
}
test('a single canonical account renderer replaces shadowed legacy definitions',()=>{
 const b=script();
 assert.equal(b.split('async function renderSettings(){').length-1,1);
 assert.doesNotMatch(b,/function viewerProfilePanel\(\)\{/);
 assert.doesNotMatch(account(),/settingsGrid|viewerProfilePanel|funPlanner/);
});
test('signed-in account renders one header, real local metrics and three uncluttered tabs',async()=>{
 const x=makeView({id:'u1',login:'gamer',display_name:'Gamer'});
 await x.view.renderSettings();
 const html=x.root.innerHTML;
 assert.equal((html.match(/<h1/g)||[]).length,1);
 assert.equal((html.match(/data-account-panel=/g)||[]).length,3);
 assert.equal((html.match(/data-account-tab=/g)||[]).length,3);
 assert.equal((html.match(/swapp-acct-overview-unified/g)||[]).length,1,'one shared overview panel');
 assert.match(html,/<section class="swapp-acct-overview-unified"/);
 assert.match(html,/swapp-acct-unified-grid/);
 assert.match(html,/Mes chaînes favorites/);
 assert.match(html,/Accès rapides/);
 assert.match(html,/<details class="swapp-acct-management" data-swapp-admin-tools hidden>/);
 assert.doesNotMatch(html,/swapp-acct-overview-main|swapp-acct-overview-side|swapp-acct-section-head"><div><span class="swapp-acct-kicker">TES ACTIVITÉS/);
 assert.match(html,/My Channel/);
 assert.match(html,/Minecraft/);
 assert.match(html,/id="planningSettings"/);
 assert.match(html,/id="profileForm"/);
 assert.match(html,/aria-labelledby="swapp-acct-tab-profile"/);
 assert.doesNotMatch(html,/Profil Viewer|Page streamer|settingsGrid|funPlanner|swappViewerReadyCard/);
 assert.deepEqual(x.calls,['planning','forms','foundation']);
 assert.deepEqual(x.panels.map(p=>p.hidden),[false,true,true]);
 x.view.swappAccountTab('stream');
 assert.deepEqual(x.panels.map(p=>p.hidden),[true,true,false]);
 assert.deepEqual(x.buttons.map(b=>b.attributes['aria-selected']),['false','false','true']);
});
test('compact overview styles are scoped and responsive while retaining the shared accent',()=>{
 const stylesheet=css();
 assert.match(stylesheet,/#settings \.swapp-acct-overview-unified\{/);
 assert.match(stylesheet,/#settings \.swapp-acct-unified-grid\{/);
 assert.match(stylesheet,/#settings \.swapp-acct-overview-unified \.swapp-acct-metrics/);
 assert.match(stylesheet,/var\(--swapp-workspace-accent\)/);
 assert.match(stylesheet,/@media\(max-width:480px\)/);
});
test('guest sees working auth route, but never profile settings or streaming controls',async()=>{
 const x=makeView(null);
 await x.view.renderSettings();
 assert.match(x.root.innerHTML,/loginForm/);
 assert.doesNotMatch(x.root.innerHTML,/id="planningSettings"|data-account-panel=|id="profileForm"/);
 assert.deepEqual(x.calls,['forms']);
});
test('planning fields have labels and never collapse into clipped one-line inputs',()=>{
 const s=script(),start=s.indexOf('function renderPlanning(){'),end=s.indexOf('\nasync function logoutOryon()',start);
 const planner=s.slice(start,end);
 for(const id of ['planTitle','planCategory','planTags','planWhen','planningForm','planningList'])
  assert.ok(planner.includes(id),'missing '+id);
 assert.match(planner,/label class="swapp-acct-plan-title"/);
 assert.match(planner,/type="datetime-local" required/);
 assert.doesNotMatch(planner,/toISOString\(\)\.slice\(0,16\)/);
 assert.match(planner,/getFullYear\(\)/);
 assert.match(planner,/const when=parsedWhen\.toISOString\(\)/);
 assert.match(planner,/data-plan-delete/);
 assert.match(planner,/method:'DELETE'/);
 const style=css();
 assert.match(style,/\.swapp-acct-planner\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(style,/\.swapp-acct-planner input\[type=datetime-local\]/);
 assert.match(style,/@media\(max-width:760px\)/);
 assert.match(style,/\.swapp-acct-planner\{grid-template-columns:1fr\}/);
 assert.match(style,/width:100%!important;min-width:0!important/);
});
test('new account code and styling are cache-busted and included in deploy checks',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const smoke=fs.readFileSync(path.join(__dirname,'..','tools/swapp-deploy-smoke.js'),'utf8');
 for(const source of ['index_script.js?v=20261024-native-live-public-v2','swapp-creator-workspace.css?v=20261022-auth-single-v1']){
  assert.ok(html.includes(source),source);
  assert.ok(smoke.includes(source),source);
 }
 assert.match(smoke,/accountScript\.body\.split\('async function renderSettings\(\)\{'\)\.length===2/);
});

test('a legacy history helper cannot add floating account cards after render',()=>{
 const b=script();
 const start=b.indexOf('async function installSettingsHistoryBlock(){');
 const end=b.indexOf('window.swappRefreshSettingsHistoryBlock=installSettingsHistoryBlock',start);
 assert.ok(start>=0&&end>start);
 const logic=b.slice(start,end);
 assert.match(logic,/querySelector\('#swapp-acct-history-settings'\)/);
 assert.doesNotMatch(logic,/insertAdjacentHTML|settingsShell|settingsHero|historyBlockHtml\(status\).*afterend/s);
 assert.match(b,/data-swapp-history-value/);
 assert.match(b,/id="swapp-acct-history-settings"/);
 assert.match(css(),/\.swapp-acct-history-setting\{display:flex/);
});
test('only the active menu uses the same intuitive account navigation, without modes',()=>{
 const b=script();
 const start=b.lastIndexOf('function renderUserMenu(){');
 const end=b.indexOf('\nasync function loadHomeRecommendations()',start);
 assert.ok(start>=0&&end>start);
 const menu=b.slice(start,end);
 for(const action of ['Mon espace SWAPP','Diffuser'])
  assert.ok(menu.includes(action),action);
 assert.doesNotMatch(menu,/Page viewer|Page streamer|modeSwitch|modeBadge/);
 assert.match(menu,/topThemePanel/);
 assert.doesNotMatch(menu,/Mes jeux et envies|Studio administrateur|Gestion Boutique|Fair Discovery|Ma chaîne|Outils créateur/);
 assert.match(account(),/data-swapp-admin-tools/);
 assert.match(account(),/api\/editor\/actus\/access/);
});
