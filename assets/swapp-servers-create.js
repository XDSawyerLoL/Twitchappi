'use strict';
/* Standalone SERVEUR + creation experience; no modal and no extra account. */
(()=>{
 const form=document.getElementById('ss-create-form');if(!form)return;
 const $=selector=>form.querySelector(selector);
 const game=$('#ss-create-game'),name=$('#ss-create-name'),description=$('#ss-create-description');
 const discord=$('#ss-create-discord'),address=$('#ss-create-address');
 const discordWrap=$('#ss-create-discord-wrap'),addressWrap=$('#ss-create-address-wrap');
 const submit=$('#ss-create-submit'),error=$('#ss-create-error'),counter=$('#ss-create-remaining');
 const tags=[...form.querySelectorAll('input[name="types"]')];
 const selected=()=>tags.filter(x=>x.checked).map(x=>x.value);
 const preview={game:document.getElementById('ss-create-preview-game'),name:document.getElementById('ss-create-preview-name'),description:document.getElementById('ss-create-preview-description'),tags:document.getElementById('ss-create-preview-tags'),art:document.getElementById('ss-create-preview-art')};
 const root=document.getElementById('ss-create-root'),editId=root?.dataset.ssEditId||'';
 let editData=null;
 try{editData=JSON.parse(document.getElementById('ss-create-edit-data')?.textContent||'null')}catch(_){}
 const current={logo:editData?.logoUrl||'',banner:editData?.brandBannerUrl||editData?.bannerUrl||''};
 const removed={logo:false,banner:false};
 const fileInputs={logo:$('#ss-create-logo-file'),banner:$('#ss-create-banner-file')};
 const localPreviews={logo:'',banner:''};
 const brandingPreview=document.querySelector('.ss-create-preview');
 const logoPreview=document.getElementById('ss-create-preview-logo');
 const colors={accent:form.elements.accentColor,secondary:form.elements.secondaryColor};
 const validHttp=x=>/^https:\/\/[^<>"'\s]+$/i.test(x||'');
 function displayLogo(){
  const url=localPreviews.logo||(validHttp(form.elements.logoUrl.value)?form.elements.logoUrl.value:(!removed.logo?current.logo:''));
  if(logoPreview.dataset.url===url)return;
  logoPreview.dataset.url=url;
  logoPreview.replaceChildren();
  if(!url){logoPreview.textContent='S';return}
  const img=document.createElement('img');img.src=url;img.alt='Logo de la communauté';img.addEventListener('error',()=>{img.remove();logoPreview.textContent='S'},{once:true});
  logoPreview.append(img);
 }
 const chooseImages=kind=>{
  const file=fileInputs[kind]?.files?.[0]||null;
  if(localPreviews[kind])URL.revokeObjectURL(localPreviews[kind]);
  localPreviews[kind]=file?URL.createObjectURL(file):'';
  if(file){
   removed[kind]=false;
   // A chosen local file takes precedence over an older/pasted URL.
   // Avoid rejecting a valid upload because an unrelated URL field is invalid.
   const urlField=kind==='logo'?form.elements.logoUrl:form.elements.bannerUrl;
   if(urlField)urlField.value='';
  }
  refresh();
 };
 for(const kind of ['logo','banner'])fileInputs[kind]?.addEventListener('change',()=>chooseImages(kind));
 for(const button of document.querySelectorAll('[data-ss-clear-media]'))button.addEventListener('click',()=>{
  const kind=button.dataset.ssClearMedia;
  if(!['logo','banner'].includes(kind))return;
  removed[kind]=true;
  if(localPreviews[kind])URL.revokeObjectURL(localPreviews[kind]);
  localPreviews[kind]='';
  if(fileInputs[kind])fileInputs[kind].value='';
  if(kind==='logo')form.elements.logoUrl.value='';
  else form.elements.bannerUrl.value='';
  refresh();
 });
 for(const button of document.querySelectorAll('[data-ss-palette]'))button.addEventListener('click',()=>{
  const [accent,secondary]=button.dataset.ssPalette.split(',');
  colors.accent.value=accent;colors.secondary.value=secondary;refresh();
 });
 if(editData){
  for(const field of ['name','description','language','region','tagline']){
   if(form.elements[field]&&editData[field]!=null)form.elements[field].value=String(editData[field]);
  }
  game.value=editData.game||game.value;game.disabled=true;
  form.elements.website.value=editData.homepageUrl||((game.value==='Discord / Multigaming')?'':editData.website||'');
  form.elements.twitch.value=editData.twitchUrl||'';
  discord.value=editData.website||'';
  address.value=editData.joinAddress||'';
  colors.accent.value=/^#[\da-f]{6}$/i.test(editData.accentColor||'')?editData.accentColor:'#8ceaf0';
  colors.secondary.value=/^#[\da-f]{6}$/i.test(editData.secondaryColor||'')?editData.secondaryColor:'#ad6bff';
  if(validHttp(current.logo))form.elements.logoUrl.value=current.logo;
  if(validHttp(current.banner))form.elements.bannerUrl.value=current.banner;
  const savedTags=String(editData.tags||'').split(',').map(x=>x.trim());
  tags.forEach(t=>{t.checked=savedTags.includes(t.value)});
  let gallery=[];try{gallery=JSON.parse(editData.galleryJson||'[]')}catch(_){}
  gallery.forEach((image,i)=>{if(i<3&&form.elements['gallery'+(i+1)])form.elements['gallery'+(i+1)].value=image});
  const consent=form.elements.confirm;if(consent)consent.checked=true;
 }

 const steamGames={'GTA V / FiveM':271590,'GTA RP':271590,'Rust':252490,'DayZ':221100,'Cyberpunk 2077':1091500,'Arma 3':107410,'Arma Reforger':1874880,'ARK Survival Ascended':2399830,'ARK Survival Evolved':346110,'Project Zomboid':108600,'Palworld':1623730,'Red Dead Redemption 2':1174180,'Garry’s Mod':4000,'Valheim':892970,'Enshrouded':1203620,'Conan Exiles':440900,'SCUM':513710,'Counter-Strike 2':730,'7 Days to Die':251570,'Eco':382310,'V Rising':1604030,'Unturned':304930,'Space Engineers':244850,'Dune Awakening':1172710,'Hell Let Loose':686810,'Squad':393380,'Terraria':105600,'No Man’s Sky':275850,'Satisfactory':526870,'Don’t Starve Together':322330,'Lethal Company':1966720};
 const gameImage=chosen=>chosen==='Minecraft'?'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-720x960.jpg':steamGames[chosen]?'https://cdn.cloudflare.steamstatic.com/steam/apps/'+steamGames[chosen]+'/header.jpg':'';
 function cleanDiscordCode(input){
  let code=String(input||'').trim();
  code=code.replace(/^(?:https?:\/\/)?(?:www\.)?discord\.gg\//i,'').replace(/^(?:https?:\/\/)?(?:www\.)?discord(?:app)?\.com\/invite\//i,'').replace(/\/$/,'');
  return /^[a-zA-Z0-9-]{2,64}$/.test(code)?code:'';
 }
 function refresh(){
  const isDiscord=game.value==='Discord / Multigaming';
  discordWrap.hidden=!isDiscord;addressWrap.hidden=isDiscord;
  discord.required=isDiscord;address.required=false;
  counter.textContent=description.value.length.toLocaleString('fr-FR')+' / 1 500 caractères';
  const count=selected().length;
  document.getElementById('ss-create-type-count').textContent=count+' / 6 catégories sélectionnées';
  tags.forEach(checkbox=>{checkbox.disabled=!checkbox.checked&&count>=6});
  preview.game.textContent=game.value;
  preview.name.textContent=name.value.trim()||'Ton serveur';
  preview.description.textContent=description.value.trim().slice(0,200)||'Ta communauté apparaîtra ici, avec sa présentation et ses catégories.';
  brandingPreview?.style.setProperty('--ss-brand-accent',colors.accent.value);
  brandingPreview?.style.setProperty('--ss-brand-secondary',colors.secondary.value);
  displayLogo();
  preview.tags.replaceChildren(...selected().map(tag=>{const span=document.createElement('span');span.textContent=tag;return span}));
  const banner=form.elements.bannerUrl.value.trim();
  const imgUrl=localPreviews.banner||(validHttp(banner)?banner:(!removed.banner&&current.banner?current.banner:gameImage(game.value)));
  if(preview.art.dataset.currentImage!==imgUrl){
   preview.art.dataset.currentImage=imgUrl;
   preview.art.querySelector('img')?.remove();
   if(imgUrl){
    const img=document.createElement('img');img.src=imgUrl;img.alt='Aperçu illustratif du serveur';img.loading='lazy';img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>img.remove(),{once:true});preview.art.prepend(img);
   }
  }
 }
 function errorMessage(message){
  error.replaceChildren();
  if(!message)return;
  const p=document.createElement('p');p.textContent=message;error.append(p);
  error.scrollIntoView({block:'center',behavior:'smooth'});
 }
 function focusInvalid(){
  const invalid=[...form.querySelectorAll('input,textarea,select')].find(x=>!x.disabled&&!x.checkValidity());
  if(invalid){invalid.focus();errorMessage('Vérifie le champ « '+(invalid.closest('label')?.textContent||invalid.name).trim().slice(0,85)+' ».');return true}
  return false;
 }
 // The reference form displays https:// as a prefix. Accept bare domains as
 // well, but normalize them to HTTPS rather than storing ambiguous addresses.
 for(const field of [form.elements.website,form.elements.bannerUrl,form.elements.logoUrl,...[1,2,3].map(n=>form.elements['gallery'+n])]){
  field?.addEventListener('blur',()=>{
   const value=field.value.trim();
   if(value&&/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#].*)?$/i.test(value)){
    field.value='https://'+value;
    refresh();
   }
  });
 }
 form.addEventListener('input',event=>{
  if(event.target?.removeAttribute)event.target.removeAttribute('aria-invalid');
  if(event.target!==discord&&error.textContent)error.replaceChildren();
  refresh();
 });
 form.addEventListener('change',refresh);
 const preselected=new URLSearchParams(location.search).get('jeu');
 if(!editData&&preselected&&[...game.options].some(option=>option.value===preselected))game.value=preselected;
 refresh();
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.replaceChildren();
  const isDiscord=game.value==='Discord / Multigaming',rawCode=discord.value.trim();
  // One real point of contact is required for game servers, not necessarily both.
  // The old form could submit two blanks and only show a misleading generic API error.
  if(!isDiscord&&!address.value.trim()&&!form.elements.website.value.trim()){
   errorMessage('Indique une adresse de connexion au jeu OU l’adresse HTTPS du site du serveur. Un seul des deux champs suffit.');
   address.focus();return;
  }
  if(!form.checkValidity()){focusInvalid();return}
  if(isDiscord&&!cleanDiscordCode(rawCode)){discord.focus();errorMessage('Entre un code Discord valide, par exemple AbC123, ou un lien https://discord.gg/AbC123.');return}
  const data=Object.fromEntries(new FormData(form).entries());
  data.types=selected();
  data.game=game.value;
  data.discordCode=isDiscord?cleanDiscordCode(rawCode):'';
  data.joinAddress=isDiscord?'':address.value.trim();
  data.twitch=form.elements.twitch.value.trim();
  data.language=form.elements.language.value;
  data.bannerUrl=form.elements.bannerUrl.value.trim()||(!removed.banner?current.banner:'');
  data.brandBannerUrl=data.bannerUrl;
  data.logoUrl=form.elements.logoUrl.value.trim()||(!removed.logo?current.logo:'');
  data.accentColor=colors.accent.value;
  data.secondaryColor=colors.secondary.value;
  data.tagline=form.elements.tagline.value.trim();
  data.gallery=[1,2,3].map(n=>form.elements['gallery'+n].value.trim()).filter(Boolean);
  data.website=form.elements.website.value.trim();
  delete data.confirm;delete data.logoFile;delete data.bannerFile;
  if(fileInputs.logo?.files?.[0]&&fileInputs.logo.files[0].size>2*1024*1024){errorMessage('Le logo doit peser moins de 2 Mo.');return}
  if(fileInputs.banner?.files?.[0]&&fileInputs.banner.files[0].size>2*1024*1024){errorMessage('La bannière doit peser moins de 2 Mo.');return}
  submit.disabled=true;submit.textContent=editId?'Enregistrement…':'Vérification et publication…';
  try{
   const response=await fetch(editId?'/api/swapp/serveurs/'+encodeURIComponent(editId):'/api/swapp/serveurs',{
    method:editId?'PUT':'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(data)
   });
   let result={};try{result=await response.json()}catch{}
   if(!response.ok){
    const messages={
     connexion_swapp_requise:'Tu dois être connecté à ton compte SWAPP pour publier. Utilise le lien « Mon compte » puis reviens sur cette page.',
     limite_de_cinq_serveurs:'Tu as atteint la limite de cinq serveurs référencés.',
     informations_invalides:'Vérifie les informations du formulaire : un des champs est incorrect.',
     invitation_discord_requise:'Le code ou le lien d’invitation Discord est obligatoire.',
     verification_discord_impossible:result.reason==='discord_rate_limited'?'Discord limite temporairement les vérifications. Réessaie.':'Discord ne confirme pas cette invitation. Vérifie le code et réessaie.',
     serveur_deja_inscrit:'Ce serveur figure déjà dans le classement SWAPP.',
     metadata_indisponible:'L’enregistrement est momentanément indisponible. Réessaie.',
     jeu_non_modifiable:'Le jeu ne peut pas être modifié une fois le serveur publié.',
     serveur_introuvable:'Ce serveur n’appartient pas à ton compte connecté.'
    };
    if(result.error==='informations_invalides'&&result.fields&&typeof result.fields==='object'){
     const problems=Object.entries(result.fields).filter(([field,message])=>typeof message==='string'&&message.length>0);
     if(problems.length){
      // Server is authoritative; show precise, actionable messages without exposing input contents.
      errorMessage(problems.slice(0,4).map(([,message])=>message).join(' '));
      const focusField=problems[0][0]==='types'?tags.find(t=>!t.disabled):
       problems[0][0]==='gallery'?form.elements.gallery1:
       problems[0][0]==='branding'?form.elements.logoUrl:
       form.elements[problems[0][0]];
      if(focusField&&typeof focusField.focus==='function'){
       focusField.setAttribute('aria-invalid','true');
       focusField.focus({preventScroll:true});
      }
     }else errorMessage(messages[result.error]);
    }else errorMessage(messages[result.error]||'Impossible d’enregistrer ce serveur pour le moment.');
    if(result.url&&/^\/serveurs\/[a-z0-9/-]+$/.test(result.url)){
     const anchor=document.createElement('a');anchor.href=result.url;anchor.textContent='Voir la fiche existante';error.append(anchor);
    }
    return;
   }
   if(result.status!=='published'||!/^\/serveurs\/[a-z0-9/-]+$/.test(result.url||''))throw Error('La publication n’a pas été confirmée.');
   const serverId=editId||result.id;
   for(const kind of ['logo','banner']){
    const file=fileInputs[kind]?.files?.[0];
    if(removed[kind]&&!file&&editId){
     const deleted=await fetch('/api/swapp/serveurs/'+encodeURIComponent(serverId)+'/media/'+kind+'/remove',{
      method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}
     });
     if(!deleted.ok){
      const open=document.createElement('a');open.href=result.url;open.textContent='Ouvrir la fiche déjà enregistrée';
      errorMessage('La fiche est enregistrée, mais la suppression de '+(kind==='logo'?'l’ancien logo':'l’ancienne bannière')+' a échoué. Réessaie.');
      error.append(open);return;
     }
    }
    if(!file)continue;
    if(!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type))throw Error('Format de '+kind+' non pris en charge. Utilise PNG, JPG ou WebP.');
    submit.textContent='Envoi du '+(kind==='logo'?'logo…':'visuel de bannière…');
    const upload=await fetch('/api/swapp/serveurs/'+encodeURIComponent(serverId)+'/media/'+kind,{
     method:'PUT',credentials:'same-origin',headers:{'Content-Type':file.type},body:file
    });
    if(!upload.ok){
     const link=document.createElement('a');link.href=result.url;link.textContent='Ouvrir la fiche déjà enregistrée';
     errorMessage('La fiche est enregistrée, mais le '+(kind==='logo'?'logo':'visuel de bannière')+' n’a pas été transféré. Réessaie pour terminer.');
     error.append(link);return;
    }
   }
   location.assign(result.url);
  }catch(err){errorMessage('L’enregistrement a échoué : '+err.message)}
  finally{submit.disabled=false;submit.textContent=editId?'Enregistrer les modifications':'Publier mon serveur'}
 });
})();
