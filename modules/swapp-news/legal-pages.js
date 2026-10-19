'use strict';
const pages={
 '/contact':{title:'Contact',intro:'Contacter l’équipe SWAPP',sections:[
 ['Signaler un dysfonctionnement','Pour signaler un bug ou un défaut visuel, ouvrez un ticket sur le dépôt du projet en décrivant la page, le navigateur et les étapes de reproduction.'],
 ['Contact éditorial','Les coordonnées directes de la rédaction ne sont pas encore publiées. Le dépôt du projet constitue pour le moment le canal public de signalement.']]},
 '/moderation':{title:'Modération',intro:'Règles de participation et signalement',sections:[
 ['Ce qui n’a pas sa place sur SWAPP','Harcèlement, menaces, incitations à la violence, contenus illégaux, divulgation de données personnelles et usurpation d’identité.'],
 ['Signaler un contenu','Transmettez l’URL concernée, sa description et le motif du signalement via le canal public disponible. Ne publiez pas de données personnelles dans un ticket public.'],
 ['Traitement des signalements','Les signalements nécessitent un examen contextualisé. La publication de délais, voies de recours et contacts de modération dédiés reste à finaliser.']]},
 '/mentions-legales':{title:'Mentions légales',intro:'Informations sur l’éditeur et l’hébergement',sections:[
 ['Éditeur du service','SWAPP est le nom du service. L’identité juridique de l’éditeur, son adresse, ses coordonnées professionnelles et, le cas échéant, ses immatriculations doivent encore être renseignées avant de considérer cette page comme complète.'],
 ['Hébergement','SWAPP utilise l’hébergement Hostinger pour le site principal. L’identité juridique complète et les coordonnées contractuelles de l’hébergeur restent à publier après vérification.'],
 ['Propriété intellectuelle','Les marques, créations et contenus restent soumis aux droits de leurs titulaires respectifs. Pour signaler un problème relatif à un contenu, utilisez la page Contact.']]},
 '/confidentialite':{title:'Confidentialité',intro:'Informations relatives aux données personnelles',sections:[
 ['État de cette information','Cette page présente un état provisoire. Il faut encore documenter les données réellement traitées, leurs finalités, bases légales, durées de conservation, prestataires et transferts éventuels.'],
 ['Comptes et sessions','La création d’un compte SWAPP implique notamment un pseudonyme, une adresse e-mail, un identifiant et des informations d’authentification. Des cookies de session peuvent être utilisés pour permettre la connexion. Les traitements, durées de conservation et destinataires doivent être documentés précisément avant finalisation de cette politique.'],
 ['Fonctionnalités et prestataires','SWAPP propose des actualités, des lives et des fonctions communautaires. Le site comporte des intégrations ou liens vers Twitch, YouTube, Google AdSense, Amazon et Instant Gaming. L’utilisation de services externes peut entraîner des traitements de données régis par leurs propres politiques.'],
 ['Publicité Google AdSense','Les pages publiques du site peuvent charger le script Google AdSense avec l’identifiant éditeur ca-pub-6082969821681414 pour vérification. Google peut traiter des données techniques et, selon la configuration et le consentement applicable, utiliser des cookies ou autres identifiants. La présence du script ne signifie pas qu’une annonce est effectivement diffusée.'],
 ['Publicité et consentement','Les emplacements publicitaires intégrés aux articles sont conçus pour attendre un signal de consentement TCF valide. Cela ne remplace pas la mise en service et la vérification d’une plateforme de gestion du consentement certifiée par Google, qui restent nécessaires avant la diffusion publicitaire concernée.'],
 ['Vos droits et contact','Les coordonnées privées du responsable du traitement et les moyens d’exercer les droits d’accès, de rectification, d’effacement et d’opposition restent à renseigner. Ne communiquez jamais des données personnelles sensibles dans les tickets GitHub publics.']]},
 '/cgu':{title:'Conditions d’utilisation',intro:'Cadre d’utilisation de SWAPP',sections:[
 ['Usage du service','Les visiteurs et créateurs doivent respecter les lois applicables, les droits de tiers et les règles de modération publiées sur SWAPP.'],
 ['Contenus et créations','Les utilisateurs restent responsables des contenus qu’ils diffusent et des autorisations dont ils disposent.'],
 ['Version en préparation','Les dispositions contractuelles détaillées, la date d’entrée en vigueur et les procédures de contestation doivent être revues avant adoption définitive.']]},
 '/cookies':{title:'Cookies et traceurs',intro:'Comprendre les traceurs de SWAPP',sections:[
 ['Cookies nécessaires au compte','Les sessions de connexion SWAPP peuvent utiliser des cookies nécessaires pour authentifier les utilisateurs et conserver leur session. Le détail exact des noms, des durées et des finalités doit encore être vérifié et publié.'],
 ['Google AdSense','Un script Google AdSense de vérification est inclus dans le code des pages publiques. Ce script est distinct des emplacements publicitaires, dont l’affichage dans les articles dépend d’un signal de consentement TCF. Des cookies ou identifiants Google peuvent être concernés par les traitements publicitaires.'],
 ['Contenus et liens externes','Certaines pages proposent des lecteurs Twitch ou YouTube, ainsi que des liens vers Amazon ou Instant Gaming. Lorsqu’un visiteur utilise ces services, leurs propres règles de confidentialité et de traceurs peuvent s’appliquer.'],
 ['Consentement','La mise en place et la vérification d’une plateforme de gestion du consentement certifiée par Google, compatible IAB TCF, doivent être finalisées pour les usages publicitaires concernés. Cette page n’affirme pas qu’un bandeau de consentement est déjà actif. Aucun consentement n’est présumé par la simple visite du site.']]}
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function publicLegalDetails(env=process.env){
 const detail=key=>String(env[key]||'').trim().slice(0,240);
 const email=key=>{const raw=detail(key);return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(raw)?raw:'';};
 return Object.freeze({
  publisher:detail('SWAPP_LEGAL_PUBLISHER_NAME'),
  address:detail('SWAPP_LEGAL_PUBLISHER_ADDRESS'),
  registration:detail('SWAPP_LEGAL_REGISTRATION'),
  hosting:detail('SWAPP_LEGAL_HOST_DETAILS'),
  contact:email('SWAPP_LEGAL_CONTACT_EMAIL'),
  privacy:email('SWAPP_LEGAL_PRIVACY_EMAIL')||email('SWAPP_LEGAL_CONTACT_EMAIL')
 });
}
function legalCompleteness(details){
 // These are presentation guardrails, not a certification of legal compliance.
 const publisher=String(details.publisher||''),address=String(details.address||''),hosting=String(details.hosting||'');
 const tradeOnly=/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:tv|fr|com|net)$/i.test(publisher);
 const addressLooksComplete=/\b\d{5}\b/.test(address)&&/\d/.test(address)&&/\p{L}/u.test(address);
 const hostDetailsComplete=hosting.length>=30&&/\d/.test(hosting)&&/\p{L}/u.test(hosting);
 return {tradeOnly,addressLooksComplete,hostDetailsComplete,
  editorLooksComplete:!!publisher&&!tradeOnly&&addressLooksComplete&&!!details.contact};
}

function legalSupplement(route,details){
 const pieces=[];
 const item=(heading,body)=>'<section class="section"><h2>'+esc(heading)+'</h2><p>'+body+'</p></section>';
 const mail=(address)=>'<a href="mailto:'+esc(address)+'">'+esc(address)+'</a>';
 if(route==='/mentions-legales'){
  const quality=legalCompleteness(details);
  if(details.publisher)pieces.push(item(quality.tradeOnly?'Nom commercial du site':'Identité déclarée de l’éditeur',esc(details.publisher)+(quality.tradeOnly?' — le nom commercial ne remplace pas l’identité juridique de l’éditeur.':'')));
  if(details.address)pieces.push(item(quality.addressLooksComplete?'Adresse professionnelle déclarée':'Localisation déclarée (adresse incomplète)',esc(details.address)+(quality.addressLooksComplete?'':' — une adresse professionnelle complète doit être publiée lorsque la réglementation l’exige.')));
  if(details.registration)pieces.push(item('Immatriculation déclarée',esc(details.registration)));
  if(details.hosting)pieces.push(item(quality.hostDetailsComplete?'Coordonnées de l’hébergeur déclarées':'Prestataire d’hébergement (coordonnées incomplètes)',esc(details.hosting)+(quality.hostDetailsComplete?'':' — les coordonnées permettant d’identifier l’hébergeur restent à compléter.')));
  if(details.contact)pieces.push(item('Contact professionnel déclaré',mail(details.contact)));
 }
 if(route==='/contact'&&details.contact)
  pieces.push(item('Contacter l’éditeur directement',mail(details.contact)+' — pour les demandes concernant le service ou la rédaction. Évitez de publier vos données privées sur GitHub.'));
 if(route==='/confidentialite'&&details.privacy)
  pieces.push(item('Exercer vos droits sur les données',mail(details.privacy)+' — demandes relatives à l’accès, la rectification, la suppression ou l’opposition.'));
 if(route==='/cookies')
  pieces.push(item('Modifier vos choix publicitaires','Lorsque le message Google est activé pour votre région, le pied de page propose « Gérer mes choix publicitaires » dès que son API est disponible. Aucun consentement n’est simulé en son absence.'));
 return pieces.join('');
}

function register(app){
 for(const [route,page] of Object.entries(pages)){
  app.get(route,(req,res)=>{
   const details=publicLegalDetails();
   const section=page.sections.filter(([h])=>{
    // Do not keep a contradictory "missing" notice after real publisher data
    // have been configured. Unverified sections remain visible.
    if(route==='/mentions-legales'&&h==='Éditeur du service'&&legalCompleteness(details).editorLooksComplete)return false;
    if(route==='/mentions-legales'&&h==='Hébergement'&&legalCompleteness(details).hostDetailsComplete)return false;
    if(route==='/contact'&&h==='Contact éditorial'&&details.contact)return false;
    if(route==='/confidentialite'&&h==='Vos droits et contact'&&details.privacy)return false;
    return true;
   }).map(([h,p])=>'<section class="section"><h2>'+esc(h)+'</h2><p>'+esc(p)+'</p></section>').join('')+legalSupplement(route,details);
   const issue='<a href="https://github.com/XDSawyerLoL/Twitchappi/issues/new" rel="noopener noreferrer" target="_blank">Ouvrir un signalement sur GitHub ↗</a>';
   res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(page.title)+' — SWAPP</title><link rel="stylesheet" href="/assets/swapp-media.css?v=legal-1"><style>body{background:#0b101b;color:#f0f5ff;font:16px/1.65 system-ui,sans-serif;margin:0}.legal-header{border-bottom:1px solid #35435b;background:#101b2a;padding:17px max(22px,calc((100vw - 1060px)/2))}.legal-header a{color:#a4eef0;text-decoration:none;font-weight:800}.legal-header .legal-wordmark{color:#fff;font-size:25px;font-weight:950;letter-spacing:-.075em}.legal-header .legal-wordmark span{color:#66e5e4}.legal-main{max-width:1000px;margin:40px auto 80px;padding:0 23px}.legal-main h1{font-size:clamp(33px,5vw,55px);line-height:1.1;margin-bottom:10px}.legal-main .lead{color:#bed0e5}.legal-main .section{padding:22px 0;border-bottom:1px solid #304056}.legal-main h2{font-size:21px}.legal-main p{color:#c6d0df}.legal-note{border:1px solid #887545;background:#332c1b;padding:13px 17px;border-radius:12px;color:#f5dc9d}.legal-main a{color:#8ee7ed}</style></head><body><header class="legal-header"><a class="legal-wordmark" href="/" aria-label="SWAPP — Accueil">SWAPP<span aria-hidden="true">.</span></a> · <a href="/actus">Actualités</a> · <a href="/contact">Contact</a></header><main class="legal-main"><p class="legal-note">Informations en cours de vérification — cette page ne constitue pas une version juridique définitive.</p><h1>'+esc(page.title)+'</h1><p class="lead">'+esc(page.intro)+'</p>'+section+'<p>'+issue+'</p></main><script defer src="/assets/swapp-footer.js?v=legal-1"></script></body></html>');
  });
 }
}
module.exports={register,publicLegalDetails,legalSupplement,legalCompleteness};
