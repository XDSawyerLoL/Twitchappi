'use strict';
/* Discord invite checks for SWAPP SERVEUR +.
 * Checks whether a public guild invite exists, NOT who owns the guild.
 * Fixed Discord API host only, no user-supplied HTTP fetch target.
 */
const TRUSTED=new Set(['discord.gg','discord.com','www.discord.com','discordapp.com','www.discordapp.com']);
function inviteCode(input){
 let u;try{u=new URL(String(input||'').trim())}catch{return ''};
 if(u.protocol!=='https:'||u.username||u.password||u.port||!TRUSTED.has(u.hostname.toLowerCase()))return '';
 const segments=u.pathname.split('/').filter(Boolean);
 const code=(u.hostname.toLowerCase()==='discord.gg'&&segments.length===1)?segments[0]:
 (segments.length===2&&segments[0].toLowerCase()==='invite'?segments[1]:'');
 return /^[A-Za-z0-9-]{2,64}$/.test(code)?code:'';
}
async function verifyDiscordInvite(input,{fetcher=globalThis.fetch,timeoutMs=3500}={}){
 const code=inviteCode(input);
 if(!code)return {valid:false,reason:'not_discord_invite'};
 if(typeof fetcher!=='function')return {valid:false,reason:'verification_unavailable'};
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher('https://discord.com/api/v10/invites/'+encodeURIComponent(code)+'?with_counts=true',{
   signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}
  });
  if(response.status===404)return {valid:false,reason:'invite_not_found'};
  if(!response.ok)return {valid:false,reason:response.status===429?'discord_rate_limited':'discord_unavailable'};
  const data=await response.json();
  if(!data||data.code!==code||data.type!==0||!data.guild||!/^[0-9]{15,22}$/.test(String(data.guild.id||'')))
   return {valid:false,reason:'not_a_guild_invite'};
  if(data.expires_at&&Number.isFinite(Date.parse(data.expires_at))&&Date.parse(data.expires_at)<=Date.now())
   return {valid:false,reason:'expired_invite'};
  // A verified public invite does not prove submitter ownership or server safety.
  return {valid:true,code,guildId:String(data.guild.id),guildName:String(data.guild.name||'').slice(0,100),
   inviteUrl:'https://discord.gg/'+code};
 }catch{return {valid:false,reason:'verification_unavailable'}}
 finally{clearTimeout(timeout)}
}
module.exports={inviteCode,verifyDiscordInvite};
