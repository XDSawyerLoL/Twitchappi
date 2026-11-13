'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';
const json=(route,payload)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
async function mocks(page){
 await page.route('**/api/discovery/home-lives?*',route=>json(route,{success:true,items:[
  {platform:'oryon',host_login:'swappnative',host_name:'Créateur SWAPP',viewer_count:6,title:'Session SWAPP',category:'Minecraft'}]}));
 await page.route('**/api/twitch/streams/top?*',route=>json(route,{success:true,items:[
  {user_login:'bigstreamer',user_name:'Grande chaîne',viewer_count:400,title:'En direct',game_name:'VALORANT'}]}));
 await page.route('**/api/categories/top',route=>json(route,{success:true,categories:[
  {id:'1',name:'Minecraft',box_art_url:''},{id:'2',name:'VALORANT',box_art_url:''}]}));
 await page.route('**/api/oryon/discover/find-live?*',route=>json(route,{success:true,items:[
  {platform:'twitch',user_login:'moonrabbit',user_name:'Moon Rabbit',viewer_count:20,game_name:'Minecraft',title:'Petite aventure'},
  {platform:'twitch',user_login:'retrofr',user_name:'Retro FR',viewer_count:45,game_name:'Retro',title:'Live tranquille'}
 ]}));
 await page.route('**/api/twitch/streams/small?*',route=>json(route,{success:true,items:[
  {platform:'twitch',user_login:'chillFR',user_name:'Chill FR',viewer_count:99,game_name:'Stardew Valley',title:'Détente'}
 ]}));
 await page.route('**/api/actus',route=>json(route,{articles:[
  {slug:'nouvel-article-swapp-2026',status:'published',title:'Une annonce officielle SWAPP',
   summary:'Découvrez une annonce gaming publiée sur SWAPP',category:'GAMING',
   publishedAt:'2026-11-13T10:00:00Z',image:{url:'https://blog.playstation.com/article.jpg'}}
 ]}));
}
test('SWAPP root is immersive and presents real news, games and smaller streams',async({page})=>{
 await mocks(page);
 await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
 await expect(page.locator('#nav a[href="/"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('#scl-article-cards .scl-story-card')).toHaveCount(1);
 await expect(page.locator('#scl-small-cards .scl-card')).toHaveCount(4);
 await expect(page.locator('#scl-small-eyebrow')).toHaveText('JUSQU’À 150 SPECTATEURS');
 await expect(page.locator('#scl-small-cards')).toContainText('Moon Rabbit');
 await expect(page.locator('#scl-small-cards')).toContainText('Chill FR');
 await expect(page.locator('#scl-small-cards')).not.toContainText('Grande chaîne');
 await expect(page.locator('#scl-article-cards a.scl-story-link')).toHaveAttribute('href','/actus/nouvel-article-swapp-2026');
 await expect(page.locator('a[href="/?classic=1"]')).toHaveCount(0);
 await expect(page.locator('#nav .navGroup > a').first()).toHaveText('Accueil');
 await expect(page.locator('#nav .navGroup > a').nth(1)).toHaveText('Découvrir');
});
test('published ACTUS magazine displays the former home editorial poster',async({page})=>{
 await mocks(page);
 await page.goto(ORIGIN+'/actus',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#actus .swapp-actus-featured-hero')).toBeVisible({timeout:20000});
 const header=await page.locator('header.top').boundingBox();
 const hero=await page.locator('#actus .swapp-actus-featured-mount').boundingBox();
 expect(header).toBeTruthy();expect(hero).toBeTruthy();
 expect(Math.abs(hero.y-(header.y+header.height))).toBeLessThanOrEqual(3);

 await expect(page.locator('#actus .swapp-actus-featured-overlay strong')).toHaveText('Une annonce officielle SWAPP');
 await expect(page.locator('#actus .swapp-actus-featured-link')).toHaveAttribute('href','/actus/nouvel-article-swapp-2026');
 await expect(page.locator('#actus .swapp-actus-featured-actions a').first()).toHaveAttribute('href','/actus/nouvel-article-swapp-2026');
 await expect(page.locator('#actus .swapp-actus-head')).toContainText('Toutes les actualités SWAPP');
});
test('classic bookmark redirects to the canonical immersive homepage; lab stays noindex',async({page})=>{
 await page.goto(ORIGIN+'/?classic=1',{waitUntil:'domcontentloaded'});
 await expect(page).toHaveURL(ORIGIN+'/');
 await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
 await page.goto(ORIGIN+'/catalogue-test',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
 const robots=await page.locator('meta[name="robots"]').getAttribute('content');
 expect(robots).toContain('noindex');
});
test.describe('phone',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('smaller streams, article cards and homepage remain usable without hover or overflow',async({page})=>{
  await mocks(page);
  await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#mobileNav')).toBeVisible();
  await expect(page.locator('#scl-small-cards .scl-card')).toHaveCount(4);
  await expect(page.locator('#scl-article-cards .scl-story-card')).toHaveCount(1);
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3);
  expect(over).toBe(false);
  await page.locator('[data-scl-filter="article"]').click();
  await expect(page.locator('#scl-articles')).toBeVisible();
  await expect(page.locator('#scl-live')).toBeHidden();
 });
});
