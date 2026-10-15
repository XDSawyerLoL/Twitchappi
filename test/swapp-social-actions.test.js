'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSocialRouter,ORIGIN}=require('../modules/swapp-social-actions');
function mockRouter(){
 const routes=[],middleware=[];
 return {routes,middleware,use(fn){middleware.push(fn)},post(path,fn){routes.push({method:'POST',path,fn})},get(path,fn){routes.push({method:'GET',path,fn})}};
}
function response(){
 return {statusCode:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this},
  status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
}
test('safe SOCIAL endpoint is mounted under SWAPP and does not merge accounts',()=>{
 const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
 assert.match(server,/app\.use\('\/api\/swapp\/social',authLimiter,createSocialRouter/);
 assert.match(server,/app\.get\('\/communaute'/);
 assert.match(server,/app\.get\('\/bandes-annonces'/);
 assert.match(server,/app\.get\('\/boutique'/);
});
test('explicit SOCIAL login goes to the fixed origin without SWAPP cookies',async()=>{
 const router=mockRouter();let upstream;
 createSocialRouter({express:{Router:()=>router},fetchImpl:async(url,options,timeout)=>{
  upstream={url,options,timeout};return {ok:true,json:async()=>({token:'a'.repeat(42),user:{handle:'jojo'}})};
 },isProd:true});
 const handler=router.routes.find(x=>x.path==='/login').fn;
 const res=response();
 await handler({body:{handle:'JoJo',password:'super-long-password'},headers:{origin:'https://swapp.tv'}},res);
 assert.equal(res.statusCode,200);
 assert.equal(upstream.url,ORIGIN+'/api/pulse/auth/login');
 assert.deepEqual(JSON.parse(upstream.options.body),{handle:'jojo',password:'super-long-password'});
 assert.deepEqual(Object.keys(upstream.options.headers),['Accept','Content-Type']);
 assert.equal(upstream.options.redirect,'error');
});
test('SOCIAL posting requires its own bearer and rejects excessive messages',async()=>{
 const router=mockRouter();
 createSocialRouter({express:{Router:()=>router},fetchImpl:async()=>{
  throw Error('should not contact upstream on invalid posts');
 }});
 const handler=router.routes.find(x=>x.path==='/post').fn;
 let res=response();await handler({body:{body:'Bonjour'},headers:{}},res);
 assert.equal(res.statusCode,401);
 res=response();await handler({body:{body:'x'.repeat(421)},headers:{authorization:'Bearer '+ 'a'.repeat(44)}},res);
 assert.equal(res.statusCode,400);
});
test('SOCIAL rejects cross-origin mutation requests',()=>{
 const router=mockRouter();
 createSocialRouter({express:{Router:()=>router},fetchImpl:async()=>({}) ,isProd:true});
 const middleware=router.middleware[0],res=response();let next=false;
 middleware({method:'POST',headers:{origin:'https://untrusted.example'}},res,()=>{next=true});
 assert.equal(res.statusCode,403);assert.equal(next,false);
});
