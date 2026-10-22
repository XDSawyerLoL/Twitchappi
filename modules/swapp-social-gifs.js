'use strict';
/* SWAPP native reaction GIFs. Self-hosted, original pixel animations generated
   in memory: no key, external URL or paid GIF service is required. */
const WIDTH=144,HEIGHT=72;
const REACTIONS=[
 ['gg','GG','Bien joué victoire gg bravo',0x4addd3],
 ['ggwp','GG WP','Bien joué good game félicitations',0xc1a9ff],
 ['lol','LOL','Rire mdr drôle humour',0xffd677],
 ['wow','WOW','Surprise incroyable wow choqué',0xfa7dba],
 ['rip','RIP','Mort défait game over rip',0xb2a1ff],
 ['hype','HYPE','Hype annonce sortie enthousiaste',0x76e1ff],
 ['clutch','CLUTCH','Exploit clutch victoire skill',0xf9b76b],
 ['lfg','LFG','Equipe communauté jouer ensemble',0xb3f88b],
 ['ez','EZ','Facile ez gg',0x78eee0],
 ['afk','AFK','Absent pause je reviens',0xaab9ce],
 ['nope','NOPE','Non nope refus',0xff8f9a],
 ['nice','NICE','Bravo joli génial',0xa1b6ff]
];
const FONT={
 'A':['01110','10001','10001','11111','10001','10001','10001'],
 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],
 'D':['11110','10001','10001','10001','10001','10001','11110'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'F':['11111','10000','10000','11110','10000','10000','10000'],
 'G':['01111','10000','10000','10111','10001','10001','01111'],
 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'I':['11111','00100','00100','00100','00100','00100','11111'],
 'K':['10001','10010','10100','11000','10100','10010','10001'],
 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'M':['10001','11011','10101','10101','10001','10001','10001'],
 'N':['10001','11001','10101','10011','10001','10001','10001'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'U':['10001','10001','10001','10001','10001','10001','01110'],
 'W':['10001','10001','10001','10101','10101','11011','10001'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'],
 'Z':['11111','00001','00010','00100','01000','10000','11111'],
 ' ':['00000','00000','00000','00000','00000','00000','00000']
};
const gifCache=new Map();
const searchCache=new Map();

function safeGifCdn(value){
 try{
  const u=new URL(String(value||''));
  if(u.protocol!=='https:'||u.username||u.password)return '';
  if(!/^media\d*\.giphy\.com$/i.test(u.hostname))return '';
  return u.href;
 }catch{return ''}
}
function palette(accent){
 return Buffer.from([9,16,31,accent>>16&255,accent>>8&255,accent&255,
  248,250,255,27,40,62]);
}
function pixelsFor(text,frame){
 const px=new Uint8Array(WIDTH*HEIGHT);
 const dot=(x,y,color)=>{
  if(x>=0&&y>=0&&x<WIDTH&&y<HEIGHT)px[y*WIDTH+x]=color;
 };
 for(let y=0;y<HEIGHT;y+=6){
  for(let x=0;x<WIDTH;x+=6){
   if(((x/6)*7+(y/6)*11+frame*3)%23===0)dot(x,y,3);
  }
 }
 const scale=3,step=18,tw=text.length*step-3;
 const ox=Math.floor((WIDTH-tw)/2);
 const oy=17+(frame===2?-1:frame===3?1:0);
 const draw=(x,y,col)=>{
  for(let a=0;a<scale;a++)for(let b=0;b<scale;b++)dot(x+a,y+b,col);
 };
 for(let n=0;n<text.length;n++){
  const glyph=FONT[text[n]]||FONT[' '];
  for(let y=0;y<7;y++)for(let x=0;x<5;x++){
   if(glyph[y][x]==='1')draw(ox+n*step+x*scale,oy+y*scale,(frame===1||frame===3)?2:1);
  }
 }
 // Moving pixel marker + subtle baseline, unlike a full-screen blinking box.
 for(let x=18;x<WIDTH-18;x++)if((x+frame*7)%25<6)dot(x,HEIGHT-13,1);
 for(let k=0;k<6;k++){
  const x=7+((k*29+frame*9)%(WIDTH-14));
  const y=5+((k*13+frame*5)%(HEIGHT-22));
  dot(x,y,1);dot(x+1,y,2);dot(x,y+1,2);
 }
 return px;
}
function uncompressedLzw(bytes){
 // GIF LZW: clear the code table for each pixel. The fixed 3-bit codes
 // are valid GIF89a and avoid external encoder dependencies.
 let bits=0,used=0;
 const arr=[];
 const put=code=>{
  bits|=code<<used;used+=3;
  while(used>=8){arr.push(bits&255);bits>>>=8;used-=8}
 };
 for(const v of bytes){put(4);put(v)}
 put(5);
 if(used)arr.push(bits&255);
 const out=[Buffer.from([2])];
 for(let i=0;i<arr.length;i+=255){
  const part=arr.slice(i,i+255);
  out.push(Buffer.from([part.length]),Buffer.from(part));
 }
 out.push(Buffer.from([0]));
 return Buffer.concat(out);
}
function gifBuffer(key){
 if(gifCache.has(key))return gifCache.get(key);
 const item=REACTIONS.find(([id])=>id===key);
 if(!item)return null;
 const header=Buffer.alloc(13);
 header.write('GIF89a',0,'ascii');
 header.writeUInt16LE(WIDTH,6);header.writeUInt16LE(HEIGHT,8);
 header[10]=0xf1;header[11]=0;header[12]=0;
 const parts=[header,palette(item[3]),Buffer.from([
  0x21,0xff,0x0b,...Buffer.from('NETSCAPE2.0','ascii'),0x03,0x01,0,0,0
 ])];
 for(let frame=0;frame<4;frame++){
  const desc=Buffer.alloc(10);
  desc[0]=0x2c;desc.writeUInt16LE(WIDTH,5);desc.writeUInt16LE(HEIGHT,7);
  parts.push(Buffer.from([0x21,0xf9,0x04,0,14,0,0,0]),desc,
   uncompressedLzw(pixelsFor(item[1],frame)));
 }
 parts.push(Buffer.from([0x3b]));
 const output=Buffer.concat(parts);
 gifCache.set(key,output);
 return output;
}
function builtin(q=''){
 const words=String(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/).filter(Boolean);
 return REACTIONS.filter(item=>{
  if(!words.length)return true;
  const hay=(item[1]+' '+item[2]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return words.every(w=>hay.includes(w));
 }).map(([id,title])=>({
  id:'swapp-'+id,title:title+' · SWAPP',provider:'SWAPP',
  url:'/api/swapp/social/gifs/sticker/'+id+'.gif',
  preview:'/api/swapp/social/gifs/sticker/'+id+'.gif',
  width:WIDTH,height:HEIGHT
 }));
}
async function giphySearch(q,key,fetchImpl){
 const cacheKey=q.toLowerCase();
 const found=searchCache.get(cacheKey);
 if(found&&Date.now()-found.at<90000)return found.items;
 const endpoint=new URL('https://api.giphy.com/v1/gifs/'+(q?'search':'trending'));
 endpoint.searchParams.set('api_key',key);
 endpoint.searchParams.set('limit','16');
 endpoint.searchParams.set('rating','g');
 if(q)endpoint.searchParams.set('q',q);
 endpoint.searchParams.set('lang','fr');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),5500);
 try{
  const response=await fetchImpl(endpoint.href,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return [];
  const data=await response.json();
  const items=(Array.isArray(data.data)?data.data:[]).map(item=>{
   const url=safeGifCdn(item.images?.fixed_width?.url||item.images?.downsized?.url);
   const preview=safeGifCdn(item.images?.fixed_width_small?.url||url);
   if(!url||!preview)return null;
   return {
    id:String(item.id||'').slice(0,80),
    title:String(item.title||'GIF').slice(0,100),
    provider:'GIPHY',url,preview,
    attribution:String(item.user?.display_name||item.username||'').slice(0,70),
    source:/^https:\/\/giphy\.com\/gifs\//.test(item.url||'')?item.url:'https://giphy.com',
    width:Math.min(1000,Number(item.images?.fixed_width?.width)||200),
    height:Math.min(1000,Number(item.images?.fixed_width?.height)||160)
   };
  }).filter(Boolean);
  if(searchCache.size>=40)searchCache.clear();
  searchCache.set(cacheKey,{at:Date.now(),items});
  return items;
 }catch{return []}
 finally{clearTimeout(timeout)}
}
function registerSocialGifs(app,{key=process.env.GIPHY_API_KEY||'',fetchImpl=global.fetch}={}){
 app.get('/api/swapp/social/gifs/sticker/:id.gif',(req,res)=>{
  const id=String(req.params.id||'');
  if(!/^[a-z]{2,8}$/.test(id))return res.status(404).end();
  const gif=gifBuffer(id);
  if(!gif)return res.status(404).end();
  return res.set({
   'Content-Type':'image/gif','Cache-Control':'public,max-age=86400,immutable',
   'X-Content-Type-Options':'nosniff'
  }).send(gif);
 });
 app.get('/api/swapp/social/gifs',async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,50);
  if(q.length===1)return res.json({items:[],provider:'SWAPP'});
  const builtins=builtin(q);
  const external=key&&typeof fetchImpl==='function'
   ?await giphySearch(q,key,fetchImpl):[];
  return res.set('Cache-Control','private,max-age=45').json({
   items:[...builtins,...external].slice(0,28),
   provider:external.length?'SWAPP+GIPHY':'SWAPP',
   hasGiphy:external.length>0
  });
 });
}
module.exports={WIDTH,HEIGHT,REACTIONS,builtin,gifBuffer,safeGifCdn,registerSocialGifs};
