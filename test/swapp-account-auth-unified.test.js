'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const bundle=()=>fs.readFileSync(path.join(__dirname,'..','index_script.js'),'utf8');

function recoveryScript(){
 const code=bundle();
 const from=code.indexOf('(function swappPasswordRecoveryAndReadiness(){');
 const to=code.indexOf('/* =========================================================\n   SWAPP — password reset route fix v2',from);
 assert.ok(from>=0&&to>from,'password recovery renderer should remain discoverable');
 return code.slice(from,to);
}
function instance(resetToken=''){
 const listeners={};
 const panels=['login','register','forgot'].map(mode=>({
  dataset:{swappAuthPanel:mode},hidden:mode!=='login'
 }));
 const tabs=['login','register'].map(mode=>({
  dataset:{swappAuthSwitch:mode},attributes:{},tabIndex:mode==='login'?0:-1,
  setAttribute(key,value){this.attributes[key]=value},
  classList:{toggle(){}},
  focus(){}
 }));
 const root={
  dataset:{},__swappAuthModesBound:false,
  addEventListener(name,fn){listeners[name]=fn},
  contains:()=>true,
  querySelectorAll(selector){
   if(selector==='[data-swapp-auth-panel]')return panels;
   if(selector==='[data-swapp-auth-switch][role="tab"]'||selector==='[role="tab"]')return tabs;
   return [];
  },
  querySelector(selector){
   if(selector.includes('input:not([type="hidden"])'))return {focus(){}};
   return null;
  }
 };
 const doc={
  querySelector:selector=>selector==='[data-swapp-auth-root]'?root:null,
  getElementById:()=>null,
  addEventListener(){}
 };
 const win={};
 const build=new Function('window','document','location','authSettings','bindSettingsForms','loadFoundation','swappPasswordResetToken','swappPasswordResetLoginHint','toast','api',
  recoveryScript()+'\nreturn {authSettings,bindSettingsForms};');
 const out=build(win,doc,{search:''},()=>'',()=>{},()=>{},()=>resetToken,()=>'',()=>{},async()=>({success:true}));
 return {...out,root,panels,tabs,listeners};
}

test('guest authentication shows exactly one card with one initially visible form',()=>{
 const {authSettings}=instance();
 const html=authSettings();
 assert.equal((html.match(/class="swapp-auth-single authCard"/g)||[]).length,1);
 for(const id of ['loginForm','registerForm','forgotPasswordForm'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(html,/id="registerForm"[^>]+ hidden/);
 assert.match(html,/id="forgotPasswordForm"[^>]+ hidden/);
 assert.doesNotMatch(html,/authCenterGrid/);
 assert.match(html,/data-swapp-auth-switch="forgot"/);
 assert.match(html,/autocomplete="current-password"/);
 assert.match(html,/autocomplete="new-password"/);
});

test('login, create-account, and recovery switch modes without new cards or navigation',()=>{
 const auth=instance();
 auth.bindSettingsForms();
 assert.equal(typeof auth.listeners.click,'function');
 const trigger=mode=>auth.listeners.click({target:{closest:()=>({dataset:{swappAuthSwitch:mode}})}});
 trigger('register');
 assert.deepEqual(auth.panels.map(p=>p.hidden),[true,false,true]);
 assert.equal(auth.tabs[1].attributes['aria-selected'],'true');
 trigger('forgot');
 assert.deepEqual(auth.panels.map(p=>p.hidden),[true,true,false]);
 trigger('login');
 assert.deepEqual(auth.panels.map(p=>p.hidden),[false,true,true]);
 assert.equal(auth.tabs[0].attributes['aria-selected'],'true');
});

test('email password reset link still renders only the reset form',()=>{
 const html=instance('example-reset-token').authSettings();
 assert.equal((html.match(/<form /g)||[]).length,1);
 assert.match(html,/id="resetPasswordForm"/);
 assert.match(html,/value="example-reset-token"/);
 assert.doesNotMatch(html,/id="loginForm"|id="registerForm"|id="forgotPasswordForm"/);
});

test('auth module uses global SWAPP accent and hides inactive forms',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','assets/swapp-creator-workspace.css'),'utf8');
 assert.match(css,/#settings \.swapp-auth-single\.authCard/);
 assert.match(css,/#settings \.swapp-auth-form\[hidden\]\{display:none!important\}/);
 assert.match(css,/var\(--swapp-workspace-accent\)/);
 assert.match(css,/@media\(max-width:480px\)/);
});
