'use strict';
// SWAPP SOCIAL voice: authenticated signalling ONLY, audio flows browser-to-browser.
// No media recording, no additional infrastructure, no behavioural tracking.
const crypto = require('node:crypto');

const NAMESPACE = '/swapp-social-voice';
const MAX_PARTICIPANTS = 6;
const ROOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const base64url = value => Buffer.from(value).toString('base64url');
const allowedOrigin = value => {
  if(value==='https://swapp.tv'||value==='https://www.swapp.tv')return true;
  return process.env.NODE_ENV!=='production' && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(String(value||''));
};
function signTicket(user,secret,now=Date.now()){
  const payload = base64url(JSON.stringify({
    id:String(user.id).slice(0,80),
    handle:String(user.login).slice(0,40),
    exp:now+90000,
    nonce:crypto.randomBytes(12).toString('hex')
  }));
  const signature=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+signature;
}
function verifyTicket(value,secret,now=Date.now()){
  if(typeof value!=='string'||value.length>1000)return null;
  const bits=value.split('.');
  if(bits.length!==2||!bits.every(x=>/^[a-zA-Z0-9_-]+$/.test(x)))return null;
  const valid=crypto.createHmac('sha256',secret).update(bits[0]).digest();
  let claimed;
  try{
    const signed=Buffer.from(bits[1],'base64url');
    if(signed.length!==valid.length||!crypto.timingSafeEqual(signed,valid))return null;
    claimed=JSON.parse(Buffer.from(bits[0],'base64url').toString('utf8'));
  }catch{return null}
  if(!claimed||typeof claimed.id!=='string'||!claimed.id||typeof claimed.handle!=='string'||
    !/^[a-z0-9_-]{3,40}$/i.test(claimed.handle)||!Number.isFinite(claimed.exp)||
    claimed.exp<=now||claimed.exp>now+91000)return null;
  return {id:claimed.id,handle:claimed.handle};
}

function installSocialVoice({app,io,restoreSession,getPool,secret,iceServers=()=>[]}){
  if(!app||!io||typeof restoreSession!=='function'||typeof getPool!=='function'||
    typeof secret!=='string'||secret.length<24)throw Error('swapp_voice_invalid_configuration');

  app.post('/api/swapp/social/voice-ticket',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!allowedOrigin(req.get('origin')))return res.status(403).json({error:'invalid_origin'});
    if(!getPool())return res.status(503).json({error:'social_storage_unavailable'});
    let user;
    try{user=await restoreSession(req,res,{allowUserRecovery:false})}catch{
      return res.status(503).json({error:'swapp_session_unavailable'});
    }
    user=req.session?.oryonUser?.id?req.session.oryonUser:user;
    if(!user?.id||!user?.login)return res.status(401).json({error:'swapp_account_required'});
    return res.json({ticket:signTicket(user,secret),iceServers:iceServers(),
      maxParticipants:MAX_PARTICIPANTS});
  });

  const voice=io.of(NAMESPACE);
  voice.use((socket,next)=>{
    if(!allowedOrigin(socket.handshake.headers?.origin))return next(new Error('invalid_origin'));
    const user=verifyTicket(socket.handshake.auth?.ticket,secret);
    if(!user)return next(new Error('swapp_account_required'));
    socket.data.voiceUser=user;
    next();
  });

  voice.on('connection',socket=>{
    socket.data.voiceRoom='';
    let signalWindow=Date.now(),signalCount=0;
    function leave(){
      const room=socket.data.voiceRoom;
      if(!room)return;
      socket.data.voiceRoom='';
      socket.leave('social-audio:'+room);
      socket.to('social-audio:'+room).emit('voice:left',{id:socket.id});
    }
    socket.on('voice:join',async(payload,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{};
      const id=String(payload?.roomId||'');
      if(!ROOM_ID.test(id))return reply({ok:false,error:'invalid_room'});
      if(socket.data.voiceRoom===id)return reply({ok:false,error:'already_joined'});
      const pool=getPool();
      if(!pool)return reply({ok:false,error:'social_storage_unavailable'});
      try{
        // A signalling room exists only for a real SWAPP SOCIAL/MySQL chat room.
        const [rows]=await pool.execute('SELECT id FROM swapp_social_rooms WHERE id=? LIMIT 1',[id]);
        if(!rows?.length)return reply({ok:false,error:'not_found'});
        // Revalidate existence after asynchronous database lookup.
        if(!socket.connected)return;
        leave();
        const channel='social-audio:'+id;
        const members=voice.adapter.rooms.get(channel)||new Set();
        if(members.size>=MAX_PARTICIPANTS)return reply({ok:false,error:'room_full'});
        const peers=[...members].map(sid=>({
          id:sid,handle:voice.sockets.get(sid)?.data?.voiceUser?.handle||'Membre'
        }));
        socket.data.voiceRoom=id;
        socket.join(channel);
        reply({ok:true,peers,roomId:id,maxParticipants:MAX_PARTICIPANTS});
        socket.to(channel).emit('voice:joined',{id:socket.id,handle:socket.data.voiceUser.handle});
      }catch{return reply({ok:false,error:'room_unavailable'})}
    });
    socket.on('voice:leave',leave);
    socket.on('voice:signal',packet=>{
      const room=socket.data.voiceRoom;
      if(!room||!packet||typeof packet!=='object')return;
      const to=String(packet.to||'');
      const target=voice.sockets.get(to);
      if(!target||target.id===socket.id||target.data.voiceRoom!==room)return;
      if(!['offer','answer','ice'].includes(packet.kind))return;
      if(packet.data===null||typeof packet.data!=='object')return;
      let serialized;
      try{serialized=JSON.stringify(packet.data)}catch{return}
      if(!serialized||serialized.length>12000)return;
      if(Date.now()-signalWindow>10000){signalWindow=Date.now();signalCount=0}
      if(++signalCount>150)return;
      target.emit('voice:signal',{from:socket.id,kind:packet.kind,data:packet.data});
    });
    socket.on('voice:mute',muted=>{
      if(!socket.data.voiceRoom||typeof muted!=='boolean')return;
      socket.to('social-audio:'+socket.data.voiceRoom)
        .emit('voice:mute',{id:socket.id,muted});
    });
    socket.on('disconnect',leave);
  });
  return voice;
}

module.exports={installSocialVoice,signTicket,verifyTicket,allowedOrigin,MAX_PARTICIPANTS,NAMESPACE};
