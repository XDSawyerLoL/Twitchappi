'use strict';
// SWAPP Fair Discovery: read-only admin dashboard, all metrics remain aggregates.
// Shares represent anonymous verified game-card samples, NOT unique visitors.
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
function summarizeFairAdmin({bands=[],daily=[],dailyCreators=[],games=[],uniqueCreators=0,days=7,enabled=true,placement='game'}={}){
 const periodDays=days===14?14:7;
 if(!enabled)return {enabled:false,scope:placement==='all'?'all-card-aggregate':placement+'-card-aggregate',sample:'not_collected',periodDays};
 const base=(Array.isArray(bands)?bands:[]).filter(x=>BANDS.includes(x.audience_band))
  .map(x=>({name:x.audience_band,impressions:count(x.impressions),clicks:count(x.clicks),creators:count(x.creators)}));
 const totals=base.reduce((a,x)=>({impressions:a.impressions+x.impressions,clicks:a.clicks+x.clicks}),{impressions:0,clicks:0});
 const creators=count(uniqueCreators);
 const shared={enabled:true,scope:placement==='all'?'all-card-aggregate':placement+'-card-aggregate',placement,periodDays,thresholds:{impressions:MIN_IMPRESSIONS,creators:MIN_CREATORS},
  sampling:'automatic-anonymous',notice:'Mesure automatique des cartes publiques vérifiées et visibles ; aucun cookie ni identifiant visiteur.'};
 if(totals.impressions<MIN_IMPRESSIONS||creators<MIN_CREATORS)
  return {...shared,sample:'insufficient',message:'Collecte active, mais échantillon encore insuffisant pour une analyse fiable.'};
 const visibleBands=BANDS.map(name=>{
  const x=base.find(b=>b.name===name)||{impressions:0,clicks:0,creators:0};
  const releasable=x.impressions>=MIN_GROUP_IMPRESSIONS&&x.creators>=MIN_GROUP_CREATORS;
  return {name,sample:releasable?'limited-aggregate':'insufficient',
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
  return {day:row.day,sample:'limited-aggregate',impressions:row.impressions,
   clicks:row.clicks,smallShare:row.small>=MIN_GROUP_IMPRESSIONS?percent(row.small,row.impressions):null};
 });
 // A game's public name is allowed; never send a creator login, session or a raw event.
 const topGames=(Array.isArray(games)?games:[])
  .map(x=>({name:String(x.game_name||'').slice(0,90),impressions:count(x.impressions),
   clicks:count(x.clicks),creators:count(x.creators)}))
  .filter(x=>x.name.length>=2&&x.impressions>=MIN_GAME_IMPRESSIONS&&x.creators>=MIN_GAME_CREATORS)
  .sort((a,b)=>b.impressions-a.impressions||a.name.localeCompare(b.name,'fr'))
  .slice(0,8).map(x=>({name:x.name,impressions:x.impressions,clicks:x.clicks,clickRate:percent(x.clicks,x.impressions)}));
 return {...shared,sample:'limited-aggregate',totals:{...totals,creators,clickRate:percent(totals.clicks,totals.impressions)},
  bands:visibleBands,trend,games:topGames,
  warning:'Les catégories varient selon l’audience instantanée et un même créateur peut changer de catégorie. Ces résultats agrégés ne comptabilisent pas les visiteurs uniques.'};
}
// Server-side offers are API candidates, NOT voluntary observed impressions.
function summarizeFairOffers({bands=[],uniqueCreators=0,days=7,placement='all',enabled=true}={}){
 const periodDays=days===14?14:7;
 const base={enabled:!!enabled,kind:'server-returned-candidates',placement,periodDays,
  comparableToOptIn:false,thresholds:{opportunities:50,creators:5},
  note:'Candidats contenus dans les réponses API terminées ; pas des cartes vues, des visiteurs uniques ni un entonnoir de conversion.'};
 if(!enabled)return {...base,sample:'not_collected'};
 const rows=(Array.isArray(bands)?bands:[]).filter(x=>BANDS.includes(x.audience_band))
  .map(x=>({name:x.audience_band,opportunities:count(x.opportunities),creators:count(x.creators)}));
 const total=rows.reduce((acc,x)=>acc+x.opportunities,0),creators=count(uniqueCreators);
 if(total<50||creators<5)return {...base,sample:'insufficient'};
 return {...base,sample:'aggregate',totals:{opportunities:total,creators},
  bands:BANDS.map(name=>{
   const r=rows.find(x=>x.name===name)||{opportunities:0,creators:0};
   const visible=r.opportunities>=10&&r.creators>=3;
   return {name,sample:visible?'aggregate':'insufficient',
    opportunities:visible?r.opportunities:null,creators:visible?r.creators:null,
    share:visible?percent(r.opportunities,total):null};
  })};
}
const PAGE_CSS='<link rel="stylesheet" href="/assets/swapp-fair-admin.css?v=20261019-server-offers-v4">';
const PAGE_SCRIPT='<script defer src="/assets/swapp-fair-admin.js?v=20261019-server-offers-v4"></script>';
function fairAdminPage(){
 const content='<main class="fair-admin" id="fair-admin-root">'+
  '<nav class="fair-crumb" aria-label="Administration"><a href="/actus/studio">Administration</a><span aria-hidden="true">/</span><strong>Fair Discovery</strong></nav>'+
  '<header class="fair-header"><div><span class="fair-kicker">SWAPP / INTELLIGENCE ÉDITORIALE</span>'+
  '<h1>La découverte, mesurée.</h1><p>Comprendre les chances de visibilité offertes aux créateurs, sans surveiller les visiteurs.</p></div>'+
  '<div class="fair-header-actions"><label for="fair-period">Période</label><select id="fair-period"><option value="7">7 derniers jours</option><option value="14">14 derniers jours</option></select>'+
  '<label for="fair-placement">Emplacement</label><select id="fair-placement"><option value="all" selected>Tous</option><option value="home">Accueil</option><option value="discover">Découvrir</option><option value="game">Fiches de jeux</option></select><button type="button" id="fair-refresh">Actualiser</button></div></header>'+
  '<p id="fair-status" role="status" aria-live="polite">Chargement des statistiques agrégées…</p>'+
  '<section class="fair-panel fair-offers-panel" aria-labelledby="fair-offers-title">'+
  '<div class="fair-panel-head"><h2 id="fair-offers-title">Opportunités proposées par SWAPP</h2><span>Candidats API · mesure indépendante</span></div>'+
  '<p class="fair-offers-note">Ces propositions proviennent de réponses du serveur terminées. Elles ne prouvent pas que les cartes ont été affichées ou vues. Ne pas calculer de taux de conversion avec les impressions volontaires.</p>'+
  '<p id="fair-offers-status" role="status" aria-live="polite">Chargement…</p>'+
  '<div class="fair-offers-totals" id="fair-offers-totals" hidden>'+
  '<strong id="fair-offers-count">—</strong><span>propositions de lives</span>'+
  '<strong id="fair-offers-creators">—</strong><span>créateurs distincts</span></div>'+
  '<div class="fair-bars" id="fair-offers-bands" hidden></div></section>'+
  '<div class="fair-empty" id="fair-empty" hidden><strong id="fair-empty-title">Pas encore de données exploitables.</strong>'+
  '<p id="fair-empty-description">Les statistiques restent masquées tant que l’échantillon anonyme est insuffisant.</p>'+
  '<a href="/jeux">Parcourir les fiches de jeux →</a></div>'+
  '<div id="fair-data" hidden><section class="fair-kpis" aria-label="Indicateurs"><article><span>Impressions anonymes</span><strong id="fair-impressions">—</strong><small>Cartes vues au moins 1,25 s</small></article>'+
  '<article><span>Clics vers les lives</span><strong id="fair-clicks">—</strong><small>Actions volontaires enregistrées</small></article>'+
  '<article><span>Créateurs distincts</span><strong id="fair-creators">—</strong><small>Identités publiques uniques</small></article>'+
  '<article><span>Taux clic / impression</span><strong id="fair-ctr">—</strong><small>Ce n’est pas un taux de conversion global</small></article></section>'+
  '<div class="fair-dashboard-grid"><section class="fair-panel" aria-labelledby="fair-cohorts-title"><div class="fair-panel-head"><h2 id="fair-cohorts-title">Visibilité par taille de communauté</h2><span>Répartition des impressions</span></div>'+
  '<div id="fair-cohorts" class="fair-bars"></div></section>'+
  '<section class="fair-panel" aria-labelledby="fair-trend-title"><div class="fair-panel-head"><h2 id="fair-trend-title">Évolution quotidienne</h2><span>Mesures minimales par jour</span></div>'+
  '<div id="fair-trend" class="fair-trend" role="img" aria-label="Histogramme des impressions volontaires par jour"></div></section></div>'+
  '<section class="fair-panel" aria-labelledby="fair-games-title"><div class="fair-panel-head"><h2 id="fair-games-title">Jeux où les lives sont découverts</h2><span>Jeux dépassant les seuils minimaux</span></div>'+
  '<div id="fair-games" class="fair-game-list"></div></section></div>'+
  '<footer class="fair-foot"><p><strong>Lecture correcte :</strong> les opportunités désignent des candidats renvoyés par les API de SWAPP, et les impressions désignent des cartes vues après consentement volontaire. Ces séries sont indépendantes et ne permettent pas de calculer un taux de conversion. Un résultat masqué signifie « données insuffisantes », pas zéro.</p>'+
  '<a href="/actus/studio">← Retour au Studio</a></footer></main>';
 return layout({title:'Fair Discovery · Administration SWAPP',description:'Statistiques administrateur sur la découverte volontaire des créateurs SWAPP',
  content,active:'actus',metadata:'<meta name="robots" content="noindex,nofollow,noarchive">',scripts:PAGE_CSS+PAGE_SCRIPT});
}
function registerFairAdmin({app,guard,restoreSession,fairMetrics,fairOffers=null,getPool}={}){
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
  const placement=req.query?.placement||'game';
  if(!['all','game','home','discover'].includes(placement))return res.status(400).json({error:'invalid_placement'});
  try{
   const base=await fairMetrics.summary();
   if(!base.enabled)return res.json(summarizeFairAdmin({enabled:false,days}));
   const pool=getPool();
   if(!pool)return res.status(503).json({error:'metrics_unavailable'});
   // Server candidates are an independent series. A failure cannot obscure voluntary measurements.
   let offers={enabled:false,sample:'unavailable'};
   if(fairOffers){
    try{const raw=await fairOffers.summary({days,placement});
     offers=summarizeFairOffers({...raw,days,placement});
    }catch{offers={enabled:false,sample:'unavailable'}}
   }
   const range=days===14?13:6;
   const where='WHERE event_day>=UTC_DATE() - INTERVAL '+range+' DAY AND event_day<=UTC_DATE()'+(placement==='all'?'':' AND placement=?');
  const params=placement==='all'?[]:[placement];
   const [bands]=await pool.execute('SELECT audience_band,COUNT(DISTINCT platform,creator_login) AS creators,'+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY audience_band',params);
   const [unique]=await pool.execute('SELECT COUNT(DISTINCT platform,creator_login) AS creators FROM swapp_fair_exposure_daily '+where,params);
   const [daily]=await pool.execute("SELECT DATE_FORMAT(event_day,'%Y-%m-%d') AS day,audience_band,"+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY event_day,audience_band ORDER BY event_day',params);
   const [dailyCreators]=await pool.execute("SELECT DATE_FORMAT(event_day,'%Y-%m-%d') AS day,"+
    'COUNT(DISTINCT platform,creator_login) AS creators FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY event_day ORDER BY event_day',params);
   const [games]=await pool.execute('SELECT game_name,COUNT(DISTINCT platform,creator_login) AS creators,'+
    'SUM(impressions) AS impressions,SUM(clicks) AS clicks FROM swapp_fair_exposure_daily '+where+
    ' GROUP BY game_name ORDER BY impressions DESC LIMIT 120',params);
   return res.json({...summarizeFairAdmin({bands,uniqueCreators:unique?.[0]?.creators,daily,dailyCreators,games,days,placement}),offers});
  }catch{return res.status(503).json({error:'metrics_unavailable'})}
 });
}
module.exports={registerFairAdmin,summarizeFairAdmin,summarizeFairOffers,fairAdminPage};
