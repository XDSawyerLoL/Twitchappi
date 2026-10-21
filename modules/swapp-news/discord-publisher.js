'use strict';
/*
 * SWAPP -> Discord: channel-specific, idempotent publication outbox.
 * No OAuth, no public write endpoint and NO webhook credential in this repo.
 * Enable by setting SWAPP_DISCORD_WEBHOOK_URL in Hostinger Node environment.
 */
const crypto=require('node:crypto');
const {cardImageSources}=require('../../assets/swapp-article-extras');

function isDiscordWebhook(raw){
 try{
  const u=new URL(String(raw||''));
  return u.protocol==='https:'&&u.hostname==='discord.com'&&!u.username&&!u.password
   &&/^\/api\/webhooks\/[0-9]{16,22}\/[A-Za-z0-9_-]{20,}$/.test(u.pathname)
   &&u.hash===''&&u.search==='';
 }catch{return false;}
}
function trimText(raw,n){
 return String(raw||'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
}
function buildDiscordMessage(article,{baseUrl='https://swapp.tv'}={}){
 const slug=String(article?.slug||'');
 if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))throw Error('Slug invalide pour Discord');
 const u=new URL(baseUrl);
 if(u.protocol!=='https:'||!u.hostname)throw Error('Origine SWAPP invalide');
 const articleUrl=u.origin+'/actus/'+encodeURIComponent(slug);
 const title=trimText(article.title,240);
 const summary=trimText(article.summary||article.body,490);
 const game=trimText(article.game||article.games?.[0]||'Jeu vidéo',75);
 const image=cardImageSources(article)[0];
 if(!title||!summary)throw Error('Article incomplet pour Discord');
 const publishedAt=new Date(article.publishedAt||Date.now());
 const embed={
  title,description:summary,
  url:articleUrl,color:0xf97316,
  author:{name:'SWAPP · Actualité du jeu vidéo',url:'https://swapp.tv/actus'},
  fields:[{name:'À découvrir',value:game,inline:true}],
  footer:{text:'SWAPP · Le jeu, l’actu et les créateurs'}
 };
 if(image)embed.image={url:image};
 if(Number.isFinite(publishedAt.getTime()))embed.timestamp=publishedAt.toISOString();
 return {
  username:'SWAPP · Actualités',
  content:'📰 **À LA UNE · '+game.toUpperCase()+'**\n'+trimText(summary,210)+'\n\n👉 **L’article complet sur SWAPP :** '+articleUrl,
  embeds:[embed],
  allowed_mentions:{parse:[]},
  tts:false
 };
}

function createDiscordPublisher({firestore,articles,fetchImpl=globalThis.fetch,env=process.env,
 clock=()=>Date.now(),baseUrl='https://swapp.tv',isReady=()=>true,setIntervalImpl=setInterval}={}){
 if(typeof firestore?.runTransaction!=='function'||typeof articles?.doc!=='function')
  throw Error('Firestore articles requis');
 const outbox=firestore.collection('swapp_news_discord_outbox');
 const configured=Boolean(env.SWAPP_DISCORD_WEBHOOK_URL);
 const webhookValid=isDiscordWebhook(env.SWAPP_DISCORD_WEBHOOK_URL);
 const enabled=env.NODE_ENV==='production'&&webhookValid&&env.SWAPP_DISCORD_ENABLED!=='false';
 let executing=null;
 const eventRef=slug=>outbox.doc(slug);
 const recordPublication=async(tx,article,createdAt)=>{
  const ref=eventRef(article.slug);
  const existing=await tx.get(ref);
  if(existing.exists)return false;
  tx.create(ref,{
   type:'article.published.discord',
   articleSlug:article.slug,
   status:'pending',
   attempts:0,
   createdAt,
   nextAttemptAt:null,
   lastError:null,
   messageId:null
  });
  return true;
 };
 async function claim(ref){
  const lease=crypto.randomBytes(8).toString('hex');
  const claimed=await firestore.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists)return null;
   const event=snap.data();
   const now=clock();
   if(!['pending','sending'].includes(event.status))return null;
   if(event.status==='sending'&&Date.parse(event.leaseUntil||'')>now)return null;
   if(event.status==='pending'&&Date.parse(event.nextAttemptAt||'')>now)return null;
   const attempts=Number(event.attempts||0)+1;
   tx.update(ref,{status:'sending',lease,leaseUntil:new Date(now+120000).toISOString(),attempts});
   return {slug:event.articleSlug,lease,attempts};
  });
  return claimed;
 }
 async function finish(ref,claimData,update){
  await firestore.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists||snap.data().lease!==claimData.lease)return;
   tx.update(ref,{...update,lease:null,leaseUntil:null,updatedAt:new Date(clock()).toISOString()});
  });
 }
 async function dispatchOne(doc){
  const ref=eventRef(doc.id);
  const job=await claim(ref);
  if(!job)return {status:'skipped'};
  try{
   const snap=await articles.doc(job.slug).get();
   if(!snap.exists||snap.data().status!=='published'){
    await finish(ref,job,{status:'cancelled',lastError:'article_not_published'});
    return {status:'cancelled'};
   }
   const message=buildDiscordMessage(snap.data(),{baseUrl});
   const webhook=new URL(env.SWAPP_DISCORD_WEBHOOK_URL);
   webhook.searchParams.set('wait','true');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),10000);
   let response;
   try{
    response=await fetchImpl(webhook.href,{
     method:'POST',
     headers:{'content-type':'application/json'},
     body:JSON.stringify(message),
     signal:controller.signal
    });
   }finally{clearTimeout(timeout);}
   // wait=true ensures Discord returns an acknowledged message id.
   if(response.ok){
    const result=await response.json();
    if(!/^[0-9]{16,22}$/.test(String(result?.id||'')))throw Error('discord_missing_message_id');
    await finish(ref,job,{status:'sent',messageId:String(result.id),sentAt:new Date(clock()).toISOString(),lastError:null,nextAttemptAt:null});
    return {status:'sent'};
   }
   const status=response.status;
   if([400,401,403,404].includes(status)){
    await finish(ref,job,{status:'blocked',lastError:'discord_http_'+status});
    return {status:'blocked'};
   }
   let waitMs=Math.min(1800000,30000*Math.pow(2,Math.min(job.attempts,5)));
   if(status===429){
    let retry=0;try{retry=Number((await response.json())?.retry_after)||0}catch{}
    if(retry>0)waitMs=Math.min(1800000,Math.max(2000,retry*1000));
   }
   await finish(ref,job,{status:'pending',lastError:'discord_http_'+status,
    nextAttemptAt:new Date(clock()+waitMs).toISOString()});
   return {status:'retry'};
  }catch(error){
   const retryMs=Math.min(1800000,30000*Math.pow(2,Math.min(job.attempts,5)));
   await finish(ref,job,{status:'pending',lastError:'discord_delivery_uncertain',
    nextAttemptAt:new Date(clock()+retryMs).toISOString()});
   return {status:'retry'};
  }
 }
 async function processQueue(){
  if(!enabled||!isReady())return {enabled:false};
  if(executing)return executing;
  executing=(async()=>{
   // Two simple indexed reads, bounded to a few events and no composite index.
   const [pending,sending]=await Promise.all([
    outbox.where('status','==','pending').limit(12).get(),
    outbox.where('status','==','sending').limit(12).get()
   ]);
   let processed=0;
   for(const doc of [...pending.docs,...sending.docs]){
    const result=await dispatchOne(doc);
    if(result.status!=='skipped')processed++;
   }
   return {enabled:true,processed};
  })().finally(()=>{executing=null});
  return executing;
 }
 function kick(){
  if(enabled)processQueue().catch(e=>console.warn('[SWAPP DISCORD] Outbox indisponible:',String(e?.message||e).slice(0,130)));
 }
 function start(){
  if(!enabled)return;
  kick(); // Recover pending publication events after a Node restart.
  const timer=setIntervalImpl(kick,5*60000);
  if(typeof timer?.unref==='function')timer.unref();
 }
 return {
  outbox,recordPublication,processQueue,kick,start,
  status:()=>({configured,webhookValid,enabled,pollMinutes:5})
 };
}
module.exports={isDiscordWebhook,buildDiscordMessage,createDiscordPublisher};
