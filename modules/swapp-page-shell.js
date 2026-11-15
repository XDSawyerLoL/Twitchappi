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
const PREMIUM_CSS='<link rel="stylesheet" href="/assets/swapp-obsidian-ice.css?v=20261115-unified-black-v22">';
const SHARED_CSS=Object.freeze([
 '/assets/swapp-unified-nav.css?v=20261113-nav-simple-v2',
 '/assets/swapp-route-motion.css?v=20261114-film-cut-v19',
 '/assets/swapp-native-account.css?v=20261116-global-account-v2',
 '/assets/swapp-nav-utility.css?v=20261115-light-behind-v4',
 '/assets/swapp-footer-native.css?v=20261115-native-footer-v1'
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
  '<script src="/assets/swapp-local-tastes.js?v=20261015-private-36" defer></script>'+ 
   '<script src="/assets/swapp-account-unified.js?v=20261116-global-account-v1" defer></script>'+
   '<script src="/assets/swapp-nav-session.js?v=20261116-global-account-v2" defer></script>'+
   '<script src="/assets/swapp-nav-utility.js?v=20261115-light-behind-v4" defer></script>'+
  '<script src="/assets/swapp-footer.js?v=20261021-discord-invite-v1" defer></script>'+
  '<script src="/assets/swapp-servers-alerts.js?v=20261115-admin-alert-v2" defer></script>'+String(scripts||'')+'</body></html>';
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
