'use strict';
/* SWAPP Serveurs — native, free directory. No scraping or imported listings. */
const crypto=require('node:crypto');
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const GAMES=['Minecraft','GTA V / FiveM','GTA RP','Rust','DayZ','Cyberpunk 2077','Arma 3','Arma Reforger','ARK Survival Ascended','Project Zomboid','Palworld','Red Dead Redemption 2','Garry’s Mod','Valheim','Enshrouded','Conan Exiles','Discord / Multigaming','Autre'];
const mysqlUrl=()=>process.env.SWAPP_SERVERS_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'';
let pool=null,ready=null;
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>clean(s,100).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75);
function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1'].includes(u.hostname)?u.href:''}catch{return ''}}
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
 })().catch(e=>{ready=null;throw e});}
 await ready;return pool;
}
function page(){
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050608"><title>Serveurs de jeux — classements et communautés | SWAPP</title><meta name="description" content="Découvre des serveurs gaming et roleplay, classe les communautés par votes et référence ton serveur sur SWAPP."><link rel="canonical" href="https://swapp.tv/serveurs">'+SHARED_HEAD_SLOT+'<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-directory-v1">';
 const content='<main class="ss"><header class="ss-hero"><div class="ss-inner"><p class="ss-overline">SWAPP / EXPLORER / SERVEURS</p><h1>Trouve ta prochaine <em>communauté.</em></h1><p>Serveurs de jeux et RP, choisis par les joueurs. Des votes réels, un référencement gratuit, aucun classement inventé.</p><div class="ss-hero-actions"><a href="/explorer">← Explorer</a><button id="ss-add" type="button">+ Référencer mon serveur</button></div></div></header><section class="ss-inner ss-content"><div class="ss-toolbar"><label class="ss-search"><span>Rechercher</span><input id="ss-q" type="search" placeholder="Nom, jeu, RP, survie…"></label><label><span>Jeu</span><select id="ss-game"><option value="">Tous les jeux</option>'+GAMES.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label><label><span>Classement</span><select id="ss-sort"><option value="votes">Votes du mois</option><option value="recent">Plus récents</option><option value="name">Nom</option></select></label></div><div class="ss-title"><div><p class="ss-overline">ANNUAIRE COMMUNAUTAIRE</p><h2>Classement des serveurs</h2></div><span id="ss-count">Chargement…</span></div><div id="ss-feedback" role="status" aria-live="polite"></div><div id="ss-results" class="ss-results"></div><section class="ss-info"><h2>Comment fonctionne le classement ?</h2><p>Les serveurs approuvés sont affichés par nombre de votes uniques reçus pendant le mois en cours. Un compte SWAPP peut renouveler son vote pour un même serveur toutes les deux heures. Les statuts de connexion ne sont affichés que s'ils ont réellement été vérifiés. Les nouvelles fiches passent par une validation avant d’apparaître.</p></section></section><dialog id="ss-dialog" class="ss-dialog"><form id="ss-form"><h2>Référencer un serveur</h2><p>Gratuit. Compte SWAPP requis. Publication après validation.</p><label>Nom du serveur<input name="name" maxlength="100" minlength="3" required></label><label>Jeu<select name="game" required>'+GAMES.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label><label>Description<textarea name="description" minlength="30" maxlength="1500" required rows="4"></textarea></label><label>Site ou lien d'invitation HTTPS<input name="website" type="url" maxlength="350" placeholder="https://…"></label><label>Adresse de connexion (facultative)<input name="joinAddress" maxlength="240" placeholder="exemple.fr:25565"></label><label>Région<input name="region" maxlength="60" value="France"></label><label>Tags (séparés par virgule)<input name="tags" maxlength="250" placeholder="RP, survie, PVE"></label><label>Bannière officielle HTTPS (facultative)<input name="bannerUrl" type="url" maxlength="350"></label><div class="ss-form-actions"><button type="button" id="ss-cancel">Annuler</button><button type="submit">Soumettre le serveur</button></div><p id="ss-form-status" role="status" aria-live="polite"></p></form></dialog></main>';
 return renderPage({head,content,active:'explorer',bodyClass:'swapp-editorial-route swapp-servers-page',scripts:'<script src="/assets/swapp-servers.js?v=20261115-directory-v1" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}
function register(app){
 app.get('/serveurs',(req,res)=>res.set('Cache-Control','no-store').type('html').send(page()));
 app.get('/api/swapp/serveurs',async(req,res)=>{
  try{
   const sql=await db();const game=clean(req.query.game,70),q=clean(req.query.q,100).toLowerCase(),sort=req.query.sort==='recent'?'recent':req.query.sort==='name'?'name':'votes';
   const month=String(new Date().toISOString().slice(0,7))+'-01';
   const order=sort==='recent'?'s.created_at DESC':sort==='name'?'s.name ASC':'votes_month DESC,s.created_at DESC';
   const [rows]=await sql.execute('SELECT s.id,s.slug,s.name,s.game,s.description,s.website,s.join_address AS joinAddress,s.region,s.tags,s.banner_url AS bannerUrl,s.created_at AS createdAt,COUNT(v.user_id) AS votes_month FROM swapp_game_servers s LEFT JOIN swapp_game_server_votes v ON v.server_id=s.id AND v.voted_at>=? WHERE s.status="published" AND (?="" OR s.game=?) AND (?="" OR LOWER(CONCAT(s.name," ",s.description," ",s.tags," ",s.game)) LIKE CONCAT("%",?,"%")) GROUP BY s.id ORDER BY '+order+' LIMIT 100',[month,game,game,q,q]);
   res.set('Cache-Control','public,max-age=30').json({servers:rows.map(r=>({...r,votes_month:Number(r.votes_month),tags:r.tags.split(',').map(t=>t.trim()).filter(Boolean)})),total:rows.length,ranking:'monthly_unique_votes',onlineVerified:false});
  }catch(e){fail(res,e)}
 });
 app.post('/api/swapp/serveurs',require('express').json({limit:'12kb'}),async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  const input=req.body||{},name=clean(input.name,100),game=clean(input.game,70),description=clean(input.description,1500);
  const website=clean(input.website,350),banner=clean(input.bannerUrl,350),join=clean(input.joinAddress,240),region=clean(input.region||'France',60),tags=clean(input.tags,250);
  if(name.length<3||description.length<30||!GAMES.includes(game)|| (website&&!safeUrl(website))||(banner&&!safeUrl(banner))||/[<>\r\n]/.test(join))return res.status(422).json({error:'informations_invalides'});
  try{
   const sql=await db();const [count]=await sql.execute('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE owner_id=?',[user]);if(count[0].n>=5)return res.status(429).json({error:'limite_de_cinq_serveurs'});
   const id=crypto.randomBytes(16).toString('hex'),serverSlug=(slug(name)||'serveur')+'-'+id.slice(0,7);
   await sql.execute('INSERT INTO swapp_game_servers (id,owner_id,name,slug,game,description,website,join_address,region,tags,banner_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,"pending")',[id,user,name,serverSlug,game,description,website,join,region,tags,banner]);
   return res.status(201).json({status:'pending',slug:serverSlug});
  }catch(e){fail(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/vote',async(req,res)=>{
  if(!originGuard(req))return res.status(403).json({error:'origine_invalide'});
  const user=account(req);if(!user)return res.status(401).json({error:'connexion_swapp_requise'});
  const id=clean(req.params.id,32);if(!/^[a-f0-9]{32}$/.test(id))return res.status(400).json({error:'serveur_invalide'});
  try{
   const sql=await db(),conn=await sql.getConnection();
   try{
    await conn.beginTransaction();
    const [servers]=await conn.execute('SELECT id FROM swapp_game_servers WHERE id=? AND status="published" LIMIT 1',[id]);if(!servers.length){await conn.rollback();return res.status(404).json({error:'serveur_introuvable'})}
    const [previous]=await conn.execute('SELECT voted_at FROM swapp_game_server_votes WHERE server_id=? AND user_id=? FOR UPDATE',[id,user]);
    if(previous.length&&Date.now()-new Date(previous[0].voted_at).getTime()<7200000){await conn.rollback();return res.status(429).json({error:'vote_deja_effectue',nextVoteAt:new Date(new Date(previous[0].voted_at).getTime()+7200000).toISOString()})}
    await conn.execute('INSERT INTO swapp_game_server_votes (server_id,user_id,voted_at) VALUES (?,?,NOW(3)) ON DUPLICATE KEY UPDATE voted_at=NOW(3)',[id,user]);await conn.commit();
    return res.json({success:true,intervalHours:2});
   }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
  }catch(e){fail(res,e)}
 });
 app.get('/api/swapp/serveurs/moderation',async(req,res)=>{
  if(!administrator(req))return res.status(403).json({error:'acces_refuse'});
  try{const sql=await db(),[rows]=await sql.query('SELECT id,name,game,description,website,join_address AS joinAddress,created_at AS createdAt FROM swapp_game_servers WHERE status="pending" ORDER BY created_at ASC LIMIT 100');res.json({servers:rows})}catch(e){fail(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/moderation',require('express').json({limit:'2kb'}),async(req,res)=>{
  if(!originGuard(req)||!administrator(req))return res.status(403).json({error:'acces_refuse'});
  const id=clean(req.params.id,32),status=clean(req.body?.status,20);if(!/^[a-f0-9]{32}$/.test(id)||!['published','rejected'].includes(status))return res.status(422).json({error:'decision_invalide'});
  try{const sql=await db(),[r]=await sql.execute('UPDATE swapp_game_servers SET status=? WHERE id=? AND status="pending"',[status,id]);res.json({updated:r.affectedRows===1})}catch(e){fail(res,e)}
 });
}
module.exports={register,page,GAMES,slug,safeUrl};
