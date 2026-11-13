'use strict';
/* First-party social preview for published SWAPP stories.
 * A social crawler needs a real PNG/JPEG, not an image inserted by JavaScript.
 * Only pinned official YouTube thumbnail hosts can be fetched remotely. */
const zlib=require('node:zlib');
const articleExtras=require('../../assets/swapp-article-extras');
const SLUG=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
const HOSTS=new Set(['i.ytimg.com','img.youtube.com']);
const PREVIEW_BASE='https://swapp.tv/actus/og-image/';
function xShareUrl(article){
 const slug=String(article?.slug||'');
 if(!SLUG.test(slug))return '';
 const title=String(article?.title||'Actualité SWAPP').trim().slice(0,190);
 return 'https://x.com/intent/tweet?'+new URLSearchParams({
  text:title,url:'https://swapp.tv/actus/'+slug
 }).toString();
}
function previewUrl(article){
 const slug=String(article?.slug||'');
 return SLUG.test(slug)?PREVIEW_BASE+slug+'.png':'';
}
function thumbnailSource(article){
 for(const source of articleExtras.cardImageSources(article)){
  try{
   const u=new URL(source);
   if(u.protocol==='https:'&&HOSTS.has(u.hostname)&&!u.port&&!u.username&&!u.password
    &&/^\/vi\/[A-Za-z0-9_-]{11}\/(?:hqdefault|mqdefault|maxresdefault|sddefault|0)\.jpg$/.test(u.pathname)
    &&!u.search&&!u.hash)return u.href;
  }catch(_){}
 }
 return null;
}
const GLYPHS={
 'A':['01110','10001','10001','11111','10001','10001','10001'],
 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],
 'D':['11110','10001','10001','10001','10001','10001','11110'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'F':['11111','10000','10000','11110','10000','10000','10000'],
 'G':['01111','10000','10000','10111','10001','10001','01111'],
 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'I':['11111','00100','00100','00100','00100','00100','11111'],
 'J':['00111','00010','00010','00010','10010','10010','01100'],
 'K':['10001','10010','10100','11000','10100','10010','10001'],
 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'M':['10001','11011','10101','10101','10001','10001','10001'],
 'N':['10001','11001','10101','10011','10001','10001','10001'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'Q':['01110','10001','10001','10001','10101','10010','01101'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'U':['10001','10001','10001','10001','10001','10001','01110'],
 'V':['10001','10001','10001','10001','10001','01010','00100'],
 'W':['10001','10001','10001','10101','10101','10101','01010'],
 'X':['10001','10001','01010','00100','01010','10001','10001'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'],
 'Z':['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01110','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','01110'],
 ' ':['00000','00000','00000','00000','00000','00000','00000'],
 '.':['00000','00000','00000','00000','00000','00110','00110'],
 ':':['00000','00100','00100','00000','00100','00100','00000'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],
 '?':['01110','10001','00001','00010','00100','00000','00100']
};
const normalizeText=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 .:?-]/g,' ').replace(/\s+/g,' ').trim();
function crc32(buf){
 let crc=0xffffffff;
 for(const byte of buf){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}
 return (crc^0xffffffff)>>>0;
}
function chunk(type,data){
 const name=Buffer.from(type,'ascii'),size=Buffer.alloc(4),crc=Buffer.alloc(4);
 size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
 return Buffer.concat([size,name,data,crc]);
}
function brandedPng(article){
 const width=1200,height=630,pixels=Buffer.alloc((width*3+1)*height);
 const paint=(x,y,scale,color)=>{
  const rectW=Math.min(scale,width-x),rectH=Math.min(scale,height-y);
  for(let yy=0;yy<rectH;yy++)for(let xx=0;xx<rectW;xx++){
   const offset=(y+yy)*(width*3+1)+1+(x+xx)*3;
   pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];
  }
 };
 for(let y=0;y<height;y++){
  const offset=y*(width*3+1);
  pixels[offset]=0;
  for(let x=0;x<width;x++){
   const idx=offset+1+x*3;
   pixels[idx]=Math.round(9+x/width*12);
   pixels[idx+1]=Math.round(15+y/height*18);
   pixels[idx+2]=Math.round(27+x/width*27);
   if(y>=590){pixels[idx]=29;pixels[idx+1]=194;pixels[idx+2]=194;}
  }
 }
 const write=(str,x,y,scale,color)=>{
  for(const ch of normalizeText(str).slice(0,80)){
   const glyph=GLYPHS[ch]||GLYPHS[' '];
   for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++)if(glyph[gy][gx]==='1')paint(x+gx*scale,y+gy*scale,scale,color);
   x+=scale*6;
  }
 };
 write('SWAPP.',65,72,13,[240,250,255]);
 write('LE MAGAZINE GAMING',70,190,5,[94,231,226]);
 const words=normalizeText(article?.title||'ACTUALITE DU JEU VIDEO').split(' '),lines=[''];
 for(const word of words){
  const current=lines[lines.length-1],next=current?current+' '+word:word;
  if(next.length>35&&lines.length<3)lines.push(word);
  else if(next.length<=35)lines[lines.length-1]=next;
  else{lines[lines.length-1]=current.slice(0,32)+'...';break;}
 }
 lines.forEach((line,i)=>write(line,70,280+i*91,9,[249,250,253]));
 const head=Buffer.alloc(13);head.writeUInt32BE(width,0);head.writeUInt32BE(height,4);head[8]=8;head[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),
  chunk('IDAT',zlib.deflateSync(pixels,{level:5})),chunk('IEND',Buffer.alloc(0))]);
}
async function deliverPreview(article,res,fetchImpl=globalThis.fetch){
 const source=thumbnailSource(article);
 if(source&&typeof fetchImpl==='function'){
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
   let response;
   try{response=await fetchImpl(source,{redirect:'error',signal:controller.signal,headers:{Accept:'image/jpeg'}});}
   finally{clearTimeout(timer);}
   if(response?.ok&&/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type')||'')){
    const size=Number(response.headers.get('content-length')||0);
    if(size>=0&&size<4500000){
     const buffer=Buffer.from(await response.arrayBuffer());
     if(buffer.length>1500&&buffer.length<4500000&&buffer[0]===255&&buffer[1]===216){
      return res.set('Cache-Control','public, max-age=900').set('X-Content-Type-Options','nosniff').type('jpeg').send(buffer);
     }
    }
   }
  }catch(_){/* Image fetch can fail. A first-party article-specific PNG is still served. */}
 }
 return res.set('Cache-Control','public, max-age=900').set('X-Content-Type-Options','nosniff').type('png').send(brandedPng(article));
}
module.exports={SLUG,xShareUrl,previewUrl,thumbnailSource,brandedPng,deliverPreview};
