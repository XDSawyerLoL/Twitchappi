'use strict';
/* One tiny SWAPP storefront catalogue. Public demo items are labelled;
 * editor changes are stored in the existing Firestore project, no new service.
 * There is no checkout, inventory, automatic affiliate rewriting or analytics. */
const seed=require('../data/swapp-shop.json');
const CATEGORIES=Object.freeze([
 Object.freeze({id:'games',name:'Jeux vidéo',subtitle:'Les univers à découvrir',code:'01'}),
 Object.freeze({id:'caps',name:'Casquettes',subtitle:'Streetwear & culture gaming',code:'02'}),
 Object.freeze({id:'pads',name:'Tapis de souris',subtitle:'Le détail qui signe ton setup',code:'03'})
]);
const KINDS=new Set(CATEGORIES.map(x=>x.id));
const SLUG=/^[a-z0-9][a-z0-9-]{1,49}$/;
class CatalogError extends Error{constructor(message,code=400){super(message);this.status=code}}
function https(value,required=false){
 const text=String(value||'').trim();
 if(!text){if(required)throw new CatalogError('Lien marchand HTTPS obligatoire pour publier un produit réel.');return ''}
 if(text.length>900)throw new CatalogError('URL trop longue.');
 try{
  const u=new URL(text);
  if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))throw Error();
  return u.href;
 }catch{throw new CatalogError('Adresse HTTPS valide obligatoire.')}
}
function clean(value,max){return String(value==null?'':value).trim().slice(0,max)}
function normalize(item,{strict=false}={}){
 if(!item||typeof item!=='object'||Array.isArray(item))throw new CatalogError('Fiche produit invalide.');
 const id=clean(item.id,50);
 if(!SLUG.test(id))throw new CatalogError('Identifiant produit invalide.');
 const kind=clean(item.kind,12);
 if(!KINDS.has(kind))throw new CatalogError('Catégorie inconnue.');
 const title=clean(item.title,110);
 if(!title)throw new CatalogError('Titre du produit obligatoire.');
 const demo=item.demo===true;
 const visible=item.visible!==false;
 const merchant=clean(item.merchant,65);
 const url=https(item.url,!demo&&visible);
 const image=https(item.image,false);
 if(!demo&&visible&&!merchant)throw new CatalogError('Le marchand est obligatoire pour publier un produit réel.');
 const description=clean(item.description,260);
 if(strict&&item.title&&String(item.title).length>110)throw new CatalogError('Titre trop long (110 caractères).');
 if(strict&&item.description&&String(item.description).length>260)throw new CatalogError('Description trop longue (260 caractères).');
 return {id,kind,title,description,badge:clean(item.badge,48),
  merchant,url,image,affiliate:!demo&&item.affiliate===true,demo,visible};
}
function normalizeAll(items,{strict=false}={}){
 if(!Array.isArray(items)||items.length>36)throw new CatalogError('Maximum 36 produits.');
 const out=[],seen=new Set();
 for(const item of items){
  const p=normalize(item,{strict});
  if(seen.has(p.id))throw new CatalogError('Identifiant dupliqué : '+p.id);
  seen.add(p.id);out.push(p);
 }
 return out;
}
const demoProducts=Object.freeze(normalizeAll(seed.products).map(x=>Object.freeze(x)));
function createCatalogStore({firestore}={}){
 const ref=firestore?.collection?.('swapp_shop')?.doc('catalog_v1');
 async function load(){
  if(!ref)return {revision:0,products:demoProducts.slice(),source:'demo',writable:false};
  try{
   const snap=await ref.get();
   if(!snap.exists)return {revision:0,products:demoProducts.slice(),source:'demo',writable:true};
   const data=snap.data()||{};
   return {revision:Number(data.revision)||0,products:normalizeAll(data.products||[]),
    source:'managed',writable:true,updatedAt:data.updatedAt||null};
  }catch(error){
   return {revision:0,products:demoProducts.slice(),source:'fallback',writable:false};
  }
 }
 async function save({revision,products}){
  if(!ref||typeof firestore.runTransaction!=='function')
   throw new CatalogError('Base de données indisponible : modifications non enregistrées.',503);
  if(!Number.isSafeInteger(revision)||revision<0)throw new CatalogError('Version du catalogue invalide.');
  const cleaned=normalizeAll(products,{strict:true});
  const written=await firestore.runTransaction(async tx=>{
   const snapshot=await tx.get(ref);
   const previous=snapshot.exists?(snapshot.data()||{}):null;
   const current=Number(previous?.revision)||0;
   if(current!==revision)throw new CatalogError('Catalogue modifié ailleurs. Rechargez avant de sauvegarder.',409);
   const next={revision:current+1,products:cleaned,updatedAt:new Date().toISOString()};
   if(snapshot.exists)tx.update(ref,next);
   else tx.create(ref,next);
   return next;
  });
  return {revision:written.revision,products:cleaned,source:'managed',writable:true,updatedAt:written.updatedAt};
 }
 return {load,save};
}
module.exports={CATEGORIES,demoProducts,normalize,normalizeAll,createCatalogStore,CatalogError};
