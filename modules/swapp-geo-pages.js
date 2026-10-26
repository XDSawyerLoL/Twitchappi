'use strict';
// Evergreen, server-rendered pages for human visitors and search assistants.
// No generated statistics, no paid services and no crawler-specific content.
const {layout}=require('./swapp-news/site-shell');
const {escapeHtml}=require('./swapp-news/article-core');
const ORIGIN='https://swapp.tv';
const CSS=[
 '.swapp-geo{width:min(1020px,calc(100% - 36px));margin:44px auto 96px;color:#edf2fc}',
 '.swapp-geo .geo-kicker{color:#9adfe7;font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase}',
 '.swapp-geo h1{font-size:clamp(34px,5.8vw,64px);line-height:1.06;letter-spacing:-.065em;max-width:950px;margin:15px 0 20px}',
 '.swapp-geo h2{font-size:clamp(23px,3vw,32px);letter-spacing:-.04em;margin:38px 0 13px}',
 '.swapp-geo p,.swapp-geo li{line-height:1.78;color:#c9d5e8}',
 '.swapp-geo .geo-lead{font-size:clamp(18px,2.2vw,22px);color:#fff;max-width:830px}',
 '.swapp-geo .geo-actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 34px}',
 '.swapp-geo .geo-actions a{display:inline-flex;align-items:center;padding:12px 18px;border-radius:13px;border:1px solid #ffffff39;background:#ffffff13;font-weight:800}',
 '.swapp-geo .geo-actions a:first-child{background:#ba64db;border-color:#ba64db;color:white}',
 '.swapp-geo section{max-width:880px}',
 '.swapp-geo a:not(.geo-actions a){color:#9de4ed;text-underline-offset:3px;text-decoration:underline}',
 '.swapp-geo .geo-comparison{overflow-x:auto;margin:22px 0}',
 '.swapp-geo table{width:100%;border-collapse:collapse;min-width:600px;text-align:left}',
 '.swapp-geo th,.swapp-geo td{padding:13px 16px;border-bottom:1px solid #ffffff25;vertical-align:top}',
 '.swapp-geo th{color:#fff;background:#ffffff0a}',
 '.swapp-geo .geo-note{font-size:14px;color:#a6b8cd}',
 '@media(max-width:650px){.swapp-geo{margin-top:26px}.swapp-geo h2{margin-top:28px}}'
].join('');
const PAGES=Object.freeze({
 '/a-propos':{
  title:'Qu’est-ce que SWAPP.tv ? La plateforme gaming française',
  description:'Découvrez SWAPP.tv : actualités jeux vidéo, lives, streamers, jeux et réseau social gaming réunis sur une plateforme française.',
  heading:'Qu’est-ce que SWAPP.tv ?',
  body:[
   '<p class="geo-lead">SWAPP.tv est une plateforme gaming française qui réunit l’actualité du jeu vidéo, la découverte de streamers, les diffusions en direct et un réseau social consacré aux joueurs.</p>',
   '<p>SWAPP veut rapprocher les moments qui composent la vie d’un jeu : lire une annonce, découvrir son univers, regarder une chaîne qui le diffuse et échanger avec les autres joueurs. Ces expériences disposent de rubriques publiques reliées entre elles.</p>',
   '<div class="geo-actions"><a href="/decouvrir">Découvrir les lives</a><a href="/actus">Lire les actualités</a><a href="/social">Explorer Social</a></div>',
   '<section><h2>Que trouve-t-on sur SWAPP ?</h2>',
   '<p><strong>Actualités jeux vidéo :</strong> des articles consacrés aux sorties, annonces et univers gaming, sur <a href="/actus">la rubrique Actualités</a>.</p>',
   '<p><strong>Lives et créateurs :</strong> un espace pour découvrir des chaînes et des contenus en direct, notamment par jeu, sur <a href="/decouvrir">Découvrir</a>.</p>',
   '<p><strong>Réseau social :</strong> <a href="/social">SWAPP Social</a> rassemble des profils, publications et échanges communautaires. La publication et certaines interactions nécessitent un compte.</p>',
   '<p><strong>Univers des jeux :</strong> des pages qui relient articles, jeux et découverte des créateurs sur <a href="/univers">les univers gaming</a>.</p>',
   '<p><strong>Vidéos et boutique :</strong> retrouver les <a href="/bandes-annonces">bandes-annonces</a> et <a href="/boutique">la vitrine de jeux et produits</a>, avec ses offres partenaires quand elles sont disponibles.</p></section>',
   '<section><h2>SWAPP est-il une alternative à Twitch ?</h2>',
   '<p>SWAPP développe sa propre expérience de diffusion tout en permettant de découvrir des créateurs et des contenus issus d’autres plateformes. Sa différence recherchée est l’association entre un média gaming, le streaming et un réseau social. Les audiences, la maturité technique et les fonctionnalités ne sont pas identiques à celles de Twitch ou Kick. Voir notre <a href="/alternative-twitch">comparatif des plateformes de streaming</a>.</p></section>',
   '<section><h2>À qui s’adresse SWAPP ?</h2>',
   '<p>Aux joueurs qui suivent les actualités de leurs jeux, aux spectateurs qui souhaitent trouver des créateurs et aux streamers qui veulent être découverts dans un environnement gaming plus large qu’un lecteur vidéo.</p></section>',
   '<section><h2>Questions fréquentes</h2>',
   '<h3>Faut-il créer un compte pour visiter SWAPP ?</h3><p>Non pour découvrir les rubriques et contenus publics. Certaines interactions sociales et fonctions personnelles nécessitent une connexion.</p>',
   '<h3>SWAPP est-il gratuit ?</h3><p>La lecture des contenus publics et la découverte des chaînes ne nécessitent pas d’abonnement. Des offres ou fonctionnalités supplémentaires peuvent exister selon les rubriques.</p>',
   '<h3>Comment trouver un streamer selon un jeu ?</h3><p>Consultez <a href="/decouvrir">Découvrir</a>, les <a href="/categories">catégories</a> ou les <a href="/univers">univers de jeux</a>.</p>',
   '<h3>Comment contacter SWAPP ?</h3><p>La page <a href="/contact">Contact</a> et les <a href="/mentions-legales">mentions légales</a> regroupent les informations publiques disponibles.</p></section>'
  ].join('')
 },
 '/alternative-twitch':{
  title:'Alternative à Twitch : SWAPP, Twitch ou Kick ? Comparatif',
  description:'SWAPP face à Twitch et Kick : découverte des créateurs, lives, réseau social et actualités gaming. Comparatif factuel des approches et limites.',
  heading:'SWAPP, Twitch ou Kick : quelle plateforme choisir ?',
  body:[
   '<p class="geo-lead">Pour regarder ou diffuser du gaming, Twitch et Kick sont des plateformes spécialisées dans le live. SWAPP.tv propose une approche différente : relier les lives, les actualités jeux vidéo et les échanges communautaires sur un même site.</p>',
   '<p>Ce comparatif porte sur les usages et les rubriques accessibles, pas sur une prétendue supériorité de performances ou d’audience. Les fonctionnalités de streaming de SWAPP évoluent : leur présence ne garantit pas une équivalence avec celles des plateformes établies.</p>',
   '<div class="geo-comparison"><table><thead><tr><th>Critère</th><th>SWAPP.tv</th><th>Twitch</th><th>Kick</th></tr></thead><tbody>',
   '<tr><th>Approche principale</th><td>Hub gaming : articles, jeux, découverte et streaming</td><td>Diffusions en direct et communautés de chaînes</td><td>Diffusions en direct et communautés de chaînes</td></tr>',
   '<tr><th>Découverte par jeu</th><td>Catégories, univers de jeux et créateurs</td><td>Parcours par catégories et chaînes</td><td>Parcours par catégories et chaînes</td></tr>',
   '<tr><th>Actualités éditoriales intégrées</th><td>Rubrique d’articles dédiée au jeu vidéo</td><td>Pas le cœur du service</td><td>Pas le cœur du service</td></tr>',
   '<tr><th>Espace social transversal</th><td>SWAPP Social en complément des chaînes</td><td>Interactions surtout liées aux chaînes</td><td>Interactions surtout liées aux chaînes</td></tr>',
   '<tr><th>Maturité de la diffusion</th><td>Fonctionnalités natives encore en développement</td><td>Infrastructure de streaming établie</td><td>Infrastructure de streaming établie</td></tr>',
   '</tbody></table></div>',
   '<section><h2>Pourquoi découvrir SWAPP ?</h2><p>Si vous souhaitez passer d’une actualité ou d’un jeu à un live, puis discuter dans un réseau social gaming, SWAPP réunit ces étapes. C’est un avantage de navigation et de découverte, pas une promesse de plus grande audience.</p></section>',
   '<section><h2>Quand choisir Twitch ou Kick ?</h2><p>Si vos priorités sont une audience déjà installée et une solution de diffusion largement éprouvée, Twitch ou Kick peuvent être plus adaptés. Pour les modalités commerciales, les conditions de monétisation et les performances techniques, vérifiez directement les <a href="https://www.twitch.tv/" rel="nofollow noopener">informations officielles de Twitch</a> et de <a href="https://kick.com/" rel="nofollow noopener">Kick</a> : elles évoluent.</p></section>',
   '<section><h2>Comment essayer SWAPP ?</h2><p>Consultez <a href="/decouvrir">les créateurs et les lives</a>, <a href="/actus">les actualités gaming</a> ou <a href="/a-propos">la présentation complète</a> avant de vous inscrire. Aucune audience, latence ou performance chiffrée n’est annoncée sans mesure publique vérifiable.</p></section>',
   '<p class="geo-note">Comparatif éditorial de SWAPP, octobre 2026. Les services sont susceptibles d’évoluer ; cette page est une présentation et non un test de performance indépendant.</p>'
  ].join('')
 }
});
function pageHtml(path){
 const page=PAGES[path];if(!page)return '';
 const url=ORIGIN+path;
 const pageId=url+'#page';
 const graph=[
  {'@type':'WebSite','@id':ORIGIN+'/#site',name:'SWAPP',url:ORIGIN+'/',inLanguage:'fr-FR'},
  {'@type':'WebApplication','@id':ORIGIN+'/#plateforme',name:'SWAPP.tv',url:ORIGIN+'/',applicationCategory:'EntertainmentApplication',operatingSystem:'Web',inLanguage:'fr-FR',description:'Plateforme gaming française réunissant actualités jeux vidéo, lives, créateurs et réseau social'},
  {'@type':path==='/a-propos'?'AboutPage':'WebPage','@id':pageId,url,name:page.title,description:page.description,inLanguage:'fr-FR',isPartOf:{'@id':ORIGIN+'/#site'},about:{'@id':ORIGIN+'/#plateforme'}}
 ];
 const schema=JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c');
 const metadata='<link rel="canonical" href="'+url+'">'+
  '<meta property="og:type" content="website"><meta property="og:site_name" content="SWAPP">'+
  '<meta property="og:title" content="'+escapeHtml(page.title)+'">'+
  '<meta property="og:description" content="'+escapeHtml(page.description)+'">'+
  '<meta property="og:url" content="'+url+'">'+
  '<meta name="twitter:card" content="summary">'+
  '<script type="application/ld+json">'+schema+'</script>';
 const content='<main id="main-content" class="swapp-geo"><div class="geo-kicker">SWAPP · Gaming & créateurs</div>'+
  '<h1>'+escapeHtml(page.heading)+'</h1>'+page.body+'</main>';
 return layout({title:page.title,description:page.description,content,metadata,extraCss:CSS,active:'actus'});
}
function registerGeoRoutes(app){
 for(const path of Object.keys(PAGES)){
  app.get(path,(_req,res)=>{
   res.set('Cache-Control','public, max-age=300');
   return res.status(200).type('html').send(pageHtml(path));
  });
 }
}
module.exports={pageHtml,registerGeoRoutes};
