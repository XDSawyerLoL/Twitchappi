'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalizeChannelTheme}=require('../modules/swapp-channel-theme');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-channel-atmosphere.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../assets/swapp-channel-atmosphere.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const bg='/api/oryon/panel-image/vnhz/'+('a'.repeat(64));
test('Owner background, preset, cropping, opacity, blur and accent are normalized',()=>{
 const theme=normalizeChannelTheme({
  background_url:bg,background_preset:'nebula',background_opacity:99,
  background_x:-5,background_y:70,background_blur:8,accent:'#AABBCC',
  background_fit:'contain'
 },'vnhz');
 assert.equal(theme.background_url,bg);
 assert.equal(theme.background_preset,'nebula');
 assert.equal(theme.background_opacity,70);
 assert.equal(theme.background_x,0);
 assert.equal(theme.background_y,70);
 assert.equal(theme.background_blur,8);
 assert.equal(theme.accent,'#aabbcc');
 assert.equal(theme.background_fit,'contain');
});
test('Images cannot be borrowed from another creator or foreign sites',()=>{
 for(const url of ['https://example.com/steal.jpg','javascript:alert(1)',
  '/api/oryon/panel-image/other/'+('a'.repeat(64)),
  '/api/oryon/panel-image/vnhz/abc'])
  assert.throws(()=>normalizeChannelTheme({background_url:url},'vnhz'));
 const clean=normalizeChannelTheme({},'vnhz');
 assert.equal(clean.background_url,'');
 assert.equal(clean.accent,'');
 assert.equal(clean.background_preset,'none');
});
test('Public profile and MySQL-backed image publication are wired to existing account identity',()=>{
 assert.match(server,/channel_theme:normalizeChannelTheme\(u\.channel_theme,u\.login\)/);
 assert.match(server,/if\(supplied\('channel_theme'\)\)/);
 assert.match(server,/swappMysqlAccounts\.savePanelImage\(user\.id,String\(themeBody\.background_image_data\)\)/);
 assert.match(server,/user\.channel_theme\?\.background_url!==url/);
 assert.match(server,/const cur = req\.session\?\.oryonUser/);
 assert.match(server,/const persistResult = await writeOryonUsersAndWait\(data\)/);
});
test('Editor supports real upload, durable public read-back and non-destructive preview',()=>{
 new Function(script);
 assert.match(script,/api\/oryon\/profile/);
 assert.match(script,/const verified=await getPublic\(active\)/);
 assert.match(script,/background_image_data=await compress\(selectedFile\)/);
 assert.match(script,/URL\.revokeObjectURL/);
 assert.match(script,/background_preset/);
 assert.match(script,/\.swapp-showcase-owner-menu \.swapp-showcase-menu-content/);
 assert.match(script,/manager\?\.classList\.contains\('active'\)/);
 assert.match(script,/fields\[4\]\.field\.dataset\.changed==='1'/);
});
test('Smaller live header and backdrop do not resize video/chat',()=>{
 assert.match(styles,/data-channel-live="true"\] \.channelTopHero/);
 assert.match(styles,/height:190px!important/);
 assert.match(styles,/background_opacity|--swapp-background-opacity/);
 assert.match(styles,/data-swapp-has-background="true"/);
 assert.doesNotMatch(styles,/\.chatPanel\s*\{[^}]*height:/);
 assert.doesNotMatch(styles,/\.channelMainPlayer\s*\{[^}]*height:/);
 assert.ok(html.indexOf('swapp-channel-atmosphere.css')>html.indexOf('swapp-chat-social-glass.css'));
 assert.equal(html.split('swapp-channel-atmosphere.js?v=').length-1,1);
});
