'use strict';
const {CatalogError}=require('./swapp-shop-catalog');
function createShopRouter({express,store,requireEditor,shop,shopProduct,shopAdmin}){
 if(!express?.Router||!store||typeof requireEditor!=='function')throw Error('Shop router dependencies missing');
 const router=express.Router();
 const privateRoute=[requireEditor,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()}];
 const sendError=(res,error)=>{
  const status=error instanceof CatalogError?error.status:503;
  return res.status(status).json({error:status===503?'Stockage boutique indisponible. Rien n’a été enregistré.':error.message});
 };
 router.get('/boutique',async(_req,res)=>{
  const catalog=await store.load();
  res.set('Cache-Control','no-store');
  return res.type('html').send(shop(catalog.products,{source:catalog.source}));
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
