'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('SOCIAL keeps five top-level destinations and two feed tabs',()=>{
 const html=read('assets/swapp-social-native/social-body.html');
 const part=name=>html.match(new RegExp('<nav class="'+name+'"[^>]*>([\\s\\S]*?)<\\/nav>'))?.[1]||'';
 const destinations=section=>[...section.matchAll(/<button[^>]+data-view="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(destinations(part('pulse-nav')),['home','circles','messages','notifications','profile']);
 assert.deepEqual(destinations(part('pulse-mobile-nav')),['home','circles','messages','notifications','profile']);
 assert.deepEqual([...html.matchAll(/class="pulse-tab(?: active)?" data-feed="([^"]+)"/g)].map(x=>x[1]),['following','discover']);
 assert.match(html,/class="swapp-social-header-tools"/);
 assert.match(html,/data-view="explore"/);
 assert.equal((html.match(/id="mobile-compose"/g)||[]).length,1);
});

test('SOCIAL game and room capabilities are reached through Communities',()=>{
 const views=read('assets/swapp-social-native/views.js');
 const next=read('assets/swapp-social-next.js');
 const app=read('assets/swapp-social-native/app.js');
 assert.match(views,/class="pulse-community-shortcuts"/);
 assert.match(views,/data-view="play"/);
 assert.match(views,/data-view="rooms"/);
 assert.match(next,/swapp:social-view/);
 assert.match(app,/addEventListener\('swapp:social-view'/);
});

test('SOCIAL inbox starts with conversations and searches members on demand',()=>{
 const views=read('assets/swapp-social-native/views.js');
 const app=read('assets/swapp-social-native/app.js');
 const css=read('assets/swapp-social-product-v3.css');
 assert.match(views,/class="pulse-inbox-view"/);
 assert.match(views,/data-new-message-toggle/);
 assert.match(views,/id="new-message" hidden/);
 assert.match(views,/class="pulse-conversation-preview"/);
 assert.match(views,/class="pulse-unread-count"/);
 assert.match(app,/\/api\/pulse\/search\?q=/);
 assert.match(app,/dataset\.dmRecipient/);
 assert.match(css,/\.pulse-new-message-form\[hidden\]\{display:none!important\}/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
});

function simulateEntry(url){
 const routes={'/actus':'actus','/decouvrir':'discover','/categories':'categories','/equipes':'teams','/compte':'settings'};
 const path=url.split('?')[0];
 const nodes={};
 for(const id of ['home',...Object.values(routes)]){
  const flags=new Set(id==='home'?['active']:[]);
  nodes[id]={classList:{add:x=>flags.add(x),remove:x=>flags.delete(x),contains:x=>flags.has(x)},querySelector:()=>null};
 }
 const events={},tasks=[];
 const location={pathname:path,search:'?ref=direct',hash:''};
 const history={replaceState(_state,_title,next){location.pathname=next.split('?')[0];this.last=next}};
 const window={setView:async name=>{nodes.home.classList.remove('active');nodes[name].classList.add('active')},
  addEventListener:(name,handler)=>{events[name]=handler}};
 const document={getElementById:id=>nodes[id],addEventListener:(name,handler)=>{events[name]=handler}};
 vm.runInNewContext(read('assets/swapp-route-bootstrap.js'),{
  window,document,location,history,setTimeout:fn=>tasks.push(fn),console
 });
 return {nodes,location,history,events,tasks,view:routes[path]};
}

test('every clean SWAPP entry survives an unintended boot redirect to home',async()=>{
 for(const path of ['/actus','/decouvrir','/categories','/equipes','/compte']){
  const h=simulateEntry(path);
  assert.equal(h.nodes[h.view].classList.contains('active'),true,path);
  assert.equal(h.nodes.home.classList.contains('active'),false,path);
  h.location.pathname='/';
  await h.tasks[0]();
  assert.equal(h.location.pathname,path,path);
  assert.equal(h.history.last,path+'?ref=direct',path);
 }
});

test('clean-route recovery does not undo deliberate user navigation',async()=>{
 const h=simulateEntry('/decouvrir');
 h.events.click({target:{closest:()=>({})}});
 h.location.pathname='/';
 await h.tasks[0]();
 assert.equal(h.location.pathname,'/');
 assert.equal(h.history.last,undefined);
});

test('shared menu is fixed with a matching 68px document offset',()=>{
 const css=read('assets/swapp-unified-nav.css');
 assert.match(css,/body\{padding-top:68px/);
 assert.match(css,/header\.top\{position:fixed!important/);
});
