'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseArgs,migratePublic}=require('../tools/justplayer-public-migrate');

const p={id:'266628',type:'post',url:'https://justplayer.fr/supporters/posts/266628',title:'007 First Light : James Bond réussit son retour',publishedAt:'2026-09-05'};
const v={id:'240253',type:'video_embed',url:'https://justplayer.fr/supporters/video_embeds/240253',title:'Vidéo',publishedAt:'2026-06-06'};
function fetchPublic(html){return async (url,init)=>{
  assert.equal(url,p.url);assert.equal(init.method,'GET');
  return {ok:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>html};
};}
const body=('<p>IO Interactive présente une nouvelle vision de James Bond avec espionnage et infiltrations.</p><p>De nombreux joueurs suivent les séquences d’action et les missions du jeu avec intérêt.</p>').repeat(5);
function page(){return `<html><head><meta property="og:title" content="007 First Light : James Bond réussit son retour" /><meta property="article:published_time" content="2026-09-05" /></head><article>${body}</article></html>`;}

test('analyse les paramètres et empêche un commit implicite',()=>{
  assert.deepEqual(parseArgs(['--send','--commit']),{send:true,commit:true});
  assert.throws(()=>parseArgs(['--commit']),/exige --send/);
  assert.throws(()=>parseArgs(['--admin-key','secret']),/Argument/);
});
test('récupère les articles publics sans export ni écriture réseau',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-import-'));
  try{
    const r=await migratePublic({catalog:{items:[p,v]},fetchImpl:fetchPublic(page()),out});
    assert.equal(r.pagesChecked,1);assert.equal(r.extracted,1);assert.equal(r.draftCount,1);
    assert.equal(r.productionDraftWriteRequested,false);
    assert.equal(r.excluded.length,1);
    assert.equal(r.notRecovered.length,1); // video needs dedicated adapter
    const b=JSON.parse(fs.readFileSync(path.join(out,'batch-001.json'),'utf8'));
    assert.equal(b.dryRun,true);assert.equal(b.publish,false);
    assert.equal(b.articles[0].legacyUrl,p.url);
    assert.equal(b.articles[0].originalPublishedAt,'2026-09-05T00:00:00.000Z');
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('signale une page qui ne donne que le teaser plutôt que remplir artificiellement',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-import-'));
  try{
    const r=await migratePublic({catalog:{items:[p]},fetchImpl:fetchPublic('<html><body><h1>Inscrivez-vous</h1><p>Lire la suite</p></body></html>'),out});
    assert.equal(r.extracted,0);assert.equal(r.failures.length,1);assert.equal(r.draftCount,0);
    assert.equal(r.notRecovered.length,1);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
