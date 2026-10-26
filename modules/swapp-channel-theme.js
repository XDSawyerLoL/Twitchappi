'use strict';
// Durable public channel appearance. Keep this separate from the banner,
// offline poster and reader's theme preferences.
const cleanInt=(v,fallback,min,max)=>{
 const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
};
const cleanColor=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toLowerCase():'#9b78f4';
const safeImage=(value,login)=>{
 const url=String(value||'');
 const expected='/api/oryon/panel-image/'+encodeURIComponent(String(login||'').toLowerCase())+'/';
 if(!url)return '';
 if(!url.startsWith(expected))throw Error('swapp_channel_background_url_invalid');
 if(!/^[a-f0-9]{64}$/i.test(url.slice(expected.length)))throw Error('swapp_channel_background_url_invalid');
 return url;
};
function normalizeChannelTheme(value,login){
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {
  background_url:safeImage(v.background_url,login),
  background_opacity:cleanInt(v.background_opacity,35,0,70),
  background_blur:cleanInt(v.background_blur,0,0,20),
  background_x:cleanInt(v.background_x,50,0,100),
  background_y:cleanInt(v.background_y,30,0,100),
  accent:cleanColor(v.accent),
  background_fit:v.background_fit==='contain'?'contain':'cover'
 };
}
module.exports={normalizeChannelTheme,safeImage};
