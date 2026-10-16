/* SOCIAL editorial discovery: latest real SWAPP articles only. No tracking. */
(()=>{
 'use strict';
 const section=document.getElementById('swapp-social-reading');
 const list=document.getElementById('swapp-social-reading-stories');
 if(!section||!list)return;
 const validSlug=value=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(value||''));
 const validImage=value=>{
  try{
   const url=new URL(String(value||''),location.origin);
   return url.protocol==='https:'&&url.href.length<1600?url.href:'';
  }catch{return ''}
 };
 const make=(tag,css,text)=>{
  const n=document.createElement(tag);
  if(css)n.className=css;
  if(text!==undefined)n.textContent=text;
  return n;
 };
 const formatted=date=>{
  const timestamp=Date.parse(String(date||''));
  return Number.isFinite(timestamp)
   ?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(timestamp)
   :'';
 };
 async function hydrate(){
  try{
   const response=await fetch('/api/actus',{credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'}});
   if(!response.ok)return;
   const data=await response.json();
   if(!Array.isArray(data?.articles))return;
   const articles=data.articles.filter(item=>item&&validSlug(item.slug)&&
       typeof item.title==='string'&&item.title.trim())
    .sort((a,b)=>Date.parse(b.publishedAt||b.originalPublishedAt||0)-
                 Date.parse(a.publishedAt||a.originalPublishedAt||0))
    .slice(0,3);
   if(!articles.length)return;
   const fragment=document.createDocumentFragment();
   articles.forEach((item,index)=>{
    const link=make('a','swapp-social-reading-item');
    link.href='/actus/'+encodeURIComponent(item.slug);
    const visual=make('span','swapp-social-reading-visual');
    const url=validImage(typeof item.image==='object'?item.image?.url:item.imageUrl);
    if(url){
     const img=make('img','');
     img.src=url;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
     img.addEventListener('error',()=>img.remove(),{once:true});
     visual.append(img);
    }
    visual.append(make('span','swapp-social-reading-number',String(index+1).padStart(2,'0')));
    const copy=make('span','swapp-social-reading-copy');
    const date=formatted(item.publishedAt||item.originalPublishedAt);
    if(date)copy.append(make('small','swapp-social-reading-date',date));
    copy.append(make('strong','',item.title));
    link.append(visual,copy);
    fragment.append(link);
   });
   list.replaceChildren(fragment);
   section.hidden=false;
  }catch{
   // An unavailable news API never blocks SOCIAL or renders fabricated news.
  }
 }
 hydrate();
})();
