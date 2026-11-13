'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';
const json=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
test('TV plays the first verified SWAPP stream on arrival and rotates after five minutes',async({page})=>{
 await page.clock.install();
 await page.route('**/api/actus',route=>json(route,{articles:[]}));
 await page.route('**/api/swapp-tv/queue/status',route=>json(route,{enabled:false,director_enabled:false,on_air:null,waiting:[]}));
 await page.route('**/api/swapp-tv/native-lineup',route=>json(route,{success:true,items:[
  {login:'creator_one',platform:'swapp',media:'hls',media_verified:true,broadcast_id:'broadcast-1',game:'Fortnite',
   player_url:'/api/oryon/local-relay/creator_one/player'},
  {login:'creator_two',platform:'swapp',media:'hls',media_verified:true,broadcast_id:'broadcast-2',game:'Aion 2',
   player_url:'/api/oryon/local-relay/creator_two/player'}
 ]}));
 await page.route('**/api/oryon/local-relay/*/player',route=>route.fulfill({status:200,contentType:'text/html',
  body:'<!doctype html><title>Verified player fixture</title><video autoplay muted playsinline></video>'}));
 await page.goto(ORIGIN+'/tv',{waitUntil:'domcontentloaded'});
 const player=page.locator('#stv-screen .stv-player-layer iframe');
 await expect(player).toBeAttached({timeout:20000});
 const before=await player.getAttribute('src');
 expect(before).toMatch(/^\/api\/oryon\/local-relay\/creator_(one|two)\/player$/);
 await expect(page.locator('#stv-rotation')).toBeVisible();
 await expect(page.locator('#stv-rotation-clock')).toHaveText(/^0[45]:[0-5]\d$/);
 await page.clock.fastForward(301000);
 await expect(player).toBeAttached();
 await expect.poll(async()=>player.getAttribute('src'),{timeout:5000}).not.toBe(before);
 await expect(page.locator('#stv-rotation-clock')).toHaveText(/^0[45]:[0-5]\d$/);
 await page.locator('#stv-watch').click();
 await expect(page.locator('#stv-rotation')).toBeHidden();
 await page.clock.fastForward(301000);
 await expect(page.locator('#stv-screen .stv-player-layer iframe')).toHaveCount(0);
});
