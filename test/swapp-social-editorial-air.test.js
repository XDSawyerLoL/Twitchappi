'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('assets/swapp-social-editorial-air.css');

test('SOCIAL editorial sheet is loaded once, after the current timeline layer',()=>{
 const hub=read('modules/swapp-hubs.js');
 const tail=hub.slice(hub.indexOf('function community('));
 const previous=tail.indexOf('/assets/swapp-social-timeline.css?v=');
 const newSheet=tail.indexOf('/assets/swapp-social-editorial-air.css?v=20261022-large-tools-v1');
 assert.ok(previous>=0,'keep the current timeline');
 assert.ok(newSheet>previous,'new unboxed styles must win the CSS cascade');
 assert.equal(tail.split('swapp-social-editorial-air.css?v=').length-1,1);
 assert.doesNotMatch(read('modules/swapp-news/site-shell.js'),/swapp-social-editorial-air.css/);
});

test('the feed is a surface of separated rows rather than cards within cards',()=>{
 assert.match(css,/#swappSocialNative \.pulse-post\{/);
 assert.match(css,/border-bottom:1px solid var\(--social-air-line\)!important/);
 assert.match(css,/#swappSocialNative \.pulse-post \.pulse-rich-card\{/);
 assert.match(css,/#swappSocialNative \.pulse-post-relayed \.pulse-rich-link-preview\{/);
 assert.match(css,/grid-template-columns:130px minmax\(0,1fr\)!important/);
 assert.match(css,/#swappSocialNative \.pulse-quoted-original\{/);
 assert.match(css,/border-left:2px solid color-mix/);
 assert.match(css,/#swappSocialNative \.pulse-media-preview\{/);
});

test('structural shapes vary by meaning: circular avatars, organic media, pill actions',()=>{
 assert.match(css,/#swappSocialNative \.pulse-avatar\{/);
 assert.match(css,/border-radius:50%!important/);
 assert.match(css,/border-radius:14px 5px 14px 5px!important/);
 assert.match(css,/#swappSocialNative \.pulse-news-actions :is\(button,a\)\{/);
 assert.match(css,/#swappSocialNative \.pulse-publish,/);
 assert.match(css,/#swappSocialNative \.pulse-emoji-grid \.pulse-emoji-choice\{/);
 assert.match(css,/#swappSocialNative \.pulse-message\.mine\{/);
});
test('all primary SOCIAL views stay accessible, visible and usable',()=>{
 const markup=read('assets/swapp-social-native/social-body.html');
 const script=read('assets/swapp-social-native/app.js');
 for(const name of ['home','rooms','messages','notifications','profile']){
  assert.match(markup,new RegExp('data-view="'+name+'"'));
 }
 for(const word of ['pulse-news-card','pulse-post','pulse-composer','pulse-message-form','pulse-profile-hero','pulse-right']){
  assert.match(css,new RegExp('\\.'+word+'\\b'));
 }
 assert.match(markup,/data-emoji-toggle/);
 assert.match(script,/deleteOwnPost\(postId,action\)/);
 assert.doesNotMatch(css,/\.pulse-post\s*\{[^}]*display:none/);
 assert.doesNotMatch(css,/\.pulse-feed\s*\{[^}]*display:none/);
 assert.match(css,/\.pulse-welcome:not\(\[hidden\]\)/);
});

test('the final pass is scoped to SOCIAL and responsive on phone',()=>{
 const raw=css.replace(/\/\*[\s\S]*?\*\//g,'');
 let depth=0;
 for(const c of raw){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0)}
 assert.equal(depth,0);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/@media\(max-width:920px\) and \(orientation:portrait\),\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/--social-air-accent:var\(--swapp-page-accent/);
 assert.doesNotMatch(css,/url\(https?:\/\/|@import/);
 assert.doesNotMatch(css,/html\s*\{|body\s*\{/, 'do not style unrelated SWAPP pages');
});

test('production fingerprints and deployment smoke include the redesign',()=>{
 const release=read('tools/swapp-release.js');
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(release,/'assets\/swapp-social-editorial-air\.css'/);
 assert.match(smoke,/swapp-social-editorial-air\.css\?v=20261022-airy-social-v1/);
 assert.match(smoke,/SOCIAL still serves the boxed layout/);
});
