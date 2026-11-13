'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const preview=require('../modules/swapp-news/share-preview');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const slug='nouveau-trailer-pour-gta-6';
const article={
 slug,title:'Nouveau trailer pour GTA VI',summary:'Images du jeu annoncées officiellement.',
 author:'SWAPP',body:'Article test, uniquement pour la vérification technique.',
 game:'Grand Theft Auto VI',contentType:'trailer',status:'published',
 publishedAt:'2026-11-13T10:00:00Z',
 trailerUrl:'https://www.youtube.com/watch?v=VQRLujxTm3c'
};
test('direct X intent retains a canonical published article link',()=>{
 const link=new URL(preview.xShareUrl(article));
 assert.equal(link.origin,'https://x.com');
 assert.equal(link.pathname,'/intent/tweet');
 assert.equal(link.searchParams.get('text'),article.title);
 assert.equal(link.searchParams.get('url'),'https://swapp.tv/actus/'+slug);
 assert.equal(preview.xShareUrl({...article,slug:'../admin'}),'');
});
test('first-party social image URL is HTTPS and image host validation blocks intranet SSRF',()=>{
 assert.equal(preview.previewUrl(article),'https://swapp.tv/actus/og-image/'+slug);
 assert.equal(preview.previewUrl({...article,slug:'../etc/passwd'}),'');
 assert.equal(preview.thumbnailSource(article),'https://i.ytimg.com/vi/VQRLujxTm3c/hqdefault.jpg');
 assert.equal(preview.thumbnailSource({...article,trailerUrl:null,
  thumbnail:{url:'https://127.0.0.1/private.jpg'}}),null);
 assert.equal(preview.thumbnailSource({...article,trailerUrl:null,
  thumbnail:{url:'https://evil.example/vi/VQRLujxTm3c/hqdefault.jpg'}}),null);
});
test('published official editorial cover wins over the video thumbnail when a provider is approved',()=>{
 const official='https://blog.playstation.com/tachyon/2026/11/official-artwork.jpg';
 const withArt={...article,thumbnail:{url:official}};
 assert.equal(preview.thumbnailSource(withArt),official);
 assert.deepEqual(preview.thumbnailSources(withArt),[
  official,'https://i.ytimg.com/vi/VQRLujxTm3c/hqdefault.jpg',
  'https://img.youtube.com/vi/VQRLujxTm3c/hqdefault.jpg'
 ]);
 assert.equal(preview.allowedSource('https://storage.googleapis.com/gweb-uniblog-publish-prod/images/gemini.width-1300.jpg'),
  'https://storage.googleapis.com/gweb-uniblog-publish-prod/images/gemini.width-1300.jpg');
 assert.equal(preview.allowedSource('https://blogs.nvidia.com/wp-content/uploads/2026/11/photo.jpeg'),
  'https://blogs.nvidia.com/wp-content/uploads/2026/11/photo.jpeg');
 for(const link of ['http://blog.playstation.com/tachyon/2026/11/image.jpg',
  'https://blog.playstation.com.evil.example/tachyon/2026/11/image.jpg',
  'https://storage.googleapis.com/untrusted-user-bucket/private.jpg',
  'https://blogs.nvidia.com/account/login',
  'https://blog.playstation.com/tachyon/2026/11/image.jpg?redirect=http://localhost'])
  assert.equal(preview.allowedSource(link),null);
});
test('no image can still result in an article-specific valid 1200x630 PNG',()=>{
 const png=preview.brandedPng({...article,trailerUrl:null});
 assert.ok(Buffer.isBuffer(png));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),1200);
 assert.equal(png.readUInt32BE(20),630);
 const idat=png.indexOf(Buffer.from('IDAT'));
 assert.ok(idat>0);
 const len=png.readUInt32BE(idat-4);
 const raw=zlib.inflateSync(png.subarray(idat+4,idat+4+len));
 assert.equal(raw.length,630*(1+1200*3));
 assert.ok(png.length<4500000);
});
function response(){
 const headers={};
 return {headers,statusCode:200,set(key,value){headers[key.toLowerCase()]=value;return this},
  type(value){this.mime=value;return this},send(body){this.body=body;return this}};
}
test('YouTube social artwork is streamed with an image MIME type, never HTML',async()=>{
 const jpeg=Buffer.alloc(2100,42);jpeg[0]=255;jpeg[1]=216;jpeg[2098]=255;jpeg[2099]=217;
 let calls=0;
 const fakeFetch=async(_url,options)=>{
  calls++;
  assert.equal(options.redirect,'error');
  let read=0;
  return {ok:true,headers:{get(name){return name==='content-type'?'image/jpeg':'2100'}},
   body:{getReader(){return {async read(){if(read++)return {done:true};return {done:false,value:jpeg}},
    async cancel(){}}}}};
 };
 const res=response();
 await preview.deliverPreview(article,res,fakeFetch);
 assert.equal(calls,1);
 assert.equal(res.mime,'jpeg');
 assert.equal(res.body.length,2100);
 assert.equal(res.headers['x-content-type-options'],'nosniff');
});
test('unavailable official artwork falls back to a real branded PNG without an invented game screenshot',async()=>{
 const res=response();
 await preview.deliverPreview({...article,trailerUrl:null},res,async()=>{throw Error('no network')});
 assert.equal(res.mime,'png');
 assert.ok(Buffer.isBuffer(res.body));
 assert.equal(res.body.readUInt32BE(16),1200);
});
test('social crawlers read complete OG and X tags from server HTML, not JavaScript',()=>{
 const html=renderNewsStory(article);
 const image='https://swapp.tv/actus/og-image/'+slug;
 for(const tag of [
  '<meta property="og:image" content="'+image+'">',
  '<meta name="twitter:image" content="'+image+'">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta property="og:image:alt"'
 ])assert.ok(html.includes(tag),tag);
 assert.ok(html.includes('https://x.com/intent/tweet?'));
 const router=read('modules/swapp-news/router.js');
 assert.ok(router.indexOf("router.get('/actus/og-image/:slug'")<router.indexOf("router.get('/actus/:slug'"));
 assert.match(router,/snapshot\.data\(\)\?\.status!=='published'/);
});
test('share toolbar cannot intercept outbound social links via its container',()=>{
 const extras=read('assets/swapp-article-extras.js');
 assert.ok(extras.includes("target.closest?.('button[data-swapp-article-share]')"));
 assert.equal(extras.includes('navigator.share('),false);
 const catalogue=read('assets/swapp-catalogue-lab.js'),actus=read('assets/swapp-actus-app.js');
 for(const js of [catalogue,actus]){
  assert.ok(js.includes('https://x.com/intent/tweet?'));
  assert.equal(js.includes('navigator.share('),false);
 }
 assert.ok(catalogue.includes('installRailEdgeHints();'));
 assert.ok(read('assets/swapp-catalogue-lab.css').includes('.scl-edge-arrow-right'));
});

test('overlaid desktop arrows appear only when there is content left to scroll',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const start=js.indexOf('function installRailEdgeHints(){');
 const end=js.indexOf("document.querySelectorAll('[data-scroll-left]",start);
 assert.ok(start>0&&end>start);
 const handlers={},arrows=[],rail={append(node){arrows.push(node)},
  querySelector:()=>({textContent:'Explore les jeux'})};
 const cards={dataset:{},scrollWidth:1200,clientWidth:400,scrollLeft:0,
  closest:()=>rail,addEventListener:(name,fn)=>{handlers[name]=fn},
  scrollBy({left}){this.scrollLeft+=left}};
 const create=(tag,className,label)=>({
  tag,className,label,hidden:false,events:{},
  setAttribute(name,value){this[name]=value},
  addEventListener(name,fn){this.events[name]=fn}
 });
 const setup=new Function('document','window','create','requestAnimationFrame',
  'prefersLessMotion','ResizeObserver','MutationObserver',
  js.slice(start,end)+';return installRailEdgeHints;')(
   {querySelectorAll:()=>[cards]},{addEventListener(){}},
   create,fn=>{fn();return 1},()=>false,undefined,undefined
  );
 setup();
 assert.equal(arrows.length,2);
 assert.equal(arrows[0].hidden,true);
 assert.equal(arrows[1].hidden,false);
 assert.ok(arrows[1]['aria-label'].includes('droite'));
 cards.scrollLeft=800;handlers.scroll();
 assert.equal(arrows[0].hidden,false);
 assert.equal(arrows[1].hidden,true);
 cards.scrollLeft=0;arrows[1].events.click();
 assert.ok(cards.scrollLeft>0);
});
