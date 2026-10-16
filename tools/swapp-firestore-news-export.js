'use strict';
// Explicit, read-only, bounded Firestore snapshot for the MySQL article pilot.
// A Firestore read can incur usage charges. Never run automatically.
try{require('dotenv').config()}catch(_){}
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function keyFromEnvironment(env=process.env){
 const names=['FIREBASE_SERVICE_KEY','FIREBASE_SERVICE_ACCOUNT','FIREBASE_CONFIG_JSON','GOOGLE_SERVICE_ACCOUNT_JSON'];
 for(const name of names){
  if(!env[name])continue;
  try{return JSON.parse(String(env[name]).trim().replace(/\\n/g,'\n'))}
  catch{throw Error('Invalid Firebase JSON credentials in '+name+' (values not shown)')}
 }
 for(const name of ['FIREBASE_SERVICE_KEY_BASE64','FIREBASE_SERVICE_ACCOUNT_BASE64','GOOGLE_SERVICE_ACCOUNT_BASE64']){
  if(!env[name])continue;
  try{return JSON.parse(Buffer.from(String(env[name]).trim(),'base64').toString('utf8'))}
  catch{throw Error('Invalid Firebase base64 credentials in '+name+' (values not shown)')}
 }
 return null;
}
function exportOptions(argv=process.argv.slice(2),env=process.env){
 const file=argv.find(x=>x.startsWith('--file='))?.slice(7);
 const limitArg=argv.find(x=>x.startsWith('--limit='))?.slice(8);
 const limit=limitArg==null?25:Number(limitArg);
 if(!argv.includes('--confirm-read')||env.SWAPP_FIRESTORE_EXPORT!=='YES')
  throw Error('Firestore reads disabled. Requires --confirm-read AND SWAPP_FIRESTORE_EXPORT=YES');
 if(!file||!path.isAbsolute(file))throw Error('Choose an absolute private --file path outside the application');
 const target=path.resolve(file);
 if(target===root||target.startsWith(root+path.sep))
  throw Error('Never store private article exports in the public app directory');
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw Error('Pilot export limit must be between 1 and 100');
 return {target,limit};
}
async function exportNews(argv=process.argv.slice(2),env=process.env){
 const opts=exportOptions(argv,env);
 const admin=require('firebase-admin');
 if(!admin.apps.length){
  const account=keyFromEnvironment(env);
  if(account)admin.initializeApp({credential:admin.credential.cert(account)});
  else if(env.GOOGLE_APPLICATION_CREDENTIALS)
   admin.initializeApp({credential:admin.credential.applicationDefault()});
  else throw Error('Firebase credentials absent on Hostinger; no reads attempted');
 }
 const db=admin.firestore();
 const snapshot=await db.collection('swapp_news_articles')
  .orderBy(admin.firestore.FieldPath.documentId()).limit(opts.limit).get();
 if(snapshot.empty)throw Error('No Firestore articles returned; export not created');
 const rows=snapshot.docs.map(doc=>JSON.stringify({id:doc.id,data:doc.data()})).join('\n')+'\n';
 // wx = never overwrite. Private filesystem permissions. No article text logged.
 const fd=fs.openSync(opts.target,'wx',0o600);
 try{fs.writeFileSync(fd,rows,'utf8')}finally{fs.closeSync(fd)}
 process.stdout.write(JSON.stringify({mode:'firestore_readonly_snapshot',documents:snapshot.size,
  limitedTo:opts.limit,output:'private_file_created'})+'\n');
}
if(require.main===module){
 exportNews().catch(error=>{
  process.stderr.write('SWAPP Firestore snapshot: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={keyFromEnvironment,exportOptions,exportNews};
