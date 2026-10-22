/* Shared read-only article media and editorial commerce.
 * Both the SWAPP client and Node SSR use exactly the same validation rules.
 */
'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappArticleExtras=api;
})(typeof window!=='undefined'?window:null,function(){
 const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>ESC[c]);
 const amazonDisclosure='En tant que Partenaire Amazon, je réalise un bénéfice sur les achats remplissant les conditions requises.';
 function isAmazonLink(value){
  let u;try{u=new URL(String(value||''))}catch{return false}
  if(u.protocol!=='https:'||u.username||u.password)return false;
  const host=u.hostname.toLowerCase();
  return /^(?:www\.)?amazon\.(?:fr|com|co\.uk|de|es|it|nl|be|se|pl)$/.test(host) ||
   ['amzn.to','amzn.eu','link.amazon'].includes(host);
 }
 function trailerId(value){
  if(!value)return null;
  let u;try{u=new URL(String(value))}catch{return null}
  if(u.protocol!=='https:'||u.username||u.password)return null;
  const domain=u.hostname.toLowerCase();
  let id='';
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(domain)){
   if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
   else if(/^\/(embed|shorts)\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.split('/')[2];
  }else if(domain==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.slice(1);
  else if(domain==='www.youtube-nocookie.com'&&/^\/embed\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.split('/')[2];
  return /^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
 }
 // A video backdrop is attached ONLY when the editor actually supplied
 // a valid YouTube URL. Never reuse a neighbouring game's trailer.
 // Works for ordinary articles as well as video/trailer content types.
 function heroTrailerId(article){
  return trailerId(article?.trailerUrl);
 }

 // Card media is deliberately independent of the full-bleed article artwork.
 // Use a verified YouTube video id only from this article.
 function cardImageSources(article){
  const out=[];
  for(const raw of [article?.thumbnail?.url,article?.image?.url,article?.imageUrl]){
   let source='';
   try{
    const u=new URL(String(raw||''));
    if(u.protocol==='https:'&&!u.username&&!u.password)source=u.href;
   }catch(_){}
   if(source&&!out.includes(source))out.push(source);
  }
  const id=trailerId(article?.trailerUrl);
  if(id)out.push('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg','https://img.youtube.com/vi/'+id+'/hqdefault.jpg');
  return [...new Set(out)];
 }
 function isGameArticle(article){
  if(String(article?.game||'').trim())return true;
  if(Array.isArray(article?.games)&&article.games.some(x=>String(x||'').trim()))return true;
  const category=String(article?.category||'').toLowerCase();
  if(/\b(?:jv|jeux?|gaming)\b/i.test(category))return true;
  return Array.isArray(article?.tags)&&article.tags.some(x=>
   /^(?:jeu[x]? vid[eé]o|gaming|jv)$/i.test(String(x||'').trim()));
 }
 function commercialLinks(links,strict=false){
  if(links==null)return [];
  if(!Array.isArray(links)||links.length>2){if(strict)throw Error('Deux liens commerciaux maximum');return []}
  const out=[];
  for(const link of links){
   const title=String(link?.title||'').trim().slice(0,100);
   const merchant=String(link?.merchant||'').trim().slice(0,70);
   const kind=String(link?.kind||'');
   let url;
   try{const u=new URL(String(link?.url||''));if(u.protocol!=='https:'||u.username||u.password)throw Error();url=u.href}catch{}
   if(!title||!merchant||!url||!['affiliate','sponsored'].includes(kind)){
    if(strict)throw Error('Lien commercial : titre, annonceur, URL HTTPS et nature obligatoires');
    continue;
   }
   out.push({title,merchant,kind,url});
  }
  return out;
 }
 // The cinematic trailer lives in the hero only; never repeat it below.
 function editorialVerdictHtml(a){
  const verdict=a?.editorialVerdict;
  const score=verdict?.score,explanation=String(verdict?.text||'').trim();
  if(!Number.isInteger(score)||score<1||score>5||explanation.length<35)return '';
  const label=['','Décevant','Perfectible','Solide','Remarquable','Référence'][score];
  const segments=Array.from({length:5},(_,i)=>
   '<span class="swapp-verdict-segment'+(i<score?' is-lit':'')+'" aria-hidden="true"></span>').join('');
  return '<section class="swapp-editorial-verdict" aria-label="Verdict de la rédaction SWAPP sur le jeu : '+
   score+' sur 5">'+
   '<div class="swapp-verdict-heading"><div><span class="swapp-verdict-kicker">VERDICT DE LA RÉDACTION</span>'+
   '<h2>Le regard SWAPP sur '+escape(a?.game||'ce jeu')+'</h2></div>'+
   '<strong class="swapp-verdict-number">'+score+'<small> / 5</small></strong></div>'+
   '<div class="swapp-verdict-meter" role="img" aria-label="'+score+' segments sur 5, '+label+'">'+segments+
   '<span class="swapp-verdict-word">'+label+'</span></div>'+
   '<p class="swapp-verdict-reason">'+escape(explanation)+'</p>'+
   '<small class="swapp-verdict-signature">Analyse de la rédaction SWAPP · Note attribuée au jeu, pas à l’article</small>'+
   '</section>';
 }
 function sourcesHtml(a){
  const entries=Array.isArray(a?.sources)?a.sources:[];
  const links=entries.map(source=>{
   let url;try{const u=new URL(String(source?.url||''));if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';url=u.href}catch{return ''}
   let host='Source';try{host=new URL(url).hostname.replace(/^www\./,'')}catch(_){}
   return '<a href="'+escape(url)+'" target="_blank" rel="nofollow noopener noreferrer">'+
    escape(String(source?.label||'').trim()==='Source'||!String(source?.label||'').trim()?host:source.label)+' ↗</a>';
  }).filter(Boolean);
  if(!links.length)return '';
  return '<details id="swapp-article-sources" class="swapp-editorial-sources"><summary>'+
   (links.length===1?'1 référence vérifiable':links.length+' références vérifiables')+
   '</summary><div class="swapp-editorial-source-links">'+links.join('')+'</div></details>';
 }
 // Prevent editorial product mismatches: a confirmed Cyberpunk article should
 // never promote an Instant Gaming link explicitly naming Crimson Desert.
 // Only enforce where the merchant URL contains a meaningful product slug;
 // preserve other merchants and brand/franchise variants such as Witcher 3.
 function affiliateMatchesArticleGame(link,article){
  let url;try{url=new URL(String(link?.url||''))}catch{return true}
  if(!/^(?:www\.)?instant-gaming\.com$/i.test(url.hostname))return true;
  const product=url.pathname.match(/\/\d+-acheter-([^/]+)/i);
  if(!product)return true;
  const game=typeof article?.game==='string'?article.game:String(article?.game?.name||article?.game?.title||'');
  if(!game.trim())return true;
  const tokens=text=>String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const stop=new Set(['deluxe','edition','enhanced','ultimate','complete','standard','remastered','remake','game','games','with','from','steam','digital','bundle']);
  const gameParts=tokens(game).filter(t=>t.length>=5&&!stop.has(t));
  if(!gameParts.length)return true;
  const offerParts=new Set(tokens(decodeURIComponent(product[1])));
  return gameParts.some(t=>offerParts.has(t));
 }
 // Editor-supplied affiliate links use the same small purchase rail as
 // verified catalog offers. They are NOT separate advertising panels.
 function partnerOffersHtml(a){
  return commercialLinks(a?.commercialLinks).filter(link=>affiliateMatchesArticleGame(link,a)).map(link=>{
   let hostname='';
   try{hostname=new URL(link.url).hostname.toLowerCase()}catch(_){}
   const ig=hostname==='instant-gaming.com'||hostname==='www.instant-gaming.com';
   const affiliate=link.kind==='affiliate';
   const label=!affiliate?'PUBLICITÉ · PARTENARIAT':ig?
    'OFFRE INSTANT GAMING · LIEN AFFILIÉ':isAmazonLink(link.url)?
    'OFFRE AMAZON · LIEN AFFILIÉ':'OFFRE PARTENAIRE · LIEN AFFILIÉ';
   const disclosure=isAmazonLink(link.url)?
    '<small class="swapp-amazon-disclosure">'+escape(amazonDisclosure)+'</small>':'';
   return '<aside class="swapp-affiliate-offer swapp-affiliate-manual" aria-label="'+
    escape(link.merchant+' · '+(affiliate?'lien affilié':'publicité'))+'">'+
    '<span class="swapp-affiliate-kicker">'+label+'</span>'+
    '<strong class="swapp-affiliate-game">'+escape(link.title)+'</strong>'+
    '<span class="swapp-affiliate-platform">'+escape(link.merchant)+'</span>'+
    '<a class="swapp-affiliate-link" href="'+escape(link.url)+
    '" target="_blank" rel="sponsored nofollow noopener noreferrer">Voir l’offre ↗</a>'+
    disclosure+'</aside>';
  }).join('');
 }
 function discussionHtml(article){
  const slug=String(article?.slug||'');
  if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return '';
  return '<p class="swapp-article-discuss"><a href="/social?article='+encodeURIComponent(slug)+'">En discuter avec la communauté SWAPP →</a></p>';
 }
 function renderServer(article){return sourcesHtml(article)+editorialVerdictHtml(article)}
 function mount(node,article){
  if(typeof document==='undefined'||!node)return;
  const parser=document.createElement('div');
  parser.innerHTML=renderServer(article);
  node.append(...parser.childNodes);
 }
 function activate(button){
  if(!button||button.dataset.swappLoaded==='1')return;
  const id=String(button.dataset.swappTrailerId||'');
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;
  button.dataset.swappLoaded='1';
  const iframe=document.createElement('iframe');
  iframe.className='swapp-trailer-player';
  iframe.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&playsinline=1';
  iframe.title='Bande-annonce vidéo';iframe.loading='lazy';
  iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
  button.replaceWith(iframe);
 }
 async function shareEditorial(button){
  if(!button||button.disabled||typeof document==='undefined')return;
  const article=button.closest('[data-swapp-article-slug]');
  const slug=String(article?.dataset?.swappArticleSlug||'');
  if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return;
  const url='https://swapp.tv/actus/'+encodeURIComponent(slug);
  const title=String(document.querySelector('h1.article-title')?.textContent||document.title||'SWAPP');
  button.disabled=true;
  try{
   if(typeof navigator!=='undefined'&&typeof navigator.share==='function'){
    try{await navigator.share({title,url});return;}
    catch(error){if(error?.name==='AbortError')return;}
   }
   if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(url);
    button.textContent='Lien copié ✓';
    // Repeated sharing is optional; no analytics or background activity.
    return;
   }
   // Browsers without clipboard APIs: reveal a safe, selectable URL.
   const link=document.createElement('input');
   link.type='text';link.readOnly=true;link.value=url;link.className='swapp-share-fallback';
   link.setAttribute('aria-label',"Adresse de l’article à copier");
   button.after(link);link.focus();link.select();
  }catch(_){
   button.textContent='Partage indisponible';
  }finally{button.disabled=false}
 }
 if(typeof document!=='undefined'){
  // YouTube's alternate thumbnail host serves the same official video image.
  // Recover failed SSR posters and dynamically inserted RSS cards once,
  // without rehosting media or substituting another game's artwork.
  function recoverYouTubeThumbnail(img){
   if(!img||img.tagName!=='IMG')return;
   let url;try{url=new URL(String(img.src||''))}catch(_){return;}
   if(url.protocol!=='https:'||url.hostname!=='i.ytimg.com'||
      !/^\/vi\/[A-Za-z0-9_-]{11}\/[A-Za-z0-9_-]+\.jpg$/.test(url.pathname))return;
   url.hostname='img.youtube.com';
   img.src=url.href;
  }
  document.addEventListener('error',event=>recoverYouTubeThumbnail(event.target),true);
  const recoverInitialThumbnails=()=>document.querySelectorAll('img').forEach(img=>{
   if(img.complete&&img.naturalWidth===0)recoverYouTubeThumbnail(img);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recoverInitialThumbnails,{once:true});
  else recoverInitialThumbnails();
  document.addEventListener('click',event=>{
   const target=event.target;
   const share=target.closest?.('[data-swapp-article-share]');
   if(share){shareEditorial(share);return;}
   const button=target.closest?.('.swapp-trailer-launch');
   if(button)activate(button);
  });
 }
 return Object.freeze({trailerId,heroTrailerId,isGameArticle,cardImageSources,commercialLinks,partnerOffersHtml,isAmazonLink,amazonDisclosure,renderServer,mount});
});

