'use strict';
const crypto = require('node:crypto');
const {correctWoWForever}=require('./editorial-corrections');
const {assertArticle, renderArticle, renderListing, isLegacyJustPlayerUrl} = require('./article-core');
const {js:studioJs,renderStudio}=require('./editor-ui');
const {renderNewsHome,renderNewsStory,renderJustPlayerPreview}=require('./native-pages');
const {renderTwitchWatch,isTwitchLogin}=require('./watch');
const {collectPublicCatalog}=require('../../tools/justplayer-public-fetch');
const {makePublicCatalog}=require('./public-catalog');
const {recommend}=require('./content-metadata');
const catalog=require('../../data/justplayer-public-catalog.json');
const {createEditorialReleaseSync,loadEditorialReleases}=require('./editorial-release-sync');
const {createDiscordPublisher}=require('./discord-publisher');
const swappReleaseArticles=loadEditorialReleases();
const swappReleaseBySlug=new Map(swappReleaseArticles.map(article=>[article.slug,article]));
const {publicArticle,recoveredArticle,nativeSlug,legacyDraft}=require('./editorial-identity');
const {registerArticleScores}=require('./article-scores');
const {registerEditorInsights}=require('./editor-insights');
const {notifyIndexNow,invalidateSeoCache,cachedGameHubForArticle}=require('../swapp-seo');

function createNewsRouter({express, firestore, requireEditor, isReady = () => true, baseUrl = 'https://swapp.tv', publicFetch = globalThis.fetch, publicCatalog = catalog, canEdit = () => false, sendApp = null}) {
  if (typeof express?.Router !== 'function' || typeof firestore?.collection !== 'function' ||
      typeof firestore?.runTransaction !== 'function' || typeof requireEditor !== 'function') {
    throw new Error('Express, Firestore et authentification éditoriale obligatoires');
  }
  const router=express.Router();
  const justPlayerCache = new Map();
  // No scheduler: signal free IndexNow only after an editor's committed publication.
  // Never block an editorial action if the external indexing service is unreachable.
  const signalIndexing=slugs=>{
    // Locally refresh all public sitemaps, including Google News and RSS,
    // even when IndexNow outbound notifications are disabled.
    invalidateSeoCache();
    if(process.env.NODE_ENV!=='production'||process.env.SWAPP_INDEXNOW_ENABLED==='false')return;
    notifyIndexNow(slugs).then(status=>{
      if(status.attempted&&!status.accepted)
        console.warn('[SWAPP INDEXNOW] Search-engine notification not accepted:',status.status||status.reason);
    }).catch(error=>console.warn('[SWAPP INDEXNOW] Notification unavailable:',error?.message));
  };
  const articles=firestore.collection('swapp_news_articles');
  const outbox=firestore.collection('swapp_news_outbox');
  const importKeys=firestore.collection('swapp_news_import_keys');
  const discordPublisher=createDiscordPublisher({firestore,articles,baseUrl,isReady});
  const releaseSync=createEditorialReleaseSync({firestore,articles,releaseArticles:swappReleaseArticles,
    recordDiscordPublication:discordPublisher.recordPublication});
  discordPublisher.start();
  // SWAPP already serves these editor-reviewed articles publicly. When the
  // production magazine loads, adopt only still-missing records into the
  // existing CMS collection. Existing edits, drafts and withdrawals win.
  // A temporary storage failure leaves the verified public fallback intact.
  const ensureReleaseEditable=async()=>{
    if(process.env.NODE_ENV!=='production'||!isReady())return;
    try{
      const result=await releaseSync.sync();
      if(result.created>0)discordPublisher.kick();
    }catch(error){console.warn('[SWAPP EDITORIAL] Adoption CMS reportee:',String(error?.message||error).slice(0,180));}
  };
  const publicNews=makePublicCatalog({catalog:publicCatalog,fetchImpl:publicFetch});
  const slugOk = s => /^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
  const available=(req,res,next)=>isReady() ? next() : res.status(503).json({error:'news_storage_unavailable'});
  const sendError=(res,e)=>res.status(400).json({error:e.message || 'Article invalide'});
  const isValidation=e=>/Article|Titre|Slug|source|URL|Résumé|Crédit|droits|Date|JustPlayer|Contenu|Type de publication|vidéo|commercial|liens|Lien/.test(String(e?.message||''));
  const published=async()=>{
    await ensureReleaseEditable();
    const snap=await articles.where('status','==','published').limit(500).get();
    const original=snap.docs.map(x=>x.data());
    const oldUrls=new Set(original.map(x=>x.legacyUrl).filter(Boolean));
    // Once every known historical post has a native, published SWAPP copy,
    // avoid requesting the retired external site on every magazine load.
    const remainingKnown=(publicCatalog.items||[]).filter(x=>x.type==='post'&&!oldUrls.has(x.url));
    if(remainingKnown.length)await publicNews.scanBatch();
    const oldTitles=new Set(original.map(x=>String(x.title||'').toLowerCase()));
    // Removing a previously published native article must not resurrect
    // the old read-through copy from the historical source.
    const all=await articles.limit(500).get();
    const withdrawn=all.docs.map(d=>d.data()).filter(a=>a.legacySuppressRecovery===true);
    const withdrawnUrls=new Set(withdrawn.map(a=>a.legacyUrl).filter(Boolean));
    const withdrawnTitles=new Set(withdrawn.map(a=>String(a.title||'').toLowerCase()));
    const recovered=publicNews.articles().filter(x=>!oldUrls.has(x.legacyUrl)
      &&!oldTitles.has(String(x.title||'').toLowerCase())
      &&!withdrawnUrls.has(x.legacyUrl)
      &&!withdrawnTitles.has(String(x.title||'').toLowerCase()));
    // Versioned editorial release follows the usual native rendering paths.
    // Never resurrect an article explicitly withdrawn or overwrite a Firestore draft.
    const allSlugs=new Set(all.docs.map(d=>String(d.id||d.data()?.slug||'')));
    const editorialFallback=swappReleaseArticles.filter(item=>!allSlugs.has(item.slug)
      &&!oldTitles.has(String(item.title||'').toLowerCase())
      &&!withdrawnTitles.has(String(item.title||'').toLowerCase()));
    return [...original.map(publicArticle),...editorialFallback.map(publicArticle),...recovered.map(recoveredArticle)]
      .map(correctWoWForever)
      .sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
  };
  // Recommendations from published SWAPP records and recovered articles already cached.
  // Does not initiate any remote fetch of the retired publishing platform.
  const relatedTo=async current=>{
    const snapshot=await articles.where('status','==','published').limit(80).get();
    const candidates=[...snapshot.docs.map(d=>publicArticle(d.data())),
      ...swappReleaseArticles.map(publicArticle),...publicNews.articles().map(recoveredArticle)];
    const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const game=norm(current.game),category=norm(current.category);
    const words=new Set(norm(current.title).split(' ').filter(x=>x.length>=5));
    const seen=new Set(),filtered=[];
    for(const item of candidates){
      if(!item||item.slug===current.slug||item.legacyUrl&&item.legacyUrl===current.legacyUrl)continue;
      if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(item.slug||'')))continue;
      const key=norm(item.title);if(!key||seen.has(key))continue;seen.add(key);
      filtered.push(item);
    }
    const score=x=>(game&&norm(x.game)===game?12:0)
      +(category&&norm(x.category)===category?2:0)
      +Math.min(3,norm(x.title).split(' ').filter(t=>words.has(t)).length);
    return filtered.sort((a,b)=>score(b)-score(a)
      ||String(b.publishedAt||b.originalPublishedAt||'').localeCompare(String(a.publishedAt||a.originalPublishedAt||''))).slice(0,3);
  };
  const storyHtml=async item=>renderNewsStory(item,{baseUrl,relatedArticles:await relatedTo(item),gameHubUrl:cachedGameHubForArticle(item)});
  const noStore=(_req,res,next)=>{res.set('Cache-Control','no-store');next();};
  const editor=[available,requireEditor,noStore];

  registerArticleScores({router,firestore,articles,publicNews,available,baseUrl,nativeSlug});
  registerEditorInsights({router,firestore,articles,editor});
  router.get('/api/actus/recovery-status',(_req,res)=>res.json(publicNews.status()));
  // Public, read-only proof of CMS adoption. Does not expose draft content,
  // credentials or unpublished editorial information.
  router.get('/api/actus/release-status',available,async(req,res,next)=>{
    try{
      res.set('Cache-Control','no-store');
      await ensureReleaseEditable();
      const states=await Promise.all(swappReleaseArticles.map(async item=>{
        const document=await articles.doc(item.slug).get();
        return {slug:item.slug,editableInStudio:document.exists};
      }));
      return res.json({releaseCount:states.length,editableCount:states.filter(x=>x.editableInStudio).length,articles:states});
    }catch(error){next(error);}
  });
  router.get('/api/actus',available,async(req,res,next)=>{
    try {
      const list=await published();
      return res.json({articles:list.map(({body,...data})=>data)});
    }catch(e){next(e);}
  });
  router.get('/api/actus/:slug',available,async(req,res,next)=>{
    try{
      if(!slugOk(req.params.slug)) return res.status(404).json({error:'Article introuvable'});
      const slug=String(req.params.slug);
      const canonical=slug.startsWith('justplayer-')?nativeSlug({slug}):slug;
      const exact=await articles.doc(slug).get();
      if(exact.exists&&exact.data().status==='published')
        return res.json(correctWoWForever(publicArticle(exact.data())));
      const snap=canonical!==slug?await articles.doc(canonical).get():exact;
      if(snap.exists&&snap.data().status==='published')
        return res.json(correctWoWForever(publicArticle(snap.data())));
      if((exact.exists&&exact.data().legacySuppressRecovery)
        ||(snap.exists&&snap.data().legacySuppressRecovery))
        return res.status(404).json({error:'Article retiré du magazine'});
      if(!exact.exists&&!snap.exists&&swappReleaseBySlug.has(slug))
        return res.json(publicArticle(swappReleaseBySlug.get(slug)));
      const historicalSlug=slug.startsWith('justplayer-')?slug:'justplayer-'+slug;
      const original=await publicNews.get(historicalSlug);
      return original?res.json(recoveredArticle(original)):res.status(404).json({error:'Article introuvable'});
    }catch(e){next(e);}
  });
  // One canonical UI for direct navigation and SPA navigation.
  router.get('/actus',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(typeof sendApp==='function')return sendApp(res);
    return next(new Error('SWAPP app renderer unavailable'));
  });
  // Shows only the connected user's own identity for secure, pinned admin setup.
  // This route never grants any permission and never returns a password or token.
  router.get('/api/editor/actus/identity',(req,res)=>{
    res.set('Cache-Control','no-store');
    const user=req.session?.oryonUser;
    return res.json({authenticated:!!user?.id,login:user?.login||null,userId:user?.id||null});
  });
  router.get('/api/editor/actus/access',(req,res)=> {
    res.set('Cache-Control','no-store');
    return res.json({authenticated: Boolean(req.session?.oryonUser?.login),canEdit:Boolean(canEdit(req))});
  });
  router.get('/actus/justplayer/:key',available,async(req,res,next)=>{
    try{
      const key=String(req.params.key||'');
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || key.length>150)return res.status(404).send('Publication introuvable');
      const canonical=nativeSlug({slug:'justplayer-'+key});
      const saved=await articles.doc(canonical).get();
      if(saved.exists&&saved.data().status==='published')
        return res.redirect(301,'/actus/'+encodeURIComponent(canonical));
      if(saved.exists&&saved.data().legacySuppressRecovery)
        return res.status(404).send('Article retiré du magazine');
      const item=(publicCatalog.items||[]).find(x=>
        ['post','video_embed'].includes(x?.type) &&
        String(x.url||'').split('/').filter(Boolean).at(-1)===key);
      if(!item)return res.status(404).send('Publication introuvable');
      res.set('Cache-Control','public, max-age=90');
      let article=null;
      if(item.type==='post' && typeof publicFetch==='function'){
        const cached=justPlayerCache.get(key);
        if(cached && cached.expires>Date.now())article=cached.article;
        else{
          const scanned=await collectPublicCatalog({items:[item]},
            {fetchImpl:publicFetch,timeoutMs:5500,maxBytes:1100000});
          article=scanned.articles?.[0]||null;
          if(justPlayerCache.size>40)justPlayerCache.clear();
          justPlayerCache.set(key,{article,expires:Date.now()+(article?20:4)*60000});
        }
      }
      return article && article.body?.length>=220 ? res.type('html').send(await storyHtml(recoveredArticle({...article,slug:'justplayer-'+key,publishedAt:item.publishedAt}))) : res.type('html').send(renderJustPlayerPreview(item,null));
    }catch(e){
      // An unavailable Fourthwall page should not make the SWAPP article route fail.
      const key=String(req.params.key||'');
      const item=(publicCatalog.items||[]).find(x=>String(x.url||'').split('/').filter(Boolean).at(-1)===key);
      if(!item)return next(e);
      return res.type('html').send(renderJustPlayerPreview(item,null));
    }
  });
  router.get('/live/twitch/:login',(req,res)=>{
    const login=String(req.params.login||'').trim().toLowerCase();
    if(!isTwitchLogin(login))return res.status(404).send('Live introuvable');
    res.set('Cache-Control','no-store');
    return res.type('html').send(renderTwitchWatch(login,{game:req.query?.game}));
  });
  router.get('/actus/studio',...editor,(req,res)=>res.set('Cache-Control','private, no-store').type('html').send(renderStudio()));
  router.get('/actus/studio.js',...editor,(req,res)=>res.set('Cache-Control','private, no-store').type('application/javascript').send(studioJs));
  router.get('/actus/:slug',available,async(req,res,next)=>{
    try{
      if(!slugOk(req.params.slug)) return res.status(404).send('Article introuvable');
      const slug=String(req.params.slug);
      const canonical=slug.startsWith('justplayer-')?nativeSlug({slug}):slug;
      const exact=await articles.doc(slug).get();
      if(exact.exists&&exact.data().status==='published'){
        res.set('Cache-Control','public, max-age=60');
        return res.type('html').send(await storyHtml(publicArticle(exact.data())));
      }
      const snap=canonical!==slug?await articles.doc(canonical).get():exact;
      if(snap.exists&&snap.data().status==='published'){
        if(canonical!==slug)return res.redirect(301,'/actus/'+encodeURIComponent(canonical));
        res.set('Cache-Control','public, max-age=60');
        return res.type('html').send(await storyHtml(publicArticle(snap.data())));
      }
      if((exact.exists&&exact.data().legacySuppressRecovery)
        ||(snap.exists&&snap.data().legacySuppressRecovery))
        return res.status(404).send('Article retiré du magazine');
      if(!exact.exists&&!snap.exists&&swappReleaseBySlug.has(slug)){
        res.set('Cache-Control','public, max-age=60');
        return res.type('html').send(await storyHtml(publicArticle(swappReleaseBySlug.get(slug))));
      }
      const historicalSlug=slug.startsWith('justplayer-')?slug:'justplayer-'+slug;
      const original=await publicNews.get(historicalSlug);
      return original?res.type('html').send(await storyHtml(recoveredArticle(original))):
        res.status(404).send('Article introuvable');
    }catch(e){next(e);}
  });
  // Suggest games and tags without external APIs or tracking.
  // Only authenticated editors may submit unpublished text for analysis.
  // Read-only preflight: use the EXACT publication validator, no DB writes.
  // Editors can see missing sources, images, rights or media URLs before saving.
  // Secret-free status for SWAPP administrators. Does not emit a Discord message.
  router.get('/api/editor/actus/discord/status',...editor,(req,res)=>{
    res.json({discord:discordPublisher.status()});
  });
  router.post('/api/editor/actus/validate',...editor,(req,res)=>{
    try{
      const validated=assertArticle(req.body,{publish:true});
      return res.json({valid:true,slug:validated.slug,contentType:validated.contentType,
        games:validated.games,tags:validated.tags,seo:validated.seo,
        mediaReady:!['video','trailer'].includes(validated.contentType)||!!validated.trailerUrl});
    }catch(error){
      if(isValidation(error))return res.status(422).json({valid:false,error:String(error.message)});
      return res.status(400).json({valid:false,error:'Contenu invalide'});
    }
  });
  router.post('/api/editor/actus/suggest',...editor,(req,res)=>{
    const input=req.body||{};
    const suggestion=recommend({
      title:String(input.title||'').slice(0,180),
      summary:String(input.summary||'').slice(0,420),
      body:String(input.body||'').slice(0,4000),
      game:String(input.game||'').slice(0,120),
      tags:Array.isArray(input.tags)?input.tags:[]
    });
    return res.json({suggestion});
  });
  router.get('/api/editor/actus',...editor,async(req,res,next)=>{
    try{
      await ensureReleaseEditable();
      const snap=await articles.limit(500).get();
      const stored=snap.docs.map(d=>publicArticle(d.data()));
      const present=new Set(snap.docs.map(d=>d.id));
      // In the event of a temporary CMS outage, Studio can still show the
      // original released articles. The next successful load adopts them.
      const pending=process.env.NODE_ENV==='production'
        ? swappReleaseArticles.filter(a=>!present.has(a.slug)).map(publicArticle)
        : [];
      const list=[...stored,...pending].sort((a,b)=>String(b.updatedAt||b.publishedAt||'').localeCompare(String(a.updatedAt||a.publishedAt||'')));
      return res.json({articles:list});
    }catch(e){next(e);}
  });
  // Historical sources remain read-only until explicitly copied to SWAPP Firestore.
  // No automatic account closure, deletion or publishing occurs here.
  router.get('/api/editor/actus/legacy-status',...editor,async(req,res,next)=>{
    try{
      await publicNews.scanBatch();
      const snap=await articles.limit(500).get();
      const stored=snap.docs.map(doc=>doc.data());
      const storedSlugs=new Set(stored.map(a=>a.slug));
      const storedUrls=new Set(stored.map(a=>a.legacyUrl).filter(Boolean));
      const recovered=publicNews.articles();
      const pending=recovered.filter(a=>!storedUrls.has(a.legacyUrl)&&!storedSlugs.has(nativeSlug(a)));
      const recoveredPublished=recovered.filter(a=>stored.some(item=>
        item.status==='published'&&(item.legacyUrl===a.legacyUrl||item.slug===nativeSlug(a)))).length;
      return res.json({
        known:publicNews.allKnown,verified:recovered.length,
        native:recovered.length-pending.length,nativePublished:recoveredPublished,
        pending:pending.map(a=>({
          slug:a.slug,title:a.title,legacyUrl:a.legacyUrl,publishedAt:a.publishedAt,
          nativeSlug:nativeSlug(a)
        })),
        unavailable:publicNews.status().errors,
        readyToClose:false, // Partial public catalog != verified full Fourthwall export.
        complete:false,
        note:'La fermeture externe nécessite un contrôle exhaustif du compte d’origine.'
      });
    }catch(e){next(e)}
  });
  router.post('/api/editor/actus/adopt',...editor,async(req,res,next)=>{
    try{
      const legacySlug=String(req.body?.slug||'');
      if(!/^justplayer-[a-z0-9-]{4,140}$/.test(legacySlug))
        return res.status(400).json({error:'Publication historique inconnue'});
      // Resolve the exact known, verified source server-side (not user-supplied article text).
      const recovered=await publicNews.get(legacySlug);
      if(!recovered||!recovered.body||recovered.body.length<220)
        return res.status(404).json({error:'Texte intégral non récupéré'});
      const original=legacyDraft(recovered);
      const draft=assertArticle(original);
      const now=new Date().toISOString();
      const result=await firestore.runTransaction(async tx=>{
        const ref=articles.doc(draft.slug),snap=await tx.get(ref);
        if(snap.exists)return {slug:draft.slug,status:'already_exists'};
        tx.create(ref,{...draft,sourceAuthor:original.sourceAuthor,sourceSlug:legacySlug,
          provenance:'legacy-editorial-copy',status:'draft',revision:1,
          createdAt:now,updatedAt:now,publishedAt:null});
        return {slug:draft.slug,status:'draft'};
      });
      return res.status(result.status==='draft'?201:200).json(result);
    }catch(e){if(isValidation(e))return sendError(res,e);next(e)}
  });
  // Explicit, authenticated, read-only scan of known Fourthwall public posts.
  router.post('/api/editor/actus/scan-public',...editor,async(req,res,next)=>{
    try {
      if(typeof publicFetch !== 'function') return res.status(503).json({error:'public_fetch_unavailable'});
      const all=(publicCatalog.items||[]).filter(item=>item.type==='post');
      const offset=Math.max(0,Math.min(all.length,Number.parseInt(req.body?.offset,10)||0));
      const asked=Number.parseInt(req.body?.limit,10)||2;
      const limit=Math.min(3,Math.max(1,asked));
      const scan=await collectPublicCatalog({items:all.slice(offset,offset+limit)},
        {fetchImpl:publicFetch,timeoutMs:6000,maxBytes:1600000});
      const nextOffset=Math.min(all.length,offset+limit);
      return res.json({success:true,offset,nextOffset,done:nextOffset>=all.length,
        total:all.length,checked:scan.postsChecked,articles:scan.articles,failures:scan.failures,
        notice:'Extraction sans écriture : relire les textes avant import.'});
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
        if(!['draft','review','published'].includes(old.status)) return {code:409,error:'Statut incompatible'};
        const merged={...old,...req.body,slug};
        const a=assertArticle(merged,{publish:old.status==='published'});
        const revision=Number(old.revision||0)+1,updatedAt=new Date().toISOString();
        tx.update(ref,{...a,revision,updatedAt,status:old.status,publishedAt:old.publishedAt||null});
        return {code:200,slug,status:old.status,revision};
      });
      if(result.code===200&&result.status==='published')signalIndexing([slug]);
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
        // Atomically schedule Discord only for the initial publication of a slug.
        await discordPublisher.recordPublication(tx,{...old,slug},now);
        tx.update(ref,{status:'published',publishedAt:old.originalPublishedAt||now,updatedAt:now,legacySuppressRecovery:false});
        tx.create(outbox.doc(eventId),{type:'article.published',articleSlug:slug,revision,
          createdAt:now,status:'paused',channels:[],attempts:0});
        return {code:200,slug,status:'published',eventId,social:'paused'};
      });
      if(result.code===200&&!result.alreadyPublished&&result.status==='published'){
        signalIndexing([slug]);
        discordPublisher.kick();
      }
      return res.status(result.code).json(result);
    }catch(e){if(isValidation(e)) return sendError(res,e);next(e);}
  });
  router.post('/api/editor/actus/:slug/unpublish',...editor,async(req,res,next)=>{
    try{
      const slug=String(req.params.slug||'');
      if(!slugOk(slug))return res.status(404).json({error:'Article introuvable'});
      const result=await firestore.runTransaction(async tx=>{
        const ref=articles.doc(slug),snap=await tx.get(ref);
        if(!snap.exists)return {code:404,error:'Article introuvable'};
        if(snap.data().status!=='published')return {code:409,error:'Article non publié'};
        const revision=Number(snap.data().revision||1)+1;
        tx.update(ref,{status:'draft',revision,updatedAt:new Date().toISOString(),legacySuppressRecovery:!!snap.data().legacyUrl});
        return {code:200,slug,status:'draft',revision};
      });
      if(result.code===200&&result.status==='draft')signalIndexing([slug]);
      return res.status(result.code).json(result);
    }catch(e){next(e);}
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
      const newlyPublished=results.filter(r=>r.status==='published').map(r=>r.slug);
      if(newlyPublished.length)signalIndexing(newlyPublished);
      return res.status(201).json({dryRun:false,results});
    }catch(e){if(isValidation(e))return sendError(res,e);next(e);}
  });
  return router;
}
module.exports={createNewsRouter};