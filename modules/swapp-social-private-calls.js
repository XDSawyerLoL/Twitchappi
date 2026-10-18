'use strict';
// One-to-one voice calls on the existing authenticated SWAPP SOCIAL namespace.
// SDP/ICE signalling only: microphones and DTLS/SRTP are handled by browsers.
const crypto=require('node:crypto');
const HANDLE=/^[a-z0-9_-]{3,40}$/i;
const CALL_TIMEOUT_MS=35000,MAX_CALL_MS=2*60*60*1000;
function installPrivateCalls(voice,{lookupLocalUser,clock=()=>Date.now()}={}){
 if(!voice||typeof lookupLocalUser!=='function')throw Error('private_calls_invalid_configuration');
 const calls=new Map(),recipientCooldown=new Map();
 const finish=(call,reason='ended')=>{
  if(!call||!calls.has(call.id))return;
  calls.delete(call.id);
  clearTimeout(call.timer);
  const active=[call.fromSocket,call.toSocket].filter(Boolean);
  for(const id of active){
   const peer=voice.sockets.get(id);
   if(peer?.data.privateCallId===call.id)peer.data.privateCallId='';
   peer?.emit('call:ended',{callId:call.id,reason});
  }
  // Also dismiss other pending devices that saw the invitation.
  if(call.status==='ringing'){
   for(const peer of voice.sockets.values()){
    if(peer.data.voiceUser?.id===call.toUserId&&peer.id!==call.toSocket)
     peer.emit('call:ended',{callId:call.id,reason});
   }
  }
 };
 voice.on('connection',socket=>{
  socket.data.privateCallId='';
  let lastInvite=0,lastSignalWindow=clock(),signalCount=0;
  socket.on('call:invite',(packet,ack)=>{
   const reply=typeof ack==='function'?ack:()=>{};
   const user=socket.data.voiceUser;
   const handle=String(packet?.handle||'').trim().toLowerCase().replace(/^@/,'');
   if(!user||!HANDLE.test(handle))return reply({ok:false,error:'invalid_recipient'});
   const local=lookupLocalUser(handle);
   if(!local?.id||String(local.login||'').toLowerCase()!==handle||String(local.id)===String(user.id))
    return reply({ok:false,error:'invalid_recipient'});
   if(socket.data.privateCallId)return reply({ok:false,error:'busy'});
   if(clock()-lastInvite<20000)return reply({ok:false,error:'rate_limited'});
   if(clock()-Number(recipientCooldown.get(String(local.id))||0)<30000)return reply({ok:false,error:'rate_limited'});
   const waiting=[...voice.sockets.values()].filter(other=>
    other.id!==socket.id&&other.data.voiceUser?.id===String(local.id)&&
    !other.data.privateCallId&&other.connected);
   if(!waiting.length)return reply({ok:false,error:'offline'});
   // Avoid parallel incoming calls for the same person across tabs.
   if([...calls.values()].some(c=>c.toUserId===String(local.id)&&c.status==='ringing'))
    return reply({ok:false,error:'busy'});
   lastInvite=clock();
   recipientCooldown.set(String(local.id),clock());
   const id=crypto.randomUUID();
   const call={id,fromSocket:socket.id,fromUserId:String(user.id),
    fromHandle:user.handle,toUserId:String(local.id),toSocket:'',
    status:'ringing',timer:null};
   calls.set(id,call);
   socket.data.privateCallId=id;
   call.timer=setTimeout(()=>finish(call,'missed'),CALL_TIMEOUT_MS);
   call.timer.unref?.();
   reply({ok:true,callId:id});
   for(const other of waiting)other.emit('call:incoming',{callId:id,fromHandle:user.handle});
  });
  socket.on('call:answer',(packet,ack)=>{
   const reply=typeof ack==='function'?ack:()=>{};
   const call=calls.get(String(packet?.callId||''));
   if(!call||call.status!=='ringing'||call.toUserId!==socket.data.voiceUser?.id||
      !voice.sockets.get(call.fromSocket)?.connected)return reply({ok:false,error:'expired'});
   if(packet.accept!==true){finish(call,'declined');return reply({ok:true})}
   if(socket.data.privateCallId)return reply({ok:false,error:'busy'});
   clearTimeout(call.timer);
   call.status='active';call.toSocket=socket.id;
   socket.data.privateCallId=call.id;
   call.timer=setTimeout(()=>finish(call,'timeout'),MAX_CALL_MS);
   call.timer.unref?.();
   reply({ok:true,callId:call.id,peer:call.fromSocket});
   const caller=voice.sockets.get(call.fromSocket);
   caller?.emit('call:accepted',{callId:call.id,peer:socket.id,handle:socket.data.voiceUser.handle,role:'caller'});
   socket.emit('call:accepted',{callId:call.id,peer:caller?.id,handle:call.fromHandle,role:'callee'});
   // Dismiss the invitation on any other device logged in as the callee.
   for(const other of voice.sockets.values()){
    if(other.id!==socket.id&&other.data.voiceUser?.id===call.toUserId)
     other.emit('call:answered-elsewhere',{callId:call.id});
   }
  });
  socket.on('call:signal',packet=>{
   const call=calls.get(String(packet?.callId||''));
   if(!call||call.status!=='active'||socket.data.privateCallId!==call.id)return;
   const otherId=socket.id===call.fromSocket?call.toSocket:
    socket.id===call.toSocket?call.fromSocket:'';
   const peer=voice.sockets.get(otherId);
   if(!peer?.connected||peer.data.privateCallId!==call.id)return;
   if(!['offer','answer','ice'].includes(packet?.kind)||
      !packet.data||typeof packet.data!=='object'||Array.isArray(packet.data))return;
   let encoded;
   try{encoded=JSON.stringify(packet.data)}catch{return}
   if(!encoded||encoded.length>12000)return;
   if(clock()-lastSignalWindow>=10000){lastSignalWindow=clock();signalCount=0}
   if(++signalCount>150)return;
   peer.emit('call:signal',{callId:call.id,from:socket.id,kind:packet.kind,data:packet.data});
  });
  socket.on('call:end',packet=>{
   const call=calls.get(String(packet?.callId||''));
   if(call&&(socket.id===call.fromSocket||socket.id===call.toSocket))
    finish(call,'ended');
  });
  socket.on('disconnect',()=>{
   for(const call of [...calls.values()]){
    if(call.fromSocket===socket.id||call.toSocket===socket.id)finish(call,'disconnected');
   }
  });
 });
 return calls;
}
module.exports={installPrivateCalls,CALL_TIMEOUT_MS};
