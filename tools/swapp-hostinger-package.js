'use strict';
// Create a clean, reproducible SWAPP ZIP from committed GitHub code.
// NO network, no FTP connection, no database writes, no GitHub Actions.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const mandatory=['app.js','server.js','package.json','package-lock.json','index.html',
 'modules/swapp-hubs.js','modules/swapp-seo.js','modules/swapp-game-pages.js','tools/swapp-release.js','assets/swapp-social-native/social-body.html'];
function secretLike(name){
 const p=String(name).replace(/\\/g,'/');
 const segments=p.split('/');
 return segments.some((part)=>{
  const x=part.toLowerCase();
  return x==='.env'||(x.startsWith('.env.')&&!/^(\.env\.example|\.env\.sample|\.env\.template)$/.test(x))
    ||/\.(pem|p12|pfx|key)$/i.test(x)||/(service-account|service_account|credentials|private[-_]key)\.json$/i.test(x);
 });
}
function getTracked(run=execFileSync){
 const stdout=run('git',['ls-tree','-r','--name-only','HEAD'],{cwd:root,encoding:'utf8'});
 const tracked=stdout.split(/\r?\n/).filter(Boolean);
 const unsafe=tracked.filter(secretLike);
 if(unsafe.length)throw Error('Refuse release: possible secrets tracked in Git: '+unsafe.join(', '));
 const missing=mandatory.filter(x=>!tracked.includes(x));
 if(missing.length)throw Error('Missing required committed files: '+missing.join(', '));
 return tracked;
}
function createPackage({destination=null,run=execFileSync}={}){
 const tracked=getTracked(run);
 const dirty=run('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'});
 if(dirty.trim())throw Error('Working tree has uncommitted tracked edits. Commit or discard before packaging.');
 const sha=run('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{7,12}$/i.test(sha))throw Error('Invalid Git revision');
 const out=path.resolve(destination||path.join(os.tmpdir(),'swapp-hostinger-'+sha+'.zip'));
 if(out===root||out.startsWith(root+path.sep))throw Error('Release archive must be outside the project web root');
 if(fs.existsSync(out))throw Error('Release archive already exists; refusing overwrite');
 const dir=path.dirname(out);
 if(!fs.existsSync(dir))throw Error('Output directory not found');
 const temp=out+'.incomplete';
 try{
  run('git',['archive','--format=zip','--output='+temp,'HEAD'],{cwd:root,encoding:'utf8',stdio:'pipe'});
  const stat=fs.statSync(temp);
  if(!stat.isFile()||stat.size<1000)throw Error('Archive missing or unexpectedly small');
  fs.renameSync(temp,out);
  const digest=crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  return {filename:path.basename(out),revision:sha,bytes:stat.size,sha256:digest,files:tracked.length,
   destination:out,networkCalls:0,uploaded:false,liveUnchanged:true};
 }catch(error){
  try{fs.rmSync(temp,{force:true})}catch(_){}
  throw error;
 }
}
if(require.main===module){
 const arg=process.argv.find(x=>x.startsWith('--output='));
 try{process.stdout.write(JSON.stringify(createPackage({destination:arg?.slice(9)}),null,2)+'\n')}
 catch(error){process.stderr.write('SWAPP packaging aborted: '+error.message+'\n');process.exitCode=1}
}
module.exports={secretLike,getTracked,createPackage};
