'use strict';
// SWAPP Fair Discovery: read-only admin dashboard, all metrics remain aggregates.
// Shares represent voluntary game-card samples, NOT global SWAPP exposure.
const {layout}=require('./swapp-news/site-shell');
const SCOPE='game-card-opt-in';
const BANDS=['small','growing','established'];
const MIN_IMPRESSIONS=50,MIN_CREATORS=5;
const MIN_GROUP_IMPRESSIONS=10,MIN_GROUP_CREATORS=3;
const MIN_GAME_IMPRESSIONS=20,MIN_GAME_CREATORS=3;
const percent=(part,total)=>total>0?Math.round(part/total*1000)/10:null;
const count=x=>{const n=Number(x);return Number.isFinite(n)&&n>0?Math.floor(n):0};
const validDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
const dayOf=x=>{
 if(typeof x==='string'&&validDay(x))return x;
 if(x instanceof Date&&!Number.isNaN(x.getTime()))return x.toISOString().slice(0,10);
 return '';
};
function summarizeFairAdmin({bands=[],daily=[],dailyCreators=[],games=[],uniqueCreators=0,days=7,enabled=true}={}){
 const periodDays=days===14?14:7;
 if(!enabled)return {enabled:false,scope:SCOPE,sample:'not_collected',periodDays};
 const base=(Array.isArray(bands)?bands:[]).filter(x=>BANDS.includes(x.audience_band))
  .map(x=>({name:x.audience_band,impressions:count(x.impressions),clicks:count(x.clicks),creators:count(x.creators)}));
 const totals=base.reduce((a,x)=>({impressions:a.impressions+x.impressions,clicks:a.clicks+x.clicks}),{impressions:0,clicks:0});
 const creators=count(uniqueCreators);
 const shared={enabled:true,scope:SCOPE,periodDays,thresholds:{impressions:MIN_IMPRESSIONS,creators:MIN_CREATORS},
  sampling:'voluntary',notice:'Mesure limitée aux cartes des fiches de jeux, pour les visiteurs volontaires ; aucune donnée visiteur.'};
 if(totals.impressions<MIN_IMPRESSIONS||creators<MIN_CREATORS)
  return {...shared,sample:'insufficient',message:'Collecte active, mais échantillon encore insuffisant pour une analyse fiable.'};
 const visibleBands=BANDS.map(name=>{
  const x=base.find(b=>b.name===name)||{impressions:0,clicks:0,creators:0};
  const releasable=x.impressions>=MIN_GROUP_IMPRESSIONS&&x.creators>=MIN_GROUP_CREATORS;
  return {name,sample:releasable?'limited-voluntary':'insufficient',
   impressions:releasable?x.impressions:null,clicks:releasable?x.clicks:null,
   creators:releasable?x.creators:null,share:releasable?percent(x.impressions,totals.impressions):null,
   clickRate:releasable?percent(x.clicks,x.impressions):null};
 });
 const byDate=new Map();
 for(const x of Array.isArray(daily)?daily:[]){
  const day=dayOf(x.day);
  if(!day||!BANDS.includes(x.audience_band))continue;
  const row=byDate.get(day)||{day,impressions:0,clicks:0,small:0,creators:0};
  const impressions=count(x.impressions);
  row.impressions+=impressions;row.clicks+=count(x.clicks);
  if(x.audience_band==='small')row.small+=impressions;
  byDate.set(day,row);
 }
 for(const x of Array.isArray(dailyCreators)?dailyCreators:[]){
  const day=dayOf(x.day);
  if(byDate.has(day))byDate.get(day).creators=count(x.creators);
 }
 const trend=[...byDate.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-periodDays).map(row=>{
  if(row.impressions<MIN_GROUP_IMPRESSIONS||row.creators<MIN_GROUP_CREATORS)
   return {day:row.day,sample:'insufficient',impressions:null,clicks:null,smallShare:null};
  return {day:row.day,sample:'limited-voluntary',impressions:row.impressions,
   clicks:row.clicks,smallShare:row.small>=MIN_GROUP_IMPRESSIONS?percent(row.small,row.impressions):null};
 });
 // A game's public name is allowed; never send a creator login, session or a raw event.
 const topGames=(Array.isArray(games)?games:[])
  .map(x=>({name:String(x.game_name||'').slice(0,90),impressions:count(x.impressions),
   clicks:count(x.clicks),creators:count(x.creators)}))
  .filter(x=>x.name.length>=2&&x.impressions>=MIN_GAME_IMPRESSIONS&&x.creators>=MIN_GAME_CREATORS)
  .sort((a,b)=>b.impressions-a.impressions||a.name.localeCompare(b.name,'fr'))
  .slice(0,8).map(x=>({name:x.name,impressions:x.impressions,clicks:x.clicks,clickRate:percent(x.clicks,x.impressions)}));
 return {...shared,sample:'limited-voluntary',totals:{...totals,creators,clickRate:percent(totals.clicks,totals.impressions)},
  bands:visibleBands,trend,games:topGames,
  warning:'Les catégories varient selon l’audience instantanée et un même créateur peut changer de catégorie. Les résultats volontaires ne représentent pas tous les visiteurs.'};
}
const PAGE_CSS='<link rel="stylesheet" href="/assets/swapp-fair-admin.css?v=20261019-dashboard-v1">';
const PAGE_SCRIPT='<script defer src="/assets/swapp-fair-admin.js?v=20261019-dashboard-v1"></script>';
function fairAdminPage(){
 const content='<main class="fair-admin" id="fair-admin-root">'+
  '<nav class="fair-crumb" aria-label="Administration"><a href="/actus/studio">Administration</a><span aria-hidden="true">/</span><strong>Fair Discovery</strong></nav>'+
  '<header class="fair-header"><div><span class="fair-kicker">SWAPP / INTELLIGENCE ÉDITORIALE</span>'+
  '<h1>La découverte, mesurée.</h1><p>Comprendre les chances de visibilité offertes aux créateurs, sans surveiller les visiteurs.</p></div>'+
  '<div class="fair-header-actions"><label for="fair-period">Période</label><select id="fair-period"><option value="7">7 derniers jours</option><option value="14">14 derniers jours</option></select>'+
  '<button type="button" id="fair-refresh">Actualiser</button></div></header>'+
  '<p id="fair-status" role="status" aria-live="polite">Chargement des statistiques agrégées…</p>'+
  '<div class="fair-empty" id="fair-empty" hidden><strong id="fair-empty-title">Pas encore de données exploitables.</strong>'+
  '<p id="fair-empty-description">Les statistiques restent masquées tant que l’échantillon volontaire est insuffisant.</p>'+
  '<a href="/jeux">Parcourir les fiches de jeux →</a></div>'+
  '<div id="fair-data" hidden><section class="fair-kpis" aria-label="Indicateurs"><article><span>Impressions volontaires</span><strong id="fair-impressions">—</strong><small>Cartes vues au moins 1,25 s</small></article>'+
  '<article><span>Clics vers les lives</span><strong id="fair-clicks">—</strong><small>Actions volontaires enregistrées</small></article>'+
  '<article><span>Créateurs distincts</span><strong id="fair-creators">—</strong><small>Identités publiques uniques</small></article>'+
  '<article><span>Taux clic / impression</span><strong id="fair-ctr">—</strong><small>Ce n’est pas un taux de conversion global</small></article></section>'+
  '<div class="fair-dashboard-grid"><section class="fair-panel" aria-labelledby="fair-cohorts-title"><div class="fair-panel-head"><h2 id="fair-cohorts-title">Visibilité par taille de communauté</h2><span>Répartition des impressions</span></div>'+
  '<div id="fair-cohorts" class="fair-bars"></div></section>'+
  '<section class="fair-panel" aria-labelledby="fair-trend-title"><div class="fair-panel-head"><h2 id="fair-trend-title">Évolution quotidienne</h2><span>Mesures minimales par jour</span></div>'+
  '<div id="fair-trend" class="fair-trend" role="img" aria-label="Histogramme des impressions volontaires par jour"></div></section></div>'+
  '<section class="fair-panel" aria-labelledby="fair-games-title"><div class="fair-panel-head"><h2 id="fair-games-title">Jeux où les lives sont découverts</h2><span>Jeux dépassant les seuils minimaux</span></div>'+
  '<div id="fair-games" class="fair-game-list"></div></section></div>'+
  '<footer class="fair-foot"><p><strong>Lecture correcte :</strong> il s’agit d’un échantillon de visiteurs ayant activé la mesure sur les fiches de jeux. Un résultat masqué signifie « données insuffisantes », pas zéro. Les impressions ne comptent pas les visiteurs uniques.</p>'+
  '<a href="/actus/studio">← Retour au Studio</a></footer></main>';
 return layout({title:'Fair Discovery · Administration SWAPP',description:'Statistiques administrateur sur la découverte volontaire des créateurs SWAPP',
  content,active:'actus',metadata:'<meta name="robots" content="noindex,nofollow,noarchive">',scripts:PAGE_CSS+PAGE_SCRIPT});
}
function registerFairAdmin({app,guard,restoreSession,fairMetrics,getPool}={}){
 if(typeof app?.get!=='function'||typeof guard!=='function'||typeof restoreSession!=='function'||
  !fairMetrics||typeof fairMetrics.summary!=='function'||typeof getPool!=='function')throw Error('fair_admin_dependencies_missing');
 // Restrict both routes to the exact authenticated editor role. This reuses
 // existing SWAPP account recovery and pinning; no new passwords/tokens.
 const paths=['/admin/fair-discovery','/api/editor/fair-discovery'];
 app.use(paths,async(req,res,next)=>{
  try{await restoreSession(req,res,{allowUserRecovery:false})}catch{ /* existing guard fails closed */ }
  return next();
 });
 app.use(paths,(req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Robots-Tag','noindex, nofollow');return next()});
 app.get('/admin/fair-discovery',guard,(_req,res)=>res.type('html').send(fairAdminPage()));
 app.get('/api/editor/fair-discovery',guard,async(req,res)=>{
  if(![undefined,'7','14'].includes(req.query?.days))return res.status(400).json({error:'invalid_period'});
  const days=req.query?.days==='14'?14:7;
  try{
   const base=await fairMetrics.summary();
   if(!base.enabled)return res.json(summarizeFairAdmin({enabled:false,days}));
   const pool=getPool();
   if(!pool)return res.status(503).json({error:'metrics_unavailable'});
   const range=days===14?13:6;
   const where='WHERE event_day>=UTC_DATE() - INTERVAL '+range+' DAY AND event_day<=UTC_DATE() AND placement=?';
   const [bands]=await pool.execute('SELECT audience_band,COUNT(DISTINCT platform,creator_login) AS creators,'+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY audience_band',['game']);
   const [unique]=await pool.execute('SELECT COUNT(DISTINCT platform,creator_login) AS creators FROM swapp_fair_exposure_daily '+where,['game']);
   const [daily]=await pool.execute("SELECT DATE_FORMAT(event_day,'%Y-%m-%d') AS day,audience_band,"+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY event_day,audience_band ORDER BY event_day',['game']);
   const [dailyCreators]=await pool.execute("SELECT DATE_FORMAT(event_day,'%Y-%m-%d') AS day,"+
    'COUNT(DISTINCT platform,creator_login) AS creators FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY event_day ORDER BY event_day',['game']);
   const [games]=await pool.execute('SELECT game_name,COUNT(DISTINCT platform,creator_login) AS creators,'+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY game_name ORDER BY impressions DESC LIMIT 120',['game']);
   return res.json(summarizeFairAdmin({bands,uniqueCreators:unique?.[0]?.creators,daily,dailyCreators,games,days}));
  }catch{return res.status(503).json({error:'metrics_unavailable'})}
 });
}
module.exports={registerFairAdmin,summarizeFairAdmin,fairAdminPage};
