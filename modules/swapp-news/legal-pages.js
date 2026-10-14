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
 ['Hébergement','Les informations contractuelles de l’hébergeur du service restent à confirmer et à publier.'],
 ['Propriété intellectuelle','Les marques, créations et contenus restent soumis aux droits de leurs titulaires respectifs. Pour signaler un problème relatif à un contenu, utilisez la page Contact.']]},
 '/confidentialite':{title:'Confidentialité',intro:'Informations relatives aux données personnelles',sections:[
 ['État de cette information','Cette page présente un état provisoire. Il faut encore documenter les données réellement traitées, leurs finalités, bases légales, durées de conservation, prestataires et transferts éventuels.'],
 ['Comptes, streaming et services externes','SWAPP peut proposer des fonctionnalités de compte, de streaming et des intégrations externes. Leur fonctionnement et les données associées doivent être audités avant publication d’affirmations définitives.'],
 ['Vos droits','Les modalités de contact du responsable de traitement pour exercer vos droits d’accès, de rectification, d’effacement et d’opposition doivent être complétées.']]},
 '/cgu':{title:'Conditions d’utilisation',intro:'Cadre d’utilisation de SWAPP',sections:[
 ['Usage du service','Les visiteurs et créateurs doivent respecter les lois applicables, les droits de tiers et les règles de modération publiées sur SWAPP.'],
 ['Contenus et créations','Les utilisateurs restent responsables des contenus qu’ils diffusent et des autorisations dont ils disposent.'],
 ['Version en préparation','Les dispositions contractuelles détaillées, la date d’entrée en vigueur et les procédures de contestation doivent être revues avant adoption définitive.']]},
 '/cookies':{title:'Cookies et traceurs',intro:'Comprendre les traceurs de SWAPP',sections:[
 ['Information à compléter','Un inventaire technique des cookies, identifiants et services externes doit être réalisé et publié avec leurs finalités et durées.'],
 ['Consentement','Si des traceurs non essentiels sont utilisés, leur dépôt doit être soumis aux choix requis par la réglementation applicable. Aucune préférence de consentement n’est simulée sur cette page.']]}
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function register(app){
 for(const [route,page] of Object.entries(pages)){
  app.get(route,(req,res)=>{
   const section=page.sections.map(([h,p])=>'<section class="section"><h2>'+esc(h)+'</h2><p>'+esc(p)+'</p></section>').join('');
   const issue='<a href="https://github.com/XDSawyerLoL/Twitchappi/issues/new" rel="noopener noreferrer" target="_blank">Ouvrir un signalement sur GitHub ↗</a>';
   res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(page.title)+' — SWAPP</title><link rel="stylesheet" href="/assets/swapp-media.css?v=legal-1"><style>body{background:#0b101b;color:#f0f5ff;font:16px/1.65 system-ui,sans-serif;margin:0}.legal-header{border-bottom:1px solid #35435b;background:#101b2a;padding:17px max(22px,calc((100vw - 1060px)/2))}.legal-header a{color:#a4eef0;text-decoration:none;font-weight:800}.legal-header .legal-wordmark{color:#fff;font-size:25px;font-weight:950;letter-spacing:-.075em}.legal-header .legal-wordmark span{color:#66e5e4}.legal-main{max-width:1000px;margin:40px auto 80px;padding:0 23px}.legal-main h1{font-size:clamp(33px,5vw,55px);line-height:1.1;margin-bottom:10px}.legal-main .lead{color:#bed0e5}.legal-main .section{padding:22px 0;border-bottom:1px solid #304056}.legal-main h2{font-size:21px}.legal-main p{color:#c6d0df}.legal-note{border:1px solid #887545;background:#332c1b;padding:13px 17px;border-radius:12px;color:#f5dc9d}.legal-main a{color:#8ee7ed}</style></head><body><header class="legal-header"><a class="legal-wordmark" href="/" aria-label="SWAPP — Accueil">SWAPP<span aria-hidden="true">.</span></a> · <a href="/actus">Actualités</a> · <a href="/contact">Contact</a></header><main class="legal-main"><p class="legal-note">Informations en cours de vérification — cette page ne constitue pas une version juridique définitive.</p><h1>'+esc(page.title)+'</h1><p class="lead">'+esc(page.intro)+'</p>'+section+'<p>'+issue+'</p></main><script defer src="/assets/swapp-footer.js?v=legal-1"></script></body></html>');
  });
 }
}
module.exports={register};
