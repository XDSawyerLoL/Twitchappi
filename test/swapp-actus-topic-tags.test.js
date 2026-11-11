'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const client=read('assets/swapp-actus-app.js');
const start=client.indexOf('const SWAPP_TOPICS=');
const finish=client.indexOf(' // One consistent identity rule',start);
assert.ok(start>0&&finish>start,'topic taxonomy must exist within the existing /actus client');
const createTopics=search=>new Function('window','URLSearchParams',client.slice(start,finish)+'\nreturn {SWAPP_TOPICS,topicCode,articleTopics,hasTopic,queryTopic};')({location:{search}},URLSearchParams);

test('one Actualité page has four optional topic tags and a transverse all feed',()=>{
 const t=createTopics('');
 assert.deepEqual(t.SWAPP_TOPICS.map(x=>x.id),['','GAMING','AI','ROBOTICS','FUTURE']);
 assert.equal(t.hasTopic({tags:['AI']},''),true);
 assert.equal(t.hasTopic({tags:['AI']},'AI'),true);
 assert.equal(t.hasTopic({tags:['AI']},'ROBOTICS'),false);
});
test('tag synonyms normalize correctly, including accents and multiple tags',()=>{
 const t=createTopics('?tag=AI');
 assert.equal(t.queryTopic(),'AI');
 assert.equal(t.topicCode('Intelligence artificielle'),'AI');
 assert.equal(t.topicCode('IA'),'AI');
 assert.equal(t.topicCode('Robotique'),'ROBOTICS');
 assert.equal(t.topicCode('Robots et automatisation'),'ROBOTICS');
 assert.equal(t.topicCode('Technologies émergentes'),'FUTURE');
 assert.deepEqual(t.articleTopics({tags:['Robotique','FUTURE']}),['ROBOTICS','FUTURE']);
 assert.equal(t.hasTopic({category:'AI'},'AI'),true);
});
test('legacy gaming articles remain visible without changing their underlying category',()=>{
 const t=createTopics('?tag=GAMING');
 assert.deepEqual(t.articleTopics({category:'Actualités',tags:['Fable','Xbox']}),['GAMING']);
 assert.equal(t.hasTopic({category:'Actualités',tags:['Fable']},'GAMING'),true);
 assert.equal(t.hasTopic({category:'Actualités',tags:['Fable']},'AI'),false);
 assert.equal(t.hasTopic({tags:['AI','GAMING']},'GAMING'),true);
});
test('old standalone media paths redirect to Actus tags before streamer catchall',()=>{
 const source=read('server.js');
 const alias=source.indexOf("app.get(['/tech','/technologies','/gaming'");
 const streamer=source.indexOf("app.get(/^\\/([a-zA-Z0-9_][a-zA-Z0-9_-]{1,39})$/");
 assert.ok(alias>0&&streamer>alias);
 assert.match(source,/res\.redirect\(302,'\/actus'/);
 assert.doesNotMatch(source,/renderTechWatch|readTechItems/);
});
test('the shared main navigation has no redundant Média tab and the Studio uses tags',()=>{
 const navigation=read('assets/swapp-navigation.js');
 const studio=read('modules/swapp-news/editor-ui.js');
 assert.doesNotMatch(navigation,/id:'media'|function mediaNav/);
 assert.match(navigation,/\/actus\?tag=AI/);
 assert.match(navigation,/\/actus\?tag=ROBOTICS/);
 assert.match(studio,/Tags \/ rubriques/);
 assert.match(studio,/id="tags"/);
 const html=read('index.html');
 assert.match(html,/swapp-actus-app\.js\?v=20261111-topic-tags-v1/);
});
test('Fable is a gaming-tagged existing editorial release, not a new page',()=>{
 const manifest=JSON.parse(read('data/swapp-editorial-releases.json'));
 const file='swapp-veille-native-20261111-fable-2027-dossier.json';
 assert.ok(manifest.releases.includes(file));
 const release=JSON.parse(read('data/'+file));
 assert.ok(release.articles[0].tags.includes('GAMING'));
 assert.match(release.articles[0].trailerUrl,/^https:\/\/www\.youtube\.com\/watch\?v=/);
});
