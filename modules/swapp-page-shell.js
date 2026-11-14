'use strict';
/*
 * Common server-rendered SWAPP document foundation.
 *
 * The catalogue homepage and native editorial/program pages intentionally
 * retain their existing CONTENT engines, but share one HTML document shell:
 * navigation, mobile navigation, header CSS and cross-document transitions.
 * Do not serialize client state or re-run page scripts on history traversal.
 */
const {serverHeader,serverMobile,desktopNavigation,mobileNavigation}=require('../assets/swapp-navigation');
const SHARED_HEAD_SLOT='<!-- swapp:shared-shell-styles -->';
const PREMIUM_CSS='<link rel="stylesheet" href="/assets/swapp-obsidian-ice.css?v=20261114-premium-ice-v1">';
const SHARED_CSS=Object.freeze([
 '/assets/swapp-unified-nav.css?v=20261113-nav-simple-v2',
 '/assets/swapp-route-motion.css?v=20261113-shared-shell-v2&rev=20261114-nav-motion-v3',
 '/assets/swapp-native-account.css?v=20261114-native-account-v1'
]);
function escapeAttribute(value){
 return String(value||'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
}
function sharedLinks(){
 return SHARED_CSS.map(uri=>'<link rel="stylesheet" href="'+uri+'">').join('');
}
function renderPage({head='',content='',scripts='',bodyClass='swapp-editorial-route',active='home'}={}){
 if(!String(head).includes(SHARED_HEAD_SLOT))
  throw Error('swapp_shell_styles_placeholder_missing');
 const htmlHead=String(head).replace(SHARED_HEAD_SLOT,sharedLinks());
 const cls=escapeAttribute(bodyClass);
 return '<!doctype html><html lang="fr"><head>'+htmlHead+
  PREMIUM_CSS+'</head><body class="'+cls+'" data-swapp-shell="shared-native-v2">'+
  serverHeader(active)+String(content||'')+serverMobile(active)+
  String(scripts||'')+'</body></html>';
}
const SPA_ACTIVE_ROUTES=Object.freeze({
 '/':'home','/actus':'actus','/categories':'categories',
 '/decouvrir':'discover','/equipes':'teams','/compte':'settings',
 '/dashboard':'dashboard','/social':'community','/boutique':'shop',
 '/tv':'tv','/on-air':'onair','/bandes-annonces':'trailers'
});
function normalizePath(path){
 return (String(path||'/').split('?')[0].replace(/\/+$/,'')||'/');
}
function hydrateSpaNavigation(html,path='/'){
 // The SPA used to serve an EMPTY nav and fill it asynchronously. It flashed
 // between the cinematic native header and the SPA header on every document
 // hop. Pre-render only these navigation fragments; account UI is left intact.
 const active=SPA_ACTIVE_ROUTES[normalizePath(path)]||'home';
 const original=String(html||'');
 const desktop=/<nav id="nav" class="mainNav"(?: [^>]*)?><\/nav>/;
 const mobile=/<nav id="mobileNav" class="mobileNav"(?: [^>]*)?><\/nav>/;
 if(!desktop.test(original)||!mobile.test(original))return original;
 return original.replace(desktop,
  '<nav id="nav" class="mainNav" aria-label="Navigation principale">'+desktopNavigation(active)+'</nav>')
 .replace(mobile,
  '<nav id="mobileNav" class="mobileNav" aria-label="Navigation mobile">'+mobileNavigation(active)+'</nav>');
}
module.exports={renderPage,hydrateSpaNavigation,normalizePath,SHARED_HEAD_SLOT,SHARED_CSS,sharedLinks};
