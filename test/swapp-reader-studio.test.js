'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('reader module parses and loads in the SPA and native article shell',()=>{
 const js=read('assets/swapp-reader-studio.js');
 assert.doesNotThrow(()=>new Function(js));
 const spa=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 const script='/assets/swapp-reader-studio.js?v=20261019-reading-v1';
 const style='/assets/swapp-reader-studio.css?v=20261019-reading-v1';
 for(const page of [spa,native]){
  assert.ok(page.includes(script));
  assert.ok(page.includes(style));
  assert.equal(page.split(script).length-1,1);
  assert.equal(page.split(style).length-1,1);
 }
 const release=read('tools/swapp-release.js');
 assert.match(release,/'assets\/swapp-reader-studio.js'/);
 assert.match(release,/'assets\/swapp-reader-studio.css'/);
});

test('reader is opt-in, usable without a logged-in account and limited to article text',()=>{
 const js=read('assets/swapp-reader-studio.js');
 assert.match(js,/data-reader-focus aria-pressed="false"/);
 assert.match(js,/setFocus\(!document\.documentElement\.classList\.contains\('swapp-reader-focus'\)\)/);
 assert.match(js,/querySelectorAll\('h2,h3,p,li,blockquote'\)/);
 assert.match(js,/root\.prepend\(studio\)/);
 assert.match(js,/root=reading;content=text/);
 assert.doesNotMatch(js,/localStorage|fetch\(|XMLHttpRequest|sendBeacon|MediaRecorder|SpeechRecognition/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.match(js,/document\.addEventListener\('DOMContentLoaded',boot/);
 assert.match(js,/window\.addEventListener\('popstate',sync\)/);
});

test('listen mode cannot start without a French voice and never auto-plays',()=>{
 const js=read('assets/swapp-reader-studio.js');
 assert.match(js,/window\.speechSynthesis/);
 assert.match(js,/SpeechSynthesisUtterance/);
 assert.match(js,/filter\(v=>\/\^fr/);
 assert.match(js,/start\.disabled=!voices\.length/);
 assert.match(js,/data-reader-voice/);
 assert.match(js,/utterance\.lang=chosen\.lang\|\|'fr-FR'/);
 assert.match(js,/api\.pause\(\)/);
 assert.match(js,/api\.resume\(\)/);
 assert.match(js,/api\.cancel\(\)/);
 assert.match(js,/utterance\.onerror=/);
 assert.match(js,/utterance\.onend=/);
 assert.match(js,/addEventListener\('click',play\)/);
 assert.doesNotMatch(js,/new SpeechSynthesisUtterance\(['"]Mairy/);
 assert.match(js,/Mairy naturelle n’est pas encore connectée/);
});

test('reading focus is responsive, distraction free and does not overwrite global site colors',()=>{
 const css=read('assets/swapp-reader-studio.css');
 assert.match(css,/html\.swapp-reader-focus/);
 assert.match(css,/data-swapp-reader-theme="papier"/);
 assert.match(css,/data-swapp-reader-theme="sepia"/);
 assert.match(css,/data-swapp-reader-font="serif"/);
 assert.match(css,/var\(--swapp-side-light/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.swapp-reader-next\)\{display:none!important/);
 assert.match(css,/\.swapp-narration-current/);
 assert.doesNotMatch(css,/^\s*(?:html|body)\s*\{[^}]*background:/m);
});

test('deployed runtime check covers both public and SPA reader assets',()=>{
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/SWAPP Lecture: both server-rendered articles/);
 assert.match(smoke,/readerStudioCss/);
 assert.match(smoke,/swapp-reader-focus/);
 assert.match(smoke,/min-height:44px/);
});
