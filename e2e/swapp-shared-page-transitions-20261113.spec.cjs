'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'http://localhost:10000';

test('the immersive homepage, SPA and native TV use one persistent-looking navigation',async({page})=>{
 const urls=['/','/categories','/actus','/tv','/'];
 let firstHeaderHeight=null;
 for(const route of urls){
  await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded'});
  const header=page.locator('header.top');
  await expect(header).toBeVisible();
  const height=await header.evaluate(el=>el.getBoundingClientRect().height);
  if(firstHeaderHeight!==null)expect(Math.abs(height-firstHeaderHeight)).toBeLessThanOrEqual(2);
  firstHeaderHeight=height;
  await expect(page.locator('#nav .navGroup a[href="/"]')).toHaveCount(1);
  await expect(page.locator('#nav .navGroup a[href="/categories"]')).toHaveCount(1);
  await expect(page.locator('#nav .navGroup a[href="/actus"]')).toHaveCount(1);
  await expect(page.locator('#nav .navGroup a[href="/tv"]')).toHaveCount(1);
  await expect(page.locator('link[href*="swapp-route-motion.css?v=20261113-shared-shell-v2"]')).toHaveCount(1);
  if(route==='/'||route==='/tv'){
   await expect(page.locator('body')).toHaveAttribute('data-swapp-shell','shared-native-v2');
  }
 }
});
test('clicking home and using browser Back preserves the modern homepage',async({page})=>{
 await page.goto(ORIGIN+'/categories',{waitUntil:'domcontentloaded'});
 await page.locator('header.top a.brand').click();
 await expect(page).toHaveURL(ORIGIN+'/');
 await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
 await expect(page.locator('body')).toHaveAttribute('data-swapp-shell','shared-native-v2');
 await page.goBack({waitUntil:'domcontentloaded'});
 await expect(page).toHaveURL(ORIGIN+'/categories');
 await expect(page.locator('#nav .navGroup a[href="/categories"]')).toHaveCount(1);
});
test('reduced motion keeps document navigation and disables transition animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
 const rules=await page.locator('link[href*="swapp-route-motion.css"]').count();
 expect(rules).toBe(1);
 await page.goto(ORIGIN+'/tv',{waitUntil:'domcontentloaded'});
 await expect(page.locator('header.top')).toBeVisible();
 await expect(page.locator('body')).toHaveAttribute('data-swapp-shell','shared-native-v2');
});
