'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const script=read('assets/swapp-home-motion.js');

function mockedPlayer({valid=true,mobile=false,reduced=false,saveData=false,fail=false}={}){
 const classes=new Set(),requests=[],timers=[],players=[],seeks=[];
 const makeNode=name=>({
  tagName:name.toUpperCase(),children:[],style:{},className:'',
  append(node){this.children.push(node)},setAttribute(){},remove(){this.removed=true}
 });
 const poster={
  complete:true,naturalWidth:1400,
  after(node){this.next=node},
  addEventListener(){}
 };
 const tile={
  isConnected:true,
  querySelector:q=>q==='img'?poster:null,
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
  closest:q=>q==='#home.view.active'?{}:null
 };
 const window={
  SwappArticleExtras:{trailerId:url=>valid&&url==='https://www.youtube.com/watch?v=Z9SaRLSibak'?'Z9SaRLSibak':null},
  matchMedia:q=>({matches:q.includes('min-width')?!mobile:q.includes('reduced-motion')?reduced:false}),
  addEventListener(){},removeEventListener(){},
  YT:{
   PlayerState:{PLAYING:1,PAUSED:2,ENDED:0},
   Player:class{
    constructor(target,options){
     players.push({target,options});
     const player={mute(){},seekTo(seconds,allowSeekAhead){seeks.push([seconds,allowSeekAhead])},playVideo(){
      if(!fail)options.events.onStateChange({data:1,target:player});
     },pauseVideo(){},destroy(){}};
     if(fail)options.events.onError({data:5});
     else options.events.onReady({target:player});
    }
   }
  }
 };
 const document={
  visibilityState:'visible',
  createElement:makeNode,
  getElementById:()=>null,
  head:{appendChild:node=>requests.push(node)},
  addEventListener(){},removeEventListener(){}
 };
 const ctx={window,document,navigator:{connection:{saveData}},location:{origin:'https://swapp.tv'},
  setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}};
 vm.runInNewContext(script,ctx,{timeout:2000});
 const attached=window.SwappHomeMotion.attach(tile,{trailerUrl:'https://www.youtube.com/watch?v=Z9SaRLSibak'});
 return {attached,poster,tile,classes,requests,timers,players,seeks};
}

test('video never loads for an unverified trailer, mobile device, reduced-motion or Save-Data',()=>{
 for(const config of [{valid:false},{mobile:true},{reduced:true},{saveData:true}]){
  const v=mockedPlayer(config);
  assert.equal(v.attached,false);
  assert.equal(v.requests.length,0);
  assert.equal(v.players.length,0);
  assert.equal(v.poster.next,undefined);
 }
});

test('matching desktop trailer keeps the poster until real muted playback begins',async()=>{
 const v=mockedPlayer();
 assert.equal(v.attached,true);
 assert.ok(v.poster.next);
 assert.equal(v.poster.next.className,'swapp-home-motion');
 assert.equal(v.classes.has('swapp-home-motion-playing'),false,'no movie before ready');
 assert.equal(v.players.length,0,'no video network until after image and delay');
 assert.equal(v.timers.length,1);
 v.timers.shift()();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(v.players.length,1);
 const config=v.players[0].options;
 assert.equal(config.videoId,'Z9SaRLSibak');
 assert.equal(config.host,'https://www.youtube-nocookie.com');
 assert.equal(config.playerVars.mute,1);
 assert.equal(config.playerVars.controls,0);
 assert.equal(config.playerVars.loop,1);
 assert.equal(config.playerVars.start,10);
 assert.ok(v.seeks.some(([sec,enabled])=>sec===10&&enabled===true),'player seeks to 0:10 before play');
 assert.equal(v.classes.has('swapp-home-motion-playing'),true);
});

test('iframe/player errors remove only the video overlay and leave the cover intact',async()=>{
 const v=mockedPlayer({fail:true});
 assert.equal(v.attached,true);
 v.timers.shift()();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(v.players.length,1);
 assert.equal(v.poster.next.removed,true);
 assert.equal(v.classes.has('swapp-home-motion-playing'),false);
 assert.equal(v.poster.naturalWidth,1400);
});

test('cleaner homepage has no legacy first-paint masking and mounts cinematic client in order',()=>{
 const html=read('index.html');
 const boot=html.slice(html.indexOf('<style id="swapp-boot-css">'),html.indexOf('</style>',html.indexOf('<style id="swapp-boot-css">')));
 assert.doesNotMatch(boot,/#home\.view\.active > :not\(\.swappHome1014\)/);
 assert.doesNotMatch(boot,/\.homeHeroCopy1014\{display:none!important\}/);
 assert.doesNotMatch(boot,/\.homeHeroInner1014:not\(\.swapp-feature-ready\)/);
 const helper='swapp-home-motion.js?v=20261018-hero-single-v24';
 assert.match(html,/swapp-home-news\.js\?v=20261018-hero-single-v24/);
 assert.ok(html.includes(helper));
 assert.ok(html.indexOf(helper)<html.indexOf('swapp-home-news.js?v=20261018-hero-single-v24'));
 assert.match(read('assets/swapp-home-news.js'),/SwappHomeMotion\?\.attach\?\.\(tile,feature\)/);
});

test('hero remains image first and never animates for motion-sensitive visitors',()=>{
 const css=read('assets/swapp-game-journey.css');
 const part=css.slice(css.indexOf('SWAPP V22 — cinematic trailer overlay'));
 assert.ok(part.length>1700);
 assert.match(part,/\.swapp-home-motion-playing/);
 assert.match(part,/opacity:0!important/);
 assert.match(part,/opacity:1!important/);
 assert.ok(part.includes('swapp-home-motion-playing > img{'));
 assert.match(part,/visibility:hidden!important/);
 assert.doesNotMatch(part,/opacity:\.88!important/);
 assert.match(part,/\(prefers-reduced-motion:reduce\)/);
 assert.match(part,/\(pointer:coarse\)/);
 assert.match(part,/z-index:3!important/);
 assert.match(part,/pointer-events:none!important/);
 assert.match(part,/width:max\(100cqw,177\.778cqh\)!important/);
 assert.match(part,/height:max\(100cqh,56\.25cqw\)!important/);
 assert.doesNotMatch(part,/width:118%!important|height:118%!important/);
 assert.match(read('tools/swapp-release.js'),/'assets\/swapp-home-motion\.js'/);
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/swapp-home-motion\.js\?v=20261018-hero-single-v24/);
 assert.match(smoke,/youtube-nocookie\.com/);
});
