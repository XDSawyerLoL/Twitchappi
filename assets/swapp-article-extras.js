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
 function trailerHtml(a){
  const id=trailerId(a?.trailerUrl);
  if(!id)return '';
  const thumb='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
  const title=escape(a?.title||'Vidéo SWAPP');
  return '<section class="swapp-article-extra swapp-article-video" aria-label="Vidéo intégrée">'+
   '<div class="swapp-trailer-heading"><span>SWAPP · VIDÉO</span><h2>Regarder la bande-annonce</h2>'+
   '<p>Une vidéo sélectionnée par la rédaction. La lecture commence uniquement après ton clic.</p></div>'+
   '<div class="swapp-trailer-stage"><button class="swapp-trailer-launch" type="button" data-swapp-trailer-id="'+id+'" aria-label="Lancer la vidéo : '+title+'">'+
   '<img class="swapp-trailer-thumb" src="'+thumb+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'+
   '<span class="swapp-trailer-overlay"><span class="swapp-trailer-icon" aria-hidden="true">▶</span>'+
   '<span class="swapp-trailer-watch">Lire la vidéo</span></span></button></div>'+
   '<p class="swapp-trailer-origin">Bande-annonce hébergée sur YouTube · <a href="https://www.youtube.com/watch?v='+id+'" target="_blank" rel="noopener noreferrer">Ouvrir sur YouTube ↗</a></p>'+
   '</section>';
 }
 function linkHtml(a){
  const links=commercialLinks(a?.commercialLinks);
  if(!links.length)return '';
  return '<aside class="swapp-article-extra swapp-article-commerce" aria-label="Liens commerciaux sélectionnés"><h2>Pour aller plus loin</h2>'+
   '<p>La rédaction choisit ces liens indépendamment de ses articles. Les liens rémunérés sont identifiés et n’influencent pas les conclusions éditoriales.</p>'+
   '<div class="swapp-article-deals">'+links.map(link=>
    '<a href="'+escape(link.url)+'" target="_blank" rel="sponsored nofollow noopener noreferrer"><span class="swapp-deal-type">'+(link.kind==='sponsored'?'PUBLICITÉ · PARTENARIAT RÉMUNÉRÉ':'LIEN AFFILIÉ · COMMISSION POSSIBLE')+'</span>'+
    '<strong>'+escape(link.title)+'</strong><small>'+escape(link.merchant)+' ↗</small></a>'
   ).join('')+'</div></aside>';
 }
 function discussionHtml(article){
  const slug=String(article?.slug||'');
  if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return '';
  return '<p class="swapp-article-discuss"><a href="/communaute?article='+encodeURIComponent(slug)+'">En discuter avec la communauté SWAPP →</a></p>';
 }
 function renderServer(article){return trailerHtml(article)+linkHtml(article)+discussionHtml(article)}
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
  document.addEventListener('click',event=>{
   const target=event.target;
   const share=target.closest?.('[data-swapp-article-share]');
   if(share){shareEditorial(share);return;}
   const button=target.closest?.('.swapp-trailer-launch');
   if(button)activate(button);
  });
 }
 return Object.freeze({trailerId,commercialLinks,renderServer,mount});
});
