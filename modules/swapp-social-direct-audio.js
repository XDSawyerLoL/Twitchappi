'use strict';
// SWAPP SOCIAL audio notes: binary storage in the existing MySQL connection.
// Authenticated, first-party, size-limited, not publicly addressable.
const crypto=require('node:crypto');
const MAX_BYTES=768*1024,MAX_DURATION=30,RETENTION_DAYS=30;
const MIME=new Set(['audio/webm','audio/ogg','audio/mp4']);
const ID=/^[a-f0-9-]{36}$/i;
const HANDLE=/^[a-z0-9_-]{3,40}$/i;
const now=()=>Date.now();

function sniff(buffer,mime){
 if(!Buffer.isBuffer(buffer)||buffer.length<16)return false;
 if(mime==='audio/webm')return buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
 if(mime==='audio/ogg')return buffer.toString('ascii',0,4)==='OggS';
 if(mime==='audio/mp4')return buffer.toString('ascii',4,8)==='ftyp';
 return false;
}
function createDirectAudioRouter({express,restoreSession,getPool,lookupLocalUser}){
 if(!express||typeof restoreSession!=='function'||typeof getPool!=='function'||typeof lookupLocalUser!=='function')
  throw Error('swapp_direct_audio_configuration');
 const router=express.Router();
 const fail=(res,error,status=400)=>res.status(status).json({error});
 const safeWrite=req=>{
  const origin=String(req.get('origin')||'');
  return origin==='https://swapp.tv'||origin==='https://www.swapp.tv'||
   (process.env.NODE_ENV!=='production'&&/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin));
 };
 router.use(async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  if(!['GET','HEAD'].includes(req.method)&&!safeWrite(req))return fail(res,'invalid_origin',403);
  if(!getPool())return fail(res,'social_storage_unavailable',503);
  try{
   const restored=await restoreSession(req,res,{allowUserRecovery:false});
   const user=req.session?.oryonUser?.id?req.session.oryonUser:restored;
   if(!user?.id||!user?.login)return fail(res,'swapp_account_required',401);
   req.directAudioUser={id:String(user.id),handle:String(user.login).toLowerCase()};
   next();
  }catch{return fail(res,'swapp_session_unavailable',503)}
 });
 const run=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){
  console.warn('[SWAPP DIRECT AUDIO]',String(e?.code||'database_error'));
  if(!res.headersSent)fail(res,'storage_unavailable',503);
 }};
 const recipient=handle=>{
  const h=String(handle||'').toLowerCase();
  if(!HANDLE.test(h))return null;
  const u=lookupLocalUser(h);
  return u?.id&&String(u.login).toLowerCase()===h?{id:String(u.id),handle:h}:null;
 };
 const query=(sql,args=[])=>getPool().execute(sql,args).then(([rows])=>rows);
 // Expired audio becomes inaccessible at 30 days. Periodically delete its
 // binary rows too, rather than merely hiding files from the user interface.
 const PRUNE_EVERY=6*60*60*1000;
 let lastPrune=0;
 async function prune(){
  const stamp=now(),pool=getPool();
  if(!pool||stamp-lastPrune<PRUNE_EVERY)return;
  lastPrune=stamp;
  try{await pool.execute('DELETE FROM swapp_social_voice_notes WHERE created_at<? LIMIT 500',
   [stamp-RETENTION_DAYS*86400000]);}
  catch{lastPrune=0}
 }
 const pruneTimer=setInterval(()=>{void prune()},PRUNE_EVERY);
 pruneTimer.unref?.();

 const publicNote=row=>({
  id:row.id,from:row.sender_handle,to:row.recipient_handle,
  fromMe:false,createdAt:new Date(Number(row.created_at)).toISOString(),
  duration:Math.min(MAX_DURATION,Math.max(1,Number(row.duration_seconds)||1)),
  mime:row.mime,bytes:Number(row.byte_length)
 });
 router.get('/notes',run(async(req,res)=>{
  void prune();
  const peer=recipient(req.query.peer);
  if(!peer)return fail(res,'not_found',404);
  const me=req.directAudioUser;
  const rows=await query(
   'SELECT id,sender_id,recipient_id,sender_handle,recipient_handle,mime,duration_seconds,byte_length,created_at FROM swapp_social_voice_notes WHERE created_at>=? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY created_at DESC LIMIT 100',
   [now()-RETENTION_DAYS*86400000,me.id,peer.id,peer.id,me.id]
  );
  res.json({notes:rows.reverse().map(row=>({...publicNote(row),fromMe:row.sender_id===me.id}))});
 }));
 router.post('/notes/:handle',express.raw({type:['audio/webm','audio/ogg','audio/mp4'],limit:MAX_BYTES}),run(async(req,res)=>{
  void prune();
  const me=req.directAudioUser,peer=recipient(req.params.handle);
  if(!peer||peer.id===me.id)return fail(res,'invalid_recipient',400);
  const mime=String(req.get('content-type')||'').split(';')[0].toLowerCase().trim();
  const seconds=Number(req.get('x-swapp-audio-duration'));
  if(!MIME.has(mime)||!sniff(req.body,mime))return fail(res,'invalid_audio',415);
  if(req.body.length>MAX_BYTES)return fail(res,'audio_too_large',413);
  if(!Number.isInteger(seconds)||seconds<1||seconds>MAX_DURATION)return fail(res,'invalid_duration');
  const stamp=now();
  const recent=await query('SELECT id FROM swapp_social_voice_notes WHERE sender_id=? AND created_at>? LIMIT 1',[me.id,stamp-10000]);
  if(recent.length)return fail(res,'rate_limited',429);
  const daily=await query('SELECT COUNT(*) AS total FROM swapp_social_voice_notes WHERE sender_id=? AND created_at>?',[me.id,stamp-86400000]);
  if(Number(daily[0]?.total)>=120)return fail(res,'rate_limited',429);
  const id=crypto.randomUUID();
  await query(
   'INSERT INTO swapp_social_voice_notes (id,sender_id,recipient_id,sender_handle,recipient_handle,mime,duration_seconds,byte_length,audio_data,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
   [id,me.id,peer.id,me.handle,peer.handle,mime,seconds,req.body.length,req.body,stamp]
  );
  res.status(201).json({note:{id,createdAt:new Date(stamp).toISOString(),duration:seconds,mime,bytes:req.body.length,from:me.handle,to:peer.handle,fromMe:true}});
 }));
 router.get('/media/:id',run(async(req,res)=>{
  const id=String(req.params.id||'');
  if(!ID.test(id))return fail(res,'not_found',404);
  const rows=await query('SELECT mime,audio_data,byte_length FROM swapp_social_voice_notes WHERE id=? AND created_at>=? AND (sender_id=? OR recipient_id=?) LIMIT 1',
   [id,now()-RETENTION_DAYS*86400000,req.directAudioUser.id,req.directAudioUser.id]);
  if(!rows.length)return fail(res,'not_found',404);
  const data=rows[0].audio_data;
  if(!Buffer.isBuffer(data))return fail(res,'storage_unavailable',503);
  res.set('Content-Type',rows[0].mime);
  res.set('Content-Disposition','inline; filename="message-vocal"');
  res.set('Accept-Ranges','none');
  res.set('Content-Length',String(data.length));
  res.end(data);
 }));
 router.delete('/notes/:id',run(async(req,res)=>{
  const id=String(req.params.id||'');
  if(!ID.test(id))return fail(res,'not_found',404);
  const result=await query('DELETE FROM swapp_social_voice_notes WHERE id=? AND sender_id=?',[id,req.directAudioUser.id]);
  if(!result.affectedRows)return fail(res,'not_found',404);
  res.json({success:true});
 }));
 return router;
}
module.exports={createDirectAudioRouter,sniff,MAX_BYTES,MAX_DURATION,RETENTION_DAYS};
