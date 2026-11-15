'use strict';
/* SWAPP SERVEUR + : dedicated free server submission page.
 * Original SWAPP layout; follows the field hierarchy of a games-directory creator.
 */
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const SERVER_TYPES=Object.freeze(['Communauté','Jeux','Roleplay','Semi-RP','Survie','PvP','PvE','Créatif','Moddé','Économie','Mini-jeux','Événements','Compétitif','Entraide','Technologie','Musique','Bot','Fun','Fortnite','Call of Duty','Valorant','Minecraft','GTA RP','Cyberpunk','Films','Manga','Publicité','Rencontre']);
const LANGUAGES=Object.freeze([['fr','Français'],['en','English'],['es','Español'],['de','Deutsch'],['pt','Português'],['it','Italiano']]);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function discordLink(raw){
 let str=String(raw||'').trim().replace(/^(?:https?:\/\/)?(?:www\.)?discord\.gg\//i,'').replace(/^(?:https?:\/\/)?(?:www\.)?discord(?:app)?\.com\/invite\//i,'');
 if(/^[a-z0-9-]{2,64}$/i.test(str))return 'https://discord.gg/'+str;
 return '';
}
function twitchLink(raw){
 let s=String(raw||'').trim();
 if(!s)return '';
 s=s.replace(/^(?:https?:\/\/)?(?:www\.)?twitch\.tv\//i,'').replace(/^@/,'').replace(/\/$/,'');
 return /^[a-z0-9_]{4,25}$/i.test(s)?'https://www.twitch.tv/'+s.toLowerCase():'';
}
function readTypes(value){
 const input=Array.isArray(value)?value:String(value||'').split(',');
 const unique=[...new Set(input.map(x=>String(x||'').trim()).filter(x=>SERVER_TYPES.includes(x)))];
 return unique.slice(0,6);
}
function createPage({game='Discord / Multigaming',games=[],edit=null}={}){
 const discord=game==='Discord / Multigaming';
 const title=edit?'Personnaliser '+String(edit.name||'mon serveur'):(discord?'Ajouter un serveur Discord':'Ajouter un serveur '+game);
 const options=games.map(g=>'<option value="'+esc(g)+'"'+(g===game?' selected':'')+'>'+esc(g)+'</option>').join('');
 const typeButtons=SERVER_TYPES.map(x=>'<label class="ss-create-type"><input type="checkbox" name="types" value="'+esc(x)+'"><span>'+esc(x)+'</span></label>').join('');
 const langOptions=LANGUAGES.map(([code,label])=>'<option value="'+code+'"'+(code==='fr'?' selected':'')+'>'+label+'</option>').join('');
 const content=[
 '<main class="ss ss-create" id="ss-create-root" data-ss-default-game="'+esc(game)+'" data-ss-edit-id="'+(edit?esc(edit.id):'')+'">',
 '<section class="ss-create-hero"><div class="ss-inner">',
 '<nav class="ss-create-breadcrumb" aria-label="Fil d’Ariane"><a href="/serveurs">SERVEUR +</a><span>/</span><span>Référencer un serveur</span></nav>',
 '<span class="ss-overline">CLASSEMENT COMMUNAUTAIRE SWAPP</span>',
 '<h1>'+esc(title)+'</h1>',
 '<p>Crée une vitrine qui donne envie de rejoindre ta communauté. Personnalise son identité et publie-la gratuitement.</p>',
 '<div class="ss-create-perks"><span>Gratuit</span><span>Publication automatique</span><span>Votes, avis et statistiques</span></div>',
 '</div></section>',
 '<div class="ss-inner ss-create-layout"><div class="ss-create-content">',
 '<form id="ss-create-form" class="ss-create-form" novalidate>',
 '<section class="ss-create-section"><div class="ss-create-section-heading"><span>01</span><div><h2>Informations de base</h2><p>Présente ta communauté aux joueurs.</p></div></div>',
 '<div class="ss-create-fields"><label>Jeu ou univers <strong>*</strong><select name="game" id="ss-create-game" required>'+options+'</select></label>',
 '<label>Langue principale <strong>*</strong><select name="language" required>'+langOptions+'</select></label>',
 '<label class="ss-create-wide">Nom du serveur <strong>*</strong><input name="name" id="ss-create-name" type="text" required minlength="3" maxlength="100" placeholder="Le nom de ta communauté" autocomplete="off"></label>',
 '<label class="ss-create-wide">Site web du serveur <small>(facultatif)</small><input name="website" type="url" maxlength="350" placeholder="https://monsite.fr"></label>',
 '<label class="ss-create-wide">Courte description <strong>*</strong><textarea name="description" id="ss-create-description" required minlength="30" maxlength="1500" rows="5" placeholder="Présente le concept, les règles, les activités et les particularités de ton serveur."></textarea><small><output id="ss-create-remaining">0 / 1 500 caractères</output></small></label></div></section>',
 '<section class="ss-create-section"><div class="ss-create-section-heading"><span>02</span><div><h2>Configuration</h2><p>Choisis jusqu’à six catégories pour être découvert plus facilement.</p></div></div>',
 '<div class="ss-create-types" id="ss-create-types">'+typeButtons+'</div><p id="ss-create-type-count" class="ss-create-count" aria-live="polite">0 / 6 catégories sélectionnées</p></section>',
 '<section class="ss-create-section"><div class="ss-create-section-heading"><span>03</span><div><h2>Connexion au serveur</h2><p>Une invitation Discord ou une adresse réelle, selon le jeu.</p></div></div>',
 '<div id="ss-create-discord-wrap"><label>Identifiant ou lien d’invitation Discord <strong>*</strong><div class="ss-create-input-group"><span>discord.gg/</span><input name="discordCode" id="ss-create-discord" type="text" maxlength="125" placeholder="Code ou lien complet" autocomplete="off"></div></label><small>Tu peux coller un lien complet. SWAPP vérifiera l’invitation via Discord avant publication.</small></div>',
 '<div id="ss-create-address-wrap" hidden><label>Adresse de connexion au jeu <strong>*</strong><input name="joinAddress" id="ss-create-address" type="text" maxlength="240" placeholder="play.mondomaine.fr:25565" autocomplete="off"></label><small>Si ton jeu utilise une invitation ou un site web, le lien HTTPS peut remplacer l’adresse du jeu.</small></div>',
 '</section>',
 '<section class="ss-create-section"><div class="ss-create-section-heading"><span>04</span><div><h2>Réseaux sociaux</h2><p>Permets aux joueurs de retrouver tes lives.</p></div></div>',
 '<label>Chaîne Twitch <small>(facultatif)</small><div class="ss-create-input-group"><span>twitch.tv/</span><input name="twitch" id="ss-create-twitch" type="text" maxlength="125" placeholder="Nom de chaîne"></div></label>',
 '<label>Région <select name="region"><option>France</option><option>Europe</option><option>Québec</option><option>International</option><option>Autre</option></select></label></section>',
 '<section class="ss-create-section ss-create-branding"><div class="ss-create-section-heading"><span>05</span><div><h2>Personnalise ta vitrine</h2><p>Logo, bannière, couleurs et captures : construis une identité unique pour ton serveur.</p></div></div>',
 '<label class="ss-create-wide">Slogan court <small>140 caractères maximum</small><input name="tagline" type="text" maxlength="140" placeholder="Une phrase qui donne envie de rejoindre ta communauté"></label>',
 '<div class="ss-create-brand-grid"><label>Logo du serveur <small>PNG, JPG ou WebP — 2 Mo maximum</small><input name="logoFile" id="ss-create-logo-file" type="file" accept="image/png,image/jpeg,image/webp"><span>Ou une URL HTTPS</span><input name="logoUrl" type="url" maxlength="350" placeholder="https://monsite.fr/logo.png"></label>',
 '<label>Bannière du serveur <small>PNG, JPG ou WebP — 2 Mo maximum</small><input name="bannerFile" id="ss-create-banner-file" type="file" accept="image/png,image/jpeg,image/webp"><span>Ou une URL HTTPS</span><input name="bannerUrl" type="url" maxlength="350" placeholder="https://monsite.fr/banniere.jpg"></label></div>',
 '<div class="ss-create-color-grid"><label>Couleur principale<input name="accentColor" type="color" value="#8ceaf0"></label><label>Couleur secondaire<input name="secondaryColor" type="color" value="#ad6bff"></label></div>',
 '<div class="ss-create-color-presets" role="group" aria-label="Palettes suggérées"><button type="button" data-ss-palette="#8ceaf0,#ad6bff">Glacier</button><button type="button" data-ss-palette="#ff456a,#a53fff">Neon</button><button type="button" data-ss-palette="#f7b24a,#f05f44">Braise</button><button type="button" data-ss-palette="#6ce7a4,#45a4d8">Forêt</button><button type="button" data-ss-palette="#f7e864,#f94c9f">Night City</button></div>',
 '<details class="ss-create-gallery"><summary>Galerie — jusqu’à 3 captures facultatives</summary><label>Capture 1 (URL HTTPS)<input name="gallery1" type="url" maxlength="350" placeholder="https://monsite.fr/capture1.jpg"></label><label>Capture 2 (URL HTTPS)<input name="gallery2" type="url" maxlength="350" placeholder="https://monsite.fr/capture2.jpg"></label><label>Capture 3 (URL HTTPS)<input name="gallery3" type="url" maxlength="350" placeholder="https://monsite.fr/capture3.jpg"></label></details>',
 '</section>',
 '<section class="ss-create-section ss-create-account"><div class="ss-create-section-heading"><span>06</span><div><h2>Compte SWAPP</h2><p>Pas de nouveau compte à créer : tu utilises ton identité SWAPP.</p></div></div>',
 '<div class="ss-create-account-info"><span class="ss-create-account-icon">S</span><div><strong>Publication avec ton compte SWAPP</strong><p>Connecte-toi si nécessaire. Aucune adresse e-mail ni aucun mot de passe n’est demandé dans ce formulaire.</p></div><a href="/compte">Mon compte</a></div>',
 '<label class="ss-create-consent"><input type="checkbox" name="confirm" required><span>Je confirme que je suis autorisé à référencer ce serveur et que les informations sont exactes.</span></label>',
 '<div id="ss-create-error" role="alert" aria-live="assertive"></div>',
 '<div class="ss-create-actions"><a href="/serveurs" class="ss-create-cancel">Annuler</a><button id="ss-create-submit" type="submit">'+(edit?'Enregistrer les modifications':'Publier mon serveur')+'</button></div>',
 '</section></form></div>',
 '<aside class="ss-create-aside"><div class="ss-create-preview"><p class="ss-overline">APERÇU DE TA FICHE</p><div class="ss-create-preview-art" id="ss-create-preview-art"><span>SWAPP SERVEUR +</span></div><div class="ss-create-preview-body"><div id="ss-create-preview-logo" class="ss-create-preview-logo" aria-label="Aperçu du logo">S</div><span id="ss-create-preview-game">'+esc(game)+'</span><h3 id="ss-create-preview-name">Ton serveur</h3><p id="ss-create-preview-description">Ta communauté apparaîtra ici, avec sa présentation et ses catégories.</p><div id="ss-create-preview-tags" class="ss-create-preview-tags"></div><div class="ss-create-preview-vote"><span aria-hidden="true">♥</span> Voter pour ce serveur</div></div></div>',
 '<div class="ss-create-help"><h3>Après la publication</h3><p>Ta fiche rejoint le classement et possède son propre lien. Les votes et les avis seront comptés sur SWAPP. Le statut « en ligne » ne sera pas annoncé sans vérification technique.</p></div></aside>',
 '</div></main>'
 ].join('')+(edit?'<script id="ss-create-edit-data" type="application/json">'+JSON.stringify(edit).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'</script>':'');
 const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#030405"><title>'+esc(title)+' | SERVEUR + SWAPP</title>'+
 '<meta name="description" content="Publiez votre serveur de jeux ou Discord sur SWAPP. Gratuit, avec votes, avis et statistiques.">'+
 '<link rel="canonical" href="https://swapp.tv'+(edit?'/serveurs/gerer/'+encodeURIComponent(edit.slug):'/serveurs/creer')+'">'+SHARED_HEAD_SLOT+
 '<link rel="stylesheet" href="/assets/swapp-servers.css?v=20261115-brand-studio-v10">'+
 '<link rel="stylesheet" href="/assets/swapp-servers-create.css?v=20261115-personnalisation-v4">';
 return renderPage({head,content,active:'servers',bodyClass:'swapp-editorial-route swapp-servers-page',
  scripts:'<script src="/assets/swapp-servers-create.js?v=20261115-personnalisation-v4" defer></script><script src="/assets/swapp-nav-session.js?v=20261114-native-account-v1" defer></script>'});
}
module.exports={createPage,SERVER_TYPES,LANGUAGES,discordLink,twitchLink,readTypes};
