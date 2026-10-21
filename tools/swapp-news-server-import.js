#!/usr/bin/env node
'use strict';
// SWAPP: outil d'import editorial a usage STRICTEMENT serveur / terminal prive.
// Aucun endpoint HTTP, aucun mot de passe et aucun secret dans le depot.
// Usage : node tools/swapp-news-server-import.js --file=/chemin/articles.json
//         node tools/swapp-news-server-import.js --file=/chemin/articles.json --drafts
//         node tools/swapp-news-server-import.js --file=/chemin/articles.json --publish
const fs=require('node:fs');
const path=require('node:path');
const dotenv=require('dotenv');
dotenv.config();
const admin=require('firebase-admin');
const {assertArticle}=require('../modules/swapp-news/article-core');
const args=process.argv.slice(2);
const publish=args.includes('--publish');
const drafts=args.includes('--drafts');
if(publish&&drafts)throw Error('Modes --drafts et --publish incompatibles');
const filename=args.find(x=>x.startsWith('--file='))?.slice(7);
if(!filename)throw Error('Chemin local requis : --file=/chemin/articles.json');
const json=JSON.parse(fs.readFileSync(path.resolve(filename),'utf8'));
if(!Array.isArray(json.articles)||json.articles.length<1||json.articles.length>20)
  throw Error('Le fichier doit contenir un lot de 1 a 20 articles');
function credentials(){
 for(const k of ['FIREBASE_SERVICE_KEY','FIREBASE_SERVICE_ACCOUNT','FIREBASE_CONFIG_JSON','GOOGLE_SERVICE_ACCOUNT_JSON']){
  if(process.env[k])return JSON.parse(process.env[k]);
 }
 for(const k of ['FIREBASE_SERVICE_KEY_BASE64','FIREBASE_SERVICE_ACCOUNT_BASE64','GOOGLE_SERVICE_ACCOUNT_BASE64']){
  if(process.env[k])return JSON.parse(Buffer.from(process.env[k],'base64').toString('utf8'));
 }
 if(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
 throw Error('Firestore non configure dans cet environnement serveur');
}
async function main(){
 const validated=[],slugs=new Set();
 for(const item of json.articles){
  if(slugs.has(item.slug))throw Error('Doublon du lot : '+item.slug);
  slugs.add(item.slug);
  if(publish&&item.image&&item.editorialRightsStatus!=='approved')
   throw Error('Autorisation du visuel non confirmee : '+item.slug);
  const {editorialRightsStatus,...fields}=item;
  validated.push(assertArticle(fields,{publish}));
 }
 if(!drafts&&!publish){
  console.log(JSON.stringify({mode:'dry-run',articles:validated.map(a=>({slug:a.slug,title:a.title,image:!!a.image}))},null,2));
  return;
 }
 const serviceAccount=credentials();
 if(!serviceAccount.project_id||!serviceAccount.client_email||!serviceAccount.private_key)
  throw Error('Compte de service Firestore incomplet');
 if(!admin.apps.length)admin.initializeApp({
  credential:admin.credential.cert(serviceAccount),projectId:serviceAccount.project_id
 });
 const db=admin.firestore();
 db.settings({ignoreUndefinedProperties:true});
 const news=db.collection('swapp_news_articles'),outbox=db.collection('swapp_news_outbox');
 const results=[];
 for(const article of validated){
  const result=await db.runTransaction(async tx=>{
   const ref=news.doc(article.slug),existing=await tx.get(ref);
   if(existing.exists)return {slug:article.slug,status:'skipped_existing',existingStatus:existing.data()?.status};
   const now=new Date().toISOString(),status=publish?'published':'draft';
   tx.create(ref,{...article,status,provenance:'swapp-server-editorial-import',
    revision:1,createdAt:now,updatedAt:now,publishedAt:publish?now:null});
   if(publish)tx.create(outbox.doc('article_'+article.slug+'_r1'),{
    type:'article.published',articleSlug:article.slug,revision:1,
    createdAt:now,status:'paused',channels:[],attempts:0
   });
   return {slug:article.slug,status};
  });
  results.push(result);
 }
 console.log(JSON.stringify({mode:publish?'publish':'drafts',results},null,2));
}
main().catch(e=>{console.error('[SWAPP NEWS IMPORT]',e.message);process.exitCode=1;});
