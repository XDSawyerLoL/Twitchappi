/* ACTUS is a real view inside the existing SWAPP application. */
(()=>{'use strict';
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=String(text);return x;};
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
const date=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';};
const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(s||'');

// Editorial taxonomy: one /actus listing, with user-visible TAGS (not separate pages).
const SWAPP_TOPICS=[
 {id:'',label:'Toutes les actualités'},
 {id:'GAMING',label:'GAMING'},
 {id:'DOSSIERS',label:'Dossiers'},
 {id:'AI',label:'AI'},
 {id:'ROBOTICS',label:'ROBOTICS'},
 {id:'FUTURE',label:'FUTURE'}
];
const normalizeTopic=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[\s_-]+/g,' ');
const topicCode=value=>{
 const tag=normalizeTopic(value);
 if(['gaming','jeu video','jeux video','jv'].includes(tag))return 'GAMING';
 if(['dossiers','dossier'].includes(tag))return 'DOSSIERS';
 if(['ai','ia','intelligence artificielle','artificial intelligence'].includes(tag))return 'AI';
 if(['robotics','robotique','robots','robots et automatisation','automatisation'].includes(tag))return 'ROBOTICS';
 if(['future','futur','technologies emergentes','technologie emergente','emerging technologies'].includes(tag))return 'FUTURE';
 return '';
};
const articleTopics=article=>{
 const explicit=[...(Array.isArray(article?.tags)?article.tags:[]),article?.category]
  .map(topicCode).filter(Boolean);
 const unique=[...new Set(explicit)];
 // Historical gaming articles predate the new topic tags; preserve their discoverability.
 return unique.length?unique:['GAMING'];
};
const hasTopic=(article,topic)=>!topic||articleTopics(article).includes(topic);
const queryTopic=()=>{
 try{const tag=new URLSearchParams(window.location.search).get('tag');return topicCode(tag);}
 catch(_){return '';}
};

 // One consistent identity rule across the ACTUS list and article reader.
 // Never confuse numbered sequels, e.g. Hades and Hades II.
 const gameKey=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const gameAliases=[
  ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
  ['Planet Zoo 2','Planet Zoo II'],
  ['The Witcher 3: Wild Hunt Remastered','The Witcher 3 Remastered','Witcher 3 Remastered','The Witcher III Remastered'],
  ['The Witcher 3: Wild Hunt','The Witcher 3','Witcher 3'],
  ['007 First Light','James Bond 007 First Light','007: First Light'],
  ['Assassin’s Creed Black Flag','Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag',"Assassin's Creed Black Flag"],
  ['Final Fantasy VII','Final Fantasy 7','FF7'],
  ['MARVEL Tōkon: Fighting Souls','Marvel Tokon Fighting Souls'],
  ['Divinity: Original Sin 3','Divinity Original Sin III'],
  ['Road 96','Road96']
 ].map(group=>group.map(gameKey));
 const sameGame=(first,second)=>{
  const a=gameKey(first),b=gameKey(second);
  return !!(a&&b&&(a===b||gameAliases.some(group=>group.includes(a)&&group.includes(b))));
 };
const editorialGame=article=>{
 const raw=String(article?.game||'').trim(),title=gameKey(article?.title);
 const isRemaster=/(?:the )?witcher (?:3|iii)(?: wild hunt)? remaster(?:ed)?/.test(title);
 const old=['the witcher 3','witcher 3','the witcher 3 wild hunt','the witcher iii'];
 if(isRemaster&&(!raw||old.includes(gameKey(raw))||sameGame(raw,'The Witcher 3: Wild Hunt Remastered')))
  return 'The Witcher 3: Wild Hunt Remastered';
 return raw;
};
const fetchJson=async route=>{
 // AbortSignal.timeout is unavailable on older iPhone Safari releases.
 // AbortController + a finally-cleaned timer works on those devices too.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(route,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
  if(!r.ok){
   if(r.status===503&&route.startsWith('/api/actus')){
    const payload=await r.clone().json().catch(()=>null);
    if(payload?.error==='news_migration_required')
     throw Error('Les Actualités passent sur MySQL Hostinger. La reprise des anciens articles doit être vérifiée avant leur réouverture.');
    if(payload?.error==='news_storage_unavailable'||payload?.error==='news_catalog_unavailable')
     throw Error('Stockage Actualités indisponible. Vérifier la connexion MySQL Hostinger.');
   }
   throw Error('Contenu temporairement indisponible ('+r.status+').');
  }
  return await r.json();
 }catch(error){
  if(error?.name==='AbortError')throw Error('Chargement trop long. Réessayez.');
  throw error;
 }finally{clearTimeout(timer)}
};
let items=[];
function cover(article){
 const p=el('div','swapp-actus-cover');
 const candidates=window.SwappArticleExtras?.cardImageSources?.(article)||[];
 const fallback=()=>{
  p.classList.add('swapp-actus-cover-fallback');
  const art=el('div','swapp-actus-cover-empty');
  art.append(el('span','swapp-actus-cover-symbol','◈'),
   el('small','swapp-actus-cover-editorial','SWAPP · ACTUALITÉ'),
   el('span','swapp-actus-cover-game',String(article.game||'JEU VIDÉO').slice(0,42)));
  p.replaceChildren(art);
 };
 if(!candidates.length){fallback();return p}
 let index=0;
 const img=el('img');
 img.alt=article.thumbnail?.alt||article.title||'Visuel du jeu';
 img.loading='lazy';img.decoding='async';
 img.style.objectPosition=['center','top','bottom','left','right'].includes(article.thumbnail?.position)?article.thumbnail.position:'center';
 img.onerror=()=>{index++;if(index<candidates.length)img.src=candidates[index];else fallback()};
 img.src=candidates[0];p.append(img);
 return p;
}
function makeCard(a){if(!slugOk(a.slug))return null;const link=el('a','swapp-actus-card');link.href='/actus/'+encodeURIComponent(a.slug);
const info=el('div','swapp-actus-info');info.append(el('small','',a.game||a.category||'Actualité'),el('span','swapp-actus-topic-label',articleTopics(a).join(' · ')),el('h2','',a.title),el('p','',a.summary||''),el('span','',date(a.publishedAt||a.originalPublishedAt)+' · Lire l’article →'));
link.append(cover(a),info);link.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();window.SwappLocalTastes?.record?.(a.game);open(a.slug)};return link;}
function paragraphContent(parent,raw){let list=null;for(const lineRaw of String(raw||'').split(/\r?\n/)){const line=lineRaw.trim();if(!line){list=null;continue;}let m;if((m=line.match(/^(#{2,3})\s+(.+)/))){parent.append(el('h'+m[1].length,'',m[2]));list=null;}else if((m=line.match(/^[-*]\s+(.+)/))){if(!list){list=el('ul');parent.append(list)}list.append(el('li','',m[1]));}else{list=null;parent.append(el('p','',line.replace(/\*\*(.*?)\*\*/g,'$1')));}}}
async function showList(node){const headline=el('header','swapp-actus-head');headline.append(el('small','','SWAPP LIVE NEWS · Actualité'),el('h1','','Toutes les actualités SWAPP'),el('p','','Gaming, intelligence artificielle, robotique et technologies émergentes : un seul magazine, filtré par tags.'));node.append(headline);
const tools=el('div','swapp-actus-tools'),search=el('input');search.type='search';search.placeholder='Rechercher un jeu ou une actualité';search.setAttribute('aria-label','Recherche Actualité');const live=el('button','swapp-actus-go-live','Découvrir les lives →');live.onclick=()=>window.setView('discover');const category=el('select','swapp-actus-category');category.setAttribute('aria-label','Filtrer par catégorie');const all=el('option','','Toutes les catégories');all.value='';category.append(all);tools.append(search,category,live);node.append(tools);
const topicBar=el('div','swapp-actus-topic-tags');
topicBar.setAttribute('role','group');topicBar.setAttribute('aria-label','Filtrer les actualités par tag');
node.append(topicBar);
let activeTopic=queryTopic();
let refreshSignalSection=()=>{};
const drawTopics=()=>{
 topicBar.replaceChildren();
 for(const topic of SWAPP_TOPICS){
  const b=el('button','swapp-actus-topic-tag'+(topic.id===activeTopic?' active':''),topic.label);
  b.type='button';
  b.dataset.topic=topic.id;
  b.setAttribute('aria-pressed',String(topic.id===activeTopic));
  b.onclick=()=>{
   activeTopic=topic.id;
   try{history.replaceState(history.state,'','/actus'+(activeTopic?'?tag='+encodeURIComponent(activeTopic):''));}catch(_){}
   drawTopics();update();refreshSignalSection();
  };
  topicBar.append(b);
 }
};
drawTopics();
// Two editorial speeds, ONE magazine: primary-source flashes above deep articles.
const flashSection=el('section','swapp-flash-strip');
flashSection.setAttribute('aria-label','SWAPP FLASH · brèves sourcées');
const flashHead=el('div','swapp-flash-head');
const flashTitle=el('strong','swapp-flash-heading','FLASH');
const flashCount=el('span','swapp-flash-count','Infos vérifiées · sources officielles');
const flashNav=el('div','swapp-flash-controls');
const flashPrev=el('button','swapp-flash-arrow','←');
const flashNext=el('button','swapp-flash-arrow','→');
for(const b of [flashPrev,flashNext])b.type='button';
flashPrev.setAttribute('aria-label','Informations précédentes');
flashNext.setAttribute('aria-label','Informations suivantes');
flashNav.append(flashPrev,flashNext);
flashHead.append(flashTitle,flashCount,flashNav);
const flashCards=el('div','swapp-flash-cards');
flashCards.setAttribute('role','region');
flashCards.setAttribute('aria-label','Brèves SWAPP FLASH : faites défiler horizontalement');
flashCards.tabIndex=0;
const sourceDetails=el('details','swapp-flash-radar');
const sourceSummary=el('summary','','Sources détectées, en attente de vérification');
const sourceList=el('div','swapp-flash-radar-list');
sourceDetails.append(sourceSummary,sourceList);
sourceDetails.hidden=true;
flashSection.append(flashHead,flashCards,sourceDetails);
node.append(flashSection);
const SWAPP_FLASH_FALLBACK = {"updatedAt":"2026-11-11","editorial":[{"id":"alpamayo2-edge-nvidia-20261110","topics":["ROBOTICS","FUTURE","AI"],"title":"Alpamayo 2 Edge : NVIDIA cherche à faire raisonner ses modèles de conduite sur la machine","fact":"NVIDIA décrit un modèle de raisonnement embarqué pour véhicules autonomes, optimisé pour DRIVE AGX Thor et évalué en simulation.","impact":"Des modèles plus compacts pourraient accélérer les décisions locales sans dépendre systématiquement du cloud.","caveat":"Les résultats rapportés sont des évaluations de NVIDIA et de partenaires ; aucune aptitude à circuler librement n'en découle.","sourceName":"NVIDIA Developer","sourceUrl":"https://developer.nvidia.com/blog/running-av-reasoning-models-within-onboard-compute-and-latency-limits/","sourceDate":"2026-11-10","reviewedAt":"2026-11-11","imageUrl":"https://developer-blogs.nvidia.com/wp-content/uploads/2026/11/auto-alpamayo-2-edge-tech-blog-promo-600x338_r2-1.gif","imageCredit":"NVIDIA · Alpamayo 2 Edge","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"alphaproof-code-signal-20261110","topics":["AI","FUTURE"],"title":"AlphaProof Code : DeepMind annonce la vérification formelle de propriétés du protocole Signal","fact":"Google DeepMind indique que ses agents et des chercheurs ont produit des preuves vérifiées avec Lean sur le code cryptographique utilisé par Signal.","impact":"La vérification mathématique pourrait devenir plus accessible pour des logiciels critiques.","caveat":"Les garanties portent sur les propriétés précisément spécifiées et vérifiées ; elles ne démontrent pas l'absence de toute faille de sécurité.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/blog/introducing-alphaproof-code/","sourceDate":"2026-11-10","reviewedAt":"2026-11-11","imageUrl":"https://lh3.googleusercontent.com/PHIZgiGejgu8shHsJV9pVfWv7Kr5rTj-e2yIj73c8LkDKBnTTAr2r28DN9aZd1vLDjCnd1Wi2qOD0t8bPpNN-3DfmbEgxj0TE-TttqVbpdoOD1xmFQk=w1440-h810-n-nu","imageCredit":"Google DeepMind · AlphaProof Code","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"gemini-carbon-model-20261110","topics":["AI"],"title":"Gemini 4 Carbon : Google publie la fiche technique de son modèle de raisonnement","fact":"La fiche de modèle officielle décrit un modèle basé sur Gemini 4 Argon, à entrées texte, image, audio et vidéo et contexte multimodal jusqu'à un million de tokens.","impact":"Les capacités annoncées visent l'ingénierie, les recherches scientifiques et les tâches d'agents complexes.","caveat":"Les résultats de benchmark sont fournis par Google ; performances, coûts et accès varient selon les offres et les usages.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/models/model-cards/gemini-4-carbon/","sourceDate":"2026-11-10","reviewedAt":"2026-11-11","imageUrl":"https://storage.googleapis.com/gdm-deepmind-com-prod-public/media/images/model-cards/gemini-4-carbon/gemini-4-carbon-social.jpg","imageCredit":"Google DeepMind · Gemini 4 Carbon","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"gemini-robotics-25-20261110","topics":["ROBOTICS","AI"],"title":"Gemini Robotics 2.5 : Google détaille ses essais sur plus de 200 tâches de manipulation","fact":"DeepMind présente des évaluations de dextérité et de sécurité sur une gamme de tâches de manipulation, ainsi qu'un essai industriel avec Apptronik et Mercedes-Benz.","impact":"La fiabilité de gestes fins pourrait devenir déterminante pour les applications industrielles.","caveat":"Les résultats rapportés proviennent des tests de Google ; ils ne valent pas homologation ni disponibilité générale.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/blog/gemini-robotics-2-5-accelerates-real-world-physical-intelligence/","sourceDate":"2026-11-10","reviewedAt":"2026-11-11","imageUrl":"https://lh3.googleusercontent.com/1p0vcWGLECMy9qInQW-1AumUwO5fa37wyJ66G0eO8H14BurbFkN7NkKAXbjXYXZ9tS034NyZ9ByuQk8ptQ24dLcMBeg6o_fHMmauBZJ7KAXdM5NHFQ=w1440-h810-n-nu","imageCredit":"Google DeepMind · Gemini Robotics 2.5","articleSlug":"gemini-robotics-2-5-robots-dexterite-securite-usines-2026","verification":"source_primaire_consultee"},{"id":"nvidia-snapshot-20261110","topics":["AI","FUTURE"],"title":"NVIDIA Snapshot : restaurer des serveurs d'inférence GPU en quelques secondes","fact":"NVIDIA décrit un composant open source qui sauvegarde l'état d'une charge GPU initialisée pour éviter de la réinitialiser entièrement à chaque démarrage.","impact":"Le délai de rétablissement de certains services IA pourrait diminuer après une panne ou une forte demande.","caveat":"Les gains de 8 à 36 fois mesurés par NVIDIA concernent des configurations compatibles avec ses tests, et non tous les centres de données.","sourceName":"NVIDIA Developer","sourceUrl":"https://developer.nvidia.com/blog/start-and-restore-gpu-workloads-in-seconds-with-nvidia-snapshot/","sourceDate":"2026-11-10","reviewedAt":"2026-11-11","imageUrl":"https://developer-blogs.nvidia.com/wp-content/uploads/2026/11/nvidia-snapshot-gpu-checkpoint-restore-1024x576-jpg.webp","imageCredit":"NVIDIA Developer · Snapshot","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"groot2-nvidia-corl-20261109","topics":["ROBOTICS","AI"],"title":"GR00T 2 : NVIDIA présente des modèles d'action et de nouvelles méthodes d'entraînement des robots","fact":"NVIDIA annonce un modèle mondial d'action, Isaac Lab 3.0 et des bancs d'essai lors de CoRL 2026 ; le groupe indique 71 % de réussite moyenne sur 50 tâches avec une démonstration par tâche.","impact":"Le transfert de gestes humains vers les robots pourrait réduire le besoin de programmer chaque mouvement.","caveat":"Le pourcentage dépend des protocoles de NVIDIA et ne représente pas un taux de succès universel en usine.","sourceName":"NVIDIA","sourceUrl":"https://blogs.nvidia.com/blog/robotics-simulation-advancements-corl/","sourceDate":"2026-11-09","reviewedAt":"2026-11-11","imageUrl":"https://blogs.nvidia.com/wp-content/uploads/2026/11/corl-corp-blog-promo-pack-1920x1080-1-1280x720.png","imageCredit":"NVIDIA · GR00T 2 / CoRL","articleSlug":"nvidia-groot-2-robots-apprennent-simulation-isaac-lab-2026","verification":"source_primaire_consultee"},{"id":"holoscan5-robot-arm-20261109","topics":["ROBOTICS","FUTURE"],"title":"Holoscan 5 : NVIDIA montre comment rendre un bras robotique facile à guider à la main","fact":"Un tutoriel technique officiel décrit la compensation de gravité d'un bras robotique avec Holoscan SDK 5 et des essais sur plusieurs plateformes de calcul.","impact":"La commande à faible latence est importante pour l'apprentissage par démonstration et la collaboration humain-robot.","caveat":"Le tutoriel décrit un montage et ses mesures ; il ne démontre pas la sécurité de tous les cobots en environnement réel.","sourceName":"NVIDIA Developer","sourceUrl":"https://developer.nvidia.com/blog/make-a-robot-arm-feel-weightless-with-nvidia-holoscan-5/","sourceDate":"2026-11-09","reviewedAt":"2026-11-11","imageUrl":"https://developer-blogs.nvidia.com/wp-content/uploads/2026/11/featured-image-1024x576-jpg.webp","imageCredit":"NVIDIA Developer · Holoscan 5","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"omni12-flash-video-20261105","topics":["AI","FUTURE"],"title":"Gemini Omni 1.2 Flash : Google détaille son modèle multimodal orienté vidéo","fact":"Google DeepMind publie la fiche officielle de Gemini Omni 1.2 Flash, consacré à la compréhension et à la modification multimodale des contenus, notamment vidéo.","impact":"Les outils vidéo pourraient évoluer vers une édition plus précise au moyen de consignes naturelles.","caveat":"La fiche présente les capacités et limites annoncées par Google ; elle ne confirme pas la disponibilité de toutes les fonctions pour chaque utilisateur.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/models/model-cards/gemini-omni-1-2-flash/","sourceDate":"2026-11-05","reviewedAt":"2026-11-11","imageUrl":"https://storage.googleapis.com/gweb-cloudblog-publish/images/gemini-omni.max-2500x2500.jpg","imageCredit":"Google Cloud · Gemini Omni 1.2 Flash","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"panasonic-t-rex-tactile-20261105","topics":["ROBOTICS","AI"],"title":"Panasonic T-Rex : des robots ajustent leurs gestes grâce au toucher des doigts","fact":"Panasonic présente un modèle de manipulation à retour tactile, évalué sur douze tâches délicates avec un taux moyen de réussite annoncé de 65 %.","impact":"Le retour tactile rapide pourrait améliorer la manipulation d'objets fragiles en atelier ou en logistique.","caveat":"Il s'agit d'un résultat de recherche sur douze tâches, non d'un robot commercial prêt à remplacer des opérateurs.","sourceName":"Panasonic Newsroom","sourceUrl":"https://news.panasonic.com/global/press/en261105-2","sourceDate":"2026-11-05","reviewedAt":"2026-11-11","imageUrl":"https://news.panasonic.com/uploads/tmg_block_page/cover_image/19136/l-en261105-2-1.jpg","imageCredit":"Panasonic · robot tactile T-Rex","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"antigravity-cheminformatics-20261103","topics":["AI","FUTURE"],"title":"Antigravity et chimie : DeepMind accélère une étape de recherche de molécules","fact":"DeepMind décrit un agent muni d'outils de chimie informatique ayant analysé de nombreux composés et proposé des molécules candidates et des voies de synthèse en environ une heure.","impact":"Les chercheurs pourraient gagner du temps pour explorer des hypothèses et préparer de nouvelles expériences.","caveat":"Il s'agit de propositions assistées par IA, pas de médicaments validés ni d'une preuve d'efficacité clinique.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/blog/agentic-cheminformatics-with-google-antigravity/","sourceDate":"2026-11-03","reviewedAt":"2026-11-11","imageUrl":"https://storage.googleapis.com/gdm-deepmind-com-prod-public/media/original_images/antigravity_cheminformatics_social.jpg","imageCredit":"Google DeepMind · Antigravity et chimie","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"nvidia-cosmos-worldmodels-20261102","topics":["FUTURE","ROBOTICS","AI"],"title":"Cosmos : NVIDIA publie des outils pour entraîner des simulations de véhicules et de robots","fact":"NVIDIA détaille Cosmos Framework et ses recettes de génération de vues caméra et LiDAR, ainsi que des services d'inférence adaptés à des scénarios de simulation.","impact":"La simulation pourrait accélérer les tests d'agents physiques sur des situations dangereuses ou difficiles à reproduire.","caveat":"La qualité visuelle d'une simulation n'assure pas l'exactitude de la physique ni le transfert direct à un véhicule ou robot réel.","sourceName":"NVIDIA Developer","sourceUrl":"https://developer.nvidia.com/blog/build-world-models-for-interactive-simulation-with-nvidia-cosmos/","sourceDate":"2026-11-02","reviewedAt":"2026-11-11","imageUrl":"https://developer-blogs.nvidia.com/wp-content/uploads/2026/10/cosmos-framework-tech-blog-600x338-5784057.webp","imageCredit":"NVIDIA · Cosmos Framework","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"isaac-lab3-nvidia-20261029","topics":["ROBOTICS","FUTURE"],"title":"Isaac Lab 3.0 : NVIDIA annonce un environnement de simulation plus modulaire","fact":"NVIDIA présente Isaac Lab 3.0, qui intègre notamment le moteur physique Newton et différentes options de rendu pour entraîner et évaluer des politiques robotiques.","impact":"Les développeurs pourraient reproduire davantage de gestes et de matériaux dans les tests de robots.","caveat":"Les possibilités dépendent du matériel et des scènes simulées ; les performances sur un robot physique doivent être mesurées séparément.","sourceName":"NVIDIA Developer Forums","sourceUrl":"https://forums.developer.nvidia.com/t/nvidia-isaac-lab-3-0-now-available/387360","sourceDate":"2026-10-29","reviewedAt":"2026-11-11","imageUrl":"https://global.discourse-cdn.com/nvidia/optimized/4X/d/5/2/d52994af92d80215e3d3308e93a40799dc7e605a_2_690x388.jpeg","imageCredit":"NVIDIA Developer Forums · Isaac Lab 3.0","articleSlug":null,"verification":"source_primaire_consultee"},{"id":"genie4-world-simulation-20261027","topics":["FUTURE","AI"],"title":"Genie 4 : Google présente des environnements interactifs générés en temps réel","fact":"Google DeepMind annonce un modèle de simulation d'univers interactifs avec image et audio, accessible dans un programme de recherche limité.","impact":"De tels prototypes pourraient aider à explorer rapidement des idées de jeux, de simulation ou de robotique.","caveat":"La continuité des objets, la physique et la stabilité des longues sessions restent des limites reconnues par Google.","sourceName":"Google DeepMind","sourceUrl":"https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/","sourceDate":"2026-10-27","reviewedAt":"2026-11-11","imageUrl":"https://lh3.googleusercontent.com/mKq26Yz8rlcAthtTHS2GaID7LuUM9a4zM16VHUszY-zyKly80QRUt5nn6V4jQN8_bJ4_UMesp1D_88ethzTEJPoo6NUPyhO76QZ7zNJM5KzfPE5GKjM=w1440-h810-n-nu","imageCredit":"Google DeepMind · Genie 4","articleSlug":"genie-4-google-deepmind-simulation-mondes-interactifs-2026","verification":"source_primaire_consultee"}],"watch":{"status":"unavailable","lastCollectionAt":null,"items":[]}};
// Reviewed editorial snapshot shipped in the same JS as /actus; API upgrades it when reachable.
// This avoids an empty news strip when /api/actus/signaux is blocked by WAF, cache or MySQL.
let flashData=SWAPP_FLASH_FALLBACK;
let liveFlashAvailable=false;
const safeSource=raw=>url(raw);
const shortDate=raw=>{
 const parsed=new Date(String(raw||'')+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())?parsed.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
};
const renderFlashCard=entry=>{
 const article=el('article','swapp-flash-item');
 const top=el('div','swapp-flash-top');
 const articleSlug=slugOk(entry.articleSlug)?entry.articleSlug:'';
 const detailId='swapp-flash-detail-'+String(entry.id||'detail').replace(/[^a-z0-9-]/gi,'').slice(0,72);
 const nativeHref=articleSlug?'/actus/'+encodeURIComponent(articleSlug):'#'+detailId;
 const imageLink=el('a','swapp-flash-thumb');
 imageLink.href=nativeHref;
 imageLink.setAttribute('aria-label',articleSlug?'Lire l’article complet sur SWAPP : '+entry.title:'Lire la brève sur SWAPP : '+entry.title);
 const imageSource=safeSource(entry.imageUrl);
 if(imageSource){
  const img=el('img');
  img.src=imageSource;
  img.alt=entry.imageCredit||entry.title;
  img.loading='lazy';img.decoding='async';
  img.onerror=()=>{imageLink.classList.add('is-unavailable');img.remove();imageLink.textContent=entry.sourceName||'Source';};
  imageLink.append(img);
 }else{
  imageLink.classList.add('is-unavailable');
  imageLink.textContent=entry.sourceName||'Source';
 }
 const copy=el('div','swapp-flash-copy');
 const meta=el('div','swapp-flash-meta');
 const topic=el('span','',entry.topics.join(' · '));
 const published=el('time','',shortDate(entry.sourceDate));
 published.dateTime=entry.sourceDate;
 meta.append(topic,published);
 const titleLink=el('a','swapp-flash-title',entry.title);
 titleLink.href=nativeHref;
 titleLink.setAttribute('aria-label',articleSlug?'Lire l’article complet sur SWAPP':'Lire cette brève sur SWAPP');
 copy.append(meta,titleLink);
 top.append(imageLink,copy);
 const details=el('details','swapp-flash-details');
 details.id=detailId;
 if(!articleSlug){
  const openInline=e=>{e.preventDefault();details.open=true;details.scrollIntoView({block:'nearest',behavior:'smooth'});};
  imageLink.addEventListener('click',openInline);
  titleLink.addEventListener('click',openInline);
 }
 const summary=el('summary','','Pourquoi c’est important');
 const fact=el('p','',entry.fact);
 const impact=el('p','');
 impact.append(el('strong','','Impact : '),document.createTextNode(entry.impact));
 const caveat=el('p','');
 caveat.append(el('strong','','Limite : '),document.createTextNode(entry.caveat));
 const source=el('a','swapp-flash-source-link','Référence externe · '+entry.sourceName);
 source.href=safeSource(entry.sourceUrl)||'/actus';
 source.target='_blank';source.rel='noopener noreferrer';
 details.append(summary,fact,impact,caveat,source);
 article.append(top,details);
 return article;
};
refreshSignalSection=()=>{
 if(!flashData)return;
 const all=flashData.editorial.filter(x=>!activeTopic||(Array.isArray(x.topics)&&x.topics.includes(activeTopic)));
 flashCount.textContent=all.length+' brèves sourcées · '+(activeTopic||'tous les sujets')+(liveFlashAvailable?'':' · archivées au '+SWAPP_FLASH_FALLBACK.updatedAt.split('-').reverse().join('/'));
 flashCards.replaceChildren();
 if(!all.length)flashCards.append(el('p','swapp-actus-state','Pas de brève vérifiée pour ce tag. Les articles complets restent ci-dessous.'));
 else all.forEach(entry=>flashCards.append(renderFlashCard(entry)));
 flashCards.scrollLeft=0;
 const watch=flashData.watch?.items||[];
 const pending=watch.filter(x=>!activeTopic||(Array.isArray(x.topics)&&x.topics.includes(activeTopic)));
 sourceDetails.hidden=pending.length===0;
 sourceList.replaceChildren();
 const seenAt=flashData.watch?.lastCollectionAt?new Date(flashData.watch.lastCollectionAt):null;
 const seenLabel=seenAt&&Number.isFinite(seenAt.getTime())?' · dernière collecte '+seenAt.toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 sourceSummary.textContent='Veille brute ('+pending.length+') · non vérifié'+seenLabel;
 pending.slice(0,18).forEach(x=>{
  const href=safeSource(x.sourceUrl);if(!href)return;
  const item=el('a','swapp-flash-pending',x.title+' · '+x.sourceName+' · '+shortDate(x.sourceDate));
  item.href=href;item.target='_blank';item.rel='noopener noreferrer nofollow';
  sourceList.append(item);
 });
};
flashPrev.onclick=()=>flashCards.scrollBy({left:-Math.max(240,flashCards.clientWidth*.85),behavior:'smooth'});
flashNext.onclick=()=>flashCards.scrollBy({left:Math.max(240,flashCards.clientWidth*.85),behavior:'smooth'});
// Draw credible, dated source cards immediately, without waiting for a second request.
refreshSignalSection();
fetchJson('/api/actus/signaux').then(data=>{
 if(!flashSection.isConnected)return;
 if(!Array.isArray(data.editorial))throw Error('Réponse éditoriale invalide');
 flashData=data;liveFlashAvailable=true;refreshSignalSection();
}).catch(error=>{
 // API outage is an enhancement failure, NOT an outage of the published brief archive.
 console.warn('[SWAPP FLASH] API inaccessible; rendu depuis le catalogue editorial embarque',error?.message||error);
});
window.SwappArticleFeedback?.mountList(node);
const liveSection=el('section','swapp-discover-live');liveSection.setAttribute('aria-label','Créateurs en direct pour le jeu sélectionné');const liveHeading=el('div','swapp-discover-live-heading');liveHeading.append(el('h2','','Les créateurs en direct'));const liveStatus=el('p','swapp-discover-live-status');liveSection.append(liveHeading,liveStatus);const liveCards=el('div','swapp-discover-live-grid');liveSection.append(liveCards);node.append(liveSection);
let liveResults=null,liveLoading=null,liveTicket=0;
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matches=sameGame;
const loadLives=game=>fetchJson('/api/discovery/game-lives?limit=12&game='+encodeURIComponent(game)).then(data=>{
  if(data?.success!==true||!sameGame(game,data.game)||!Array.isArray(data.items))throw Error('game_mismatch');
  const verified=data.items;
  verified.coverage=String(data.coverage||'unknown');
  return verified;
 });
async function updateLives(){const ticket=++liveTicket;const game=activeGame;if(!game){liveSection.hidden=true;return}liveSection.hidden=false;liveCards.replaceChildren();liveHeading.querySelector('h2').textContent='En direct sur '+game;liveStatus.textContent='Recherche des créateurs en cours…';
try{const result=await loadLives(game);if(ticket!==liveTicket||!liveSection.isConnected)return;const seen=new Set();const found=result.filter(item=>{const login=String(item.login||'').toLowerCase(),platform=String(item.platform||'').toLowerCase(),key=platform+':'+login;if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||!matches(game,item.game_name||item.game||item.category))return false;seen.add(key);return true}).sort((a,b)=>Number(['swapp','oryon'].includes(String(b.platform||'').toLowerCase()))-Number(['swapp','oryon'].includes(String(a.platform||'').toLowerCase()))||Number(b.viewer_count||0)-Number(a.viewer_count||0)).slice(0,4);
liveStatus.textContent=found.length?found.length+' créateur'+(found.length>1?'s':'')+' repéré'+(found.length>1?'s':'')+' en direct dans les suggestions':result.coverage==='native-only'?'SWAPP ne peut pas interroger Twitch actuellement. Des chaînes peuvent être en direct.':result.coverage==='partial'?'Résultats partiels : Twitch ne répond pas complètement.':'Aucun live confirmé dans les résultats disponibles. D’autres créateurs peuvent être en direct.';
for(const item of found){const login=String(item.login).toLowerCase(),native=['swapp','oryon'].includes(String(item.platform||'').toLowerCase());const link=el('a','swapp-discover-stream');link.href=native?'/'+encodeURIComponent(login):'/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(game.slice(0,90));if(!native)link.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const opened=window.SwappArticlePlayer?.openFull({login,name:item.display_name||login,game});if(opened)event.preventDefault()};const image=el('div','swapp-discover-stream-cover'),src=url(item.thumbnail_url);if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();image.append(img)}image.append(el('span','swapp-discover-stream-badge','EN DIRECT'));const info=el('div','swapp-discover-stream-info');info.append(el('strong','',item.display_name||login),el('span','swapp-game-connection','Même jeu · '+game),el('small','',item.title||'Regarder ce live'));link.append(image,info);liveCards.append(link)}
}catch{if(ticket===liveTicket&&liveSection.isConnected)liveStatus.textContent='Lives temporairement indisponibles. Les articles restent accessibles.'}}
liveSection.hidden=true;
const gamesBar=el('div','swapp-actus-game-filters');gamesBar.setAttribute('aria-label','Explorer les jeux');node.append(gamesBar);let activeGame='',gamesExpanded=false;const count=el('p','swapp-actus-count');count.setAttribute('aria-live','polite');node.append(count);const feed=el('div','swapp-actus-grid');node.append(feed);
const update=()=>{feed.replaceChildren();const query=search.value.toLocaleLowerCase('fr').trim();const available=items.filter(x=>(!activeGame||String(x.game||'')===activeGame)&&(!category.value||(x.category||'')===category.value)&&hasTopic(x,activeTopic)&&[x.title,x.game,x.summary,x.category,...(Array.isArray(x.tags)?x.tags:[])].join(' ').toLocaleLowerCase('fr').includes(query));count.textContent=available.length+' article'+(available.length>1?'s':'')+' à découvrir';if(!available.length){feed.append(el('p','swapp-actus-state',query?'Aucun résultat.':'Aucun article complet récupéré pour le moment.'));return;}available.forEach(a=>{const c=makeCard(a);if(c)feed.append(c)});};
search.oninput=update;category.onchange=update;feed.append(el('p','swapp-actus-state','Chargement des articles…'));
try{const data=await fetchJson('/api/actus');if(!node.isConnected)return;items=Array.isArray(data.articles)?data.articles:[];const categories=[...new Set(items.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));for(const name of categories){const option=el('option','',name);option.value=name;category.append(option)}
const games=[...new Set(items.map(x=>String(x.game||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')).slice(0,16);
if(games.length){
 const renderGames=()=>{
  gamesBar.replaceChildren();
  const chips=el('div','swapp-actus-game-options'+(gamesExpanded?' is-expanded':''));
  chips.id='swapp-actus-available-games';
  for(const game of ['',...games]){
   const b=el('button','swapp-actus-game-chip'+(activeGame===game?' active':''),game||'Tous les jeux');
   b.type='button';b.setAttribute('aria-pressed',String(activeGame===game));
   b.onclick=()=>{activeGame=game;renderGames();update();updateLives()};
   chips.append(b);
  }
  gamesBar.append(chips);
  if(games.length>4){
   const toggle=el('button','swapp-actus-games-more',gamesExpanded?'Réduire':'Voir tous les jeux');
   toggle.type='button';toggle.setAttribute('aria-controls',chips.id);toggle.setAttribute('aria-expanded',String(gamesExpanded));
   toggle.onclick=()=>{gamesExpanded=!gamesExpanded;renderGames()};
   gamesBar.append(toggle);
  }
 };
 renderGames();
}update()}catch(e){if(node.isConnected){const message=el('p','swapp-actus-state',e.message),retry=el('button','swapp-actus-go-live','Réessayer');retry.onclick=()=>{node.replaceChildren();showList(node)};feed.replaceChildren(message,retry)}}}
async function showArticle(node,slug){node.append(el('p','swapp-actus-state','Chargement de l’article…'));try{const fetched=await fetchJson('/api/actus/'+encodeURIComponent(slug));const a={...fetched,game:editorialGame(fetched)};if(!node.isConnected)return;node.replaceChildren();node.classList.add('swapp-actus-reading');
const back=el('button','swapp-actus-go-back','← Toutes les actualités');back.type='button';back.onclick=home;const nav=el('nav','swapp-actus-reader-nav');nav.setAttribute('aria-label','Retour à la rubrique Actualités');nav.append(back);node.append(nav);
const article=el('article','swapp-actus-article');
const heading=el('header','swapp-reader-hero swapp-immersive-hero');
const heroCopy=el('div','swapp-immersive-content');
// The image belongs to the article environment, not to the header.
const trailerId=window.SwappArticleExtras?.heroTrailerId?.(a)||null;
const coverImage=url(a.image?.url||a.imageUrl);
const heroImage=coverImage||(trailerId?'https://i.ytimg.com/vi/'+trailerId+'/hqdefault.jpg':null);
const scene=el('div','swapp-article-scene');
if(window.SwappArticleExtras?.isGameArticle?.(a))scene.classList.add('has-game');
if(trailerId){
 scene.dataset.swappTrailerId=trailerId;
 scene.dataset.swappTrailerTitle=String(a.game||a.title||'Jeu vidéo').slice(0,140);
 scene.classList.add('has-trailer');
}
scene.setAttribute('aria-hidden','true');
if(heroImage){
 const sceneImage=el('img',trailerId?'swapp-article-trailer-poster':'');
 sceneImage.src=heroImage;sceneImage.alt='';sceneImage.decoding='async';sceneImage.fetchPriority='high';
 sceneImage.onerror=()=>{scene.classList.remove('has-art');sceneImage.remove()};
 scene.append(sceneImage);scene.classList.add('has-art');
}
node.prepend(scene);
const kicker=el('div','swapp-reader-kicker');
kicker.append(el('span','swapp-reader-kicker-main',a.category||'Actualité'));
if(a.game)kicker.append(el('span','swapp-reader-kicker-game',a.game));
heroCopy.append(kicker,el('h1','',a.title));
if(a.summary)heroCopy.append(el('p','swapp-actus-summary',a.summary));
heroCopy.append(el('p','swapp-actus-author',[a.author,date(a.publishedAt||a.originalPublishedAt)].filter(Boolean).join(' · ')));
heading.id='swapp-article-hero';heading.append(heroCopy);article.append(heading);
if(coverImage&&a.image?.credit)heroCopy.append(el('p','swapp-immersive-credit',a.image.credit));
const controls=el('div','swapp-reader-controls');const words=String(a.body||'').trim().split(/\s+/).filter(Boolean).length;
controls.append(el('span','swapp-read-time',Math.max(1,Math.ceil(words/220))+' min de lecture'));
const actions=el('nav','swapp-game-journey-actions');actions.setAttribute('aria-label','Explorer ce jeu sur SWAPP');
const read=el('a','swapp-game-journey-action primary','Lire l’article ↓');read.href='#article-content';
read.onclick=e=>{const dest=article.querySelector('#article-content');if(!dest)return;e.preventDefault();dest.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};
const watch=el('a','swapp-game-journey-action','Voir les lives →');watch.href=a.game?'#swapp-article-lives':'/decouvrir';
if(a.game)watch.onclick=e=>{const dest=article.querySelector('#swapp-article-lives');if(!dest)return;e.preventDefault();dest.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};
const discuss=el('a','swapp-game-journey-action','En discuter →');
discuss.href='/social?share=news&title='+encodeURIComponent(a.game?a.game+' — '+a.title:a.title)+'&url='+encodeURIComponent(location.origin+'/actus/'+slug);
actions.append(read,watch,discuss);heroCopy.append(actions);
const sharePanel=window.SwappArticleShare?.build?.(a);
if(sharePanel){heroCopy.append(controls);article.append(sharePanel)}
else{
 const share=el('button','swapp-reader-share','Partager l’article');share.type='button';
 share.onclick=async()=>{const address=location.origin+'/actus/'+encodeURIComponent(slug);try{if(navigator.share){await navigator.share({title:a.title,url:address});return}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(address);share.textContent='Lien copié';return}}catch(e){if(e.name==='AbortError')return}share.textContent='Copier le lien : '+address};
 controls.append(share);heroCopy.append(controls);
}
// Artwork remains behind the heading. Reading progress is now a small TOC label,
// not a second horizontal line underneath the SWAPP navigation.
const reading=el('div','swapp-article-reading');
const body=el('div','swapp-actus-body');body.id='article-content';paragraphContent(body,a.body);
const sections=[...body.querySelectorAll('h2,h3')];
const toc=el('nav','swapp-reader-toc');
toc.setAttribute('aria-label','Sommaire de l’article');
toc.append(el('strong','','Dans cet article'));
function addTocLink(title,target,subsection=false){
 const link=el('a',subsection?'subsection':'',title);
 link.href='#'+target;
 link.onclick=e=>{const destination=article.querySelector('#'+target);if(!destination)return;e.preventDefault();destination.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});history.replaceState(history.state,'',location.pathname+'#'+target)};
 toc.append(link);
}
if(sections.length<2)addTocLink('Introduction','article-content');
for(const [i,heading] of sections.entries()){
 heading.id='section-'+(i+1);
 addTocLink(heading.textContent,heading.id,heading.tagName==='H3');
}
if(!sections.length){
 if(a.sources?.some(source=>url(source.url)))addTocLink('Sources et références','swapp-article-sources');
 if(a.game)addTocLink('Créateurs en direct','swapp-article-lives');
}
reading.append(toc);
reading.append(body);article.append(reading);window.SwappArticleExtras?.mount(article,a);
if(a.game){const spotlight=el('section','swapp-spotlight-public');spotlight.setAttribute('data-spotlight-game',a.game);article.append(spotlight);const games=el('section','swapp-actus-related swapp-reader-live-panel');games.id='swapp-article-lives';games.append(el('h2','','En direct sur '+a.game),el('p','swapp-actus-live-status','Créateurs qui jouent à ce jeu actuellement'));article.append(games);
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matches=sameGame;
fetchJson('/api/discovery/game-lives?limit=12&game='+encodeURIComponent(a.game)).then(data=>{if(!games.isConnected)return;if(data?.success!==true||!matches(a.game,data.game)){games.replaceChildren(el('h2','','En direct sur '+a.game),el('p','swapp-actus-live-status','Correspondance du jeu momentanément indisponible.'));return;}const seen=new Set();const streams=(Array.isArray(data.items)?data.items:[]).filter(x=>{const login=String(x.login||'').toLowerCase(),platform=String(x.platform||'').toLowerCase(),key=platform+':'+login;if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||!matches(a.game,x.game_name||x.game||x.category))return false;seen.add(key);return true}).sort((x,y)=>Number(['swapp','oryon'].includes(String(y.platform||'').toLowerCase()))-Number(['swapp','oryon'].includes(String(x.platform||'').toLowerCase()))||Number(y.viewer_count||0)-Number(x.viewer_count||0));games.replaceChildren(el('h2','','En direct sur '+a.game));if(!streams.length){
 const reason=data.coverage==='native-only'?
  'Twitch n’est pas disponible sur SWAPP actuellement. Impossible de confirmer l’absence de lives.':
  data.coverage==='partial'?
  'Recherche Twitch partielle. D’autres chaînes peuvent être en direct.':
  'Aucun direct confirmé dans la recherche actuelle. Réessaie pour actualiser.';
 games.append(el('p','swapp-actus-live-status',reason));
 const retry=el('button','swapp-game-journey-action','Relancer la recherche');
 retry.type='button';retry.onclick=()=>showArticle(node,slug);
 games.append(retry);return;

}
const liveHeader=el('div','swapp-reader-live-header');
const copy=el('div','swapp-reader-live-header-copy');
copy.append(el('h2','','En direct sur '+a.game),
 el('p','swapp-actus-live-status',streams.length+' créateur'+(streams.length>1?'s':'')+' en direct'));
liveHeader.append(copy);
const grid=el('div','swapp-reader-live-grid');
for(const stream of streams){
 const login=String(stream.login||'').toLowerCase();
 if(!/^[a-z0-9_]{2,25}$/.test(login))continue;
 const native=['swapp','oryon'].includes(String(stream.platform||'').toLowerCase());
 const streamHref=native?'/'+encodeURIComponent(login):
  '/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(String(a.game).slice(0,90));
 // The entire card is ONE native link: works with keyboard, middle-click, and
 // still opens SWAPP's integrated Twitch player when the user left-clicks.
 const card=el('a','swapp-reader-live-card');card.href=streamHref;
 card.setAttribute('aria-label','Regarder le live de '+(stream.display_name||login)+' sur SWAPP');
 const cover=el('div','swapp-reader-live-cover');
 const image=url(stream.thumbnail_url);
 if(image){
  const img=el('img');img.src=image;img.alt='';img.loading='lazy';
  cover.append(img);
 }
 cover.append(el('span','swapp-reader-live-badge','● EN DIRECT'));
 const info=el('div','swapp-reader-live-info');
 const creator=el('div','swapp-reader-live-creator');
 const avatar=url(stream.profile_image_url||stream.avatar_url||stream.avatar);
 if(avatar){
  const img=el('img','swapp-reader-live-avatar');img.src=avatar;img.alt='';img.loading='lazy';
  creator.append(img);
 }
 creator.append(el('strong','',stream.display_name||login));
 info.append(creator);
 const metaParts=[a.game];
 const viewers=Number(stream.viewer_count);
 if(Number.isFinite(viewers)&&viewers>0)metaParts.push(viewers.toLocaleString('fr-FR')+' spectateurs');
 info.append(el('span','swapp-reader-live-meta',metaParts.join(' · ')));
 info.append(el('p','swapp-reader-live-title',stream.title||'Live en cours'));
 info.append(el('span','swapp-reader-live-watch','Regarder le live ↗'));
 card.append(cover,info);
 if(!native)card.onclick=event=>{
  if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const opened=window.SwappArticlePlayer?.openFull?.({
   login,name:stream.display_name||login,game:a.game});
  if(opened)event.preventDefault();
 };
 grid.append(card);
}
if(grid.children.length){
 const cards=[...grid.children],visible=3;
 cards.forEach((card,i)=>{if(i>=visible)card.hidden=true});
 if(cards.length>visible){
  const more=el('button','swapp-reader-live-more','Voir les '+(cards.length-visible)+' autres lives →');
  more.type='button';more.setAttribute('aria-expanded','false');
  more.onclick=()=>{
   const expanded=more.getAttribute('aria-expanded')==='true';
   cards.forEach((card,i)=>{card.hidden=expanded&&i>=visible});
   more.setAttribute('aria-expanded',String(!expanded));
   more.textContent=expanded?'Voir les '+(cards.length-visible)+' autres lives →':'Réduire les lives ↑';
  };
  liveHeader.append(more);
 }
 games.replaceChildren(liveHeader,grid);
}
}).catch(()=>{if(games.isConnected){games.replaceChildren(el('h2','','En direct sur '+a.game),el('p','swapp-actus-live-status','Lives momentanément indisponibles.'))}});
}
const recommend=el('details','swapp-reader-next');recommend.open=true;
const recommendHeading=el('summary','','À découvrir ensuite');
const recommendations=el('div','swapp-reader-next-list');
recommend.append(recommendHeading,recommendations);
const manualPartner=window.SwappArticleExtras?.partnerOffersHtml?.(a)||'';
if(manualPartner){
 const holder=document.createElement('div');
 holder.innerHTML=manualPartner;
 recommend.append(...holder.children);
}
const commercial=manualPartner?null:window.SwappInstantGaming?.forArticle?.(a);
if(commercial){
 const partner=el('aside','swapp-affiliate-offer');
 partner.setAttribute('aria-label','Offre partenaire Instant Gaming · lien affilié');
 partner.append(el('span','swapp-affiliate-kicker','OFFRE INSTANT GAMING · LIEN AFFILIÉ'));
 partner.append(el('strong','swapp-affiliate-game',commercial.game));
 partner.append(el('span','swapp-affiliate-platform',commercial.platform));
 const shopLink=el('a','swapp-affiliate-link','Voir l’offre ↗');
 shopLink.href=commercial.url;shopLink.target='_blank';
 shopLink.rel='sponsored nofollow noopener noreferrer';
 partner.append(shopLink);

 recommend.append(partner);
}
reading.append(recommend);
const fillRecommendations=list=>{if(!recommend.isConnected)return;recommendations.replaceChildren();const base=String(a.game||'').toLocaleLowerCase('fr');const baseTokens=new Set(String(a.title||'').toLocaleLowerCase('fr').split(/[^\\p{L}\\p{N}]+/u).filter(w=>w.length>=5));const candidates=list.filter(x=>x.slug!==slug&&x.slug!==a.slug&&slugOk(x.slug)).sort((x,y)=>{const score=z=>{const game=Number(!!base&&String(z.game||'').toLocaleLowerCase('fr')===base)*10;const category=Number(!!a.category&&z.category===a.category)*2;const common=String(z.title||'').toLocaleLowerCase('fr').split(/[^\\p{L}\\p{N}]+/u).filter(w=>baseTokens.has(w)).length;const time=Number(new Date(z.publishedAt||z.originalPublishedAt||0))||0;return [game+category+Math.min(common,3),time]};const sy=score(y),sx=score(x);return sy[0]-sx[0]||sy[1]-sx[1]}).slice(0,3);candidates.forEach(x=>{
 const link=el('a','swapp-reader-next-item');link.href='/actus/'+encodeURIComponent(x.slug);
 const imgUrl=window.SwappArticleExtras?.cardImageSources?.(x)?.[0]||null;
 if(imgUrl){const img=el('img','swapp-reader-next-thumb');img.src=imgUrl;img.alt='';img.loading='lazy';link.append(img);}
 const content=el('span','swapp-reader-next-copy');
 content.append(el('small','',x.game||x.category||'Actualité'),el('strong','',x.title));
 link.append(content);
 link.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();window.SwappLocalTastes?.record?.(x.game);open(x.slug)};
 recommendations.append(link);
});
if(!recommendations.children.length){
 const all=el('a','swapp-reader-next-all','Explorer toute l’actualité →');
 all.href='/actus';all.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();home()};recommendations.append(all);
}};
node.append(article);
if(trailerId)window.SwappTrailerHero?.mount?.(scene);
if(items.length)fillRecommendations(items);else fetchJson('/api/actus').then(data=>{items=Array.isArray(data.articles)?data.articles:[];fillRecommendations(items)}).catch(()=>fillRecommendations([]));
}catch(e){
 if(!node.isConnected)return;
 const status=el('p','swapp-actus-state',e.message||'Article temporairement indisponible.');
 const actions=el('div','swapp-actus-recovery');
 const retry=el('button','swapp-actus-go-live','Réessayer');
 retry.type='button';
 retry.onclick=()=>{node.replaceChildren();showArticle(node,slug)};
 const back=el('a','swapp-actus-go-back','← Toutes les actualités');
 back.href='/actus';
 back.onclick=event=>{
  if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();home();
 };
 actions.append(retry,back);
 node.replaceChildren(status,actions);
}}
function render(target){if(!target)return;window.SwappArticlePlayer?.close();target.replaceChildren();const node=el('div','swapp-actus-native');target.append(node);const parts=location.pathname.split('/').filter(Boolean);return parts.length===2&&parts[0]==='actus'&&slugOk(parts[1])?showArticle(node,parts[1]):showList(node);}
function open(slug){
 if(!slugOk(slug))return;
 // Articles have ONE canonical layout: the server-rendered editorial page.
 // Client-side re-rendering used a separate shell whose body overflow and
 // sticky reading columns differed until F5. Navigate directly instead.
 window.location.assign('/actus/'+encodeURIComponent(slug));
}
function home(){history.pushState({view:'actus'},'','/actus');render(document.getElementById('actus'));window.scrollTo(0,0);}
window.SwappActus=Object.freeze({render,open,home});
})();