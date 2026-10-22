'use strict';
// SWAPP creator cards: server-side, public, no user tracking and no external image fetches.
const crypto=require('node:crypto');
const ORIGIN='https://swapp.tv';
const IMAGE_MAX=4*1024*1024;
function xml(value){
 return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
function clean(value,max=90){
 return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function picture(value){
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(value||''));
 if(!match||match[2].length>IMAGE_MAX*1.36)return null;
 const data=Buffer.from(match[2],'base64');
 if(!data.length||data.length>IMAGE_MAX)return null;
 const mime=match[1].toLowerCase();
 if(mime==='jpeg'&&(data[0]!==255||data[1]!==216||data[2]!==255))return null;
 if(mime==='png'&&data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
 if(mime==='webp'&&(data.subarray(0,4).toString()!=='RIFF'||data.subarray(8,12).toString()!=='WEBP'))return null;
 return data;
}
function cardContext(creator,live={}){
 const name=clean(creator?.display_name||creator?.login||'Créateur',44);
 const login=clean(creator?.login,32).toLowerCase();
 const isLive=!!live.active;
 const title=clean(live.title||creator?.current_live_title||'',110);
 const game=clean(live.category||creator?.current_live_category||'',55);
 const status=isLive?'EN DIRECT':'CHAÎNE SWAPP';
 const headline=isLive?(title||name+' est en direct'):name;
 const description=isLive
  ?(title?name+' est en direct : '+title+(game?' · '+game:'')+'. Rejoins le live sur SWAPP.'
   :name+' est en direct sur SWAPP. Rejoins le live maintenant.')
  :(clean(creator?.bio,165)||'Découvre la chaîne, les créations et la communauté de '+name+' sur SWAPP.');
 const raw=JSON.stringify([login,isLive,headline,game,Number(live.startedAt||0),creator?.channel_updatedAt||'']);
 const revision=crypto.createHash('sha256').update(raw)
  .update(String(creator?.banner_url||'')).update(String(creator?.avatar_url||''))
  .digest('hex').slice(0,16);
 return {login,name,isLive,status,headline,description:clean(description,220),game,revision,
  image:ORIGIN+'/share-card/'+encodeURIComponent(login)+'.jpg?v='+revision,
  url:ORIGIN+'/'+encodeURIComponent(login),
  title:isLive?(title?'🔴 '+name+' en direct — '+title.slice(0,68)+' | SWAPP':name+' est en direct sur SWAPP'):name+' · SWAPP'};
}
function wrapLabel(text,maxChars=31,maxLines=2){
 const words=clean(text,140).split(/\s+/).filter(Boolean),rows=[];let row='';
 for(const word of words){
  const next=row?row+' '+word:word;
  if(next.length>maxChars&&row){rows.push(row);row=word;}else row=next;
  if(rows.length===maxLines)break;
 }
 if(rows.length<maxLines&&row)rows.push(row);
 if(rows.length===maxLines&&words.join(' ').length>rows.join(' ').length)rows[maxLines-1]=rows[maxLines-1].slice(0,maxChars-2).trimEnd()+'…';
 return rows;
}
function cardMarkup(info,{hasAvatar=false}={}){
 const lines=wrapLabel(info.headline,info.isLive?32:25,2);
 const main=lines.map((line,i)=>'<text x="68" y="'+(236+i*75)+'" fill="#ffffff" font-size="'+(info.isLive?60:78)+'" font-weight="900" letter-spacing="-2" font-family="Arial,DejaVu Sans,sans-serif">'+xml(line)+'</text>').join('');
 const detail=info.game?(info.game.toUpperCase()+'  ·  '):'';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'+
 '<defs><linearGradient id="fade"><stop offset="0" stop-color="#070910" stop-opacity=".96"/><stop offset=".66" stop-color="#070910" stop-opacity=".63"/><stop offset="1" stop-color="#070910" stop-opacity=".1"/></linearGradient>'+
 '<linearGradient id="bottom" x2="0" y2="1"><stop offset="0" stop-color="#02050a" stop-opacity="0"/><stop offset="1" stop-color="#02050a" stop-opacity=".86"/></linearGradient>'+
 '</defs><rect width="1200" height="630" fill="url(#fade)"/><rect y="390" width="1200" height="240" fill="url(#bottom)"/>'+
 '<rect x="60" y="56" width="12" height="44" rx="6" fill="#31d7ed"/>'+
 '<text x="90" y="91" font-size="42" font-weight="900" font-family="Arial,DejaVu Sans,sans-serif" letter-spacing="-1.5" fill="#ffffff">SWAPP</text>'+
 '<circle cx="243" cy="85" r="6" fill="#36dfe9"/>'+
 '<rect x="922" y="56" width="222" height="54" rx="27" fill="'+(info.isLive?'#d62546':'#172637')+'" stroke="'+(info.isLive?'#ff7d8a':'#80a8bc')+'" stroke-opacity=".7"/>'+
 (info.isLive?'<circle cx="947" cy="83" r="8" fill="#fff"/>':'')+
 '<text x="'+(info.isLive?969:947)+'" y="91" font-size="22" font-weight="800" font-family="Arial,DejaVu Sans,sans-serif" fill="#ffffff">'+xml(info.status)+'</text>'+
 main+
 '<text x="'+(hasAvatar?254:70)+'" y="483" font-size="25" font-weight="800" font-family="Arial,DejaVu Sans,sans-serif" fill="#ffffff">'+xml(info.name.toUpperCase())+'</text>'+
 '<text x="'+(hasAvatar?254:70)+'" y="524" font-size="20" font-weight="600" font-family="Arial,DejaVu Sans,sans-serif" fill="#c9d4e3">'+xml(detail+(info.isLive?'STREAMING EN COURS':'CRÉATEUR SUR SWAPP'))+'</text>'+
 '<rect x="860" y="530" width="286" height="66" rx="21" fill="#f5f7fc"/>'+
 '<text x="1003" y="572" fill="#0a101d" font-size="22" font-weight="900" text-anchor="middle" font-family="Arial,DejaVu Sans,sans-serif">'+(info.isLive?'REGARDER LE LIVE':'DÉCOUVRIR LA CHAÎNE')+'</text>'+
 '<rect y="621" width="1200" height="9" fill="#39cde5"/></svg>';
}
async function renderShareCard(creator,info,{sharpImpl=null}={}){
 const sharp=sharpImpl||require('sharp');
 const width=1200,height=630;
 const banner=picture(creator?.banner_url)||picture(creator?.offline_image_url);
 const avatar=picture(creator?.avatar_url);
 let base=sharp({create:{width,height,channels:4,background:'#0b1221'}}).png();
 const layers=[];
 if(banner){
  try{
   const art=await sharp(banner,{limitInputPixels:30000000})
    .resize(width,height,{fit:'cover',position:'attention'}).png().toBuffer();
   layers.push({input:art,left:0,top:0});
  }catch(_){}
 }
 const avatarLayers=[];
 if(avatar){
  try{
   const size=148;
   const mask=Buffer.from('<svg width="148" height="148" xmlns="http://www.w3.org/2000/svg"><circle cx="74" cy="74" r="72" fill="white"/></svg>');
   const face=await sharp(avatar,{limitInputPixels:15000000}).resize(size,size,{fit:'cover',position:'attention'})
    .composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
   avatarLayers.push({input:face,left:68,top:389});
  }catch(_){}
 }
 layers.push({input:Buffer.from(cardMarkup(info,{hasAvatar:avatarLayers.length>0})),left:0,top:0});
 layers.push(...avatarLayers);
 return base.composite(layers).jpeg({quality:86,mozjpeg:true}).toBuffer();
}
module.exports={cardContext,cardMarkup,renderShareCard,picture,wrapLabel};