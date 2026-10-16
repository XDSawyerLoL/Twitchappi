'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicGamePaths}=require('../tools/swapp-deploy-smoke');

test('production game hub verification only visits actual sitemap URLs, once each',()=>{
 const xml='<urlset>'+
  '<url><loc>https://swapp.tv/jeux/grand-theft-auto-vi</loc></url>'+
  '<url><loc>https://swapp.tv/jeux/grand-theft-auto-vi</loc></url>'+
  '<url><loc>https://swapp.tv/jeux/elden-ring</loc></url>'+
  '<url><loc>https://swapp.tv/jeux/hades-ii</loc></url>'+
  '</urlset>';
 assert.deepEqual(publicGamePaths(xml),['/jeux/grand-theft-auto-vi','/jeux/elden-ring']);
});

test('game hub smoke check rejects domains, off-site links and unsafe paths',()=>{
 const xml='<urlset>'+
  '<loc>https://evil.example/jeux/fortnite</loc>'+
  '<loc>https://swapp.tv/jeux/../../admin</loc>'+
  '<loc>https://swapp.tv/jeux/valid?preview=1</loc>'+
  '<loc>https://swapp.tv/jeux/valid%2Fsecret</loc>'+
  '<loc>https://swapp.tv/jeux/fortnite</loc>'+
  '</urlset>';
 assert.deepEqual(publicGamePaths(xml),['/jeux/fortnite']);
 assert.deepEqual(publicGamePaths(null),[]);
});
