'use strict';
// Real Chromium mobile checks. Run only AFTER the matching Hostinger deploy:
// npm install --no-save @playwright/test@1.56.0
// npx playwright install chromium
// npx playwright test e2e/swapp-mobile.spec.cjs --reporter=line
const {test,expect}=require('@playwright/test');

test.use({
 browserName:'chromium',
 viewport:{width:390,height:844},
 isMobile:true,
 hasTouch:true
});
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';

test('SOCIAL navigation stays beneath SWAPP when the page scrolls',async({page},testInfo)=>{
 await page.goto(ORIGIN+'/communaute',{waitUntil:'domcontentloaded'});
 const shell=page.locator('.swapp-social-sticky-stack');
 await expect(shell).toBeVisible();
 const header=page.locator('header.top');
 await expect(header).toBeVisible();
 const position=await shell.evaluate(el=>getComputedStyle(el).position);
 expect(position).toBe('fixed');
 await page.evaluate(()=>{
  // Ensure a measurable long-scroll scenario even when the live feed is empty.
  const filler=document.createElement('div');
  filler.style.height='3000px';
  filler.setAttribute('data-e2e-scroll-filler','1');
  document.querySelector('main.pulse-main').append(filler);
 });
 await page.evaluate(()=>window.scrollTo(0,1200));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 const geometry=await page.evaluate(()=>{
  const header=document.querySelector('.site-header').getBoundingClientRect();
  const stack=document.querySelector('.swapp-social-sticky-stack').getBoundingClientRect();
  return {siteBottom:header.bottom,stackTop:stack.top,stackBottom:stack.bottom,screenHeight:innerHeight};
 });
 expect(Math.abs(geometry.stackTop-geometry.siteBottom)).toBeLessThanOrEqual(5);
 expect(geometry.stackTop).toBeGreaterThanOrEqual(0);
 expect(geometry.stackBottom).toBeLessThan(geometry.screenHeight*0.6);
 await expect(page.locator('.pulse-mobile-nav')).toBeVisible();
 const reserved=await page.locator('.swapp-social-mobile-offset').evaluate(el=>el.getBoundingClientRect().height);
 expect(reserved).toBeGreaterThan(48);
 expect(reserved).toBeLessThan(280);
 await page.locator('.pulse-mobile-nav button[data-view="explore"]').click();
 await expect(page.locator('#feed-tabs')).toBeHidden();
 const newReserved=await page.locator('.swapp-social-mobile-offset').evaluate(el=>el.getBoundingClientRect().height);
 expect(newReserved).toBeLessThan(reserved);
 await page.screenshot({path:testInfo.outputPath('social-scroll.png')});
});

test('SOCIAL Explorer exposes mobile search and keeps global SWAPP navigation',async({page},testInfo)=>{
 await page.goto(ORIGIN+'/communaute',{waitUntil:'domcontentloaded'});
 const mobileNav=page.locator('#mobileNav');
 await expect(mobileNav).toBeVisible();
 const explore=page.locator('.pulse-mobile-nav button[data-view="explore"]');
 await expect(explore).toBeVisible();
 await explore.click();
 const search=page.locator('#social-mobile-query');
 await expect(search).toBeVisible();
 await expect(page.locator('form#social-mobile-search-form')).toBeVisible();
 await search.fill('Elden Ring');
 await page.locator('#social-mobile-search-form button[type="submit"]').click();
 await expect(search).toBeVisible();
 await expect(mobileNav).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('social-explore.png')});
});

test('Découvrir keeps the live cover readable and the Watch action easy to tap',async({page},testInfo)=>{
 await page.goto(ORIGIN+'/decouvrir',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#discover .v4Page')).toBeVisible({timeout:20000});
 const hero=page.locator('#discover #v4SwipeCard');
 const actions=page.locator('#discover .v4Actions');
 const watch=actions.locator('.v4Btn.primary');
 await expect(hero).toBeVisible();
 await expect(watch).toBeVisible();
 const heroRole=await hero.getAttribute('role');
 expect(heroRole).toBe('button');
 const cardName=await hero.getAttribute('aria-label');
 expect(cardName).toMatch(/Regarder le live/);
 const layout=await page.evaluate(()=>{
  const actions=document.querySelector('#discover .v4Actions').getBoundingClientRect();
  const watch=document.querySelector('#discover .v4Actions .v4Btn.primary').getBoundingClientRect();
  const hero=document.querySelector('#discover #v4SwipeCard').getBoundingClientRect();
  return {
   actionsWidth:actions.width,watchWidth:watch.width,watchHeight:watch.height,
   heroWidth:hero.width,viewportWidth:document.documentElement.clientWidth
  };
 });
 expect(layout.watchWidth).toBeGreaterThan(layout.actionsWidth*0.80);
 expect(layout.watchHeight).toBeGreaterThanOrEqual(44);
 expect(layout.heroWidth).toBeLessThanOrEqual(layout.viewportWidth+2);
 await page.screenshot({path:testInfo.outputPath('discover-mobile-actions.png')});
});
