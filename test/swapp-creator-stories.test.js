'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeStory,StoryInputError,MAX_STORIES}=require('../lib/swapp-creator-stories');
const {installCreatorStories}=require('../modules/swapp-creator-story-routes');
const YT='https://youtu.be/dQw4w9WgXcQ';
test('stories accept only supported video links and bound text',()=>{
 const s=normalizeStory({title:' Sortie du jeu ',caption:'A'.repeat(400),videoUrl:YT,theme:'ember'});
 assert.equal(s.title,'Sortie du jeu');assert.equal(s.caption.length,300);
 assert.equal(s.theme,'ember');assert.equal(s.videoUrl,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(normalizeStory({title:'Ma nouvelle',theme:'hidden'}).theme,'obsidian');
 assert.throws(()=>normalizeStory({title:'ab'}),StoryInputError);
 assert.throws(()=>normalizeStory({title:'Ma nouvelle',videoUrl:'https://evil.test/video'}),StoryInputError);
 assert.equal(MAX_STORIES,4);
});
function harness(){
 const routes={},data=new Map();let seq=0;
 const app={
  get(path,fn){routes['GET '+path]=fn},
  post(path,_limiter,fn){routes['POST '+path]=fn},
  delete(path,_limiter,fn){routes['DELETE '+path]=fn}
 };
 installCreatorStories(app,{
  restoreSession:async()=>{},readUsers:()=>({users:[
   {id:'u1',login:'alice',channel_public:true},
   {id:'u2',login:'bob',channel_public:false}
  ]}),mutationLimiter:()=>{},
  storeFactory:()=>({
   list:async name=>data.get(name)||[],
   publish:async(name,story)=>{
    const prev=data.get(name)||[];
    if(prev.length===4)throw Error('story_limit_reached');
    const record={id:String(++seq).padStart(24,'0'),...story,
     createdAt:'2026-11-16T10:00:00Z',expiresAt:'2026-11-17T10:00:00Z'};
    data.set(name,[record,...prev]);return record;
   },
   remove:async(name,id)=>{
    const prev=data.get(name)||[],next=prev.filter(s=>s.id!==id);
    data.set(name,next);return next.length!==prev.length;
   }
  })
 });
 async function call(method,name,{user=null,origin='https://swapp.tv',story=null,storyId=''}={}){
  const route=method==='DELETE'?'/api/creator/stories/:login/:storyId':'/api/creator/stories/:login';
  const res={code:200,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(o){this.body=o;return this}};
  await routes[method+' '+route]({params:{login:name,storyId},body:story,
   session:{oryonUser:user?{id:user}:null},get:key=>key==='origin'?origin:''},res);
  return res;
 }
 return {call};
}
test('creator can create, display and delete stories through session-guarded routes',async()=>{
 const h=harness();
 const created=await h.call('POST','alice',{user:'u1',story:{title:'Nouvelle aventure',videoUrl:YT}});
 assert.equal(created.code,201);assert.equal(created.body.success,true);
 assert.equal((await h.call('GET','alice')).body.stories.length,1);
 assert.equal((await h.call('DELETE','alice',{user:'u1',storyId:created.body.story.id})).code,200);
 assert.equal((await h.call('GET','alice')).body.stories.length,0);
});
test('stories respect creator ownership, origin, privacy and active limit',async()=>{
 const h=harness();
 assert.equal((await h.call('POST','alice',{story:{title:'Nouvelle aventure'}})).code,401);
 assert.equal((await h.call('POST','alice',{user:'u2',story:{title:'Nouvelle aventure'}})).code,403);
 assert.equal((await h.call('POST','alice',{user:'u1',origin:'https://attacker.test',story:{title:'Nouvelle aventure'}})).code,403);
 assert.equal((await h.call('GET','bob')).code,404);
 assert.equal((await h.call('GET','bob',{user:'u2'})).code,200);
 for(let i=0;i<4;i++)assert.equal((await h.call('POST','alice',{user:'u1',story:{title:'Annonce '+i}})).code,201);
 assert.equal((await h.call('POST','alice',{user:'u1',story:{title:'Cinquieme annonce'}})).code,409);
});
test('MySQL story writes serialize the owner and enforce a 24-hour expiry',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const code=fs.readFileSync(path.join(__dirname,'../modules/swapp-creator-story-store.js'),'utf8');
 assert.match(code,/FOR UPDATE/);assert.match(code,/MAX_STORIES/);
 assert.match(code,/DATE_ADD\(UTC_TIMESTAMP\(3\),INTERVAL 1 DAY\)/);
 assert.match(code,/expires_at>UTC_TIMESTAMP\(3\)/);
 assert.match(code,/await conn\.rollback/);
});
