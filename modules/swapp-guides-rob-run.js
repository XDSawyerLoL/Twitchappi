'use strict';
// Original ROB RUN editorial guide: sourced facts and clearly marked advice.
// No database calls, AI generation, external widgets or game stats fabricated.
const {renderPage,SHARED_HEAD_SLOT}=require('./swapp-page-shell');
const ORIGIN='https://swapp.tv', PATH='/guides/rob-run', UPDATED='2026-11-20';
const STEAM='https://store.steampowered.com/app/4262460/ROB_RUN/';
const PATCH='https://steamcommunity.com/ogg/4262460/announcements/detail/717921532895037155';
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CSS=".sg-page{background:#050608;color:#f5f7fb;min-height:80vh;padding:40px clamp(16px,4vw,52px) 85px;font:400 16px/1.75 system-ui,Segoe UI,sans-serif}"+
".sg-wrap{max-width:1120px;margin:auto}.sg-hero{padding:clamp(25px,5vw,60px);border:1px solid #728c9b52;border-radius:18px;background:radial-gradient(ellipse at 100% 0%,#2a4b5a40,transparent 50%),linear-gradient(135deg,#121a23,#07090c)}"+
".sg-label{color:#9bc9df;text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:900}.sg-hero h1{font-size:clamp(37px,6vw,74px);letter-spacing:-.06em;line-height:1.07;max-width:19ch;margin:14px 0 22px}"+
".sg-lead{font-size:clamp(17px,2vw,21px);max-width:850px;color:#c9dce5;line-height:1.55}.sg-stamp{color:#9bb9c7;font-size:13px}"+
".sg-page a{color:#9ce5f7;text-underline-offset:4px}.sg-cta{display:flex;flex-wrap:wrap;gap:16px;margin-top:28px}.sg-cta a{padding:10px 15px;border:1px solid #73919d77;border-radius:9px;color:white;text-decoration:none}"+
".sg-columns{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:48px;margin-top:34px}.sg-main{max-width:790px}"+
".sg-main h2{font-size:clamp(24px,2.8vw,35px);line-height:1.24;letter-spacing:-.035em;margin:45px 0 14px}.sg-main p,.sg-main li{color:#c7d4dd}.sg-main li{margin:10px 0}.sg-main ul,.sg-main ol{padding-left:22px}"+
".sg-note{border-left:3px solid #80d6e7;background:#0c1a24;padding:17px 20px;color:#e5f1f6;margin:26px 0}.sg-side{position:sticky;top:108px;align-self:start;border-top:1px solid #506575;padding-top:15px}"+
".sg-side a{display:block;font-size:13px;padding:8px 0;text-decoration:none;color:#b6cad6}.sg-source{border-top:1px solid #516474;margin-top:50px;padding-top:24px;font-size:14px;color:#aebecb}"+
".sg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:32px}.sg-card{min-height:180px;display:flex;flex-direction:column;gap:10px;padding:24px;border:1px solid #66859470;border-radius:15px;background:linear-gradient(135deg,#15212a,#090d12);text-decoration:none!important}"+
".sg-card strong{font-size:24px;color:white}.sg-card small{font-size:11px;color:#a2ccd7;text-transform:uppercase;letter-spacing:.1em}.sg-card span{color:#c5d3dd;font-size:14px}"+
"@media(max-width:800px){.sg-columns{display:flex;flex-direction:column-reverse}.sg-side{position:static;display:flex;flex-wrap:wrap;gap:9px 18px}.sg-side a{padding:2px 0}}"+
"@media(max-width:540px){.sg-page{padding:22px 14px 54px}.sg-hero{padding:26px 19px}.sg-hero h1{max-width:none}.sg-main h2{margin-top:32px}}";
const SECTIONS=Object.freeze([
 {id:'comprendre',title:'1. Comprendre ce que ROB RUN demande vraiment',
  body:"<p>Développé et édité par <strong>Kefir</strong>, ROB RUN est un crime sandbox multijoueur en monde ouvert, lancé sur Steam en accès anticipé le <strong>4 novembre 2026</strong>. Le jeu est <strong>gratuit</strong>, avec achats intégrés. Sa fiche annonce des affrontements entre vrais joueurs : policiers, criminels et membres de groupes ont leurs propres objectifs. Il ne s’agit pas d’une campagne scénarisée solo ni d’un monde où chaque confrontation est prévisible.</p><p>Ton premier objectif devrait être de comprendre le risque avant d’accumuler du butin. La présentation officielle insiste sur la possibilité de tout perdre. Choisis donc une activité courte, repère un retour possible et distingue ce que tu es prêt à risquer de ce que tu préfères conserver. Ces conseils sont une méthode SWAPP, pas une mécanique secrète.</p>"},
 {id:'premiers-pas',title:'2. La première heure : apprendre sans tout engager',
  body:"<p>Plutôt que de poursuivre le plus gros braquage affiché par un autre joueur, commence par une exploration ciblée. Définis un trajet, identifie les secteurs exposés et regarde comment les autres réagissent à ton passage. En cas d’échec, analyse une seule variable : mauvais itinéraire, manque d’information, décision trop tardive ou retrait impossible.</p><ol><li>Choisis un objectif réalisable en une seule sortie.</li><li>Observe les issues avant de t’approcher d’un lieu fréquenté.</li><li>Évite de regrouper toutes tes ressources dans une tentative non maîtrisée.</li><li>Après un échec, change ton approche et vérifie ce qui a réellement causé la perte.</li></ol><p>Nous ne donnons pas de rendement en monnaie, de lieu de butin garanti ni de « route méta » : aucune de ces promesses n’est établie par les sources officielles consultées pour la version courante.</p>"},
 {id:'police',title:'3. Police, prison et signalement : les règles récentes',
  body:"<p>Kefir présente une police jouée par des personnes réelles. La négociation, la fuite et la coordination ont donc leur place dans l’expérience annoncée, mais le comportement des autres joueurs n’est jamais garanti.</p><p>Les <strong>notes officielles du 17 novembre</strong> annoncent des limites quotidiennes et générales pour le temps de prison. Elles signalent aussi une restriction précise du chat vocal dans la prison et au motel de Lenny : les joueurs sans terrain et n’ayant encore accumulé aucun temps de prison ne peuvent pas y parler en vocal. Ce n’est <strong>pas</strong> une suppression du vocal dans tout le jeu.</p><p>La commande de signalement sur l’écran de décès a été rendue plus visible. Utilise-la pour documenter un comportement suspect plutôt que de diffuser des accusations sans élément vérifiable.</p>"},
 {id:'repaire',title:'4. Base, stockage et sécurité du butin',
  body:"<p>La fiche Steam annonce la construction et l’amélioration de repaires, ainsi que la possibilité de stocker butin et véhicules, d’installer des établis et des coffres. Elle précise aussi qu’un refuge trop voyant peut attirer des intrus. Un coffre ou un bâtiment ne doit donc jamais être présenté comme inviolable sans preuve actuelle.</p><p>Recommandation : commence par comprendre les règles locales du stockage, puis teste une organisation simple avant d’y concentrer des ressources difficiles à remplacer. Les propriétés, leur protection et les règles d’attaque sont susceptibles d’évoluer pendant l’accès anticipé.</p><p>Le patch du 17 novembre a <strong>temporairement retiré les droits d’expulsion du troc</strong>. Les tutoriels plus anciens qui recommandent cette transaction doivent être considérés comme potentiellement périmés.</p>"},
 {id:'clans',title:'5. Clans, raids et alliances : jouer ensemble sans improviser',
  body:"<p>Kefir prévoit la création ou l’adhésion à des familles criminelles, la répartition des rôles, les raids, la conquête de territoires et les trêves négociées. Dans un groupe, l’organisation apporte souvent davantage qu’une accumulation de joueurs qui agissent sans coordination.</p><p>Avant une opération, convenez de trois choses : qui prend la décision de départ, qui observe les environs et quel signal entraîne le repli. Gardez les annonces vocales courtes. Ce protocole est un conseil pratique de coopération, <strong>pas</strong> la description d’un avantage chiffré, d’une compétence ou d’une composition de groupe « méta ».</p>"},
 {id:'patch',title:'6. Patch du 17 novembre : ce qu’il faut retenir',
  body:"<p>Les améliorations annoncées portent sur la progression, l’ergonomie et la stabilité. Les voici sans extrapolation :</p><ul><li><strong>Changement de région :</strong> la progression du personnage et les points de Battle Pass sont désormais conservés selon Kefir. Cela ne garantit pas le transfert des bâtiments ou de chaque objet.</li><li><strong>Lenny :</strong> une entrée « Shipments » a été ajoutée au menu contextuel.</li><li><strong>Prison :</strong> introduction de limites journalières et générales au temps de détention.</li><li><strong>Vocal :</strong> limitation pour certains joueurs en prison et au motel de Lenny.</li><li><strong>Confort :</strong> inversion de l’axe Y de la souris et filtre de grossièretés dans les noms.</li><li><strong>Réseau :</strong> amélioration annoncée de la stabilité, qui ne signifie pas disparition de toutes les erreurs.</li></ul><p>Ces modifications sont indiquées comme déjà déployées dans la note du 17 novembre. La version exacte du client et le fonctionnement des serveurs à l’instant de ta lecture doivent encore être contrôlés dans le jeu et les annonces de Kefir.</p>"},
 {id:'configuration',title:'7. Configuration PC, français et antitriche',
  body:"<p>Sur Steam, Kefir indique <strong>Windows 10 ou ultérieur, 12 Go de RAM au minimum</strong> et <strong>20 Go d’espace libre</strong>. La configuration recommandée indique 16 Go de RAM. ROB RUN utilise Easy Anti-Cheat, mentionné avec prise en charge au niveau noyau sur la fiche Steam.</p><p>La langue française est annoncée pour <strong>l’interface et les sous-titres</strong>, pas pour le doublage. Vérifie les paramètres de langue et de commandes avant de considérer un menu ou un message d’erreur comme introuvable.</p><p>En cas de panne de connexion, lis les dernières annonces du développeur. N’installe pas de supposé « correctif anti-cheat » trouvé dans un message privé ou une vidéo non officielle.</p>"},
 {id:'erreurs',title:'8. Cinq erreurs qui coûtent cher',
  body:"<ol><li>Partir avec tout son équipement sans itinéraire ni sortie identifiée.</li><li>Présumer que les autres joueurs te laisseront repartir après une rencontre.</li><li>Copier un ancien guide sur les droits d’expulsion, retirés temporairement du troc.</li><li>Confondre conservation de progression entre régions et transfert intégral de possessions.</li><li>Prendre des chiffres de gains ou d’équilibrage non datés pour des règles actuelles.</li></ol><p>Un bon début n’est pas nécessairement une richesse immédiate : c’est une session qui te donne une connaissance reproductible du terrain, des risques et du fonctionnement de ton groupe.</p>"}
]);
function head(title,description,pathname,kind){
 const url=ORIGIN+pathname;
 const schema={'@context':'https://schema.org','@type':kind==='article'?'Article':'CollectionPage',
  headline:title,name:title,description,inLanguage:'fr-FR',mainEntityOfPage:url,
  datePublished:UPDATED,dateModified:UPDATED,author:{'@type':'Organization',name:'Rédaction SWAPP'},
  publisher:{'@type':'Organization',name:'SWAPP'}};
 return "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"+
  "<meta name='theme-color' content='#050608'><title>"+E(title)+"</title>"+
  "<meta name='description' content='"+E(description)+"'><link rel='canonical' href='"+url+"'>"+
  "<meta property='og:type' content='"+kind+"'><meta property='og:title' content='"+E(title)+"'>"+
  "<meta property='og:description' content='"+E(description)+"'><meta property='og:url' content='"+url+"'>"+
  "<meta property='og:image' content='"+ORIGIN+"/swapp-share-card.png'>"+
  "<script type='application/ld+json'>"+JSON.stringify(schema).replace(/</g,'\\u003c')+"</script>"+
  SHARED_HEAD_SLOT+"<style>"+CSS+"</style>";
}
function renderRobRun(){
 const title='ROB RUN : bien débuter et comprendre la mise à jour du 17 novembre | SWAPP';
 const desc='Guide ROB RUN : premiers pas, police, clans, stockage, patch du 17 novembre 2026 et configuration PC. Conseils originaux et sources officielles.';
 const hero="<main class='sg-page'><div class='sg-wrap'><header class='sg-hero'>"+
  "<p class='sg-label'><a href='/guides'>SWAPP Guides</a> / ROB RUN</p>"+
  "<h1>ROB RUN : partir de rien, sans tout perdre</h1>"+
  "<p class='sg-lead'>Les bons réflexes pour entrer dans le crime sandbox de Kefir : comprendre le risque, organiser ses premières sorties et repérer les règles réellement modifiées en novembre.</p>"+
  "<p class='sg-stamp'>Guide original SWAPP · Révision du 20 novembre 2026 · Jeu PC en accès anticipé depuis le 4 novembre</p>"+
  "<div class='sg-cta'><a href='"+STEAM+"' target='_blank' rel='noopener noreferrer'>Fiche Steam officielle</a>"+
  "<a href='"+PATCH+"' target='_blank' rel='noopener noreferrer'>Notes Kefir du 17 novembre</a></div></header>";
 const chapterHtml=SECTIONS.map(s=>"<section id='"+s.id+"'><h2>"+E(s.title)+"</h2>"+s.body+"</section>").join('');
 const aside="<aside class='sg-side' aria-label='Sommaire'>"+
  SECTIONS.map(s=>"<a href='#"+s.id+"'>"+E(s.title)+"</a>").join('')+"</aside>";
 const article="<article class='sg-main'><p class='sg-note'><strong>Notre méthode :</strong> les faits de jeu et les changements du patch sont liés aux annonces de Kefir. Les routines proposées sont des conseils SWAPP, pas des tests réalisés manette en main, ni des statistiques garanties.</p>"+
  chapterHtml+"<section class='sg-source'><h2>Sources, crédits et révisions</h2>"+
  "<p><a href='"+STEAM+"' target='_blank' rel='noopener noreferrer'>Kefir — fiche Steam ROB RUN</a> : description, sortie du 4 novembre, prix, langue et configuration. "+
  "<a href='"+PATCH+"' target='_blank' rel='noopener noreferrer'>Kefir — Patch Notes du 17 novembre 2026</a> : changements de progression, prison, vocal, échanges et connexion.</p>"+
  "<p>Mis à jour le 20 novembre 2026. Aucun visuel tiers reproduit, aucune vidéo de réupload et aucune information de gameplay inventée. Les règles d’accès anticipé peuvent changer : contrôle les notes officielles plus récentes.</p>"+
  "<p><a href='/guides'>Tous les guides</a> · <a href='/actus'>Magazine SWAPP</a> · <a href='/explorer'>Explorer les directs</a></p></section></article>";
 return renderPage({head:head(title,desc,PATH,'article'),content:hero+
  "<div class='sg-columns'>"+article+aside+"</div></div></main>",
  active:'discover',bodyClass:'swapp-editorial-route swapp-guide-page'});
}
function renderIndex(){
 const title='SWAPP Guides : apprendre et progresser dans les jeux';
 const desc='Guide ROB RUN, parcours Aion 2 et méthode pour choisir une communauté gaming active. Des conseils originaux, sourcés et révisables.';
 const guides=[
  ['/guides/rob-run','ROB RUN','Débuter, sécuriser son butin, comprendre les clans et le patch du 17 novembre 2026.','NOUVEAU · 20 NOVEMBRE'],
  ['/guides/aion-2','Aion 2','Classes, progression, équipement, donjons, PvE et PvP en dix chapitres.','PARCOURS · 10 CHAPITRES'],
  ['/guides/choisir-communaute-gaming','Choisir sa communauté','Vérifier les horaires, la modération, les joueurs réellement actifs et les règles.','MÉTHODE · COMMUNAUTÉS']
 ];
 const cards=guides.map(x=>"<a class='sg-card' href='"+x[0]+"'><small>"+E(x[3])+"</small><strong>"+E(x[1])+"</strong><span>"+E(x[2])+"</span></a>").join('');
 const html="<main class='sg-page'><div class='sg-wrap'><header class='sg-hero'><p class='sg-label'>SWAPP / Guides</p>"+
  "<h1>Apprendre sans perdre son temps</h1><p class='sg-lead'>Des guides pour comprendre les jeux et les communautés. Les méthodes sont distinctes des faits vérifiés : pas de chiffres fictifs, ni de fausses promesses.</p></header>"+
  "<section aria-label='Guides disponibles'><div class='sg-cards'>"+cards+"</div></section>"+
  "<p class='sg-source'>Pour les annonces récentes, consulte <a href='/actus'>le Magazine SWAPP</a>.</p></div></main>";
 return renderPage({head:head(title,desc,'/guides','website'),content:html,
  active:'discover',bodyClass:'swapp-editorial-route swapp-guide-page'});
}
function register(app){
 if(!app||typeof app.get!=='function')throw new TypeError('Express app required');
 app.get('/guides',(_req,res)=>res.set('Cache-Control','public,max-age=300').type('html').send(renderIndex()));
 app.get(PATH,(_req,res)=>res.set('Cache-Control','public,max-age=300').type('html').send(renderRobRun()));
}
module.exports={PATH,UPDATED,SECTIONS,renderRobRun,renderIndex,register};