'use strict';
/* SWAPP community discovery: opt-in, expiring LFG presence + approved creator affiliations.
 * Never infer online players from votes or community membership; never infer live status
 * merely from a Twitch link or a game category match.
 */
const crypto=require('node:crypto');
const ID=/^[a-f0-9]{32}$/;
const clean=(x,n)=>String(x??'').replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const schema=[
 'CREATE TABLE IF NOT EXISTS swapp_server_lfg (server_id CHAR(32) NOT NULL,user_id VARCHAR(100) NOT NULL,display_name VARCHAR(70) NOT NULL,',
 'message VARCHAR(160) NOT NULL,voice ENUM("yes","no","either") NOT NULL DEFAULT "either",',
 'expires_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,PRIMARY KEY(server_id,user_id),',
 'KEY swapp_lfg_expiry (expires_at),CONSTRAINT swapp_lfg_server_fk FOREIGN KEY(server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE)',
 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
].join(' ');
const creatorSchema=[
 'CREATE TABLE IF NOT EXISTS swapp_server_creators (id CHAR(32) PRIMARY KEY,server_id CHAR(32) NOT NULL,user_id VARCHAR(100) NOT NULL,',
 'platform ENUM("swapp","twitch") NOT NULL,creator_login VARCHAR(45) NOT NULL,',
 'status ENUM("pending","approved") NOT NULL DEFAULT "pending",created_at DATETIME NOT NULL,',
 'UNIQUE KEY swapp_creator_affiliation (server_id,user_id,platform),',
 'KEY swapp_creator_status (server_id,status),',
 'CONSTRAINT swapp_creator_server_fk FOREIGN KEY(server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE)',
 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
].join(' ');
const loginFormat={swapp:/^[a-z0-9_][a-z0-9_-]{1,39}$/,twitch:/^[a-z0-9_]{2,25}$/};
function sessionCreator(req,platform){
 if(platform==='swapp')return clean(req.session?.oryonUser?.login,45).toLowerCase();
 if(platform==='twitch')return clean(req.session?.twitchUser?.login,45).toLowerCase();
 return '';
}
function displayName(req){
 return clean(req.session?.oryonUser?.display_name||req.session?.oryonUser?.login||
  req.session?.twitchUser?.display_name||req.session?.twitchUser?.login||'Joueur SWAPP',70);
}
function publicCreator(row){
 return {id:row.id,platform:row.platform,login:row.creator_login,status:row.status};
}
function renderCommunityPanels(server){
 if(!server||!ID.test(String(server.id||'')))return '';
 let channel='';
 try{
  const u=new URL(String(server.twitch_url||''));
  if(u.protocol==='https:'&&u.hostname==='www.twitch.tv'&&/^\/[a-z0-9_]{2,25}\/?$/i.test(u.pathname))
   channel=u.pathname.split('/')[1].toLowerCase();
 }catch(_){}
 return '<section id="joueurs" class="ss-pro-panel ss-community-panel" data-ss-community>'+
  '<p class="ss-overline">RENCONTRES EN TEMPS RÉEL</p><h2>Recherche de joueurs</h2>'+
  '<p class="ss-pro-muted">Des membres signalent volontairement leur disponibilité pour une heure. Aucun faux compteur ni statut supposé.</p>'+
  '<form id="ss-lfg-form" class="ss-community-form"><label>Ton annonce (facultatif)<input name="message" maxlength="160" placeholder="Je cherche une équipe pour une partie coop…"></label>'+
  '<label>Vocal<select name="voice"><option value="either">Peu importe</option><option value="yes">Avec vocal</option><option value="no">Sans vocal</option></select></label>'+
  '<div class="ss-community-actions"><button type="submit">Je suis disponible pendant 1 h</button><button type="button" id="ss-lfg-remove" hidden>Retirer ma disponibilité</button></div></form>'+
  '<p id="ss-lfg-status" class="ss-pro-muted" role="status" aria-live="polite"></p>'+
  '<div id="ss-lfg-list" class="ss-community-list"><p>Recherche des joueurs disponibles…</p></div></section>'+
  '<section id="directs" class="ss-pro-panel ss-community-panel" data-ss-owner-twitch="'+escapeHtml(channel)+'">'+
  '<p class="ss-overline">CRÉATEURS DE LA COMMUNAUTÉ</p><h2>Lives associés</h2>'+
  '<div id="ss-community-lives" class="ss-community-list"><p>Vérification des directs…</p></div>'+
  '<p class="ss-community-explainer">Seuls les directs vérifiés sont signalés en ligne. Une chaîne sans direct confirmé n’est pas nécessairement hors ligne.</p>'+
  '<div class="ss-community-link"><h3>Associer ma chaîne</h3><p>Demande volontaire depuis ton compte SWAPP ou Twitch. Le propriétaire de cette communauté doit accepter l’association.</p>'+
  '<div id="ss-creator-actions" class="ss-community-actions"></div><p id="ss-creator-status" class="ss-pro-muted" role="status" aria-live="polite"></p></div>'+
  '<div id="ss-creator-moderation" hidden><h3>Associations à valider</h3><div id="ss-creator-pending" class="ss-community-list"></div></div>'+
  '</section>';
}
function registerCommunity(app,{getDatabase,account,ownerKeys,originGuard}){
 if(typeof getDatabase!=='function'||typeof account!=='function'||typeof originGuard!=='function')throw Error('swapp_community_dependencies_missing');
 let initialized=null;
 async function database(){
  const pool=await getDatabase();
  if(!initialized)initialized=(async()=>{await pool.query(schema);await pool.query(creatorSchema)})().catch(e=>{initialized=null;throw e});
  await initialized;return pool;
 }
 async function server(pool,id){
  const [rows]=await pool.execute('SELECT id,owner_id FROM swapp_game_servers WHERE id=? AND status="published" LIMIT 1',[id]);
  return rows[0]||null;
 }
 function isOwner(req,item){return Boolean(item&&ownerKeys(req).includes(item.owner_id))}
 function sendError(res,error){
  console.warn('[SWAPP COMMUNITY]',String(error?.code||error?.message||error).slice(0,100));
  return res.status(503).json({error:'communaute_temporairement_indisponible'});
 }
 function invalid(res,req,needsUser=false){
  if(!ID.test(String(req.params.id||''))){res.status(422).json({error:'serveur_invalide'});return true}
  if(needsUser&&!account(req)){res.status(401).json({error:'connexion_swapp_requise'});return true}
  if(needsUser&&!originGuard(req)){res.status(403).json({error:'origine_invalide'});return true}
  return false;
 }
 app.get('/api/swapp/serveurs/:id/community',async(req,res)=>{
  if(invalid(res,req))return;
  try{
   const db=await database(),item=await server(db,req.params.id);
   if(!item)return res.status(404).json({error:'serveur_introuvable'});
   const [[players],[approved]]=await Promise.all([
    db.execute('SELECT display_name AS name,message,voice,DATE_FORMAT(expires_at,"%Y-%m-%dT%H:%i:%sZ") AS expires_at,user_id FROM swapp_server_lfg WHERE server_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY updated_at DESC LIMIT 30',[item.id]),
    db.execute('SELECT id,platform,creator_login,status,user_id FROM swapp_server_creators WHERE server_id=? AND status="approved" ORDER BY created_at DESC LIMIT 30',[item.id])
   ]);
   const user=account(req),owner=isOwner(req,item);
   let mine={lfg:false,creators:[]},pending=[];
   if(user){
    const [[lfg],[links]]=await Promise.all([
     db.execute('SELECT 1 AS found FROM swapp_server_lfg WHERE server_id=? AND user_id=? AND expires_at>UTC_TIMESTAMP() LIMIT 1',[item.id,user]),
     db.execute('SELECT id,platform,creator_login,status FROM swapp_server_creators WHERE server_id=? AND user_id=?',[item.id,user])
    ]);
    mine={lfg:!!lfg.length,creators:links.map(publicCreator)};
   }
   if(owner){
    const [rows]=await db.execute('SELECT id,platform,creator_login,status FROM swapp_server_creators WHERE server_id=? AND status="pending" ORDER BY created_at ASC LIMIT 30',[item.id]);
    pending=rows.map(publicCreator);
   }
   const available=['swapp','twitch'].map(platform=>({platform,login:sessionCreator(req,platform)}))
    .filter(c=>loginFormat[c.platform].test(c.login));
   return res.set('Cache-Control','private,no-store').json({
    players:players.map(({user_id,...row})=>({...row,mine:Boolean(user&&user===user_id)})),
    creators:approved.map(publicCreator),pending,mine,owner,available
   });
  }catch(e){return sendError(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/lfg',require('express').json({limit:'2kb'}),async(req,res)=>{
  if(invalid(res,req,true))return;
  const message=clean(req.body?.message||'',160),voice=String(req.body?.voice||'either');
  if(!['yes','no','either'].includes(voice)||/@|https?:\/\/|www\./i.test(message))
   return res.status(422).json({error:'annonce_invalide'});
  try{
   const db=await database(),item=await server(db,req.params.id);
   if(!item)return res.status(404).json({error:'serveur_introuvable'});
   const user=account(req);
   const [counts]=await db.execute('SELECT COUNT(*) AS n FROM swapp_server_lfg WHERE user_id=? AND expires_at>UTC_TIMESTAMP()',[user]);
   const [previous]=await db.execute('SELECT TIMESTAMPDIFF(SECOND,updated_at,UTC_TIMESTAMP()) AS elapsed FROM swapp_server_lfg WHERE server_id=? AND user_id=? LIMIT 1',[item.id,user]);
   if(!previous.length&&Number(counts[0]?.n||0)>=3)return res.status(429).json({error:'limite_annonces'});
   if(previous.length&&Number(previous[0].elapsed)<60)return res.status(429).json({error:'annonce_trop_recente'});
   await db.execute('INSERT INTO swapp_server_lfg (server_id,user_id,display_name,message,voice,expires_at,updated_at) VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 MINUTE),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),message=VALUES(message),voice=VALUES(voice),expires_at=VALUES(expires_at),updated_at=VALUES(updated_at)',
    [item.id,user,displayName(req),message,voice]);
   return res.set('Cache-Control','private,no-store').json({available:true,expiresInMinutes:60});
  }catch(e){return sendError(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/lfg/remove',async(req,res)=>{
  if(invalid(res,req,true))return;
  try{
   const db=await database();
   await db.execute('DELETE FROM swapp_server_lfg WHERE server_id=? AND user_id=?',[req.params.id,account(req)]);
   return res.set('Cache-Control','private,no-store').json({available:false});
  }catch(e){return sendError(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/creators',require('express').json({limit:'2kb'}),async(req,res)=>{
  if(invalid(res,req,true))return;
  const platform=String(req.body?.platform||'');
  if(!Object.hasOwn(loginFormat,platform))return res.status(422).json({error:'plateforme_invalide'});
  const login=sessionCreator(req,platform);
  if(!loginFormat[platform].test(login))return res.status(403).json({error:'chaine_non_liee'});
  try{
   const db=await database(),item=await server(db,req.params.id);
   if(!item)return res.status(404).json({error:'serveur_introuvable'});
   const id=crypto.randomBytes(16).toString('hex');
   await db.execute('INSERT INTO swapp_server_creators (id,server_id,user_id,platform,creator_login,status,created_at) VALUES (?,?,?,?,?,"pending",UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=IF(creator_login=VALUES(creator_login),status,"pending"),creator_login=VALUES(creator_login)',
    [id,item.id,account(req),platform,login]);
   return res.set('Cache-Control','private,no-store').json({requested:true,status:'pending'});
  }catch(e){return sendError(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/creators/:creatorId/moderate',require('express').json({limit:'1kb'}),async(req,res)=>{
  if(invalid(res,req,true))return;
  if(!ID.test(String(req.params.creatorId||'')))return res.status(422).json({error:'association_invalide'});
  const decision=String(req.body?.decision||'');
  if(!['approved','rejected'].includes(decision))return res.status(422).json({error:'decision_invalide'});
  try{
   const db=await database(),item=await server(db,req.params.id);
   if(!item)return res.status(404).json({error:'serveur_introuvable'});
   if(!isOwner(req,item))return res.status(403).json({error:'autorisation_requise'});
   const [result]=decision==='approved'?
    await db.execute('UPDATE swapp_server_creators SET status="approved" WHERE id=? AND server_id=? AND status="pending"',[req.params.creatorId,item.id]):
    await db.execute('DELETE FROM swapp_server_creators WHERE id=? AND server_id=? AND status="pending"',[req.params.creatorId,item.id]);
   if(!result.affectedRows)return res.status(404).json({error:'association_introuvable'});
   return res.set('Cache-Control','private,no-store').json({updated:true});
  }catch(e){return sendError(res,e)}
 });
 app.post('/api/swapp/serveurs/:id/creators/:creatorId/remove',async(req,res)=>{
  if(invalid(res,req,true))return;
  if(!ID.test(String(req.params.creatorId||'')))return res.status(422).json({error:'association_invalide'});
  try{
   const db=await database(),item=await server(db,req.params.id);
   if(!item)return res.status(404).json({error:'serveur_introuvable'});
   const [result]=await db.execute('DELETE FROM swapp_server_creators WHERE id=? AND server_id=? AND (user_id=? OR ?=1)',
    [req.params.creatorId,item.id,account(req),isOwner(req,item)?1:0]);
   if(!result.affectedRows)return res.status(404).json({error:'association_introuvable'});
   return res.set('Cache-Control','private,no-store').json({removed:true});
  }catch(e){return sendError(res,e)}
 });
}
module.exports={registerCommunity,renderCommunityPanels,sessionCreator,displayName};
