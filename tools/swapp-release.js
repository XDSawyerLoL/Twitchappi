'use strict';
// SWAPP release fingerprint: compare repository files with the Node instance
// actually serving swapp.tv. No git checkout, secrets or paid services needed.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const RELEASE_FILES=Object.freeze([
 'server.js',
 'app.js',
 'index.html',
 'modules/swapp-hubs.js',
 'modules/swapp-seo.js',
 'modules/swapp-news/site-shell.js',
 'assets/swapp-unified-nav.css',
 'assets/swapp-mobile-comfort.css',
 'assets/swapp-social-native/social-body.html',
 'assets/swapp-social-native/social-swapp.css',
 'assets/swapp-social-native/app.js',
 'assets/swapp-social-native/core.js',
 'assets/swapp-social-native/session.js',
 'assets/swapp-social-native/views.js',
 'ads.txt'
]);
function releaseInfo(base=path.resolve(__dirname,'..'),env=process.env){
 const hash=crypto.createHash('sha256');
 const missing=[];
 for(const name of RELEASE_FILES){
  const full=path.resolve(base,name);
  try{
   const stat=fs.statSync(full);
   if(!stat.isFile())throw Error('not a regular file');
   // Boundary-delimited filenames prevent ambiguous concatenations.
   const data=fs.readFileSync(full);
   hash.update(name+'\x00'+data.length+'\x00');
   hash.update(data);
   hash.update('\x00');
  }catch(_){missing.push(name)}
 }
 const revision=String(env.SWAPP_GIT_SHA||env.GITHUB_SHA||'').trim();
 return {
  fingerprint:missing.length===0?hash.digest('hex'):null,
  revision:/^[a-f0-9]{7,40}$/i.test(revision)?revision.toLowerCase():null,
  complete:missing.length===0,
  trackedFiles:RELEASE_FILES.length,
  missing
 };
}
module.exports={RELEASE_FILES,releaseInfo};
if(require.main===module){
 const info=releaseInfo();
 process.stdout.write(JSON.stringify(info,null,2)+'\n');
 if(!info.complete)process.exitCode=1;
}
