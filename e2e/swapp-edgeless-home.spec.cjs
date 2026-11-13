'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
for(const device of [
 {name:'desktop',viewport:{width:1920,height:1080},isMobile:false,hasTouch:false},
 {name:'iPhone',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
]){
 test.describe('SWAPP cinematic catalogue layout '+device.name,()=>{
  test.use({browserName:'chromium',viewport:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch});
  test('immersive hero is readable, responsive and never creates horizontal scrolling',async({page},testInfo)=>{
   await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
   const hero=page.locator('#scl-feature');
   await expect(hero).toBeVisible();
   await expect(hero.locator('#scl-feature-title')).toBeVisible();
   const snapshot=await page.evaluate(()=>{
    const tile=document.querySelector('#scl-feature');
    const title=document.querySelector('#scl-feature-title');
    const area=tile.getBoundingClientRect(),heading=title.getBoundingClientRect();
    return {vw:innerWidth,left:area.left,right:area.right,width:area.width,
     headingWidth:heading.width,overflow:document.documentElement.scrollWidth>innerWidth+3,
     navFirst:[...document.querySelectorAll('#nav .navGroup > a')].slice(0,2).map(a=>a.textContent.trim())};
   });
   expect(snapshot.left).toBeGreaterThanOrEqual(-2);
   expect(snapshot.right).toBeLessThanOrEqual(snapshot.vw+2);
   expect(snapshot.width).toBeGreaterThan(120);
   expect(snapshot.headingWidth).toBeGreaterThan(60);
   expect(snapshot.overflow).toBe(false);
   expect(snapshot.navFirst).toEqual(['Accueil','Découvrir']);
   await page.screenshot({path:testInfo.outputPath(device.name+'-cinematic-home.png')});
  });
 });
}
