'use strict';
/**
 * SWAPP AION 2 academy: original educational content, permanent indexed URLs.
 * No game artwork is reproduced from third-party guide sites.
 * Public editorial screenshots: NC/NCSOFT and Steam (credit shown).
 */
const {layout}=require('./swapp-news/site-shell');
const {classPlaybook}=require('./swapp-aion2-playbooks');
const {chapterPlaybook}=require('./swapp-aion2-chapter-clinics');
const ORIGIN='https://swapp.tv', ROOT='/guides/aion-2';
const HERO='https://blogfiles.ncsoft.net/news/186b69f6-2a8d-4e72-9076-c72221de00b5.jpg';
const STEAM='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3393110/10aa4b096ebe6af0d1dd7882e5ba004271aef6f7/header.jpg';
const SOURCE='https://about.ncsoft.com/en/news/article/aion2_update_20260421';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SECTIONS=[
 ['debuter','Bien débuter','Commencer sans erreur','Départ, faction, mouvements et premiers objectifs','01'],
 ['progression','Progression 1–45','Monter efficacement','Les paliers, compétences, Stigmas et routines','02'],
 ['classes','Les huit classes','Trouver son style','Tank, DPS, magie et soutien','03'],
 ['equipement','Équipement & systèmes','Comprendre sa puissance','Améliorations, Daevanion, Stigmas et Arcana','04'],
 ['pve','Donjons & PvE','Réussir ses premières instances','Mécaniques de boss, placements et coopération','05'],
 ['pvp','Arènes & Abysses','Survivre et progresser','Vol, contrôles, duels et combats entre factions','06'],
 ['macros','Macros & commandes','Jouer avec plus de précision','Organiser les actions sans automatisation abusive','07']
];
const CLASSES=[
 {slug:'templier',name:'Templier',icon:'♜',role:'Tank',tone:'steel',weapon:'Épée + bouclier',level:'Intermédiaire',deck:'Le pilier de l’équipe : tenir l’aggro, bloquer et protéger.',
 intro:'Le Templier porte l’affrontement au contact. Il stabilise la position du boss et permet aux autres joueurs de réaliser leurs actions sans être constamment menacés.',pve:'En donjon, place le boss à un endroit lisible, conserve sa menace et espace tes capacités de défense. Privilégie la maîtrise des mécaniques avant la recherche de dégâts.',pvp:'En PvP, protège les joueurs fragiles, interromps les adversaires dangereux et occupe l’espace. Un Templier utile ne se contente pas de poursuivre un ennemi isolé.',stats:'Défense adaptée au contenu, blocage, précision suffisante et disponibilité des protections.',combo:'Engager → stabiliser la menace → surveiller les attaques → protection au bon moment → reprise de menace.',mistake:'Déclencher toutes les protections en même temps et se retrouver sans réponse lors de la prochaine attaque.'},
 {slug:'gladiateur',name:'Gladiateur',icon:'⚔',role:'DPS mêlée',tone:'ember',weapon:'Arme lourde à deux mains',level:'Accessible',deck:'Dégâts au contact, frappes de zone et présence en première ligne.',
 intro:'Le Gladiateur convient à celles et ceux qui veulent rester au cœur du combat. Il alterne attaques puissantes, mobilité courte et gestion des moments où rester au contact devient dangereux.',pve:'Travaille une rotation simple et régulière. Pendant les mécanismes de boss, mieux vaut interrompre une attaque que subir des dégâts évitables.',pvp:'Garde un déplacement pour rejoindre la cible après son esquive. Les meilleurs dégâts arrivent lorsque l’adversaire ne peut plus facilement reculer.',stats:'Précision nécessaire, puissance offensive, survie minimale et synergie des effets.',combo:'Approcher → installer la pression → exploiter le contrôle → frappe principale → repositionnement.',mistake:'Consommer tous les moyens de rapprochement avant que l’adversaire n’ait dépensé sa mobilité.'},
 {slug:'assassin',name:'Assassin',icon:'✦',role:'DPS mêlée',tone:'violet',weapon:'Dagues',level:'Exigeant',deck:'Furtivité, placement dans le dos et dégâts concentrés.',
 intro:'L’Assassin récompense l’anticipation. Il cherche une fenêtre courte pendant laquelle sa cible ne peut pas réagir efficacement, puis disparaît du danger.',pve:'Observe les déplacements du boss, trouve un angle sûr et coordonne tes temps forts avec les périodes de vulnérabilité. La régularité compte autant que les pointes de dégâts.',pvp:'Sélectionne un adversaire exposé, prépare ton ouverture et garde toujours une sortie. Ton avantage repose sur la surprise et le placement.',stats:'Précision, dégâts critiques et efficacité du positionnement selon le build.',combo:'Préparation → ouverture dans le dos → enchaînement rapide → contrôle disponible → sortie.',mistake:'Rester immobile devant la cible après la fin de la fenêtre offensive.'},
 {slug:'rodeur',name:'Rôdeur',icon:'➶',role:'DPS distance',tone:'mint',weapon:'Arc',level:'Accessible',deck:'Précision à distance, mobilité et gestion de l’espace.',
 intro:'Le Rôdeur combat en mouvement tout en maintenant une pression constante. Sa survie dépend de sa capacité à garder une bonne distance.',pve:'Évite les zones dangereuses sans arrêter toutes tes attaques. Anticipe les déplacements plutôt que de courir au hasard lorsque le boss prépare une mécanique.',pvp:'Ralentis les poursuivants, exploite les obstacles et ne laisse pas les combattants de mêlée s’installer au contact.',stats:'Précision, puissance des attaques à distance et mobilité disponible.',combo:'Marquer la cible → maintenir la distance → attaques régulières → contrôle défensif → repositionnement.',mistake:'Tirer à l’arrêt jusqu’à être encerclé alors que tes déplacements font partie de ta défense.'},
 {slug:'sorcier',name:'Sorcier',icon:'✧',role:'DPS magique',tone:'blue',weapon:'Grimoire',level:'Intermédiaire',deck:'Puissants sorts élémentaires, dégâts de zone et contrôle.',
 intro:'Le Sorcier inflige de lourds dégâts avec des capacités magiques et peut contenir temporairement les ennemis. Son efficacité dépend de sa position avant l’incantation.',pve:'Prépare tes sorts importants lors des fenêtres où le boss reste disponible. Ne démarre pas une incantation longue juste avant une zone à éviter.',pvp:'Utilise les ralentissements et contrôles pour créer de la distance. Conserve une solution quand une classe de mêlée franchit ta portée.',stats:'Précision magique pertinente, dégâts des sorts et réduction de recharge selon la rotation.',combo:'Distance de sécurité → affaiblissement/contrôle → frappe principale → dégâts complémentaires → repli.',mistake:'Sacrifier le placement pour achever une incantation que l’ennemi peut interrompre.'},
 {slug:'spiritualiste',name:'Spiritualiste',icon:'◈',role:'Contrôle',tone:'orchid',weapon:'Orbe',level:'Exigeant',deck:'Invocations, affaiblissements et contrôle du rythme.',
 intro:'Le Spiritualiste prépare le terrain avant d’engager ses sorts les plus décisifs. Les invocations et altérations font partie d’un même plan de combat.',pve:'Maintiens tes effets utiles et surveille ton invocation. Mets l’accent sur la coordination des phases plutôt que sur une seule attaque spectaculaire.',pvp:'Force d’abord la cible à gaspiller ses protections, puis utilise tes contrôles déterminants au bon moment.',stats:'Précision suffisante, puissance adaptée au familier et aux effets, contrôle situationnel.',combo:'Invocation active → effet persistant → pression → contrôle opportun → exploitation.',mistake:'Oublier la gestion de l’esprit et lancer tous les contrôles sur une cible déjà immunisée.'},
 {slug:'clerc',name:'Clerc',icon:'✚',role:'Soin',tone:'gold',weapon:'Masse',level:'Intermédiaire',deck:'Soins, purifications, résurrection et sécurité du groupe.',
 intro:'Le Clerc lit le combat pour empêcher les situations critiques. Il garde l’équipe opérationnelle et soutient la survie des alliés.',pve:'Anticipe les attaques de zone, garde de quoi soigner après une mécanique et reste à portée sans te mettre en danger. Les purifications peuvent compter autant que les soins.',pvp:'Soigne sans te rendre vulnérable. Place-toi près des protections alliées et n’attends pas d’être pris pour cible pour préparer ta défense.',stats:'Efficacité de soin, gestion des recharges, survie et rapidité d’exécution.',combo:'Observer les barres de vie → soin préventif → purification → soin de groupe → retour à un placement sûr.',mistake:'Tout dépenser pour relever une seule barre de vie alors qu’une attaque collective arrive.'},
 {slug:'aede',name:'Aède',icon:'❖',role:'Soutien',tone:'rose',weapon:'Bâton',level:'Intermédiaire',deck:'Buffs, dégâts et soutien hybride pour toute l’équipe.',
 intro:'L’Aède améliore les performances des alliés tout en participant directement au combat. Il demande de savoir alterner plusieurs priorités.',pve:'Maintiens les effets utiles et frappe lors des fenêtres sûres. Ne te transforme pas en simple DPS si l’équipe compte sur ton soutien.',pvp:'Appuie l’initiative d’un allié, aide à casser la pression adverse et choisis quand combattre plutôt que soigner.',stats:'Précision, puissance offensive utile, efficacité des capacités de soutien et recharges.',combo:'Effets de groupe → entrée dans le combat → enchaînement court → soutien nécessaire → repositionnement.',mistake:'Oublier les améliorations et les besoins des alliés en cherchant uniquement des dégâts.'}
];
const list=items=>'<ul class="ag-bullets">'+items.map(i=>'<li>'+i+'</li>').join('')+'</ul>';
const note=(label,body)=>'<aside class="ag-note"><strong>'+esc(label)+'</strong><p>'+body+'</p></aside>';
const content={
 debuter:{
 title:'Bien débuter dans Aion 2',lead:'Ton parcours depuis l’écran de création jusqu’aux premières instances. Un ordre simple pour ne pas gaspiller tes ressources.',
 body:
 '<section id="faction" class="ag-lesson"><span class="ag-eyebrow">ÉTAPE 01</span><h2>Serveur et faction : décide avant de foncer</h2><p>Aion 2 oppose les Élyséens et les Asmodiens. Leurs territoires et leur récit diffèrent. Le bon choix est d’abord celui qui te permet de rejoindre tes amis sur le bon serveur. Changer de classe exige de créer un autre personnage ; ne suppose pas que le transfert de faction sera libre.</p>'+note('Avant de cliquer sur Jouer','Demande à tes amis leur serveur et leur faction. Une erreur au départ peut compliquer toutes les sessions de groupe.')+'</section>'+
 '<section id="premiers-pas" class="ag-lesson"><span class="ag-eyebrow">ÉTAPE 02</span><h2>Les dix premiers niveaux</h2><p>Privilégie les quêtes de campagne. Apprends à lire les indicateurs ennemis, à esquiver et à reconnaître les capacités importantes. L’Ascension te fait découvrir le vol : entraîne-toi autant à atterrir qu’à décoller.</p>'+list(['Régler les touches, la caméra et l’interface avant les premières instances.','Essayer plusieurs enchaînements sur des ennemis ordinaires.','Conserver les consommables rares jusqu’à ce que leur usage soit clair.'])+'</section>'+
 '<section id="vol" class="ag-lesson"><span class="ag-eyebrow">ÉTAPE 03</span><h2>Le vol : une vraie mécanique de jeu</h2><div class="ag-visual-strip"><img src="'+HERO+'" alt="Illustration promotionnelle officielle Aion 2 : les deux factions ailées" loading="lazy"><div><strong>Observe le ciel, pas seulement les ennemis.</strong><p>Surveille ta trajectoire, ton endurance de vol et le terrain qui peut interrompre ta fuite. Dans les Abysses, la hauteur change aussi le combat.</p><small>Visuel officiel © NCSOFT</small></div></div></section>'+
 '<section id="objectifs" class="ag-lesson"><span class="ag-eyebrow">ÉTAPE 04</span><h2>Choisir trois objectifs utiles</h2>'+list(['Avancer dans la campagne sans rester bloqué sur les activités secondaires.','Mettre en place une rotation que tu peux exécuter même en mouvement.','Apprendre la fonction de chaque équipement avant de dépenser des matériaux.'])+'</section>'
 },
 progression:{
 title:'Progression du niveau 1 à 45',lead:'Visualise les étapes majeures de la première saison mondiale, sans confondre les guides coréens plus anciens.',
 body:'<section class="ag-lesson"><h2>La route jusqu’au niveau 45</h2><div class="ag-timeline">'+[
 ['1–10','Découverte','Campagne, premières compétences, apprentissage du vol.'],
 ['11–21','Personnalisation','Comprendre le Daevanion et perfectionner la rotation.'],
 ['22–37','Spécialisation','Déblocage progressif des emplacements de Stigma.'],
 ['38–45','Préparation du endgame','Améliorer l’équipement, apprendre les instances et stabiliser son build.'],
 ['45','Fin de jeu','Donjons, raids et progression avancée des systèmes.']
 ].map((x,i)=>'<div class="ag-milestone"><b>'+x[0]+'</b><div><strong>'+x[1]+'</strong><p>'+x[2]+'</p></div></div>').join('')+'</div></section>'+
 '<section class="ag-lesson"><h2>À quoi servent les Stigmas ?</h2><p>Ces capacités modifient la spécialisation. Les quatre emplacements se débloquent progressivement autour des niveaux 22, 27, 32 et 37 dans les guides de lancement de la version mondiale. Vérifie toujours les conditions exactes dans le client après une mise à jour.</p>'+note('Ne copie pas un build trop tôt','Un guide haut niveau peut supposer quatre Stigmas, des cartes Arcana rares et des statistiques que ton personnage ne possède pas.')+'</section>'+
 '<section class="ag-lesson"><h2>Une routine raisonnable</h2>'+list(['Utiliser les ressources et entrées quotidiennes qui ont réellement de la valeur.','Faire les contenus hebdomadaires accessibles plutôt que forcer un niveau de difficulté trop élevé.','Identifier la prochaine amélioration de ton personnage avant d’acheter ou de fabriquer.','Garder du temps pour le plaisir : exploration, monde et communauté.'])+'</section>'
 },
 equipement:{
 title:'Équipement, Daevanion et Arcana',lead:'Quatre systèmes différents, un seul objectif : améliorer la puissance réelle de ton personnage sans investir au hasard.',
 body:'<section class="ag-lesson"><h2>Les quatre couches de progression</h2><div class="ag-system-grid">'+[
 ['01','Équipement','Statistiques directes, pièces et amélioration.'],
 ['02','Stigmas','Capacités supplémentaires et options de spécialisation.'],
 ['03','Daevanion','Progression du personnage au-delà des objets portés.'],
 ['04','Arcana','Cartes et synergies pour affiner un style de jeu.']
 ].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong><p>'+x[2]+'</p></div>').join('')+'</div></section>'+
 '<section class="ag-lesson"><h2>Dans quel ordre investir ?</h2><p>Commence par un équipement cohérent avec ton rôle et une arme qui sert réellement tes compétences. Améliore les pièces durables, puis affine les Stigmas et les synergies de cartes lorsque tu comprends leur effet.</p>'+list(['Comparer les statistiques et non la seule rareté.','Vérifier les règles de transfert avant chaque remplacement.','Ne pas investir toutes les monnaies dans une pièce provisoire.','Conserver des ressources pour les compétences centrales et la survie.'])+'</section>'+
 '<section class="ag-lesson"><h2>Choisir l’Arcana</h2><p>Lis les bonus individuels puis les effets d’ensemble. Une combinaison moins rare mais adaptée à tes attaques fréquentes peut être plus utile qu’une carte prestigieuse sans synergie.</p>'+note('Versions régionales','Ne transplante pas mécaniquement les coûts, plafonds et bonus observés sur les serveurs coréens : les saisons et équilibrages peuvent différer.')+'</section>'
 },
 pve:{
 title:'Donjons, raids et PvE',lead:'Apprends à participer à un groupe sans subir chaque mécanique. La réussite vient de la lecture du combat.',
 body:'<section class="ag-lesson"><h2>La boucle d’un boss</h2><div class="ag-combat-steps">'+[
 ['01','Lire','Observer animations, zones et phases.'],
 ['02','Réagir','Esquiver, bloquer ou interrompre.'],
 ['03','Exploiter','Attaquer pendant une fenêtre sûre.'],
 ['04','Replacer','Se préparer à la mécanique suivante.']
 ].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong><span>'+x[2]+'</span></div>').join('')+'</div></section>'+
 '<section class="ag-lesson"><h2>Ce que le groupe attend de toi</h2>'+list(['Tank : maintenir une orientation stable du boss et répartir les défensifs.','DPS : continuer à contribuer sans ignorer les zones dangereuses.','Soutien : anticiper les moments collectifs et les effets à purifier.','Tout le monde : annoncer un échec de mécanique plutôt que le dissimuler.'])+'</section>'+
 '<section class="ag-lesson"><h2>Réussir sa première expédition</h2><p>Commence au niveau de difficulté approprié. Observe une mécanique à la fois, puis construis une rotation que tu peux interrompre proprement. Privilégie les donjons accessibles avant les contenus à exigences élevées.</p>'+note('Règle de groupe','Un joueur qui survit et respecte les mécaniques est plus utile qu’un joueur qui maximise quelques secondes de dégâts avant de mourir.')+'</section>'
 },
 pvp:{
 title:'PvP, arènes et Abysses',lead:'Le combat n’est pas seulement un duel de statistiques : le contrôle de l’espace et du tempo décide souvent du résultat.',
 body:'<section class="ag-lesson"><h2>La priorité : garder des options</h2><p>Avant d’essayer d’éliminer quelqu’un, maîtrise tes solutions de fuite, de contrôle et de protection. Une bonne ouverture ne sert à rien si ton personnage ne peut plus répondre à la contre-attaque.</p><div class="ag-combat-steps">'+[
 ['01','Repérer','Identifier l’ennemi et ses alliés.'],
 ['02','Forcer','Obtenir une esquive ou un défensif.'],
 ['03','Contrôler','Créer la fenêtre favorable.'],
 ['04','Décider','Achever ou décrocher selon le risque.']
 ].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong><span>'+x[2]+'</span></div>').join('')+'</div></section>'+
 '<section class="ag-lesson"><h2>La différence des Abysses</h2><p>Les combats aériens imposent de regarder verticalement. Surveille la réserve de vol et garde une trajectoire de sortie. En groupe, un joueur isolé devient une cible très facile.</p></section>'+
 '<section class="ag-lesson"><h2>Progresser sans s’éparpiller</h2>'+list(['Commencer par les modes adaptés à son équipement.','Apprendre les signatures visuelles des huit classes.','Analyser une défaite en distinguant erreur de placement et erreur de build.','Varier les compositions, mais modifier une seule chose à la fois.'])+'</section>'
 },
 macros:{
 title:'Macros et commandes par classe',lead:'Rendre les actions fréquentes plus confortables, sans remplacer le jugement, les déplacements et les réactions.',
 body:'<section class="ag-lesson"><h2>Ce qu’il faut organiser</h2><p>Les rotations basiques peuvent être simplifiées dans la limite des fonctionnalités prévues par le jeu. Conserve manuellement tes défensifs, esquives, déplacements, contrôles et capacités conditionnelles.</p><div class="ag-system-grid">'+[
 ['A','Actions régulières','À organiser en priorité, après essais sur cible d’entraînement.'],
 ['B','Défensifs','À déclencher selon les attaques, pas dès que possible.'],
 ['C','Soins','À utiliser après observation de la situation.'],
 ['D','Contrôles','À réserver pour une fenêtre réellement utile.']
 ].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong><p>'+x[2]+'</p></div>').join('')+'</div></section>'+
 '<section class="ag-lesson"><h2>Conseil par rôle</h2>'+list(['Templier / Gladiateur : séparer les attaques récurrentes des capacités de protection.','Assassin / Rôdeur : conserver manuellement les déplacements et les ouvertures.','Sorcier / Spiritualiste : éviter de lier les contrôles et sorts longs à une répétition automatique.','Clerc / Aède : garder soins et buffs situationnels accessibles immédiatement.'])+'</section>'+
 note('Jeu équitable','Évite les scripts externes, bots et automatisations non autorisées. Les réglages exacts des macros peuvent évoluer avec les correctifs.')
 }
};
const PUBLIC_PATHS=[ROOT,...SECTIONS.map(x=>ROOT+'/'+x[0]),...CLASSES.map(x=>ROOT+'/classes/'+x.slug)];
function schema(object){return '<script type="application/ld+json">'+JSON.stringify(object).replace(/</g,'\\u003c')+'</script>'}
function chrome(title,description,url,body){
 const meta='<link rel="canonical" href="'+ORIGIN+url+'"><meta property="og:type" content="article"><meta property="og:url" content="'+ORIGIN+url+'"><meta property="og:title" content="'+esc(title)+' · SWAPP"><meta property="og:description" content="'+esc(description)+'"><meta property="og:image" content="'+HERO+'">'+
 schema({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'SWAPP',item:ORIGIN},{'@type':'ListItem',position:2,name:'Guides Aion 2',item:ORIGIN+ROOT},...(url===ROOT?[]:[{'@type':'ListItem',position:3,name:title,item:ORIGIN+url}])]});
 const head='<link rel="stylesheet" href="/assets/swapp-aion2-guide.css?v=20261020-1"><link rel="stylesheet" href="/assets/swapp-aion2-expert.css?v=20261021-1"><script defer src="/assets/swapp-aion2-expert.js?v=20261021-1"></script><link rel="stylesheet" href="/assets/swapp-page-colors.css?v=20261017-appearance-v2"><script defer src="/assets/swapp-page-colors.js?v=20261017-appearance-v2"></script><script defer src="/assets/swapp-aion2-guide.js?v=20261020-1"></script>';
 return layout({title,description,metadata:meta,content:body,active:'guides',scripts:head});
}
function crumb(label){return '<nav class="ag-crumb" aria-label="Fil d’Ariane"><a href="/">SWAPP</a><span>›</span><a href="'+ROOT+'">Guides Aion 2</a>'+(label?'<span>›</span><span aria-current="page">'+esc(label)+'</span>':'')+'</nav>'}
function cover(title,subtitle,kicker,compact=false){
 return '<header class="ag-hero '+(compact?'ag-hero-small':'')+'">'+
 '<img class="ag-hero-art" src="'+HERO+'" alt="Illustration officielle Aion 2 : un chevalier et une guerrière ailée" fetchpriority="high" decoding="async">'+
 '<div class="ag-hero-inner"><span class="ag-kicker">'+esc(kicker)+'</span><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p><div class="ag-hero-actions"><a class="ag-action" href="'+ROOT+'/debuter">Commencer le guide <span aria-hidden="true">↗</span></a><a class="ag-action secondary" href="'+ROOT+'/classes">Choisir une classe</a></div></div><small class="ag-art-credit">Illustration officielle © NCSOFT</small></header>'
}
function shell(main,active){
 const nav='<nav class="ag-chapter-nav" aria-label="Chapitres du guide"><strong>LE SOMMAIRE</strong>'+
 '<a href="'+ROOT+'" '+(!active?'aria-current="page"':'')+'><span>◈</span> Vue d’ensemble</a>'+
 SECTIONS.map(x=>'<a href="'+ROOT+'/'+x[0]+'" '+(active===x[0]?'aria-current="page"':'')+'><span>'+x[4]+'</span>'+esc(x[1])+'</a>').join('')+'</nav>';
 return '<main class="ag-site">'+crumb(active?SECTIONS.find(x=>x[0]===active)?.[1]||active:'')+'<div class="ag-layout"><aside class="ag-rail">'+nav+'<div class="ag-rail-note"><strong>VERSION MONDIALE</strong><span>PC · Saison 1 · octobre 2026</span><a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">Source officielle ↗</a></div></aside><div class="ag-main">'+main+'</div></div></main>';
}
function classTile(c){
 return '<a class="ag-class-card" data-ag-role="'+esc(c.role)+'" href="'+ROOT+'/classes/'+c.slug+'"><span class="ag-emblem ag-'+c.tone+'" aria-hidden="true">'+c.icon+'</span><span class="ag-class-name">'+c.name+'</span><small>'+esc(c.role)+' · '+esc(c.level)+'</small><p>'+esc(c.deck)+'</p><span class="ag-card-link">Lire le guide <span aria-hidden="true">↗</span></span></a>'
}
function classesGrid(){return '<div class="ag-filters" aria-label="Filtrer les classes"><button type="button" aria-pressed="true" data-ag-filter="all">Toutes</button><button type="button" aria-pressed="false" data-ag-filter="DPS">DPS</button><button type="button" aria-pressed="false" data-ag-filter="Tank">Tank</button><button type="button" aria-pressed="false" data-ag-filter="Soin">Soin</button><button type="button" aria-pressed="false" data-ag-filter="Soutien">Soutien / contrôle</button></div><div class="ag-classes">'+CLASSES.map(classTile).join('')+'</div>'}
function index(){
 const main=cover('AION 2', 'Le centre de formation SWAPP : du premier envol au niveau 45, avec des tutoriels progressifs, des fiches de classes et des conseils de combat.', 'SWAPP / GUIDES DE JEU')+
 '<section class="ag-overview" aria-label="Informations essentielles"><div><strong>08</strong><span>classes jouables</span></div><div><strong>45</strong><span>niveau maximal · S1</span></div><div><strong>02</strong><span>factions rivales</span></div><div><strong>PC</strong><span>Steam / PURPLE</span></div></section>'+
 '<section class="ag-section"><div class="ag-heading"><div><span class="ag-eyebrow">APPRENDRE, PAS SCROLLER</span><h2>Construis ton parcours</h2></div><p>Sept modules courts et complémentaires. Tu avances dans l’ordre que tu préfères.</p></div><div class="ag-path-grid">'+SECTIONS.map(x=>'<a href="'+ROOT+'/'+x[0]+'" class="ag-path"><span class="ag-path-number">'+x[4]+'</span><div><strong>'+esc(x[1])+'</strong><p>'+esc(x[3])+'</p></div><span aria-hidden="true">↗</span></a>').join('')+'</div></section>'+
 '<section class="ag-section ag-first-advice"><span class="ag-eyebrow">DES CONSEILS, PAS SEULEMENT DES RUBRIQUES</span><h2>Trois décisions qui changent tes premières heures</h2><div class="ag-advice-grid"><div><strong>05 — Obtiens tes ailes</strong><p>Termine l’Ascension et entraîne-toi à contrôler ton vol.</p></div><div><strong>12 — Oriente ton Daevanion</strong><p>Renforce tes compétences fréquentes avant de disperser tes points.</p></div><div><strong>22 — Choisis ton premier Stigma</strong><p>Prends celui qui répond à ton rôle : menace, burst, soin ou soutien.</p></div></div><a class="ag-card-link" href="/guides/aion-2/debuter">Voir le plan de départ précis →</a></section>'+
 '<section class="ag-section"><div class="ag-heading"><div><span class="ag-eyebrow">PERSONNALISE TON AVENTURE</span><h2>Les huit classes</h2></div><p>Choisis selon ton style, pas selon une tier list temporaire.</p></div>'+classesGrid()+'</section>'+
 '<section class="ag-section"><div class="ag-photo-editorial"><img src="'+STEAM+'" loading="lazy" alt="Affiche promotionnelle officielle Aion 2 : Élyséenne et Asmodienne"><div><span class="ag-eyebrow">LE CONSEIL SWAPP</span><h2>Apprends à lire un combat.</h2><p>Une bonne esquive, une position stable et une capacité utilisée au bon moment comptent autant que le score de dégâts.</p><a href="'+ROOT+'/pve">Comprendre le PvE ↗</a><small>Visuel promotionnel © NCSOFT / Steam</small></div></div></section>'+
 '<section class="ag-section"><div class="ag-heading"><div><span class="ag-eyebrow">TA CHECKLIST</span><h2>Mon premier envol</h2></div><p>Suivi facultatif stocké uniquement dans ce navigateur.</p></div><div class="ag-checklist" data-ag-checklist><div class="ag-progress"><span><strong data-ag-progress-count>0/4</strong> objectifs terminés</span><div class="ag-progress-track"><div data-ag-progress-bar style="width:0%"></div></div></div>'+
 [['serveur','Choisir mon serveur et ma faction'],['vol','Débloquer et maîtriser le vol'],['classe','Comprendre le rôle de ma classe'],['donjon','Terminer ma première instance adaptée']].map(x=>'<label class="ag-task"><input type="checkbox" data-ag-task="'+x[0]+'"><span>'+esc(x[1])+'</span></label>').join('')+'</div></section>'+
 '<section class="ag-footer-next"><strong>Tu cherches des joueurs ou des créateurs ?</strong><p>SWAPP réunit guides, actualités et découverte de streams. Les lives sont proposés dans Découvrir, sans promettre qu’un stream Aion 2 est actuellement disponible.</p><a href="/decouvrir">Découvrir des créateurs ↗</a><a href="/social?game=Aion%202">Parler d’Aion 2 sur Social ↗</a></section>'+
 '<footer class="ag-sources">Rédaction originale SWAPP, mise à jour le 21 octobre 2026. <a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">NCSOFT : présentation officielle</a> · <a href="https://store.steampowered.com/app/3393110/AION_2/" target="_blank" rel="noopener noreferrer">Fiche Steam</a>. Les builds doivent être adaptés après les mises à jour.</footer>';
 return chrome('Aion 2 : guides, classes et tutoriels','Guides Aion 2 français : démarrage, niveau 45, huit classes, PvE, PvP, équipement et macros.',ROOT,shell(main,''));
}
function chapter(slug){
 if(slug==='classes'){
  return chrome('Les huit classes d’Aion 2','Choisir sa classe Aion 2 : tank, DPS, soin et soutien, guide français.',ROOT+'/classes',shell(cover('Choisir sa classe','Huit profils pour huit manières de découvrir Atréia. Une bonne classe est celle qui correspond à ton style de jeu.','CHAPITRE 03 · CLASSES',true)+'<section class="ag-section">'+classesGrid()+'</section>'+note('Important','Une tier list change avec l’équilibrage. Ici, on décrit le rôle de chaque classe plutôt que de promettre un classement définitif.'),'classes'));
 }
 const c=content[slug],sect=SECTIONS.find(x=>x[0]===slug);
 if(!c||!sect)return null;
 const next=SECTIONS[(SECTIONS.findIndex(x=>x[0]===slug)+1)%SECTIONS.length];
 const main=cover(c.title,c.lead,'CHAPITRE '+sect[4]+' · GUIDE',true)+
 '<div class="ag-article">'+(chapterPlaybook(slug)||c.body)+'</div>'+
 '<div class="ag-next"><span>POURSUIVRE LA FORMATION</span><a href="'+ROOT+'/'+next[0]+'">'+esc(next[1])+' <span aria-hidden="true">↗</span></a></div>'+
 '<footer class="ag-sources">Guide éditorial SWAPP · 21 octobre 2026. <a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">Présentation officielle NCSOFT</a>. Les paliers et règles de progression peuvent évoluer.</footer>';
 return chrome(c.title+' | Guide Aion 2',c.lead,ROOT+'/'+slug,shell(main,slug));
}
function classPage(slug){
 const c=CLASSES.find(x=>x.slug===slug);if(!c)return null;
 const main='<header class="ag-class-hero"><div><span class="ag-kicker">AION 2 / GUIDE DE CLASSE</span><div class="ag-emblem ag-'+c.tone+'" aria-hidden="true">'+c.icon+'</div><h1>'+c.name+'</h1><p>'+esc(c.deck)+'</p><div class="ag-class-tags"><span>'+esc(c.role)+'</span><span>'+esc(c.weapon)+'</span><span>'+esc(c.level)+'</span></div></div><img src="'+HERO+'" alt="Art officiel Aion 2 © NCSOFT"></header>'+
 classPlaybook(slug)+
 note('Erreur à éviter',esc(c.mistake))+
 '<div class="ag-next"><span>RETOUR AU CHOIX DES CLASSES</span><a href="'+ROOT+'/classes">Voir les huit classes ↗</a></div>'+
 '<footer class="ag-sources">Guide original SWAPP. Orientation PvE/PvP de départ : pas un classement de méta, pas une promesse de performance. Visuel officiel © NCSOFT.</footer>';
 return chrome(c.name+' Aion 2 : guide PvE et PvP',c.deck,ROOT+'/classes/'+slug,shell(main,'classes'));
}
function render(pathname){
 const path=String(pathname||'').replace(/\/+$/,'')||'/';
 if(path===ROOT)return index();
 if(!path.startsWith(ROOT+'/'))return null;
 const rest=path.slice(ROOT.length+1);
 if(rest.startsWith('classes/'))return classPage(rest.slice(8));
 if(rest.includes('/'))return null;
 return chapter(rest);
}
function registerAion2Routes(app){
 if(!app||typeof app.get!=='function')throw new TypeError('Express app required');
 app.get(/^\/guides\/aion-2(?:\/[a-z0-9-]+){0,2}\/?$/, (req,res,next)=>{
  const page=render(req.path);if(!page)return next();
  res.set('Cache-Control','public, max-age=180, stale-while-revalidate=3600');
  return res.type('html').send(page);
 });
}
module.exports={ROOT,PUBLIC_PATHS,CLASSES,SECTIONS,render,registerAion2Routes};
