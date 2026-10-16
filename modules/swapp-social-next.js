'use strict';
const platforms=['PC','PlayStation','Xbox','Switch','Multiplateforme'];
const styles=['Décontracté','Coopération','Compétitif','Débutant bienvenu'];
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const safeJson=v=>{try{const obj=typeof v==='string'?JSON.parse(v):v;return Array.isArray(obj)?obj:[]}catch{return[]}};
const passportPublic=p=>({
 handle:p.handle,displayName:p.display_name,bio:p.bio,
 games:safeJson(p.games_json),platform:p.platform,style:p.play_style,
 availability:p.availability,updatedAt:Number(p.updated_at),public:!!p.is_public
});
function createSocialNextRouter({express,pool,restoreSession,clock=()=>Date.now()}){
 const router=express.Router();
 const query=(sql,args=[])=>pool.execute(sql,args).then(([rows])=>rows);
 const bad=(res,error,status=400)=>res.status(status).json({error});
 async function auth(req,res,next){
  try{const user=await restoreSession(req,res);
   const found=req.session?.oryonUser?.id?req.session.oryonUser:user;
   if(!found?.id||!found?.login)return bad(res,'swapp_account_required',401);
   req.socialPlayer={id:String(found.id),handle:clean(found.login,40)};
   next();
  }catch{return bad(res,'swapp_session_unavailable',503)}
 }
 function safeOrigin(req,res,next){
  if(req.method==='GET')return next();
  const origin=req.get('origin')||'';
  if(!['https://swapp.tv','https://www.swapp.tv',...(process.env.NODE_ENV==='production'?[]:['http://localhost:3000','http://127.0.0.1:3000'])].includes(origin))
   return bad(res,'invalid_origin',403);
  next();
 }
 function route(method,path,handler){router[method](path,safeOrigin,auth,async(req,res)=>{
  try{await handler(req,res)}catch(error){
   console.warn('[SOCIAL NEXT]',String(error.code||'database_error'));
   if(!res.headersSent)bad(res,'storage_unavailable',503);
  }
 })}
 route('get','/passport/me',async(req,res)=>{
  const rows=await query('SELECT * FROM swapp_social_passports WHERE user_id=? LIMIT 1',[req.socialPlayer.id]);
  res.json({passport:rows.length?passportPublic(rows[0]):{
   handle:req.socialPlayer.handle,displayName:'',bio:'',games:[],platform:'PC',
   style:'Décontracté',availability:'',updatedAt:0,public:false
  }});
 });
 route('put','/passport/me',async(req,res)=>{
  const body=req.body||{};
  if(!Array.isArray(body.games)||body.games.length>5||body.games.some(g=>typeof g!=='string'||!clean(g,65)||g.length>65))
   return bad(res,'invalid_games');
  const games=[...new Set(body.games.map(g=>clean(g,65)).filter(Boolean))];
  if(!platforms.includes(body.platform)||!styles.includes(body.style)||
    typeof body.public!=='boolean'||typeof body.bio!=='string'||body.bio.length>200||
    typeof body.displayName!=='string'||body.displayName.length>60||
    typeof body.availability!=='string'||body.availability.length>100)return bad(res,'invalid_passport');
  const now=clock();
  const item={id:req.socialPlayer.id,handle:req.socialPlayer.handle,displayName:clean(body.displayName,60),
   bio:clean(body.bio,200),games,platform:body.platform,style:body.style,
   availability:clean(body.availability,100),public:body.public,updatedAt:now};
  await query('INSERT INTO swapp_social_passports (user_id,handle,display_name,bio,games_json,platform,play_style,availability,is_public,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE handle=VALUES(handle),display_name=VALUES(display_name),bio=VALUES(bio),games_json=VALUES(games_json),platform=VALUES(platform),play_style=VALUES(play_style),availability=VALUES(availability),is_public=VALUES(is_public),updated_at=VALUES(updated_at)',
   [item.id,item.handle,item.displayName,item.bio,JSON.stringify(games),item.platform,item.style,item.availability,item.public?1:0,now]);
  const {id,...safe}=item;res.json({passport:safe});
 });
 route('get','/passport/:handle',async(req,res)=>{
  const handle=clean(req.params.handle,40);if(!handle)return bad(res,'invalid_handle');
  const rows=await query('SELECT * FROM swapp_social_passports WHERE LOWER(handle)=LOWER(?) AND is_public=1 LIMIT 1',[handle]);
  if(!rows.length)return bad(res,'not_found',404);
  res.json({passport:passportPublic(rows[0])});
 });
 route('get','/match2/compatible',async(req,res)=>{
  const uid=req.socialPlayer.id;
  const [owned,passports]=await Promise.all([
   query('SELECT game,platform,style,availability,created_at FROM swapp_social_matches WHERE user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1',[uid,clock()-14*86400000]),
   query('SELECT games_json,platform,play_style FROM swapp_social_passports WHERE user_id=? LIMIT 1',[uid])
  ]);
  const p=passports[0];
  const games=[...new Set([...(owned[0]?[owned[0].game]:[]),...safeJson(p?.games_json)].filter(Boolean).map(g=>clean(g,65).toLocaleLowerCase('fr')))].slice(0,6);
  if(!games.length)return res.json({matches:[],reason:'create_match_or_passport_first'});
  const platform=owned[0]?.platform||p?.platform||'Multiplateforme',style=owned[0]?.style||p?.play_style||'';
  const list=await query('SELECT user_id,handle,game,platform,availability,style,created_at FROM swapp_social_matches WHERE user_id<>? AND created_at>? ORDER BY created_at DESC LIMIT 300',[uid,clock()-14*86400000]);
  const seen=new Set(),result=[];
  for(const match of list){
   if(!games.includes(String(match.game).toLocaleLowerCase('fr')))continue;
   if(seen.has(match.user_id))continue;seen.add(match.user_id);
   const score=70+(platform===match.platform||platform==='Multiplateforme'||match.platform==='Multiplateforme'?20:0)+(style&&style===match.style?10:0);
   result.push({handle:match.handle,game:match.game,platform:match.platform,availability:match.availability,style:match.style,score,createdAt:Number(match.created_at)});
  }
  res.json({matches:result.sort((a,b)=>b.score-a.score||b.createdAt-a.createdAt).slice(0,30),gamePreferences:games.length});
 });
 route('get','/game/context',async(req,res)=>{
  const game=clean(req.query.game,65);
  if(game.length<2)return bad(res,'invalid_game');
  const [roomRows,matchRows]=await Promise.all([
   query('SELECT id,name,game,created_at FROM swapp_social_rooms WHERE LOWER(game)=LOWER(?) ORDER BY created_at DESC LIMIT 12',[game]),
   query('SELECT handle,game,platform,availability,style,created_at FROM swapp_social_matches WHERE LOWER(game)=LOWER(?) AND created_at>? ORDER BY created_at DESC LIMIT 20',[game,clock()-14*86400000])
  ]);
  res.json({game,rooms:roomRows.map(r=>({id:r.id,name:r.name,game:r.game,createdAt:Number(r.created_at)})),
   matches:matchRows.map(m=>({handle:m.handle,game:m.game,platform:m.platform,availability:m.availability,style:m.style,createdAt:Number(m.created_at)}))});
 });
 return router;
}
module.exports={createSocialNextRouter};
