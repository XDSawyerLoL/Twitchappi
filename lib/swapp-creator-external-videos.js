'use strict';
// SWAPP Creator: canonical external-video IDs only. Never accept iframe HTML.
const MAX_VIDEOS=5;
function parseVideoUrl(value){
 let u;try{u=new URL(String(value||''))}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 let provider='',id='';
 if(host==='youtu.be'&&/^\/[a-zA-Z0-9_-]{11}\/?$/.test(u.pathname)){provider='youtube';id=u.pathname.split('/')[1]}
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
  provider='youtube';
  if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
  else if(/^\/(?:shorts|live|embed)\/[a-zA-Z0-9_-]{11}\/?$/.test(u.pathname))id=u.pathname.split('/')[2]||'';
 }else if(['odysee.com','www.odysee.com'].includes(host)){
  provider='odysee';
  // Odysee's canonical claim links include a name and a claim id after ':'.
  if(/^\/@[^/]+:[a-z0-9]+\/[^/]+:[a-z0-9]+\/?$/i.test(u.pathname))id=u.pathname.slice(1).replace(/\/$/,'');
 }
 if(provider==='youtube'&&!/^[a-zA-Z0-9_-]{11}$/.test(id))return null;
 if(provider==='odysee'&&(id.length>240||!id))return null;
 if(!id)return null;
 return {provider,id,url:provider==='youtube'?'https://www.youtube.com/watch?v='+id:'https://odysee.com/'+id};
}
function normalizeVideos(items){
 if(!Array.isArray(items)||items.length>MAX_VIDEOS)throw new Error('Maximum 5 vidéos.');
 const seen=new Set();
 return items.map((item,i)=>{
  const parsed=parseVideoUrl(item?.url);
  if(!parsed)throw new Error('Lien vidéo non pris en charge.');
  const key=parsed.provider+':'+parsed.id;
  if(seen.has(key))throw new Error('Vidéo déjà ajoutée.');
  seen.add(key);
  const title=String(item?.title||'').trim().slice(0,120);
  return {...parsed,title,position:i,pinned:item?.pinned===true};
 });
}
function embedUrl(item){
 const video=parseVideoUrl(item?.url);
 if(!video)return null;
 if(video.provider==='youtube')return 'https://www.youtube-nocookie.com/embed/'+video.id;
 // Odysee uses its official iframe endpoint for canonical claim paths.
 return 'https://odysee.com/$/embed/'+video.id;
}
module.exports={MAX_VIDEOS,parseVideoUrl,normalizeVideos,embedUrl};
