'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {probe,classify}=require('../tools/swapp-autonomy-healthcheck');
test('classifies blocked endpoints without claiming outage or empty data',()=>{
  assert.equal(classify(403),'restricted');
  assert.equal(classify(429),'restricted');
  assert.equal(classify(404),'missing');
  assert.equal(classify(503),'unavailable');
});
test('checks endpoints read-only and reports failure',async()=>{
  const calls=[];
  const result=await probe({baseUrl:'https://swapp.tv',endpoints:[{name:'news',path:'/api/actus'},{name:'guides',path:'/guides'}],fetchImpl:async(url,options)=>{
    calls.push({url:String(url),method:options.method});
    return {status:calls.length===1?200:403};
  }});
  assert.equal(result.healthy,false);
  assert.deepEqual(result.results.map(x=>x.state),['ok','restricted']);
  assert.ok(calls.every(x=>x.method==='GET'));
});
test('rejects non-path targets',async()=>{
  await assert.rejects(()=>probe({endpoints:[{name:'bad',path:'https://other.site/'}],fetchImpl:async()=>({status:200})}),/Invalid endpoint/);
});

test('redirect is not accepted as a healthy response',async()=>{
  const result=await probe({endpoints:[{name:'news',path:'/api/actus'}],fetchImpl:async()=>({status:302})});
  assert.equal(result.healthy,false);
  assert.equal(result.results[0].state,'redirect');
});
test('rejects unsafe origins and too many targets',async()=>{
  await assert.rejects(()=>probe({baseUrl:'https://user:pass@swapp.tv/'}),/Invalid origin/);
  await assert.rejects(()=>probe({endpoints:Array.from({length:13},(_,i)=>({name:String(i),path:'/api/actus'}))}),/Invalid endpoint count/);
});
