'use strict';
/* SWAPP native game synchronization: only verified linked Twitch channel metadata.
 * Native HLS packets contain no game/process identity; never guess from pixels.
 * Only generic/empty native categories qualify; manual edits always win.
 */
const generic=value=>!String(value||'').trim()||
 /^(gaming|jeux?|jeu vidéo|just chatting|autre|non défini)$/i.test(String(value||'').trim());
const normal=value=>String(value||'').trim().toLowerCase();
const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
function createNativeAutoGameSync({
 twitchAPI,getUsers,saveUsers,getNativeRoom,isLocalLive,io,
 schedule=true,intervalMs=180000
}={}){
 if(typeof twitchAPI!=='function'||typeof getUsers!=='function'||typeof saveUsers!=='function'||
  typeof getNativeRoom!=='function'||typeof isLocalLive!=='function'||!io)
  throw Error('swapp_auto_game_dependencies');
 let running=false,last=0;
 async function suggested(link){
  const login=normal(link?.login||link?.user_login||link?.username);
  const id=String(link?.id||link?.user_id||'').trim();
  if(!login&&!/^\d+$/.test(id))return null;
  try{
   if(login){
    const data=await twitchAPI('streams?user_login='+encodeURIComponent(login)+'&first=1');
    const row=(data?.data||[]).find(x=>normal(x.user_login)===login);
    if(row?.game_name)return {game:clean(row.game_name),source:'twitch_live'};
   }
   if(/^\d+$/.test(id)){
    const data=await twitchAPI('channels?broadcaster_id='+encodeURIComponent(id));
    if(data?.data?.[0]?.game_name)return {game:clean(data.data[0].game_name),source:'twitch_channel'};
   }
  }catch(_){}
  return null;
 }
 async function syncOnce(){
  if(running)return {updated:0,skipped:'running'};
  running=true;let updated=0,examined=0;
  try{
   const collection=getUsers();
   // Only the first four active creator streams to cap Twitch quota/cost.
   const candidates=(collection.users||[]).filter(user=>{
    const login=normal(user.login),room=login&&getNativeRoom(login);
    return login&&generic(room?.category||user.current_live_category)&&
     (room?.host||isLocalLive(login))&&user.twitch_link;
   }).slice(0,4);
   for(const candidate of candidates){
    examined++;
    const link=candidate.twitch_link;
    const result=await suggested(link);
    if(!result?.game||generic(result.game))continue;
    // Re-read before writing: the creator may have edited the category while
    // the Twitch request was underway.
    const current=getUsers(),user=(current.users||[]).find(x=>String(x.id)===String(candidate.id));
    if(!user||!generic(user.current_live_category))continue;
    const login=normal(user.login),room=getNativeRoom(login);
    if(!((room?.host)||isLocalLive(login))||!generic(room?.category||user.current_live_category))continue;
    user.current_live_category=result.game;user.channel_updatedAt=Date.now();
    try{await saveUsers(current)}
    catch(_){continue}
    if(room)room.category=result.game;
    io.to('native:'+login).emit('native:metadata:updated',{
     room:login,title:String(room?.title||user.current_live_title||'Live de '+login),
     category:result.game,live:true,source:result.source,updated_at:Date.now()
    });
    updated++;
   }
   last=Date.now();
   return {updated,examined,last};
  }finally{running=false}
 }
 if(schedule){
  const timer=setInterval(()=>{void syncOnce().catch(()=>{})},Math.max(90000,intervalMs));
  timer.unref?.();
  const initial=setTimeout(()=>{void syncOnce().catch(()=>{})},30000);
  initial.unref?.();
 }
 return {syncOnce,suggested,generic};
}
module.exports={createNativeAutoGameSync,generic};
