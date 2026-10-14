'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {archiveUrlKey,getPublicArchives}=require('../modules/swapp-news/archive');
const {isLegacyJustPlayerUrl}=require('../modules/swapp-news/article-core');
const {renderNewsHome}=require('../modules/swapp-news/native-pages');
const old={type:'post',url:'https://justplayer.fr/supporters/posts/266628',title:'007 First Light : James Bond réussit son retour',publishedAt:'2026-09-05'};
const fresh={type:'post',url:'https://justplayer.fr/supporters/posts/planet-zoo-2-est-disponible-aquariums-volieres-et-reserves-naturelles',title:'Planet Zoo 2 est disponible : aquariums, volières et réserves naturelles',publishedAt:'2026-10-13'};
test('accepte les nouveaux permaliens avec slug Fourthwall',()=>{
  assert.ok(isLegacyJustPlayerUrl(fresh.url));
  assert.ok(isLegacyJustPlayerUrl(old.url));
  assert.equal(isLegacyJustPlayerUrl('https://evil.example/supporters/posts/266628'),false);
});
test('rejette les liens externes et chemins de traversée',()=>{
  assert.equal(archiveUrlKey('https://justplayer.fr.evil.example/supporters/posts/abc'),null);
  assert.equal(archiveUrlKey('https://justplayer.fr/supporters/posts/abc/../../admin'),null);
  assert.equal(archiveUrlKey('https://justplayer.fr/supporters/video_embeds/planete','video_embed'),'/supporters/video_embeds/planete');
});
test('trie les archives et supprime les doublons de permalink ou de titre',()=>{
  const a=getPublicArchives({items:[old,old,fresh]},[]);
  assert.equal(a.length,2);assert.equal(a[0].title,fresh.title);
  assert.equal(getPublicArchives({items:[old,fresh]},[{title:fresh.title,legacyUrl:fresh.url}]).length,1);
});
test('le média public ne simule pas la migration des archives',()=>{
  const html=renderNewsHome([]);
  assert.doesNotMatch(html,/Archives JustPlayer|Lire sur JustPlayer|supporters\/posts/);
  assert.match(html,/ACTUS/);
  assert.match(html,/en-direct/);
});
test('le catalogue connu comporte les nouveaux articles et un média sans doublons',()=>{
  const catalog=require('../data/justplayer-public-catalog.json');
  const entries=getPublicArchives(catalog);
  assert.equal(entries.length,15);
  assert.ok(entries.some(x=>x.url.includes('/posts/valor-mortis-est-sorti-')));
  assert.ok(entries.some(x=>x.url.includes('/posts/planet-zoo-2-est-disponible-')));
  assert.ok(entries.some(x=>x.type==='video_embed'));
});
