'use strict';
/* The cinematic homepage is mounted inside the SAME index.html SPA as Découvrir. */
const {catalogueContent}=require('./swapp-catalogue-lab');
const HOME_START='<section id="home" class="view active">';
const NEXT_VIEW='  <section id="discover" class="view"></section>';
const STYLE='<link rel="stylesheet" href="/assets/swapp-catalogue-lab.css?v=20261114-hero-rail-spacing-v21">'+
 '<link rel="stylesheet" href="/assets/swapp-catalogue-spa.css?v=20261114-real-spa-v16">';
const SCRIPT='<script src="/assets/swapp-catalogue-lab.js?v=20261114-streamer-bio-v21" defer></script>'+
 '<script src="/assets/swapp-catalogue-spa.js?v=20261114-real-spa-v16" defer></script>';
function renderIntoSpa(html){
 const source=String(html||'');
 if(source.includes('data-swapp-home-spa="v16"'))return source;
 const start=source.indexOf(HOME_START);
 const next=source.indexOf(NEXT_VIEW,start);
 if(start<0||next<0||next<start||!source.includes('</head>')||!source.includes('</body>'))
  throw Error('swapp_spa_home_contract_missing');
 const output=source.slice(0,start)+HOME_START+'\n'+catalogueContent({publicHome:true})+'</section>\n'+source.slice(next);
 // The bridge executes after index_script defines setView/renderHome, but
 // before route-bootstrap and account enhancers dispatch their first views.
 const bootstrap='<script defer src="/assets/swapp-route-bootstrap.js';
 if(!output.includes(bootstrap))throw Error('swapp_spa_bootstrap_anchor_missing');
 return output.replace('</head>',STYLE+'</head>')
  .replace('<body>','<body data-swapp-home-spa="v16">')
  .replace(bootstrap,SCRIPT+bootstrap);
}
module.exports={renderIntoSpa,HOME_START,NEXT_VIEW,STYLE,SCRIPT};
