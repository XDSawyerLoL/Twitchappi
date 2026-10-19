'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');

function player(){
 const scope={window:{},console};
 vm.runInNewContext(read('assets/swapp-neural-narration.js'),scope);
 return scope.window.SwappNeuralNarration;
}

test('cached French studio audio requires exact slug, paragraphs and safe same-origin file',()=>{
 const api=player();
 const blocks=[{text:'Un jeu magnifique.',node:{}},{text:'Les créateurs jouent.',node:{}}];
 const data={version:1,slug:'un-jeu-publie',language:'fr-FR',engine:'kokoro-82m-v1.0',
   audio:'audio.mp3',blocks:[
     {text:blocks[0].text,start:0,end:1.7},
     {text:blocks[1].text,start:1.88,end:3.4},
   ]};
 assert.equal(api.validManifest(data,'un-jeu-publie',blocks),true);
 assert.equal(api.validManifest({...data,slug:'autre-jeu'},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,audio:'../../secrets'},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,language:'en-US'},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,engine:'fake-tts'},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,blocks:[{...data.blocks[0],text:'Nouveau texte'},data.blocks[1]]},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,blocks:[data.blocks[1],data.blocks[0]]},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,blocks:[{...data.blocks[0],start:-10},data.blocks[1]]},'un-jeu-publie',blocks),false);
 assert.equal(api.validManifest({...data,blocks:[{...data.blocks[0],end:1.9},{...data.blocks[1],start:0.5}]},'un-jeu-publie',blocks),false);
});

test('neural audio is opt in and only reads published same-origin static manifests',()=>{
 const js=read('assets/swapp-neural-narration.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/data-reader-audio-toggle/);
 assert.match(js,/if\(!panel\.hidden\)discover\(\)/);
 assert.match(js,/\/assets\/swapp-narrations\//);
 assert.match(js,/credentials:'omit'/);
 assert.match(js,/cache:'no-store'/);
 assert.match(js,/AbortController/);
 assert.match(js,/preload='none'/);
 assert.match(js,/source/); // code contains the manifest audio.src assignment
 assert.doesNotMatch(js,/XMLHttpRequest|localStorage|sendBeacon|analytics|SpeechRecognition|microphone/);
 assert.match(js,/audio\.addEventListener\('timeupdate'/);
 assert.match(js,/previous|before\.addEventListener\('click'/);
 assert.match(js,/audio\.addEventListener\('play'/);
 assert.match(js,/pagehide/);
});

test('two SWAPP article shells load studio after provider and before existing reader',()=>{
 const home=read('index.html'),native=read('modules/swapp-news/site-shell.js');
 for(const page of [home,native]){
  const provider=page.indexOf('swapp-neural-narration.js?v=20261019-neural-v1');
  const reader=page.indexOf('swapp-reader-studio.js?v=20261019-reading-v2');
  assert.ok(provider>0&&reader>provider);
  assert.ok(page.includes('swapp-reader-studio.css?v=20261019-reading-v1'));
 }
 const studio=read('assets/swapp-reader-studio.js');
 assert.match(studio,/SwappNeuralNarration\?\.attach/);
 assert.match(studio,/SwappNeuralNarration\?\.pauseActive/);
});

test('release fingerprint and Hostinger smoke include studio player without audio dependency',()=>{
 assert.match(read('tools/swapp-release.js'),/'assets\/swapp-neural-narration.js'/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/Neural narration player missing or stale/);
 assert.match(smoke,/swapp-neural-narration.js/);
 // Production must not require a specific article audio file to serve the website.
 assert.doesNotMatch(smoke,/\/assets\/swapp-narrations\/[a-z0-9-]+\/manifest\.json/);
});

test('offline producer uses French Kokoro voice; never runs inference on Hostinger',()=>{
 const script=read('tools/swapp-narration-generate.py');
 assert.match(script,/KPipeline\(lang_code="f"\)/);
 assert.match(script,/voice="ff_siwis"/);
 assert.match(script,/espeak-ng/);
 assert.match(script,/assets\/swapp-narrations/);
 assert.match(script,/api\/actus\//);
 assert.match(script,/\"audio_sha256\"/);
 assert.doesNotMatch(script,/OPENAI_API_KEY|ELEVENLABS_API_KEY|GROQ_API_KEY|tts\.azure|api\.openai/);
});
