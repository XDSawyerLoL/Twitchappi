/* SWAPP Creator external videos — progressive enhancement of existing /pseudo. */
(function(){
'use strict';
const root=document.getElementById('channel');if(!root)return;
const login=page=>{
 const profile=typeof state!=='undefined'?state.channelProfile:null;
 const pathname=(location.pathname||'').match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
 const value=String(page.dataset.channelLogin||pathname?.[1]||profile?.login||'').toLowerCase();
 return /^[a-z0-9_-]{2,48}$/.test(value)?value:'';
};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
function videoEmbed(v){
 try{
  const u=new URL(String(v?.url||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return '';
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  let id='';
  if(host==='youtu.be'&&/^\/[\w-]{11}\/?$/.test(u.pathname))id=u.pathname.split('/')[1];
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
   if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
   else if(/^\/(shorts|live|embed)\/[\w-]{11}\/?$/.test(u.pathname))id=u.pathname.split('/')[2];
  }
  if(id&&/^[\w-]{11}$/.test(id))return 'https://www.youtube-nocookie.com/embed/'+id;
  if(['odysee.com','www.odysee.com'].includes(host)&&
     /^\/@[^/]+:[a-z0-9]+\/[^/]+:[a-z0-9]+\/?$/i.test(u.pathname))
   return 'https://odysee.com/$/embed/'+u.pathname.slice(1).replace(/\/$/,'');
 }catch(_){}
 return '';
}
function sourceName(v){
 try{
  const host=new URL(String(v?.url||'')).hostname.toLowerCase().replace(/\.$/,'');
  return ['odysee.com','www.odysee.com'].includes(host)?'Odysee':'YouTube';
 }catch(_){return 'Vidéo externe'}
}
function videoThumbnail(v){
 // The ID is extracted from the validated, no-cookie YouTube embed.
 const embed=videoEmbed(v);
 const match=/^https:\/\/www\.youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})$/.exec(embed);
 return match?'https://i.ytimg.com/vi/'+match[1]+'/hqdefault.jpg':'';
}

function card(v){
 const wrap=el('article','swapp-external-video-card');
 const stage=el('div','swapp-external-video-stage');
 const play=el('button','swapp-external-video-play','▶  Lire la vidéo');
 play.type='button';play.setAttribute('aria-label','Lire '+(v.title||'la vidéo'));
 const embed=videoEmbed(v);
 const provider=sourceName(v);
 const cover=videoThumbnail(v);
 if(cover){
  const image=el('img','swapp-external-video-cover');
  image.src=cover;image.alt='Aperçu de '+(v.title||'la vidéo');
  image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
  image.addEventListener('error',()=>image.remove(),{once:true});
  stage.append(image);
 }else if(provider==='Odysee'){
  stage.append(el('span','swapp-external-video-provider','ODYSEE'));
 }
 if(!embed){play.disabled=true;play.textContent='Lecture intégrée indisponible';}
 play.addEventListener('click',()=>{
  if(!embed)return;
  const iframe=el('iframe');
  iframe.src=embed;iframe.title=v.title||'Vidéo externe';
  iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
  iframe.allowFullscreen=true;iframe.loading='lazy';iframe.referrerPolicy='strict-origin-when-cross-origin';
  stage.replaceChildren(iframe);
 });
 stage.append(play);wrap.append(stage);
 wrap.append(el('h3','',v.title||'Vidéo '+provider));
 const link=el('a','swapp-external-video-source','Voir sur '+provider);
 link.href=v.url;link.target='_blank';link.rel='noopener noreferrer';wrap.append(link);
 return wrap;
}
async function api(path,options){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(options?{'Content-Type':'application/json'}:{})},...options});
 const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Service indisponible');return data;
}
function render(page,section,videos,owner,creator){
 section.replaceChildren();
 const header=el('div','swapp-external-video-heading');
 header.append(el('h2','',owner?'Creator Studio · Mes vidéos':'Vidéos du créateur'));
 if(owner)header.append(el('p','swapp-external-video-subtitle','Organise tes cinq vidéos externes sans hébergement SWAPP.'));
 if(owner){const edit=el('button','swapp-external-video-edit','Gérer mes vidéos');edit.type='button';edit.onclick=()=>editor(section,videos,creator,()=>load(page,true));header.append(edit)}
 section.append(header);
 if(!videos.length){if(owner)section.append(el('p','','Ajoute jusqu’à cinq vidéos Odysee ou YouTube.'));else section.remove();return}
 const featured=videos.find(v=>v.pinned);
 if(featured){const area=el('div','swapp-external-video-featured');area.append(el('h3','','À la une'),card(featured));section.append(area)}
 const rail=el('div','swapp-external-video-rail');
 videos.filter(v=>v!==featured).forEach(v=>rail.append(card(v)));if(rail.childElementCount)section.append(rail);
}
function editor(section,initial,creator,refresh){
 const pageRefresh=refresh;
 let videos=initial.map(v=>({...v}));section.replaceChildren();
 section.append(el('h2','','Creator Studio · Organiser mes vidéos'));
 section.append(el('p','swapp-external-video-editor-intro','Prévisualise, classe et choisis une vidéo à la une avant de publier.'));
 const list=el('div','swapp-external-video-editor-list');section.append(list);
 const preview=el('div','swapp-external-video-draft-preview');preview.setAttribute('aria-label','Aperçu de ma sélection');section.append(preview);
 const message=el('p','swapp-external-video-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const form=el('form','swapp-external-video-form');
 const url=el('input');url.type='url';url.placeholder='Lien Odysee ou YouTube';url.required=true;url.maxLength=320;
 const title=el('input');title.placeholder='Titre de la vidéo (facultatif)';title.maxLength=120;
 const add=el('button','','Ajouter');add.type='submit';
 form.append(url,title,add);section.append(form,message);
 const actions=el('div','swapp-external-video-editor-actions');
 const save=el('button','','Enregistrer');save.type='button';
 const cancel=el('button','','Annuler');cancel.type='button';cancel.onclick=refresh;
 actions.append(save,cancel);section.append(actions);
 function draw(){
  list.replaceChildren();preview.replaceChildren();
  message.textContent=videos.length+'/5 vidéos sélectionnées';
  if(videos.length){
   preview.append(el('h3','','Aperçu avant publication'));
   const rail=el('div','swapp-external-video-rail');
   const prioritized=[...videos].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
   const references=new Map();
   prioritized.forEach(v=>{const element=card(v);references.set(v,element);rail.append(element)});
   preview._videoCards=references;
   preview.append(rail);
  }
  videos.forEach((v,i)=>{
   const line=el('div','swapp-external-video-editor-row');
   line.append(el('span','swapp-external-video-row-source',(v.pinned?'À la une · ':'')+sourceName(v)));
   const label=el('label','swapp-external-video-title-label');
   label.append(el('span','','Titre de la vidéo'));
   const input=el('input');input.type='text';input.maxLength=120;
   input.placeholder='Titre de ma vidéo';input.value=v.title||'';
   input.setAttribute('aria-label','Titre de la vidéo '+(i+1));
   input.addEventListener('input',()=>{
    v.title=input.value.slice(0,120);
    const heading=preview._videoCards?.get(v)?.querySelector('h3');
    if(heading)heading.textContent=v.title||'Vidéo '+sourceName(v);
   });
   label.append(input);line.append(label);
   for(const [label,fn] of [['À la une',()=>{videos.forEach(x=>x.pinned=false);v.pinned=true;draw()}],['↑',()=>{if(i){[videos[i-1],videos[i]]=[videos[i],videos[i-1]];draw()}}],['↓',()=>{if(i<videos.length-1){[videos[i+1],videos[i]]=[videos[i],videos[i+1]];draw()}}],['Supprimer',()=>{videos.splice(i,1);draw()}]]){
    const b=el('button','',label);b.type='button';b.onclick=fn;line.append(b);
   }list.append(line);
  });add.disabled=videos.length>=5;
 }
 form.onsubmit=e=>{
  e.preventDefault();if(videos.length>=5)return;
  let candidate;
  try{candidate=new URL(url.value.trim())}catch(_){message.textContent='Adresse vidéo invalide.';return}
  if(candidate.protocol!=='https:'||candidate.username||candidate.password||candidate.port||candidate.hash){
   message.textContent='Utilise un lien HTTPS direct Odysee ou YouTube.';return;
  }
  const host=candidate.hostname.toLowerCase();
  const yt=['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host);
  const od=['odysee.com','www.odysee.com'].includes(host);
  if(!yt&&!od){message.textContent='Seuls Odysee et YouTube sont pris en charge.';return}
  const existing=videos.some(v=>v.url===candidate.href);
  if(existing){message.textContent='Cette vidéo est déjà dans ta sélection.';return}
  videos.push({url:candidate.href,title:title.value.trim(),pinned:videos.length===0});
  url.value='';title.value='';draw();
 };
 save.onclick=async()=>{
  save.disabled=true;message.textContent='Enregistrement…';
  try{await api('/api/creator/external-videos/'+encodeURIComponent(creator),{method:'PUT',body:JSON.stringify({videos})});pageRefresh()}
  catch(e){message.textContent=e.message;save.disabled=false}
 };
 draw();
}
async function load(page,force){
 if(!page.isConnected)return;
 const creator=login(page);if(!creator)return;
 const existing=page.querySelector('.swapp-external-videos');if(existing)existing.remove();
 page.querySelector('[data-swapp-videos-nav]')?.remove();
 const owner=page.dataset.channelOwner==='true';
 try{
  const data=await api('/api/creator/external-videos/'+encodeURIComponent(creator));
  if(!page.isConnected||login(page)!==creator||page.dataset.externalVideosCreator!==creator)return;
  if(!data.videos?.length&&!owner)return;
  const section=el('section','swapp-external-videos');
  section.id='swappCreatorVideos';section.dataset.creator=creator;
  const anchor=page.querySelector('.channelBelowLive')||page.querySelector('#channelAboutSection');
  if(anchor)anchor.before(section);else page.append(section);
  render(page,section,data.videos,owner,creator);
  const nav=page.querySelector('.channelSubNav');
  if(nav&&!nav.querySelector('[data-swapp-videos-nav]')){
   nav.hidden=false;
   const button=el('button','','Vidéos');button.type='button';button.dataset.swappVideosNav='1';
   button.onclick=()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   nav.append(button);
  }
 }catch(e){if(owner&&page.isConnected&&login(page)===creator){const section=el('section','swapp-external-videos');section.append(el('p','',e.message));page.append(section)}}
}
let scheduled=false;
function scan(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine')){
   const creator=login(page);
   if(!creator||page.dataset.channelPolished!=='1'||page.dataset.externalVideosCreator===creator)continue;
   page.dataset.externalVideosCreator=creator;void load(page);
  }
 });
}
new MutationObserver(changes=>{
 if(changes.some(c=>c.target===root||c.target.classList?.contains('creatorRefine')))scan();
}).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-channel-polished','class']});
scan();
})();
