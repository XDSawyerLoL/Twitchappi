'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';
const json=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
const fakeTwitch=String.raw`
window.__twitchFixture={playCalls:0,started:false,muted:false};
class FakeTwitchPlayer{
 static READY='ready';static PLAYING='playing';static PLAYBACK_BLOCKED='blocked';static OFFLINE='offline';
 constructor(id,options){
  this.options=options;this.handlers={};window.__twitchFixture.channel=options.channel;
  const host=document.getElementById(id);
  const frame=document.createElement('iframe');frame.title='Fake Twitch SDK video frame';frame.src='about:blank';
  host.append(frame);
  setTimeout(()=>this.emit(FakeTwitchPlayer.READY),0);
 }
 addEventListener(key,callback){this.handlers[key]=callback}
 emit(key){this.handlers[key]?.()}
 setMuted(flag){window.__twitchFixture.muted=flag}
 play(){
  const fixture=window.__twitchFixture;fixture.playCalls++;
  setTimeout(()=>{
   if(window.__blockTwitchAutoStart&&fixture.playCalls===1)this.emit(FakeTwitchPlayer.PLAYBACK_BLOCKED);
   else{fixture.started=true;this.emit(FakeTwitchPlayer.PLAYING)}
  },0);
 }
}
window.Twitch={Player:FakeTwitchPlayer};
`;
async function arrange(page){
 await page.route('https://player.twitch.tv/js/embed/v1.js',
  route=>route.fulfill({status:200,contentType:'text/javascript',body:fakeTwitch}));
 await page.route('**/api/actus',route=>json(route,{articles:[]}));
 await page.route('**/api/swapp-tv/queue/status',
  route=>json(route,{enabled:false,director_enabled:false,on_air:null,waiting:[]}));
 await page.route('**/api/swapp-tv/native-lineup',route=>json(route,{success:true,items:[]}));
 await page.route('**/api/discovery/home-lives?*',route=>json(route,{
  success:true,twitchConfigured:true,
  items:[{login:'valid_live',platform:'twitch',game_name:'Fortnite',display_name:'Live fixture'}]
 }));
}
test('TV mounts Twitch SDK, issues muted play after READY, confirms PLAYING',async({page})=>{
 await arrange(page);
 await page.goto(ORIGIN+'/tv',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#swapp-tv')).toHaveAttribute('data-tv-build','20261113-twitch-events-v12');
 await expect(page.locator('#stv-screen .stv-twitch-sdk-slot iframe')).toBeAttached({timeout:9000});
 await expect.poll(()=>page.evaluate(()=>window.__twitchFixture?.started),{timeout:9000}).toBe(true);
 expect(await page.evaluate(()=>window.__twitchFixture.muted)).toBe(true);
 expect(await page.evaluate(()=>window.__twitchFixture.channel)).toBe('valid_live');
 await expect(page.locator('#stv-watch')).toHaveText('■ ARRÊTER');
 await expect(page.locator('#stv-rotation')).toBeVisible();
 await expect(page.locator('#stv-playback-health')).toBeHidden();
});
test('Twitch autoplay blocked is reported, and a genuine viewer click resumes video',async({page})=>{
 await page.addInitScript(()=>{window.__blockTwitchAutoStart=true});
 await arrange(page);
 await page.goto(ORIGIN+'/tv',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#stv-watch')).toHaveText('▶ LANCER TWITCH',{timeout:9000});
 await expect(page.locator('#stv-playback-health')).toBeVisible();
 await expect(page.locator('#stv-rotation')).toBeHidden();
 await page.locator('#stv-watch').click();
 await expect.poll(()=>page.evaluate(()=>window.__twitchFixture?.started),{timeout:9000}).toBe(true);
 await expect(page.locator('#stv-watch')).toHaveText('■ ARRÊTER');
 await expect(page.locator('#stv-rotation')).toBeVisible();
 await page.locator('#stv-watch').click();
 await expect(page.locator('#stv-rotation')).toBeHidden();
});
