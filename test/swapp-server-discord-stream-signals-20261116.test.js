'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {twitchStream,extractPresence,approvedCreatorRows,applyPresence,readDiscordStreamers,
 isOptedIn,setOptIn,createPresenceBridge}=require('../modules/swapp-discord-streamer-signals');
const {registerCommunity,renderCommunityPanels}=require('../modules/swapp-servers-community');
const ID='a'.repeat(32),GUILD='123456789012345678',DISCORD='234567890123456789';
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Streamer Mode is never mistaken for a valid Streaming activity',()=>{
 assert.equal(twitchStream({type:0,url:'https://www.twitch.tv/caster'}),null);
 assert.equal(twitchStream({type:1,url:'https://evil.example/live'}),null);
 assert.equal(twitchStream({type:1,url:'http://www.twitch.tv/caster'}),null);
 assert.equal(twitchStream({type:1,url:'https://www.twitch.tv@evil.example/caster'}),null);
 assert.equal(twitchStream({type:1,url:'https://www.twitch.tv/caster?secret=1'}),null);
 assert.deepEqual(twitchStream({type:1,url:'https://www.twitch.tv/Actual_Caster'}),{
  platform:'twitch',login:'actual_caster',url:'https://www.twitch.tv/actual_caster'});
 assert.equal(extractPresence({guild_id:'not-a-guild',user:{id:DISCORD}}),null);
 assert.deepEqual(extractPresence({guild_id:GUILD,user:{id:DISCORD},activities:[{type:1,url:'https://twitch.tv/actual_caster'}]}),{
  guildId:GUILD,discordId:DISCORD,
  stream:{platform:'twitch',login:'actual_caster',url:'https://www.twitch.tv/actual_caster'}});
});
test('absence of bot credentials keeps the gateway disabled without extra network calls',()=>{
 const bridge=createPresenceBridge({env:{},getDatabase:async()=>{throw Error('must not connect')}});
 assert.equal(bridge.enabled,false);assert.equal(bridge.start(),false);bridge.stop();
});
test('approved creator lookup requires guild, explicit consent, and Twitch approval',async()=>{
 const seen=[];
 const sql={execute:async(query,args)=>{seen.push({query,args});return [[{server_id:ID,creator_login:'actual_caster'}]]}};
 const rows=await approvedCreatorRows(sql,'user-swapp',GUILD);
 assert.equal(rows.length,1);
 assert.match(seen[0].query,/JOIN swapp_server_discord_stream_optin o/);
 assert.match(seen[0].query,/x\.discord_guild_id=\?/);
 assert.match(seen[0].query,/c\.status="approved"/);
 assert.match(seen[0].query,/c\.platform="twitch"/);
 assert.deepEqual(seen[0].args,['user-swapp',GUILD]);
});
test('only an approved matching channel generates a short-lived streaming signal',async()=>{
 const calls=[];
 const sql={execute:async(q,args)=>{
  calls.push({q,args});
  if(q.includes('SELECT c.server_id'))return [[{server_id:ID,creator_login:'actual_caster'}]];
  return [[{affectedRows:1}]];
 }};
 await applyPresence(sql,{guildId:GUILD,userId:'user-swapp',stream:{login:'actual_caster'}});
 const insert=calls.find(c=>c.q.startsWith('INSERT INTO swapp_server_discord_stream_presence'));
 assert.ok(insert);
 assert.match(insert.q,/INTERVAL 2 MINUTE/);
 assert.ok(insert.args.includes(ID));
 calls.length=0;
 await applyPresence(sql,{guildId:GUILD,userId:'user-swapp',stream:{login:'different_caster'}});
 assert.ok(calls.some(c=>c.q.startsWith('DELETE FROM swapp_server_discord_stream_presence')));
 assert.ok(!calls.some(c=>c.q.startsWith('INSERT INTO swapp_server_discord_stream_presence')));
});
test('creator can deactivate consent and remove any previously recorded signals',async()=>{
 const calls=[];
 const sql={query:async q=>{calls.push(q);return[]},
  execute:async(q)=>{calls.push(q);return[[]]}};
 await setOptIn(sql,ID,'user-swapp',true);
 assert.ok(calls.some(q=>q.startsWith('CREATE TABLE IF NOT EXISTS swapp_server_discord_stream_optin')));
 assert.ok(calls.some(q=>q.startsWith('INSERT INTO swapp_server_discord_stream_optin')));
 calls.length=0;
 await setOptIn(sql,ID,'user-swapp',false);
 assert.ok(calls.some(q=>q.startsWith('DELETE FROM swapp_server_discord_stream_optin')));
 assert.ok(calls.some(q=>q.startsWith('DELETE FROM swapp_server_discord_stream_presence')));
 assert.equal(await isOptedIn({execute:async()=>[[]]},ID,'user-swapp'),false);
});
test('public API only exposes fresh, approved creator usernames—not Discord identity IDs',async()=>{
 const sql={execute:async()=>[[{login:'actual_caster',seenAt:'2026-11-16 00:00:00'}]]};
 const signal=await readDiscordStreamers(sql,ID);
 assert.equal(signal.available,true);
 assert.deepEqual(signal.items[0],{platform:'twitch',login:'actual_caster',
  source:'Discord · activité Streaming',signal:'discord_streaming'});
 assert.ok(!JSON.stringify(signal).includes(DISCORD));
 const missing=await readDiscordStreamers({execute:async()=>{throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'})}},ID);
 assert.deepEqual(missing,{items:[],available:false});
});
test('DOM keeps Discord presence separate from independently verified live broadcasts',()=>{
 const html=renderCommunityPanels({id:ID});
 assert.match(html,/id="ss-discord-stream-optin"/);
 assert.match(html,/activité Streaming/);
 const js=read('assets/swapp-servers-community.js');
 assert.match(js,/ss-community-discord-badge/);
 assert.match(js,/STREAMING SUR DISCORD/);
 assert.match(js,/Le direct n’est pas encore confirmé/);
 assert.match(js,/signalOnly/);
 assert.match(js,/creatorAction\('\/discord-stream\/opt-in'/);
});
test('opt-in endpoint refuses Twitch-only sessions or users without approved associations',async()=>{
 const routes=new Map();
 const app={get:(url,...fns)=>routes.set('GET '+url,fns.at(-1)),
  post:(url,...fns)=>routes.set('POST '+url,fns.at(-1))};
 const sql={query:async()=>[],
  execute:async query=>{
   if(query.startsWith('SELECT id,owner_id FROM swapp_game_servers'))return [[{id:ID,owner_id:'owner'}]];
   if(query.startsWith('SELECT 1 AS allowed FROM swapp_server_creators'))return [[]];
   if(query.startsWith('SELECT discord_guild_id FROM swapp_game_server_extras'))return [[{discord_guild_id:GUILD}]];
   return [[]];
  }};
 registerCommunity(app,{getDatabase:async()=>sql,account:r=>r.session?.oryonUser?.id||r.session?.twitchUser?.id||'',ownerKeys:()=>['owner'],originGuard:()=>true});
 const handler=routes.get('POST /api/swapp/serveurs/:id/discord-stream/opt-in');
 const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},set(){return this},json(d){this.body=d;return this}});
 const twitchOnly=res();
 await handler({params:{id:ID},session:{twitchUser:{id:'twitch-only'}},body:{enabled:true}},twitchOnly);
 assert.equal(twitchOnly.statusCode,403);
 const notApproved=res();
 await handler({params:{id:ID},session:{oryonUser:{id:'actual'}},body:{enabled:true}},notApproved);
 assert.equal(notApproved.statusCode,403);
});
