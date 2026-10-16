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
   if(p.image){
    const thumb=document.createElement('img');
    thumb.src=p.image;thumb.alt='';thumb.loading='lazy';thumb.decoding='async';thumb.referrerPolicy='no-referrer';
    art.append(thumb);
   }else{art.textContent='Sans photo'}
   art.setAttribute('aria-hidden','true');
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
 function amazonLink(raw){
  let url;try{url=new URL(String(raw||'').trim())}catch{return ''}
  if(url.protocol!=='https:'||url.username||url.password)return '';
  const host=url.hostname.toLowerCase();
  if(!(/^(?:www\.)?amazon\.(?:fr|com|co\.uk|de|es|it|nl|be|se|pl)$/.test(host)||
   ['link.amazon','amzn.to','amzn.eu'].includes(host)))return '';
  return url.href;
 }
 function updatePreview(){
  const root=$('shop-admin-preview');
  if(!root)return;
  root.replaceChildren();
  const name=String(field('title').value||'').trim();
  const art=document.createElement('div');art.className='swapp-shop-preview-art';
  const raw=String(field('image').value||'').trim();
  let url;
  try{
   const parsed=new URL(raw);
   if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password)url=parsed.href;
  }catch(_){}
  const fallback=document.createElement('span');
  fallback.textContent='Visuel produit non renseigné';
  art.append(fallback);
  if(url){
   const picture=document.createElement('img');
   picture.alt=name?'Aperçu du produit : '+name:'Aperçu du produit';
   picture.loading='lazy';picture.decoding='async';picture.referrerPolicy='no-referrer';
   picture.addEventListener('load',()=>{fallback.hidden=true});
   picture.addEventListener('error',()=>{picture.remove();fallback.hidden=false});
   picture.src=url;art.append(picture);
  }
  const info=document.createElement('div');info.className='swapp-shop-preview-info';
  const heading=document.createElement('strong');
  heading.textContent=name||'Nom du produit à renseigner';
  const detail=document.createElement('p');
  const partner=field('affiliate').checked;
  const brand=String(field('merchant').value||'Marchand à préciser').trim();
  const price=String(field('priceEur')?.value||'').trim();
  detail.textContent=(field('visible').checked?'Visible après sauvegarde':'Brouillon masqué')+
   ' · '+brand+(partner?' · Lien affilié':'')+
   (price&&!field('demo').checked?' · Prix indicatif '+price+' €':'');
  const note=document.createElement('small');
  note.textContent='Prévisualisation locale : rien n’est publié avant « Enregistrer sur SWAPP ».';
  info.append(heading,detail,note);
  root.append(art,info);
  const secondary=String(field('image2').value||'').trim();
  if(/^https:\/\//i.test(secondary)){
   const side=document.createElement('img');
   side.className='swapp-shop-preview-secondary';
   side.alt='Seconde vue du produit';
   side.loading='lazy';side.decoding='async';side.referrerPolicy='no-referrer';
   side.addEventListener('error',()=>side.remove());
   side.src=secondary;root.append(side);
  }
 }
 function saveForm(){
  const input={};
  for(const key of ['id','kind','title','description','badge','merchant','url','image','image2','priceEur'])
   input[key]=String(field(key).value||'').trim();
  for(const key of ['demo','affiliate','visible'])input[key]=field(key).checked;
  if(!/^[a-z0-9][a-z0-9-]{1,49}$/.test(input.id))throw Error('Identifiant : 2 à 50 caractères minuscules, chiffres ou tirets.');
  if(!input.title)throw Error('Renseigne le nom du produit.');
  if(input.visible&&!/^https:\/\//i.test(input.image))throw Error('Une photo principale HTTPS est obligatoire pour afficher un produit.');
  if(input.image2&&!/^https:\/\//i.test(input.image2))throw Error('La deuxième photo doit être une URL HTTPS.');
  if(input.demo)input.priceEur='';
  else if(input.priceEur){
   const value=String(input.priceEur).replace(',','.');
   if(!/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/.test(value)||
      Number(value)<=0||Number(value)>99999)
    throw Error('Le prix doit être un montant EUR positif, avec deux décimales au maximum.');
   input.priceEur=Number(value).toFixed(2);
  }
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
  if(dirty&&!confirm('Les changements du formulaire ne sont pas appliqués. Les abandonner ?'))return false;
  selected=index;dirty=false;
  const p=products[index]||{id:'',kind:'games',title:'',description:'',badge:'',merchant:'',url:'',image:'',image2:'',priceEur:'',demo:true,affiliate:false,visible:true};
  for(const key of ['id','kind','title','description','badge','merchant','url','image','image2','priceEur'])
   field(key).value=p[key]||'';
  for(const key of ['demo','affiliate','visible'])field(key).checked=p[key]===true;
  render();updatePreview();
  if(scroll)$('shop-admin-form').scrollIntoView({block:'start',behavior:'smooth'});
  return true;
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
 form.addEventListener('input',()=>{dirty=true;updatePreview()});
 field('title').addEventListener('input',()=>{
  if(field('id').value)return;
  field('id').value=field('title').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();try{saveForm()}catch(error){message(error.message,true)}
 });
 $('shop-admin-new').addEventListener('click',()=>select(-1,true));
 $('shop-admin-amazon-start')?.addEventListener('click',()=>{
  const link=amazonLink($('shop-admin-amazon-url')?.value);
  if(!link){message('Lien Amazon HTTPS invalide. Vérifie l’adresse issue de ton compte Partenaires.',true);return}
  if(select(-1,true)===false)return;
  // A partner URL alone does not prove product identity, stock, price or image rights.
  // Keep unpublished until the editor has verified and completed the fields.
  field('url').value=link;
  field('merchant').value='Amazon';
  field('demo').checked=false;
  field('affiliate').checked=true;
  field('visible').checked=false;
  dirty=true;
  updatePreview();
  message('Brouillon Amazon préparé (non publié). Identifie le produit, choisis le rayon et renseigne une image autorisée, puis applique et enregistre.');
 });
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
 // Import optional, unpublished game offers from SWAPP's existing editorial catalogue.
 // No live price, stock, confirmed affiliate attribution or image licence is inferred.
 const affiliateOffers=[
  {id:'valor-mortis',title:'Valor Mortis',url:'https://www.instant-gaming.com/fr/20157-acheter-valor-mortis-pc-steam/?igr=SANSAHD'},
  {id:'planet-zoo-2',title:'Planet Zoo 2',url:'https://www.instant-gaming.com/fr/21064-acheter-planet-zoo-2-pc-steam/?igr=SANSAHD'},
  {id:'007-first-light',title:'007 First Light',url:'https://www.instant-gaming.com/fr/22735-acheter-007-first-light-pc-steam/?igr=SANSAHD'},
  {id:'code-vein-ii',title:'CODE VEIN II',url:'https://www.instant-gaming.com/fr/19500-acheter-code-vein-ii-pc-steam/?igr=SANSAHD'}
 ];
 const addOffer=document.createElement('button');
 addOffer.type='button';addOffer.id='shop-admin-game-offers';
 addOffer.textContent='Importer 4 offres jeux (brouillons)';
 addOffer.title='Importe des fiches masquées, sans prix ni image. Vérification avant publication.';
 $('shop-admin-new')?.insertAdjacentElement('afterend',addOffer);
 addOffer.addEventListener('click',()=>{
  if(!writable){message('Le stockage doit être accessible avant de préparer les offres.',true);return}
  if(dirty&&!confirm('Les modifications du formulaire non appliquées seront abandonnées. Continuer ?'))return;
  const remaining=36-products.length;
  const missing=affiliateOffers.filter(o=>!products.some(p=>p.id===o.id));
  if(!missing.length){message('Ces offres sont déjà présentes dans le catalogue.');return}
  if(remaining<missing.length){message('Maximum 36 références : libère des emplacements avant import.',true);return}
  for(const o of missing)products.push({
   id:o.id,kind:'games',title:o.title,
   description:'Vérifier plateforme, région, édition et conditions chez le marchand avant tout achat.',
   badge:'Jeu vidéo · Offre partenaire',merchant:'Instant Gaming',url:o.url,
   image:'',image2:'',priceEur:'',affiliate:true,demo:false,visible:false
  });
  selected=-1;dirty=false;select(products.length-missing.length,true);render();
  message(missing.length+' brouillon(s) ajouté(s), masqué(s) et sans prix. Vérifie le lien affilié dans ton espace partenaire, ajoute une image autorisée, active la visibilité puis clique sur Enregistrer sur SWAPP. L’import reste local avant sauvegarde.');
 });
 load();
})();
