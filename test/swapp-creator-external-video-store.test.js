'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCreatorVideoStore}=require('../modules/swapp-creator-external-video-store');
const video='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function fixture(failInsert=false){
 const state={rows:[],commits:0,rollbacks:0};
 let pending=[];
 const conn={
  async beginTransaction(){pending=state.rows.map(x=>({...x}))},
  async execute(sql,args){
   if(sql.startsWith('DELETE')){pending=[];return [{}]}
   if(sql.startsWith('INSERT')){
    if(failInsert)throw Error('mysql_write_failed');
    pending.push({provider:args[2],id:args[3],url:args[4],title:args[5],position:args[1],pinned:args[6]});
   }return [{}];
  },
  async commit(){state.rows=pending;state.commits++},
  async rollback(){state.rollbacks++},
  release(){}
 };
 const pool={
  async query(){return [{}]},
  async execute(_sql,args){return [state.rows.filter(x=>args[0]==='alice')]},
  async getConnection(){return conn}
 };
 const store=createCreatorVideoStore({uri:'mysql://test:pass@localhost/swapp',mysqlFactory:{createPool:()=>pool}});
 return {store,state};
}
test('store commits canonical video metadata atomically',async()=>{
 const {store,state}=fixture();
 const result=await store.replace('alice',[{url:video,title:'Demo',pinned:true}]);
 assert.equal(result.length,1);
 assert.equal(state.commits,1);
 assert.equal(state.rows[0].id,'dQw4w9WgXcQ');
 assert.equal((await store.list('alice'))[0].pinned,true);
});
test('failed database writes rollback and do not commit',async()=>{
 const {store,state}=fixture(true);
 await assert.rejects(store.replace('alice',[{url:video}]),/mysql_write_failed/);
 assert.equal(state.rollbacks,1);assert.equal(state.commits,0);
});
test('rejects oversized and duplicate collections before writes',async()=>{
 const {store,state}=fixture();
 await assert.rejects(store.replace('alice',Array(6).fill({url:video})),/Maximum/);
 await assert.rejects(store.replace('alice',[{url:video},{url:video}]),/déjà/);
 assert.equal(state.commits,0);
});
