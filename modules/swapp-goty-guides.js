'use strict';
/**
 * SWAPP Game Awards 2017-2025: editorial selection.
 * Official winners only; no fictitious second-place TGA rankings.
 */
const {layout}=require('./swapp-news/site-shell');
const GAMES=require('./swapp-goty-data');
const ORIGIN='https://swapp.tv', ROOT='/guides/game-awards-2017-2025';
const WEIGHTS=[30,25,20,15,10];
const LABELS=['Gameplay et systèmes','Récit et univers','Art et ambiance sonore','Originalité et influence','Rythme et accessibilité'];
const YEARS=[2017,2018,2019,2020,2021,2022,2023,2024,2025];
const PUBLIC_PATHS=Object.freeze([ROOT,...GAMES.map(g=>ROOT+'/'+g.slug)]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const score=g=>g.scores.reduce((a,b)=>a+b,0);
const href=g=>ROOT+'/'+g.slug;
const byYear=y=>GAMES.filter(g=>g.year===y);
const schema=o=>'<script type="application/ld+json">'+JSON.stringify(o).replace(/</g,'\\u003c')+'</script>';
const crumbs=arr=>schema({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:arr.map(([name,path],i)=>({'@type':'ListItem',position:i+1,name,item:ORIGIN+path}))});
const sourceUrl=y=>y===2017?'https://www.gamespot.com/gallery/all-the-game-awards-game-of-the-year-winners-to-date/2900-7352/':'https://thegameawards.com/rewind/year-'+y;
function chrome(title,description,path,content,json){
 const metadata='<link rel="canonical" href="'+ORIGIN+path+'">'+
 '<meta property="og:type" content="article"><meta property="og:site_name" content="SWAPP">'+
 '<meta property="og:locale" content="fr_FR"><meta property="og:title" content="'+esc(title)+'">'+
 '<meta property="og:description" content="'+esc(description)+'">'+
 '<meta property="og:url" content="'+ORIGIN+path+'">'+
 '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="'+esc(title)+'">'+
 '<meta name="twitter:description" content="'+esc(description)+'">'+json;
 return layout({title,description,active:'actus',metadata,content:'<main class="sg">'+content+'</main>',
  scripts:'<link rel="stylesheet" href="/assets/swapp-goty.css?v=20261112">',extraCss:''});
}
function card(g){
 return '<a href="'+href(g)+'" class="sg-card" data-winner="'+g.winner+'" aria-label="Lire '+esc(g.title)+'">'+
 '<span class="sg-card-top"><span class="sg-label">'+(g.winner?'Gagnant officiel du GOTY':'Challenger sélectionné')+'</span><strong>'+score(g)+'<small>/100</small></strong></span>'+
 '<h3>'+esc(g.title)+'</h3><p>'+esc(g.hook)+'</p><span class="sg-card-footer">Lire la fiche et les conseils →</span></a>';
}
function index(){
 const title='Game Awards 2017–2025 : 18 jeux incontournables et notes SWAPP';
 const description='Palmarès GOTY 2017 à 2025 : 18 jeux analysés, notes SWAPP, conseils pour débuter, forces, limites et comparatifs pour choisir.';
 const hero='<header class="sg-hero"><div><span class="sg-kicker">SWAPP · LE GRAND DOSSIER 2017—2025</span>'+
 '<h1>9 années.<br>18 jeux.<br>Des aventures à vivre.</h1>'+
 '<p>De Breath of the Wild à Clair Obscur, de Red Dead Redemption 2 à Baldur’s Gate 3 : quels chefs-d’œuvre méritent votre temps en 2026 ? Retrouvez les vainqueurs officiels du Game of the Year et neuf challengers marquants.</p>'+
 '<nav class="sg-pills" aria-label="Sommaire rapide"><a href="#palmares">Explorer les 9 années</a><a href="#methode">Comprendre les notes</a></nav></div>'+
 '<aside class="sg-number"><span>2017 — 2025</span><strong>18</strong><p>fiches individuelles, comparatifs et conseils concrets</p></aside></header>';
 const trust='<aside class="sg-trust"><strong>Transparence éditoriale.</strong> The Game Awards ne décernent pas de deuxième place officielle. Les jeux de la colonne « 2nd » de l’image d’origine sont présentés ici comme <strong>challengers sélectionnés</strong>, jamais comme vice-champions. Les notes sur 100 sont des <strong>appréciations éditoriales SWAPP</strong>, distinctes de Metacritic, d’un vote du public et de tests techniques que nous n’avons pas réalisés.</aside>';
 const recommendations=[['Quel jeu pour l’histoire ?','Red Dead Redemption 2','red-dead-redemption-2','Une fresque lente, humaine et exceptionnelle.'],
 ['Quel jeu pour décider ?','Baldur’s Gate 3','baldurs-gate-3','Vos choix ont des répercussions durables.'],
 ['Quel jeu pour se dépasser ?','Sekiro','sekiro-shadows-die-twice','Chaque combat vous apprend à mieux jouer.']];
 const picks='<section class="sg-section"><h2>Par quel jeu commencer ?</h2><p class="sg-muted">Le « meilleur » jeu dépend de votre envie et de votre tolérance au défi.</p><div class="sg-picks">'+recommendations.map(p=>'<a href="'+ROOT+'/'+p[2]+'"><strong>'+p[0]+'</strong><b>'+p[1]+'</b><span>'+p[3]+'</span></a>').join('')+'</div></section>';
 const years='<section class="sg-section" id="palmares"><h2>Gagnants et challengers par année</h2><p class="sg-muted">Deux jeux par année, chacun avec son propre dossier, sa note et ses conseils.</p><nav class="sg-years" aria-label="Choisir une année">'+YEARS.map(y=>'<a href="#annee-'+y+'">'+y+'</a>').join('')+'</nav></section>'+
 YEARS.map(y=>'<section class="sg-year" id="annee-'+y+'"><h2>'+y+' <small>GOTY officiel & choix alternatif</small></h2><div class="sg-pair">'+byYear(y).map(card).join('')+'</div></section>').join('');
 const method='<section class="sg-section sg-method" id="methode"><h2>Comment fonctionnent les notes SWAPP ?</h2><p>Notre grille comparative sur 100 répartit <strong>30 points pour le gameplay</strong>, <strong>25 pour le récit et l’univers</strong>, <strong>20 pour la direction artistique et sonore</strong>, <strong>15 pour l’originalité</strong> et <strong>10 pour le rythme et l’accessibilité</strong>. Chaque note est détaillée sur la fiche correspondante.</p><p>Ces scores expriment une <strong>sélection argumentée de la rédaction</strong>, sans prétendre mesurer objectivement le plaisir ou reproduire une moyenne critique. Deux points d’écart ne doivent pas décider seuls de votre achat : l’analyse, le genre et les limites comptent davantage.</p><h3>Qui est vraiment « deuxième » ?</h3><p>Personne officiellement : les Game Awards publient un vainqueur et une liste de nominés, pas un classement du second au dernier. Les challengers de notre dossier proviennent du montage ayant inspiré cette sélection. Pour les récompenses exactes, consultez <a href="https://thegameawards.com/rewind">les archives officielles</a>.</p></section>';
 const footer='<footer class="sg-sources">Rédaction SWAPP · dossier révisé le 12 novembre 2026. <a href="https://thegameawards.com/rewind">Palmarès The Game Awards</a> · <a href="'+sourceUrl(2017)+'">Historique 2017 (GameSpot)</a>. Les catégories de durée indiquent une tendance, pas une durée de vie garantie.</footer>';
 const markup='<div class="sg-wrap">'+hero+trust+picks+years+method+footer+'</div>';
 const json=schema({'@context':'https://schema.org','@type':'CollectionPage',name:title,url:ORIGIN+ROOT,description,inLanguage:'fr-FR',dateModified:'2026-11-12',author:{'@type':'Organization',name:'SWAPP'},mainEntity:{'@type':'ItemList',numberOfItems:GAMES.length,itemListElement:GAMES.map((g,i)=>({'@type':'ListItem',position:i+1,name:g.title,url:ORIGIN+href(g)}))}});
 return chrome(title,description,ROOT,markup,json+crumbs([['Accueil','/'],['Game Awards 2017–2025',ROOT]]));
}
function scorecard(g){
 return '<aside class="sg-scorecard"><span class="sg-kicker">SWAPP SCORE · APPRÉCIATION ÉDITORIALE</span><div class="sg-big">'+score(g)+'<small>/100</small></div><p>Ce score n’est ni une moyenne des joueurs ni un test matériel réalisé par SWAPP.</p>'+
 g.scores.map((v,i)=>'<div class="sg-meter"><div><span>'+LABELS[i]+'</span><strong>'+v+'/'+WEIGHTS[i]+'</strong></div><i><b style="width:'+(100*v/WEIGHTS[i]).toFixed(1)+'%"></b></i></div>').join('')+
 '<a class="sg-score-link" href="'+ROOT+'#methode">Méthode de notation →</a></aside>';
}
function detail(slug){
 const g=GAMES.find(g=>g.slug===slug);if(!g)return null;
 const other=byYear(g.year).find(item=>item.slug!==slug);
 const title=g.title+' : avis, note et guide pour bien débuter';
 const description='Guide '+g.title+' : note SWAPP '+score(g)+'/100, analyse, forces, limites, conseils débutant et comparatif '+other.title+'.';
 const head='<header class="sg-detail-head"><nav class="sg-breadcrumb"><a href="/">SWAPP</a> / <a href="'+ROOT+'">Game Awards 2017–2025</a> / '+g.year+'</nav>'+
 '<span class="sg-kicker">'+(g.winner?'GAGNANT OFFICIEL DU GOTY':'CHALLENGER DE NOTRE SÉLECTION')+' · '+g.year+'</span>'+
 '<h1>'+esc(g.title)+'</h1><p>'+esc(g.hook)+'</p><div class="sg-tags"><span>'+esc(g.genre)+'</span><span>'+esc(g.style)+'</span><span>Durée : '+esc(g.duration)+'</span></div></header>';
 const body='<article class="sg-article"><h2>Notre analyse : pourquoi ce jeu compte</h2><p>'+esc(g.analysis)+'</p>'+
 '<h2>Les grandes réussites</h2><ul>'+g.strengths.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
 '<h2>Ses défauts et limites</h2><p>'+esc(g.limits)+'</p>'+
 '<h2>Pour qui est-il incontournable en 2026 ?</h2><p>'+esc(g.forWho)+'</p>'+
 '<h2>Guide pour bien commencer : 3 conseils</h2><ol>'+g.start.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>'+
 '<aside class="sg-tip"><strong>Le conseil SWAPP</strong><p>'+esc(g.tip)+'</p></aside>'+
 '<h2>'+esc(g.title)+' ou '+esc(other.title)+' ?</h2><p>'+esc(g.compare)+'</p>'+
 '<div class="sg-versus"><strong>L’autre choix de '+g.year+' : '+esc(other.title)+'</strong><p>Comparer ces deux expériences permet de choisir selon vos goûts, pas selon la seule récompense.</p><a href="'+href(other)+'">Lire l’analyse '+esc(other.title)+' — '+score(other)+'/100 →</a></div>'+
 '<section class="sg-faq"><h2>Questions fréquentes</h2><h3>'+esc(g.title)+' vaut-il encore le coup en 2026 ?</h3><p>Il conserve ses qualités distinctives : '+esc(g.strengths.join(' ; ').toLowerCase())+'. Prenez aussi en compte cette réserve : '+esc(g.limits)+'</p>'+
 '<h3>Faut-il être un joueur expérimenté ?</h3><p>'+esc(g.forWho)+' Les trois conseils précédents aident à préparer les premières heures.</p>'+
 '<h3>Combien de temps faut-il pour terminer le jeu ?</h3><p>La durée est plutôt <strong>'+esc(g.duration.toLowerCase())+'</strong>. Elle dépend de la difficulté choisie, de l’exploration et des activités annexes.</p></section></article>';
 const foot='<nav class="sg-next"><a href="'+ROOT+'">Voir les 18 jeux du dossier</a><a href="'+href(other)+'">Comparer avec '+esc(other.title)+'</a></nav>'+
 '<footer class="sg-sources"><strong>Sources & méthode.</strong> <a href="'+sourceUrl(g.year)+'">'+(g.year===2017?'Historique du GOTY 2017':'Palmarès officiel '+g.year)+'</a>. '+
 (g.winner?'La victoire GOTY est un résultat officiel.':'Ce challenger est une sélection éditoriale, pas un « deuxième » officiel.')+
 ' Score et conseils originaux SWAPP, révision du 12 novembre 2026. Aucune session de jeu ou benchmark réalisés pour cette fiche n’est revendiquée. <a href="'+ROOT+'#methode">Voir le barème</a>.</footer>';
 const markup='<div class="sg-wrap">'+head+'<div class="sg-columns">'+body+scorecard(g)+'</div>'+foot+'</div>';
 const json=schema({'@context':'https://schema.org','@type':'Article',headline:title,description,mainEntityOfPage:ORIGIN+href(g),inLanguage:'fr-FR',dateModified:'2026-11-12',author:{'@type':'Organization',name:'SWAPP'},publisher:{'@type':'Organization',name:'SWAPP',url:ORIGIN},about:{'@type':'VideoGame',name:g.title}});
 return chrome(title,description,href(g),markup,json+crumbs([['Accueil','/'],['Game Awards 2017–2025',ROOT],[g.title,href(g)]]));
}
function render(pathname){
 const p=String(pathname||'').replace(/\/+$/,'')||'/';
 if(p===ROOT)return index();
 if(!p.startsWith(ROOT+'/'))return null;
 const slug=p.slice(ROOT.length+1);
 if(!/^[a-z0-9-]+$/.test(slug))return null;
 return detail(slug);
}
function registerRoutes(app){
 if(!app||typeof app.get!=='function')throw new TypeError('Express app required');
 app.get(/^\/guides\/game-awards-2017-2025(?:\/[a-z0-9-]+)?\/?$/, (req,res,next)=>{
  const html=render(req.path);
  if(!html)return next();
  res.set('Cache-Control','public, max-age=180, stale-while-revalidate=3600');
  return res.type('html').send(html);
 });
}
module.exports={ROOT,PUBLIC_PATHS,GAMES,WEIGHTS,LABELS,render,registerRoutes,score};
