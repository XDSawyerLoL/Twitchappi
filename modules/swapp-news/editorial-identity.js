'use strict';
/* SWAPP is the public editorial brand. Preserve historical source fields in storage.
 * Never replace a named person's byline; only retire legacy house-brand labels. */
const {slugify}=require('./article-core');
function isOldBrand(value){return /just\s*player/i.test(String(value||''))}
function publicArticle(article){
 if(!article)return article;
 const next={...article};
 if(isOldBrand(next.category))next.category='Actualités JV';
 if(!next.author||isOldBrand(next.author))next.author='Rédaction SWAPP';
 // Legacy source URL and the actual source remain preserved as provenance.
 if(isOldBrand(next.contentSource))next.contentSource='SWAPP';
 return next;
}
function recoveredArticle(article){
 if(!article)return article;
 return {...publicArticle(article),slug:nativeSlug(article)};
}
function nativeSlug(legacy){
 const raw=String(legacy?.slug||'').replace(/^justplayer-/,'');
 return slugify(raw||legacy?.title||'');
}
function legacyDraft(source){
 const copy=publicArticle(source),originalAuthor=source.author||null;
 return {...copy,slug:nativeSlug(source),category:copy.category||'Actualités JV',
  author:copy.author||'Rédaction SWAPP',legacyUrl:source.legacyUrl,
  originalPublishedAt:source.originalPublishedAt||source.publishedAt||null,
  sourceAuthor:originalAuthor,sourceSlug:source.slug,provenance:'legacy-editorial-copy',
  status:'draft'};
}
module.exports={publicArticle,recoveredArticle,nativeSlug,legacyDraft,isOldBrand};
