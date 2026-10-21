'use strict';
/*
 * Promote previously published, versioned SWAPP editorial releases to the
 * same persistent collection used by SWAPP Studio. Only existing, trusted,
 * checked-in editorial articles can be promoted here.
 *
 * Firestore is the authority after adoption. A document with the same slug,
 * including a withdrawn article, is NEVER overwritten or resurrected.
 * News articles already appeared publicly from the versioned release before
 * migration, so no new social publication event is emitted.
 */
const {assertArticle}=require('./article-core');

function createEditorialReleaseSync({firestore,articles,releaseArticles=[],clock=()=>new Date().toISOString()}={}){
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
module.exports={createEditorialReleaseSync};
