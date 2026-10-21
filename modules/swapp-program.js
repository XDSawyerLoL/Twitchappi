'use strict';
// SWAPP Agenda / TV: public, read-only surfaces reusing verified SWAPP APIs.
const {layout}=require('./swapp-news/site-shell');
function page(kind){
 const tv=kind==='tv',title=tv?'SWAPP TV · La chaîne':'Agenda SWAPP';
 const content='<main id="swapp-program" data-mode="'+(tv?'tv':'agenda')+'" class="swapp-program"><header class="swapp-program-header"><small>SWAPP / GAME UNIVERSE</small><h1>'+title+'</h1><p>'+(tv?'La chaîne collective de SWAPP : une antenne commune, indépendante des chaînes personnelles des créateurs.':'Les rendez-vous Spotlight confirmés sur les jeux couverts par SWAPP.')+'</p><nav><a href="/agenda">Agenda</a><a href="/tv">SWAPP TV</a><a href="/social">SOCIAL</a></nav></header><p id="swapp-program-status" role="status" aria-live="polite">Chargement des données publiques…</p><div id="swapp-program-controls"></div><div id="swapp-program-content"></div></main>';
 return layout({title,description:tv?'SWAPP TV : rotation de créateurs en direct et jeux du magazine.':'Agenda de rendez-vous Spotlight sur SWAPP.',content,active:tv?'tv':'agenda',scripts:'<link rel="stylesheet" href="/assets/swapp-program.css?v=1"><script defer src="/assets/swapp-tv-rotation.js?v=1"></script><script defer src="/assets/swapp-program.js?v=1"></script>'});
}
module.exports={page};
