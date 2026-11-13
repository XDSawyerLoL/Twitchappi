'use strict';
/* Run AFTER production deployment: node tools/swapp-share-preview-smoke.js
 * Public-only requests. Simulates X's crawler; no API keys, tweets or writes. */
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
const parsed=new URL(ORIGIN);
if(parsed.protocol!=='https:'||!['swapp.tv','www.swapp.tv'].includes(parsed.hostname)
 ||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('Invalid verification origin');
const base=parsed.origin;
const ua='Twitterbot/1.0';
const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
async function request(path){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  return await fetch(base+path,{signal:controller.signal,redirect:'manual',cache:'no-store',
   headers:{'User-Agent':ua,'Accept':'text/html,image/png,image/jpeg,application/json,*/*','Cache-Control':'no-cache'}});
 }finally{clearTimeout(timeout)}
}
function check(condition,message){if(!condition)throw Error(message)}
async function run(){
 const listing=await request('/api/actus');
 check(listing.ok,'SWAPP ACTUS API is HTTP '+listing.status);
 const data=await listing.json();
 check(Array.isArray(data.articles),'Published ACTUS list is missing');
 const articles=data.articles.filter(a=>slugOk(a?.slug)&&a.status!=='draft'&&a.status!=='unpublished').slice(0,3);
 check(articles.length>0,'No published article available for X card verification');
 for(const article of articles){
  const route='/actus/'+article.slug;
  const page=await request(route);
  check(page.status===200,
   'Twitterbot cannot read '+route+': HTTP '+page.status+
   ' (check Hostinger firewall, WAF, anti-bot rules and public sessions)');
  const html=await page.text();
  check(html.includes('<meta name="twitter:card" content="summary_large_image">'),
   route+': missing summary_large_image');
  const og=html.match(/<meta property="og:image" content="([^"]+)"/);
  const twitter=html.match(/<meta name="twitter:image" content="([^"]+)"/);
  check(og&&twitter&&og[1]===twitter[1],route+': OG and X image tags differ');
  const expected=base+'/actus/og-image/'+article.slug;
  check(og[1]===expected,route+': image URL must be first-party and article-specific');
  const image=await request('/actus/og-image/'+article.slug);
  check(image.status===200,route+': social image HTTP '+image.status+
   ' (may be blocked by anti-bot protection)');
  const mime=(image.headers.get('content-type')||'').toLowerCase();
  check(mime.startsWith('image/jpeg')||mime.startsWith('image/png'),
   route+': crawler image is not a JPG or PNG ('+mime+')');
  const bytes=await image.arrayBuffer();
  check(bytes.byteLength>=2000&&bytes.byteLength<4500000,
   route+': invalid social image size '+bytes.byteLength);
  console.log('PASS',route,'Twitterbot=200','image='+mime,'bytes='+bytes.byteLength);
 }
}
if(require.main===module)run().catch(error=>{console.error('SWAPP X PREVIEW FAIL:',error.message);process.exitCode=1});
module.exports={run,slugOk};
