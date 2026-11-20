'use strict';
// Cache-version only the three Identity Vault UI assets, using the exact bytes
// deployed on this server. No cookies, private browsing data or unrelated
// static files are cleared.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const QUANTIC_LOGIN_ASSETS=Object.freeze([
 'swapp-quantic-id-site.js',
 'swapp-quantic-login-keeper.js',
 'swapp-quantic-id-site.css'
]);
const QUANTIC_LOGIN_ASSET_RE=/(\/assets\/(?:swapp-quantic-id-site\.js|swapp-quantic-login-keeper\.js|swapp-quantic-id-site\.css))(?:\?v=[a-zA-Z0-9_.-]+)?(?=(?:["'&#\s]|$))/g;

function makeQuanticLoginCacheVersioner({root=path.resolve(__dirname,'..'),readFile=fs.readFileSync}={}){
 if(typeof readFile!=='function')throw Error('quantic_cache_read_file_required');
 return function versionQuanticLoginAssets(html){
  const source=String(html||'');
  if(!source.includes('/assets/swapp-quantic-id-site.js'))return source;
  let fingerprint;
  try{
   const hash=crypto.createHash('sha256');
   for(const name of QUANTIC_LOGIN_ASSETS){
    const relative='assets/'+name;
    hash.update(relative).update('\0');
    hash.update(readFile(path.join(root,relative)));
    hash.update('\0');
   }
   fingerprint=hash.digest('hex').slice(0,16);
  }catch{
   // Never take the main SWAPP page offline if one of these assets is absent
   // during a partially synchronized Hostinger upload.
   return source;
  }
  return source.replace(QUANTIC_LOGIN_ASSET_RE,(_match,url)=>url+'?v=qvault-'+fingerprint);
 };
}

module.exports={makeQuanticLoginCacheVersioner,QUANTIC_LOGIN_ASSETS};
