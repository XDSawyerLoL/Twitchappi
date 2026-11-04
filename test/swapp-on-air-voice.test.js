'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const voice=require('../modules/swapp-on-air-voice');
const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data/swapp-on-air/episode-00-voice-demo.json'),'utf8'));
const tiny={title:'SWAPP ON AIR — voix de test',publication_allowed:false,segments:[
 {speaker:'NOVA',text:'Bonjour, bienvenue sur SWAPP On Air !',delivery:'chaleureuse'},
 {speaker:'KERN',text:'Salut Nova, prêt à discuter de vrais jeux ?',delivery:'sceptique, complice'}
]};
test('Restores the exact historical Mairaiy/Aoede identity and never uses browser TTS',()=>{
 assert.equal(voice.MODEL,'gemini-3.1-flash-tts-preview');
 assert.deepEqual(voice.VOICES,{NOVA:'Aoede',KERN:'Charon'});
 const prompt=voice.makePrompt(tiny.segments);
 assert.match(prompt,/close-mic, modern and natural/);
 assert.match(prompt,/Do not add, remove, repeat/);
 assert.doesNotMatch(prompt,/speechSynthesis|espeak/);
});
test('Uses provider multi-speaker schema with exact voices and fr-FR',()=>{
 const req=voice.buildGeminiPayload(tiny.segments);
 const config=req.generationConfig.speechConfig;
 assert.equal(config.languageCode,'fr-FR');
 assert.equal(config.multiSpeakerVoiceConfig.speakerVoiceConfigs[0].voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');
 assert.equal(config.multiSpeakerVoiceConfig.speakerVoiceConfigs[1].voiceConfig.prebuiltVoiceConfig.voiceName,'Charon');
 assert.equal(req.generationConfig.responseModalities[0],'AUDIO');
 assert.match(req.contents[0].parts[0].text,/NOVA: Bonjour/);
 assert.match(req.contents[0].parts[0].text,/KERN: Salut/);
});
test('Refuses to generate episodes marked for publication, preventing accidental live release',()=>{
 assert.throws(()=>voice.validateEpisode({...tiny,publication_allowed:true}),/must_be_unpublished/);
 assert.doesNotThrow(()=>voice.validateEpisode(doc));
});
test('Production episode is chunked into short conversations without changing turn order',()=>{
 const chunks=voice.chunkEpisode(doc);
 assert.equal(chunks.flat().length,doc.segments.length);
 assert.deepEqual(chunks.flat().map(t=>t.text),doc.segments.map(t=>t.text));
 assert(chunks.every(c=>c.length<=6));
 assert(chunks.length>=2);
});
test('No external API calls when the feature is disabled or no budget is approved',async()=>{
 let n=0;
 const fetcher=async()=>{n++;throw Error('unexpected_request');};
 await assert.rejects(voice.synthesizeEpisode(tiny,{enabled:false,apiKey:'long_private_key',
  budgetUsd:1,fetcher}),/voice_generation_disabled/);
 await assert.rejects(voice.synthesizeEpisode(tiny,{enabled:true,apiKey:'long_private_key',
  budgetUsd:0,fetcher}),/voice_cost_budget_not_approved/);
 assert.equal(n,0);
});
test('Successful mocked audio returns a valid WAV, no money or real network used',async()=>{
 let n=0;
 const pcm=Buffer.alloc(48000,0x11).toString('base64');
 const fetcher=async(uri,options)=>{
  n++;
  assert.equal(options.headers['x-goog-api-key'],'long_private_key');
  assert.equal(options.method,'POST');
  assert.match(uri,/gemini-3.1-flash-tts-preview:generateContent/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[
   {inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm}}
  ]}}]})};
 };
 const result=await voice.synthesizeEpisode(tiny,{
  enabled:true,budgetUsd:0.5,apiKey:'long_private_key',fetcher
 });
 assert.equal(n,1);
 assert.equal(result.wav.toString('ascii',0,4),'RIFF');
 assert.equal(result.wav.readUInt32LE(24),24000);
 assert.equal(result.metadata.publication_allowed,false);
 assert.equal(result.metadata.voices.NOVA,'Aoede');
});
test('Rejects mismatched sample rate and missing audio instead of falling back silently',()=>{
 assert.throws(()=>voice.decodeAudioResponse({candidates:[{content:{parts:[
  {inlineData:{mimeType:'audio/pcm;rate=16000',data:Buffer.alloc(4800).toString('base64')}}
 ]}}]}),/sample_rate_mismatch/);
 assert.throws(()=>voice.decodeAudioResponse({candidates:[{content:{parts:[{text:'sorry'}]}}]}),/no_audio/);
});
test('Cost forecast is disclosed before any spend, never claims free unlimited service',()=>{
 const e=voice.estimateCost(doc);
 assert(e.planningCeilingUsd>=e.estimatedUsd);
 assert(e.requests>0);
 assert(e.seconds>0);
});
