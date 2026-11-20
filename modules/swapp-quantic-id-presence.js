'use strict';
/*
 * Quantic ID ephemeral presence on SWAPP — opt-in, no account privileges.
 * No passwords, mail keys, permanent profile, QID fingerprint or bearer tokens
 * are written to MySQL, logs or the SWAPP session.
 * This does NOT replace or grant the existing SWAPP account session.
 */
const {createHash,createPublicKey,randomBytes,verify}=require('node:crypto');
const rateLimit=require('express-rate-limit');

const TTL_MS=10_000;
const CHALLENGE_MS=10_000;
const LIMIT=3000;
const COOKIE='swapp_qid_presence';

function originAllowed(origin,prod=true){
  if(origin==='https://swapp.tv'||origin==='https://www.swapp.tv')return true;
  if(!prod&&/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(origin||''))return true;
  return false;
}
function verifySignedAssertion({proof,challenge,audience,now=Date.now()}={}){
  if(!proof||typeof proof!=='object'||proof.version!==1||
    typeof proof.payload!=='string'||proof.payload.length>4096||
    typeof proof.publicKey!=='string'||proof.publicKey.length>2048||
    typeof proof.signature!=='string'||proof.signature.length>2048||
    typeof proof.keyId!=='string'||!/^qid_[a-f0-9]{32}$/.test(proof.keyId)||
    !/^[A-Za-z0-9_-]+$/.test(proof.publicKey)||
    !/^[A-Za-z0-9_-]+$/.test(proof.signature)||
    !originAllowed(audience,false))throw Error('quantic_proof_invalid');
  let payload;
  try{payload=JSON.parse(proof.payload)}catch{throw Error('quantic_proof_invalid')}
  if(payload?.version!==1||payload.keyId!==proof.keyId||payload.challenge!==challenge||
    payload.audience!==audience||!Number.isFinite(Date.parse(payload.issuedAt))||
    Math.abs(now-Date.parse(payload.issuedAt))>5000)throw Error('quantic_proof_expired_or_wrong_audience');
  const der=Buffer.from(proof.publicKey,'base64url');
  if(der.length>512||der.length<32)throw Error('quantic_public_key_invalid');
  const fingerprint='qid_'+createHash('sha256').update(der).digest('hex').slice(0,32);
  if(fingerprint!==proof.keyId)throw Error('quantic_key_id_mismatch');
  let publicKey;
  try{publicKey=createPublicKey({key:der,format:'der',type:'spki'})}
  catch{throw Error('quantic_public_key_invalid')}
  let algorithm,verificationKey;
  if(proof.algorithm==='ed25519'&&publicKey.asymmetricKeyType==='ed25519'){
    algorithm=null;verificationKey=publicKey;
  }else if(proof.algorithm==='ecdsa-p256-sha256'&&publicKey.asymmetricKeyType==='ec'&&
      publicKey.asymmetricKeyDetails?.namedCurve==='prime256v1'){
    algorithm='sha256';verificationKey={key:publicKey,dsaEncoding:'ieee-p1363'};
  }else throw Error('quantic_algorithm_invalid');
  const signature=Buffer.from(proof.signature,'base64url');
  if(signature.length!==64||!verify(algorithm,Buffer.from(proof.payload),verificationKey,signature)){
    throw Error('quantic_signature_invalid');
  }
  return fingerprint;
}
function createQuanticPresenceRouter(express,{now=Date.now,prod=process.env.NODE_ENV==='production'}={}){
  const router=express.Router();
  const challenges=new Map();
  const sessions=new Map();
  const readToken=req=>typeof req.cookies?.[COOKIE]==='string' ? req.cookies[COOKIE] : '';
  const cookieOptions={httpOnly:true,sameSite:'strict',secure:prod,path:'/api/quantic-id'};
  const clean=()=>{
    const t=now();
    for(const [key,rec] of challenges)if(rec.expiresAt<=t)challenges.delete(key);
    for(const [key,rec] of sessions)if(rec.expiresAt<=t)sessions.delete(key);
  };
  const writeLimiter=rateLimit({windowMs:60_000,max:80,standardHeaders:true,legacyHeaders:false});
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store, max-age=0');
    res.set('X-Content-Type-Options','nosniff');
    clean();
    if(req.method==='POST'){
      if(!originAllowed(req.get('Origin'),prod)||!/^application\/json(?:;|$)/i.test(req.get('Content-Type')||'')){
        return res.status(403).json({error:'quantic_origin_or_content_type_forbidden'});
      }
      if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
        Buffer.byteLength(JSON.stringify(req.body),'utf8')>LIMIT)return res.status(400).json({error:'quantic_invalid_request'});
    }
    next();
  });
  router.get('/status',(req,res)=>{
    const active=sessions.get(readToken(req));
    return res.json({active:!!active,expiresAt:active?new Date(active.expiresAt).toISOString():null,ttlMs:TTL_MS});
  });
  router.get('/visible',(_req,res)=>{
    const seen=new Map();
    for(const rec of sessions.values())if(rec.expiresAt>now())seen.set(rec.keyId,rec.alias);
    return res.json({users:[...seen.values()].map(alias=>({alias,online:true}))});
  });
  router.post('/challenge',writeLimiter,(req,res)=>{
    const purpose=req.body.purpose;
    if(!['activate','renew'].includes(purpose))return res.status(400).json({error:'quantic_purpose_invalid'});
    const prior=purpose==='renew'?sessions.get(readToken(req)):null;
    if(purpose==='renew'&&!prior)return res.status(401).json({error:'quantic_presence_expired'});
    const challenge=randomBytes(32).toString('base64url');
    const audience=req.get('Origin');
    challenges.set(challenge,{purpose,token:prior?readToken(req):null,audience,expiresAt:now()+CHALLENGE_MS});
    return res.json({challenge,audience,expiresAt:new Date(now()+CHALLENGE_MS).toISOString()});
  });
  async function applyProof(req,res,purpose){
    const challenge=req.body.challenge;
    if(typeof challenge!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(challenge))return res.status(400).json({error:'quantic_challenge_invalid'});
    const rec=challenges.get(challenge);
    challenges.delete(challenge); // one-use, even after proof failure
    if(!rec||rec.purpose!==purpose||rec.audience!==req.get('Origin')||
      rec.expiresAt<=now()||(purpose==='renew'&&rec.token!==readToken(req))){
      return res.status(401).json({error:'quantic_challenge_expired_or_used'});
    }
    let keyId;
    try{keyId=verifySignedAssertion({proof:req.body.proof,challenge,audience:rec.audience,now:now()})}
    catch{return res.status(401).json({error:'quantic_signature_or_audience_invalid'})}
    let alias;
    if(purpose==='renew'){
      const old=sessions.get(rec.token);
      if(!old||old.keyId!==keyId)return res.status(401).json({error:'quantic_identity_mismatch'});
      alias=old.alias;
      sessions.delete(rec.token);
    }else{
      alias=typeof req.body.alias==='string'?req.body.alias.trim().slice(0,64):'';
      if(!alias||/[\x00-\x1f\x7f<>]/.test(alias))alias='Utilisateur Quantic';
    }
    const token=randomBytes(32).toString('base64url');
    const expiresAt=now()+TTL_MS;
    sessions.set(token,{keyId,alias,expiresAt});
    res.cookie(COOKIE,token,{...cookieOptions,maxAge:TTL_MS});
    return res.json({active:true,expiresAt:new Date(expiresAt).toISOString(),alias});
  }
  router.post('/activate',writeLimiter,(req,res)=>void applyProof(req,res,'activate'));
  router.post('/renew',writeLimiter,(req,res)=>void applyProof(req,res,'renew'));
  router.post('/lock',writeLimiter,(req,res)=>{
    const token=readToken(req),existing=sessions.get(token);
    if(existing){
      for(const [key,rec] of sessions)if(rec.keyId===existing.keyId)sessions.delete(key);
    }
    res.clearCookie(COOKIE,cookieOptions);
    return res.json({revoked:!!existing,active:false});
  });
  router.get('/health',(_req,res)=>res.json({enabled:true,ttlMs:TTL_MS,storage:'volatile-process-memory',role:'presence-only'}));
  return router;
}
module.exports={createQuanticPresenceRouter,verifySignedAssertion,originAllowed,TTL_MS};
