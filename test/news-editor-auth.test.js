'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeNewsEditorGuard}=require('../modules/swapp-news/editor-auth');
function check({session=false,key='',headers={},method='POST',isProduction=true}={}){
 const secret='c'.repeat(40);
 const gate=makeNewsEditorGuard({isSessionAdmin:()=>session,adminKey:secret,isProduction});
 const req={headers:{...headers,...(key?{'x-swapp-admin-key':key}:{})},method};
 const res={statusCode:200,payload:null,status(v){this.statusCode=v;return this},json(v){this.payload=v;return this}};
 let proceed=false;gate(req,res,()=>proceed=true);return {res,proceed};
}
test('un invité ne peut pas éditer',()=>{const x=check({headers:{'x-swapp-editor':'1'}});assert.equal(x.res.statusCode,403);assert.equal(x.proceed,false);});
test('la session admin nécessite un en-tête anti-CSRF sur les mutations',()=>{const x=check({session:true});assert.equal(x.res.statusCode,403);assert.equal(x.res.payload.error,'editor_csrf_header_required');});
test('le formulaire admin peut modifier avec le bon en-tête',()=>{const x=check({session:true,headers:{'x-swapp-editor':'1',origin:'https://www.swapp.tv'}});assert.equal(x.proceed,true);});
test('la clé admin est uniquement acceptée par en-tête et sans origine malveillante',()=>{
 assert.equal(check({key:'c'.repeat(40),headers:{'x-swapp-editor':'1'}}).proceed,true);
 assert.equal(check({key:'c'.repeat(40),headers:{'x-swapp-editor':'1',origin:'https://evil.example'}}).res.statusCode,403);
 assert.equal(check({key:'wrong',headers:{'x-swapp-editor':'1'}}).res.statusCode,403);
});
test('GET permet une lecture admin mais non une modification CSRF',()=>{assert.equal(check({session:true,method:'GET'}).proceed,true);});