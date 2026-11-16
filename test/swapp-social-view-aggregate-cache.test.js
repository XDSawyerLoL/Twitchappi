'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/swapp-social-native/pulse.mjs'),'utf8');
const start=source.indexOf('const VIEW_METRICS=new WeakMap();');
const end=source.indexOf('function cleanupSessions(store)',start);
test('SOCIAL computes follower/reply counts just once per parsed snapshot',()=>{
 assert.ok(start>0&&end>start,'metrics present');
 const base=source.slice(start,end);
 const store={users:{u_a:{id:'u_a',handle:'a',displayName:'A',createdAt:'2026-11-16T10:00:00Z'}},
  follows:{u_first:['u_a'],u_second:['u_a','u_a'],u_third:['u_a']},
  posts:{p_1:{id:'p_1',authorId:'u_a',body:'Post',createdAt:'2026-11-16T10:00:00Z'},
   p_2:{id:'p_2',authorId:'u_a',replyToId:'p_1',body:'Reply',createdAt:'2026-11-16T10:01:00Z'},
   p_3:{id:'p_3',authorId:'u_a',replyToId:'p_1',deletedAt:'2026-11-16T10:02:00Z'}},
  likes:{},reposts:{},bookmarks:{}};
 const counter={follows:0,posts:0},spy={values(v){
  if(v===store.follows)counter.follows++;
  if(v===store.posts)counter.posts++;
  return Object.values(v);
 }};
 const {postView}=new Function('Object',base+';return {postView};')(spy);
 let view;
 for(let i=0;i<50;i++)view=postView(store.posts.p_1,store,'');
 assert.equal(view.counts.replies,1);
 assert.equal(view.author.followers,3,'duplicate follows must not count twice');
 assert.deepEqual(counter,{follows:1,posts:1},'50 cards must not trigger 50 full SOCIAL scans');
});
test('fresh SOCIAL snapshots re-compute aggregates and never reuse previous state',()=>{
 const block=source.slice(start,end);
 const {postView}=new Function(block+';return {postView};')();
 const store={users:{u_a:{id:'u_a',handle:'a',displayName:'A'}},
  follows:{u_first:['u_a']},posts:{p_1:{id:'p_1',authorId:'u_a',body:'Post'}},
  likes:{},reposts:{},bookmarks:{}};
 assert.equal(postView(store.posts.p_1,store,'').author.followers,1);
 const refreshed={...store,follows:{u_first:['u_a'],u_other:['u_a']}};
 assert.equal(postView(refreshed.posts.p_1,refreshed,'').author.followers,2);
});
