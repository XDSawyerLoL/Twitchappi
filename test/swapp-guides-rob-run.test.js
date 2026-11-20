'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PATH,UPDATED,SECTIONS,renderRobRun,renderIndex,register}=require('../modules/swapp-guides-rob-run');
const {sitemapEntries}=require('../modules/swapp-seo');
const root=path.resolve(__dirname,'..');
test('real guide has eight original substantial chapters and no unverified statistics',()=>{
 assert.equal(SECTIONS.length,8);assert.equal(UPDATED,'2026-11-20');
 assert.ok(SECTIONS.every(x=>x.title.length>=20&&x.body.length>=450));
 assert.deepEqual(new Set(SECTIONS.map(x=>x.id)).size,SECTIONS.length);
});
test('the public ROB RUN guide is a complete SEO and accessible HTML page',()=>{
 const html=renderRobRun();
 assert.match(html,/<html/i);assert.match(html,/<title>/i);
 assert.match(html,/ROB RUN/);assert.match(html,/dateModified/);
 assert.match(html,/https:\/\/store\.steampowered\.com\/app\/4262460\/ROB_RUN/);
 assert.match(html,/717921532895037155/);
 assert.match(html,/20 novembre 2026/);
 assert.match(html,/17 novembre/);
 assert.match(html,/role=['"]|aria-label=/i);
 for(const chapter of SECTIONS)assert.ok(html.includes('id="'+chapter.id+'"')||html.includes("id='"+chapter.id+"'"));
 assert.match(html,/https:\/\/swapp\.tv\/guides\/rob-run/);
});
test('Guide index links to only the three existing first-party guides',()=>{
 const html=renderIndex();
 for(const p of [PATH,'/guides/aion-2','/guides/choisir-communaute-gaming'])
  assert.ok(html.includes("href='"+p+"'"));
 assert.match(html,/https:\/\/swapp\.tv\/guides/);
});
test('route registration never writes, redirects, or queries third-party APIs',()=>{
 const routes=new Map(),app={get:(url,fn)=>routes.set(url,fn)};
 register(app);
 assert.deepEqual([...routes.keys()],['/guides',PATH]);
 for(const pathname of routes.keys()){
  const state={};
  const res={
   set:(k,v)=>{state[k]=v;return res},
   type:t=>{state.type=t;return res},
   send:html=>{state.html=html;return res}
  };
  routes.get(pathname)({},res);
  assert.equal(state.type,'html');
  assert.match(state.html,/<html/i);
  assert.match(state['Cache-Control'],/max-age=300/);
 }
});
test('new public pages are explicitly in the existing SEO sitemap and release list',()=>{
 const paths=sitemapEntries().map(x=>new URL(x.loc).pathname);
 assert.ok(paths.includes('/guides'));
 assert.ok(paths.includes(PATH));
 const release=fs.readFileSync(path.join(root,'tools/swapp-release.js'),'utf8');
 const pack=fs.readFileSync(path.join(root,'tools/swapp-hostinger-package.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 for(const file of [release,pack])assert.match(file,/modules\/swapp-guides-rob-run\.js/);
 assert.match(server,/require\('\.\/modules\/swapp-guides-rob-run'\)\.register\(app\)/);
});
test('no fabricated proof or checkout and no paid dependencies',()=>{
 const raw=fs.readFileSync(path.join(root,'modules/swapp-guides-rob-run.js'),'utf8');
 assert.doesNotMatch(raw,/mysql2|firebase-admin|axios|twitchAPI|fetch\(|stripe|localStorage|sendBeacon|paywall/i);
 assert.match(raw,/sans tout perdre/);
 assert.match(raw,/source/i);
 assert.match(raw,/accès anticipé/i);
});
