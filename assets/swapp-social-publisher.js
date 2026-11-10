(()=>{'use strict';
const byId=id=>document.getElementById(id);
const list=byId('sp-list'),status=byId('sp-status'),dialog=byId('sp-dialog');
let selected=null;
function button(title,action,primary=false){
 const b=document.createElement('button');b.type='button';b.textContent=title;
 if(primary)b.className='primary';b.addEventListener('click',action);return b;
}
async function fetchJson(path,options){
 const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json',...options?.headers},...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'HTTP '+r.status);
 return data;
}
function errorMessage(e){return String(e?.message||e).slice(0,180)}
async function refresh(){
 status.textContent='Chargement…';list.replaceChildren();
 try{
  const data=await fetchJson('/api/editor/actus/social/queue'),jobs=data.articles||[];
  status.textContent=jobs.length+' article(s) suivi(s) · Publication automatique sur X désactivée';
  if(!jobs.length){
   const p=document.createElement('p');
   p.textContent='Aucun nouvel article à partager. Les prochaines publications apparaîtront ici après leur mise en ligne dans SWAPP Studio.';
   list.append(p);return;
  }
  for(const entry of jobs){
   const card=document.createElement('article');card.className='item';
   const main=document.createElement('div'),name=document.createElement('div');
   name.className='title';name.textContent=entry.title||entry.slug;
   const meta=document.createElement('p');meta.className='meta';
   meta.textContent=(entry.publishedAt?new Date(entry.publishedAt).toLocaleString('fr-FR')+' · ':'')+
     (entry.status==='reported'?'Lien renseigné par un éditeur':'À partager sur X');
   main.append(name,meta);
   if(entry.reportedPostUrl){
    const link=document.createElement('a');link.href=entry.reportedPostUrl;
    link.target='_blank';link.rel='noopener noreferrer';link.textContent='Voir le post X renseigné';
    main.append(link);
   }
   card.append(main,button('Préparer sur X',()=>openPreview(entry.slug),true));list.append(card);
  }
 }catch(e){status.textContent='Chargement impossible : '+errorMessage(e);}
}
async function openPreview(slug){
 try{
  selected=await fetchJson('/api/editor/actus/'+encodeURIComponent(slug)+'/social-preview');
  byId('sp-heading').textContent='𝕏 · '+(selected.title||slug);
  byId('sp-preview').textContent=selected.text;
  byId('sp-url').value=selected.reportedPostUrl||'';
  byId('sp-result').textContent='';dialog.showModal();
 }catch(e){status.textContent='Prévisualisation impossible : '+errorMessage(e);}
}
byId('sp-open').addEventListener('click',()=>{
 if(!selected)return;
 window.open(selected.intentUrl,'_blank','noopener,noreferrer');
 byId('sp-result').textContent='Formulaire X ouvert : la publication reste à valider sur X.';
});
byId('sp-copy').addEventListener('click',async()=>{
 if(!selected)return;
 try{await navigator.clipboard.writeText(selected.text);byId('sp-result').textContent='Texte copié.';}
 catch{byId('sp-result').textContent='Copie indisponible dans ce navigateur.';}
});
byId('sp-confirm').addEventListener('click',async()=>{
 if(!selected)return;
 const url=byId('sp-url').value.trim();
 if(!/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/swappstreaming\/status\/[0-9]{8,25}/i.test(url)){
  byId('sp-result').textContent='Indique une URL de post du compte @swappstreaming.';return;
 }
 try{
  const data=await fetchJson('/api/editor/actus/'+encodeURIComponent(selected.articleSlug)+'/social-report',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})
  });
  byId('sp-result').textContent=data.status==='reported'?'Lien enregistré (non vérifié automatiquement).':'Mise à jour enregistrée';
  await refresh();
 }catch(e){byId('sp-result').textContent='Enregistrement refusé : '+errorMessage(e);}
});
byId('sp-close').addEventListener('click',()=>dialog.close());
byId('sp-refresh').addEventListener('click',refresh);
refresh();
})();