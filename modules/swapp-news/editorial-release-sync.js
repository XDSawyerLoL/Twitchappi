'use strict';
/*
 * Promote previously published, versioned SWAPP editorial releases to the
 * same persistent collection used by SWAPP Studio. Only existing, trusted,
 * checked-in editorial articles can be promoted here.
 *
 * Firestore is the authority after adoption. A document with the same slug,
 * including a withdrawn article, is NEVER overwritten or resurrected.
 * Existing release articles already adopted to Firestore never generate new
 * announcements. Only newly created release records schedule a Discord event,
 * within the same Firestore transaction, preserving editorial idempotency.
 */
const {assertArticle}=require('./article-core');
const fs=require('node:fs');
const path=require('node:path');
function loadEditorialReleases({dataDir=path.join(__dirname,'../../data')}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(dataDir,'swapp-editorial-releases.json'),'utf8'));
 if(manifest.schema!==1||!Array.isArray(manifest.releases)||manifest.releases.length>250)
   throw Error('Manifeste editorial SWAPP invalide');
 const articles=[],seen=new Set();
 for(const name of manifest.releases){
   if(typeof name!=='string'||!/^[a-z0-9][a-z0-9-]*\.json$/.test(name))
     throw Error('Nom de lot editorial non autorise');
   const release=JSON.parse(fs.readFileSync(path.join(dataDir,name),'utf8'));
   if(release.kind!=='swapp-editorial-release'||!Array.isArray(release.articles))
     throw Error('Lot editorial invalide : '+name);
   for(const article of release.articles){
     if(!article.slug||seen.has(article.slug))throw Error('Doublon editorial : '+article.slug);
     seen.add(article.slug);articles.push(article);
   }
 }
 return articles;
}

function createEditorialReleaseSync({firestore,articles,releaseArticles=[],clock=()=>new Date().toISOString(),recordDiscordPublication=null}={}){
 if(typeof firestore?.runTransaction!=='function'||typeof articles?.doc!=='function')
  throw Error('Persistance editorial requise');
 if(!Array.isArray(releaseArticles))throw Error('Lot editorial invalide');
 const validated=releaseArticles.map(item=>{
   const article=assertArticle(item,{publish:true});
   if(article.slug!==item.slug)throw Error('Slug editorial modifie: '+item.slug);
   const publishedAt=item.publishedAt;
   if(!publishedAt||!Number.isFinite(new Date(publishedAt).getTime()))
    throw Error('Date de publication manquante: '+item.slug);
   return {...article,publishedAt:new Date(publishedAt).toISOString()};
 });
 let done=false,inFlight=null;
 async function sync(){
   if(done)return {complete:true,alreadySynced:true,created:0};
   if(inFlight)return inFlight;
   inFlight=(async()=>{
     const results=[];
     for(const a of validated){
       const outcome=await firestore.runTransaction(async tx=>{
         const ref=articles.doc(a.slug),snapshot=await tx.get(ref);
         if(snapshot.exists)return 'already_exists';
         const now=clock();
         if(recordDiscordPublication)await recordDiscordPublication(tx,a,now);
         tx.create(ref,{...a,status:'published',revision:1,createdAt:now,updatedAt:now,
           provenance:'swapp-editorial-release',legacySuppressRecovery:false});
         return 'created';
       });
       results.push({slug:a.slug,status:outcome});
     }
     done=true;
     return {complete:true,created:results.filter(x=>x.status==='created').length,results};
   })().finally(()=>{inFlight=null;});
   return inFlight;
 }
 return {sync,articles:validated,completed:()=>done};
}
module.exports={createEditorialReleaseSync,loadEditorialReleases};
