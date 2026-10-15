'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {renderStudio,js}=require('../modules/swapp-news/editor-ui');
const {assertArticle}=require('../modules/swapp-news/article-core');

test('Studio serves executable JavaScript, not a dead form',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/async function refresh\(\)/);
 assert.doesNotMatch(js,/\bfunction refresh\(\)\{const data=await/);
 const html=renderStudio();
 for(const id of ['ed-media-grid','ed-media-status','ed-media-new','ed-preview',
  'ed-studio-check','ed-studio-live','ed-studio-recover']){
   assert.match(html, new RegExp('id="'+id+'"'));
 }
 assert.match(html,/swapp-editor-enhance\.js/);
 assert.match(html,/swapp-editor-enhance\.css/);
});

test('editing an article restores its original sources before save/publish',()=>{
 const begin=js.indexOf('function setEditor(a){'),end=js.indexOf('function previewImage()',begin);
 assert.ok(begin>=0&&end>begin);
 const part=js.slice(begin,end);
 const events=[];
 const mockNodes=new Map();
 const $=id=>{
  if(!mockNodes.has(id))mockNodes.set(id,{style:{},dataset:{},value:'',textContent:'',disabled:false});
  return mockNodes.get(id);
 };
 const entries=[];
 const setEditor=new Function('$','text','view','previewImage','window','CustomEvent',
  "const state={selected:null};"+part+" return setEditor;")(
   $, (id,value)=>entries.push([id,String(value??'')]), ()=>{}, ()=>{},
   {dispatchEvent:e=>events.push(e)}, class{constructor(type,data){this.type=type;this.detail=data.detail}}
  );
 setEditor({slug:'test-video',status:'draft',title:'Mon article vidéo',
  sources:[{url:'https://source.example/one'},{url:'https://source.example/two'}]});
 const restored=Object.fromEntries(entries);
 assert.equal(restored.sources,'https://source.example/one\nhttps://source.example/two');
 assert.equal(mockNodes.get('ed-view').dataset.editorSlug,'test-video');
 assert.equal(events[0].detail.slug,'test-video');
});

test('validation is guarded and explicitly does not mutate article storage',()=>{
 const router=read('modules/swapp-news/router.js');
 const start=router.indexOf("router.post('/api/editor/actus/validate'");
 const end=router.indexOf("router.post('/api/editor/actus/suggest'",start);
 assert.ok(start>0&&end>start);
 const block=router.slice(start,end);
 assert.match(block,/\.\.\.editor/);
 assert.match(block,/assertArticle\(req\.body,\{publish:true\}\)/);
 assert.doesNotMatch(block,/\.create\(|\.update\(|\.set\(|runTransaction/);
});

test('preflight validation rejects incomplete videos but accepts an authorized official trailer',()=>{
 const valid={
  contentType:'trailer',title:'Bande-annonce de GTA VI',
  summary:'Trailer',body:'Découvrez la vidéo officielle de GTA VI.',
  trailerUrl:'https://www.youtube.com/watch?v=VQRLujxTm3c'
 };
 assert.doesNotThrow(()=>assertArticle(valid,{publish:true}));
 assert.throws(()=>assertArticle({...valid,trailerUrl:null},{publish:true}),/vidéo YouTube/);
 assert.throws(()=>assertArticle({...valid,trailerUrl:'https://evil.example/player'},{publish:true}),/YouTube/);
});

test('publish preserves unsaved changes and validates before any database mutation',()=>{
 const start=js.indexOf('async function publish(){');
 const end=js.indexOf('async function unpublish()',start);
 assert.ok(start>0&&end>start);
 const block=js.slice(start,end);
 const preflight=block.indexOf("'/api/editor/actus/validate'");
 const patch=block.indexOf("'PATCH'");
 const publish=block.indexOf("'/publish'");
 assert.ok(preflight>0&&patch>preflight);
 assert.ok(publish>patch);
 assert.match(block,/const draft=articleData\(\)/);
});

test('media library is a real searchable editing view and changes no public homepage',()=>{
 const html=renderStudio();
 assert.match(html,/data-go="media"/);
 assert.match(html,/data-view="media"/);
 assert.match(js,/function populateMedia\(\)/);
 assert.match(js,/state\.articles\.filter/);
 assert.match(js,/setEditor\(item\)/);
 const app=read('index.html');
 assert.doesNotMatch(app,/id="ed-media-grid"/);
});

test('in-tab recovery is optional and does not transmit drafts to external services',()=>{
 const enhance=read('assets/swapp-editor-enhance.js');
 assert.doesNotThrow(()=>new Function(enhance));
 assert.match(enhance,/sessionStorage\.setItem/);
 assert.match(enhance,/Restaurer la saisie de cet onglet/);
 assert.match(enhance,/window\.addEventListener\('swapp:studio:loaded'/);
 assert.doesNotMatch(enhance,/localStorage|indexedDB/);
 assert.doesNotMatch(enhance,/fetch\('https:\/\//);
});

test('administrator permissions require an immutable identity pin on production',()=>{
 const server=read('server.js');
 assert.match(server,/ORYON_ADMIN_USER_IDS/);
 assert.match(server,/if\(!pinnedRaw\)return !IS_PROD/);
 assert.match(server,/pinned\.includes\(String\(cur\.id\)\)/);
 const auth=read('modules/swapp-news/editor-auth.js');
 assert.match(auth,/ORYON_ADMIN_LOGINS/);
 assert.match(auth,/ORYON_ADMIN_USER_IDS/);
});
test('diagnostic tool measures actual network requests on demand, without tracking',()=>{
 const html=renderStudio();
 assert.match(html,/id="ed-studio-diagnose"/);
 assert.match(html,/id="ed-studio-diagnostics"/);
 const enhance=read('assets/swapp-editor-enhance.js');
 for(const route of ['/api/editor/actus/access','/api/actus','/bandes-annonces','/api/pulse/health']){
  assert.ok(enhance.includes(route),route);
 }
 assert.match(enhance,/performance\.now\(\)/);
 assert.match(enhance,/addEventListener\('click',diagnostics\)/);
 assert.doesNotMatch(enhance,/sendBeacon|gtag\(|analytics/);
});
