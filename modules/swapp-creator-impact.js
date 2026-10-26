'use strict';
// Creator-owned aggregates only. Never track or identify SWAPP viewers.
// Proposals from API results and signaled visible cards are unrelated series.
const LOGIN=/^[a-z0-9_][a-z0-9_-]{1,39}$/;
const PLACEMENTS=['home','discover','game'];
function natural(value){
 const n=Number(value);
 return Number.isFinite(n)&&n>0?Math.floor(n):0;
}
function summarizeCreatorImpact({visibleRows=null,offerRows=null,gameRows=null,days=7,login}={}){
 const make=field=>{
  const rows=field==='impressions'?visibleRows:offerRows;
  const key=field==='impressions'?'impressions':'opportunities';
  const counts=PLACEMENTS.map(placement=>{
   const entry=Array.isArray(rows)?rows.find(row=>row.placement===placement):null;
   return {placement,value:entry?natural(entry[key]):0,
    ...(field==='impressions'?{clicks:entry?natural(entry.clicks):0}:{})};
  });
  return {collected:Array.isArray(rows),
   total:Array.isArray(rows)?counts.reduce((sum,row)=>sum+row.value,0):null,
   ...(field==='impressions'?{clicks:Array.isArray(rows)?counts.reduce((sum,row)=>sum+row.clicks,0):null}:{}),
   placements:counts};
 };
 const visible=make('impressions'),proposals=make('opportunities');
 return {success:true,login,days,scope:'own_swapp_channel_only',
  period:'UTC calendar days, including today',
  visible:{...visible,kind:'browser-reported-visible-cards'},
  proposals:{...proposals,kind:'server-returned-api-candidates'},
  games:Array.isArray(gameRows)?gameRows.slice(0,5)
   .map(row=>({name:String(row.game_name||'').trim().slice(0,90),
     impressions:natural(row.impressions),clicks:natural(row.clicks)}))
   .filter(row=>row.name.length>=2):[],
  disclaimer:'Les cartes signalées visibles et les propositions du serveur sont deux séries indépendantes : aucun taux de conversion entre elles. Pas de visiteurs uniques, d abonnements, de revenus ou de spectateurs gagnés mesurés ici. Les clics sont des signaux du navigateur, pas une preuve de visite ou de lecture.'};
}
function installCreatorImpact({app,lookupUser,getPool,isEnabled,restoreSession,limiter=null}={}){
 if(!app||typeof app.get!=='function'||typeof lookupUser!=='function'||typeof getPool!=='function'||
    typeof isEnabled!=='function'||typeof restoreSession!=='function')
  throw Error('creator_impact_dependencies_missing');
 const route=[];
 if(limiter)route.push(limiter);
 route.push(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Robots-Tag','noindex, nofollow');
  try{await restoreSession(req,res,{allowUserRecovery:false})}catch(_){}
  if(res.headersSent)return;
  const session=req.session?.oryonUser;
  const login=String(session?.login||'').trim().toLowerCase();
  if(!LOGIN.test(login)||!session?.id)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
  const owner=lookupUser(login);
  if(!owner||String(owner.id)!==String(session.id)||
     String(owner.login||'').trim().toLowerCase()!==login)
   return res.status(403).json({success:false,error:'Identité SWAPP non confirmée.'});
  if(![undefined,'7','14'].includes(req.query?.days))
   return res.status(400).json({success:false,error:'Période invalide.'});
  const days=req.query?.days==='14'?14:7;
  if(!isEnabled()){
   return res.json({...summarizeCreatorImpact({days,login}),enabled:false,
    sample:'not_collected',notice:'Fair Discovery désactivé : aucune mesure affichée.'});
  }
  const pool=getPool();
  if(!pool)return res.status(503).json({success:false,error:'MySQL indisponible.'});
  const dateRange='event_day>=UTC_DATE() - INTERVAL '+(days-1)+' DAY AND event_day<=UTC_DATE()';
  const read=async(sql)=>{
   try{const [rows]=await pool.execute(sql,[login]);return Array.isArray(rows)?rows:[]}
   catch(error){if(error?.code==='ER_NO_SUCH_TABLE')return null;throw error}
  };
  try{
   const visibleRows=await read(
    'SELECT placement,SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+
    'WHERE '+dateRange+" AND creator_login=? AND platform IN ('swapp','oryon') "+
    'GROUP BY placement'
   );
   const offerRows=await read(
    'SELECT placement,SUM(opportunities) AS opportunities FROM swapp_fair_opportunities_daily '+
    'WHERE '+dateRange+" AND creator_login=? AND platform IN ('swapp','oryon') "+
    'GROUP BY placement'
   );
   const gameRows=visibleRows===null?null:await read(
    'SELECT game_name,SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+
    'WHERE '+dateRange+" AND creator_login=? AND platform IN ('swapp','oryon') "+
    'GROUP BY game_name ORDER BY impressions DESC LIMIT 5'
   );
   const body=summarizeCreatorImpact({visibleRows,offerRows,gameRows,days,login});
   return res.json({...body,enabled:true,
    sample:!body.visible.collected&&!body.proposals.collected?'not_collected':
     body.visible.total===0&&body.proposals.total===0?'no_signals':'measured'});
  }catch(_){
   return res.status(503).json({success:false,error:'Mesures temporairement indisponibles.'});
  }
 });
 app.get('/api/creator/impact',...route);
}
module.exports={installCreatorImpact,summarizeCreatorImpact,natural};
