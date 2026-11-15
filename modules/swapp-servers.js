'use strict';
/* SWAPP Serveurs — native, free directory. No scraping or imported listings. */
const crypto=require('node:crypto');
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const {inviteCode,verifyDiscordInvite}=require('./swapp-servers-discord');
const {renderProfile}=require('./swapp-servers-profile');
const {getProfileEvidence}=require('./swapp-servers-stats');
const {createPage,LANGUAGES,SERVER_TYPES,discordLink,twitchLink,readTypes}=require('./swapp-servers-create');
const GAMES=['Minecraft','GTA V / FiveM','GTA RP','Rust','DayZ','Cyberpunk 2077','Arma 3','Arma Reforger','ARK Survival Ascended','ARK Survival Evolved','Project Zomboid','Palworld','Red Dead Redemption 2','Garry’s Mod','Valheim','Enshrouded','Conan Exiles','SCUM','Counter-Strike 2','7 Days to Die','Eco','V Rising','Unturned','Space Engineers','Dune Awakening','Hell Let Loose','Squad','Terraria','No Man’s Sky','Satisfactory','Don’t Starve Together','Lethal Company','Discord / Multigaming','Autre'];
const mysqlUrl=()=>process.env.SWAPP_SERVERS_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'';
let pool=null,ready=null;
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>clean(s,100).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75);
function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1'].includes(u.hostname)?u.href:''}catch{return ''}}
// Publication is immediate once the supplied details pass objective checks.
// We do not claim server online status: this validates the listing, not reachability.
function validJoinAddress(value){
 const input=clean(value,240);
 if(!input||/[\s<>"'\\/?#@]/.test(input))return false;
 const match=input.match(/^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/i);
 if(!match)return false;
 const host=match[1].toLowerCase(),port=match[2]===undefined?null:Number(match[2]);
 if(port!==null&&(!Number.isInteger(port)||port<1||port>65535))return false;
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test'))return false;
 if(/^[0-9.]+$/.test(host)){
  const octets=host.split('.').map(Number);
  if(octets.length!==4||octets.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
  const [a,b]=octets;
  if(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127))return false;
  return true;
 }
 const parts=host.split('.');
 return parts.length>=2&&host.length<=253&&parts.every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))&&!/^\d+$/.test(parts.at(-1));
}
function validListingDetails({game,website,joinAddress}){
 if(!GAMES.includes(game))return false;
 const websiteOk=!!website&&!!safeUrl(website);
 const joinOk=!!joinAddress&&validJoinAddress(joinAddress);
 return websiteOk||joinOk||(game==='Discord / Multigaming'&&!!inviteCode(joinAddress));
}

const DEFAULT_ACCENT='#8ceaf0',DEFAULT_SECONDARY='#ad6bff';
const colorHex=x=>/^#[0-9a-fA-F]{6}$/.test(String(x||''))?String(x).toLowerCase():'';
const publicMediaUrl=(id,kind)=>'/media/serveurs/'+id+'/'+kind;
function optionalImageUrl(value,id,kind){
 const v=clean(value,351);
 if(!v)return '';
 if(id&&v===publicMediaUrl(id,kind))return v;
 return safeUrl(v);
}
function normalizeBranding(body={},id=''){
 const logo=clean(body.logoUrl,351),banner=clean(body.brandBannerUrl||body.bannerUrl,351);
 const accent=clean(body.accentColor||DEFAULT_ACCENT,7),secondary=clean(body.secondaryColor||DEFAULT_SECONDARY,7);
 const tagline=clean(body.tagline,141);
 const gallery=Array.isArray(body.gallery)?body.gallery:[];
 const valid=(!logo||!!optionalImageUrl(logo,id,'logo'))&&(!banner||!!optionalImageUrl(banner,id,'banner'))&&!!colorHex(accent)&&!!colorHex(secondary)&&tagline.length<=140&&gallery.length<=3&&gallery.every(u=>!!safeUrl(u)&&String(u).length<=350);
 return valid?{logo:logo?optionalImageUrl(logo,id,'logo'):'',banner:banner?optionalImageUrl(banner,id,'banner'):'',accent:colorHex(accent),secondary:colorHex(secondary),tagline,gallery:JSON.stringify(gallery)}:null;
}
async function saveBranding(conn,id,brand){
 return conn.execute('INSERT INTO swapp_game_server_branding (server_id,logo_url,banner_url,accent_color,secondary_color,tagline,gallery_json) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE logo_url=VALUES(logo_url),banner_url=VALUES(banner_url),accent_color=VALUES(accent_color),secondary_color=VALUES(secondary_color),tagline=VALUES(tagline),gallery_json=VALUES(gallery_json)',
  [id,brand.logo,brand.banner,brand.accent,brand.secondary,brand.tagline,brand.gallery]);
}

function originGuard(req){const expected=['https://swapp.tv','https://www.swapp.tv'];const own=process.env.APP_BASE_URL; if(own)try{expected.push(new URL(own).origin)}catch{};const origin=req.get('origin');return !!origin&&expected.includes(origin)}
function account(req){
 const own=clean(req.session?.oryonUser?.id||'',80);
 if(own)return own;
 const twitch=clean(req.session?.twitchUser?.id||'',70);
 return twitch?'twitch:'+twitch:'';
}
function administrator(req){const id=account(req);if(!id)return false;const pinned=String(process.env.ORYON_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);return pinned.includes(id)}
function fail(res,e){console.warn('[SWAPP SERVEURS]',String(e.code||e.message||e).slice(0,90));return res.status(503).json({error:'annuaire_temporairement_indisponible'})}
async function db(){
 if(!mysqlUrl())throw Error('swapp_servers_mysql_not_configured');
 if(!pool){const mysql=require('mysql2/promise');pool=mysql.createPool({uri:mysqlUrl(),connectionLimit:3,waitForConnections:true,queueLimit:40,connectTimeout:5000});}
 if(!ready){ready=(async()=>{
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_servers (id CHAR(32) PRIMARY KEY, owner_id VARCHAR(100) NOT NULL, name VARCHAR(100) NOT NULL, slug VARCHAR(90) NOT NULL UNIQUE, game VARCHAR(70) NOT NULL, description VARCHAR(1500) NOT NULL, website VARCHAR(350) NOT NULL, join_address VARCHAR(240) NOT NULL, region VARCHAR(60) NOT NULL, tags VARCHAR(250) NOT NULL, banner_url VARCHAR(350) NOT NULL, status ENUM("pending","published","rejected") NOT NULL DEFAULT "pending", created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY swapp_servers_game_status (game,status),KEY swapp_servers_owner (owner_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_votes (server_id CHAR(32) NOT NULL, user_id VARCHAR(100) NOT NULL, voted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (server_id,user_id),KEY swapp_servers_vote_time (voted_at), CONSTRAINT swapp_game_votes_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_vote_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, server_id CHAR(32) NOT NULL, user_id VARCHAR(100) NOT NULL, voted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY swapp_game_votes_rank (server_id,voted_at), CONSTRAINT swapp_game_vote_events_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_click_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, server_id CHAR(32) NOT NULL, clicked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY swapp_click_events_time (server_id,clicked_at), CONSTRAINT swapp_click_events_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_reviews (id CHAR(32) PRIMARY KEY, server_id CHAR(32) NOT NULL, user_id VARCHAR(100) NOT NULL, staff TINYINT UNSIGNED NOT NULL, atmosphere TINYINT UNSIGNED NOT NULL, availability TINYINT UNSIGNED NOT NULL, comment VARCHAR(1200) NOT NULL, status ENUM("pending","published","rejected") NOT NULL DEFAULT "pending", created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY swapp_server_one_review (server_id,user_id), KEY swapp_reviews_moderation (status,created_at), CONSTRAINT swapp_reviews_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_extras (server_id CHAR(32) PRIMARY KEY, language VARCHAR(12) NOT NULL DEFAULT "fr", twitch_url VARCHAR(120) NOT NULL DEFAULT "", homepage_url VARCHAR(350) NOT NULL DEFAULT "", discord_guild_id VARCHAR(25) NOT NULL DEFAULT "", CONSTRAINT swapp_server_extras_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_branding (server_id CHAR(32) PRIMARY KEY, logo_url VARCHAR(350) NOT NULL DEFAULT "", banner_url VARCHAR(350) NOT NULL DEFAULT "", accent_color CHAR(7) NOT NULL DEFAULT "#8ceaf0", secondary_color CHAR(7) NOT NULL DEFAULT "#ad6bff", tagline VARCHAR(140) NOT NULL DEFAULT "", gallery_json TEXT NOT NULL, CONSTRAINT swapp_branding_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await pool.query('CREATE TABLE IF NOT EXISTS swapp_game_server_media (server_id CHAR(32) NOT NULL, kind ENUM("logo","banner") NOT NULL, mime VARCHAR(24) NOT NULL, contents MEDIUMBLOB NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (server_id,kind), CONSTRAINT swapp_server_media_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 })().catch(e=>{ready=null;throw e});}
 await ready;return pool;
}
function page({isAdmin=false,game=''}={}){
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050608"><title>'+esc(game?'Serveurs '+game+' — classement des communautés | SWAPP':'Serveurs de jeux — classements et communautés | SWAPP')+'</title><meta name="description" content="Découvre des serveurs gaming et roleplay, classe les communautés par votes et référence ton serveur sur SWAPP."><link rel="canonical" href="https://swapp.tv/serveurs'+(game?'/'+slug(game):'')+'">'+SHARED_HEAD_SLOT+'<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-create-v9">';
 let content='<main class="ss" data-ss-current-game="'+esc(game)+'"><header class="ss-hero"><div class="ss-inner"><p class="ss-overline">SWAPP / EXPLORER / SERVEURS</p><h1>'+ (game?'Serveurs <em>'+esc(game)+'</em>':'Trouve ta prochaine <em>communauté.</em>')+'</h1><p>Serveurs de jeux et RP, choisis par les joueurs. Des votes réels, un référencement gratuit, aucun classement inventé.</p><div class="ss-hero-actions"><a href="/explorer">← Explorer</a><a id="ss-add" href="/serveurs/creer'+(game?'?jeu='+encodeURIComponent(game):'')+'">+ Référencer mon serveur</a></div></div></header><section class="ss-inner ss-content"><div class="ss-toolbar"><label class="ss-search"><span>Rechercher</span><input id="ss-q" type="search" placeholder="Nom, jeu, RP, survie…"></label><label><span>Jeu</span><select id="ss-game"><option value="">Tous les jeux</option>'+GAMES.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label><label><span>Classement</span><select id="ss-sort"><option value="votes">Votes du mois</option><option value="recent">Plus récents</option><option value="name">Nom</option></select></label></div><section class="ss-featured" aria-labelledby="ss-featured-title"><div class="ss-games-heading"><p class="ss-overline">À LA UNE</p><h2 id="ss-featured-title">Les univers populaires</h2><p>Des jeux authentiques. Le classement des serveurs dépend uniquement des inscriptions vérifiées par SWAPP.</p></div><div id="ss-featured-games" class="ss-featured-grid" aria-label="Univers de serveurs recommandés"></div></section><section class="ss-games" aria-labelledby="ss-games-title"><div class="ss-games-heading"><p class="ss-overline">CHOISIS TON UNIVERS</p><h2 id="ss-games-title">Explorer par jeu</h2></div><label class="ss-find-game"><span>Filtrer les jeux</span><input id="ss-game-search" type="search" autocomplete="off" placeholder="Minecraft, GTA RP, Rust, DayZ…"></label><div class="ss-game-grid"><a href="/serveurs" data-ss-game="" class="ss-game-tile is-selected"><span class="ss-game-art"><span class="ss-game-fallback">SWAPP</span></span><span class="ss-game-copy"><strong>Tous les serveurs</strong><small data-ss-game-count="">Classement SWAPP</small></span></a>'+GAMES.map(g=>'<a href="/serveurs/'+slug(g)+'" data-ss-game="'+esc(g)+'" class="ss-game-tile"><span class="ss-game-art"><span class="ss-game-fallback">'+esc(g)+'</span></span><span class="ss-game-copy"><strong>'+esc(g)+'</strong><small data-ss-game-count="'+esc(g)+'">Classement SWAPP</small></span></a>').join('')+'</div></section><div class="ss-title"><div><p class="ss-overline">ANNUAIRE COMMUNAUTAIRE</p><h2>Classement des serveurs</h2></div><span id="ss-count">Chargement…</span></div><div id="ss-feedback" role="status" aria-live="polite"></div><div id="ss-results" class="ss-results"></div><section class="ss-info"><h2>Comment fonctionne le classement ?</h2><p>Les serveurs approuvés sont affichés par nombre de votes admissibles reçus pendant le mois en cours. Les inscriptions sont publiées immédiatement lorsque leurs coordonnées sont valides. Pour Discord, SWAPP vérifie l’invitation officielle. Un compte SWAPP peut renouveler son vote pour un même serveur toutes les deux heures. Les statuts de connexion ne sont affichés que s’ils ont réellement été vérifiés. Les inscriptions invalides sont refusées sans créer de file d’attente.</p></section>'+(isAdmin?'<section class="ss-admin"><h2>Validation des serveurs</h2><p>Modération des propositions reçues sur SWAPP.</p><button id="ss-review-refresh" type="button">Actualiser les demandes</button><div id="ss-review" role="status"></div><div id="ss-review-moderation"><h3>Avis à examiner</h3><div id="ss-pending-reviews" role="status" aria-live="polite"></div></div></section>':'')+'</section></main>';
 if(isAdmin){
  // The queue belongs directly under the heading; never hide it after all the listings.
  const start=content.indexOf('<section class="ss-admin">');
  const end=content.indexOf('</section>',start);
  if(start>=0&&end>start){const panel=content.slice(start,end+10);content=content.replace(panel,'').replace('<section class="ss-inner ss-content">','<section class="ss-inner ss-content">'+panel)}
 }
 return renderPage({head,content,active:'servers',bodyClass:'swapp-editorial-route swapp-servers-page',scripts:'<script src="/assets/swapp-servers.js?v=20261115-create-v9" defer></script><script src="/assets/swapp-servers-review-admin.js?v=20261115-server-pro-v6" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}

const DETAIL_STEAM_GAME_IDS=Object.freeze({
  'GTA V / FiveM':271590,'GTA RP':271590,'Rust':252490,'DayZ':221100,
  'Cyberpunk 2077':1091500,'Arma 3':107410,'Arma Reforger':1874880,
  'ARK Survival Ascended':2399830,'ARK Survival Evolved':346110,
  'Project Zomboid':108600,'Palworld':1623730,'Red Dead Redemption 2':1174180,
  'Garry’s Mod':4000,'Valheim':892970,'Enshrouded':1203620,
  'Conan Exiles':440900,'SCUM':513710,'Counter-Strike 2':730,
  '7 Days to Die':251570,'Eco':382310,'V Rising':1604030,
  'Unturned':304930,'Space Engineers':244850,'Dune Awakening':1172710,
  'Hell Let Loose':686810,'Squad':393380,'Terraria':105600,
  'No Man’s Sky':275850,'Satisfactory':526870,
  'Don’t Starve Together':322330,'Lethal Company':1966720
 });
function detailCover(game){
 if(game==='Minecraft')return 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-720x960.jpg';
 const id=DETAIL_STEAM_GAME_IDS[game];
 return id?'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/header.jpg':'';
}
function detailPage(server,votes,meta={}){
 const game=String(server?.game||''),title=String(server?.name||'Serveur');
 const gamePath='/serveurs/'+slug(game);
 const image=optionalImageUrl(server.brand_banner_url,server.id,'banner')||safeUrl(server.banner_url)||detailCover(game);
 const canonical='https://swapp.tv'+gamePath+'/'+encodeURIComponent(server.slug);
 const header='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#030405">'+
  '<title>'+esc(title)+' — '+esc(game)+' | Serveurs SWAPP</title>'+
  '<meta name="description" content="'+esc(clean(server.description,160))+'">'+
  '<link rel="canonical" href="'+esc(canonical)+'">'+SHARED_HEAD_SLOT+
  '<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-create-v9">';
 return renderPage({head:header,content:renderProfile({server,votes,rank:meta.rank,stats:meta.stats||null,
  reviews:meta.reviews||[],reviewSummary:meta.reviewSummary||null,cover:image,canEdit:Boolean(meta.canEdit),
  outbound:safeUrl(server.website),gamePath}),
  active:'servers',bodyClass:'swapp-editorial-route swapp-servers-page',
  scripts:'<script src="/assets/swapp-servers-detail.js?v=20261115-server-pro-v7" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}

let lastAutoReview=0,autoReviewRunning=null,autoReviewOffset=0;
async function autoPublishPendingServers({limit=40,getDatabase=db,inviteVerifier=verifyDiscordInvite}={}){
 if(autoReviewRunning)return autoReviewRunning;
 autoReviewRunning=(async()=>{
  const sql=await getDatabase(),batchSize=Math.max(1,Math.min(100,Number(limit)||40));
  const find=offset=>sql.query('SELECT id,game,website,join_address AS joinAddress FROM swapp_game_servers WHERE status="pending" ORDER BY created_at ASC LIMIT '+batchSize+' OFFSET '+offset);
  let [rows]=await find(autoReviewOffset);
  if(!rows.length&&autoReviewOffset){autoReviewOffset=0;[rows]=await find(0)}
  autoReviewOffset=rows.length<batchSize?0:autoReviewOffset+batchSize;
  let approved=0,skipped=0;
  for(const row of rows){
   const game=clean(row.game,70),website=clean(row.website,350),join=clean(row.joinAddress,240);
   if(!validListingDetails({game,website,joinAddress:join})||(website&&!safeUrl(website))||
    (join&&!validJoinAddress(join)&&!(game==='Discord / Multigaming'&&inviteCode(join)))){skipped++;continue}
   if(game==='Discord / Multigaming'){
    const invite=inviteCode(website)?website:inviteCode(join)?join:'';
    if(!invite){skipped++;continue}
    const check=await inviteVerifier(invite);
    if(!check.valid){skipped++;if(check.reason==='discord_rate_limited')break;continue}
    const [updated]=await sql.execute('UPDATE swapp_game_servers SET status="published",website=? WHERE id=? AND status="pending"',[check.inviteUrl,row.id]);
    approved+=Number(updated.affectedRows||0);
   }else{
    const [updated]=await sql.execute('UPDATE swapp_game_servers SET status="published" WHERE id=? AND status="pending"',[row.id]);
    approved+=Number(updated.affectedRows||0);
   }
  }
  return {checked:rows.length,approved,skipped};
 })().finally(()=>{autoReviewRunning=null;lastAutoReview=Date.now()});
 return autoReviewRunning;
}
const autoReviewPendingDiscord=autoPublishPendingServers;

function register(app,{isAdmin=administrator,getDatabase=db,inviteVerifier=verifyDiscordInvite,enableAutoReview=true}={}){
 const isManager=req=>Boolean(isAdmin(req));
 // Recheck older Discord submissions too, without any paid worker or VPS.
 // One batch per instance, repeated while the application is running.
 if(enableAutoReview&&mysqlUrl()&&process.env.SWAPP_SERVERS_AUTO_REVIEW!=='0'){
  const tick=()=>autoPublishPendingServers().catch(e=>console.warn('[SWAPP SERVEURS] Auto-validation:',String(e.message||e).slice(0,120)));
  const initial=setTimeout(tick,1500);initial.unref?.();
  const periodic=setInterval(tick,5*60*1000);periodic.unref?.();
 }


 // Dedicated creation page must precede the generic /serveurs/:jeu route.
 app.get('/serveurs/creer',(req,res)=>{
  const chosen=clean(req.query?.jeu,70);
  const game=GAMES.includes(chosen)?chosen:'Discord / Multigaming';
  return res.set('Cache-Control','no-store').type('html').send(createPage({game,games:GAMES}));
 });
 app.get('/serveurs/discord/creer',(req,res)=>res.redirect(302,'/serveurs/creer?jeu='+encodeURIComponent('Discord / Multigaming')));
 app.get('/serveurs/:jeu/creer',(req,res)=>{
  const game=GAMES.find(g=>slug(g)===req.params.jeu);
  if(!game)return res.status(404).type('text').send('Jeu introuvable');
  return res.set('Cache-Control','no-store').type('html').send(createPage({game,games:GAMES}));
 });
 app.get('/serveurs',(req,res)=>res.set('Cache-Control','no-store').type('html').send(page({isAdmin:isManager(req)})));
 app.get('/serveurs/:jeu',(req,res)=>{const game=GAMES.find(x=>slug(x)===req.params.jeu);if(!game)return res.status(404).type('text').send('Jeu introuvable');return res.set('Cache-Control','no-store').type('html').send(page({isAdmin:isManager(req),game}))});

 app.get('/serveurs/:jeu/:fiche',async(req,res)=>{
  const game=GAMES.find(g=>slug(g)===req.params.jeu);
  const fiche=clean(req.params.fiche,90);
  if(!game||!/^[a-z0-9][a-z0-9-]{4,89}$/.test(fiche))return res.status(404).type('text').send('Serveur introuvable');
  try{
   const sql=await getDatabase();
   const [rows]=await sql.execute('SELECT s.id,s.owner_id,s.name,s.slug,s.game,s.description,s.website,s.join_address,s.region,s.tags,s.banner_url,s.created_at,x.language,x.twitch_url,x.homepage_url,b.logo_url,b.banner_url AS brand_banner_url,b.accent_color,b.secondary_color,b.tagline,b.gallery_json FROM swapp_game_servers s LEFT JOIN swapp_game_server_extras x ON x.server_id=s.id LEFT JOIN swapp_game_server_branding b ON b.server_id=s.id WHERE s.slug=? AND s.game=? AND s.status="published" LIMIT 1',[fiche,game]);
   if(!rows.length)return res.status(404).type('text').send('Serveur introuvable');
   const [voteRows]=await sql.execute('SELECT COUNT(*) AS total FROM swapp_game_server_vote_events WHERE server_id=? AND voted_at>=?',[rows[0].id,new Date().toISOString().slice(0,7)+'-01']);
   const votes=Number(voteRows[0]?.total||0);
   const evidence=await getProfileEvidence(sql,{id:rows[0].id,game,votesMonth:votes});
   return res.set('Cache-Control','no-store').type('html').send(detailPage(rows[0],votes,{...evidence,canEdit:rows[0].owner_id===account(req)&&!!account(req)}));
  }catch(e){console.warn('[SWAPP SERVEURS]',String(e?.message||e).slice(0,90));return res.status(503).type('text').send('Fiche temporairement indisponible')}
 });
 app.get('/api/swapp/serveurs',async(req,res)=>{
  try{
   const sql=await getDatabase();const game=clean(req.query.game,70),q=clean(req.query.q,100).toLowerCase(),sort=req.query.sort==='recent'?'recent':req.query.sort==='name'?'name':'votes';
   const month=String(new Date().toISOString().slice(0,7))+'-01';
   const order=sort==='recent'?'s.created_at DESC':sort==='name'?'s.name ASC':'votes_month DESC,s.created_at DESC';
   const [rows]=await sql.execute('SELECT s.id,s.owner_id,s.slug,s.name,s.game,s.description,s.website,s.join_address AS joinAddress,s.region,s.tags,COALESCE(NULLIF(b.banner_url,""),s.banner_url) AS bannerUrl,b.logo_url AS logoUrl,b.accent_color AS accentColor,b.secondary_color AS secondaryColor,b.tagline,s.created_at AS createdAt,COUNT(v.id) AS votes_month FROM swapp_game_servers s LEFT JOIN swapp_game_server_branding b ON b.server_id=s.id LEFT JOIN swapp_game_server_vote_events v ON v.server_id=s.id AND v.voted_at>=? WHERE s.status="published" AND (?="" OR s.game=?) AND (?="" OR LOWER(CONCAT(s.name," ",s.description," ",s.tags," ",s.game)) LIKE CONCAT("%",?,"%")) GROUP BY s.id ORDER BY '+order+' LIMIT 100',[month,game,game,q,q]);
   const [counts]=await sql.query('SELECT game,COUNT(*) AS count FROM swapp_game_servers WHERE status="published" GROUP BY game');
   const gameCounts=Object.fromEntries(counts.map(item=>[String(item.game),Number(item.count)]));
   res.set('Cache-Control','public,max-age=30').json({servers:rows.map(({owner_id,...r})=>({...r,canEdit:owner_id===account(req)&&!!account(req),votes_month:Number(r.votes_month),tags:r.tags.split(',').map(t=>t.trim()).filter(Boolean)})),total:rows.length,gameCounts,ranking:'monthly_valid_votes',onlineVerified:false});
  }catch(e){fail(res,e)}
 });

 // Create or recover one server with real field validation and an atomic metadata save.
 app.post('/api/swapp/serveurs',require('express').json({limit:'12kb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const owner=account(req);
  if(!owner)return res.status(401).json({error:'connexion_swapp_requise'});
  const body=req.body||{},name=clean(body.name,101),description=clean(body.description,1501),game=clean(body.game,70);
  const website=clean(body.website,351),banner=clean(body.bannerUrl,351),join=clean(body.joinAddress,241),region=clean(body.region||'France',60);
  const language=clean(body.language||'fr',12),twitchRaw=clean(body.twitch||body.twitchUrl,140);
  const twitch=twitchRaw?twitchLink(twitchRaw):'';
  const hasTypes=Array.isArray(body.types);
  const rawTypes=hasTypes?body.types:[];
  const types=readTypes(rawTypes);
  const legacyTags=clean(body.tags,251);
  const tags=hasTypes?types.join(', '):legacyTags;
  const discord=game==='Discord / Multigaming';
  const invite=discord?discordLink(body.discordCode||join||website):'';
  if(name.length<3||name.length>100||description.length<30||description.length>1500||
    !GAMES.includes(game)||!LANGUAGES.some(([code])=>code===language)||
    website.length>350||banner.length>350||join.length>240||tags.length>250||
    (website&&!safeUrl(website))||(banner&&!safeUrl(banner))||
    (twitchRaw&&!twitch)||(hasTypes&&(rawTypes.length>6||types.length!==new Set(rawTypes).size))||
    (!discord&&!validListingDetails({game,website,joinAddress:join}))||
    (!discord&&join&&!validJoinAddress(join)))
   return res.status(422).json({error:'informations_invalides'});
  if(discord&&!invite)return res.status(422).json({error:'invitation_discord_requise'});
  // Discord confirmation is separate from listing-format validation.
  const verification=discord?await inviteVerifier(invite):{valid:true,reason:'listing_format'};
  if(!verification.valid)return res.status(422).json({error:'verification_discord_impossible',reason:verification.reason||'discord_unavailable',retry:true});
  const mainUrl=discord?verification.inviteUrl:website;
  const mainJoin=discord?'':join;
  const homepage=website?website:'';
  const guildId=discord?clean(verification.guildId,25):'';
  let conn;
  try{
   const sql=await getDatabase();
   conn=typeof sql.getConnection==='function'?await sql.getConnection():sql;
   if(typeof conn.beginTransaction==='function')await conn.beginTransaction();
   // Existing pending submissions can be finished without creating a second entry.
   const [existing]=await conn.execute('SELECT id,slug,status FROM swapp_game_servers WHERE owner_id=? AND game=? AND name=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[owner,game,name]);
   if(existing.length&&existing[0].status==='rejected'){
    if(typeof conn.rollback==='function')await conn.rollback();
    return res.status(409).json({error:'inscription_refusee'});
   }
   const [count]=await conn.execute('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE owner_id=?',[owner]);
   if(!existing.length&&Number(count[0]?.n||0)>=5){
    if(typeof conn.rollback==='function')await conn.rollback();
    return res.status(429).json({error:'limite_de_cinq_serveurs'});
   }
   const id=existing.length?existing[0].id:crypto.randomBytes(16).toString('hex');
   const serverSlug=existing.length?existing[0].slug:(slug(name)||'serveur')+'-'+id.slice(0,7);
   if(existing.length){
    const [updated]=await conn.execute('UPDATE swapp_game_servers SET name=?,description=?,website=?,join_address=?,region=?,tags=?,banner_url=?,status="published" WHERE id=? AND owner_id=? AND status IN ("pending","published")',
     [name,description,mainUrl,mainJoin,region,tags,banner,id,owner]);
    if(Number(updated.affectedRows)<0)throw Error('submission_conflict');
   }else{
    await conn.execute('INSERT INTO swapp_game_servers (id,owner_id,name,slug,game,description,website,join_address,region,tags,banner_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,"published")',
     [id,owner,name,serverSlug,game,description,mainUrl,mainJoin,region,tags,banner]);
   }
   await conn.execute('INSERT INTO swapp_game_server_extras (server_id,language,twitch_url,homepage_url,discord_guild_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE language=VALUES(language),twitch_url=VALUES(twitch_url),homepage_url=VALUES(homepage_url),discord_guild_id=VALUES(discord_guild_id)',
    [id,language,twitch,homepage,guildId]);
   const brand=normalizeBranding(body,id);
   if(!brand)throw Error('invalid_branding');
   await saveBranding(conn,id,brand);
   if(typeof conn.commit==='function')await conn.commit();
   return res.status(existing.length?200:201).json({status:'published',updated:Boolean(existing.length),slug:serverSlug,autoVerified:discord,
    verification:discord?'discord_invite':'listing_format',onlineVerified:false,
    id,url:'/serveurs/'+slug(game)+'/'+serverSlug});
  }catch(e){
   if(typeof conn?.rollback==='function')await conn.rollback().catch(()=>{});
   return fail(res,e);
  }finally{
   if(typeof conn?.release==='function')conn.release();
  }
 });

 // Private owner editor: neither knowing a slug nor being a SWAPP admin grants editing rights.
 app.get('/serveurs/gerer/:slug',async(req,res)=>{
  const user=account(req),name=clean(req.params.slug,90);
  if(!user)return res.redirect(302,'/compte');
  if(!/^[a-z0-9][a-z0-9-]{4,89}$/.test(name))return res.status(404).type('text').send('Fiche introuvable');
  try{
   const sql=await getDatabase();
   const [rows]=await sql.execute('SELECT s.id,s.slug,s.name,s.game,s.description,s.website,s.join_address AS joinAddress,s.region,s.tags,s.banner_url AS bannerUrl,x.language,x.twitch_url AS twitchUrl,x.homepage_url AS homepageUrl,b.logo_url AS logoUrl,b.banner_url AS brandBannerUrl,b.accent_color AS accentColor,b.secondary_color AS secondaryColor,b.tagline,b.gallery_json AS galleryJson FROM swapp_game_servers s LEFT JOIN swapp_game_server_extras x ON x.server_id=s.id LEFT JOIN swapp_game_server_branding b ON b.server_id=s.id WHERE s.slug=? AND s.owner_id=? AND s.status="published" LIMIT 1',[name,user]);
   if(!rows.length)return res.status(404).type('text').send('Fiche introuvable');
   return res.set('Cache-Control','private,no-store').type('html').send(createPage({game:rows[0].game,games:GAMES,edit:rows[0]}));
  }catch(e){return res.status(503).type('text').send('Éditeur temporairement indisponible')}
 });
 app.put('/api/swapp/serveurs/:id',require('express').json({limit:'16kb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req),id=clean(req.params.id,32);
  if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  if(!/^[a-f0-9]{32}$/.test(id))return res.status(422).json({error:'serveur_invalide'});
  const data=req.body||{},name=clean(data.name,101),description=clean(data.description,1501);
  const game=clean(data.game,70),website=clean(data.website,351),join=clean(data.joinAddress,241),region=clean(data.region||'France',60);
  const language=clean(data.language||'fr',12),twitchRaw=clean(data.twitch||data.twitchUrl,140),twitch=twitchRaw?twitchLink(twitchRaw):'';
  const rawTypes=Array.isArray(data.types)?data.types:[],types=readTypes(rawTypes);
  const tags=rawTypes.length?types.join(', '):clean(data.tags,251);
  const brand=normalizeBranding(data,id);
  if(!brand||name.length<3||name.length>100||description.length<30||description.length>1500||
    !GAMES.includes(game)||!LANGUAGES.some(([code])=>code===language)||
    website.length>350||join.length>240||tags.length>250|| (website&&!safeUrl(website))||
    (twitchRaw&&!twitch)||rawTypes.length>6||types.length!==new Set(rawTypes).size)
   return res.status(422).json({error:'informations_invalides'});
  let conn;
  try{
   const sql=await getDatabase();conn=await sql.getConnection();
   await conn.beginTransaction();
   const [owned]=await conn.execute('SELECT id,slug,game,website,join_address FROM swapp_game_servers WHERE id=? AND owner_id=? AND status="published" LIMIT 1 FOR UPDATE',[id,user]);
   if(!owned.length){await conn.rollback();return res.status(404).json({error:'serveur_introuvable'})}
   if(game!==owned[0].game){await conn.rollback();return res.status(422).json({error:'jeu_non_modifiable'})}
   const discord=game==='Discord / Multigaming';
   const invite=discord?discordLink(data.discordCode||owned[0].website):'';
   if(discord&&!invite){await conn.rollback();return res.status(422).json({error:'invitation_discord_requise'})}
   if(!discord&&(!validListingDetails({game,website,joinAddress:join})||(join&&!validJoinAddress(join)))){
    await conn.rollback();return res.status(422).json({error:'informations_invalides'})
   }
   const check=discord?await inviteVerifier(invite):{valid:true};
   if(!check.valid){await conn.rollback();return res.status(422).json({error:'verification_discord_impossible',retry:true})}
   const banner=brand.banner||clean(data.bannerUrl,350);
   await conn.execute('UPDATE swapp_game_servers SET name=?,description=?,website=?,join_address=?,region=?,tags=?,banner_url=? WHERE id=? AND owner_id=?',
    [name,description,discord?check.inviteUrl:website,discord?'':join,region,tags,banner,id,user]);
   await conn.execute('INSERT INTO swapp_game_server_extras (server_id,language,twitch_url,homepage_url,discord_guild_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE language=VALUES(language),twitch_url=VALUES(twitch_url),homepage_url=VALUES(homepage_url),discord_guild_id=VALUES(discord_guild_id)',
    [id,language,twitch,website,discord?clean(check.guildId,25):'']);
   await saveBranding(conn,id,brand);
   await conn.commit();
   return res.set('Cache-Control','no-store').json({updated:true,status:'published',id,url:'/serveurs/'+slug(game)+'/'+owned[0].slug});
  }catch(e){if(conn)await conn.rollback().catch(()=>{});return fail(res,e)}
  finally{conn?.release?.()}
 });
 // Images persist in the same MySQL database, so a Hostinger deployment cannot discard uploaded branding.
 const sniffImage=bytes=>{
  if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>2*1024*1024)return '';
  if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return '';
 };
 app.put('/api/swapp/serveurs/:id/media/:kind',require('express').raw({type:['image/png','image/jpeg','image/webp'],limit:'2mb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req),id=clean(req.params.id,32),kind=clean(req.params.kind,10);
  if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  if(!/^[a-f0-9]{32}$/.test(id)||!['logo','banner'].includes(kind))return res.status(422).json({error:'media_invalide'});
  const mime=sniffImage(req.body);
  if(!mime)return res.status(415).json({error:'image_non_supportee',maxBytes:2*1024*1024});
  let conn;
  try{
   const sql=await getDatabase();conn=await sql.getConnection();await conn.beginTransaction();
   const [owned]=await conn.execute('SELECT id FROM swapp_game_servers WHERE id=? AND owner_id=? AND status="published" LIMIT 1 FOR UPDATE',[id,user]);
   if(!owned.length){await conn.rollback();return res.status(404).json({error:'serveur_introuvable'})}
   await conn.execute('INSERT INTO swapp_game_server_media (server_id,kind,mime,contents) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE mime=VALUES(mime),contents=VALUES(contents),updated_at=CURRENT_TIMESTAMP(3)',[id,kind,mime,req.body]);
   const field=kind==='logo'?'logo_url':'banner_url',url=publicMediaUrl(id,kind),baseline=normalizeBranding({},id);
   await conn.execute('INSERT INTO swapp_game_server_branding (server_id,logo_url,banner_url,accent_color,secondary_color,tagline,gallery_json) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE '+field+'=VALUES('+field+')',[id,kind==='logo'?url:'',kind==='banner'?url:'',baseline.accent,baseline.secondary,'','[]']);
   await conn.commit();return res.json({url,mime});
  }catch(e){if(conn)await conn.rollback().catch(()=>{});return fail(res,e)}
  finally{conn?.release?.()}
 });
 app.get('/media/serveurs/:id/:kind',async(req,res)=>{
  const id=clean(req.params.id,32),kind=clean(req.params.kind,10);
  if(!/^[a-f0-9]{32}$/.test(id)||!['logo','banner'].includes(kind))return res.sendStatus(404);
  try{
   const sql=await getDatabase();
   const [rows]=await sql.execute('SELECT m.contents,m.mime FROM swapp_game_server_media m INNER JOIN swapp_game_servers s ON s.id=m.server_id WHERE m.server_id=? AND m.kind=? AND s.status="published" LIMIT 1',[id,kind]);
   if(!rows.length)return res.sendStatus(404);
   return res.set({'Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}).type(rows[0].mime).send(rows[0].contents);
  }catch(e){return res.sendStatus(503)}
 });

 app.post('/api/swapp/serveurs/:id/vote',async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  const id=clean(req.params.id,32);if(!/^[a-f0-9]{32}$/.test(id))return res.status(400).json({error:'serveur_invalide'});
  try{
   const sql=await getDatabase(),conn=await sql.getConnection();
   try{
    await conn.beginTransaction();
    const [servers]=await conn.execute('SELECT id FROM swapp_game_servers WHERE id=? AND status="published" LIMIT 1 FOR UPDATE',[id]);if(!servers.length){await conn.rollback();return res.status(404).json({error:'serveur_introuvable'})}
    const [previous]=await conn.execute('SELECT voted_at FROM swapp_game_server_votes WHERE server_id=? AND user_id=? FOR UPDATE',[id,user]);
    if(previous.length&&Date.now()-new Date(previous[0].voted_at).getTime()<7200000){await conn.rollback();return res.status(429).json({error:'vote_deja_effectue',nextVoteAt:new Date(new Date(previous[0].voted_at).getTime()+7200000).toISOString()})}
    await conn.execute('INSERT INTO swapp_game_server_votes (server_id,user_id,voted_at) VALUES (?,?,NOW(3)) ON DUPLICATE KEY UPDATE voted_at=NOW(3)',[id,user]);
    await conn.execute('INSERT INTO swapp_game_server_vote_events (server_id,user_id,voted_at) VALUES (?,?,NOW(3))',[id,user]);await conn.commit();
    return res.json({success:true,intervalHours:2});
   }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
  }catch(e){fail(res,e)}
 });
 // Account-owned submissions are always visible even before moderation.

 // Visits count only intentional clicks on published links; no user data is persisted.
 const clickThrottle=new Map();
 const clickSalt=crypto.randomBytes(16).toString('hex');
 app.post('/api/swapp/serveurs/:id/visit',async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const id=clean(req.params.id,32);
  if(!/^[a-f0-9]{32}$/.test(id))return res.status(400).json({error:'serveur_invalide'});
  const visitor=crypto.createHash('sha256').update(clickSalt+id+String(req.session?.oryonUser?.id||req.ip||'inconnu')).digest('hex');
  const now=Date.now();
  if(clickThrottle.size>3000){for(const [key,time] of clickThrottle){if(now-time>180000)clickThrottle.delete(key)}}
  if(clickThrottle.has(visitor)&&now-clickThrottle.get(visitor)<30000)return res.json({recorded:false});
  try{
   const sql=await getDatabase();
   const [found]=await sql.execute('SELECT id,website FROM swapp_game_servers WHERE id=? AND status="published" LIMIT 1',[id]);
   if(!found.length||!safeUrl(found[0].website))return res.status(404).json({error:'serveur_introuvable'});
   await sql.execute('INSERT INTO swapp_game_server_click_events (server_id) VALUES (?)',[id]);
   clickThrottle.set(visitor,now);
   return res.json({recorded:true});
  }catch(e){return fail(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/reviews',require('express').json({limit:'5kb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  const id=clean(req.params.id,32);if(!/^[a-f0-9]{32}$/.test(id))return res.status(400).json({error:'serveur_invalide'});
  const staff=Number(req.body?.staff),atmosphere=Number(req.body?.atmosphere),availability=Number(req.body?.availability);
  const comment=clean(req.body?.comment,1201);
  if([staff,atmosphere,availability].some(x=>!Number.isInteger(x)||x<1||x>5)||comment.length<40||comment.length>1200)
   return res.status(422).json({error:'avis_invalide'});
  try{
   const sql=await getDatabase();
   const [rows]=await sql.execute('SELECT id FROM swapp_game_servers WHERE id=? AND status="published" LIMIT 1',[id]);
   if(!rows.length)return res.status(404).json({error:'serveur_introuvable'});
   const reviewId=crypto.randomBytes(16).toString('hex');
   try{
    await sql.execute('INSERT INTO swapp_game_server_reviews (id,server_id,user_id,staff,atmosphere,availability,comment,status) VALUES (?,?,?,?,?,?,?,"pending")',[reviewId,id,user,staff,atmosphere,availability,comment]);
   }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'avis_deja_depose'});throw e}
   return res.status(201).json({status:'pending',moderation:true});
  }catch(e){return fail(res,e)}
 });
 app.get('/api/swapp/serveurs/reviews/moderation',async(req,res)=>{
  if(!isManager(req))return res.status(403).json({error:'acces_refuse'});
  try{
   const sql=await getDatabase();
   const [rows]=await sql.query('SELECT r.id,r.staff,r.atmosphere,r.availability,r.comment,r.created_at AS createdAt,s.name AS serverName,s.game FROM swapp_game_server_reviews r JOIN swapp_game_servers s ON s.id=r.server_id WHERE r.status="pending" ORDER BY r.created_at ASC LIMIT 100');
   return res.set('Cache-Control','no-store').json({reviews:rows});
  }catch(e){return fail(res,e)}
 });
 app.post('/api/swapp/serveurs/reviews/:id/moderation',require('express').json({limit:'2kb'}),async(req,res)=>{
  if(!originGuard(req)||!isManager(req))return res.status(403).json({error:'acces_refuse'});
  const id=clean(req.params.id,32),decision=clean(req.body?.status,16);
  if(!/^[a-f0-9]{32}$/.test(id)||!['published','rejected'].includes(decision))
   return res.status(422).json({error:'decision_invalide'});
  try{
   const sql=await getDatabase();
   const [row]=await sql.execute('UPDATE swapp_game_server_reviews SET status=? WHERE id=? AND status="pending"',[decision,id]);
   return res.json({updated:row.affectedRows===1});
  }catch(e){return fail(res,e)}
 });

 app.get('/api/swapp/serveurs/mes-fiches',async(req,res)=>{
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  try{const sql=await getDatabase(),[rows]=await sql.execute('SELECT name,game,slug,status,created_at AS createdAt FROM swapp_game_servers WHERE owner_id=? ORDER BY created_at DESC LIMIT 30',[user]);
   return res.set('Cache-Control','no-store').json({servers:rows})}catch(e){return fail(res,e)}
 });
 app.get('/api/swapp/serveurs/moderation/count',async(req,res)=>{
  if(!isManager(req))return res.status(403).json({error:'acces_refuse'});
  try{
   const sql=await getDatabase();
   const [[servers],[reviews]]=await Promise.all([
    sql.query('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE status="pending"'),
    sql.query('SELECT COUNT(*) AS n FROM swapp_game_server_reviews WHERE status="pending"')
   ]);
   const serversPending=Number(servers[0]?.n||0),reviewsPending=Number(reviews[0]?.n||0);
   res.set('Cache-Control','no-store').json({pending:serversPending+reviewsPending,serversPending,reviewsPending,url:'/serveurs#ss-review'});
  }catch(e){fail(res,e)}
 });
 app.get('/api/swapp/serveurs/moderation',async(req,res)=>{
  if(!isManager(req))return res.status(403).json({error:'acces_refuse'});
  try{const sql=await getDatabase(),[rows]=await sql.query('SELECT id,name,game,description,website,join_address AS joinAddress,created_at AS createdAt FROM swapp_game_servers WHERE status="pending" ORDER BY created_at ASC LIMIT 100');res.json({servers:rows})}catch(e){fail(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/moderation',require('express').json({limit:'2kb'}),async(req,res)=>{
  if(!originGuard(req)||!isManager(req))return res.status(403).json({error:'acces_refuse'});
  const id=clean(req.params.id,32),status=clean(req.body?.status,20);if(!/^[a-f0-9]{32}$/.test(id)||!['published','rejected'].includes(status))return res.status(422).json({error:'decision_invalide'});
  try{const sql=await getDatabase(),[r]=await sql.execute('UPDATE swapp_game_servers SET status=? WHERE id=? AND status="pending"',[status,id]);res.json({updated:r.affectedRows===1})}catch(e){fail(res,e)}
 });
}
module.exports={register,page,detailPage,GAMES,slug,safeUrl,validJoinAddress,validListingDetails,autoReviewPendingDiscord,autoPublishPendingServers};
