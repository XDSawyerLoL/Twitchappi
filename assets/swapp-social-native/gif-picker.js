/* SWAPP GIF selector: inline composer popover; no URL prompt or external SDK.
 * Anonymous browsing is fine. Publication still requires the SWAPP session.
 */
export function setupSocialGifPicker({requireAuth,state,dom,updateMediaPreview}){
 const button=document.querySelector('[data-tool="gif"]');
 if(!button)return;
 let pop=null,controller=null,searchTimer=null,requestId=0;
 const validMedia=raw=>{
  try{
   const u=new URL(String(raw||''),location.origin);
   return u.protocol==='https:'&&(
    (u.origin===location.origin&&/^\/api\/swapp\/social\/gifs\/sticker\/[a-z]{2,8}\.gif$/.test(u.pathname))
    ||/^media\d*\.giphy\.com$/i.test(u.hostname)
   )?u.href:'';
  }catch{return ''}
 };
 const close=()=>{
  if(controller)controller.abort();
  clearTimeout(searchTimer);
  if(pop){pop.remove();pop=null}
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls','');
 };
 const status=(node,message)=>{
  node.replaceChildren();
  const text=document.createElement('p');
  text.className='pulse-gif-status';
  text.textContent=message;
  node.append(text);
 };
 async function search(q='',initial=false){
  const id=++requestId;
  if(controller)controller.abort();
  controller=new AbortController();
  const grid=pop?.querySelector('[data-gif-results]');
  if(!grid)return;
  status(grid,initial?'Chargement des GIFs…':'Recherche des GIFs…');
  try{
   const url='/api/swapp/social/gifs'+(q?'?q='+encodeURIComponent(q):'');
   const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('GIF search unavailable');
   const result=await res.json();
   if(id!==requestId||!pop)return;
   grid.replaceChildren();
   const items=Array.isArray(result.items)?result.items:[];
   for(const item of items){
    const url=validMedia(item.url),preview=validMedia(item.preview||item.url);
    if(!url||!preview)continue;
    const tile=document.createElement('button');
    tile.type='button';tile.className='pulse-gif-result';
    tile.setAttribute('aria-label','Choisir '+String(item.title||'GIF'));
    tile.dataset.gifUrl=url;
    tile.dataset.gifProvider=item.provider==='GIPHY'?'GIPHY':'SWAPP';
    tile.dataset.gifTitle=String(item.title||'GIF').slice(0,100);
    const image=document.createElement('img');
    image.src=preview;image.alt=String(item.title||'GIF animé').slice(0,100);
    image.loading='lazy';image.decoding='async';
    const name=document.createElement('span');
    name.textContent=String(item.title||'GIF').replace(' · SWAPP','').slice(0,40);
    tile.append(image,name);
    grid.append(tile);
   }
   if(!grid.children.length)status(grid,q?'Aucun GIF trouvé. Essaie « gg », « lol » ou « hype ».':'Aucun GIF disponible pour le moment.');
   const foot=pop.querySelector('[data-gif-credit]');
   if(foot){
    foot.replaceChildren();
    if(result.hasGiphy){
     const source=document.createElement('a');
     source.href='https://giphy.com';source.target='_blank';
     source.rel='noopener noreferrer';source.textContent='Powered by GIPHY';
     source.className='pulse-gif-provider';foot.append(source);
    }else foot.textContent='GIFs animés SWAPP · sans service externe';
   }
  }catch(err){
   if(err?.name!=='AbortError'&&id===requestId&&pop)status(grid,'GIFs momentanément indisponibles.');
  }
 }
 button.addEventListener('click',event=>{
  event.preventDefault();
  if(pop){close();return}
  if(!requireAuth())return;
  pop=document.createElement('section');
  pop.className='pulse-gif-picker';pop.id='pulse-gif-picker';
  pop.setAttribute('aria-label','Choisir un GIF animé');
  pop.innerHTML='<div class="pulse-gif-picker-heading"><strong>GIFs</strong><button type="button" data-gif-close aria-label="Fermer les GIFs">×</button></div>'+
   '<input type="search" autocomplete="off" maxlength="50" placeholder="Rechercher une réaction…" aria-label="Rechercher un GIF">'+
   '<div class="pulse-gif-results" data-gif-results role="group" aria-label="Résultats GIF"></div>'+
   '<footer data-gif-credit></footer>';
  const toolbar=button.closest('.pulse-toolset');
  if(!toolbar)return;
  toolbar.style.position='relative';
  toolbar.append(pop);
  button.setAttribute('aria-expanded','true');
  button.setAttribute('aria-controls','pulse-gif-picker');
  const input=pop.querySelector('input');
  input.addEventListener('input',()=>{
   clearTimeout(searchTimer);
   const q=input.value.trim();
   searchTimer=setTimeout(()=>void search(q),q?320:0);
  });
  pop.addEventListener('click',event=>{
   if(event.target.closest('[data-gif-close]')){close();button.focus();return}
   const tile=event.target.closest('[data-gif-url]');
   if(!tile)return;
   // Store the URL and media type; the main composer already handles preview,
   // publication, max length and removal, with no separate GIF post.
   state.attachment={mediaUrl:tile.dataset.gifUrl,mediaType:'gif'};
   updateMediaPreview();
   dom.publish.disabled=!dom.textarea.value.trim()&&!state.attachment?.mediaUrl;
   close();
   dom.textarea.focus();
  });
  void search('',true);
  input.focus();
 });
 document.addEventListener('click',event=>{
  if(pop&&!event.target.closest('.pulse-gif-picker')&&!event.target.closest('[data-tool="gif"]'))close();
 },true);
 document.addEventListener('keydown',event=>{
  if(pop&&event.key==='Escape'){event.preventDefault();close();button.focus()}
 });
 return {close};
}
