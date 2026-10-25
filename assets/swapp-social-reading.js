/* SWAPP SOCIAL — real editorial stories and reading rail, no artificial activity. */
(()=>{
 'use strict';
 const sidebar=document.getElementById('swapp-social-reading');
 const readingList=document.getElementById('swapp-social-reading-stories');
 const stories=document.getElementById('swapp-social-stories');
 const track=document.getElementById('swapp-social-stories-track');
 const prev=document.getElementById('swapp-social-story-prev');
 const next=document.getElementById('swapp-social-story-next');
 if(!sidebar||!readingList||!stories||!track)return;

 const validSlug=value=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(value||''));
 const validImage=value=>{
  if(!String(value||'').trim())return '';
  try{
   const url=new URL(String(value),location.origin);
   return url.protocol==='https:'&&url.href.length<1600?url.href:'';
  }catch{return ''}
 };
 // Use the same ordered editorial sources as the main SWAPP reader.
 // Hotlink-blocked images should fall back to the NEXT source, not disappear.
 const youtubePoster=item=>{
  try{
   const u=new URL(String(item?.trailerUrl||''));let id='';
   if(u.protocol!=='https:'||u.username||u.password)return '';
   if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)){
    if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
    else if(/^\/(embed|shorts)\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.split('/')[2];
   }else if(u.hostname==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.slice(1);
   return /^[A-Za-z0-9_-]{11}$/.test(id)?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';
  }catch{return ''}
 };
 const imageSources=item=>{
  const shared=window.SwappArticleExtras?.cardImageSources?.(item);
  const candidates=[
   ...(Array.isArray(shared)?shared:[]),
   item?.thumbnail?.url,item?.image?.url,
   typeof item?.image==='string'?item.image:'',
   item?.imageUrl,item?.thumbnailUrl,item?.coverUrl,
   youtubePoster(item)
  ];
  const sources=[];
  for(const entry of candidates){
   const safe=validImage(entry);
   if(safe&&!sources.includes(safe))sources.push(safe);
  }
  return sources;
 };
 const useImage=(img,sources,onEmpty)=>{
  let index=0;
  img.addEventListener('error',()=>{
   index++;
   if(index<sources.length){img.src=sources[index];return}
   img.remove();
   onEmpty?.();
  });
  img.src=sources[0];
 };
 const make=(tag,cls,value)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(value!==undefined)node.textContent=value;
  return node;
 };
 const formatted=date=>{
  const timestamp=Date.parse(String(date||''));
  return Number.isFinite(timestamp)
   ?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(timestamp)
   :'';
 };
 const articleLink=item=>'/actus/'+encodeURIComponent(item.slug);
 const dateOf=item=>item.publishedAt||item.originalPublishedAt;
 const updateArrows=()=>{
  if(!prev||!next)return;
  prev.disabled=track.scrollLeft<8;
  next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-8;
 };
 const scrollStories=direction=>{
  const distance=Math.max(200,Math.floor(track.clientWidth*.68));
  track.scrollBy({left:distance*direction,behavior:
   (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth')});
 };
 prev?.addEventListener('click',()=>scrollStories(-1));
 next?.addEventListener('click',()=>scrollStories(1));
 track.addEventListener('scroll',updateArrows,{passive:true});
 window.addEventListener('resize',updateArrows,{passive:true});

 async function hydrate(){
  try{
   const response=await fetch('/api/actus',{credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'}});
   if(!response.ok)return;
   const data=await response.json();
   if(!Array.isArray(data?.articles))return;
   const articles=data.articles.filter(item=>item&&validSlug(item.slug)&&
    typeof item.title==='string'&&item.title.trim())
    .sort((a,b)=>Date.parse(dateOf(b)||0)-Date.parse(dateOf(a)||0));
   if(!articles.length)return;
   const readingFragment=document.createDocumentFragment();
   articles.slice(0,3).forEach((item,index)=>{
    const link=make('a','swapp-social-reading-item');
    link.href=articleLink(item);
    const visual=make('span','swapp-social-reading-visual');
    const candidates=imageSources(item);
    if(candidates.length){
     const img=make('img');
     img.alt='';img.loading='lazy';img.decoding='async';
     img.referrerPolicy='no-referrer';
     useImage(img,candidates,()=>{visual.className+=' swapp-social-image-fallback'});
     visual.append(img);
    }else visual.className+=' swapp-social-image-fallback';
    visual.append(make('span','swapp-social-reading-number',String(index+1).padStart(2,'0')));
    const copy=make('span','swapp-social-reading-copy');
    const date=formatted(dateOf(item));
    if(date)copy.append(make('small','swapp-social-reading-date',date));
    copy.append(make('strong','',item.title));
    link.append(visual,copy);
    readingFragment.append(link);
   });
   readingList.replaceChildren(readingFragment);
   sidebar.hidden=false;

   const featured=articles.filter(item=>imageSources(item).length>0).slice(0,8);
   if(!featured.length)return;
   const storyFragment=document.createDocumentFragment();
   featured.forEach(item=>{
    const card=make('a','swapp-social-story');
    card.href=articleLink(item);
    card.setAttribute('aria-label','Lire : '+item.title);
    const img=make('img');
    img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
    useImage(img,imageSources(item),()=>{
     // Keep the genuine article link/caption visible even when a remote
     // publisher denies every image. Never invent another game's art.
     card.className+=' swapp-social-story-no-image';
    });
    const gradient=make('span','swapp-social-story-overlay');
    const info=make('span','swapp-social-story-info');
    const date=formatted(dateOf(item));
    info.append(make('small','',date?'SWAPP · '+date:'SWAPP ACTUALITÉ'));
    info.append(make('strong','',item.title));
    card.append(img,gradient,info);
    storyFragment.append(card);
   });
   track.replaceChildren(storyFragment);
   if(track.children.length<1)return;
   // Stories are editorial previews, NOT expiring user stories.
   const tabs=document.getElementById('feed-tabs');
   stories.hidden=Boolean(tabs?.hidden||tabs?.querySelector('[data-feed="news"].active'));
   window.requestAnimationFrame?.(updateArrows);
  }catch{
   // Empty, unavailable or invalid feeds must never block the SOCIAL app.
  }
 }
 hydrate();
})();
