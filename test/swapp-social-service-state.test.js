'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('assets/swapp-social-native/app.js');
const match=app.match(/async function health\(\)\{[\s\S]*?\n\}/);
if(!match)throw new Error('SOCIAL health function missing');

async function checkServiceState({feed,rooms}){
 const label={dataset:{},textContent:'Connexion…',title:''};
 const api=async p=>{
  if(p==='/api/pulse/health'){
   if(!feed)throw Error('render_unavailable');
   return {success:true};
  }
  if(p==='/api/swapp/interactions/status')
   return rooms?{enabled:true,state:'database_read_ready'}:{enabled:true,state:'unavailable'};
  throw Error('unexpected_endpoint');
 };
 const context=vm.createContext({
  api,document:{getElementById:id=>id==='api-state'?label:null},
  AbortController,setTimeout,clearTimeout
 });
 await vm.runInContext(match[0]+'\nhealth()',context);
 return label;
}

test('SOCIAL readiness distinguishes independently healthy backends',async()=>{
 const both=await checkServiceState({feed:true,rooms:true});
 assert.equal(both.dataset.serviceState,'ready');
 assert.equal(both.textContent,'Services joignables');
 assert.match(both.title,/comptes réels/);

 const remoteOnly=await checkServiceState({feed:true,rooms:false});
 assert.equal(remoteOnly.dataset.serviceState,'partial');
 assert.equal(remoteOnly.textContent,'Salons à vérifier');

 const mysqlOnly=await checkServiceState({feed:false,rooms:true});
 assert.equal(mysqlOnly.dataset.serviceState,'partial');
 assert.equal(mysqlOnly.textContent,'Fil indisponible');
 assert.match(mysqlOnly.title,/messages privés/);

 const neither=await checkServiceState({feed:false,rooms:false});
 assert.equal(neither.dataset.serviceState,'offline');
 assert.equal(neither.textContent,'Services indisponibles');
});

test('SOCIAL readiness requests both services and never implies verified post or vocal',()=>{
 assert.match(match[0],/Promise\.allSettled/);
 assert.match(match[0],/probe\('\/api\/pulse\/health'\)/);
 assert.match(match[0],/probe\('\/api\/swapp\/interactions\/status'\)/);
 assert.match(match[0],/6500/);
 assert.doesNotMatch(match[0],/textContent='En ligne'/);
});

test('SWAPP uses versioned service state assets and deploy verifier requires them',()=>{
 const markup=read('modules/swapp-hubs.js');
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(markup,/app\.js\?v=20261019-service-health-v1/);
 assert.match(markup,/social-swapp\.css\?v=20261019-service-health-v1/);
 assert.match(smoke,/SOCIAL service diagnostic JavaScript\/CSS release is stale/);
 assert.match(read('assets/swapp-social-native/social-swapp.css'),/data-service-state="offline"/);
});
