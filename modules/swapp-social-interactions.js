'use strict';
// SWAPP SOCIAL experimental interactions. Local persistent storage, not MySQL.
// Single-process use only. Set SWAPP_SOCIAL_FEATURES=1 to enable endpoints.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function createSocialInteractions({express,restoreSession,filename=process.env.SWAPP_SOCIAL_DATA_FILE||path.join(process.cwd(),'data','swapp-social-interactions.json'),clock=()=>Date.now()}){
 const router=express.Router();
 let data={matches:[],polls:[],rooms:[]},chain=Promise.resolve();
 try{const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));if(parsed&&Array.isArray(parsed.matches)&&Array.isArray(parsed.polls)&&Array.isArray(parsed.rooms))data=parsed}catch(e){if(e.code!=='ENOENT')throw e}
 const safe=x=>String(x||'').trim().slice(0,160);
 const id=()=>crypto.randomUUID();
 const bad=(res,message,status=400)=>res.status(status).json({error:message});
 function persist(){
  const saved=JSON.stringify(data);
  chain=chain.catch(()=>{}).then(async()=>{await fs.promises.mkdir(path.dirname(filename),{recursive:true});const tmp=filename+'.'+process.pid+'.tmp';await fs.promises.writeFile(tmp,saved,{mode:0o600});await fs.promises.rename(tmp,filename)});
  return chain;
 }
 async function auth(req,res,next){
  try{const user=await restoreSession(req,res);const found=req.session?.oryonUser||user;if(!found?.id||!found?.login)return bad(res,'swapp_account_required',401);req.socialMember={id:String(found.id),handle:String(found.login).slice(0,40)};next()}
  catch{return bad(res,'swapp_session_unavailable',503)}
 }
 function publicMatch(m){return {id:m.id,game:m.game,platform:m.platform,availability:m.availability,style:m.style,createdAt:m.createdAt,handle:m.handle}}
 const validGame=x=>safe(x).slice(0,65);
 router.get('/matches',auth,(req,res)=>{
  const game=validGame(req.query.game).toLowerCase();
  const platform=safe(req.query.platform).toLowerCase();
  let list=data.matches.filter(m=>m.createdAt>clock()-14*86400000);
  if(game)list=list.filter(m=>m.game.toLowerCase().includes(game));
  if(platform)list=list.filter(m=>m.platform.toLowerCase()===platform);
  res.json({matches:list.slice(-100).reverse().map(publicMatch)});
 });
 router.post('/matches',auth,async(req,res)=>{
  const {game,platform,availability,style}=req.body||{};
  if(!validGame(game)||!['PC','PlayStation','Xbox','Switch','Multiplateforme'].includes(platform)||!safe(availability))return bad(res,'invalid_match');
  const now=clock();if(data.matches.some(m=>m.userId===req.socialMember.id&&m.createdAt>now-60000))return bad(res,'rate_limited',429);
  const m={id:id(),userId:req.socialMember.id,handle:req.socialMember.handle,game:validGame(game),platform,availability:safe(availability).slice(0,65),style:safe(style).slice(0,50),createdAt:now};
  data.matches.push(m);data.matches=data.matches.filter(x=>x.createdAt>now-14*86400000).slice(-1000);
  try{await persist();res.status(201).json({match:publicMatch(m)})}catch{return bad(res,'storage_unavailable',503)}
 });
 router.get('/matches/compatible',auth,(req,res)=>{
  const own=data.matches.filter(m=>m.userId===req.socialMember.id).at(-1);
  if(!own)return res.json({matches:[],reason:'create_match_first'});
  const matches=data.matches.filter(m=>m.userId!==own.userId&&m.createdAt>clock()-14*86400000)
   .map(m=>({...publicMatch(m),score:(m.game.toLowerCase()===own.game.toLowerCase()?70:0)+(m.platform===own.platform||m.platform==='Multiplateforme'||own.platform==='Multiplateforme'?20:0)+(m.style===own.style?10:0)}))
   .filter(m=>m.score>=70).sort((a,b)=>b.score-a.score||b.createdAt-a.createdAt).slice(0,30);
  res.json({matches});
 });
 router.get('/polls',auth,(req,res)=>res.json({polls:data.polls.slice(-40).reverse().map(p=>({id:p.id,question:p.question,choices:p.choices,counts:p.choices.map((_,i)=>Object.values(p.votes).filter(v=>v===i).length),createdAt:p.createdAt}))}));
 router.post('/polls',auth,async(req,res)=>{
  const question=safe(req.body?.question).slice(0,120),choices=(req.body?.choices||[]).map(safe).map(x=>x.slice(0,80));
  if(question.length<5||choices.length<2||choices.length>5||choices.some(x=>!x)||new Set(choices.map(x=>x.toLowerCase())).size!==choices.length)return bad(res,'invalid_poll');
  const now=clock();if(data.polls.some(p=>p.ownerId===req.socialMember.id&&p.createdAt>now-60000))return bad(res,'rate_limited',429);
  const p={id:id(),ownerId:req.socialMember.id,question,choices,votes:{},createdAt:now};data.polls.push(p);data.polls=data.polls.slice(-500);
  try{await persist();res.status(201).json({id:p.id})}catch{return bad(res,'storage_unavailable',503)}
 });
 router.post('/polls/:id/vote',auth,async(req,res)=>{
  const p=data.polls.find(x=>x.id===req.params.id),choice=Number(req.body?.choice);
  if(!p)return bad(res,'not_found',404);if(!Number.isInteger(choice)||choice<0||choice>=p.choices.length)return bad(res,'invalid_choice');
  if(Object.hasOwn(p.votes,req.socialMember.id))return bad(res,'already_voted',409);
  p.votes[req.socialMember.id]=choice;
  try{await persist();res.json({counts:p.choices.map((_,i)=>Object.values(p.votes).filter(v=>v===i).length)})}catch{return bad(res,'storage_unavailable',503)}
 });
 router.get('/rooms',auth,(req,res)=>res.json({rooms:data.rooms.slice(-40).reverse().map(r=>({id:r.id,name:r.name,game:r.game,createdAt:r.createdAt,messageCount:r.messages.length}))}));
 router.post('/rooms',auth,async(req,res)=>{
  const name=safe(req.body?.name).slice(0,60),game=validGame(req.body?.game);
  if(name.length<3||!game)return bad(res,'invalid_room');
  if(data.rooms.some(r=>r.ownerId===req.socialMember.id&&r.createdAt>clock()-60000))return bad(res,'rate_limited',429);
  const r={id:id(),ownerId:req.socialMember.id,name,game,createdAt:clock(),messages:[]};data.rooms.push(r);data.rooms=data.rooms.slice(-150);
  try{await persist();res.status(201).json({room:{id:r.id,name:r.name,game:r.game}})}catch{return bad(res,'storage_unavailable',503)}
 });
 router.get('/rooms/:id/messages',auth,(req,res)=>{
  const r=data.rooms.find(x=>x.id===req.params.id);if(!r)return bad(res,'not_found',404);
  res.json({messages:r.messages.slice(-100)});
 });
 router.post('/rooms/:id/messages',auth,async(req,res)=>{
  const r=data.rooms.find(x=>x.id===req.params.id),body=safe(req.body?.body).slice(0,160);
  if(!r)return bad(res,'not_found',404);if(!body)return bad(res,'invalid_message');
  if(r.messages.some(m=>m.userId===req.socialMember.id&&m.createdAt>clock()-1000))return bad(res,'rate_limited',429);
  const m={id:id(),userId:req.socialMember.id,handle:req.socialMember.handle,body,createdAt:clock()};r.messages.push(m);r.messages=r.messages.slice(-250);
  try{await persist();res.status(201).json({message:m})}catch{return bad(res,'storage_unavailable',503)}
 });
 return router;
}
module.exports={createSocialInteractions};
