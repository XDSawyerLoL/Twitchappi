'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('reader remains isolated to article content and does not autoplay',()=>{
 const js=read('assets/swapp-reader-studio.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/swapp-reader-focus/);
 assert.match(js,/querySelectorAll\('h2,h3,p,li,blockquote'\)/);
 assert.match(js,/root\.prepend\(studio\)/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.doesNotMatch(js,/localStorage|XMLHttpRequest|sendBeacon|MediaRecorder|SpeechRecognition/);
 assert.match(js,/addEventListener\('click',play\)/);
 assert.match(js,/api\.pause\(\)/);
 assert.match(js,/api\.resume\(\)/);
 assert.match(js,/api\.cancel\(\)/);
});

test('Vivienne is the single voice; no selector, fallback voice or Mairaiy placeholder',()=>{
 const js=read('assets/swapp-reader-studio.js');
 assert.match(js,/function findVivienne\(\)/);
 assert.match(js,/api\.getVoices\(\)/);
 assert.match(js,/vivienne/i);
 assert.match(js,/chosen=vivienneVoice/);
 assert.match(js,/utterance\.voice=chosen/);
 assert.match(js,/disabled=!vivienneVoice/);
 assert.match(js,/swapp-reader-fixed-voice/);
 assert.match(js,/Voix <strong>Vivienne<\/strong>/);
 assert.match(js,/Aucune autre voix ne sera utilisée/);
 assert.doesNotMatch(js,/data-reader-voice|mairaiy|mairy|kokoro|SwappNeuralNarration/i);
 assert.doesNotMatch(js,/data-reader-online-consent/);
});

test('Vivienne is matched by name and locale, never replaced by another French voice',()=>{
 const js=read('assets/swapp-reader-studio.js');
 const match=js.match(/ function findVivienne\(\)\{[\s\S]*?\n \}/);
 assert.ok(match,'findVivienne should be a self-contained function');
 const pick=(voices,ready=true)=>new Function('speechReady','api',match[0]+';return findVivienne();')(ready,{getVoices:()=>voices});
 const other={name:'Microsoft Hortense Online',lang:'fr-FR',voiceURI:'hortense'};
 const vivi={name:'Microsoft Vivienne Online (Natural)',lang:'fr-FR',voiceURI:'vivienne-natural'};
 const nonFrench={name:'Vivienne English',lang:'en-US',voiceURI:'vivienne-en'};
 assert.equal(pick([other,vivi]),vivi);
 assert.equal(pick([nonFrench,other]),null);
 assert.equal(pick([nonFrench]),null);
 assert.equal(pick([vivi],false),null);
});

test('SPA, native article and cached fallback load only current Vivienne voice assets',()=>{
 const home=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 const script='/assets/swapp-reader-studio.js?v=20261020-vivienne-only-v2';
 const style='/assets/swapp-reader-studio.css?v=20261020-vivienne-only-v2';
 for(const page of [home,native]){
  assert.ok(page.includes(script));
  assert.ok(page.includes(style));
  assert.equal(page.split(script).length-1,1);
  assert.equal(page.split(style).length-1,1);
  assert.doesNotMatch(page,/src="\/assets\/swapp-neural-narration\.js/);
 }
 const legacy=read('assets/swapp-reader-experience.js');
 assert.doesNotThrow(()=>new Function(legacy));
 assert.match(legacy,/20261020-vivienne-only-v2/);
 assert.match(legacy,/SwappReaderStudio\?\.sync/);
 assert.doesNotMatch(legacy,/ensureScript\('swapp-neural-narration\.js'/);
 const release=read('tools/swapp-release.js');
 assert.match(release,/'assets\/swapp-reader-studio\.js'/);
 assert.match(release,/'assets\/swapp-reader-experience\.js'/);
});

test('fixed voice label works with responsive focus mode',()=>{
 const css=read('assets/swapp-reader-studio.css');
 assert.match(css,/swapp-reader-fixed-voice/);
 assert.match(css,/html\.swapp-reader-focus/);
 assert.match(css,/data-swapp-reader-theme="papier"/);
 assert.match(css,/data-swapp-reader-theme="sepia"/);
 assert.match(css,/data-swapp-reader-font="serif"/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/min-height:44px/);
});

test('production smoke enforces the single-voice interface with no prior dropdown',()=>{
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/swapp-reader-fixed-voice/);
 assert.match(smoke,/findVivienne/);
 assert.match(smoke,/Vivienne-only reader unexpectedly loads neural/);
 assert.match(smoke,/swapp-reader-focus/);
 const server=read('server.js');
 assert.ok(server.includes('swapp-reader-(?:studio|experience)'));
 assert.match(server,/no-store, no-cache, must-revalidate/);
});
