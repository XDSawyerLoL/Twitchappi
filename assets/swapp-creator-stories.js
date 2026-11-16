/* SWAPP Creator Stories — native 24-hour image/text stories on creator pages.
 * No media upload, third-party video auto-play or external editor account.
 */
(()=>{
'use strict';
const root=document.getElementById('channel');if(!root)return;
const el=(tag,cls,value)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(value!=null)node.textContent=String(value);
 return node;
};
const login=page=>{
 const pathname=(location.pathname||'').match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
 const profile=typeof state!=='undefined'?state.channelProfile:null;
 const value=String(page.dataset.channelLogin||pathname?.[1]||profile?.login||'').toLowerCase();
 return /^[a-z0-9_-]{2,48}$/.test(value)?value:'';
};
async function api(path,method='GET',body){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',
  method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const result=await r.json();
 if(!r.ok||!result.success)throw Error(result.error||'Opération indisponible.');
 return result;
}
const base=creator=>'/api/creator/stories/'+encodeURIComponent(creator);
function artwork(story){
 try{
  const u=new URL(String(story?.videoUrl||''));
  if(u.protocol!=='https:'||u.hostname!=='www.youtube.com'||u.pathname!=='/watch')return '';
  const id=u.searchParams.get('v')||'';
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id))return '';
  return 'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
 }catch(_){return ''}
}
function videoLink(story){
 try{
  const u=new URL(String(story?.videoUrl||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return '';
  if(u.hostname==='www.youtube.com'&&u.pathname==='/watch'&&/^[a-zA-Z0-9_-]{11}$/.test(u.searchParams.get('v')||''))return u.href;
  if(u.hostname==='odysee.com'&&/^\/@[^/]+:[a-z0-9]+\/[^/]+:[a-z0-9]+$/i.test(u.pathname))return u.href;
 }catch(_){}
 return '';
}
function remaining(value){
 const expires=Date.parse(String(value||''));
 if(!Number.isFinite(expires))return 'Story · 24 h';
 const ms=expires-Date.now();
 if(ms<=0)return 'Story terminée';
 if(ms<3600000)return Math.ceil(ms/60000)+' min restantes';
 return Math.ceil(ms/3600000)+' h restantes';
}
function visual(story,full=false){
 const node=el('div','swapp-story-art swapp-story-theme-'+(['obsidian','glacier','ember'].includes(story.theme)?story.theme:'obsidian'));
 if(full)node.classList.add('swapp-story-art-full');
 const imageUrl=artwork(story);
 if(imageUrl){
  const image=el('img','swapp-story-photo');
  image.src=imageUrl;image.alt='Illustration vidéo de '+(story.title||'la story');
  image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
  image.addEventListener('error',()=>image.remove(),{once:true});
  node.append(image);
 }
 const type=el('span','swapp-story-overline','SWAPP · STORY');
 const headline=el('strong','swapp-story-title',story.title||'Nouvelle histoire');
 const caption=el('p','swapp-story-caption',story.caption||'');
 const inner=el('div','swapp-story-content');
 inner.append(type,headline);
 if(story.caption)inner.append(caption);
 node.append(inner);
 return node;
}
function viewStory(story,section){
 const dialog=el('dialog','swapp-story-dialog');
 dialog.setAttribute('aria-label',story.title||'Story SWAPP');
 const close=el('button','swapp-story-close','Fermer');
 close.type='button';close.setAttribute('aria-label','Fermer la story');
 close.onclick=()=>dialog.close();
 const stage=visual(story,true);
 const video=videoLink(story);
 if(video){
  const link=el('a','swapp-story-video-link','Voir la vidéo liée');
  link.href=video;link.target='_blank';link.rel='noopener noreferrer';
  stage.append(link);
 }
 const timer=el('span','swapp-story-clock',remaining(story.expiresAt));
 dialog.append(close,stage,timer);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 section.append(dialog);
 if(typeof dialog.showModal==='function')dialog.showModal();
 else{dialog.setAttribute('open','');close.focus()}
}
function render(page,section,stories,creator,owner){
 section.replaceChildren();
 const header=el('div','swapp-creator-story-header');
 const heading=el('div');
 heading.append(el('span','swapp-story-eyebrow','SWAPP CREATOR'));
 heading.append(el('h2','','Stories'));
 heading.append(el('p','swapp-story-description','Instants, annonces et découvertes · visibles pendant 24 h.'));
 header.append(heading);
 const make=el('button','swapp-story-new',stories.length?'Créer une story':'Publier ma première story');
 make.type='button';
 if(owner){make.disabled=stories.length>=4;make.onclick=()=>editor(page,section,stories,creator);header.append(make)}
 section.append(header);
 if(!stories.length){section.append(el('p','swapp-story-empty',owner?'Partage ta première actualité visuelle avec ta communauté.':'Aucune story récente.'));return}
 const rail=el('div','swapp-story-rail');section.append(rail);
 for(const story of stories){
  const card=el('article','swapp-story-card');
  const open=el('button','swapp-story-open');
  open.type='button';open.setAttribute('aria-label','Voir la story '+story.title);
  open.append(visual(story));
  open.onclick=()=>viewStory(story,section);
  card.append(open);
  const foot=el('div','swapp-story-foot');
  foot.append(el('span','',remaining(story.expiresAt)));
  if(owner){
   const remove=el('button','swapp-story-remove','Supprimer');
   remove.type='button';
   remove.onclick=async()=>{
    if(!confirm('Supprimer cette story immédiatement ?'))return;
    remove.disabled=true;
    try{await api(base(creator)+'/'+encodeURIComponent(story.id),'DELETE');void load(page,true)}
    catch(error){remove.disabled=false;const note=section.querySelector('.swapp-story-action-status');if(note)note.textContent=error.message}
   };
   foot.append(remove);
  }
  card.append(foot);rail.append(card);
 }
 const status=el('p','swapp-story-action-status');status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');section.append(status);
}
function editor(page,section,stories,creator){
 if(stories.length>=4)return;
 section.replaceChildren();
 const heading=el('h2','','Creator Studio · Nouvelle story');
 section.append(heading);
 const layout=el('div','swapp-story-composer');
 const form=el('form','swapp-story-form');
 const title=el('input');title.type='text';title.maxLength=90;title.minLength=3;title.required=true;
 title.placeholder='Titre de la story';title.setAttribute('aria-label','Titre de la story');
 const caption=el('textarea');caption.rows=4;caption.maxLength=300;
 caption.placeholder='Ton annonce, ton histoire ou ton rendez-vous…';
 caption.setAttribute('aria-label','Texte de la story');
 const link=el('input');link.type='url';link.maxLength=320;
 link.placeholder='Lien YouTube ou Odysee (facultatif)';
 link.setAttribute('aria-label','Vidéo liée à la story');
 const theme=el('select');theme.setAttribute('aria-label','Ambiance de la story');
 for(const [value,name] of [['obsidian','Obsidienne'],['glacier','Glacier'],['ember','Braise']]){
  const o=el('option','',name);o.value=value;theme.append(o);
 }
 const submit=el('button','swapp-story-save','Publier pour 24 h');submit.type='submit';
 const cancel=el('button','swapp-story-cancel','Annuler');cancel.type='button';
 cancel.onclick=()=>render(page,section,stories,creator,true);
 const message=el('p','swapp-story-form-status');message.setAttribute('role','status');
 message.setAttribute('aria-live','polite');
 form.append(el('label','','Titre'),title,el('label','','Texte'),caption,
  el('label','','Illustration vidéo (facultatif)'),link,
  el('label','','Ambiance visuelle'),theme,submit,cancel,message);
 const preview=el('div','swapp-story-composer-preview');
 preview.append(el('span','swapp-story-eyebrow','APERÇU AVANT PUBLICATION'));
 const stage=el('div','swapp-story-preview-frame');preview.append(stage);
 const draw=()=>{
  stage.replaceChildren(visual({title:title.value.trim()||'Ta prochaine histoire',
   caption:caption.value.trim(),theme:theme.value,videoUrl:link.value.trim()},true));
 };
 for(const node of [title,caption,link,theme])node.addEventListener('input',draw);
 draw();layout.append(form,preview);section.append(layout);
 form.onsubmit=async event=>{
  event.preventDefault();submit.disabled=true;message.textContent='Publication…';
  try{await api(base(creator),'POST',{title:title.value,caption:caption.value,theme:theme.value,videoUrl:link.value});
   void load(page,true)}
  catch(error){message.textContent=error.message;submit.disabled=false}
 };
}
async function load(page,force=false){
 if(!page.isConnected)return;
 const creator=login(page);if(!creator)return;
 page.querySelectorAll('.swapp-creator-stories').forEach(n=>n.remove());
 const owner=page.dataset.channelOwner==='true';
 try{
  const data=await api(base(creator));
  if(!page.isConnected||login(page)!==creator||page.dataset.storyCreator!==creator)return;
  const stories=Array.isArray(data.stories)?data.stories.filter(s=>Date.parse(s.expiresAt)>Date.now()):[];
  if(!stories.length&&!owner)return;
  const section=el('section','swapp-creator-stories');
  section.id='swappCreatorStories';
  section.dataset.creator=creator;
  const anchor=page.querySelector('.swapp-external-videos')||
   page.querySelector('.channelBelowLive')||page.querySelector('#channelAboutSection');
  if(anchor)anchor.before(section);else page.append(section);
  render(page,section,stories,creator,owner);
 }catch(error){
  if(owner&&page.isConnected&&login(page)===creator){
   const section=el('section','swapp-creator-stories');
   section.append(el('p','swapp-story-action-status',error.message));
   page.append(section);
  }
 }
}
let scheduled=false;
function scan(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine')){
   const creator=login(page);
   if(!creator||page.dataset.channelPolished!=='1'||page.dataset.storyCreator===creator)continue;
   page.dataset.storyCreator=creator;void load(page);
  }
 });
}
new MutationObserver(changes=>{
 if(changes.some(c=>c.target===root||c.target.classList?.contains('creatorRefine')))scan();
}).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-channel-polished','class']});
scan();
})();
