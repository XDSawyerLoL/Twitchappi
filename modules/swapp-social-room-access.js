'use strict';
// A room invite is a bearer capability used once to enroll a SWAPP account.
// The database holds only a random nonce; HMAC requires the configured server secret.
const crypto=require('node:crypto');
const ROOM_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE=/^[a-f0-9]{32}$/;
const TOKEN=/^[a-zA-Z0-9_-]{43}$/;
function secretOK(secret){return typeof secret==='string'&&secret.length>=24}
function newNonce(){return crypto.randomBytes(16).toString('hex')}
function inviteFor(roomId,nonce,secret){
 if(!ROOM_ID.test(roomId)||!NONCE.test(nonce)||!secretOK(secret))throw Error('invite_not_configured');
 const digest=crypto.createHmac('sha256',secret).update('SWAPP-PERSONAL-V1:'+roomId.toLowerCase()+':'+nonce).digest('base64url');
 return roomId.toLowerCase()+'.'+digest;
}
function readInvite(value){
 if(typeof value!=='string'||value.length>95)return null;
 const sep=value.indexOf('.');
 if(sep<0)return null;
 const id=value.slice(0,sep).toLowerCase(),sig=value.slice(sep+1);
 if(!ROOM_ID.test(id)||!TOKEN.test(sig))return null;
 return {id,signature:sig};
}
function verifyInvite(value,nonce,secret){
 const candidate=readInvite(value);
 if(!candidate||!NONCE.test(nonce)||!secretOK(secret))return null;
 const expected=inviteFor(candidate.id,nonce,secret).slice(candidate.id.length+1);
 const a=Buffer.from(candidate.signature),b=Buffer.from(expected);
 return a.length===b.length&&crypto.timingSafeEqual(a,b)?candidate.id:null;
}
async function accessRoom(pool,roomId,userId){
 if(!ROOM_ID.test(String(roomId||''))||!String(userId||''))return false;
 const [rows]=await pool.execute(
  'SELECT r.id, p.room_id AS private_room, m.user_id AS private_member FROM swapp_social_rooms r '+
  'LEFT JOIN swapp_social_private_rooms p ON p.room_id=r.id '+
  'LEFT JOIN swapp_social_private_members m ON m.room_id=r.id AND m.user_id=? '+
  'WHERE r.id=? LIMIT 1',[String(userId),roomId]);
 if(!rows?.length)return false;
 return !rows[0].private_room||!!rows[0].private_member;
}
module.exports={ROOM_ID,secretOK,newNonce,inviteFor,readInvite,verifyInvite,accessRoom};
