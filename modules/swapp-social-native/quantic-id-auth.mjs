import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
// All Quantic ID assertions are Ed25519 and explicitly bound to SOCIAL.
// A device-presence bit is never accepted as authentication.
export const QUANTIC_SOCIAL_PREFIX='quantic-social:v1:';
export const QUANTIC_CHALLENGE_MS=60_000;
export const QUANTIC_SESSION_MS=12_000;
export function newQuanticChallenge(){
  const random=randomBytes(32).toString('base64url');
  return QUANTIC_SOCIAL_PREFIX+random;
}
export function validQuanticChallenge(value){
  return typeof value==='string'&&/^quantic-social:v1:[A-Za-z0-9_-]{43}$/.test(value);
}
export function identityFingerprint(publicKey) {
  if(!publicKey||publicKey.kty!=='OKP'||publicKey.crv!=='Ed25519'||
    typeof publicKey.x!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(publicKey.x))return '';
  try{
    const raw=Buffer.from(publicKey.x,'base64url');
    if(raw.length!==32)return '';
    return createHash('sha256').update('quantic-id-ed25519:v1:').update(raw).digest('hex');
  }catch{return ''}
}
export function verifyQuanticProof(challenge,signature,publicKey){
  if(!validQuanticChallenge(challenge)||typeof signature!=='string'||
    signature.length>120||!identityFingerprint(publicKey))return false;
  try{
    const raw=Buffer.from(signature,'base64url');
    if(raw.length!==64)return false;
    const key=createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:publicKey.x},format:'jwk'});
    return verify(null,Buffer.from(challenge,'utf8'),key,raw);
  }catch{return false}
}
export function normalizeQuanticAssertion(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(typeof raw.keyId!=='string'||!/^[-_a-zA-Z0-9:.]{4,120}$/.test(raw.keyId))return null;
  if(typeof raw.signature!=='string'||raw.signature.length>120)return null;
  if(raw.algorithm && !['ed25519','Ed25519'].includes(raw.algorithm))return null;
  return {keyId:raw.keyId,signature:raw.signature,publicKey:raw.publicKey||null};
}
