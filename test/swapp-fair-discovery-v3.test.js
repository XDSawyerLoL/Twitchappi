'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFairMetrics}=require('../modules/swapp-fair-metrics');
const {summarizeFairAdmin}=require('../modules/swapp-fair-admin');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const key='stable-secret-for-fair-v3-with-over-thirty-two-characters';
const item={platform:'twitch',login:'verifiedgamer',game_name:'Fortnite',viewer_count:9};
function mock(){
 const SQL=[];
 const pool={
  async query(query){SQL.push({query,args:[]});return [[]]},
  async execute(query,args){SQL.push({query,args});return [[]]}
 };
 let at=Date.UTC(2026,9,19,12,0,0);
 const fair=createFairMetrics({secret:key,now:()=>at,getPool:()=>pool,isEnabled:()=>true});
 return {fair,SQL,advance:ms=>{at+=ms}};
}
test('home, discover and game each receive a distinct validated server proof',()=>{
 const {fair}=mock();
 const raw=['game','home','discover'].map(placement=>fair.issue(item,{placement}));
 assert.equal(new Set(raw).size,3);
 assert.deepEqual(raw.map(x=>fair.verify(x).p),['game','home','discover']);
 assert.equal(fair.issue(item,{placement:'followed'}),'');
 assert.equal(fair.issue(item,{placement:'paid'}),'');
 const decoded=JSON.stringify(fair.verify(raw[1]));
 for(const field of ['visitor','session','device','ip','email','cookie','userId'])
  assert.doesNotMatch(decoded,new RegExp('"'+field+'"','i'));
});
test('signed placement controls MySQL aggregation; changing placement invalidates HMAC',async()=>{
 const {fair,SQL,advance}=mock();
 const proof=fair.issue(item,{placement:'discover'});
 const result=await fair.record(proof,'impression');
 assert.deepEqual(result,{ok:true,status:202});
 assert.ok(SQL.some(x=>x.query.includes('INSERT INTO swapp_fair_exposure_daily')
  && x.args[0]==='discover'&&x.args[3]==='Fortnite'));
 const [head,signature]=proof.split('.');
 const tampered=Buffer.from(JSON.stringify({...fair.verify(proof),p:'home'})).toString('base64url')+'.'+signature;
 assert.equal(fair.verify(tampered),null);
 advance(46*60*1000);
 assert.equal(fair.verify(proof),null);
});
test('off switch prevents any token or event when Fair Discovery is disabled',async()=>{
 const fair=createFairMetrics({secret:key,isEnabled:()=>false,getPool:()=>({})});
 assert.equal(fair.issue(item,{placement:'home'}),'');
 assert.deepEqual(await fair.record('bad','impression'),{ok:false,status:503});
});
test('existing Discover relevance and homepage ranking remain intact and proofs reuse responses',()=>{
 const server=read('server.js');
 const discover=server.slice(server.indexOf("app.get('/api/oryon/discover/find-live'"),server.indexOf('function getFirstSupportPayload('));
 const home=server.slice(server.indexOf("app.get('/api/discovery/home-lives'"),server.indexOf("app.get('/api/discovery/game-lives'"));
 assert.match(discover,/diversifyDiscovery\(scored,/);
 assert.match(discover,/query:q,firstScreen:12,perGame:2/);
 assert.match(discover,/fairMetrics\.issue\(item,\{placement:'discover'\}\)/);
 assert.match(home,/rankHomeLives\(out,\{limit\}\)/);
 assert.match(home,/fairMetrics\.issue\(item,\{placement:'home'\}\)/);
 assert.match(discover,/items: reportable/);
 assert.match(home,/items: reportable/);
 assert.doesNotMatch(discover,/INSERT INTO swapp_fair_exposure_daily/);
});
test('SPA cards carry only already signed proofs and render no separate homepage module',()=>{
 const spa=read('index_script.js');
 assert.match(spa,/homeLiveCard1014" \$\{\/\^\[A-Za-z0-9_-\]\{30,500\}/);
 assert.match(spa,/id="v4SwipeCard" class="v4Card" \$\{\/\^\[A-Za-z0-9_-\]\{30,500\}/);
 assert.match(spa,/data-swapp-fair-proof="\$\{safe\(n\.raw\.fairProof\)\}"/);
 assert.match(spa,/data-swapp-fair-proof="\$\{H\(x\.fairProof\)\}"/);
 const client=read('assets/swapp-fair-v3.js');
 assert.match(client,/homeLiveCard1014\[data-swapp-fair-proof\]/);
 assert.match(client,/v4SwipeCard\[data-swapp-fair-proof\]/);
 assert.match(client,/IntersectionObserver/);
 assert.match(client,/entry\.intersectionRatio<\.5/);
 assert.match(client,/},1250\)/);
 assert.match(client,/getBoundingClientRect\(\)\.width>0/);
 assert.match(client,/active:true/);
 assert.doesNotMatch(client,/Mesure équitable/);
 assert.match(client,/credentials:'omit',keepalive:true/);
 assert.match(client,/if\(!root\|\|inactive\)/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|sendBeacon|window\.fetch\s*=|getItem\(|\.cookie/i);
});
test('admin surface filtering keeps consented samples segregated',()=>{
 const admin=read('modules/swapp-fair-admin.js');
 const client=read('assets/swapp-fair-admin.js');
 assert.match(admin,/option value="all" selected>Tous/);
 assert.match(admin,/option value="home">Accueil/);
 assert.match(admin,/option value="discover">Découvrir/);
 assert.match(admin,/option value="game">Fiches de jeux/);
 assert.ok(admin.includes("if(!['all','game','home','discover'].includes(placement))"));
 assert.match(admin,/placement==='all'\?\[\]:\[placement\]/);
 assert.match(admin,/AND placement=\?/);
 assert.match(client,/id\('placement'\)\.addEventListener\('change',refresh\)/);
 assert.match(client,/placement='\+id\('placement'\)\.value/);
 const insufficient=summarizeFairAdmin({placement:'all',uniqueCreators:2,bands:[
  {audience_band:'small',impressions:100,creators:1},
  {audience_band:'established',impressions:100,creators:1}
 ]});
 assert.equal(insufficient.sample,'insufficient');
 assert.equal(insufficient.scope,'all-card-aggregate');
});
test('release contains new first-party assets with no added paid workflow',()=>{
 const html=read('index.html'),release=read('tools/swapp-release.js');
 assert.match(html,/swapp-fair-v3\.js\?v=20261021-auto-anonymous-v1/);
 assert.match(html,/swapp-fair-v3\.css\?v=20261021-auto-anonymous-v1/);
 assert.match(release,/assets\/swapp-fair-v3\.js/);
 assert.match(release,/assets\/swapp-fair-v3\.css/);
 assert.equal(fs.existsSync(path.join(__dirname,'..','.github/workflows/swapp-quality.yml')),false);
});
