'use strict';
// Optional browser validation after deployment or on a local SWAPP server.
// npm install --no-save @playwright/test@1.56.0 && npx playwright install chromium
// npx playwright test e2e/swapp-catalogue-lab.spec.cjs
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';
const headers={'Content-Type':'application/json'};
function fixture(){
 return {
  home:{success:true,items:[{platform:'oryon',host_login:'swapper123',host_name:'Swapper 123',category:'Minecraft',title:'Survie avec la communauté',viewer_count:8,thumbnail_url:''}]},
  top:{success:true,items:[{user_login:'playerone',user_name:'Player One',title:'Match tactique',game_name:'VALORANT',viewer_count:33,thumbnail_url:''}]},
  games:{success:true,categories:[{id:'42',name:'Minecraft',box_art_url:''},{id:'43',name:'VALORANT',box_art_url:''}]},
  gameLives:{success:true,items:[]},
  articles:{articles:[{slug:'article-test-swapp-2026',title:'Le nouveau catalogue SWAPP',summary:'Un article rédigé sur SWAPP.',category:'GAMING',publishedAt:'2026-11-13T10:00:00Z',status:'published',thumbnail:{url:'https://blog.playstation.com/cover.jpg'}}]}
 };
}
async function open(page){
 const data=fixture();
 await page.route('**/api/discovery/home-lives?*',route=>route.fulfill({status:200,headers,body:JSON.stringify(data.home)}));
 await page.route('**/api/twitch/streams/top?*',route=>route.fulfill({status:200,headers,body:JSON.stringify(data.top)}));
 await page.route('**/api/categories/top',route=>route.fulfill({status:200,headers,body:JSON.stringify(data.games)}));
 await page.route('**/api/actus',route=>route.fulfill({status:200,headers,body:JSON.stringify(data.articles)}));
 await page.route('**/api/discovery/game-lives?*',route=>route.fulfill({status:200,headers,body:JSON.stringify(data.gameLives)}));
 await page.goto(ORIGIN+'/catalogue-test',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#scl-live-cards .scl-card')).toHaveCount(2);
 await expect(page.locator('#scl-game-cards .scl-card')).toHaveCount(2);
 await expect(page.locator('#scl-article-cards .scl-story-card')).toHaveCount(1);
}
test('real shelves, hover preview, modal and game-follow flow work without leaving SWAPP',async({page})=>{
 await open(page);
 await expect(page.locator('#scl-feature-title')).toContainText('Swapper 123');
 await expect(page.locator('#scl-feature-dots button')).toHaveCount(4);
 await page.locator('#scl-live-cards .scl-card').nth(1).hover();
 await expect(page.locator('#scl-feature-title')).toContainText('Swapper 123'); // cards no longer hijack the main banner
 await expect(page.locator('#scl-live-cards .scl-card').nth(1).locator('.scl-card-action-row')).toBeVisible();
 await page.locator('#scl-feature-next').click();
 await expect(page.locator('#scl-feature-title')).toContainText('Player One');
 await page.locator('#scl-feature-prev').click();
 await expect(page.locator('#scl-feature-title')).toContainText('Swapper 123');
 await page.locator('#scl-feature-next').click();
 await page.locator('#scl-feature-preview').click();
 await expect(page.locator('#scl-dialog')).toBeVisible();
 await expect(page.locator('iframe.scl-preview-frame')).toHaveAttribute('src',/player\.twitch\.tv.*channel=playerone.*muted=true/);
 await page.locator('#scl-dialog-close').click();
 await expect(page.locator('iframe.scl-preview-frame')).toHaveCount(0);
 await page.locator('#scl-game-cards .scl-card').first().getByRole('button',{name:/Suivre ce jeu/}).click();
 await expect(page.locator('#scl-favorite-cards .scl-card')).toHaveCount(1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('swapp:followed-games:v1')||'null'));
 expect(saved.version).toBe(1);
 expect(saved.games.some(g=>g.slug==='minecraft')).toBe(true);
});
test('published ACTUS rail opens only native SWAPP articles and shares without navigating',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__sharedArticle=value}},configurable:true});
 });
 await open(page);
 const card=page.locator('#scl-article-cards .scl-story-card').first();
 await expect(card.getByRole('link',{name:/Lire sur SWAPP/})).toHaveAttribute('href','/actus/article-test-swapp-2026');
 await card.getByRole('button',{name:/Partager/}).click();
 await expect(card.locator('.scl-story-share-feedback')).toContainText('Lien SWAPP copié');
 expect(await page.evaluate(()=>window.__sharedArticle)).toBe(ORIGIN+'/actus/article-test-swapp-2026');
 expect(new URL(page.url()).pathname).toBe('/catalogue-test');
 await page.locator('[data-scl-filter="article"]').click();
 await expect(page.locator('#scl-articles')).toBeVisible();
 await expect(page.locator('#scl-live')).toBeHidden();
 await page.locator('[data-scl-filter="all"]').click();
 await expect(page.locator('#scl-live')).toBeVisible();
});
test('native streamer can be saved, replayed from favorites, and never classified as a video game',async({page})=>{
 await open(page);
 const live=page.locator('#scl-live-cards .scl-card').first();
 await live.getByRole('button',{name:/Ajouter Swapper 123 aux favoris/}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('oryon_v4_likes')||'[]'));
 expect(saved.some(x=>x.platform==='oryon'&&x.login==='swapper123')).toBe(true);
 await expect(page.locator('#scl-favorite-cards .scl-card')).toHaveCount(1);
 const link=live.getByRole('link',{name:'Regarder'});
 await expect(link).toHaveAttribute('href','/swapper123');
});
test.describe('mobile layout',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('keeps rails and one shared uppercase menu, without horizontal viewport overflow',async({page})=>{
  await open(page);
  await expect(page.locator('header.top')).toBeVisible();
  await expect(page.locator('#mobileNav')).toBeVisible();
  await expect(page.locator('#scl-feature')).toBeVisible();
  const nav=page.locator('#mobileNav > a');
  await expect(nav).toHaveCount(4);
  const casing=await nav.first().evaluate(el=>getComputedStyle(el).textTransform);
  expect(casing).toBe('uppercase');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3);
  expect(overflow).toBe(false);
  await page.locator('#scl-game-cards .scl-card').first().getByRole('button',{name:/Suivre ce jeu/}).click();
  await expect(page.locator('#scl-favorite-cards .scl-card')).toHaveCount(1);
 });
});
