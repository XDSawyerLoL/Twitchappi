'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectTsMedia}=require('../modules/swapp-ts-inspect');
function synthetic(){
 const ts=Buffer.alloc(188*3,0xff);
 function packet(offset,pid){
  ts[offset]=0x47;ts[offset+1]=0x40|((pid>>8)&31);
  ts[offset+2]=pid&255;ts[offset+3]=0x10;ts[offset+4]=0;
 }
 packet(0,0);
 Buffer.from([0,0xb0,13,0,1,0xc1,0,0,0,1,0xe1,0,0,0,0,0]).copy(ts,5);
 packet(188,256);
 Buffer.from([2,0xb0,23,0,1,0xc1,0,0,0xe1,1,0xf0,0,
   0x1b,0xe1,1,0xf0,0,0x0f,0xe1,2,0xf0,0,0,0,0,0]).copy(ts,193);
 packet(376,257);
 Buffer.from([0,0,0,1,0x67,100,0,31,0,0,0,1,0x68,0,0,0,1,0x65,0xaa]).copy(ts,381);
 return ts;
}
test('probe inspects H264/AAC codecs and SPS/PPS/IDR without transcoding',()=>{
 const sample=synthetic(),before=Buffer.from(sample);
 const media=inspectTsMedia(sample);
 assert.equal(media.valid,true);
 assert.equal(media.pat,true);
 assert.equal(media.pmt,true);
 assert.equal(media.video_browser_compatible,true);
 assert.equal(media.audio_browser_compatible,true);
 assert.deepEqual(media.tracks.map(track=>track.codec),['H.264','AAC']);
 assert.equal(media.h264_sps_profile_idc,100);
 assert.equal(media.h264_nal_units.sps,1);
 assert.equal(media.h264_nal_units.pps,1);
 assert.equal(media.h264_nal_units.idr,1);
 assert.deepEqual(sample,before,'the media bytes must remain unchanged');
});
