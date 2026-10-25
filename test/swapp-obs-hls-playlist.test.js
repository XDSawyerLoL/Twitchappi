'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeObsPlaylist,playableObsManifest}=require('../modules/swapp-obs-hls-playlist');

test('real FFmpeg HLS playlist uses query-bearing segment URI and never exposes stream key',()=>{
 const key='a'.repeat(48);
 const manifest=Buffer.from(
  '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n'+
  '#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.920000,\n'+
  'put?cid='+key+'&file=index0.ts\n#EXTINF:2.000000,\n'+
  'put?cid='+key+'&file=index1.ts\n');
 const entries=normalizeObsPlaylist(manifest,key);
 assert.deepEqual(entries,[{name:'seg_0.ts',duration:1.92},{name:'seg_1.ts',duration:2}]);
 const segments=new Map();
 assert.equal(playableObsManifest(entries,segments),null,'cannot serve playlist before media exists');
 segments.set('seg_0.ts',Buffer.from([0x47]));
 const first=playableObsManifest(entries,segments);
 assert.equal(first.names.length,1);
 assert.match(first.manifest.toString(),/#EXTINF:1\.920000,\nseg_0\.ts/);
 assert.doesNotMatch(first.manifest.toString(),/cid=|put\?|a{48}/);
 segments.set('seg_1.ts',Buffer.from([0x47]));
 const second=playableObsManifest(entries,segments);
 assert.deepEqual(second.names,['seg_0.ts','seg_1.ts']);
 assert.match(second.manifest.toString(),/#EXT-X-TARGETDURATION:2/);
});

test('rejects forged stream keys, remote or traversal URLs and encrypted playlists',()=>{
 const key='a'.repeat(48);
 const lines=[
  'put?cid='+'b'.repeat(48)+'&file=index0.ts',
  'https://evil.test/media.ts',
  '../../etc/passwd',
  'put?cid='+key+'&file=../../secret.ts'
 ];
 for(const target of lines){
  assert.throws(()=>normalizeObsPlaylist(Buffer.from('#EXTM3U\n#EXTINF:2,\n'+target+'\n'),key),
   /playlist_segment_uri/);
 }
 assert.throws(()=>normalizeObsPlaylist(Buffer.from(
  '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="token"\n#EXTINF:2,\nindex0.ts\n'),key),
  /playlist_unsupported_feature/);
});

test('keeps only a contiguous available suffix, never missing HLS segments',()=>{
 const entries=[
  {name:'seg_10.ts',duration:2},
  {name:'seg_11.ts',duration:2.1},
  {name:'seg_12.ts',duration:1.9}
 ];
 const available=new Map([['seg_10.ts',Buffer.from([0x47])],['seg_12.ts',Buffer.from([0x47])]]);
 const ready=playableObsManifest(entries,available);
 assert.deepEqual(ready.names,['seg_12.ts']);
 assert.doesNotMatch(ready.manifest.toString(),/seg_10\.ts/);
 assert.match(ready.manifest.toString(),/#EXT-X-MEDIA-SEQUENCE:12/);
 assert.equal(ready.manifest.toString().includes('seg_11.ts'),false);
});
