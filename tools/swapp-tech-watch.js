'use strict';
// SWAPP AI/Robotics watcher. Zero external dependencies and no paid APIs.
// Collects candidates; never publishes an unverified claim to /actus.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const https=require('node:https');
const SOURCES=[
  {id:'mistral',section:'IA',name:'Mistral AI',url:'https://mistral.ai/news/rss.xml'},
  {id:'huggingface',section:'IA',name:'Hugging Face',url:'https://huggingface.co/blog/feed.xml'},
  {id:'google-research',section:'IA',name:'Google Research',url:'https://research.google/blog/rss/'},
  {id:'nvidia',section:'Robotique',name:'NVIDIA',url:'https://blogs.nvidia.com/feed/'},
  {id:'ieee-robotics',section:'Robotique',name:'IEEE Spectrum Robotics',url:'https://spectrum.ieee.org/feeds/topic/robotics.rss'},
  {id:'esa-tech',section:'FUTURE',name:'Agence spatiale européenne · Technologies',url:'https://www.esa.int/rssfeed/Our_Activities/Space_Engineering_Technology'}
];
const MAX_BYTES=1024*1024;
function decode(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]+>/g,'').trim();}
function tag(xml,name){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=xml.match(new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i'));return m?decode(m[1]):'';}
function fetchXml(url,redirects=0){
  return new Promise((resolve,reject)=>{
    if(!url.startsWith('https://'))return reject(Error('HTTPS required'));
    const req=https.get(url,{timeout:10000,headers:{'User-Agent':'SWAPP-Editorial-Watch/1.0 (+https://swapp.tv)','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'}},res=>{
      if([301,302,307,308].includes(res.statusCode)&&res.headers.location&&redirects<2){
        res.resume();const next=new URL(res.headers.location,url);
        if(next.protocol!=='https:')return reject(Error('Insecure redirect'));
        return fetchXml(next.href,redirects+1).then(resolve,reject);
      }
      if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode));}
      let bytes=0,chunks=[];
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BYTES){req.destroy(Error('Feed too large'));return;}chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error',reject);
    });req.on('timeout',()=>req.destroy(Error('Timeout')));req.on('error',reject);
  });
}
function parseFeed(xml,source){
  const blocks=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>|<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  return blocks.slice(0,30).map(m=>{
    const b=m[1]||m[2], title=tag(b,'title');
    const atom=b.match(/<link\b[^>]*href=["']([^"']+)["']/i);
    const url=tag(b,'link')||atom?.[1]||'';
    const date=tag(b,'pubDate')||tag(b,'published')||tag(b,'updated');
    let canonical;try{canonical=new URL(url);if(canonical.protocol!=='https:')return null;canonical.hash='';}catch{return null;}
    const published=new Date(date);if(!title||!Number.isFinite(published.getTime()))return null;
    const id=crypto.createHash('sha256').update(source.id+'|'+canonical.href).digest('hex').slice(0,20);
    return {id,section:source.section,source:source.name,title,url:canonical.href,sourcePublishedAt:published.toISOString(),status:'candidate_unverified',officialVideoVerified:false,primarySourceVerified:false};
  }).filter(Boolean);
}
async function run({output=path.resolve(__dirname,'../data/swapp-tech-watch-candidates.json'),now=new Date()}={}){
  const previous=output&&fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{candidates:[]};
  const byId=new Map((previous.candidates||[]).map(x=>[x.id,x]));
  const checks=[];
  for(const source of SOURCES){
    try{
      const entries=parseFeed(await fetchXml(source.url),source);
      for(const entry of entries){const old=byId.get(entry.id);byId.set(entry.id,old?{...entry,...old}:entry);}
      checks.push({source:source.id,ok:true,count:entries.length});
    }catch(e){checks.push({source:source.id,ok:false,error:String(e.message).slice(0,120)});}
  }
  const candidates=[...byId.values()].sort((a,b)=>b.sourcePublishedAt.localeCompare(a.sourcePublishedAt)).slice(0,300);
  const result={schema:1,kind:'swapp-tech-watch-candidates',checkedAt:now.toISOString(),checks,candidates};
  if(output){
   fs.mkdirSync(path.dirname(output),{recursive:true});
   const temp=output+'.tmp-'+process.pid;fs.writeFileSync(temp,JSON.stringify(result,null,2)+'\n');fs.renameSync(temp,output);
  }
  return result;
}
if(require.main===module)run().then(r=>{console.log(JSON.stringify({checkedAt:r.checkedAt,candidates:r.candidates.length,checks:r.checks}));if(r.checks.every(x=>!x.ok))process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={SOURCES,parseFeed,run};
