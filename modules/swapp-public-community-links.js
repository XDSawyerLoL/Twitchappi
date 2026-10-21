'use strict';
// Only public destination URLs may reach a browser. Never return webhook tokens,
// OAuth credentials, platform app passwords, environment keys or auth state.
function normalizedHttps(raw){
 try{
  const u=new URL(String(raw||''));
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)return null;
  return u;
 }catch{return null;}
}
function discordInvite(raw){
 const u=normalizedHttps(raw);
 if(!u)return null;
 const host=u.hostname.toLowerCase(),segments=u.pathname.split('/').filter(Boolean);
 let code='';
 if(host==='discord.gg'&&segments.length===1)code=segments[0];
 else if(['discord.com','www.discord.com'].includes(host)&&segments.length===2&&segments[0]==='invite')code=segments[1];
 if(!/^[a-zA-Z0-9-]{2,64}$/.test(code))return null;
 return 'https://discord.gg/'+code;
}
function xProfile(raw){
 const u=normalizedHttps(raw);if(!u||!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname.toLowerCase()))return null;
 const handle=u.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)?.[1];
 if(!handle||['home','share','intent','i','login','explore','settings','messages'].includes(handle.toLowerCase()))return null;
 return 'https://x.com/'+handle;
}
function blueskyProfile(raw){
 const u=normalizedHttps(raw);if(!u||u.hostname!=='bsky.app')return null;
 const actor=u.pathname.match(/^\/profile\/([a-zA-Z0-9_.:-]{3,253})\/?$/)?.[1];
 if(!actor||(!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(actor)&&!/^(?:did:plc|did:web):[a-zA-Z0-9_.:-]+$/.test(actor)))return null;
 return 'https://bsky.app/profile/'+actor;
}
function publicCommunityLinks(env=process.env){
 return {
  discordInvite:discordInvite(env.SWAPP_DISCORD_INVITE_URL),
  xProfile:xProfile(env.SWAPP_X_PROFILE_URL),
  blueskyProfile:blueskyProfile(env.SWAPP_BLUESKY_PROFILE_URL)
 };
}
module.exports={discordInvite,xProfile,blueskyProfile,publicCommunityLinks};
