'use strict';
// Run only after deploying V21 to Hostinger:
// npm install --no-save @playwright/test@1.56.0
// npx playwright test e2e/swapp-home-no-flash.spec.cjs --reporter=line
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';

for(const [name,width,height,mobile] of [['desktop',1440,900,false],['iPhone',390,844,true]]){
 test.describe('SWAPP V21 first paint '+name,()=>{
  test.use({browserName:'chromium',viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  test('legacy slogan never flashes and a slow article API falls back to lives',async({page},info)=>{
   let allowNews;
   const newsGate=new Promise(resolve=>{allowNews=resolve});
   await page.route('**/api/actus',async route=>{
    await newsGate;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({articles:[]})});
   });
   await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
   const hero=page.locator('#home .homeHeroInner1014');
   await expect(hero).toBeVisible({timeout:20000});
   await expect(page.getByText('Les bons lives se trouvent ici.')).toHaveCount(0);
   await expect(hero).toHaveClass(/swapp-hero-pending/);
   await expect(hero.locator('.swapp-home-hero-placeholder')).toBeVisible();
   const geometry=await page.evaluate(()=>{
    const placeholder=document.querySelector('#home .swapp-home-hero-placeholder');
    const area=placeholder.getBoundingClientRect();
    return {left:area.left,right:area.right,viewport:innerWidth,
     border:getComputedStyle(placeholder).borderTopWidth,
     radius:getComputedStyle(placeholder).borderTopLeftRadius};
   });
   expect(Math.abs(geometry.left)).toBeLessThanOrEqual(2);
   expect(Math.abs(geometry.right-geometry.viewport)).toBeLessThanOrEqual(2);
   expect(geometry.border).toBe('0px');
   expect(geometry.radius).toBe('0px');
   await page.screenshot({path:info.outputPath('pending-hero-'+name+'.png')});
   allowNews();
   await expect(hero).toHaveClass(/swapp-hero-unavailable/,{timeout:20000});
   await expect(page.locator('#home .homeLiveSection1014')).toBeVisible();
   await expect(page.getByText('Les bons lives se trouvent ici.')).toHaveCount(0);
  });
 });
}
