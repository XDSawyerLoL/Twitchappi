'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
// Test ephemeral, never production, keys. Does not contact a Push gateway or DB.
const vapid=crypto.createECDH('prime256v1');vapid.generateKeys();
process.env.SWAPP_PUSH_VAPID_PUBLIC_KEY=vapid.getPublicKey().toString('base64url');
process.env.SWAPP_PUSH_VAPID_PRIVATE_KEY=vapid.getPrivateKey().toString('base64url');
process.env.SWAPP_PUSH_VAPID_SUBJECT='mailto:test@swapp.tv';
process.env.SWAPP_PUSH_ENABLED='1';
process.env.SWAPP_ACCOUNT_STORE='mysql';
process.env.SWAPP_MYSQL_URL='mysql://test:secret@localhost:3306/swapp_test';
const push=require('../modules/swapp-live-push');
const hmac=(key,input)=>crypto.createHmac('sha256',key).update(input).digest();
const extract=(salt,input)=>hmac(salt,input);
const expand=(prk,info,size)=>hmac(prk,Buffer.concat([Buffer.from(info),Buffer.from([1])])).subarray(0,size);
test('untrusted URLs and private hostnames are never accepted as Push endpoints',()=>{
 for(const input of ['http://fcm.googleapis.com/x','https://127.0.0.1/path','https://localhost/',
  'https://evil.example.com/push','https://fcm.googleapis.com.evil.tld/x',
  'https://user:pass@fcm.googleapis.com/send'])assert.equal(push.validEndpoint(input),false,input);
 for(const input of ['https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/Q','https://wns2-pn1.notify.windows.com/WNS'])assert.equal(push.validEndpoint(input),true,input);
});
test('payload encryption round-trips using the recipient key and AES128GCM framing',()=>{
 const receiver=crypto.createECDH('prime256v1');receiver.generateKeys();
 const auth=crypto.randomBytes(16);
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/example',
  keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}};
 assert.equal(push.validSubscription(sub),true);
 const payload={title:'Sansa en direct',body:'Un titre SWAPP',url:'/sansa',tag:'swapp-live-sansa'};
 const result=push.webPushRequest(sub,payload);
 assert.equal(result.headers['Content-Encoding'],'aes128gcm');
 assert.equal(result.headers.TTL,'120');
 assert.match(result.headers.Authorization,/^vapid t=[^,]+, k=/);
 const body=result.body,salt=body.subarray(0,16);
 assert.equal(body.readUInt32BE(16),4096);
 assert.equal(body[20],65);
 const senderPublic=body.subarray(21,86);
 const shared=receiver.computeSecret(senderPublic);
 const info=Buffer.concat([Buffer.from('WebPush: info\0'),receiver.getPublicKey(),senderPublic]);
 const ikm=expand(extract(auth,shared),info,32);
 const prk=extract(salt,ikm);
 const cek=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
 const sealed=body.subarray(86);
 const decipher=crypto.createDecipheriv('aes-128-gcm',cek,nonce);
 decipher.setAuthTag(sealed.subarray(sealed.length-16));
 const plain=Buffer.concat([decipher.update(sealed.subarray(0,-16)),decipher.final()]);
 assert.equal(plain.at(-1),2,'final record padding delimiter');
 assert.deepEqual(JSON.parse(plain.subarray(0,-1).toString()),payload);
});
test('VAPID bearer JWT is correctly ES256 signed with the configured key',()=>{
 const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
 const s={endpoint:'https://fcm.googleapis.com/fcm/send/x',keys:{
  p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 const data=push.webPushRequest(s,{title:'Live'});
 const m=data.headers.Authorization.match(/^vapid t=([\w-]+\.[\w-]+)\.([\w-]+), k=/);
 assert.ok(m);
 const jwt=JSON.parse(Buffer.from(m[1].split('.')[1],'base64url').toString());
 assert.equal(jwt.aud,'https://fcm.googleapis.com');
 assert.equal(jwt.sub,'mailto:test@swapp.tv');
 const publicBytes=vapid.getPublicKey();
 const publicKey=crypto.createPublicKey({key:{
  kty:'EC',crv:'P-256',x:publicBytes.subarray(1,33).toString('base64url'),
  y:publicBytes.subarray(33,65).toString('base64url')},format:'jwk'});
 assert.ok(crypto.verify('sha256',Buffer.from(m[1]),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(m[2],'base64url')));
});
test('routes are opt-in, session-bound and require same-origin writes',()=>{
 const routes={get:{},post:{}},app={
  get(path,handler){routes.get[path]=handler},post(path,handler){routes.post[path]=handler}};
 push.makeLivePush({isFollowing:()=>true}).register(app);
 assert.ok(routes.get['/swapp-live-sw.js']);
 assert.ok(routes.get['/api/swapp/live-alerts/status']);
 assert.ok(routes.post['/api/swapp/live-alerts/enable']);
 assert.ok(routes.post['/api/swapp/live-alerts/disable']);
 let result=null,statusCode=200;
 const response={set(){return this},status(code){statusCode=code;return this},json(d){result=d;return this}};
 return routes.post['/api/swapp/live-alerts/enable'](
  {get:()=>'',session:{oryonUser:{id:'test'}},body:{}},response).then(()=>{
   assert.equal(statusCode,403);
   assert.equal(result.success,false);
  });
});
test('service worker is notification-only and client never simulates paid subscription',()=>{
 const worker=fs.readFileSync(path.join(__dirname,'..','swapp-live-sw.js'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'..','assets/swapp-live-alert-bell.js'),'utf8');
 const relay=fs.readFileSync(path.join(__dirname,'..','modules/swapp-direct-hls-relay.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 new Function(worker);new Function(client);
 assert.match(worker,/registration\.showNotification/);
 assert.match(worker,/notificationclick/);
 assert.match(client,/Notification\.requestPermission\(\)/);
 assert.match(client,/pushManager\.subscribe/);
 assert.match(client,/swapp-live-alerts\/enable/);
 assert.doesNotMatch(client,/stripe|checkout|billing|premium_monthly/i);
 assert.match(relay,/room\.pushDispatched=true/);
 assert.match(server,/native:viewer:media/);
 assert.match(server,/swappLivePush\.notifyLive\(room,r\.pushId,r\.title\)/);
});
