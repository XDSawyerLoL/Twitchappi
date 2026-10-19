'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const read=p=>readFileSync(path.join(__dirname,'..',p),'utf8');

test('SWAPP legal disclosures describe the existing ad setup without claiming verified consent',()=>{
 const legal=read('modules/swapp-news/legal-pages.js');
 assert.match(legal,/ca-pub-6082969821681414/);
 assert.match(legal,/script Google AdSense/);
 assert.match(legal,/signal de consentement TCF/);
 assert.match(legal,/plateforme de gestion du consentement certifiée par Google/);
 assert.match(legal,/Ne communiquez jamais des données personnelles sensibles/);
 assert.match(legal,/coordonnées privées du responsable du traitement/);
 assert.match(legal,/Cette page n’affirme pas qu’un bandeau de consentement est déjà actif/);
});

test('publisher pages and AdSense verification are present but approval is never declared',()=>{
 const shell=read('modules/swapp-news/site-shell.js');
 const home=read('index.html');
 const tag='<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6082969821681414" crossorigin="anonymous"></script>';
 for(const content of [shell,home]) assert.ok(content.includes(tag));
 assert.match(read('assets/swapp-adsense-inarticle.js'),/window\.__tcfapi\('addEventListener',2,onConsent\)/);
 const review=read('docs/SWAPP_ADSENSE_REVIEW_20261019.md');
 assert.match(review,/ne s'agit ni d'une décision de Google/i);
 assert.match(review,/Demander un examen/);
});
