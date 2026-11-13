'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';
const json=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
test('TV starts an actual streamer automatically without waiting for ACTUS or the MySQL queue',async({page})=>{
 let releaseSlowRequests;
 const blocked=new Promise(resolve=>{releaseSlowRequests=resolve});
 const hold=async(route,body)=>{await blocked;await json(route,body)};
 await page.route('**/api/actus',route=>hold(route,{articles:[]}));
 await page.route('**/api/swapp-tv/queue/status',
  route=>hold(route,{enabled:false,director_enabled:false,on_air:null,waiting:[]}));
 await page.route('**/api/swapp-tv/native-lineup',route=>json(route,{success:true,items:[]}));
 await page.route('**/api/discovery/home-lives?*',route=>json(route,{
  success:true,twitchConfigured:true,
  items:[{login:'valid_live',platform:'twitch',game_name:'Fortnite',display_name:'Live réel simulé'}]
 }));
 try{
  await page.goto(ORIGIN+'/tv',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#swapp-tv')).toHaveAttribute('data-tv-build','20261113-liveboot-v11');
  const frame=page.locator('#stv-screen .stv-player-layer iframe');
  await expect(frame).toBeAttached({timeout:8000});
  const url=await frame.getAttribute('src');
  expect(url).toContain('channel=valid_live');
  expect(url).toContain('autoplay=true');
  expect(url).toContain('muted=true');
  await expect(page.locator('#stv-rotation')).toBeVisible();
  await expect(page.locator('#stv-watch')).toHaveText('■ ARRÊTER');
 }finally{releaseSlowRequests()}
});
