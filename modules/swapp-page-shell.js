'use strict';
/*
 * Common server-rendered SWAPP document foundation.
 *
 * The catalogue homepage and native editorial/program pages intentionally
 * retain their existing CONTENT engines, but share one HTML document shell:
 * navigation, mobile navigation, header CSS and cross-document transitions.
 * Do not serialize client state or re-run page scripts on history traversal.
 */
const {serverHeader,serverMobile}=require('../assets/swapp-navigation');
const SHARED_HEAD_SLOT='<!-- swapp:shared-shell-styles -->';
const SHARED_CSS=Object.freeze([
 '/assets/swapp-unified-nav.css?v=20261113-nav-simple-v2',
 '/assets/swapp-route-motion.css?v=20261113-shared-shell-v2'
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
  '</head><body class="'+cls+'" data-swapp-shell="shared-native-v2">'+
  serverHeader(active)+String(content||'')+serverMobile(active)+
  String(scripts||'')+'</body></html>';
}
module.exports={renderPage,SHARED_HEAD_SLOT,SHARED_CSS,sharedLinks};
