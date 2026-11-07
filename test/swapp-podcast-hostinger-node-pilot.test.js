'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const p=require('../scripts/swapp-podcast-hostinger-node-pilot.cjs');
function wav(){
 const data=Buffer.alloc(16000*2);
 for(let i=0;i<16000;i++)data.writeInt16LE(Math.round(2500*Math.sin(i/10)),i*2);
 return p.encodeWav([data],16000);
}
test('draft validates 30 turns and refuses public drafts',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/swapp-on-air/episode-pikmin-20261105.json'),'utf8'));
 assert.equal(p.validateDraft(d).length,30);
 d.publication_allowed=true;assert.throws(()=>p.validateDraft(d),/invalid_nonpublic_draft/);
 d.publication_allowed=false;d.segments[0].pause_after_ms=true;
 assert.throws(()=>p.validateDraft(d),/invalid_pause/);
});
test('WAV serialization is lossless and rejects corrupt data',()=>{
 const x=wav(),decoded=p.decodeWav(x);
 assert.equal(decoded.rate,16000);assert.equal(decoded.pcm.length,32000);
 assert.throws(()=>p.decodeWav(Buffer.from('bad')),/not_wav/);
});
test('two different speakers render to a single ordered WAV',async()=>{
 const calls=[],turns=[{speaker:'NOVA',text:'Bonjour Kern.',pause_after_ms:150},
 {speaker:'KERN',text:'Bonjour Nova.',pause_after_ms:200}];
 const result=await p.assemble(turns,async(speaker,text)=>{calls.push([speaker,text]);return wav()});
 assert.deepEqual(calls.map(x=>x[0]),['NOVA','KERN']);
 const parsed=p.decodeWav(result);
 assert.equal(parsed.pcm.length,32000*2+Math.round(16000*.15)*2);
});
test('render refuses missing model assets before loading runtime',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-podcast-test-'));
 try{
  const draft=path.join(dir,'draft.json');
  fs.writeFileSync(draft,JSON.stringify({publication_allowed:false,segments:[
   {speaker:'NOVA',text:'Salut Kern.'},{speaker:'KERN',text:'Salut Nova.'}]}));
  await assert.rejects(()=>p.render({draft,voiceDir:dir,output:path.join(dir,'out.mp3'),
   loadVoice:async()=>{throw Error('should not load')}}),/model_missing_/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
