'use strict';
// Invite-only personal rooms share SWAPP's existing room chat and WebRTC voice.
const crypto=require('node:crypto');
const {ROOM_ID,secretOK,newNonce,inviteFor,readInvite,verifyInvite}=require('./swapp-social-room-access');
function installPersonalRoomRoutes({route,pool,query,bad,clock,trim,inviteSecret}){
 const available=()=>secretOK(inviteSecret);
 const roomInfo=r=>({id:r.id,name:r.name,game:r.game,createdAt:Number(r.created_at),private:true,owner:r.owner_id===undefined?false:undefined});
 const isId=id=>ROOM_ID.test(String(id||''));
 const ownRoom=async(id,user)=>{
  if(!isId(id))return null;
  const rows=await query(
   'SELECT p.room_id,p.owner_id,p.invite_nonce,r.name,r.game,r.created_at FROM swapp_social_private_rooms p '+
   'JOIN swapp_social_rooms r ON r.id=p.room_id WHERE p.room_id=? AND p.owner_id=? LIMIT 1',[id,user]);
  return rows[0]||null;
 };
 const issued=(room)=>inviteFor(room.room_id,room.invite_nonce,inviteSecret);
 route('post','/rooms/personal',async(req,res)=>{
  if(!available())return bad(res,'invite_unavailable',503);
  const name=trim(req.body?.name,60),game=trim(req.body?.game,65)||'Discussion',now=clock();
  if(name.length<3||game.length>65)return bad(res,'invalid_room');
  const conn=await pool.getConnection();
  let committed=false,room;
  try{
   await conn.beginTransaction();
   const [countRows]=await conn.execute('SELECT COUNT(*) AS total FROM swapp_social_private_rooms WHERE owner_id=? FOR UPDATE',[req.member.id]);
   if(Number(countRows[0]?.total||0)>=10){await conn.rollback();return bad(res,'personal_room_limit',409)}
   const [recent]=await conn.execute('SELECT id FROM swapp_social_rooms WHERE owner_id=? AND created_at>? LIMIT 1',[req.member.id,now-60000]);
   if(recent.length){await conn.rollback();return bad(res,'rate_limited',429)}
   const id=crypto.randomUUID(),nonce=newNonce();
   await conn.execute('INSERT INTO swapp_social_rooms (id,owner_id,name,game,created_at) VALUES (?,?,?,?,?)',
    [id,req.member.id,name,game,now]);
   await conn.execute('INSERT INTO swapp_social_private_rooms (room_id,owner_id,invite_nonce,created_at) VALUES (?,?,?,?)',
    [id,req.member.id,nonce,now]);
   await conn.execute('INSERT INTO swapp_social_private_members (room_id,user_id,joined_at) VALUES (?,?,?)',
    [id,req.member.id,now]);
   await conn.commit();committed=true;
   room={id,name,game,private:true,owner:true,createdAt:now};
   res.set('Cache-Control','private, no-store');
   return res.status(201).json({room,invite:inviteFor(id,nonce,inviteSecret)});
  }finally{
   if(!committed){try{await conn.rollback()}catch{}}
   conn.release();
  }
 });
 route('get','/rooms/:id/invite',async(req,res)=>{
  if(!available())return bad(res,'invite_unavailable',503);
  const room=await ownRoom(req.params.id,req.member.id);
  if(!room)return bad(res,'not_found',404);
  res.set('Cache-Control','private, no-store');
  res.json({roomId:room.room_id,invite:issued(room)});
 });
 route('post','/rooms/:id/invite/rotate',async(req,res)=>{
  if(!available())return bad(res,'invite_unavailable',503);
  const room=await ownRoom(req.params.id,req.member.id);
  if(!room)return bad(res,'not_found',404);
  const nonce=newNonce();
  await query('UPDATE swapp_social_private_rooms SET invite_nonce=? WHERE room_id=? AND owner_id=?',
   [nonce,room.room_id,req.member.id]);
  res.set('Cache-Control','private, no-store');
  res.json({roomId:room.room_id,invite:inviteFor(room.room_id,nonce,inviteSecret)});
 });
 route('post','/rooms/join',async(req,res)=>{
  if(!available())return bad(res,'invite_unavailable',503);
  const parsed=readInvite(req.body?.invite);
  if(!parsed)return bad(res,'invalid_invite',403);
  const rows=await query(
   'SELECT p.invite_nonce,r.id,r.name,r.game,r.created_at FROM swapp_social_private_rooms p '+
   'JOIN swapp_social_rooms r ON r.id=p.room_id WHERE p.room_id=? LIMIT 1',[parsed.id]);
  const room=rows[0];
  if(!room||!verifyInvite(req.body.invite,room.invite_nonce,inviteSecret))return bad(res,'invalid_invite',403);
  const count=await query('SELECT COUNT(*) AS total FROM swapp_social_private_members WHERE room_id=?',[room.id]);
  const already=await query('SELECT user_id FROM swapp_social_private_members WHERE room_id=? AND user_id=? LIMIT 1',[room.id,req.member.id]);
  if(!already.length&&Number(count[0]?.total||0)>=30)return bad(res,'personal_room_full',409);
  await query('INSERT IGNORE INTO swapp_social_private_members (room_id,user_id,joined_at) VALUES (?,?,?)',
   [room.id,req.member.id,clock()]);
  res.set('Cache-Control','private, no-store');
  res.json({room:{id:room.id,name:room.name,game:room.game,createdAt:Number(room.created_at),private:true,owner:false}});
 });
}
module.exports={installPersonalRoomRoutes};
