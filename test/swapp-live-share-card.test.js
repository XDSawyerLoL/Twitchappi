'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {cardContext,cardMarkup,renderShareCard}=require('../modules/swapp-share-cards');
const {injectCreatorMetadata}=require('../modules/swapp-seo');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const creator={
 login:'vnhz',display_name:'vnhz',bio:'Un univers pirate gaming.',
 banner_url:'data:image/jpeg;base64,',avatar_url:'data:image/jpeg;base64,',
 channel_public:true
};

test('live embed uses actual stream title, branded large image, and status',()=>{
 const live=cardContext(creator,{active:true,title:'Découverte de Aion 2',category:'Aion 2',startedAt:123});
 const rendered=injectCreatorMetadata(html,creator,'vnhz',live);
 assert.match(rendered,/property="og:title" content="vnhz est en direct sur SWAPP"/);
 assert.match(rendered,/Découverte de Aion 2/);
 assert.match(rendered,/property="og:description"/);
 assert.match(rendered,/property="og:image:width" content="1200"/);
 assert.match(rendered,/property="og:image:height" content="630"/);
 assert.match(rendered,/property="og:image:type" content="image\/jpeg"/);
 assert.match(rendered,/property="og:locale" content="fr_FR"/);
 assert.match(rendered,/twitter:card" content="summary_large_image"/);
 assert.match(rendered,/share-card\/vnhz\.jpg\?v=/);
 assert.equal((rendered.match(/property="og:image" /g)||[]).length,1);
 assert.equal((rendered.match(/rel="canonical"/g)||[]).length,1);
});
test('offline share no longer falsely promotes a stopped live',()=>{
 const offline=cardContext(creator,{active:false,title:'Live de vnhz'});
 const rendered=injectCreatorMetadata(html,creator,'vnhz',offline);
 assert.equal(offline.isLive,false);
 assert.doesNotMatch(offline.title,/direct/i);
 assert.match(rendered,/vnhz · SWAPP/);
 assert.doesNotMatch(rendered,/<meta property="og:title" content="[^"]*direct/i);
 assert.match(cardMarkup(offline),/CHAÎNE SWAPP/);
 assert.doesNotMatch(cardMarkup(offline),/>EN DIRECT</);
});
test('share URL revision changes with stream start, new title, and image',()=>{
 const a=cardContext(creator,{active:false}),b=cardContext(creator,{active:true,title:'Live',startedAt:1});
 const c=cardContext(creator,{active:true,title:'Live B',startedAt:1});
 const d=cardContext({...creator,banner_url:'data:image/jpeg;base64,xxxxx'},{active:true,title:'Live',startedAt:1});
 assert.notEqual(a.revision,b.revision);
 assert.notEqual(b.revision,c.revision);
 assert.notEqual(b.revision,d.revision);
 assert.match(b.image,/^https:\/\/swapp\.tv\/share-card\/vnhz\.jpg\?v=[a-f0-9]{16}$/);
});
test('untrusted channel names are escaped in Open Graph and image markup',()=>{
 const unsafe={...creator,display_name:'<script> & \"attaque\"'};
 const card=cardContext(unsafe,{active:true,title:'Jeu <script> & co'});
 const rendered=injectCreatorMetadata(html,unsafe,'vnhz',card);
 const svg=cardMarkup(card,{hasAvatar:true});
 assert.doesNotMatch(svg,/<script>/);
 assert.doesNotMatch(rendered,/<meta property="og:title" content="[^"]*<script>/);
 assert.match(svg,/&lt;script&gt;/);
 assert.doesNotMatch(svg,/https?:\/\/(?!www\.w3\.org)/);
});
test('composed image is 1200 x 630 pixels and valid JPEG, including owner avatar',async()=>{
 const sharp=require('sharp');
 const banner=await sharp({create:{width:1600,height:900,channels:3,background:'#d9ac62'}}).jpeg().toBuffer();
 const avatar=await sharp({create:{width:512,height:512,channels:3,background:'#36cdea'}}).png().toBuffer();
 const images={...creator,banner_url:'data:image/jpeg;base64,'+banner.toString('base64'),
  avatar_url:'data:image/png;base64,'+avatar.toString('base64')};
 const out=await renderShareCard(images,cardContext(images,{active:true,title:'Direct du soir',startedAt:42}));
 const meta=await sharp(out).metadata();
 assert.equal(meta.format,'jpeg');
 assert.equal(meta.width,1200);assert.equal(meta.height,630);
 assert.ok(out.length>10000&&out.length<3500000);
});
test('server route is public but only looks up public creators',()=>{
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(server,/app\.get\('\/share-card\/:login\.jpg'/);
 assert.match(server,/creator\.channel_public===false/);
 assert.match(server,/swappPublicShareContext\(creator\)/);
 assert.match(server,/res\.type\('image\/jpeg'\)/);
 assert.match(server,/Cache-Control','public, max-age=300/);
 assert.match(server,/app\.get\('\/api\/oryon\/share-context\/:login'/);
 assert.match(server,/info\.url\+\(info\.isLive\?'\?live='/);
 const client=fs.readFileSync(path.join(__dirname,'..','index_script.js'),'utf8');
 assert.match(client,/window\.swappShareChannel=async function swappShareChannel/);
 assert.match(client,/data\.share_url/);
 assert.match(client,/navigator\.clipboard\.writeText\(url\)/);
});
