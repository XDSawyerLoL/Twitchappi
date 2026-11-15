'use strict';
/* SWAPP Serveurs — native, free directory. No scraping or imported listings. */
const crypto=require('node:crypto');
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const {inviteCode,verifyDiscordInvite}=require('./swapp-servers-discord');
const {renderProfile}=require('./swapp-servers-profile');
const {getProfileEvidence}=require('./swapp-servers-stats');
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
 return websiteOk||joinOk;
}

function originGuard(req){const expected=['https://swapp.tv','https://www.swapp.tv'];const own=process.env.APP_BASE_URL; if(own)try{expected.push(new URL(own).origin)}catch{};const origin=req.get('origin');return !!origin&&expected.includes(origin)}
function account(req){return clean(req.session?.oryonUser?.id||'',80)}
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
 })().catch(e=>{ready=null;throw e});}
 await ready;return pool;
}
function page({isAdmin=false,game=''}={}){
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050608"><title>'+esc(game?'Serveurs '+game+' — classement des communautés | SWAPP':'Serveurs de jeux — classements et communautés | SWAPP')+'</title><meta name="description" content="Découvre des serveurs gaming et roleplay, classe les communautés par votes et référence ton serveur sur SWAPP."><link rel="canonical" href="https://swapp.tv/serveurs'+(game?'/'+slug(game):'')+'">'+SHARED_HEAD_SLOT+'<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-server-pro-v7">';
 let content='<main class="ss" data-ss-current-game="'+esc(game)+'"><header class="ss-hero"><div class="ss-inner"><p class="ss-overline">SWAPP / EXPLORER / SERVEURS</p><h1>'+ (game?'Serveurs <em>'+esc(game)+'</em>':'Trouve ta prochaine <em>communauté.</em>')+'</h1><p>Serveurs de jeux et RP, choisis par les joueurs. Des votes réels, un référencement gratuit, aucun classement inventé.</p><div class="ss-hero-actions"><a href="/explorer">← Explorer</a><button id="ss-add" type="button">+ Référencer mon serveur</button></div></div></header><section class="ss-inner ss-content"><section class="ss-owned" id="ss-owned" hidden><div class="ss-owned-head"><h2>Mes serveurs</h2><span>Suivi de tes inscriptions SWAPP</span></div><div id="ss-owned-list"></div></section><div class="ss-toolbar"><label class="ss-search"><span>Rechercher</span><input id="ss-q" type="search" placeholder="Nom, jeu, RP, survie…"></label><label><span>Jeu</span><select id="ss-game"><option value="">Tous les jeux</option>'+GAMES.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label><label><span>Classement</span><select id="ss-sort"><option value="votes">Votes du mois</option><option value="recent">Plus récents</option><option value="name">Nom</option></select></label></div><section class="ss-featured" aria-labelledby="ss-featured-title"><div class="ss-games-heading"><p class="ss-overline">À LA UNE</p><h2 id="ss-featured-title">Les univers populaires</h2><p>Des jeux authentiques. Le classement des serveurs dépend uniquement des inscriptions vérifiées par SWAPP.</p></div><div id="ss-featured-games" class="ss-featured-grid" aria-label="Univers de serveurs recommandés"></div></section><section class="ss-games" aria-labelledby="ss-games-title"><div class="ss-games-heading"><p class="ss-overline">CHOISIS TON UNIVERS</p><h2 id="ss-games-title">Explorer par jeu</h2></div><label class="ss-find-game"><span>Filtrer les jeux</span><input id="ss-game-search" type="search" autocomplete="off" placeholder="Minecraft, GTA RP, Rust, DayZ…"></label><div class="ss-game-grid"><a href="/serveurs" data-ss-game="" class="ss-game-tile is-selected"><span class="ss-game-art"><span class="ss-game-fallback">SWAPP</span></span><span class="ss-game-copy"><strong>Tous les serveurs</strong><small data-ss-game-count="">Classement SWAPP</small></span></a>'+GAMES.map(g=>'<a href="/serveurs/'+slug(g)+'" data-ss-game="'+esc(g)+'" class="ss-game-tile"><span class="ss-game-art"><span class="ss-game-fallback">'+esc(g)+'</span></span><span class="ss-game-copy"><strong>'+esc(g)+'</strong><small data-ss-game-count="'+esc(g)+'">Classement SWAPP</small></span></a>').join('')+'</div></section><div class="ss-title"><div><p class="ss-overline">ANNUAIRE COMMUNAUTAIRE</p><h2>Classement des serveurs</h2></div><span id="ss-count">Chargement…</span></div><div id="ss-feedback" role="status" aria-live="polite"></div><div id="ss-results" class="ss-results"></div><section class="ss-info"><h2>Comment fonctionne le classement ?</h2><p>Les serveurs approuvés sont affichés par nombre de votes admissibles reçus pendant le mois en cours. Les serveurs Discord sont publiés automatiquement si leur invitation est confirmée par Discord. Les autres inscriptions restent soumises à vérification. Un compte SWAPP peut renouveler son vote pour un même serveur toutes les deux heures. Les statuts de connexion ne sont affichés que s’ils ont réellement été vérifiés. Les fiches qui ne peuvent pas être vérifiées automatiquement sont examinées par la modération.</p></section>'+(isAdmin?'<section class="ss-admin"><h2>Validation des serveurs</h2><p>Modération des propositions reçues sur SWAPP.</p><button id="ss-review-refresh" type="button">Actualiser les demandes</button><div id="ss-review" role="status"></div><div id="ss-review-moderation"><h3>Avis à examiner</h3><div id="ss-pending-reviews" role="status" aria-live="polite"></div></div></section>':'')+'</section><dialog id="ss-dialog" class="ss-dialog"><form id="ss-form"><h2>Référencer un serveur</h2><p>Gratuit. Compte SWAPP requis. Publication après validation.</p><label>Nom du serveur<input name="name" maxlength="100" minlength="3" required></label><label>Jeu<select name="game" required>'+GAMES.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label><label>Description<textarea name="description" minlength="30" maxlength="1500" required rows="4"></textarea></label><label>Site ou lien d’invitation HTTPS<input name="website" type="url" maxlength="350" placeholder="https://…"></label><label>Adresse de connexion (facultative)<input name="joinAddress" maxlength="240" placeholder="exemple.fr:25565"></label><label>Région<input name="region" maxlength="60" value="France"></label><label>Tags (séparés par virgule)<input name="tags" maxlength="250" placeholder="RP, survie, PVE"></label><label>Bannière officielle HTTPS (facultative)<input name="bannerUrl" type="url" maxlength="350"></label><div class="ss-form-actions"><button type="button" id="ss-cancel">Annuler</button><button type="submit">Soumettre le serveur</button></div><p id="ss-form-status" role="status" aria-live="polite"></p></form></dialog></main>';
 if(isAdmin){
  // The queue belongs directly under the heading; never hide it after all the listings.
  const start=content.indexOf('<section class="ss-admin">');
  const end=content.indexOf('</section>',start);
  if(start>=0&&end>start){const panel=content.slice(start,end+10);content=content.replace(panel,'').replace('<section class="ss-inner ss-content">','<section class="ss-inner ss-content">'+panel)}
 }
 return renderPage({head,content,active:'servers',bodyClass:'swapp-editorial-route swapp-servers-page',scripts:'<script src="/assets/swapp-servers.js?v=20261115-server-pro-v7" defer></script><script src="/assets/swapp-servers-review-admin.js?v=20261115-server-pro-v6" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
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
 const image=safeUrl(server.banner_url)||detailCover(game);
 const canonical='https://swapp.tv'+gamePath+'/'+encodeURIComponent(server.slug);
 const header='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#030405">'+
  '<title>'+esc(title)+' — '+esc(game)+' | Serveurs SWAPP</title>'+
  '<meta name="description" content="'+esc(clean(server.description,160))+'">'+
  '<link rel="canonical" href="'+esc(canonical)+'">'+SHARED_HEAD_SLOT+
  '<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-server-pro-v7">';
 return renderPage({head:header,content:renderProfile({server,votes,rank:meta.rank,stats:meta.stats||null,
  reviews:meta.reviews||[],reviewSummary:meta.reviewSummary||null,cover:image,
  outbound:safeUrl(server.website),gamePath}),
  active:'servers',bodyClass:'swapp-editorial-route swapp-servers-page',
  scripts:'<script src="/assets/swapp-servers-detail.js?v=20261115-server-pro-v7" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}

let lastAutoReview=0,autoReviewRunning=null,autoReviewOffset=0;
async function autoReviewPendingDiscord({limit=12,getDatabase=db,inviteVerifier=verifyDiscordInvite}={}){
 if(autoReviewRunning)return autoReviewRunning;
 autoReviewRunning=(async()=>{
  const sql=await getDatabase();
  const batchSize=Math.max(1,Math.min(25,Number(limit)||12));
  let [rows]=await sql.query('SELECT id,website,join_address AS joinAddress FROM swapp_game_servers WHERE status="pending" AND game="Discord / Multigaming" ORDER BY created_at ASC LIMIT '+batchSize+' OFFSET '+autoReviewOffset);
  if(!rows.length&&autoReviewOffset){autoReviewOffset=0;[rows]=await sql.query('SELECT id,website,join_address AS joinAddress FROM swapp_game_servers WHERE status="pending" AND game="Discord / Multigaming" ORDER BY created_at ASC LIMIT '+batchSize)}
  autoReviewOffset=rows.length<batchSize?0:autoReviewOffset+batchSize;
  let approved=0;
  for(const row of rows){
   const proposed=inviteCode(row.website)?row.website:inviteCode(row.joinAddress)?row.joinAddress:'';
   if(!proposed)continue;
   const check=await inviteVerifier(proposed);
   if(!check.valid){if(check.reason==='discord_rate_limited')break;continue;}
   const [write]=await sql.execute('UPDATE swapp_game_servers SET status="published",website=? WHERE id=? AND status="pending"',[check.inviteUrl,row.id]);
   approved+=Number(write.affectedRows||0);
  }
  return {checked:rows.length,approved};
 })().finally(()=>{autoReviewRunning=null;lastAutoReview=Date.now()});
 return autoReviewRunning;
}
function register(app,{isAdmin=administrator,getDatabase=db,inviteVerifier=verifyDiscordInvite,enableAutoReview=true}={}){
 const isManager=req=>Boolean(isAdmin(req));
 // Recheck older Discord submissions too, without any paid worker or VPS.
 // One batch per instance, repeated while the application is running.
 if(enableAutoReview&&mysqlUrl()&&process.env.SWAPP_SERVERS_AUTO_REVIEW!=='0'){
  const tick=()=>autoReviewPendingDiscord().catch(e=>console.warn('[SWAPP SERVEURS] Auto-validation:',String(e.message||e).slice(0,120)));
  const initial=setTimeout(tick,10000);initial.unref?.();
  const periodic=setInterval(tick,5*60*1000);periodic.unref?.();
 }

 app.get('/serveurs',(req,res)=>res.set('Cache-Control','no-store').type('html').send(page({isAdmin:isManager(req)})));
 app.get('/serveurs/:jeu',(req,res)=>{const game=GAMES.find(x=>slug(x)===req.params.jeu);if(!game)return res.status(404).type('text').send('Jeu introuvable');return res.set('Cache-Control','no-store').type('html').send(page({isAdmin:isManager(req),game}))});

 app.get('/serveurs/:jeu/:fiche',async(req,res)=>{
  const game=GAMES.find(g=>slug(g)===req.params.jeu);
  const fiche=clean(req.params.fiche,90);
  if(!game||!/^[a-z0-9][a-z0-9-]{4,89}$/.test(fiche))return res.status(404).type('text').send('Serveur introuvable');
  try{
   const sql=await getDatabase();
   const [rows]=await sql.execute('SELECT id,name,slug,game,description,website,join_address,region,tags,banner_url,created_at FROM swapp_game_servers WHERE slug=? AND game=? AND status="published" LIMIT 1',[fiche,game]);
   if(!rows.length)return res.status(404).type('text').send('Serveur introuvable');
   const [voteRows]=await sql.execute('SELECT COUNT(*) AS total FROM swapp_game_server_vote_events WHERE server_id=? AND voted_at>=?',[rows[0].id,new Date().toISOString().slice(0,7)+'-01']);
   const votes=Number(voteRows[0]?.total||0);
   const evidence=await getProfileEvidence(sql,{id:rows[0].id,game,votesMonth:votes});
   return res.set('Cache-Control','no-store').type('html').send(detailPage(rows[0],votes,evidence));
  }catch(e){console.warn('[SWAPP SERVEURS]',String(e?.message||e).slice(0,90));return res.status(503).type('text').send('Fiche temporairement indisponible')}
 });
 app.get('/api/swapp/serveurs',async(req,res)=>{
  try{
   const sql=await getDatabase();const game=clean(req.query.game,70),q=clean(req.query.q,100).toLowerCase(),sort=req.query.sort==='recent'?'recent':req.query.sort==='name'?'name':'votes';
   const month=String(new Date().toISOString().slice(0,7))+'-01';
   const order=sort==='recent'?'s.created_at DESC':sort==='name'?'s.name ASC':'votes_month DESC,s.created_at DESC';
   const [rows]=await sql.execute('SELECT s.id,s.slug,s.name,s.game,s.description,s.website,s.join_address AS joinAddress,s.region,s.tags,s.banner_url AS bannerUrl,s.created_at AS createdAt,COUNT(v.id) AS votes_month FROM swapp_game_servers s LEFT JOIN swapp_game_server_vote_events v ON v.server_id=s.id AND v.voted_at>=? WHERE s.status="published" AND (?="" OR s.game=?) AND (?="" OR LOWER(CONCAT(s.name," ",s.description," ",s.tags," ",s.game)) LIKE CONCAT("%",?,"%")) GROUP BY s.id ORDER BY '+order+' LIMIT 100',[month,game,game,q,q]);
   const [counts]=await sql.query('SELECT game,COUNT(*) AS count FROM swapp_game_servers WHERE status="published" GROUP BY game');
   const gameCounts=Object.fromEntries(counts.map(item=>[String(item.game),Number(item.count)]));
   res.set('Cache-Control','public,max-age=30').json({servers:rows.map(r=>({...r,votes_month:Number(r.votes_month),tags:r.tags.split(',').map(t=>t.trim()).filter(Boolean)})),total:rows.length,gameCounts,ranking:'monthly_valid_votes',onlineVerified:false});
  }catch(e){fail(res,e)}
 });
 app.post('/api/swapp/serveurs',require('express').json({limit:'12kb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  const input=req.body||{},name=clean(input.name,100),game=clean(input.game,70),description=clean(input.description,1500);
  const website=clean(input.website,350),banner=clean(input.bannerUrl,350),join=clean(input.joinAddress,240),region=clean(input.region||'France',60),tags=clean(input.tags,250);
  if(name.length<3||description.length<30||!validListingDetails({game,website,joinAddress:join})||(website&&!safeUrl(website))||(join&&!validJoinAddress(join)&&!inviteCode(join))||(banner&&!safeUrl(banner)))return res.status(422).json({error:'informations_invalides'});
  try{
   const sql=await getDatabase();const [count]=await sql.execute('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE owner_id=?',[user]);if(count[0].n>=5)return res.status(429).json({error:'limite_de_cinq_serveurs'});
   const id=crypto.randomBytes(16).toString('hex'),serverSlug=(slug(name)||'serveur')+'-'+id.slice(0,7);
   // No manual queue for valid game listings. Discord invitations must additionally
   // be confirmed by Discord; an unavailable verification is a retryable error.
   const discord=game==='Discord / Multigaming';
   const proposed=discord?(inviteCode(website)?website:inviteCode(join)?join:''):'';
   if(discord&&!proposed)return res.status(422).json({error:'invitation_discord_requise'});
   const verification=discord?await inviteVerifier(proposed):{valid:true,reason:'listing_format'};
   if(!verification.valid)return res.status(422).json({error:'verification_discord_impossible',reason:verification.reason||'discord_unavailable',retry:true});
   const resolvedWebsite=discord?verification.inviteUrl:website;
   await sql.execute('INSERT INTO swapp_game_servers (id,owner_id,name,slug,game,description,website,join_address,region,tags,banner_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,"published")',[id,user,name,serverSlug,game,description,resolvedWebsite,join,region,tags,banner]);
   return res.status(201).json({status:'published',slug:serverSlug,autoVerified:discord,verification:discord?'discord_invite':'listing_format',
    onlineVerified:false,url:'/serveurs/'+slug(game)+'/'+serverSlug});
  }catch(e){fail(res,e)}
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
module.exports={register,page,detailPage,GAMES,slug,safeUrl,autoReviewPendingDiscord};
