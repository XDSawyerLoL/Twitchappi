'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');

function fixture(record){
 const log=[];
 const actor={id:'u-alice',login:'alice',display_name:'Alice'};
 const target={id:'u-bob',login:'bob',display_name:'Bob'};
 const fetchImpl=async(url,options)=>{
  log.push({step:'fetch',url});
  if(url.endsWith('/auth/login'))return{
   status:200,json:async()=>({token:'a'.repeat(43)})
  };
  return{status:200,text:async()=>JSON.stringify({success:true})};
 };
 const proxy=createSocialNativeProxy(fetchImpl,{
  production:true,restoreLocalSession:async()=>actor,
  ssoSecret:'test-social-sso-signing-key-at-least-24',
  lookupLocalUser:handle=>handle==='bob'?target:null,
  listLocalUsers:()=>[actor,target],
  recordAudioBlock:async(...args)=>{log.push({step:'record'});await record(...args)}
 });
 return{
  log,async send(){
   const req={
    method:'POST',path:'/users/bob/block',body:{},session:{},
    originalUrl:'/api/pulse/users/bob/block',
    headers:{origin:'https://swapp.tv',referer:'https://swapp.tv/social'}
   };
   const res={statusCode:200,
    set(){return this},status(n){this.statusCode=n;return this},
    json(data){this.data=data;return this}
   };
   await proxy(req,res);return res;
  }
 };
}
test('SWAPP blocking persists audio privacy before forwarding to external SOCIAL',async()=>{
 const h=fixture(async(actor,target)=>{
  assert.equal(actor.id,'u-alice');
  assert.equal(target.id,'u-bob');
 });
 const result=await h.send();
 assert.equal(result.statusCode,200);
 const record=h.log.findIndex(item=>item.step==='record');
 const forward=h.log.findIndex(item=>item.url?.includes('/users/')&&item.url.endsWith('/block'));
 assert.ok(record>=0&&forward>record,'audio block must be written before upstream forward');
});
test('failed privacy block refuses to forward even when external SOCIAL is reachable',async()=>{
 const h=fixture(async()=>{throw Error('mysql_unavailable')});
 const result=await h.send();
 assert.equal(result.statusCode,503);
 assert.equal(result.data.error,'social_audio_block_unavailable');
 assert.ok(!h.log.some(item=>item.url?.endsWith('/block')));
});
