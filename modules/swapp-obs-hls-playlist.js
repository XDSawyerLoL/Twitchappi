'use strict';
// OBS/FFmpeg HTTP HLS playlist normalization. Never serve the ingest URL,
// its ?cid= stream key, or any untrusted tag/URL to a public viewer.
const MAX_PLAYLIST_BYTES=65536;
const MAX_ITEMS=18;
function normalizeObsPlaylist(bytes,streamKey){
 if(!Buffer.isBuffer(bytes)||bytes.length<15||bytes.length>MAX_PLAYLIST_BYTES)
  throw Error('playlist_size');
 const source=bytes.toString('utf8').replace(/^\uFEFF/,'');
 if(!source.startsWith('#EXTM3U'))throw Error('playlist_header');
 if(/#EXT-X-(?:KEY|SESSION-KEY|MAP|BYTERANGE|STREAM-INF|I-FRAME-STREAM-INF)\b|#EXT-X-DEFINE\b|#EXT-X-PART\b/i.test(source))
  throw Error('playlist_unsupported_feature');
 const lines=source.split(/\r?\n/),entries=[],token=String(streamKey||'');
 let duration=null;
 for(const rawLine of lines){
  const line=rawLine.trim();
  if(!line)continue;
  if(line.startsWith('#')){
   const match=/^#EXTINF:([0-9]+(?:\.[0-9]+)?),/.exec(line);
   if(match){
    if(duration!==null)throw Error('playlist_duration_without_segment');
    duration=Number(match[1]);
    if(!Number.isFinite(duration)||duration<0.05||duration>20)throw Error('playlist_duration');
   }
   continue;
  }
  if(duration===null)throw Error('playlist_unexpected_uri');
  // With the OBS muxer output name ".../put?cid=KEY&file=index.m3u8",
  // FFmpeg writes "put?cid=KEY&file=index0.ts" into the M3U8.
  // Only that exact shape or its plain basename is supported.
  let match=/^index([0-9]{1,14})\.ts$/.exec(line);
  if(!match){
   const direct=/^put\?cid=([0-9a-f]{48})&file=index([0-9]{1,14})\.ts$/i.exec(line);
   if(!direct||!token||direct[1].toLowerCase()!==token.toLowerCase())
    throw Error('playlist_segment_uri');
   match=[line,direct[2]];
  }
  const n=Number(match[1]);
  if(!Number.isSafeInteger(n))throw Error('playlist_segment_id');
  const name='seg_'+n+'.ts';
  if(entries.some(x=>x.name===name))throw Error('playlist_duplicate_segment');
  entries.push({name,duration});
  if(entries.length>MAX_ITEMS)throw Error('playlist_too_many_segments');
  duration=null;
 }
 if(duration!==null)throw Error('playlist_missing_uri');
 if(!entries.length)throw Error('playlist_empty');
 return entries;
}
function playableObsManifest(entries,segments){
 // A full OBS manifest often arrives one segment BEFORE the latest .ts
 // upload. Advertise only a contiguous suffix whose data is already stored.
 const available=entries.filter(entry=>segments.has(entry.name));
 if(!available.length)return null;
 const contiguous=[];
 for(let i=available.length-1;i>=0;i--){
  const current=available[i];
  if(contiguous.length){
   const next=Number(contiguous[0].name.match(/\d+/)[0]);
   const previous=Number(current.name.match(/\d+/)[0]);
   if(next!==previous+1)break;
  }
  contiguous.unshift(current);
 }
 if(!contiguous.length)return null;
 const target=Math.max(1,Math.ceil(Math.max(...contiguous.map(x=>x.duration))));
 const first=Number(contiguous[0].name.match(/\d+/)[0]);
 const manifest='#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:'+target+
  '\n#EXT-X-MEDIA-SEQUENCE:'+first+'\n'+
  contiguous.map(x=>'#EXTINF:'+x.duration.toFixed(6)+',\n'+x.name+'\n').join('');
 return {manifest:Buffer.from(manifest,'utf8'),names:contiguous.map(x=>x.name),entries:contiguous};
}
module.exports={normalizeObsPlaylist,playableObsManifest};
