#!/usr/bin/env node
'use strict';
// Hostinger Node.js cron pilot. NEVER imported into app.js or server.js.
// No publishing, HTTP endpoints, tokens, live player, or streaming logic.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const VOICES={NOVA:'fr_FR-siwis-medium',KERN:'fr_FR-tom-medium'};
function validateDraft(d){
 if(!d||d.publication_allowed!==false||!Array.isArray(d.segments)||d.segments.length<2||d.segments.length>80)throw Error('invalid_nonpublic_draft');
 d.segments.forEach((s,i)=>{
  if(!VOICES[s?.speaker]||typeof s.text!=='string'||s.text.trim().length<3||s.text.length>350)throw Error('invalid_turn_'+i);
  const p=s.pause_after_ms??180;
  if(!Number.isInteger(p)||p<60||p>900)throw Error('invalid_pause_'+i);
 });
 return d.segments;
}
function decodeWav(bytes){
 const b=Buffer.from(bytes);
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('not_wav');
 let fmt=null,data=null;
 for(let p=12;p+8<=b.length;){
  const n=b.readUInt32LE(p+4),next=p+8+n+(n%2);
  if(p+8+n>b.length)throw Error('wav_truncated');
  const tag=b.toString('ascii',p,p+4);
  if(tag==='fmt '){
   if(n<16)throw Error('wav_bad_fmt');
   fmt={codec:b.readUInt16LE(p+8),channels:b.readUInt16LE(p+10),rate:b.readUInt32LE(p+12),bits:b.readUInt16LE(p+22)};
  }
  if(tag==='data')data=b.subarray(p+8,p+8+n);
  p=next;
 }
 if(!fmt||!data||fmt.codec!==1||fmt.channels!==1||fmt.bits!==16||fmt.rate<16000||fmt.rate>48000||data.length<1000||data.length%2)throw Error('unsupported_wav');
 return {...fmt,pcm:data};
}
function encodeWav(parts,rate){
 const size=parts.reduce((n,b)=>n+b.length,0);
 if(size>100*1024*1024)throw Error('episode_too_large');
 const h=Buffer.alloc(44);
 h.write('RIFF',0);h.writeUInt32LE(size+36,4);h.write('WAVEfmt ',8);
 h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
 h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);
 h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(size,40);
 return Buffer.concat([h,...parts],44+size);
}
async function assemble(turns,speak){
 let rate=null;const pieces=[];
 for(let i=0;i<turns.length;i++){
  const wave=decodeWav(await speak(turns[i].speaker,turns[i].text));
  if(rate!==null&&wave.rate!==rate)throw Error('inconsistent_sample_rate');
  rate=wave.rate;pieces.push(wave.pcm);
  if(i<turns.length-1)pieces.push(Buffer.alloc(Math.round(rate*(turns[i].pause_after_ms??180)/1000)*2));
 }
 return encodeWav(pieces,rate);
}
async function render({draft,voiceDir,output,ffmpeg='ffmpeg',loadVoice}){
 const turns=validateDraft(JSON.parse(fs.readFileSync(draft,'utf8')));
 if(!output.endsWith('.mp3'))throw Error('output_must_be_mp3');
 if(fs.existsSync(output)||fs.existsSync(output.replace(/\.mp3$/,'.wav')))throw Error('output_exists');
 for(const name of Object.values(VOICES)){
  const file=path.join(voiceDir,name+'.onnx');
  if(!fs.existsSync(file)||!fs.existsSync(file+'.json')||fs.statSync(file).size<1000000)throw Error('model_missing_'+name);
 }
 const factory=loadVoice||((p)=>require('pipertts').PiperNativeTTS.load({modelPath:p,numThreads:1,cacheOptimizedModel:false}));
 const voices={};
 for(const [speaker,name] of Object.entries(VOICES))voices[speaker]=await factory(path.join(voiceDir,name+'.onnx'));
 const wav=await assemble(turns,async(speaker,text)=>{
  const result=await voices[speaker].synthesize(text,{outputFormat:'wav'});
  return result.audio;
 });
 const wavOut=output.replace(/\.mp3$/,'.wav');
 fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
 fs.writeFileSync(wavOut,wav,{flag:'wx',mode:0o600});
 // A failed MP3 conversion leaves the original WAV for recovery; never publish it.
 const proc=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-n','-i',wavOut,'-codec:a','libmp3lame','-b:a','160k',output],{timeout:90000,encoding:'utf8'});
 if(proc.error||proc.status!==0||!fs.existsSync(output)||fs.statSync(output).size<30000){
  if(fs.existsSync(output))fs.unlinkSync(output);
  throw Error('mp3_encoding_failed: '+String(proc.error?.message||proc.stderr||'').slice(0,200));
 }
 return {wav:wavOut,mp3:output,turns:turns.length,published:false,review_required:true};
}
async function main(){
 const output=path.join(ROOT,'.swapp-on-air-private','swapp-podcast-pikmin-node-pilot-v1.mp3');
 const args=process.argv.slice(2);
 if(!args.includes('--render')){
  console.log(JSON.stringify({mode:'dry-run',no_publication:true,render_requires:'--render',output}));
  return;
 }
 if(process.env.SWAPP_PODCAST_CRON_ENABLED!=='1')throw Error('pilot_disabled_set_SWAPP_PODCAST_CRON_ENABLED_1');
 const result=await render({
  draft:path.join(ROOT,'data/swapp-on-air/episode-pikmin-20261105.json'),
  voiceDir:path.join(ROOT,'.swapp-on-air-private','piper-voices'),
  output
 });
 console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(e=>{console.error('PODCAST pilot:',e.message);process.exitCode=1});
module.exports={validateDraft,decodeWav,encodeWav,assemble,render,VOICES};
