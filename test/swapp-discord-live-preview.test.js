'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {injectCreatorMetadata}=require('../modules/swapp-seo');
const base='<html><head><title>SWAPP</title><meta name="description" content="Défaut"><link rel="canonical" href="https://swapp.tv/"></head><body>Chaîne</body></html>';
const creator={login:'vnhz',display_name:'vnhz',bio:'Gameplay et échanges gaming',channel_public:true,
 avatar_url:'https://images.example/vnhz.png',banner_url:'https://images.example/vnhz-banner.jpg'};
test('Discordbot sees EN DIRECT, large real game frame and WATCH button from server-rendered HTML',()=>{
 const posterUrl='https://swapp.tv/api/oryon/local-relay/vnhz/poster.jpg?v=782';
 const page=injectCreatorMetadata(base,creator,'vnhz',{live:true,posterUrl});
 assert.match(page,/og:title" content="🔴 EN DIRECT · vnhz sur SWAPP"/);
 assert.match(page,/name="twitter:card" content="summary_large_image"/);
 assert.ok(page.includes('<meta property="og:image" content="'+posterUrl+'">'));
 assert.match(page,/og:image:width" content="1200"/);
 assert.match(page,/og:image:height" content="630"/);
 assert.match(page,/id="discord:component-embed"/);
 const json=page.match(/<script id="discord:component-embed" type="application\/json">([^<]+)<\/script>/);
 assert.ok(json);
 const rich=JSON.parse(json[1]);
 assert.equal(rich.component.type,17);
 assert.ok(rich.component.components.some(x=>x.type===12&&x.items[0].media.url===posterUrl));
 assert.ok(rich.component.components.some(x=>x.type===1&&x.components.some(b=>b.label==='Regarder le direct'&&b.url==='https://swapp.tv/vnhz')));
 assert.equal((page.match(/<meta name="description"/g)||[]).length,1);
 assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
});
test('when offline, no false red LIVE and legitimate creator banner can be the large image',()=>{
 const page=injectCreatorMetadata(base,creator,'vnhz',{live:false});
 assert.doesNotMatch(page,/EN DIRECT/);
 assert.doesNotMatch(page,/discord:component-embed/);
 assert.match(page,/twitter:card" content="summary_large_image"/);
 assert.match(page,/og:image" content="https:\/\/images\.example\/vnhz-banner\.jpg"/);
 assert.doesNotMatch(page,/poster\.jpg/);
});
test('private profiles never leak status, rich preview or image into Discord',()=>{
 const page=injectCreatorMetadata(base,{...creator,channel_public:false},'vnhz',{live:true,posterUrl:'https://swapp.tv/poster.jpg'});
 assert.match(page,/noindex,follow/);
 assert.doesNotMatch(page,/EN DIRECT/);
 assert.doesNotMatch(page,/poster\.jpg/);
});
test('user-supplied characters in creator name are escaped in JSON and Open Graph',()=>{
 const page=injectCreatorMetadata(base,{...creator,display_name:'<video> & moi'},'vnhz',{live:true});
 assert.ok(!page.includes('<video>'));
 assert.match(page,/&lt;video&gt; &amp; moi/);
 assert.doesNotMatch(page,/<script id="discord:component-embed"[^>]*>\s*.*<video>/);
});
