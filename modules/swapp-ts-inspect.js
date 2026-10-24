'use strict';
// Read only transport-stream program metadata. Never decode or re-encode media.
const CODECS=Object.freeze({0x01:'MPEG1 video',0x02:'MPEG2 video',0x03:'MPEG1 audio',0x04:'MPEG2 audio',0x0f:'AAC',0x11:'AAC LATM',0x1b:'H.264',0x24:'HEVC',0x81:'AC-3',0x06:'private'});
function inspectTsMedia(data){
 if(!Buffer.isBuffer(data)||data.length<188)return {valid:false,tracks:[]};
 const tracks=[],programPids=new Set();
 let pmtPid=-1,seenPat=false,seenPmt=false,videoPid=-1,spsProfile=null;
 for(let start=0;start+188<=data.length&&start<188*3500;start+=188){
  if(data[start]!==0x47)continue;
  const b1=data[start+1],pid=((b1&0x1f)<<8)|data[start+2];
  const pusi=!!(b1&0x40),afc=(data[start+3]>>4)&3;
  if(!(afc&1))continue;
  let p=start+4;
  if(afc&2)p+=1+data[p];
  const end=start+188;if(p>=end)continue;
  if(pid===videoPid && spsProfile===null){
   for(let k=p;k+5<end;k++){
    if(data[k]===0&&data[k+1]===0&&data[k+2]===1&&(data[k+3]&0x1f)===7){
     spsProfile=data[k+4];break;
    }
   }
  }
  if(!pusi||(pid!==0&&pid!==pmtPid))continue;
  p+=1+data[p]; // PSI pointer field
  if(p+12>end)continue;
  const tableId=data[p],sectionLength=((data[p+1]&0x0f)<<8)|data[p+2];
  const sectionEnd=p+3+sectionLength;
  if(sectionEnd>end||sectionLength<9)continue; // ignore sections spanning packets
  if(pid===0&&tableId===0){
   seenPat=true;
   for(let k=p+8;k+4<=sectionEnd-4;k+=4){
    const program=(data[k]<<8)|data[k+1];
    if(program){pmtPid=((data[k+2]&0x1f)<<8)|data[k+3];programPids.add(pmtPid);break}
   }
  }else if(pid===pmtPid&&tableId===2){
   seenPmt=true;
   const infoLength=((data[p+10]&0x0f)<<8)|data[p+11];
   for(let k=p+12+infoLength;k+5<=sectionEnd-4;){
    const type=data[k],streamPid=((data[k+1]&0x1f)<<8)|data[k+2];
    const esLength=((data[k+3]&0x0f)<<8)|data[k+4];
    if(!tracks.some(t=>t.pid===streamPid))tracks.push({type,codec:CODECS[type]||'unknown',pid:streamPid});
    if((type===0x1b||type===0x24)&&videoPid<0)videoPid=streamPid;
    k+=5+esLength;
   }
  }
 }
 return {valid:data[0]===0x47,pat:seenPat,pmt:seenPmt,
  tracks:tracks.slice(0,12),h264_sps_profile_idc:spsProfile,
  video_browser_compatible:tracks.some(t=>t.type===0x1b),
  audio_browser_compatible:tracks.some(t=>t.type===0x0f||t.type===0x11)};
}
module.exports={inspectTsMedia};
