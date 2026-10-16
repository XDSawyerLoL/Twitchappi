'use strict';
/**
 * SWAPP existing web-server logs -> privacy-preserving aggregate traffic report.
 * One-shot CLI. No tracking script, database writes, cookies, IP retention,
 * external network calls or new dependencies. Does NOT measure Google impressions
 * or unique visitors. Hostinger access logs must already be available as a file.
 * Usage: node tools/swapp-traffic-report.js /path/to/access.log [--days=30]
 */
const fs=require('node:fs');
const readline=require('node:readline');
const path=require('node:path');
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const BOT=/(?:bot|crawl|spider|slurp|headless|facebookexternalhit|twitterbot|yandex|petalbot|semrush|ahrefs|uptime|monitor|curl\/|wget\/|python-requests|bingpreview|chatgpt-user)/i;
function parseLine(line){
 // Apache/Nginx combined logs; also accepts common logs with no referrer/UA.
 const m=String(line).match(/^\S+\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(GET|HEAD)\s+(\S+)\s+HTTP\/[^\"]+"\s+(\d{3})\s+(?:\d+|-)\s*(?:"([^"]*)"\s+"([^"]*)")?/);
 if(!m)return null;
 const d=m[1].match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})$/);
 if(!d||!MONTHS[d[2]])return null;
 const z=d[7]+d[8]+':'+d[9];
 const date=new Date(d[3]+'-'+String(MONTHS[d[2]]).padStart(2,'0')+'-'+d[1].padStart(2,'0')+'T'+d[4]+':'+d[5]+':'+d[6]+z);
 if(!Number.isFinite(date.getTime()))return null;
 return {date,method:m[2],uri:m[3],status:Number(m[4]),referer:m[5]||'',ua:m[6]||''};
}
function section(uri){
 let pathname;
 try{
  const url=new URL(uri,'https://swapp.tv');
  if(url.hostname!=='swapp.tv'&&url.hostname!=='www.swapp.tv')return null;
  pathname=url.pathname.replace(/\/+$/,'')||'/';
 }catch{return null;}
 if(/^\/(?:api|assets|download|downloads|admin|gestionnaire|compte|connexion|settings|reset-password)(?:\/|$)/i.test(pathname))return null;
 if(/\.(?:js|css|json|xml|txt|png|jpe?g|svg|ico|webp|gif|mp4|m3u8|woff2?|map|pdf|zip)$/i.test(pathname))return null;
 if(pathname==='/')return 'Accueil';
 if(pathname==='/actus')return 'Actualité';
 if(/^\/actus\/[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(pathname))return 'Articles';
 if(pathname==='/jeux'||/^\/jeux\/[a-z0-9-]+$/.test(pathname))return 'Dossiers jeux';
 if(pathname==='/decouvrir'||pathname==='/discover')return 'Découverte';
 if(pathname==='/categories')return 'Catégories';
 if(pathname==='/equipes'||pathname==='/teams')return 'Équipes';
 if(pathname==='/communaute')return 'Communauté';
 if(pathname==='/bandes-annonces')return 'Bandes-annonces';
 if(pathname==='/boutique')return 'Boutique';
 if(pathname==='/plan-du-site')return 'Plan du site';
 if(/^\/live\/twitch\/[a-z0-9_]+$/.test(pathname))return 'Lives';
 if(/^\/c\/[a-z0-9_-]+$/.test(pathname)||/^\/[a-z0-9_-]{2,40}$/.test(pathname))return 'Chaînes';
 return null;
}
function searchEngine(referer){
 if(!referer||referer==='-')return null;
 let host;
 try{const u=new URL(referer);if(!/^https?:$/.test(u.protocol))return null;host=u.hostname.toLowerCase().replace(/^www\./,'');}catch{return null;}
 if(host==='swapp.tv'||host.endsWith('.swapp.tv'))return null;
 if(host==='google.com'||/^google\.[a-z.]+$/.test(host)||host.startsWith('www.google.'))return 'Google';
 if(host==='bing.com'||host.endsWith('.bing.com'))return 'Bing';
 if(host==='duckduckgo.com'||host.endsWith('.duckduckgo.com'))return 'DuckDuckGo';
 if(host==='qwant.com'||host.endsWith('.qwant.com'))return 'Qwant';
 if(host==='startpage.com'||host.endsWith('.startpage.com'))return 'Startpage';
 if(host==='search.brave.com')return 'Brave Search';
 if(host==='ecosia.org'||host.endsWith('.ecosia.org'))return 'Ecosia';
 if(host==='search.yahoo.com'||host.endsWith('.search.yahoo.com'))return 'Yahoo';
 return null;
}
function ingest(report,line,{start,end}){
 const request=parseLine(line);
 if(!request||request.method!=='GET'||![200,304].includes(request.status)||BOT.test(request.ua))return;
 const ms=request.date.getTime();if(ms<start||ms>end)return;
 const category=section(request.uri);if(!category)return;
 const day=request.date.toISOString().slice(0,10);
 report.pageViews++;
 report.byDay[day]=(report.byDay[day]||0)+1;
 report.bySection[category]=(report.bySection[category]||0)+1;
 const engine=searchEngine(request.referer);
 if(engine){report.searchReferrals++;report.bySearchEngine[engine]=(report.bySearchEngine[engine]||0)+1;}
}
async function trafficReport(file,{days=30,now=Date.now()}={}){
 if(!Number.isInteger(days)||days<1||days>366)throw Error('--days must be 1..366');
 const end=Number(now);if(!Number.isFinite(end))throw Error('Invalid clock');
 const out={periodDays:days,from:new Date(end-days*86400000).toISOString(),to:new Date(end).toISOString(),
  pageViews:0,searchReferrals:0,byDay:{},bySection:{},bySearchEngine:{},
  privacy:'Aggregates only. No IP, user-agent, search query or visitor identifier is stored.',
  limitations:'Page requests, not unique visitors or Google search impressions. Only the provided server log is measured.'};
 const stream=fs.createReadStream(file,{encoding:'utf8'});
 const reader=readline.createInterface({input:stream,crlfDelay:Infinity});
 for await(const line of reader)ingest(out,line,{start:end-days*86400000,end});
 for(const key of ['byDay','bySection','bySearchEngine'])out[key]=Object.fromEntries(Object.entries(out[key]).sort((a,b)=>key==='byDay'?a[0].localeCompare(b[0]):b[1]-a[1]));
 return out;
}
if(require.main===module){
 const file=process.argv[2];const arg=process.argv.slice(3).find(s=>s.startsWith('--days='));
 if(!file||file.startsWith('--')){process.stderr.write('Usage: node tools/swapp-traffic-report.js /path/to/access.log [--days=30]\n');process.exitCode=2;}
 else trafficReport(path.resolve(file),{days:arg?Number(arg.slice(7)):30}).then(report=>{
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }).catch(error=>{process.stderr.write('Unable to read access log: '+error.message+'\n');process.exitCode=1;});
}
module.exports={parseLine,section,searchEngine,ingest,trafficReport};
