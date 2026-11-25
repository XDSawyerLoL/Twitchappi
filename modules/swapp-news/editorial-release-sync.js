'use strict';
/*
 * Promote previously published, versioned SWAPP editorial releases to the
 * same persistent collection used by SWAPP Studio. Only existing, trusted,
 * checked-in editorial articles can be promoted here.
 *
 * The CMS (MySQL on Hostinger) is authoritative after adoption. Existing
 * drafts/withdrawals and editor revisions must never be resurrected.
 * A small number of revised official-source articles may be upgraded exactly
 * once, but only after their original body, summary and source list match the
 * checked-in baseline byte-for-byte under a transactional row lock.
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
 const priorVersions=new Map();
 const validated=releaseArticles.map(item=>{
   const article=assertArticle(item,{publish:true});
   if(article.slug!==item.slug)throw Error('Slug editorial modifie: '+item.slug);
   const publishedAt=item.publishedAt;
   if(!publishedAt||!Number.isFinite(new Date(publishedAt).getTime()))
    throw Error('Date de publication manquante: '+item.slug);
   if(Object.prototype.hasOwnProperty.call(item,'editorialPreviousBody')){
    if(typeof item.editorialPreviousBody!=='string'||item.editorialPreviousBody.length<40||
       typeof item.editorialPreviousSummary!=='string'||
       !Array.isArray(item.editorialPreviousSources)||
       item.editorialPreviousBody===article.body)throw Error('Base revision editoriale invalide: '+item.slug);
    priorVersions.set(article.slug,{body:item.editorialPreviousBody,
      summary:item.editorialPreviousSummary,sources:item.editorialPreviousSources});
   }
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
         if(snapshot.exists){
           const existing=snapshot.data()||{};
           // A reviewed editorial revision is safe only if every compared
           // original field is unchanged. Any Studio edit, other provenance,
           // withdrawal or new revision wins and prevents the update.
           const baseline=priorVersions.get(a.slug);
           if(baseline&&existing.provenance==='swapp-editorial-release'&&
              existing.status==='published'&&existing.revision===1&&
              existing.legacySuppressRecovery!==true&&existing.title===a.title&&
              existing.body===baseline.body&&existing.summary===baseline.summary&&
              JSON.stringify(existing.sources||[])===JSON.stringify(baseline.sources)){
             const patch={body:a.body,summary:a.summary,sources:a.sources,
               revision:2,updatedAt:clock()};
             // A release can also carry its missing, licensed cover. Repair
             // both in the same transaction, never replacing manual artwork.
             if(!existing.image?.url&&!existing.thumbnail?.url&&a.image?.url&&a.thumbnail?.url){
               patch.image=a.image;patch.thumbnail=a.thumbnail;
             }
             tx.update(ref,patch);
             return 'editorial_enriched';
           }
           // Repair only never-edited, still-published release imports whose
           // cover was absent at adoption. Preserve every editor revision,
           // withdrawal, custom image and other CMS field.
           if(existing.provenance==='swapp-editorial-release'&&
              existing.status==='published'&&existing.revision===1&&
              !existing.image?.url&&!existing.thumbnail?.url&&
              a.image?.url&&a.thumbnail?.url){
             tx.update(ref,{image:a.image,thumbnail:a.thumbnail,updatedAt:clock()});
             return 'media_repaired';
           }
           return 'already_exists';
         }
         const now=clock();
         if(recordDiscordPublication)await recordDiscordPublication(tx,a,now);
         tx.create(ref,{...a,status:'published',revision:1,createdAt:now,updatedAt:now,
           provenance:'swapp-editorial-release',legacySuppressRecovery:false});
         return 'created';
       });
       results.push({slug:a.slug,status:outcome});
     }
     done=true;
     return {complete:true,created:results.filter(x=>x.status==='created').length,mediaRepaired:results.filter(x=>x.status==='media_repaired').length,
       editorialEnriched:results.filter(x=>x.status==='editorial_enriched').length,results};
   })().finally(()=>{inFlight=null;});
   return inFlight;
 }
 return {sync,articles:validated,completed:()=>done};
}
// Keep this read-only diagnostic within the shared Hostinger pool queue.
// A missing row remains false; drafts and withdrawals remain editable records.
async function readEditorialReleaseStates({articles,releaseCandidates}){
 const states=[];
 for(const item of releaseCandidates){
   const document=await articles.doc(item.slug).get();
   states.push({slug:item.slug,editableInStudio:document.exists});
 }
 return states;
}
module.exports={createEditorialReleaseSync,loadEditorialReleases,readEditorialReleaseStates};
