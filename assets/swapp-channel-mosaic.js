/* SWAPP creator panels: immersive mosaic + persistent owner editor.
 * The ordinary channel player, chat and identity continue to work independently.
 */
(function(){
 'use strict';
 const SIZES=['hero','large','medium','small'];
 const RATIOS=['auto','1:1','4:5','3:4','16:9','21:9','3:2'];
 const FITS=['contain','cover'];
 const STYLES=['image','overlay'];
 const normalize=(p,i=0)=>({
  image_url:String(p?.image_url||p?.image||''),
  title:String(p?.title||'').slice(0,60),
  description:String(p?.description||p?.text||'').slice(0,220),
  link_url:String(p?.link_url||p?.url||p?.href||'').slice(0,1000),
  size:SIZES.includes(p?.size)?p.size:(i<2?'large':'medium'),
  ratio:RATIOS.includes(p?.ratio)?p.ratio:'auto',
  fit:FITS.includes(p?.fit)?p.fit:'contain',
  focal_x:Math.max(0,Math.min(100,Number(p?.focal_x??50)||0)),
  focal_y:Math.max(0,Math.min(100,Number(p?.focal_y??50)||0)),
  style:STYLES.includes(p?.style)?p.style:'image'
 });
 const node=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const profile=()=>typeof state==='undefined'?null:state.channelProfile;
 const owner=()=>typeof state!=='undefined'&&Boolean(state.channelOwner);
 const values=()=>{
  const p=profile()||{};
  // Before SWAPP MySQL cutover, older panel editors stored images locally.
  // Do not make an existing owner's legacy thumbnails disappear on upgrade.
  const server=p.channel_vignettes?.length?p.channel_vignettes:p.channel_panels;
  let source=Array.isArray(server)?server:[];
  if(!source.length){
   source=localPanels(p.login);
   if(!source.length&&typeof oryonGetChannelVignettes==='function'){
    try{source=oryonGetChannelVignettes(p)||[]}catch(_){}
   }
  }
  return source.filter(v=>v?.image_url||v?.image).slice(0,8).map(normalize);
 };
 // Recover historic browser-only images from BOTH legacy SWAPP editors.
 function localPanels(login){
  const key=String(login||'').toLowerCase();
  const merged=[];
  try{
   for(const prefix of ['oryon_channel_vignettes_250_','oryon_channel_vignettes_']){
    const items=JSON.parse(localStorage.getItem(prefix+key)||'[]');
    if(Array.isArray(items)&&items.some(p=>p?.image_url||p?.image)){
     for(const item of items.slice(0,8))if(item?.image_url||item?.image)merged.push(item);
     break;
    }
   }
  }catch(_){}
  return merged.slice(0,8).map(normalize);
 }
 const migrationAttempted=new Set();
 async function verifiedPublish(panels,login){
  const auth=await fetch('/api/oryon/session',{credentials:'same-origin',cache:'no-store'});
  if(!auth.ok)throw Error('Session SWAPP indisponible.');
  const session=await auth.json();
  if(!session?.success||!session?.local?.id||
     String(session.local.login||'').toLowerCase()!==String(login||'').toLowerCase()||
     String(session.local.id)!==String(profile()?.id||'')){
   throw Error('Connecte-toi au compte SWAPP propriétaire de cette chaîne pour modifier ses vignettes.');
  }
  const publish=await fetch('/api/oryon/profile',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({channel_vignettes:panels,channel_panels:panels}),
   signal:AbortSignal.timeout(30000)
  });
  const result=await publish.json().catch(()=>({}));
  if(!publish.ok||result.success!==true)throw Error(result.error||'Publication impossible.');
  // We only report publication when an independent public, unauthenticated GET
  // confirms the same number of panels with publicly downloadable images.
  const verify=await fetch('/api/oryon/profile/'+encodeURIComponent(login),{cache:'no-store'});
  if(!verify.ok)throw Error('Les images ont été enregistrées, mais la page publique ne répond pas.');
  const publicData=await verify.json();
  const publicPanels=publicData?.user?.channel_vignettes||[];
  if(publicPanels.length!==panels.length)throw Error('Publication incomplète : '+publicPanels.length+'/'+panels.length+' visuels publics.');
  for(const panel of publicPanels){
   const url=String(panel.image_url||'');
   if(url.startsWith('data:'))throw Error('Une image est encore privée et doit être transférée.');
   if(url.startsWith('/api/oryon/panel-image/')){
    const check=await fetch(url,{credentials:'omit',cache:'no-store'});
    if(!check.ok||!String(check.headers.get('content-type')||'').startsWith('image/'))
     throw Error('Une image enregistrée n’est pas accessible publiquement.');
   }
  }
  return publicData.user;
 }
 function recoveryNotice(root,panelCount){
  let banner=root.querySelector('[data-swapp-panel-recovery]');
  if(!banner){
   banner=node('div','swapp-panel-recovery');
   banner.dataset.swappPanelRecovery='1';
   banner.setAttribute('role','status');
   root.querySelector('#channelAboutSection .vignetteHead')?.after(banner);
  }
  banner.hidden=false;
  banner.replaceChildren(node('strong','','Publication de tes vignettes'),
   node('p','','Les '+panelCount+' images existent dans ce navigateur, mais ne sont pas encore visibles publiquement.'));
  return banner;
 }
 async function migrateLegacyPanels(root,panels,p){
  const login=String(p?.login||'').toLowerCase();
  if(!owner()||!login||!panels.length||migrationAttempted.has(login))return;
  migrationAttempted.add(login);
  const banner=recoveryNotice(root,panels.length);
  const info=node('span','','Synchronisation avec SWAPP…');
  banner.append(info);
  try{
   const publicProfile=await fetch('/api/oryon/profile/'+encodeURIComponent(login),{cache:'no-store'}).then(r=>r.json());
   if((publicProfile?.user?.channel_vignettes||[]).length){banner.remove();return;}
   const persisted=await verifiedPublish(panels,login);
   if(typeof state!=='undefined')state.channelProfile=persisted;
   info.textContent='Publication confirmée : '+panels.length+' vignettes désormais accessibles au public.';
   banner.dataset.ok='true';
   if(typeof renderChannel==='function')await renderChannel();
  }catch(error){
   banner.dataset.ok='false';
   info.textContent=String(error?.message||'Publication impossible.');
   const retry=node('button','','Réessayer la publication');
   retry.type='button';
   retry.addEventListener('click',()=>{migrationAttempted.delete(login);migrateLegacyPanels(root,panels,p)});
   const edit=node('button','','Ouvrir l’éditeur');
   edit.type='button';edit.addEventListener('click',()=>openEditor());
   banner.append(retry,edit);
  }
 }

 const safeUrl=url=>{
  try{
   const u=new URL(url,location.origin);
   return ['http:','https:'].includes(u.protocol)?u.href:'';
  }catch{return ''}
 };
 function media(panel,onReady){
  const box=node('div','swapp-mosaic-image');
  box.style.setProperty('--panel-focus-x',panel.focal_x+'%');
  box.style.setProperty('--panel-focus-y',panel.focal_y+'%');
  const img=node('img','');
  img.loading='lazy';img.decoding='async';
  img.alt=panel.title||'Visuel de chaîne';
  if(typeof onReady==='function')img.addEventListener('load',()=>onReady(img));
  img.src=panel.image_url;
  box.append(img);
  return box;
 }
 function mosaicCard(panel,index,isOwner){
  const article=node('article','swapp-mosaic-card');
  article.dataset.size=panel.size;
  article.dataset.ratio=panel.ratio;
  article.dataset.fit=panel.fit;
  article.dataset.style=panel.style;
  const href=safeUrl(panel.link_url);
  const visual=href?node('a','swapp-mosaic-hit'):node('div','swapp-mosaic-hit');
  if(href){
   visual.href=href;
   if(new URL(href).origin!==location.origin){visual.target='_blank';visual.rel='noopener noreferrer'}
   visual.setAttribute('aria-label','Ouvrir '+(panel.title||'le lien du panneau'));
  }
  visual.append(media(panel,img=>{
   if(!isOwner)return;
   const cssWidth=img.getBoundingClientRect().width||img.clientWidth||0;
   const pixelRatio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
   if(cssWidth>0&&img.naturalWidth<cssWidth*pixelRatio*.85)
    article.dataset.lowResolution='true';
  }));
  if(panel.title||panel.description){
   const copy=node('div','swapp-mosaic-copy');
   if(panel.title)copy.append(node('strong','',panel.title));
   if(panel.description)copy.append(node('span','',panel.description));
   article.append(visual,copy);
  }else article.append(visual);
  if(isOwner){
   const tools=node('div','swapp-mosaic-tools');
   const edit=node('button','swapp-mosaic-edit','Modifier');
   edit.type='button';
   edit.setAttribute('aria-label','Modifier le panneau '+(index+1));
   edit.addEventListener('click',e=>{e.preventDefault();openEditor(index)});
   const quality=node('span','swapp-mosaic-quality-warning','Image trop petite');
   quality.title='La vignette risque d’être floue. Remplace-la par l’image originale en haute résolution.';
   tools.append(quality,edit);article.append(tools);
  }
  return article;
 }
 function decorate(root){
  if(!root)return;
  const current=profile(),panels=values();
  const area=root.querySelector('#channelAboutSection');
  if(!area)return;
  const grid=area.querySelector('.vignetteGrid');
  if(!grid)return;
  root.classList.add('swapp-channel-mosaic');
  root.dataset.mosaicCount=String(panels.length);
  const isOwner=owner();
  const shell=area.querySelector('.aboutMain')||area;
  const heading=area.querySelector('.vignetteHead h2');
  if(heading)heading.textContent='Les univers de '+String(current?.display_name||current?.login||'SWAPP');
  const subtitle=area.querySelector('.vignetteHint');
  if(subtitle)subtitle.textContent=panels.length?
   'Images, créations et liens sélectionnés par le créateur.':
   'Ta chaîne se construit ici. Ajoute une image pour commencer.';
  const share=area.querySelector('.shareLine');
  if(share)share.hidden=true; // Already accessible via the hero share action.
  const original=area.querySelector('button[onclick*="openChannelVignettesEditor"]');
  if(original&&!original.dataset.mosaicEditor){
   original.dataset.mosaicEditor='true';
   original.removeAttribute('onclick');
   original.textContent='Composer ma page';
   original.addEventListener('click',()=>openEditor());
  }
  if(!original&&isOwner&&!area.querySelector('[data-mosaic-add]')){
   const action=node('button','swapp-mosaic-action','Composer ma page');
   action.type='button';action.dataset.mosaicAdd='1';
   action.addEventListener('click',()=>openEditor());
   area.querySelector('.vignetteHead')?.append(action);
  }
  // Only real media is displayed. The original 8 fixed placeholder cells go away.
  grid.hidden=false; grid.classList.add('swapp-mosaic-grid'); grid.replaceChildren();
  for(let i=0;i<panels.length;i++)grid.append(mosaicCard(panels[i],i,isOwner));
  if(!panels.length&&!isOwner){
   area.hidden=true;
  }else{
   area.hidden=false;
   const below=root.querySelector('.channelBelowLive');if(below)below.hidden=false;
   const nav=root.querySelector('.channelSubNav');
   if(nav&&!nav.querySelector('[data-mosaic-nav]')){
    const tab=node('button','','Galerie');
    tab.type='button';tab.dataset.mosaicNav='1';
    tab.addEventListener('click',()=>area.scrollIntoView({behavior:'smooth',block:'start'}));
    nav.hidden=false;nav.append(tab);
   }
  }
  // For legacy five image panels, 2 wide / 3 medium is more immersive by default.
  shell.classList.add('swapp-mosaic-wrap');
  if(isOwner&&panels.length&&!((current?.channel_vignettes||[]).length||(current?.channel_panels||[]).length))
   void migrateLegacyPanels(root,panels,current);
 }
 function labelInput(labelText,field){
  const wrap=node('label','swapp-editor-field');
  wrap.append(node('span','',labelText),field);
  return wrap;
 }
 function textInput(value,placeholder,maxLength){
  const input=node('input','');input.type='text';input.value=value;input.placeholder=placeholder;
  input.maxLength=maxLength||220;
  return input;
 }
 function selectInput(values,selected){
  const select=node('select','');
  for(const [value,name] of values){
   const option=node('option','',name);option.value=value;option.selected=value===selected;select.append(option);
  }
  return select;
 }
 function fieldRange(label,value,change){
  const slider=node('input','');slider.type='range';slider.min='0';slider.max='100';slider.value=String(value);
  slider.addEventListener('input',()=>change(Number(slider.value)));
  return labelInput(label,slider);
 }
 function imageFromFile(file){
  return new Promise((resolve,reject)=>{
   if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))
    return reject(Error('Utilise un fichier JPEG, PNG ou WebP.'));
   if(file.size>14*1024*1024)return reject(Error('Image trop lourde (14 Mo maximum).'));
   const reader=new FileReader();
   reader.onerror=()=>reject(Error('Image illisible.'));
   reader.onload=()=>{
    const source=String(reader.result||'');
    const img=new Image();
    img.onerror=()=>reject(Error('Format image non pris en charge.'));
    img.onload=()=>{
     const maxBytes=1100000; // Current MySQL image storage limit.
     // Preserve uploaded original pixels, transparency and JPEG detail whenever possible.
     // Re-encoding a small source through canvas would discard detail for no benefit.
     if(file.size<=maxBytes && /^data:image\/(jpeg|png|webp);base64,/i.test(source)){
      resolve(source);return;
     }
     const width=img.naturalWidth,height=img.naturalHeight;
     if(!width||!height)return reject(Error('Dimensions de l’image invalides.'));
     const longest=Math.max(width,height);
     const edges=[Math.min(longest,3200),2800,2400,2000,1600,1300,1000]
      .filter((n,i,list)=>n<=longest&&list.indexOf(n)===i);
     const canvas=document.createElement('canvas');
     const ctx=canvas.getContext('2d',{alpha:true});
     if(!ctx)return reject(Error('Conversion de l’image indisponible.'));
     ctx.imageSmoothingEnabled=true;
     ctx.imageSmoothingQuality='high';
     const fitsLimit=data=>{
      if(!/^data:image\/(webp|jpeg|png);base64,/i.test(data))return false;
      const encoded=data.split(',')[1]||'';
      const padding=encoded.endsWith('==')?2:(encoded.endsWith('=')?1:0);
      return Math.floor(encoded.length*3/4)-padding<=maxBytes;
     };
     const codecs=['image/webp',...(file.type==='image/png'?[]:['image/jpeg'])];
     for(const edge of edges){
      const factor=edge/longest;
      canvas.width=Math.max(1,Math.round(width*factor));
      canvas.height=Math.max(1,Math.round(height*factor));
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for(const codec of codecs){
       for(const quality of [.94,.90,.85,.79,.72]){
        const encoded=canvas.toDataURL(codec,quality);
        if(encoded.startsWith('data:'+codec+';base64,')&&fitsLimit(encoded)){
         resolve(encoded);return;
        }
       }
      }
     }
     reject(Error('Impossible de conserver une image nette sous la limite de stockage (1,1 Mo). Essaie un fichier plus léger.'));
    };
    img.src=source;
   };
   reader.readAsDataURL(file);
  });
 }
 let active=null,returnFocus=null;
 function closeEditor(){
  if(!active)return;
  active.remove();active=null;
  document.body.classList.remove('swapp-mosaic-dialog-open');
  returnFocus?.focus?.();returnFocus=null;
 }
 function openEditor(selected=-1){
  if(!owner())return;
  closeEditor();
  returnFocus=document.activeElement;
  const draft=values().map(p=>({...p}));
  const overlay=node('div','swapp-mosaic-overlay');
  const dialog=node('section','swapp-mosaic-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','swapp-mosaic-dialog-title');
  const header=node('header','swapp-mosaic-dialog-head');
  const title=node('div','');
  title.append(node('h2','', 'Composer ma chaîne'),node('p','','Taille, format, cadrage et ordre. Tes images existantes sont conservées.'));
  title.querySelector('h2').id='swapp-mosaic-dialog-title';
  const dismiss=node('button','swapp-mosaic-dismiss','Fermer');
  dismiss.type='button';dismiss.addEventListener('click',closeEditor);
  header.append(title,dismiss);
  const notice=node('p','swapp-mosaic-feedback','');
  notice.setAttribute('role','status');
  const content=node('div','swapp-mosaic-editor-content');
  const footer=node('footer','swapp-mosaic-dialog-foot');
  const add=node('button','swapp-mosaic-add','Ajouter un visuel');
  const cancel=node('button','swapp-mosaic-cancel','Annuler');
  const save=node('button','swapp-mosaic-save','Enregistrer la mise en page');
  add.type='button';cancel.type='button';save.type='button';
  cancel.addEventListener('click',closeEditor);
  add.addEventListener('click',()=>{
   if(draft.length>=8){notice.textContent='8 visuels maximum pour garder une page rapide.';return;}
   draft.push(normalize({image_url:'',size:'medium',ratio:'auto'},draft.length));
   redraw(draft.length-1);
  });
  const status=(message,error=false)=>{notice.textContent=message;notice.dataset.error=String(error)};
  function redraw(focus=-1){
   content.replaceChildren();
   draft.forEach((p,i)=>{
    const card=node('article','swapp-mosaic-editor-card');
    const head=node('div','swapp-mosaic-editor-card-head');
    head.append(node('strong','', 'Visuel '+(i+1)));
    const actions=node('div','swapp-mosaic-editor-actions');
    const up=node('button','','Monter'),down=node('button','','Descendre'),remove=node('button','danger','Supprimer');
    for(const b of [up,down,remove])b.type='button';
    up.disabled=i===0;down.disabled=i===draft.length-1;
    up.addEventListener('click',()=>{[draft[i-1],draft[i]]=[draft[i],draft[i-1]];redraw(i-1)});
    down.addEventListener('click',()=>{[draft[i+1],draft[i]]=[draft[i],draft[i+1]];redraw(i+1)});
    remove.addEventListener('click',()=>{draft.splice(i,1);redraw(Math.max(0,i-1))});
    actions.append(up,down,remove);head.append(actions);card.append(head);
    const detail=node('div','swapp-mosaic-editor-detail');
    const previewShell=node('div','swapp-mosaic-editor-preview-shell');
    const preview=node('div','swapp-mosaic-editor-preview');
    const previewImg=node('img','');
    previewImg.alt='Aperçu';
    previewImg.hidden=!p.image_url;
    if(p.image_url)previewImg.src=p.image_url;
    preview.append(previewImg);
    const placeholder=node('span','','Aucun visuel');placeholder.hidden=!!p.image_url;preview.append(placeholder);
    const qualityNote=node('p','swapp-mosaic-quality-note','');
    function showImageQuality(){
     const w=previewImg.naturalWidth,h=previewImg.naturalHeight;
     if(!p.image_url||!w||!h){qualityNote.textContent='';return;}
     const recommended={hero:2200,large:1400,medium:900,small:650}[p.size]||900;
     const weak=w<recommended;
     qualityNote.dataset.warning=String(weak);
     qualityNote.textContent=w+' × '+h+' px · '+(weak?
      'Résolution faible pour cette taille : remplace le visuel par le fichier original.':
      'Définition adaptée à cette taille.');
    }
    previewImg.addEventListener('load',showImageQuality);
    previewShell.append(preview,qualityNote);
    const form=node('div','swapp-mosaic-editor-fields');
    const url=textInput(p.image_url.startsWith('data:')?'':p.image_url,'https://… ou importer une image',2000);
    url.addEventListener('change',()=>{
     const v=url.value.trim();
     if(v&&!safeUrl(v)){status('Image : utilise une URL http(s) valide.',true);return;}
     if(v){p.image_url=v;previewImg.src=v;previewImg.hidden=false;placeholder.hidden=true;}
     else if(!p.image_url.startsWith('data:')){p.image_url='';previewImg.hidden=true;placeholder.hidden=false;}
    });
    const file=node('input','');file.type='file';file.accept='image/jpeg,image/png,image/webp';
    file.addEventListener('change',async()=>{
     try{status('Préparation du visuel…');p.image_url=await imageFromFile(file.files?.[0]);previewImg.src=p.image_url;previewImg.hidden=false;placeholder.hidden=true;url.value='';status('Visuel prêt. Enregistre pour le publier.')}
     catch(error){status(error.message||'Image non utilisable.',true)}
    });
    const name=textInput(p.title,'Titre facultatif',60);name.addEventListener('input',()=>{p.title=name.value});
    const description=node('textarea','');description.rows=2;description.maxLength=220;
    description.placeholder='Description facultative';description.value=p.description;
    description.addEventListener('input',()=>{p.description=description.value});
    const link=textInput(p.link_url,'https://… ou /jeux/…',1000);link.addEventListener('input',()=>{p.link_url=link.value});
    const size=selectInput([['hero','Panoramique · 12 colonnes'],['large','Grand · 6 colonnes'],['medium','Moyen · 4 colonnes'],['small','Compact · 3 colonnes']],p.size);
    size.addEventListener('change',()=>{p.size=size.value;showImageQuality()});
    const ratio=selectInput([['auto','Original · sans recadrage'],['16:9','16:9 · paysage'],['21:9','21:9 · panoramique'],['3:2','3:2 · photo'],['1:1','1:1 · carré'],['4:5','4:5 · portrait'],['3:4','3:4 · vertical']],p.ratio);
    ratio.addEventListener('change',()=>{p.ratio=ratio.value});
    const fit=selectInput([['contain','Afficher l’image entière'],['cover','Remplir et recadrer']],p.fit);
    fit.addEventListener('change',()=>{p.fit=fit.value});
    const style=selectInput([['image','Image avec titre dessous'],['overlay','Texte sur l’image']],p.style);
    style.addEventListener('change',()=>{p.style=style.value});
    const options=node('div','swapp-mosaic-editor-options');
    options.append(labelInput('Taille',size),labelInput('Proportions',ratio),labelInput('Cadrage',fit),labelInput('Présentation',style));
    const focal=node('div','swapp-mosaic-editor-focal');
    focal.append(fieldRange('Position horizontale',p.focal_x,value=>{p.focal_x=value;previewImg.style.objectPosition=p.focal_x+'% '+p.focal_y+'%'}),
      fieldRange('Position verticale',p.focal_y,value=>{p.focal_y=value;previewImg.style.objectPosition=p.focal_x+'% '+p.focal_y+'%'}));
    previewImg.style.objectPosition=p.focal_x+'% '+p.focal_y+'%';
    form.append(labelInput('URL de l’image',url),labelInput('Importer / remplacer par l’image originale (HD)',file),
      labelInput('Titre',name),labelInput('Description',description),
      labelInput('Lien au clic',link),options,focal);
    detail.append(previewShell,form);card.append(detail);content.append(card);
    if(previewImg.complete&&previewImg.naturalWidth)showImageQuality();
   });
   add.disabled=draft.length>=8;
   if(focus>=0)content.children[focus]?.scrollIntoView?.({block:'nearest'});
  }
  save.addEventListener('click',async()=>{
   const result=draft.filter(p=>!!p.image_url?.trim());
   for(const p of result){
    if(!(/^data:image\/(?:jpeg|png|webp);base64,/i.test(p.image_url)||safeUrl(p.image_url))){
     status('Chaque visuel doit être importé ou utiliser une URL valide.',true);return;
    }
    if(p.link_url.trim()&&!safeUrl(p.link_url)){status('Lien invalide : utilise une adresse http(s) ou un chemin SWAPP.',true);return;}
   }
   save.disabled=true;status('Enregistrement en cours…');
   try{
    // Shared publication path checks the active SWAPP owner session, persists,
    // and verifies the public gallery before reporting success.
    const savedUser=await verifiedPublish(result,String(profile()?.login||'').toLowerCase());
    if(typeof state!=='undefined')state.channelProfile=savedUser;
    closeEditor();
    if(typeof renderChannel==='function')await renderChannel();
   }catch(error){status(String(error.message||'Erreur de sauvegarde.'),true)}
   finally{save.disabled=false}
  });
  footer.append(add,cancel,save);
  dialog.append(header,notice,content,footer);overlay.append(dialog);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeEditor()});
  overlay.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();closeEditor();}
   if(event.key==='Tab'){
    const focusables=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select')];
    if(!focusables.length)return;
    const first=focusables[0],last=focusables[focusables.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
  });
  active=overlay;document.body.append(overlay);
  document.body.classList.add('swapp-mosaic-dialog-open');
  redraw();
  dismiss.focus();
  if(selected>=0)content.children[selected]?.scrollIntoView?.({block:'center'});
 }
 function init(){
  const root=document.getElementById('channel');if(!root)return;
  let scheduled=false;
  const run=()=>{
   if(scheduled)return;scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;const page=root.querySelector('.creatorRefine');
    if(page&&!page.dataset.mosaicInitialized){
     page.dataset.mosaicInitialized='1';
     decorate(page);
    }
   });
  };
  new MutationObserver(changes=>{
   if(changes.some(c=>c.target===root&&c.addedNodes.length))run();
  }).observe(root,{childList:true});
  run();
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={normalize,safeUrl};return;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
