'use strict';
// One-shot, zero-subscription GEO production probe. No credentials, analytics,
// crawler simulation, background polling, or GitHub Actions.
const BASE=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
const PATHS=['/a-propos','/alternative-twitch'];
const ORIGIN='https://swapp.tv';
function verifiedOrigin(raw){
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))
  throw Error('SWAPP_VERIFY_URL must be a bare origin');
 const host=url.hostname.toLowerCase();
 if(!['swapp.tv','www.swapp.tv','localhost','127.0.0.1'].includes(host))
  throw Error('Unsupported verification hostname');
 if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(host)))
  throw Error('HTTPS required');
 return url.origin;
}
async function request(origin,path,fetchImpl=fetch){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetchImpl(origin+path,{
   headers:{Accept:path.endsWith('.xml')?'application/xml':'*/*','Cache-Control':'no-cache'},
   cache:'no-store',redirect:'follow',signal:controller.signal
  });
  const body=await response.text();
  if(!response.ok)throw Error(path+' HTTP '+response.status);
  if(body.length>3000000)throw Error(path+' exceeds probe size limit');
  return {body,status:response.status,type:response.headers.get('content-type')||''};
 }finally{clearTimeout(timer)}
}
function assert(condition,message){if(!condition)throw Error(message)}
function inspectPage(path,result){
 const body=result.body;
 assert(result.type.includes('text/html'),path+' is not HTML');
 const canonical='<link rel="canonical" href="'+ORIGIN+path+'">';
 assert(body.includes(canonical),path+' is missing its canonical');
 assert((body.match(/rel="canonical"/g)||[]).length===1,path+' has duplicate canonical links');
 assert(body.includes('<main id="main-content" class="swapp-geo">'),path+' returned an outdated SPA/fallback page');
 assert(/<h1>[^<]{15,}<\/h1>/.test(body),path+' lacks a meaningful heading');
 const scripts=[...body.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)];
 assert(scripts.length>0,path+' is missing JSON-LD');
 const graphs=scripts.map(match=>JSON.parse(match[1])).flatMap(schema=>schema['@graph']||[schema]);
 assert(graphs.some(item=>item.url===ORIGIN+path&&
  item['@type']===(path==='/a-propos'?'AboutPage':'WebPage')),path+' has no relevant schema page');
 return {path,status:result.status,canonical:true,html:true,structured_data:true};
}
async function inspect({origin=verifiedOrigin(BASE),fetchImpl=fetch}={}){
 const results=[];
 const [robots,sitemap]=await Promise.all([
  request(origin,'/robots.txt',fetchImpl),
  request(origin,'/sitemap.xml',fetchImpl)
 ]);
 assert(robots.type.includes('text/plain'),'robots.txt content type incorrect');
 assert(robots.body.includes('Sitemap: '+ORIGIN+'/sitemap.xml'),'robots.txt has no canonical sitemap');
 assert(sitemap.body.includes('<urlset'),'sitemap.xml is not XML sitemap');
 assert(sitemap.type.includes('xml'),'sitemap.xml content type incorrect');
 for(const path of PATHS){
  assert(sitemap.body.includes('<loc>'+ORIGIN+path+'</loc>'),path+' not included in sitemap');
  results.push(inspectPage(path,await request(origin,path,fetchImpl)));
 }
 return {service:'swapp-geo',status:'verified_on_http',origin,pages:results,
  sitemap:true,robots:true,checked_at:new Date().toISOString(),
  note:'HTTP and on-page SEO verified, not Google indexation or an AI citation'};
}
async function submitIndexNow({fetchImpl=fetch}={}){
 // Opt-in only. Requires that both public GEO pages passed the production probe.
 // IndexNow acceptance is NOT a promise of crawling or indexing by search engines.
 const {INDEXNOW_KEY,INDEXNOW_KEY_PATH}=require('../modules/swapp-seo');
 const payload={host:'swapp.tv',key:INDEXNOW_KEY,
  keyLocation:ORIGIN+INDEXNOW_KEY_PATH,urlList:PATHS.map(path=>ORIGIN+path)};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetchImpl('https://api.indexnow.org/indexnow',{
   method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},
   body:JSON.stringify(payload)
  });
  assert(response.status===200||response.status===202,
   'IndexNow did not accept URLs (HTTP '+response.status+')');
  return {accepted:true,status:response.status,url_count:payload.urlList.length};
 }finally{clearTimeout(timer)}
}
async function main(){
 const origin=verifiedOrigin(BASE);
 const report=await inspect({origin});
 if(process.argv.includes('--submit-indexnow')){
  assert(origin===ORIGIN,'IndexNow submission only allowed for canonical production host');
  const key=(await request(origin,require('../modules/swapp-seo').INDEXNOW_KEY_PATH)).body.trim();
  assert(key===require('../modules/swapp-seo').INDEXNOW_KEY,
   'IndexNow domain ownership key is not served by production');
  report.indexnow=await submitIndexNow();
 }
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(require.main===module){
 main().catch(error=>{
  process.stderr.write('FAIL SWAPP GEO PROBE: '+String(error.message||error)+'\n');
  process.exitCode=1;
 });
}
module.exports={PATHS,verifiedOrigin,inspectPage,inspect,submitIndexNow};
