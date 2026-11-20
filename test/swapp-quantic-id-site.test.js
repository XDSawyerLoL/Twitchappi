'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const fs=require('node:fs');
const {verifySignedAssertion,originAllowed,TTL_MS}=require('../modules/swapp-quantic-id-presence');
function createProof({challenge='A'.repeat(43),audience='https://swapp.tv',issuedAt=new Date().toISOString(),algorithm='ed25519'}={}){
 const keys=generateKeyPairSync(algorithm==='ed25519'?'ed25519':'ec',algorithm==='ed25519'?{}:{namedCurve:'prime256v1'});
 const der=keys.publicKey.export({type:'spki',format:'der'});
 const keyId='qid_'+createHash('sha256').update(der).digest('hex').slice(0,32);
 const payload=JSON.stringify({version:1,keyId,challenge,audience,issuedAt});
 const signature=sign(algorithm==='ed25519'?null:'sha256',Buffer.from(payload),algorithm==='ed25519'?keys.privateKey:{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {proof:{version:1,algorithm,keyId,publicKey:der.toString('base64url'),payload,signature},challenge,keyId};
}
test('real Quantic ID signed proofs accepted only for the correct site origin',()=>{
 const {proof,challenge,keyId}=createProof();
 assert.equal(verifySignedAssertion({proof,challenge,audience:'https://swapp.tv'}),keyId);
 assert.throws(()=>verifySignedAssertion({proof,challenge,audience:'https://www.swapp.tv'}));
 assert.throws(()=>verifySignedAssertion({proof,challenge:'B'.repeat(43),audience:'https://swapp.tv'}));
});
test('SWAPP Quantic ID allows the existing hardware P-256 signed proofs',()=>{
 const {proof,challenge,keyId}=createProof({algorithm:'ecdsa-p256-sha256'});
 assert.equal(verifySignedAssertion({proof,challenge,audience:'https://swapp.tv'}),keyId);
});
test('forged and expired proofs are rejected',()=>{
 const {proof,challenge}=createProof();
 assert.throws(()=>verifySignedAssertion({proof:{...proof,signature:Buffer.alloc(64).toString('base64url')},challenge,audience:'https://swapp.tv'}));
 const old=createProof({issuedAt:'2020-01-01T00:00:00.000Z'});
 assert.throws(()=>verifySignedAssertion({proof:old.proof,challenge:old.challenge,audience:'https://swapp.tv'}));
 assert.equal(TTL_MS,10000);
 assert.match(fs.readFileSync(require.resolve('../modules/swapp-quantic-id-presence.js'),'utf8'),/CHALLENGE_MS=60_000/);
});
test('production strictly permits SWAPP origin only',()=>{
 assert.equal(originAllowed('https://swapp.tv'),true);
 assert.equal(originAllowed('https://www.swapp.tv'),true);
 assert.equal(originAllowed('https://evil.example'),false);
 assert.equal(originAllowed('http://127.0.0.1:4567',true),false);
});
test('SWAPP site integrates Quantic ID without hijacking SWAPP sessions',()=>{
 const server=fs.readFileSync(require.resolve('../server.js'),'utf8');
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const ui=fs.readFileSync(require.resolve('../assets/swapp-quantic-id-site.js'),'utf8');
 assert.match(server,/\/api\/quantic-id/);
 assert.match(html,/swapp-quantic-id-site\.js/);
 assert.match(ui,/\/account\/\+/);
 assert.doesNotMatch(ui,/oryonUser|twitchUser|SWAPP_ADMIN|localStorage/);
 assert.match(ui,/swapp-vault-primary-login/);
 assert.match(ui,/document\.getElementById\('loginForm'\)/);
 assert.match(ui,/quantic-identity-vault-mark\.svg/);
 assert.match(ui,/addEventListener\('click'/);
 assert.doesNotMatch(ui,/autoAttempted|setInterval\(\(\)=>void authorize\('login'\)/);
 assert.doesNotMatch(ui,/swapp-quantic-id-presence|swapp-quantic-account-login|Mot de passe actuel du compte SWAPP/);
});
