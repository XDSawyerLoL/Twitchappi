'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {cardSignals}=require('../modules/swapp-servers-card-ui');
const {capacityValue,discordSnapshot,readCardFacts}=require('../modules/swapp-servers-card-facts');
const {renderCategoryPreview,register}=require('../modules/swapp-servers');
const id='a'.repeat(32);
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('rating stars are visible but never populated from unverified numbers',()=>{
 const real=cardSignals({reviewCount:24,ratingAverage:4.9,votes_month:288,clicksTotal:312,
  game:'Rust',capacity:128,lfgCount:3});
 assert.match(real.ratingHtml,/★★★★★/);
 assert.match(real.ratingHtml,/--ss-fill:98%/);
 assert.match(real.ratingHtml,/4,9\/5 · 24 avis/);
 assert.match(real.factsHtml,/128/);
 assert.match(real.factsHtml,/312/);
 assert.match(real.factsHtml,/3/);
 const unknown=cardSignals({game:'Discord / Multigaming'});
 assert.match(unknown.ratingHtml,/--ss-fill:0%/);
 assert.match(unknown.ratingHtml,/Avis indisponibles/);
 assert.match(unknown.factsHtml,/effectif Discord/);
 assert.doesNotMatch(unknown.factsHtml,/1 248|86 en ligne/);
 const knownZero=cardSignals({reviewCount:0,ratingAverage:null,game:'Rust'});
 assert.match(knownZero.ratingHtml,/Aucun avis/);
 assert.match(knownZero.factsHtml,/Non renseignée/);
});
test('capacity is an owner-provided integer, not fabricated current occupancy',()=>{
 assert.equal(capacityValue('128'),128);
 assert.equal(capacityValue(''),null);
 assert.ok(Number.isNaN(capacityValue('12.5')));
 assert.ok(Number.isNaN(capacityValue('-1')));
 assert.ok(Number.isNaN(capacityValue('100001')));
});
test('Discord invite counts are validated, approximate and requested only from fixed Discord API',async()=>{
 const seen=[];
 const response=await discordSnapshot('https://discord.gg/SwappTestCount20261116',{
  now:1000,fetcher:async(url,options)=>{
   seen.push({url,redirect:options.redirect});
   return {ok:true,json:async()=>({code:'SwappTestCount20261116',type:0,
    guild:{id:'123456789012345678'},approximate_member_count:1248,approximate_presence_count:86})};
  }
 });
 assert.deepEqual(response,{discordMembers:1248,discordOnline:86,discordApproximate:true});
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://discord.com/api/v10/invites/SwappTestCount20261116?with_counts=true');
 assert.equal(seen[0].redirect,'error');
 assert.equal(await discordSnapshot('https://untrusted.example/path',{fetcher:async()=>{throw Error('unexpected')}}),null);
});
test('missing optional MySQL specifications never hide a published server',async()=>{
 const db={execute:async(statement)=>{
  if(statement.startsWith('SELECT server_id,capacity'))throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
  if(statement.startsWith('SELECT server_id,COUNT(*) AS active'))throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
  if(statement.startsWith('SELECT server_id,COUNT(*) AS votes_month'))throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
  return [[]];
 }};
 const out=await readCardFacts(db,[{id,website:'',game:'Rust'}],{fetcher:undefined});
 assert.equal(out.has(id),true);
 assert.deepEqual(out.get(id),{});
});
test('real slots, active LFG and votes can be populated individually',async()=>{
 const db={execute:async statement=>{
  if(statement.startsWith('SELECT server_id,capacity'))return [[{server_id:id,capacity:128}]];
  if(statement.startsWith('SELECT server_id,COUNT(*) AS active'))return [[{server_id:id,active:3}]];
  if(statement.startsWith('SELECT server_id,COUNT(*) AS votes_month'))return [[{server_id:id,votes_month:288}]];
  return [[]];
 }};
 const out=await readCardFacts(db,[{id,website:'',game:'Rust'}],{fetcher:undefined});
 assert.deepEqual(out.get(id),{capacity:128,lfgCount:3,votes_month:288});
});
test('SSR card markup stays rich and compact when the JS ranking is blocked',()=>{
 const code=read('modules/swapp-servers.js');
 assert.match(code,/const hydrated=rows\.map\(row=>/);
 assert.match(code,/readCardFacts\(sql,rows\)/);
 assert.match(code,/cardSignals\(item\)/);
 assert.match(code,/ss-card-heading/);
 const client=read('assets/swapp-servers.js');
 assert.match(client,/ss-rating-stars/);
 assert.match(client,/discordMembers/);
 assert.match(client,/lfgCount/);
 const css=read('assets/swapp-servers.css');
 assert.match(css,/SERVEUR \+ V21/);
 assert.match(css,/grid-template-columns:minmax\(260px,35%\) minmax\(0,1fr\)/);
 assert.match(css,/min-height:220px/);
 assert.match(css,/@media\(max-width:520px\)/);
 const form=read('modules/swapp-servers-create.js');
 assert.match(form,/name="capacity"/);
});
