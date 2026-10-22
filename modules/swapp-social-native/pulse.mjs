// SWAPP-hosted derivative of QuanticSillage/backend/pulse.mjs (2026-10-20).
// Persist ONLY to a migrated Hostinger MySQL snapshot. No JSON/Firestore fallback;
// no automatic empty-store creation and no contact with Render from this module.
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { newQuanticChallenge, validQuanticChallenge, identityFingerprint, verifyQuanticProof,
  normalizeQuanticAssertion, QUANTIC_CHALLENGE_MS, QUANTIC_SESSION_MS } from './quantic-id-auth.mjs';


const SESSION_MS=2592000000;
const HANDLE_RE=/^[a-z0-9_]{3,24}$/;
// This vendored runtime shares SWAPP's EXISTING Hostinger MySQL service only.
const SWAPP_SOCIAL_MYSQL_URL=String(process.env.SWAPP_SOCIAL_MYSQL_URL||
 process.env.SWAPP_MYSQL_URL||process.env.DATABASE_URL||'');
const usePostgres=false;
const useMysql=Boolean(SWAPP_SOCIAL_MYSQL_URL);
const SOCIAL_STORE_TABLE='swapp_social_native_store';
const SOCIAL_STORE_KEY='pulse';
function requireImportedSnapshot(rows){
 if(!Array.isArray(rows)||!rows.length)throw Object.assign(new Error('social_mysql_import_required'),{status:503});
 const data=typeof rows[0].data==='string'?JSON.parse(rows[0].data):rows[0].data;
 if(!data||typeof data!=='object'||!data.users||!data.handles||!data.posts||!data.messages)
   throw Object.assign(new Error('social_mysql_snapshot_invalid'),{status:503});
 return data;
}
let mysqlPool=null,mysqlPoolInitializing=null;
const rate=new Map();

function emptyStore(){return{version:1,users:{},handles:{},sessions:{},posts:{},follows:{},likes:{},reposts:{},bookmarks:{},circles:{},circleMembers:{},notifications:{},reports:{},blocks:{},conversations:{},messages:{},quanticChallenges:{},quanticKeys:{}}}
function id(prefix=''){return prefix+randomBytes(12).toString('hex')}
function sha(v){return createHash('sha256').update(String(v)).digest('hex')}
function now(){return new Date().toISOString()}
function clean(v,max=500){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max)}
function safeHttpsUrl(v,max=1600){const value=clean(v,max);if(!value)return'';try{const u=new URL(value);return u.protocol==='https:'?u.href:''}catch{return''}}
function json(res,status,body,extra={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra});res.end(JSON.stringify(body))}
async function bodyJson(req,limit=65536){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('body_too_large'),{status:413});chunks.push(chunk)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('invalid_json'),{status:400})}}
function bearer(req){return String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1]||''}
function hashPassword(password,salt=randomBytes(16).toString('hex')){return{salt,hash:scryptSync(String(password),salt,64).toString('hex')}}
function verifyPassword(password,user){const a=scryptSync(String(password),user.passwordSalt,64),b=Buffer.from(user.passwordHash,'hex');return a.length===b.length&&timingSafeEqual(a,b)}
function allowRate(req,bucket,max,windowMs){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),key=ip+':'+bucket,t=Date.now(),cur=rate.get(key);if(!cur||t-cur.start>windowMs){rate.set(key,{start:t,count:1});return true}cur.count++;return cur.count<=max}

async function pool(){
  if(!useMysql)throw Object.assign(new Error('social_mysql_url_missing'),{status:503});
  if(mysqlPool)return mysqlPool;
  if(mysqlPoolInitializing)return mysqlPoolInitializing;
  mysqlPoolInitializing=(async()=>{
    const valid=new URL(SWAPP_SOCIAL_MYSQL_URL);
    if(valid.protocol!=='mysql:'||!valid.hostname||!valid.username||
       !valid.pathname||valid.pathname==='/')
      throw Object.assign(new Error('social_mysql_url_invalid'),{status:503});
    const mysql=await import('mysql2/promise');
    const candidate=mysql.createPool({uri:SWAPP_SOCIAL_MYSQL_URL,waitForConnections:true,
      connectionLimit:4,queueLimit:50,connectTimeout:5000,enableKeepAlive:true,timezone:'Z'});
    try{
      await candidate.query(`CREATE TABLE IF NOT EXISTS swapp_social_native_store (
        store_key VARCHAR(40) NOT NULL PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      mysqlPool=candidate;
      return mysqlPool;
    }catch(e){await candidate.end().catch(()=>{});throw e}
  })();
  try{return await mysqlPoolInitializing}
  finally{mysqlPoolInitializing=null}
}
async function readStore(){
 const p=await pool();
 const [rows]=await p.execute('SELECT data FROM swapp_social_native_store WHERE store_key=?',['pulse']);
 return requireImportedSnapshot(rows);
}
async function mutateStore(fn){
 const p=await pool(),conn=await p.getConnection();
 try{
  await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT data FROM swapp_social_native_store WHERE store_key=? FOR UPDATE',['pulse']);
  const store=requireImportedSnapshot(rows);
  const out=await fn(store);
  const [result]=await conn.execute('UPDATE swapp_social_native_store SET data=? WHERE store_key=?',
    [JSON.stringify(store),'pulse']);
  if(result.affectedRows!==1)throw Object.assign(new Error('social_mysql_write_failed'),{status:503});
  await conn.commit();
  return out;
 }catch(e){await conn.rollback();throw e}
 finally{conn.release()}
}
function mapSet(map,key){if(!map[key])map[key]=[];return map[key]}
function blocked(store,a,b){return!!((store.blocks[a]||[]).includes(b)||(store.blocks[b]||[]).includes(a))}
function publicUser(user,store,viewerId=''){
  const followers=Object.values(store.follows||{}).filter(arr=>arr.includes(user.id)).length;
  return{id:user.id,handle:user.handle,displayName:user.displayName,bio:user.bio||'',avatar:user.avatar||'',verified:!!user.verified,createdAt:user.createdAt,followers,following:(store.follows[user.id]||[]).length,isFollowing:viewerId?(store.follows[viewerId]||[]).includes(user.id):false}
}
function visibleTo(store,post,viewerId=''){if(!post||post.deletedAt)return false;if(post.circleId)return!!viewerId&&!!(store.circleMembers[post.circleId]||{})[viewerId];return!viewerId||!blocked(store,viewerId,post.authorId)}
function postView(post,store,viewerId=''){
  const author=store.users[post.authorId];if(!author)return null;
  const likes=store.likes[post.id]||[],reposts=store.reposts[post.id]||[],bookmarks=store.bookmarks[viewerId]||[];
  const replies=Object.values(store.posts).filter(p=>!p.deletedAt&&p.replyToId===post.id).length;
  const q=post.quotePostId&&store.posts[post.quotePostId];
  return{id:post.id,author:publicUser(author,store,viewerId),body:post.body,createdAt:post.createdAt,replyToId:post.replyToId||null,quotePostId:post.quotePostId||null,circleId:post.circleId||null,linkUrl:post.linkUrl||'',linkTitle:post.linkTitle||'',imageUrl:post.imageUrl||'',mediaUrl:post.mediaUrl||'',mediaType:post.mediaType||'',quote:q&&visibleTo(store,q,viewerId)&&store.users[q.authorId]?{id:q.id,body:q.body,createdAt:q.createdAt,author:publicUser(store.users[q.authorId],store,viewerId),linkUrl:q.linkUrl||'',linkTitle:q.linkTitle||'',imageUrl:q.imageUrl||'',mediaUrl:q.mediaUrl||''}:null,counts:{likes:likes.length,reposts:reposts.length,replies},viewer:{liked:likes.includes(viewerId),reposted:reposts.includes(viewerId),bookmarked:bookmarks.includes(post.id)}}
}
function cleanupSessions(store){const t=Date.now();for(const[h,s]of Object.entries(store.sessions||{}))if(s.expiresAt<=t)delete store.sessions[h]}
async function auth(req,store=null){const token=bearer(req);if(!token)return null;store||=await readStore();cleanupSessions(store);const s=store.sessions[sha(token)],user=s&&s.expiresAt>Date.now()&&store.users[s.userId];return user?{user,token,store}:null}
function createSession(store,userId,{quantic=false}={}){
  const token=randomBytes(32).toString('base64url');
  store.sessions[sha(token)]={userId,createdAt:Date.now(),
    expiresAt:Date.now()+(quantic?QUANTIC_SESSION_MS:SESSION_MS),
    ...(quantic?{quantic:true}:{})};
  return token;
}
function notify(store,userId,payload){if(!userId||userId===payload.actorId)return;if(!store.notifications[userId])store.notifications[userId]=[];store.notifications[userId].unshift({id:id('n_'),createdAt:now(),read:false,...payload});store.notifications[userId]=store.notifications[userId].slice(0,300)}
function conversationKey(a,b){return[a,b].sort().join(':')}

export async function pulseInfo(){return{storage:useMysql?'mysql':'unavailable',postgresConfigured:false,mysqlConfigured:useMysql}}

export async function handlePulse(req,res,url,corsHeaders={}){
  if(!url.pathname.startsWith('/api/pulse/'))return false;
  const route=url.pathname;
  try{
    if(!allowRate(req,'all',180,60000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}

    if(route==='/api/pulse/health'&&req.method==='GET'){json(res,200,{ok:true,service:'quantic-pulse',storage:usePostgres?'postgres':useMysql?'mysql':'json'},corsHeaders);return true}

    if(route==='/api/pulse/auth/quantic/challenge'&&req.method==='POST'){
      if(!allowRate(req,'quantic-challenge',30,60000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}
      const challenge=newQuanticChallenge(),expiresAt=Date.now()+QUANTIC_CHALLENGE_MS;
      const capacity=await mutateStore(store=>{
        store.quanticChallenges||={};
        for(const [k,v] of Object.entries(store.quanticChallenges)){
          if(v.expiresAt<Date.now())delete store.quanticChallenges[k];
        }
        // Prevent unauthenticated nonce requests from inflating the entire
        // persisted SOCIAL document without bound, even behind a proxy.
        if(Object.keys(store.quanticChallenges).length>=512)return false;
        store.quanticChallenges[sha(challenge)]={expiresAt};
        return true;
      });
      if(!capacity){json(res,429,{error:'quantic_challenge_capacity'},corsHeaders);return true}
      json(res,200,{challenge,relyingParty:'quanticminds.onrender.com',
        algorithm:'Ed25519',expiresInMs:QUANTIC_CHALLENGE_MS},corsHeaders);
      return true
    }

    if(route==='/api/pulse/auth/quantic/complete'&&req.method==='POST'){
      if(!allowRate(req,'quantic-complete',30,60000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}
      const b=await bodyJson(req,8192),challenge=b.challenge;
      const proof=normalizeQuanticAssertion(b);
      if(!validQuanticChallenge(challenge)||!proof){json(res,400,{error:'invalid_quantic_proof'},corsHeaders);return true}
      const out=await mutateStore(store=>{
        store.quanticChallenges||={};
        store.quanticKeys||={};
        const tokenHash=sha(challenge),pending=store.quanticChallenges[tokenHash];
        if(!pending||pending.expiresAt<=Date.now())return{error:'expired_or_replayed_challenge'};
        // Every challenge is one-shot even if the signature fails.
        delete store.quanticChallenges[tokenHash];
        const enrolled=Object.values(store.quanticKeys).find(item=>item.keyId===proof.keyId);
        const publicKey=proof.publicKey||enrolled?.publicKey;
        const fingerprint=identityFingerprint(publicKey);
        if(!fingerprint)return{error:'quantic_public_key_required'};
        if(!verifyQuanticProof(challenge,proof.signature,publicKey))return{error:'invalid_quantic_signature'};
        // No trust in keyId alone: verify that any preexisting keyId refers to
        // precisely the same Ed25519 public key.
        if(enrolled&&enrolled.fingerprint!==fingerprint)return{error:'quantic_identity_mismatch'};
        let mapped=store.quanticKeys[fingerprint];
        const bearerToken=bearer(req),session=store.sessions[sha(bearerToken)];
        const signedInUser=session&&session.expiresAt>Date.now()?store.users[session.userId]:null;
        let userId=mapped?.userId;
        if(mapped&&signedInUser&&signedInUser.id!==userId)return{error:'quantic_identity_already_bound'};
        if(!userId&&signedInUser){userId=signedInUser.id}
        if(!userId){
          const handle='qid_'+fingerprint.slice(0,16);
          if(store.handles[handle])return{error:'quantic_handle_collision'};
          const uid=id('u_'),pw=hashPassword(randomBytes(32).toString('base64url'));
          store.users[uid]={id:uid,handle,displayName:'Quantic ID',bio:'',avatar:'',
            verified:false,passwordSalt:pw.salt,passwordHash:pw.hash,createdAt:now(),updatedAt:now()};
          store.handles[handle]=uid;
          store.follows[uid]=[];
          store.blocks[uid]=[];
          store.bookmarks[uid]=[];
          userId=uid;
        }
        if(!store.users[userId])return{error:'account_missing'};
        store.quanticKeys[fingerprint]={fingerprint,keyId:proof.keyId,publicKey:{kty:'OKP',crv:'Ed25519',x:publicKey.x},userId};
        const token=createSession(store,userId,{quantic:true});
        return{token,user:publicUser(store.users[userId],store,userId),
          expiresInMs:QUANTIC_SESSION_MS,keyId:proof.keyId};
      });
      const code=out.error?(['expired_or_replayed_challenge','quantic_identity_already_bound','quantic_identity_mismatch','quantic_handle_collision'].includes(out.error)?409:400):200;
      json(res,code,out,corsHeaders);return true
    }

    if(route==='/api/pulse/auth/register'&&req.method==='POST'){
      const b=await bodyJson(req),handle=clean(b.handle,24).toLowerCase().replace(/^@/,''),displayName=clean(b.displayName,50),password=String(b.password||'');
      if(!allowRate(req,'register-ip',60,3600000)||!allowRate(req,'register-handle-'+sha(handle).slice(0,16),8,3600000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}
      if(!HANDLE_RE.test(handle)){json(res,400,{error:'invalid_handle'},corsHeaders);return true}
      if(displayName.length<2){json(res,400,{error:'invalid_display_name'},corsHeaders);return true}
      if(password.length<10||password.length>128){json(res,400,{error:'weak_password'},corsHeaders);return true}
      const out=await mutateStore(store=>{if(store.handles[handle])return{error:'handle_taken'};const uid=id('u_'),pw=hashPassword(password);store.users[uid]={id:uid,handle,displayName,bio:'',avatar:'',verified:false,passwordSalt:pw.salt,passwordHash:pw.hash,createdAt:now(),updatedAt:now()};store.handles[handle]=uid;store.follows[uid]=[];store.blocks[uid]=[];store.bookmarks[uid]=[];const token=createSession(store,uid);return{token,user:publicUser(store.users[uid],store,uid)}});
      json(res,out.error?409:201,out,corsHeaders);return true
    }

    if(route==='/api/pulse/auth/login'&&req.method==='POST'){
      const b=await bodyJson(req),handle=clean(b.handle,24).toLowerCase().replace(/^@/,''),password=String(b.password||'');
      if(!allowRate(req,'login-ip',600,900000)||!allowRate(req,'login-handle-'+sha(handle).slice(0,16),20,900000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}
      const out=await mutateStore(store=>{const uid=store.handles[handle],user=uid&&store.users[uid];if(!user||!verifyPassword(password,user))return{error:'invalid_credentials'};const token=createSession(store,uid);return{token,user:publicUser(user,store,uid)}});
      json(res,out.error?401:200,out,corsHeaders);return true
    }

    if(route==='/api/pulse/auth/logout'&&req.method==='POST'){const token=bearer(req);if(token)await mutateStore(store=>{delete store.sessions[sha(token)]});json(res,200,{ok:true},corsHeaders);return true}

    if(route==='/api/pulse/me'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store);if(!a){json(res,401,{error:'unauthorized'},corsHeaders);return true}json(res,200,{user:publicUser(a.user,store,a.user.id)},corsHeaders);return true}

    if(route==='/api/pulse/me'&&req.method==='PATCH'){
      const b=await bodyJson(req),out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId];if(!user)return{error:'unauthorized'};const displayName=clean(b.displayName??user.displayName,50),bio=clean(b.bio??user.bio,240),avatar=clean(b.avatar??user.avatar,500);if(displayName.length<2)return{error:'invalid_display_name'};user.displayName=displayName;user.bio=bio;user.avatar=avatar;user.updatedAt=now();return{user:publicUser(user,store,user.id)}});
      json(res,out.error?(out.error==='unauthorized'?401:400):200,out,corsHeaders);return true
    }

    if(route==='/api/pulse/feed'&&req.method==='GET'){
      const store=await readStore(),a=await auth(req,store),viewer=a?.user.id||'',mode=url.searchParams.get('mode')==='discover'?'discover':'following',limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit')||30)));
      let posts=Object.values(store.posts).filter(p=>visibleTo(store,p,viewer)&&!p.replyToId);
      if(mode==='following'&&viewer){const allowed=new Set([viewer,...(store.follows[viewer]||[])]);posts=posts.filter(p=>allowed.has(p.authorId))}
      if(mode==='discover')posts.sort((x,y)=>{const score=p=>(store.likes[p.id]?.length||0)*2+(store.reposts[p.id]?.length||0)*3+Math.max(0,48-(Date.now()-Date.parse(p.createdAt))/3600000);return score(y)-score(x)});else posts.sort((x,y)=>Date.parse(y.createdAt)-Date.parse(x.createdAt));
      json(res,200,{posts:posts.slice(0,limit).map(p=>postView(p,store,viewer)).filter(Boolean)},corsHeaders);return true
    }

    if(route==='/api/pulse/posts'&&req.method==='POST'){
      if(!allowRate(req,'post',24,60000)){json(res,429,{error:'rate_limited'},corsHeaders);return true}
      const b=await bodyJson(req),text=clean(b.body,420);if(!text){json(res,400,{error:'empty_post'},corsHeaders);return true}
      const linkUrl=safeHttpsUrl(b.linkUrl),linkTitle=clean(b.linkTitle,240),imageUrl=safeHttpsUrl(b.imageUrl),mediaUrl=safeHttpsUrl(b.mediaUrl),mediaType=clean(b.mediaType,20)==='gif'?'gif':'';
      const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId];if(!user)return{error:'unauthorized'};const replyToId=clean(b.replyToId,80)||null,quotePostId=clean(b.quotePostId,80)||null,circleId=clean(b.circleId,80)||null;if(replyToId&&!store.posts[replyToId])return{error:'reply_target_not_found'};if(quotePostId&&!visibleTo(store,store.posts[quotePostId],user.id))return{error:'quote_target_not_found'};if(circleId&&!(store.circleMembers[circleId]||{})[user.id])return{error:'circle_forbidden'};const pid=id('p_'),post={id:pid,authorId:user.id,body:text,createdAt:now(),replyToId,quotePostId,circleId,linkUrl,linkTitle,imageUrl,mediaUrl,mediaType,deletedAt:null};store.posts[pid]=post;if(replyToId)notify(store,store.posts[replyToId].authorId,{actorId:user.id,type:'reply',objectId:pid});if(quotePostId)notify(store,store.posts[quotePostId].authorId,{actorId:user.id,type:'quote',objectId:pid});return{post:postView(post,store,user.id)}});
      json(res,out.error?(out.error==='unauthorized'?401:400):201,out,corsHeaders);return true
    }

    let m=route.match(/^\/api\/pulse\/posts\/([^/]+)$/);
    if(m&&req.method==='GET'){const store=await readStore(),a=await auth(req,store),post=store.posts[m[1]];if(!post||!visibleTo(store,post,a?.user.id||'')){json(res,404,{error:'not_found'},corsHeaders);return true}json(res,200,{post:postView(post,store,a?.user.id||'')},corsHeaders);return true}
    if(m&&req.method==='DELETE'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],post=store.posts[m[1]];if(!user)return{error:'unauthorized'};if(!post)return{error:'not_found'};if(post.authorId!==user.id)return{error:'forbidden'};post.deletedAt=now();return{ok:true}});json(res,out.error?(out.error==='unauthorized'?401:out.error==='forbidden'?403:404):200,out,corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/posts\/([^/]+)\/replies$/);
    if(m&&req.method==='GET'){const store=await readStore(),a=await auth(req,store),viewer=a?.user.id||'',posts=Object.values(store.posts).filter(p=>p.replyToId===m[1]&&visibleTo(store,p,viewer)).sort((x,y)=>Date.parse(x.createdAt)-Date.parse(y.createdAt));json(res,200,{posts:posts.map(p=>postView(p,store,viewer)).filter(Boolean)},corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/posts\/([^/]+)\/(like|repost|bookmark)$/);
    if(m&&req.method==='POST'){const postId=m[1],action=m[2],out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],post=store.posts[postId];if(!user)return{error:'unauthorized'};if(!post||post.deletedAt)return{error:'not_found'};const map=action==='like'?store.likes:action==='repost'?store.reposts:store.bookmarks,key=action==='bookmark'?user.id:postId,arr=mapSet(map,key),target=action==='bookmark'?postId:user.id,i=arr.indexOf(target),active=i<0;if(active)arr.push(target);else arr.splice(i,1);if(active&&action!=='bookmark')notify(store,post.authorId,{actorId:user.id,type:action,objectId:post.id});return{ok:true,active,post:postView(post,store,user.id)}});json(res,out.error?(out.error==='unauthorized'?401:404):200,out,corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/users\/([a-z0-9_]{3,24})$/);
    if(m&&req.method==='GET'){const store=await readStore(),a=await auth(req,store),uid=store.handles[m[1]],user=uid&&store.users[uid];if(!user){json(res,404,{error:'not_found'},corsHeaders);return true}const posts=Object.values(store.posts).filter(p=>p.authorId===uid&&!p.replyToId&&visibleTo(store,p,a?.user.id||'')).sort((x,y)=>Date.parse(y.createdAt)-Date.parse(x.createdAt)).slice(0,40);json(res,200,{user:publicUser(user,store,a?.user.id||''),posts:posts.map(p=>postView(p,store,a?.user.id||''))},corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/users\/([a-z0-9_]{3,24})\/follow$/);
    if(m&&req.method==='POST'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],targetId=store.handles[m[1]];if(!user)return{error:'unauthorized'};if(!targetId)return{error:'not_found'};if(targetId===user.id)return{error:'self_follow'};const arr=mapSet(store.follows,user.id),i=arr.indexOf(targetId),active=i<0;if(active)arr.push(targetId);else arr.splice(i,1);if(active)notify(store,targetId,{actorId:user.id,type:'follow',objectId:user.id});return{ok:true,active,user:publicUser(store.users[targetId],store,user.id)}});json(res,out.error?(out.error==='unauthorized'?401:out.error==='not_found'?404:400):200,out,corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/users\/([a-z0-9_]{3,24})\/block$/);
    if(m&&req.method==='POST'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],targetId=store.handles[m[1]];if(!user)return{error:'unauthorized'};if(!targetId)return{error:'not_found'};if(targetId===user.id)return{error:'self_block'};const arr=mapSet(store.blocks,user.id),i=arr.indexOf(targetId),active=i<0;if(active)arr.push(targetId);else arr.splice(i,1);if(active){store.follows[user.id]=(store.follows[user.id]||[]).filter(x=>x!==targetId);store.follows[targetId]=(store.follows[targetId]||[]).filter(x=>x!==user.id)}return{ok:true,active}});json(res,out.error?(out.error==='unauthorized'?401:out.error==='not_found'?404:400):200,out,corsHeaders);return true}

    if(route==='/api/pulse/search'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store),viewer=a?.user.id||'',q=clean(url.searchParams.get('q'),80).toLowerCase();if(q.length<2){json(res,200,{users:[],posts:[]},corsHeaders);return true}const users=Object.values(store.users).filter(u=>!blocked(store,viewer,u.id)&&[u.handle,u.displayName,u.bio||''].join(' ').toLowerCase().includes(q)).slice(0,12).map(u=>publicUser(u,store,viewer)),posts=Object.values(store.posts).filter(p=>visibleTo(store,p,viewer)&&p.body.toLowerCase().includes(q)).sort((x,y)=>Date.parse(y.createdAt)-Date.parse(x.createdAt)).slice(0,30).map(p=>postView(p,store,viewer));json(res,200,{users,posts},corsHeaders);return true}

    if(route==='/api/pulse/circles'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store),viewer=a?.user.id||'',circles=Object.values(store.circles).filter(c=>c.visibility==='public'||(store.circleMembers[c.id]||{})[viewer]).map(c=>({...c,memberCount:Object.keys(store.circleMembers[c.id]||{}).length,joined:!!(store.circleMembers[c.id]||{})[viewer]})).sort((x,y)=>Date.parse(y.createdAt)-Date.parse(x.createdAt));json(res,200,{circles},corsHeaders);return true}

    if(route==='/api/pulse/circles'&&req.method==='POST'){const b=await bodyJson(req),out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId];if(!user)return{error:'unauthorized'};const name=clean(b.name,60),description=clean(b.description,240),visibility=b.visibility==='private'?'private':'public';if(name.length<3)return{error:'invalid_name'};const cid=id('c_'),circle={id:cid,ownerId:user.id,name,description,visibility,createdAt:now()};store.circles[cid]=circle;store.circleMembers[cid]={[user.id]:'owner'};return{circle:{...circle,memberCount:1,joined:true}}});json(res,out.error?(out.error==='unauthorized'?401:400):201,out,corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/circles\/([^/]+)\/join$/);
    if(m&&req.method==='POST'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],circle=store.circles[m[1]];if(!user)return{error:'unauthorized'};if(!circle)return{error:'not_found'};if(circle.visibility==='private')return{error:'invite_required'};const members=store.circleMembers[circle.id]||(store.circleMembers[circle.id]={}),active=!members[user.id];if(active)members[user.id]='member';else if(user.id!==circle.ownerId)delete members[user.id];return{ok:true,active,memberCount:Object.keys(members).length}});json(res,out.error?(out.error==='unauthorized'?401:out.error==='not_found'?404:403):200,out,corsHeaders);return true}

    if(route==='/api/pulse/notifications'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store);if(!a){json(res,401,{error:'unauthorized'},corsHeaders);return true}const items=(store.notifications[a.user.id]||[]).slice(0,100).map(n=>({...n,actor:store.users[n.actorId]?publicUser(store.users[n.actorId],store,a.user.id):null}));json(res,200,{notifications:items},corsHeaders);return true}

    if(route==='/api/pulse/notifications/read'&&req.method==='POST'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId];if(!user)return{error:'unauthorized'};(store.notifications[user.id]||[]).forEach(n=>n.read=true);return{ok:true}});json(res,out.error?401:200,out,corsHeaders);return true}

    if(route==='/api/pulse/me/bookmarks'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store);if(!a){json(res,401,{error:'unauthorized'},corsHeaders);return true}const posts=(store.bookmarks[a.user.id]||[]).map(pid=>store.posts[pid]).filter(p=>visibleTo(store,p,a.user.id)).map(p=>postView(p,store,a.user.id));json(res,200,{posts},corsHeaders);return true}

    if(route==='/api/pulse/report'&&req.method==='POST'){const b=await bodyJson(req),out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId];if(!user)return{error:'unauthorized'};const targetType=['post','user'].includes(b.targetType)?b.targetType:'post',targetId=clean(b.targetId,80),reason=clean(b.reason,240);if(!targetId||reason.length<3)return{error:'invalid_report'};const rid=id('r_');store.reports[rid]={id:rid,reporterId:user.id,targetType,targetId,reason,status:'open',createdAt:now()};return{ok:true,id:rid}});json(res,out.error?(out.error==='unauthorized'?401:400):201,out,corsHeaders);return true}

    if(route==='/api/pulse/conversations'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store);if(!a){json(res,401,{error:'unauthorized'},corsHeaders);return true}const list=Object.entries(store.conversations).filter(([,c])=>c.members.includes(a.user.id)).map(([key,c])=>{const otherId=c.members.find(x=>x!==a.user.id),other=store.users[otherId],last=c.messageIds.length?store.messages[c.messageIds[c.messageIds.length-1]]:null;return{key,user:other?publicUser(other,store,a.user.id):null,lastMessage:last?{body:last.body,createdAt:last.createdAt,senderId:last.senderId}:null}}).sort((x,y)=>Date.parse(y.lastMessage?.createdAt||0)-Date.parse(x.lastMessage?.createdAt||0));json(res,200,{conversations:list},corsHeaders);return true}

    if(route==='/api/pulse/messages'&&req.method==='POST'){const b=await bodyJson(req),text=clean(b.body,2000),handle=clean(b.handle,24).toLowerCase().replace(/^@/,'');if(!text){json(res,400,{error:'empty_message'},corsHeaders);return true}const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],targetId=store.handles[handle];if(!user)return{error:'unauthorized'};if(!targetId)return{error:'not_found'};if(targetId===user.id)return{error:'self_message'};if(blocked(store,user.id,targetId))return{error:'blocked'};const key=conversationKey(user.id,targetId),conv=store.conversations[key]||(store.conversations[key]={members:[user.id,targetId],messageIds:[],createdAt:now()}),mid=id('m_'),msg={id:mid,conversationKey:key,senderId:user.id,recipientId:targetId,body:text,createdAt:now(),readAt:null};store.messages[mid]=msg;conv.messageIds.push(mid);conv.messageIds=conv.messageIds.slice(-1000);notify(store,targetId,{actorId:user.id,type:'message',objectId:mid});return{message:msg}});json(res,out.error?(out.error==='unauthorized'?401:out.error==='not_found'?404:400):201,out,corsHeaders);return true}

    m=route.match(/^\/api\/pulse\/messages\/([a-z0-9_]{3,24})$/);
    if(m&&req.method==='GET'){const out=await mutateStore(store=>{const s=store.sessions[sha(bearer(req))],user=s&&store.users[s.userId],targetId=store.handles[m[1]];if(!user)return{error:'unauthorized'};if(!targetId)return{error:'not_found'};const key=conversationKey(user.id,targetId),conv=store.conversations[key],ids=conv?.messageIds||[],messages=ids.map(mid=>store.messages[mid]).filter(Boolean);messages.forEach(msg=>{if(msg.recipientId===user.id&&!msg.readAt)msg.readAt=now()});return{user:publicUser(store.users[targetId],store,user.id),messages}});json(res,out.error?(out.error==='unauthorized'?401:404):200,out,corsHeaders);return true}

    if(route==='/api/pulse/export'&&req.method==='GET'){const store=await readStore(),a=await auth(req,store);if(!a){json(res,401,{error:'unauthorized'},corsHeaders);return true}const uid=a.user.id,data={user:publicUser(a.user,store,uid),posts:Object.values(store.posts).filter(p=>p.authorId===uid),follows:store.follows[uid]||[],likes:Object.entries(store.likes).filter(([,ids])=>ids.includes(uid)).map(([pid])=>pid),bookmarks:store.bookmarks[uid]||[],circles:Object.values(store.circles).filter(c=>(store.circleMembers[c.id]||{})[uid]),notifications:store.notifications[uid]||[],messages:Object.values(store.messages).filter(msg=>msg.senderId===uid||msg.recipientId===uid)};json(res,200,{exportedAt:now(),data},corsHeaders);return true}

    json(res,404,{error:'not_found'},corsHeaders);return true
  }catch(e){
    // Do not expose database messages, credentials or internal stack traces.
    const publicErrors=new Set(['social_mysql_import_required','social_mysql_snapshot_invalid',
      'social_mysql_url_missing','social_mysql_url_invalid','rate_limited','body_too_large',
      'invalid_json','invalid_body']);
    const error=publicErrors.has(String(e?.message))?e.message:'social_native_backend_unavailable';
    console.warn('[SWAPP SOCIAL] Native handler error:',Number(e?.status)||500);
    json(res,publicErrors.has(error)?(Number(e?.status)||503):503,{error},corsHeaders);
    return true;
  }
}

// Startup schema initialization does not create an empty store: import approval is required.
if(useMysql)pool().catch(e=>console.error('[SWAPP SOCIAL] mysql init failed:',String(e?.code||'connection_failed')));
