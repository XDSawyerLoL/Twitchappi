'use strict';
// Game ratings are NOT article ratings. Only actual authenticated player votes.
// No imported, generated or invented press scores. No IP/fingerprint storage.
const crypto=require('node:crypto');
const valid=s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(s||''))&&String(s).length<=90;
function registerGameScores({router,firestore,available,resolveGame,baseUrl='https://swapp.tv'}){
 const summaries=firestore.collection('swapp_game_scores');
 const votes=firestore.collection('swapp_game_votes');
 const origins=new Set([new URL(baseUrl).origin,'https://www.swapp.tv']);
 const identity=req=>{
  const user=req.session?.oryonUser;
  if(user?.id)return 'swapp:'+String(user.id);
  const twitch=req.session?.twitchUser;
  return twitch?.id?'twitch:'+String(twitch.id):null;
 };
 const refs=(slug,user)=>({
  summary:summaries.doc(slug),
  personal:user?votes.doc(crypto.createHash('sha256').update(slug+'\0'+user).digest('hex')):null
 });
 const cleanNumber=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 const snapshot=(total,own,user)=>{
  const data=total?.exists?total.data()||{}:{};
  const count=cleanNumber(data.count),sum=cleanNumber(data.sum);
  const myRating=own?.exists&&Number.isInteger(own.data()?.rating)?own.data().rating:null;
  return {count,average:count>=5?Math.round(sum/count*10)/10:null,
   minimumVotes:5,myRating,canRate:!!user,scale:5};
 };
 async function validatedGame(req,res){
  if(!valid(req.params.slug)){res.status(404).json({error:'Jeu introuvable'});return null;}
  const game=await resolveGame(req.params.slug);
  if(!game||game.slug!==req.params.slug){res.status(404).json({error:'Jeu introuvable'});return null;}
  return game;
 }
 router.get('/api/jeux/:slug/score',available,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(!await validatedGame(req,res))return;
   const user=identity(req),{summary,personal}=refs(req.params.slug,user);
   const [total,own]=await Promise.all([summary.get(),personal?personal.get():Promise.resolve(null)]);
   return res.json(snapshot(total,own,user));
  }catch(error){next(error);}
 });
 router.post('/api/jeux/:slug/score',available,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(!req.headers?.origin||!origins.has(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')
    return res.status(403).json({error:'Origine non autorisée'});
   const user=identity(req);
   if(!user)return res.status(401).json({error:'Connecte-toi pour noter ce jeu'});
   const rating=req.body?.rating;
   if(!Number.isInteger(rating)||rating<1||rating>5)
    return res.status(400).json({error:'Choisis une note entière de 1 à 5'});
   if(!await validatedGame(req,res))return;
   const {summary,personal}=refs(req.params.slug,user);
   const result=await firestore.runTransaction(async tx=>{
    const [total,own]=await Promise.all([tx.get(summary),tx.get(personal)]);
    const current=snapshot(total,own,user);
    const prev=own?.exists&&Number.isInteger(own.data()?.rating)?own.data().rating:0;
    if(prev===rating)return current;
    const count=current.count+(prev?0:1);
    const sum=cleanNumber(total?.exists?total.data()?.sum:0)+rating-prev;
    const updatedAt=new Date().toISOString();
    tx.set(summary,{count,sum,updatedAt});
    tx.set(personal,{rating,updatedAt});
    return {count,average:count>=5?Math.round(sum/count*10)/10:null,minimumVotes:5,
     myRating:rating,canRate:true,scale:5};
   });
   return res.json(result);
  }catch(error){next(error);}
 });
}
module.exports={registerGameScores};