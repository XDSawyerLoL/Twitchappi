'use strict';
const crypto = require('node:crypto');
const {assertArticle, renderArticle, renderListing, isLegacyJustPlayerUrl} = require('./article-core');
const {js:studioJs,renderStudio}=require('./studio');

function createNewsRouter({express, firestore, requireEditor, isReady = () => true, baseUrl = 'https://swapp.tv'}) {
  if (typeof express?.Router !== 'function' || typeof firestore?.collection !== 'function' ||
      typeof firestore?.runTransaction !== 'function' || typeof requireEditor !== 'function') {
    throw new Error('Express, Firestore et authentification éditoriale obligatoires');
  }
  const router=express.Router();
  const articles=firestore.collection('swapp_news_articles');
  const outbox=firestore.collection('swapp_news_outbox');
  const importKeys=firestore.collection('swapp_news_import_keys');
  const slugOk = s => /^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
  const available=(req,res,next)=>isReady() ? next() : res.status(503).json({error:'news_storage_unavailable'});
  const sendError=(res,e)=>res.status(400).json({error:e.message || 'Article invalide'});
  const isValidation=e=>/Article|Titre|Slug|source|URL|Résumé|Crédit|droits|Date|JustPlayer/.test(String(e?.message||''));
  const published=async()=>{
    const snap=await articles.where('status','==','published').limit(60).get();
    return snap.docs.map(x=>x.data()).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
  };
  const noStore=(_req,res,next)=>{res.set('Cache-Control','no-store');next();};
  const editor=[available,requireEditor,noStore];

  router.get('/api/actus',available,async(req,res,next)=>{
    try {
      const list=await published();
      return res.json({articles:list.map(({body,...data})=>data)});
    }catch(e){next(e);}
  });
  router.get('/api/actus/:slug',available,async(req,res,next)=>{
    try{
      if(!slugOk(req.params.slug)) return res.status(404).json({error:'Article introuvable'});
      const snap=await articles.doc(req.params.slug).get();
      if(!snap.exists || snap.data().status !== 'published') return res.status(404).json({error:'Article introuvable'});
      return res.json(snap.data());
    }catch(e){next(e);}
  });
  router.get('/actus',available,async(req,res,next)=>{
    try {
      const list=await published();
      res.set('Cache-Control','public, max-age=60');
      res.type('html').send(renderListing(list,{baseUrl}));
    }catch(e){next(e);}
  });
  router.get('/actus/studio',...editor,(req,res)=>res.type('html').send(renderStudio()));
  router.get('/actus/studio.js',...editor,(req,res)=>res.type('application/javascript').send(studioJs));
  router.get('/actus/:slug',available,async(req,res,next)=>{
    try{
      if(!slugOk(req.params.slug)) return res.status(404).send('Article introuvable');
      const snap=await articles.doc(req.params.slug).get();
      if(!snap.exists || snap.data().status !== 'published') return res.status(404).send('Article introuvable');
      res.set('Cache-Control','public, max-age=60');
      return res.type('html').send(renderArticle(snap.data(),{baseUrl}));
    }catch(e){next(e);}
  });
  router.get('/api/editor/actus',...editor,async(req,res,next)=>{
    try{
      const snap=await articles.limit(60).get();
      const list=snap.docs.map(d=>d.data()).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      return res.json({articles:list});
    }catch(e){next(e);}
  });
  router.post('/api/editor/actus',...editor,async(req,res,next)=>{
    try{
      const a=assertArticle(req.body);
      const now=new Date().toISOString();
      await articles.doc(a.slug).create({...a,status:'draft',revision:1,createdAt:now,updatedAt:now,publishedAt:null});
      return res.status(201).json({slug:a.slug,status:'draft'});
    }catch(e){
      if(e.code===6||e.code==='already-exists')return res.status(409).json({error:'Slug déjà utilisé'});
      if(isValidation(e)) return sendError(res,e);
      next(e);
    }
  });
  router.patch('/api/editor/actus/:slug',...editor,async(req,res,next)=>{
    try{
      const slug=String(req.params.slug||'');
      if(!slugOk(slug)) return res.status(404).json({error:'Article introuvable'});
      const result=await firestore.runTransaction(async tx=>{
        const ref=articles.doc(slug),snap=await tx.get(ref);
        if(!snap.exists) return {code:404,error:'Article introuvable'};
        const old=snap.data();
        if(!['draft','review'].includes(old.status)) return {code:409,error:'Article déjà publié'};
        const merged={...old,...req.body,slug};
        const a=assertArticle(merged);
        const revision=Number(old.revision||0)+1,updatedAt=new Date().toISOString();
        tx.update(ref,{...a,revision,updatedAt,status:'draft'});
        return {code:200,slug,status:'draft',revision};
      });
      return res.status(result.code).json(result);
    }catch(e){if(isValidation(e)) return sendError(res,e);next(e);}
  });
  router.post('/api/editor/actus/:slug/publish',...editor,async(req,res,next)=>{
    try{
      const slug=String(req.params.slug||'');
      if(!slugOk(slug)) return res.status(404).json({error:'Article introuvable'});
      const result=await firestore.runTransaction(async tx=>{
        const ref=articles.doc(slug), snap=await tx.get(ref);
        if(!snap.exists) return {code:404,error:'Article introuvable'};
        const old=snap.data();
        if(old.status==='published')return {code:200,slug,status:'published',alreadyPublished:true};
        if(!['draft','review'].includes(old.status))return {code:409,error:'Statut incompatible'};
        assertArticle(old,{publish:true});
        const now=new Date().toISOString(),revision=Number(old.revision||1);
        const eventId=`article_${slug}_r${revision}`;
        tx.update(ref,{status:'published',publishedAt:old.originalPublishedAt||now,updatedAt:now});
        tx.create(outbox.doc(eventId),{type:'article.published',articleSlug:slug,revision,
          createdAt:now,status:'paused',channels:[],attempts:0});
        return {code:200,slug,status:'published',eventId,social:'paused'};
      });
      return res.status(result.code).json(result);
    }catch(e){if(isValidation(e)) return sendError(res,e);next(e);}
  });
  // One-time migration endpoint for a legitimate export of JUSTPLAYER owned content.
  // Always dry-run before actual migration. Existing posts are never overwritten.
  router.post('/api/editor/actus/import',...editor,async(req,res,next)=>{
    try {
      const items=req.body?.articles;
      if(!Array.isArray(items)||items.length<1||items.length>20) return res.status(400).json({error:'Entre 1 et 20 articles par lot'});
      const dryRun=req.body?.dryRun!==false;
      const publish=req.body?.publish===true;
      const validated=[];
      const seenSlugs=new Set(),seenUrls=new Set();
      for(let i=0;i<items.length;i++){
        const item=items[i];
        if(!isLegacyJustPlayerUrl(item?.legacyUrl)) return res.status(400).json({index:i,error:'URL JustPlayer requise'});
        const a=assertArticle(item,{publish,legacyRequired:true});
        if(seenSlugs.has(a.slug)||seenUrls.has(a.legacyUrl))return res.status(400).json({index:i,error:'Doublon dans le lot'});
        seenSlugs.add(a.slug);seenUrls.add(a.legacyUrl);validated.push(a);
      }
      if(dryRun) return res.json({dryRun:true,articles:validated.map(a=>({slug:a.slug,legacyUrl:a.legacyUrl})),publishRequested:publish});
      const results=[];
      for(const a of validated){
        const importId=crypto.createHash('sha256').update(new URL(a.legacyUrl).pathname).digest('hex');
        try{
          const result=await firestore.runTransaction(async tx=>{
            const ref=articles.doc(a.slug),key=importKeys.doc(importId);
            const [existing,existingKey]=await Promise.all([tx.get(ref),tx.get(key)]);
            if(existing.exists||existingKey.exists)return {slug:a.slug,status:'skipped_existing'};
            const now=new Date().toISOString(),publishedAt=publish ? (a.originalPublishedAt||now) : null;
            tx.create(ref,{...a,status:publish?'published':'draft',revision:1,createdAt:now,updatedAt:now,publishedAt});
            tx.create(key,{slug:a.slug,legacyUrl:a.legacyUrl,createdAt:now});
            if(publish){
              tx.create(outbox.doc(`article_${a.slug}_r1`),{type:'article.published',articleSlug:a.slug,revision:1,
                createdAt:now,status:'paused',channels:[],attempts:0});
            }
            return {slug:a.slug,status:publish?'published':'draft'};
          });
          results.push(result);
        }catch(e){
          results.push({slug:a.slug,status:'failed',error:'Erreur de stockage, consulter les journaux'});
        }
      }
      return res.status(201).json({dryRun:false,results});
    }catch(e){if(isValidation(e))return sendError(res,e);next(e);}
  });
  return router;
}
module.exports={createNewsRouter};