'use strict';
const crypto=require('node:crypto');

// Ratings measure the usefulness of the article, never the quality of the game.
// One changeable vote per authenticated account. No IP/device fingerprinting.
function registerArticleScores({router,firestore,articles,publicNews,available,baseUrl='https://swapp.tv',nativeSlug}){
 const scores=firestore.collection('swapp_article_scores');
 const votes=firestore.collection('swapp_article_votes');
 const REASONS=Object.freeze(['useful','sourced','engaging']);
 const emptyReasons=()=>Object.fromEntries(REASONS.map(key=>[key,0]));
 // Reject unexpected or repeated codes. Free-text submissions are intentionally excluded.
 const cleanReasons=value=>{
  if(!Array.isArray(value)||value.length>REASONS.length
   ||value.some(x=>typeof x!=='string'||!REASONS.includes(x))
   ||new Set(value).size!==value.length)return null;
  return REASONS.filter(key=>value.includes(key));
 };
 const storedReasons=value=>cleanReasons(value)||[];
 const reasonTotals=value=>{
  const counts=emptyReasons();
  for(const key of REASONS){
   const n=value?.[key];
   if(Number.isSafeInteger(n)&&n>=0)counts[key]=n;
  }
  return counts;
 };
 const valid=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const canonical=slug=>{
  const s=String(slug||'');
  return s.startsWith('justplayer-')?nativeSlug({slug:s}):s;
 };
 const account=req=>{
  const u=req.session?.oryonUser;
  if(u?.id)return 'swapp:'+String(u.id);
  const t=req.session?.twitchUser;
  if(t?.id)return 'twitch:'+String(t.id);
  return null;
 };
 const identity=(slug,user)=>crypto.createHash('sha256').update(slug+'\0'+user).digest('hex');
 const snapshot=(doc,personal,canRate)=>{
  const data=doc?.exists?doc.data()||{}:{};
  const count=Number.isSafeInteger(data.count)&&data.count>=0?data.count:0;
  const sum=Number.isSafeInteger(data.sum)&&data.sum>=0?data.sum:0;
  return {count,average:count?Math.round(sum/count*10)/10:null,
   readerRecognition:count>=10&&sum>=count*4.5&&sum<=count*5,
   reasons:reasonTotals(data.reasons),
   myRating:personal?.exists?personal.data()?.rating||null:null,
   myReasons:personal?.exists?storedReasons(personal.data()?.reasons):[],canRate};
 };
 const articleExists=async slug=>{
  const saved=await articles.doc(slug).get();
  if(saved.exists)return saved.data()?.status==='published';
  // The historical read-through catalogue remains votable only if the
  // full original story has actually been recovered and is still available.
  const historical=await publicNews.get('justplayer-'+slug);
  return !!historical;
 };
 const allowedOrigins=new Set([new URL(baseUrl).origin,'https://www.swapp.tv']);
 const safeOrigin=req=>{
  const origin=req.headers?.origin;
  if(!origin||!allowedOrigins.has(origin))return false;
  if(req.headers?.['sec-fetch-site']==='cross-site')return false;
  return true;
 };
 function refs(slug,user){
  return {summary:scores.doc(slug),personal:user?votes.doc(identity(slug,user)):null};
 }
 router.get('/api/actus/:slug/score',available,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(!valid(req.params.slug))return res.status(404).json({error:'Article introuvable'});
   const slug=canonical(req.params.slug);
   if(!valid(slug)||!await articleExists(slug))return res.status(404).json({error:'Article introuvable'});
   const user=account(req),{summary,personal}=refs(slug,user);
   const [total,own]=await Promise.all([summary.get(),personal?personal.get():Promise.resolve(null)]);
   return res.json(snapshot(total,own,!!user));
  }catch(e){next(e)}
 });
 router.post('/api/actus/:slug/score',available,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(!safeOrigin(req))return res.status(403).json({error:'Origine non autorisée'});
   const user=account(req);
   if(!user)return res.status(401).json({error:'Connexion requise pour noter un article'});
   const rating=req.body?.rating;
   if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'Note comprise entre 1 et 5'});
   const reasonsSent=Object.prototype.hasOwnProperty.call(req.body||{},'reasons');
   const submittedReasons=reasonsSent?cleanReasons(req.body.reasons):null;
   if(reasonsSent&&!submittedReasons)return res.status(400).json({error:'Motifs de vote invalides'});
   if(!valid(req.params.slug))return res.status(404).json({error:'Article introuvable'});
   const slug=canonical(req.params.slug);
   if(!valid(slug)||!await articleExists(slug))return res.status(404).json({error:'Article introuvable'});
   const {summary,personal}=refs(slug,user);
   const result=await firestore.runTransaction(async tx=>{
    const [total,own]=await Promise.all([tx.get(summary),tx.get(personal)]);
    const current=snapshot(total,own,true);
    const previous=Number(own?.exists?own.data()?.rating:0)||0;
    const before=storedReasons(own?.exists?own.data()?.reasons:[]);
    const after=reasonsSent?submittedReasons:before;
    if(previous===rating&&before.length===after.length&&before.every((key,i)=>key===after[i]))return current;
    const count=current.count+(previous?0:1);
    const sum=(Number(total?.exists?total.data()?.sum:0)||0)+rating-previous;
    const reasons=reasonTotals(total?.exists?total.data()?.reasons:null);
    for(const key of before)reasons[key]=Math.max(0,reasons[key]-1);
    for(const key of after)reasons[key]+=1;
    const updatedAt=new Date().toISOString();
    tx.set(summary,{count,sum,reasons,updatedAt});
    tx.set(personal,{rating,reasons:after,updatedAt});
    return {count,average:Math.round(sum/count*10)/10,
     readerRecognition:count>=10&&sum>=count*4.5&&sum<=count*5,
     reasons,myRating:rating,myReasons:after,canRate:true};
   });
   return res.json(result);
  }catch(e){next(e)}
 });
}
module.exports={registerArticleScores};
