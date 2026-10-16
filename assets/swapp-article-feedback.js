/* SWAPP article score and private saved articles — no third-party tracking. */
(()=>{'use strict';
 const KEY='swapp:saved-articles:v1';
 const REASON_OPTIONS=Object.freeze([
  {key:'useful',label:'Utile'},
  {key:'sourced',label:'Bien documenté'},
  {key:'engaging',label:'Intéressant'}
 ]);
 const ok=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!=null)x.textContent=String(value);return x};
 function saved(){
  try{
   const value=JSON.parse(localStorage.getItem(KEY)||'[]');
   return Array.isArray(value)?value.filter(x=>ok(x?.slug)&&typeof x.title==='string').slice(0,100):[];
  }catch{return []}
 }
 function put(items){
  try{localStorage.setItem(KEY,JSON.stringify(items.slice(0,100)));return true}
  catch{return false}
 }
 function openSaved(){
  document.querySelector('.swapp-saved-dialog')?.remove();
  const dialog=el('dialog','swapp-saved-dialog');
  const head=el('div','swapp-saved-head');
  head.append(el('h2','','Articles sauvegardés'));
  const close=el('button','','Fermer ×');close.type='button';close.onclick=()=>dialog.close();
  head.append(close);dialog.append(head);
  const records=saved();
  dialog.append(el('p','swapp-saved-notice','Conservés uniquement sur cet appareil. Aucun suivi de lecture.'));
  const list=el('div','swapp-saved-list');
  if(!records.length)list.append(el('p','','Aucun article sauvegardé pour le moment.'));
  records.forEach(x=>{
   const line=el('div','swapp-saved-item'),link=el('a','',x.title);
   link.href='/actus/'+encodeURIComponent(x.slug);
   const remove=el('button','','Retirer');
   remove.type='button';remove.setAttribute('aria-label','Retirer '+x.title+' des favoris');
   remove.onclick=()=>{
    put(saved().filter(item=>item.slug!==x.slug));
    dialog.close();dialog.remove();openSaved();
   };
   line.append(link,remove);list.append(line);
  });
  dialog.append(list);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();
 }
 function mountList(node){
  if(!node)return;
  const bar=node.querySelector('.swapp-actus-tools,.searchbar');
  if(!bar||bar.querySelector('.swapp-saved-open'))return;
  const button=el('button','swapp-saved-open','Mes favoris');
  button.type='button';button.onclick=openSaved;
  bar.append(button);
 }
 function mountArticle(node,slug){
  if(!node||!ok(slug)||node.querySelector('.swapp-article-feedback'))return;
  const reading=node.querySelector('.swapp-article-reading');
  if(!reading)return;
  const panel=el('section','swapp-article-feedback');
  panel.setAttribute('aria-label','Évaluer et sauvegarder cet article');
  const headline=el('div','swapp-feedback-head');
  const copy=el('div','swapp-feedback-copy');
  copy.append(el('strong','','Votre avis sur cet article'),el('p','','Évaluez sa qualité éditoriale, pas le jeu présenté.'));
  const save=el('button','swapp-feedback-save');
  save.type='button';
  const title=String(node.querySelector('h1')?.textContent||'Article SWAPP').trim().slice(0,180);
  function paintSave(){
   const active=saved().some(x=>x.slug===slug);
   save.textContent=active?'♥ Article sauvegardé':'♡ Sauvegarder';
   save.setAttribute('aria-pressed',String(active));
  }
  save.onclick=()=>{
   const values=saved(),existing=values.some(x=>x.slug===slug);
   const next=existing?values.filter(x=>x.slug!==slug):[{slug,title,savedAt:Date.now()},...values];
   if(put(next))paintSave();
   else status.textContent='Impossible de sauvegarder sur cet appareil.';
  };
  paintSave();headline.append(copy,save);panel.append(headline);
  const row=el('div','swapp-feedback-stars');
  const status=el('p','swapp-feedback-status','Chargement des évaluations…');
  status.setAttribute('aria-live','polite');
  const buttons=[],reasonButtons=[];
  let current=null,busy=false;
  function paint(){
   buttons.forEach((button,i)=>{
    const selected=current?.myRating===i+1;
    button.classList.toggle('is-selected',Number(current?.myRating)>=i+1);
    button.setAttribute('aria-pressed',String(selected));
    button.disabled=busy;
   });
   reasonButtons.forEach(({key,button})=>{
    const selected=Array.isArray(current?.myReasons)&&current.myReasons.includes(key);
    button.classList.toggle('is-selected',selected);
    button.setAttribute('aria-pressed',String(selected));
    button.disabled=busy;
   });
  }
  const endpoint='/api/actus/'+encodeURIComponent(slug)+'/score';
  async function vote(rating){
   if(busy)return;
   if(!current?.canRate){
    status.replaceChildren(el('span','','Connectez-vous pour évaluer cet article. '));
    const login=el('a','','Mon compte');login.href='/compte';status.append(login);return;
   }
   busy=true;paint();status.textContent='Enregistrement de la note…';
   try{
    const result=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({rating})});
    const data=await result.json().catch(()=>({}));
    if(!result.ok)throw Error(result.status===401?'Connectez-vous pour voter.':'Vote indisponible pour le moment.');
    current=data;show();
   }catch(e){status.textContent=e.message}
   finally{busy=false;paint()}
  }
  for(let i=1;i<=5;i++){
   const b=el('button','swapp-feedback-star','☆');
   b.type='button';b.setAttribute('aria-label','Noter cet article '+i+' sur 5');
   b.addEventListener('click',()=>vote(i));row.append(b);buttons.push(b);
  }
  const average=el('span','swapp-feedback-average','Aucune note');
  row.append(average);panel.append(row,status);
  // The qualitative choices are shown only after an article has been rated.
  const reasonsArea=el('div','swapp-feedback-reasons');
  reasonsArea.hidden=true;
  reasonsArea.append(el('strong','swapp-feedback-reasons-title','Qu’as-tu apprécié ?'));
  const reasonsRow=el('div','swapp-feedback-reason-list');
  const reasonsHint=el('p','swapp-feedback-reasons-hint','Facultatif · plusieurs réponses possibles.');
  const insight=el('p','swapp-feedback-insight');
  insight.hidden=true;
  async function chooseReason(key){
   if(busy||!current?.myRating)return;
   const previous=Array.isArray(current.myReasons)?current.myReasons:[];
   const next=previous.includes(key)?previous.filter(x=>x!==key):
    REASON_OPTIONS.map(x=>x.key).filter(x=>x===key||previous.includes(x));
   busy=true;paint();
   reasonsHint.textContent='Enregistrement du retour…';
   try{
    const response=await fetch(endpoint,{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json','Accept':'application/json'},
     body:JSON.stringify({rating:current.myRating,reasons:next})
    });
    if(!response.ok)throw Error('Retour momentanément indisponible.');
    current=await response.json();
    show();
   }catch(error){reasonsHint.textContent=error.message}
   finally{busy=false;paint()}
  }
  for(const option of REASON_OPTIONS){
   const button=el('button','swapp-feedback-reason',option.label);
   button.type='button';button.setAttribute('aria-pressed','false');
   button.onclick=()=>chooseReason(option.key);
   reasonButtons.push({key:option.key,button});reasonsRow.append(button);
  }
  reasonsArea.append(reasonsRow,reasonsHint,insight);panel.append(reasonsArea);
  const savedLink=el('button','swapp-feedback-saved-link','Voir mes articles sauvegardés →');
  savedLink.type='button';savedLink.onclick=openSaved;panel.append(savedLink);
  reading.after(panel);
  function show(){
   const count=Number(current?.count)||0;
   const avg=Number(current?.average);
   average.textContent=count&&Number.isFinite(avg)?avg.toLocaleString('fr-FR',{maximumFractionDigits:1})+'/5 · '+count+' vote'+(count>1?'s':''):'Pas encore de note';
   if(current?.myRating){
    status.textContent='Votre note : '+current.myRating+'/5. Modifiable à tout moment.';
   }else{
    status.textContent=current?.canRate?'Choisissez de 1 à 5 étoiles.':'Connectez-vous pour participer à la note communautaire.';
   }
   buttons.forEach((b,i)=>{b.textContent=current?.myRating>=i+1?'★':'☆'});
   reasonsArea.hidden=!current?.myRating;
   if(!reasonsArea.hidden){
    reasonsHint.textContent='Facultatif · tu peux modifier tes choix.';
    const countByKey=current?.reasons||{};
    const leading=REASON_OPTIONS.map(x=>({...x,count:Number(countByKey[x.key])||0}))
     .sort((a,b)=>b.count-a.count)[0];
    const enoughVotes=count>=5&&leading?.count>=2;
    insight.hidden=!enoughVotes;
    if(enoughVotes)insight.textContent='Qualité la plus citée : '+leading.label.toLowerCase()+
     ' ('+leading.count+' mention'+(leading.count>1?'s':'')+').';
   }
   paint();
  }
  fetch(endpoint,{credentials:'same-origin',headers:{Accept:'application/json'}})
   .then(async r=>{if(!r.ok)throw Error();current=await r.json();show()})
   .catch(()=>{status.textContent='Évaluations momentanément indisponibles.';average.textContent='';});
 }
 window.SwappArticleFeedback=Object.freeze({mountArticle,mountList});
 function initial(){
  const native=document.querySelector('main.article-wrap[data-swapp-article-slug]');
  if(native)mountArticle(native,native.dataset.swappArticleSlug);
  if(location.pathname.replace(/\/+$/,'')==='/actus')mountList(document.querySelector('main.container'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initial,{once:true});
 else initial();
})();