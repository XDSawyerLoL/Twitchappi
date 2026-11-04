'use strict';
// SWAPP ON AIR — historical Mairaiy/Aoede voice method, made for offline editorial production.
// Never called by a public request, cron, push, or viewer. No secret in browser bundles.
const MODEL='gemini-3.1-flash-tts-preview';
const ENDPOINT='https://generativelanguage.googleapis.com/v1beta/models/'+MODEL+':generateContent';
const VOICES=Object.freeze({NOVA:'Aoede',KERN:'Charon'});
const SAMPLE_RATE=24000,CHANNELS=1,BYTES_PER_SAMPLE=2;
const MAX_TOTAL_CHARS=14000,MAX_TURNS=64;
function validateEpisode(episode){
 if(!episode||typeof episode!=='object')throw Error('episode_missing');
 if(typeof episode.title!=='string'||episode.title.trim().length<5||episode.title.length>160)
  throw Error('episode_title_invalid');
 if(episode.publication_allowed!==false)throw Error('voice_pilot_must_be_unpublished');
 const turns=episode.segments;
 if(!Array.isArray(turns)||turns.length<2||turns.length>MAX_TURNS)throw Error('episode_turn_count_invalid');
 let total=0;
 for(const [index,turn] of turns.entries()){
  if(!turn||typeof turn!=='object'||!Object.hasOwn(VOICES,turn.speaker))
   throw Error('episode_invalid_speaker_at_'+index);
  const t=turn.text;
  if(typeof t!=='string'||t.trim().length<4||t.length>600||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t))
   throw Error('episode_invalid_text_at_'+index);
  if(typeof turn.delivery!=='undefined'&&
     (typeof turn.delivery!=='string'||turn.delivery.length>130))
   throw Error('episode_invalid_delivery_at_'+index);
  total+=t.length;
 }
 if(total>MAX_TOTAL_CHARS)throw Error('episode_too_long');
 return episode;
}
function chunkEpisode(episode,{maxCharacters=1150,maxTurns=6}={}){
 validateEpisode(episode);
 if(!Number.isInteger(maxCharacters)||maxCharacters<600||maxCharacters>2200||
    !Number.isInteger(maxTurns)||maxTurns<2||maxTurns>8)throw Error('invalid_chunk_options');
 const chunks=[];let current=[],chars=0;
 for(const turn of episode.segments){
  if(current.length&&(current.length>=maxTurns||chars+turn.text.length>maxCharacters)){
   chunks.push(current);current=[];chars=0;
  }
  current.push(turn);chars+=turn.text.length;
 }
 if(current.length)chunks.push(current);
 return chunks;
}
function cleanText(text){
 return String(text).normalize('NFC').replace(/\r?\n/g,' ').replace(/\s+/g,' ').trim();
}
function makePrompt(turns){
 if(!Array.isArray(turns)||turns.length===0)throw Error('empty_dialogue');
 // Restores the Aura Live Mairaiy "close-mic, modern and natural" prompt.
 // Entire text after TRANSCRIPT is spoken verbatim; no sound beds or fake endorsements.
 const direction=turns.map((turn,i)=>[i+1,turn.speaker,cleanText(turn.delivery||(
  turn.speaker==='NOVA'?'curieuse, souriante et spontanée':'précis, légèrement ironique et conversationnel'))].join(' · ')).join('\n');
 const lines=turns.map(turn=>turn.speaker+': '+cleanText(turn.text)).join('\n');
 return [
  'Synthesize the following TWO-SPEAKER podcast dialogue in native French (France).',
  'This is a relaxed gaming conversation between Nova and Kern, not an audiobook, an advert or a robotic text readout.',
  'NOVA is a young adult French woman: intelligent, warm, witty, self-assured and emotionally present. Her voice is close-mic, modern and natural, like Mairaiy in Aura Live. The vocal identity is Aoede.',
  'KERN is an adult French male co-host: calm, analytical, gently skeptical, with dry timing, not an exaggerated announcer. His voice is Charon.',
  'Actors should react to one another: subtle natural breaths, micro-pauses, changes in intonation, audible smiles and conversational timing. No singing and no unnecessary exclamations.',
  'Do not add, remove, repeat, translate or paraphrase any spoken words. Do not read the director notes or speaker labels aloud.',
  '# DIRECTOR NOTES PER TURN',
  direction,
  '# TRANSCRIPT — SPEAK ONLY THE DIALOGUE BELOW',
  lines
 ].join('\n');
}
function buildGeminiPayload(turns){
 return {contents:[{parts:[{text:makePrompt(turns)}]}],
  generationConfig:{responseModalities:['AUDIO'],
   speechConfig:{languageCode:'fr-FR',multiSpeakerVoiceConfig:{
    speakerVoiceConfigs:Object.entries(VOICES).map(([speaker,voiceName])=>({
     speaker,voiceConfig:{prebuiltVoiceConfig:{voiceName}}
    }))
   }}}
 };
}
function estimateCost(episode){
 validateEpisode(episode);
 // Estimate only; never a hard Google billing quota. Pricing 2026: $20/M output
 // audio tokens (25/s) + $1/M text input tokens. 135 spoken words/min estimate.
 const words=episode.segments.flatMap(t=>t.text.trim().split(/\s+/)).length;
 const seconds=Math.ceil(words/2.25);
 const prompts=chunkEpisode(episode).map(makePrompt);
 const chars=prompts.reduce((sum,p)=>sum+p.length,0);
 const estimatedAudioUsd=seconds*25*20/1e6;
 const estimatedInputUsd=Math.ceil(chars/4)/1e6;
 return {words,seconds,requests:prompts.length,
  estimatedUsd:Math.ceil((estimatedAudioUsd+estimatedInputUsd)*10000)/10000,
  // Safety *estimate* for pre-flight user review, not a guarantee of charges.
  planningCeilingUsd:Math.ceil((estimatedAudioUsd*2.5+estimatedInputUsd*2)*10000)/10000};
}
function decodeAudioResponse(payload){
 if(payload?.error)throw Error('gemini_rejected_'+String(payload.error.code||payload.error.status||'unknown'));
 const part=payload?.candidates?.flatMap(c=>c?.content?.parts||[])
  .find(p=>p?.inlineData?.data&&typeof p.inlineData.data==='string');
 if(!part)throw Error('gemini_returned_no_audio');
 const mime=String(part.inlineData.mimeType||'');
 if(mime&&!/^(audio\/pcm|audio\/l16|audio\/x-pcm)(?:;|$)/i.test(mime))
  throw Error('gemini_unexpected_format_'+mime.slice(0,40));
 const match=/rate=(\d+)/i.exec(mime);
 if(match&&Number(match[1])!==SAMPLE_RATE)throw Error('gemini_sample_rate_mismatch');
 const raw=String(part.inlineData.data);
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)||raw.length<80)throw Error('gemini_invalid_audio');
 const pcm=Buffer.from(raw,'base64');
 if(pcm.length<1600||pcm.length%2!==0||pcm.subarray(0,4).toString('ascii')==='RIFF')
  throw Error('gemini_invalid_pcm');
 return pcm;
}
function pcmToWav(chunks,{gapMs=180}={}){
 if(!Array.isArray(chunks)||!chunks.length||!Number.isInteger(gapMs)||gapMs<0||gapMs>1000)
  throw Error('wav_input_invalid');
 const silence=Buffer.alloc(Math.round(SAMPLE_RATE*BYTES_PER_SAMPLE*gapMs/1000));
 const parts=[];
 chunks.forEach((pcm,i)=>{if(!Buffer.isBuffer(pcm)||pcm.length%2!==0)throw Error('wav_pcm_invalid');
  if(i)parts.push(silence);parts.push(pcm)});
 const data=Buffer.concat(parts), header=Buffer.alloc(44);
 if(data.length>0xffffffff-44)throw Error('wav_too_large');
 header.write('RIFF',0);header.writeUInt32LE(36+data.length,4);header.write('WAVE',8);
 header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);
 header.writeUInt16LE(CHANNELS,22);header.writeUInt32LE(SAMPLE_RATE,24);
 header.writeUInt32LE(SAMPLE_RATE*CHANNELS*BYTES_PER_SAMPLE,28);
 header.writeUInt16LE(CHANNELS*BYTES_PER_SAMPLE,32);header.writeUInt16LE(16,34);
 header.write('data',36);header.writeUInt32LE(data.length,40);
 return Buffer.concat([header,data]);
}
async function synthesizeEpisode(episode,{apiKey,fetcher=fetch,budgetUsd=0,enabled=false,
  onChunk=()=>{}}={}){
 validateEpisode(episode);
 if(!enabled)throw Error('voice_generation_disabled');
 if(!apiKey||String(apiKey).length<12)throw Error('gemini_key_missing');
 const estimate=estimateCost(episode);
 if(!Number.isFinite(budgetUsd)||budgetUsd<=0||budgetUsd>5||
  estimate.planningCeilingUsd>budgetUsd)throw Error('voice_cost_budget_not_approved');
 const chunks=chunkEpisode(episode),audio=[];
 // No retry: automatic retries can silently consume billable quotas.
 for(let i=0;i<chunks.length;i++){
  const result=await fetcher(ENDPOINT,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-goog-api-key':String(apiKey)},
   body:JSON.stringify(buildGeminiPayload(chunks[i])),
   signal:AbortSignal.timeout(90000)
  });
  if(!result?.ok)throw Error('gemini_http_'+String(result?.status||'unavailable'));
  const pcm=decodeAudioResponse(await result.json());
  audio.push(pcm);onChunk({index:i+1,total:chunks.length,seconds:pcm.length/(SAMPLE_RATE*BYTES_PER_SAMPLE)});
 }
 return {wav:pcmToWav(audio),metadata:{model:MODEL,voices:VOICES,requests:chunks.length,
  sampleRate:SAMPLE_RATE,renderedAt:new Date().toISOString(),
  budgetApprovalUsd:budgetUsd,costEstimateUsd:estimate.estimatedUsd,
  publication_allowed:false,watermark:'voix de synthèse IA; non publié'}};
}
module.exports={MODEL,ENDPOINT,VOICES,validateEpisode,chunkEpisode,makePrompt,buildGeminiPayload,
 estimateCost,decodeAudioResponse,pcmToWav,synthesizeEpisode};