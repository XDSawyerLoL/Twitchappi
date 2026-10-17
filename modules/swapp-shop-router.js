'use strict';
const {CatalogError}=require('./swapp-shop-catalog');
function createShopRouter({express,store,requireEditor,shop,shopProduct,shopAdmin}){
 if(!express?.Router||!store||typeof requireEditor!=='function')throw Error('Shop router dependencies missing');
 const router=express.Router();
 // Steam's current image URLs sometimes contain a content hash. Never guess them.
 const ids=new Set(['3393110','4435490','1203620','221100','3816030','4231820','3219030','2902720','1974050','4080220']);
 const artCache=new Map();
 const gameArt=async id=>{
  const old=artCache.get(id);
  if(old&&old.expires>Date.now())return old.url;
  if(!/^[0-9]{3,9}$/.test(id)||!ids.has(id))return null;
  try{
   const response=await fetch('https://store.steampowered.com/api/appdetails?appids='+id+'&cc=fr&l=french',{
    signal:AbortSignal.timeout(5500),headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('Steam HTTP '+response.status);
   const body=await response.json();
   const url=body?.[id]?.data?.header_image;
   if(typeof url!=='string'||!/^https:\/\/(?:[a-z0-9.-]+\.)?steamstatic\.com\//i.test(url))
    throw Error('Steam artwork unavailable');
   artCache.set(id,{url,expires:Date.now()+6*3600000});
   return url;
  }catch{
   artCache.set(id,{url:null,expires:Date.now()+5*60000});
   return null;
  }
 };
 router.get('/api/boutique/steam-images',async(_req,res)=>{
  res.set('Cache-Control','public,max-age=300');
  const entries=await Promise.all([...ids].map(async id=>[id,await gameArt(id)]));
  return res.json({images:Object.fromEntries(entries.filter(([,url])=>url))});
 });
 const privateRoute=[requireEditor,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()}];
 const sendError=(res,error)=>{
  const status=error instanceof CatalogError?error.status:503;
  return res.status(status).json({error:status===503?'Stockage boutique indisponible. Rien n’a été enregistré.':error.message});
 };
 router.get('/boutique',(_req,res)=>{
  // The public Game Store is a dated ten-game editorial snapshot.
  // Do not load Firestore just to serve a page that shows no saved products.
  res.set('Cache-Control','public, max-age=180');
  return res.type('html').send(shop());
 });
 router.get('/boutique/produit/:id',async(req,res)=>{
  const catalog=await store.load();
  const found=catalog.products.find(p=>p.id===String(req.params?.id||'')&&p.visible&&p.image);
  if(!found)return res.status(404).type('html').send(shop(catalog.products,{source:catalog.source}));
  const html=shopProduct(found,catalog.products);
  if(!html)return res.status(404).type('html').send(shop(catalog.products,{source:catalog.source}));
  res.set('Cache-Control','no-store');
  return res.type('html').send(html);
 });
 router.get('/boutique/admin',...privateRoute,(_req,res)=>res.type('html').send(shopAdmin()));
 router.get('/api/editor/boutique',...privateRoute,async(_req,res)=>{
  try{return res.json(await store.load())}catch(e){return sendError(res,e)}
 });
 router.put('/api/editor/boutique',...privateRoute,async(req,res)=>{
  try{
   const body=req.body||{};
   const result=await store.save({revision:body.revision,products:body.products});
   return res.json(result);
  }catch(e){return sendError(res,e)}
 });
 return router;
}
module.exports={createShopRouter};
