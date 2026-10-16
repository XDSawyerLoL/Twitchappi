'use strict';
const crypto=require('node:crypto');
function createSocialMysqlInteractions({express,restoreSession,pool,clock=()=>Date.now()}){
 const router=express.Router(),bad=(res,msg,status=400)=>res.status(status).json({error:msg});
 const trim=(v,n)=>String(v??'').trim().slice(0,n);
 const query=(sql,args=[])=>pool.execute(sql,args).then(([rows])=>rows);
 router.use(async(req,res,next)=>{
  try{const u=await restoreSession(req,res);const member=req.session?.oryonUser?.id?req.session.oryonUser:u;if(!member?.id||!member?.login)return bad(res,'swapp_account_required',401);req.member={id:String(member.id),handle:trim(member.login,40)};next()}
  catch{return bad(res,'swapp_session_unavailable',503)}
 });
 const route=(method,path,run)=>router[method](path,async(req,res)=>{try{await run(req,res)}catch(e){console.warn('[SOCIAL DB]',e.code||'db_error');if(!res.headersSent)bad(res,'storage_unavailable',503)}});
 const platforms=['PC','PlayStation','Xbox','Switch','Multiplateforme'];
 const pub=m=>({id:m.id,handle:m.handle,game:m.game,platform:m.platform,availability:m.availability,style:m.style,createdAt:Number(m.created_at)});
 route('get','/matches',async(req,res)=>{
  const game=trim(req.query.game,65),platform=trim(req.query.platform,30);
  const rows=await query('SELECT * FROM swapp_social_matches WHERE created_at>? AND game LIKE ? AND platform LIKE ? ORDER BY created_at DESC LIMIT 100',[clock()-14*86400000,'%'+game.replace(/[\\%_]/g,'\\$&')+'%',platform||'%']);
  res.json({matches:rows.map(pub)});
 });
 route('post','/matches',async(req,res)=>{
  const {game,platform,availability,style}=req.body||{},now=clock();
  if(!trim(game,65)||!platforms.includes(platform)||!trim(availability,65))return bad(res,'invalid_match');
  const recent=await query('SELECT id FROM swapp_social_matches WHERE user_id=? AND created_at>? LIMIT 1',[req.member.id,now-60000]);
  if(recent.length)return bad(res,'rate_limited',429);
  const m={id:crypto.randomUUID(),userId:req.member.id,handle:req.member.handle,game:trim(game,65),platform,availability:trim(availability,65),style:trim(style,50),createdAt:now};
  await query('INSERT INTO swapp_social_matches (id,user_id,handle,game,platform,availability,style,created_at) VALUES (?,?,?,?,?,?,?,?)',[m.id,m.userId,m.handle,m.game,m.platform,m.availability,m.style,now]);
  res.status(201).json({match:{id:m.id,handle:m.handle,game:m.game,platform:m.platform,availability:m.availability,style:m.style,createdAt:now}});
 });
 route('get','/matches/compatible',async(req,res)=>{
  const mine=await query('SELECT * FROM swapp_social_matches WHERE user_id=? ORDER BY created_at DESC LIMIT 1',[req.member.id]);
  if(!mine.length)return res.json({matches:[],reason:'create_match_first'});
  const own=mine[0];
  const others=await query('SELECT * FROM swapp_social_matches WHERE user_id<>? AND created_at>? AND LOWER(game)=LOWER(?) ORDER BY created_at DESC LIMIT 150',[req.member.id,clock()-14*86400000,own.game]);
  res.json({matches:others.map(m=>({...pub(m),score:70+(m.platform===own.platform||m.platform==='Multiplateforme'||own.platform==='Multiplateforme'?20:0)+(m.style===own.style?10:0)})).sort((a,b)=>b.score-a.score||b.createdAt-a.createdAt).slice(0,30)});
 });
 route('get','/polls',async(req,res)=>{
  const polls=await query('SELECT * FROM swapp_social_polls ORDER BY created_at DESC LIMIT 40');
  const ids=polls.map(p=>p.id);
  const votes=ids.length?await query('SELECT poll_id,choice_index,COUNT(*) total FROM swapp_social_votes WHERE poll_id IN ('+ids.map(()=>'?').join(',')+') GROUP BY poll_id,choice_index',ids):[];
  res.json({polls:polls.map(p=>{const choices=typeof p.choices_json==='string'?JSON.parse(p.choices_json):p.choices_json;return {id:p.id,question:p.question,choices,counts:choices.map((_,i)=>Number(votes.find(v=>v.poll_id===p.id&&v.choice_index===i)?.total||0)),createdAt:Number(p.created_at)}})});
 });
 route('post','/polls',async(req,res)=>{
  const question=trim(req.body?.question,120),choices=req.body?.choices;
  if(question.length<5||!Array.isArray(choices)||choices.length<2||choices.length>5||choices.some(c=>!trim(c,80))||new Set(choices.map(c=>trim(c,80).toLowerCase())).size!==choices.length)return bad(res,'invalid_poll');
  const now=clock(),latest=await query('SELECT id FROM swapp_social_polls WHERE owner_id=? AND created_at>? LIMIT 1',[req.member.id,now-60000]);
  if(latest.length)return bad(res,'rate_limited',429);
  const id=crypto.randomUUID();await query('INSERT INTO swapp_social_polls (id,owner_id,question,choices_json,created_at) VALUES (?,?,?,?,?)',[id,req.member.id,question,JSON.stringify(choices.map(c=>trim(c,80))),now]);
  res.status(201).json({id});
 });
 route('post','/polls/:id/vote',async(req,res)=>{
  const polls=await query('SELECT choices_json FROM swapp_social_polls WHERE id=? LIMIT 1',[req.params.id]);
  if(!polls.length)return bad(res,'not_found',404);
  const choices=typeof polls[0].choices_json==='string'?JSON.parse(polls[0].choices_json):polls[0].choices_json;
  const choice=req.body?.choice;
  if(!Number.isInteger(choice)||choice<0||choice>=choices.length)return bad(res,'invalid_choice');
  try{await query('INSERT INTO swapp_social_votes (poll_id,user_id,choice_index) VALUES (?,?,?)',[req.params.id,req.member.id,choice])}
  catch(e){if(e.code==='ER_DUP_ENTRY')return bad(res,'already_voted',409);throw e}
  const votes=await query('SELECT choice_index,COUNT(*) total FROM swapp_social_votes WHERE poll_id=? GROUP BY choice_index',[req.params.id]);
  res.json({counts:choices.map((_,i)=>Number(votes.find(v=>v.choice_index===i)?.total||0))});
 });
 route('get','/rooms',async(req,res)=>{
  const rooms=await query('SELECT r.id,r.name,r.game,r.created_at,(SELECT COUNT(*) FROM swapp_social_room_messages m WHERE m.room_id=r.id) message_count FROM swapp_social_rooms r ORDER BY r.created_at DESC LIMIT 40');
  res.json({rooms:rooms.map(r=>({id:r.id,name:r.name,game:r.game,createdAt:Number(r.created_at),messageCount:Number(r.message_count)}))});
 });
 route('post','/rooms',async(req,res)=>{
  const name=trim(req.body?.name,60),game=trim(req.body?.game,65),now=clock();
  if(name.length<3||!game)return bad(res,'invalid_room');
  const recent=await query('SELECT id FROM swapp_social_rooms WHERE owner_id=? AND created_at>? LIMIT 1',[req.member.id,now-60000]);
  if(recent.length)return bad(res,'rate_limited',429);
  const id=crypto.randomUUID();await query('INSERT INTO swapp_social_rooms (id,owner_id,name,game,created_at) VALUES (?,?,?,?,?)',[id,req.member.id,name,game,now]);
  res.status(201).json({room:{id,name,game}});
 });
 route('get','/rooms/:id/messages',async(req,res)=>{
  const rooms=await query('SELECT id FROM swapp_social_rooms WHERE id=? LIMIT 1',[req.params.id]);if(!rooms.length)return bad(res,'not_found',404);
  const messages=await query('SELECT id,handle,body,created_at FROM swapp_social_room_messages WHERE room_id=? ORDER BY created_at DESC LIMIT 100',[req.params.id]);
  res.json({messages:messages.reverse().map(m=>({id:m.id,handle:m.handle,body:m.body,createdAt:Number(m.created_at)}))});
 });
 route('post','/rooms/:id/messages',async(req,res)=>{
  const body=trim(req.body?.body,160);if(!body)return bad(res,'invalid_message');
  const rooms=await query('SELECT id FROM swapp_social_rooms WHERE id=? LIMIT 1',[req.params.id]);if(!rooms.length)return bad(res,'not_found',404);
  const now=clock(),recent=await query('SELECT id FROM swapp_social_room_messages WHERE room_id=? AND user_id=? AND created_at>? LIMIT 1',[req.params.id,req.member.id,now-1000]);if(recent.length)return bad(res,'rate_limited',429);
  const id=crypto.randomUUID();
  await query('INSERT INTO swapp_social_room_messages (id,room_id,user_id,handle,body,created_at) VALUES (?,?,?,?,?,?)',[id,req.params.id,req.member.id,req.member.handle,body,now]);
  res.status(201).json({message:{id,handle:req.member.handle,body,createdAt:now}});
 });
 return router;
}
module.exports={createSocialMysqlInteractions};
