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
 const steamGames={'GTA V / FiveM':271590,'GTA RP':271590,'Rust':252490,'DayZ':221100,'Cyberpunk 2077':1091500,'Arma 3':107410,'Arma Reforger':1874880,'ARK Survival Ascended':2399830,'ARK Survival Evolved':346110,'Project Zomboid':108600,'Palworld':1623730,'Red Dead Redemption 2':1174180,'Garry’s Mod':4000,'Valheim':892970,'Enshrouded':1203620,'Conan Exiles':440900,'SCUM':513710,'Counter-Strike 2':730,'7 Days to Die':251570,'Eco':382310,'V Rising':1604030,'Unturned':304930,'Space Engineers':244850,'Dune Awakening':1172710,'Hell Let Loose':686810,'Squad':393380,'Terraria':105600,'No Man’s Sky':275850,'Satisfactory':526870,'Don’t Starve Together':322330,'Lethal Company':1966720};
 const gameImage=chosen=>chosen==='Minecraft'?'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-720x960.jpg':steamGames[chosen]?'https://cdn.cloudflare.steamstatic.com/steam/apps/'+steamGames[chosen]+'/header.jpg':'';
 function cleanDiscordCode(input){
  let code=String(input||'').trim();
  code=code.replace(/^https?:\/\/(?:www\.)?discord\.gg\//i,'').replace(/^https?:\/\/(?:www\.)?discord(?:app)?\.com\/invite\//i,'').replace(/\/$/,'');
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
  preview.tags.replaceChildren(...selected().map(tag=>{const span=document.createElement('span');span.textContent=tag;return span}));
  const banner=form.elements.bannerUrl.value.trim();
  const imgUrl=/^https:\/\/[^<>"'\s]+$/i.test(banner)?banner:gameImage(game.value);
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
 form.addEventListener('input',event=>{if(event.target!==discord&&error.textContent)error.replaceChildren();refresh()});
 form.addEventListener('change',refresh);
 const preselected=new URLSearchParams(location.search).get('jeu');
 if(preselected&&[...game.options].some(option=>option.value===preselected))game.value=preselected;
 refresh();
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.replaceChildren();
  const isDiscord=game.value==='Discord / Multigaming',rawCode=discord.value.trim();
  if(!form.checkValidity()){focusInvalid();return}
  if(isDiscord&&!cleanDiscordCode(rawCode)){discord.focus();errorMessage('Entre un code Discord valide, par exemple AbC123, ou un lien https://discord.gg/AbC123.');return}
  const data=Object.fromEntries(new FormData(form).entries());
  data.types=selected();
  data.game=game.value;
  data.discordCode=isDiscord?cleanDiscordCode(rawCode):'';
  data.joinAddress=isDiscord?'':address.value.trim();
  data.twitch=form.elements.twitch.value.trim();
  data.language=form.elements.language.value;
  data.bannerUrl=form.elements.bannerUrl.value.trim();
  data.website=form.elements.website.value.trim();
  delete data.confirm;
  submit.disabled=true;submit.textContent='Vérification et publication…';
  try{
   const response=await fetch('/api/swapp/serveurs',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(data)
   });
   let result={};try{result=await response.json()}catch{}
   if(!response.ok){
    const messages={
     connexion_swapp_requise:'Tu dois être connecté à ton compte SWAPP pour publier. Utilise le lien « Mon compte » puis reviens sur cette page.',
     limite_de_cinq_serveurs:'Tu as atteint la limite de cinq serveurs référencés.',
     informations_invalides:'Certaines informations sont invalides. Vérifie le lien HTTPS, les types sélectionnés, l’adresse de connexion et la description.',
     invitation_discord_requise:'Le code ou le lien d’invitation Discord est obligatoire.',
     verification_discord_impossible:result.reason==='discord_rate_limited'?'Discord limite temporairement les vérifications. Réessaie.':'Discord ne confirme pas cette invitation. Vérifie le code et réessaie.',
     serveur_deja_inscrit:'Ce serveur figure déjà dans le classement SWAPP.',
     metadata_indisponible:'L’enregistrement est momentanément indisponible. Réessaie.'
    };
    errorMessage(messages[result.error]||'Impossible d’enregistrer ce serveur pour le moment.');
    if(result.url&&/^\/serveurs\/[a-z0-9/-]+$/.test(result.url)){
     const anchor=document.createElement('a');anchor.href=result.url;anchor.textContent='Voir la fiche existante';error.append(anchor);
    }
    return;
   }
   if(result.status!=='published'||!/^\/serveurs\/[a-z0-9/-]+$/.test(result.url||''))throw Error('La publication n’a pas été confirmée.');
   location.assign(result.url);
  }catch(err){errorMessage('L’enregistrement a échoué : '+err.message)}
  finally{submit.disabled=false;submit.textContent='Ajouter mon serveur'}
 });
})();
