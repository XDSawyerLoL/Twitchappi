'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderNewsHome,renderJustPlayerPreview}=require('../modules/swapp-news/native-pages');
const {layout}=require('../modules/swapp-news/site-shell');
const {renderTwitchWatch}=require('../modules/swapp-news/watch');
const {makeNewsEditorGuard}=require('../modules/swapp-news/editor-auth');

test('SWAPP est le seul nom de marque et la navigation reste la même pour articles et lives',()=>{
 for(const page of [renderNewsHome([]),renderTwitchWatch('streamer_23')]){
   assert.match(page,/SWAPP/);
   assert.match(page,/href="\/equipes"/);
   assert.match(page,/href="\/actus"[^>]*>ACTUS<\/a>/);
   assert.doesNotMatch(page,/ACTUS × LIVE/);
   assert.ok(page.includes('id="userBtn" class="userBtn"'));
 }
});
test('le catalogue JustPlayer est visible dans SWAPP sans redirection automatique',()=>{
 const html=renderNewsHome([]);
 assert.match(html,/Les publications JustPlayer/);
 assert.match(html,/\/actus\/justplayer\/266628/);
 assert.doesNotMatch(html,/<a[^>]+href="https:\/\/justplayer.fr\/supporters/);
});
test('fiche de contenu incomplet : transparente et conservée dans SWAPP',()=>{
 const item={title:'007 First Light : James Bond réussit son retour',url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
 const html=renderJustPlayerPreview(item,null);
 assert.match(html,/Texte complet en cours d’intégration/);
 assert.match(html,/Retour à SWAPP Actualités/);
 assert.match(html,/noindex,follow/);
});
test('le contenu public extrait ne permet aucune injection HTML',()=>{
 const item={title:'Article <script>alert(1)</script>',url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
 const html=renderJustPlayerPreview(item,{body:'Un <script>alert(1)</script> texte original et suffisamment complet pour la validation.'});
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('accès édition : navigateur reçoit une vraie page de connexion, API reste fermée',()=>{
 const guard=makeNewsEditorGuard({isSessionAdmin:req=>!!req.admin,adminKey:'',isProduction:true});
 function call(req){const state={code:200,kind:null,body:null,passed:false};const res={
  status(n){state.code=n;return this},
  type(s){state.kind=s;return this},
  send(s){state.body=s;return this},
  json(s){state.body=s;return this}
 };guard(req,res,()=>{state.passed=true});return state;}
 const denied=call({method:'GET',path:'/actus/studio',session:{oryonUser:{login:'demo'}},headers:{}});
 assert.equal(denied.code,403);assert.equal(denied.kind,'html');assert.match(denied.body,/ORYON_ADMIN_LOGINS/);
 const api=call({method:'POST',path:'/api/editor/actus',headers:{"x-swapp-editor":"1"}});
 assert.equal(api.code,403);assert.equal(api.body.error,'editor_forbidden');
 const allowed=call({method:'GET',path:'/actus/studio',admin:true,headers:{}});
 assert.equal(allowed.passed,true);
});
test('l’accueil conserve son contenu original et ACTUS entre dans le menu existant',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../index_script.js'),'utf8');
 assert.doesNotMatch(html,/swappNewsLink|swapp-home-news\.js/);
 assert.match(app,/swappIntegratedNewsNav/);
 assert.match(html,/id="nav" class="mainNav"/);
});
