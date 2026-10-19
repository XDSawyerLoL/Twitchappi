'use strict';
// A narrow, reviewable editorial correction for the legacy SWAPP article.
// Does not alter Firestore documents, account data or other articles.
// When an editor replaces the original erroneous copy, the override stops.
const SLUG='world-of-warcraft-forever-le-trailer';
const outdatedText=/On a testé World of Warcraft Forever|double classes|World of Warcraft: Forever a été testé par des joueurs/i;
const body=[
'**Mise à jour éditoriale du 19 octobre 2026.** Cette publication présentait initialement World of Warcraft: Forever comme un jeu testé par la rédaction. SWAPP ne dispose pas d’un test de première main à publier : il s’agit ici d’une présentation et d’une analyse des annonces officielles de Blizzard, et non d’un avis après essai.',
'## Une nouvelle branche permanente d’Azeroth',
'World of Warcraft: Forever n’est pas une extension de la version moderne ni une saison temporaire de WoW Classic. Blizzard le présente comme un univers pérenne parallèle à ces deux offres, inspiré du jeu d’origine et appelé à évoluer. Le cadre se situe après Warcraft III: Reforged – Forsaken Kingdom et avant les événements du Cœur du Magma. Les joueurs repartiront sur les Royaumes de l’Est et Kalimdor, avec un plafond de niveau fixé à 60.',
'Cette orientation répond à une attente précise : retrouver le sentiment d’aventure collective d’Azeroth sans figer définitivement son contenu. Elle crée aussi un défi pour Blizzard : proposer de nouvelles histoires et de nouveaux parcours sans réduire la place de la découverte, de l’entraide et de la progression lente qui caractérisaient le WoW original.',
'## Ce que montre la bande-annonce officielle',
'La bande-annonce de gameplay diffusée le 12 septembre 2026 sur la chaîne YouTube officielle World of Warcraft présente une nouvelle approche de l’exploration, des paysages connus revisités et des capacités inédites. Ces séquences illustrent la direction du projet ; elles ne permettent pas à elles seules de juger de l’équilibrage, des performances en conditions réelles ou de la qualité du contenu final.',
'Il faut donc distinguer les promesses de la présentation de ce que les joueurs peuvent constater dans la bêta. Aucun verdict sur le gameplay, les graphismes ou la stabilité ne peut être attribué à un test SWAPP qui n’a pas eu lieu.',
'## Date de sortie et accès à la bêta',
'Blizzard annonce une sortie mondiale le **5 novembre 2026 à minuit, heure de Paris**. L’accès à Forever est inclus avec un abonnement ou du temps de jeu World of Warcraft actif. Des éditions supérieures optionnelles sont commercialisées séparément. La bêta a débuté le 17 septembre 2026 et doit s’achever le 21 octobre, selon le calendrier officiel publié par Blizzard.',
'Les éditions donnant accès à la bêta et leurs bonus ne doivent pas être confondues avec l’abonnement nécessaire pour jouer à la sortie. Avant d’acheter, il convient de vérifier les conditions exactes et les offres sur Battle.net.',
'## Le système d’héritage : une progression qui dépasse le niveau 60',
'Parmi les nouveautés confirmées, Blizzard décrit un système d’héritage lié au compte, qui récompense l’exploration et différents défis. Les avantages pourront être débloqués en jouant plusieurs personnages, mais Blizzard précise qu’il reste possible de les obtenir avec un seul personnage. Cette progression horizontale vise à prolonger l’intérêt du jeu sans augmenter continuellement le niveau maximal.',
'Le point à surveiller sera son équilibre : si les avantages facilitent la vie sans devenir des obligations de progression, le système pourrait soutenir plusieurs styles de jeu. À l’inverse, des récompenses trop structurantes risqueraient d’imposer une routine ; seule l’expérience des joueurs permettra d’en juger.',
'## Ce qui reste à vérifier après la sortie',
'Trois sujets détermineront si Forever trouve son public : l’intérêt réel des régions revisitées après les premières heures, la qualité du contenu ajouté dans la durée et la capacité à accueillir simultanément nouveaux joueurs, vétérans et groupes organisés. L’annonce d’un projet permanent est une intention de conception, pas encore une garantie sur le rythme futur des mises à jour.',
'Notre regard pour l’instant : Forever possède une proposition identifiable entre nostalgie et renouvellement, mais la prudence s’impose avant de parler de réussite. SWAPP actualisera ce dossier sur la base de faits vérifiés et de tests explicitement attribués.'
].join('\n\n');
const sources=[
{label:'Blizzard — Forgez un nouveau destin avec World of Warcraft: Forever (12 septembre 2026)',url:'https://worldofwarcraft.blizzard.com/fr-fr/news/24302093'},
{label:'Blizzard — Éditions, bêta et calendrier de sortie (12 septembre 2026)',url:'https://worldofwarcraft.blizzard.com/fr-fr/news/24301508/pre-purchase-world-of-warcraft-forever-upgrades-and-begin-your-next-journey-in-azeroth'},
{label:'Blizzard — Découvrez le système d’héritage (23 septembre 2026)',url:'https://worldofwarcraft.blizzard.com/fr-fr/news/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system'},
{label:'World of Warcraft — bande-annonce officielle de gameplay (YouTube, 12 septembre 2026)',url:'https://www.youtube.com/watch?v=uQuKE0KDgiM'}
];
function correctWoWForever(article){
 if(!article||String(article.slug||'')!==SLUG)return article;
 const check=[article.body,article.summary].map(x=>String(x||'')).join(' ');
 if(!outdatedText.test(check))return article;
 return {...article,
  title:'World of Warcraft: Forever : bande-annonce, sortie et nouveautés',
  summary:'Blizzard prépare une nouvelle Azeroth permanente pour le 5 novembre 2026. Bande-annonce officielle, bêta, système d’héritage et analyse des annonces, sans prétendre à un test SWAPP.',
  body,
  contentType:'video',
  game:'World of Warcraft',
  author:'Rédaction SWAPP',
  sources,
  trailerUrl:'https://www.youtube.com/watch?v=uQuKE0KDgiM',
  image:null, // Original remote illustration had no verified reuse authorization.
  commercialLinks:[], // Remove unrelated affiliate offer from corrected editorial.
  seo:{title:'World of Warcraft: Forever : trailer, sortie et nouveautés',
   description:'World of Warcraft: Forever sort le 5 novembre 2026. Analyse sourcée, bande-annonce officielle, bêta et progression d’héritage.'},
  updatedAt:'2026-10-19T12:00:00.000Z'
 };
}
module.exports={correctWoWForever,SLUG};
