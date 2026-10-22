'use strict';
// The server owns the presentation model: untrusted client values are validated.
// Older SWAPP panels without layout metadata remain readable.
const SIZE=['hero','large','medium','small'];
const RATIO=['auto','1:1','4:5','3:4','16:9','21:9','3:2'];
const FIT=['contain','cover'];
const STYLE=['image','overlay'];
const clamp=(n,fallback=50)=>Number.isFinite(Number(n))?Math.min(100,Math.max(0,Math.round(Number(n)))):fallback;
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
function normalizePanel(v,index=0){
 const panel=v&&typeof v==='object'?v:{};
 const image=String(panel.image_url||panel.image||'').trim().slice(0,1750000);
 if(!image)return null;
 return {
  image_url:image,
  title:String(panel.title||'').trim().slice(0,60),
  description:String(panel.description||panel.text||'').trim().slice(0,220),
  link_url:String(panel.link_url||panel.url||panel.href||'').trim().slice(0,1000),
  size:choice(panel.size,SIZE,index<2?'large':'medium'),
  ratio:choice(panel.ratio,RATIO,'auto'),
  fit:choice(panel.fit,FIT,'contain'),
  focal_x:clamp(panel.focal_x),focal_y:clamp(panel.focal_y),
  style:choice(panel.style,STYLE,'image')
 };
}
function normalizePanels(input){
 return (Array.isArray(input)?input:[]).slice(0,8)
  .map(normalizePanel).filter(Boolean);
}
module.exports={SIZE,RATIO,FIT,STYLE,normalizePanel,normalizePanels};
