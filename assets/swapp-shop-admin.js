/* Boutique SWAPP / private product editor. No third-party requests or analytics.
 * Each save is an explicit, version-checked operation by a SWAPP administrator. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const form=$('shop-admin-editor'),list=$('shop-admin-list'),status=$('shop-admin-status');
 if(!form||!list||!status)return;
 const kindLabels={games:'Jeux vidéo',caps:'Casquettes',pads:'Tapis de souris'};
 const kindIcons={games:'◈',caps:'♛',pads:'▧'};
 const field=name=>form.elements.namedItem(name);
 let products=[],revision=0,selected=-1,dirty=false,writable=false;
 function message(text,error=false){
  status.textContent=text;status.classList.toggle('is-error',error);
 }
 async function request(method='GET',body){
  const options={method,credentials:'same-origin',headers:{Accept:'application/json'}};
  if(body!==undefined){
   options.headers['Content-Type']='application/json';
   options.headers['x-swapp-editor']='1';
   options.body=JSON.stringify(body);
  }
  const response=await fetch('/api/editor/boutique',options);
  let data;try{data=await response.json()}catch{data={error:'Réponse serveur invalide.'}}
  if(!response.ok)throw Error(data.error||'Accès refusé. Vérifie le compte administrateur SWAPP.');
  return data;
 }
 function render(){
  list.replaceChildren();
  if(!products.length){
   const empty=document.createElement('p');empty.textContent='Aucun produit. Ajoute ta première fiche.';
   list.append(empty);return;
  }
  products.forEach((p,index)=>{
   const row=document.createElement('article');row.className='swapp-shop-admin-item'+(selected===index?' active':'');
   const art=document.createElement('span');art.className='swapp-shop-admin-art';
   art.textContent=kindIcons[p.kind]||'✦';art.setAttribute('aria-hidden','true');
   const copy=document.createElement('span');copy.className='swapp-shop-admin-item-copy';
   const title=document.createElement('b');title.textContent=p.title;
   const details=document.createElement('small');details.textContent=[kindLabels[p.kind]||p.kind,p.visible?'Visible':'Masqué',p.demo?'Exemple':'Produit réel'].join(' · ');
   copy.append(title,details);
   const actions=document.createElement('span');actions.className='swapp-shop-admin-item-actions';
   const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.setAttribute('aria-label','Modifier '+p.title);
   edit.onclick=()=>select(index,true);
   const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Monter dans la vitrine';
   up.setAttribute('aria-label','Monter '+p.title);up.disabled=index===0;
   up.onclick=()=>move(index,-1);
   const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Descendre dans la vitrine';
   down.setAttribute('aria-label','Descendre '+p.title);down.disabled=index===products.length-1;
   down.onclick=()=>move(index,1);
   actions.append(edit,up,down);
   row.append(art,copy,actions);list.append(row);
  });
 }
 function saveForm(){
  const input={};
  for(const key of ['id','kind','title','description','badge','merchant','url','image'])
   input[key]=String(field(key).value||'').trim();
  for(const key of ['demo','affiliate','visible'])input[key]=field(key).checked;
  if(!/^[a-z0-9][a-z0-9-]{1,49}$/.test(input.id))throw Error('Identifiant : 2 à 50 caractères minuscules, chiffres ou tirets.');
  if(!input.title)throw Error('Renseigne le nom du produit.');
  if(!input.demo&&input.visible&&(!input.merchant||!/^https:\/\//i.test(input.url)))
   throw Error('Un produit réel visible exige un marchand et un lien HTTPS.');
  if(selected>=0&&selected<products.length){
   const dupe=products.some((p,i)=>i!==selected&&p.id===input.id);
   if(dupe)throw Error('Cet identifiant existe déjà.');
   products[selected]=input;
  }else{
   if(products.length>=36)throw Error('Maximum 36 produits.');
   if(products.some(p=>p.id===input.id))throw Error('Cet identifiant existe déjà.');
   products.push(input);selected=products.length-1;
  }
  dirty=false;render();
  message('Fiche appliquée. Clique sur « Enregistrer sur SWAPP » pour publier le catalogue.');
 }
 function select(index,scroll=false){
  if(dirty&&!confirm('Les changements du formulaire ne sont pas appliqués. Les abandonner ?'))return;
  selected=index;dirty=false;
  const p=products[index]||{id:'',kind:'games',title:'',description:'',badge:'',merchant:'',url:'',image:'',demo:true,affiliate:false,visible:true};
  for(const key of ['id','kind','title','description','badge','merchant','url','image'])
   field(key).value=p[key]||'';
  for(const key of ['demo','affiliate','visible'])field(key).checked=p[key]===true;
  render();
  if(scroll)$('shop-admin-form').scrollIntoView({block:'start',behavior:'smooth'});
 }
 function move(index,delta){
  if(dirty&&!confirm('Appliquer ou abandonner les modifications du formulaire avant de réordonner ?'))return;
  const other=index+delta;
  if(other<0||other>=products.length)return;
  [products[index],products[other]]=[products[other],products[index]];
  if(selected===index)selected=other;
  else if(selected===other)selected=index;
  select(selected);
  message('Ordre mis à jour. Pense à enregistrer le catalogue.');
 }
 async function load(){
  message('Chargement du catalogue…');
  try{
   const data=await request();
   revision=data.revision;products=data.products||[];writable=data.writable===true;
   select(products.length?0:-1);render();
   $('shop-admin-save').disabled=!writable;
   message(writable
    ?(data.source==='demo'?'Sept produits de démonstration chargés. Personnalise-les puis enregistre.':'Catalogue chargé · Version '+revision+'.')
    :'Base indisponible : aperçu en lecture seule. Aucun changement ne sera perdu silencieusement.',!writable);
  }catch(error){writable=false;$('shop-admin-save').disabled=true;message(error.message,true)}
 }
 form.addEventListener('input',()=>{dirty=true});
 field('title').addEventListener('input',()=>{
  if(field('id').value)return;
  field('id').value=field('title').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();try{saveForm()}catch(error){message(error.message,true)}
 });
 $('shop-admin-new').addEventListener('click',()=>select(-1,true));
 $('shop-admin-remove').addEventListener('click',()=>{
  if(selected<0||!products[selected])return;
  if(!confirm('Supprimer ce produit du catalogue ? La suppression sera effective après enregistrement.'))return;
  products.splice(selected,1);selected=-1;dirty=false;select(-1);render();
  message('Produit retiré de la liste. Enregistre pour confirmer.');
 });
 $('shop-admin-save').addEventListener('click',async()=>{
  if(!writable)return;
  const button=$('shop-admin-save');
  try{
   if(dirty)saveForm();
   button.disabled=true;message('Enregistrement du catalogue…');
   const data=await request('PUT',{revision,products});
   revision=data.revision;products=data.products;dirty=false;
   select(selected>=0?Math.min(selected,products.length-1):-1);render();
   message('Boutique mise à jour. Version '+revision+' · Les produits visibles sont en ligne.');
  }catch(error){message(error.message+(error.message.includes('modifié ailleurs')?' Recharge la page pour récupérer la dernière version.':''),true)}
  finally{button.disabled=!writable}
 });
 window.addEventListener('beforeunload',event=>{
  if(!dirty)return;
  event.preventDefault();event.returnValue='';
 });
 load();
})();
