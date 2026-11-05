'use strict';
// SWAPP PREMIÈRE — explicit interest from a real signed-in SWAPP account.
// Public aggregate only (k-anonymity >= 5). No IP, cookie id, cross-site pixel,
// artificial counters, Twitch viewer claims, payments, or background outreach.
const {validateGame}=require('./swapp-spotlight');
const DDL=`CREATE TABLE IF NOT EXISTS swapp_premiere_interest (
 user_id VARCHAR(80) NOT NULL,
 game_slug VARCHAR(100) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,game_slug),
 INDEX idx_swapp_premiere_game(game_slug,created_at),
 INDEX idx_swapp_premiere_user(user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const PUBLIC_MIN=5,MAX_GAMES_PER_ACCOUNT=30;
function apiError(code,status=400){const e=Error(code);e.status=status;return e;}
function validUserId(value){
 const s=String(value||'');
 return /^[A-Za-z0-9_-]{3,80}$/.test(s)?s:'';
}
function publicCount(total){
 const value=Number(total);
 return Number.isSafeInteger(value)&&value>=PUBLIC_MIN?value:null;
}
function createInterestStore({getPool}={}){
 if(typeof getPool!=='function')throw Error('premiere_pool_required');
 let setup=null;
 async function pool(){
  const db=getPool();
  if(!db)throw apiError('premiere_database_unavailable',503);
  if(!setup)setup=Promise.resolve().then(()=>db.query(DDL)).catch(error=>{setup=null;throw error;});
  await setup;
  return db;
 }
 async function count(game){
  const {slug}=validateGame(game),db=await pool();
  const [rows]=await db.execute('SELECT COUNT(*) AS total FROM swapp_premiere_interest WHERE game_slug=?',[slug]);
  return Number(rows?.[0]?.total||0);
 }
 async function has(game,userId){
  const {slug}=validateGame(game),id=validUserId(userId);
  if(!id)return false;
  const db=await pool();
  const [rows]=await db.execute('SELECT user_id FROM swapp_premiere_interest WHERE user_id=? AND game_slug=? LIMIT 1',[id,slug]);
  return Boolean(rows?.length);
 }
 async function set(game,userId,active){
  const {name,slug}=validateGame(game),id=validUserId(userId);
  if(!id)throw apiError('swapp_account_required',401);
  if(typeof active!=='boolean')throw apiError('interest_boolean_required');
  const db=await pool();
  if(!active){
   await db.execute('DELETE FROM swapp_premiere_interest WHERE user_id=? AND game_slug=?',[id,slug]);
   return {active:false};
  }
  // The primary key makes multiple requests from the same account count only once.
  // A bounded user library prevents accidental massive preference storage.
  const [row]=await db.execute(`INSERT INTO swapp_premiere_interest (user_id,game_slug,game_name)
    SELECT ?,?,? FROM DUAL
    WHERE (SELECT COUNT(*) FROM swapp_premiere_interest WHERE user_id=?) < ?
    ON DUPLICATE KEY UPDATE game_name=VALUES(game_name)`,[id,slug,name,id,MAX_GAMES_PER_ACCOUNT]);
  if(!row?.affectedRows&&!(await has(name,id)))throw apiError('premiere_interest_limit',409);
  return {active:true};
 }
 return {pool,count,has,set};
}
function checkOrigin(req,{isProd=true}={}){
 const host=String(req.get('host')||'').toLowerCase();
 const origin=String(req.get('origin')||'');
 if(!origin||!host)return false;
 try{
  const u=new URL(origin);
  return u.host.toLowerCase()===host&&(u.protocol==='https:'||!isProd&&u.protocol==='http:');
 }catch{return false}
}
function registerPremiereInterest(app,{
 store,enabled=()=>false,verifyGame,restoreSession,
 findUser,isProd=true,logger=console
}={}){
 if(typeof app?.get!=='function'||typeof app?.post!=='function'||!store||
   typeof verifyGame!=='function'||typeof restoreSession!=='function'||typeof findUser!=='function')
   throw Error('premiere_dependencies_missing');
 const noStore=res=>res.set('Cache-Control','no-store');
 async function validate(req){
  if(!enabled())throw apiError('premiere_interest_not_enabled',503);
  const raw=req.method==='GET'?req.query?.game:req.body?.game;
  const game=typeof raw==='string'?raw.trim():'';
  const {name}=validateGame(game);
  // Only canonical editorial coverage already published; never create phantom indie projects.
  await verifyGame(name);
  return name;
 }
 function failed(error,req,res){
  const status=Number(error?.status);
  if(Number.isInteger(status)&&status>=400&&status<500)
   return res.status(status).json({success:false,error:String(error.message)});
  logger.warn?.('[SWAPP PREMIÈRE] Unavailable',String(error?.code||error?.message||'unknown').slice(0,100));
  return res.status(503).json({success:false,error:'premiere_interest_unavailable'});
 }
 app.get('/api/swapp/premiere/interest',async(req,res)=>{
  noStore(res);
  try{
   const game=await validate(req);
   const [total,active]=await Promise.all([store.count(game),
    validUserId(req.session?.oryonUser?.id)?store.has(game,req.session.oryonUser.id):Promise.resolve(null)]);
   return res.json({success:true,game,publicCount:publicCount(total),minimum:PUBLIC_MIN,
    active,activity:'interest_only',eventScheduled:false});
  }catch(e){return failed(e,req,res)}
 });
 app.post('/api/swapp/premiere/interest',async(req,res)=>{
  noStore(res);
  try{
   if(req.get('x-swapp-premiere-action')!=='interest'||!checkOrigin(req,{isProd}))
    throw apiError('premiere_action_denied',403);
   if(typeof req.body?.active!=='boolean')throw apiError('interest_boolean_required');
   const game=await validate(req);
   await restoreSession(req,res,{allowUserRecovery:false});
   const id=validUserId(req.session?.oryonUser?.id);
   if(!id)throw apiError('swapp_account_required',401);
   const user=await findUser(id);
   if(!user||String(user.id)!==id)throw apiError('swapp_account_not_found',401);
   const state=await store.set(game,id,req.body.active);
   const total=await store.count(game);
   return res.json({success:true,active:state.active,publicCount:publicCount(total),
    minimum:PUBLIC_MIN,eventScheduled:false});
  }catch(e){return failed(e,req,res)}
 });
 return {get:'/api/swapp/premiere/interest',post:'/api/swapp/premiere/interest'};
}
module.exports={DDL,PUBLIC_MIN,MAX_GAMES_PER_ACCOUNT,createInterestStore,registerPremiereInterest,publicCount,checkOrigin,apiError};
