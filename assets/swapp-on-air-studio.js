/* SWAPP ON AIR: owner-only MP3 studio; real upload before visible release. */
(()=>{'use strict';
 const form=document.getElementById('oas-form');if(!form)return;
 const $=id=>document.getElementById(id),file=$('oas-file'),preview=$('oas-preview');
 const title=$('oas-title'),slug=$('oas-slug'),status=$('oas-status'),button=$('oas-publish');
 let slugTouched=false,objectURL=null,upload=null;
 const slugify=s=>String(s||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 title.addEventListener('input',()=>{
  if(slugTouched)return;
  const base=slugify(title.value).slice(0,64).replace(/-+$/,'');
  const date=new Date().toISOString().slice(0,10).replace(/-/g,'');
  slug.value=base?('on-air-'+base+'-'+date).slice(0,85):'';
 });
 slug.addEventListener('input',()=>{slugTouched=true;upload=null});
 file.addEventListener('change',()=>{
  upload=null;
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null}
  const chosen=file.files?.[0];
  if(!chosen){preview.hidden=true;preview.removeAttribute('src');return}
  if(!/\.mp3$/i.test(chosen.name)||chosen.size<30000||chosen.size>24*1024*1024){
   status.textContent='Sélectionne un véritable fichier MP3 de 30 Ko à 24 Mo.';
   file.value='';preview.hidden=true;return;
  }
  objectURL=URL.createObjectURL(chosen);preview.src=objectURL;preview.hidden=false;
  status.textContent='Écoute le MP3 avant de cocher la validation.';
 });
 const lines=(value)=>String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const errorMessage=(value)=>{
  const messages={
   unauthorized:'Accès réservé à l’administration SWAPP.',
   invalid_slug:"L’adresse de l’épisode contient des caractères invalides.",
   audio_size_invalid:'Ce MP3 est trop volumineux, trop court ou incomplet.',
   audio_not_mp3:'Le fichier ne contient pas un flux MP3 valide.',
   audio_invalid_frames:'La piste MP3 est illisible.',
   audio_duration_invalid:'La durée du MP3 est hors limites.',
   publication_busy:'Une autre publication est en cours. Réessaie.',
   episode_exists:'Un épisode porte déjà cette adresse. Modifie-la.',
   sources_required:'Ajoute au moins une source officielle HTTPS.',
   invalid_source:'Corrige les liens des sources officielles.',
   invalid_article:'Un lien d’article SWAPP est invalide.',
   approval_required:'Il faut confirmer les trois validations avant de publier.',
   upload_missing:'Le fichier envoyé est introuvable : réessaie l’envoi.',
   storage_unavailable:'Le stockage podcast est indisponible sur Hostinger.',
   upload_failed:'Impossible d’envoyer le MP3 sur SWAPP.',
   invalid_editorial_metadata:'Vérifie la longueur du titre et de la description.',
   source_required:'Une source officielle est obligatoire.',
   index_corrupt:'Le catalogue podcast nécessite une réparation.'
  };
  return messages[value]||'Publication impossible ('+String(value||'erreur inconnue').slice(0,70)+').';
 };
 function sendFile(chosen,slugName){
  return new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();
   xhr.open('POST','/api/on-air/studio/upload/'+encodeURIComponent(slugName));
   xhr.withCredentials=true;
   xhr.timeout=120000;
   xhr.setRequestHeader('Content-Type','audio/mpeg');
   xhr.setRequestHeader('X-SWAPP-ON-AIR-ACTION','publish');
   xhr.upload.onprogress=e=>{
    if(e.lengthComputable)status.textContent='Envoi du MP3 : '+Math.min(99,Math.round(100*e.loaded/e.total))+' %';
   };
   xhr.onload=()=>{
    let result={};try{result=JSON.parse(xhr.responseText||'{}')}catch{}
    if(xhr.status>=200&&xhr.status<300&&result.success)resolve(result);
    else reject(Error(result.error||'upload_failed'));
   };
   xhr.onerror=()=>reject(Error('upload_failed'));
   xhr.ontimeout=()=>reject(Error('upload_failed'));
   xhr.send(chosen);
  });
 }
 const sourcesOf=()=>{
  const result=[];
  for(const line of lines($('oas-sources').value)){
   const pos=line.indexOf('|');
   if(pos<=0)throw Error('invalid_source');
   const label=line.slice(0,pos).trim(),url=line.slice(pos+1).trim();
   if(!label||!/^https:\/\/[^/\s]+/i.test(url))throw Error('invalid_source');
   result.push({label,url});
  }
  if(!result.length)throw Error('sources_required');
  return result;
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(button.disabled)return;
  const chosen=file.files?.[0],name=slug.value.trim();
  if(!chosen){status.textContent='Sélectionne ton MP3 final.';return}
  let sources,articles;
  try{
   sources=sourcesOf();
   articles=lines($('oas-articles').value);
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||name.length<7||name.length>85)
    throw Error('invalid_slug');
  }catch(error){status.textContent=errorMessage(error.message);return}
  button.disabled=true;
  try{
   if(!upload||upload.slug!==name||upload.file!==chosen){
    const result=await sendFile(chosen,name);
    upload={id:result.upload_id,slug:name,file:chosen};
   }
   status.textContent='Validation et publication de ton épisode…';
   const r=await fetch('/api/on-air/studio/publish',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-SWAPP-ON-AIR-ACTION':'publish'},
    body:JSON.stringify({
     slug:name,upload_id:upload.id,title:title.value,
     description:$('oas-description').value,sources,articles,
     audioReviewed:$('oas-listened').checked,
     editorialApproved:$('oas-facts').checked,
     licenseConfirmed:$('oas-rights').checked
    })
   });
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.success||!data.episode?.url)throw Error(data.error||'publication_failed');
   status.replaceChildren('Épisode publié. ');
   const a=document.createElement('a');a.href=data.episode.url;a.textContent='Écouter sur SWAPP';
   status.append(a);
   button.textContent='Épisode publié';
   button.disabled=true;
  }catch(error){status.textContent=errorMessage(error.message);button.disabled=false}
 });
 window.addEventListener('pagehide',()=>{if(objectURL)URL.revokeObjectURL(objectURL)});
})();