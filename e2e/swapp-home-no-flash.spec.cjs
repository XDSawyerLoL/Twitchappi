'use strict';
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
for(const [name,width,height,mobile] of [['desktop',1440,900,false],['iPhone',390,844,true]]){
 test.describe('SWAPP immersive homepage first paint '+name,()=>{
  test.use({browserName:'chromium',viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  test('new home remains present during slow news API, with no old-home flash',async({page},info)=>{
   let allowNews;
   const gate=new Promise(resolve=>{allowNews=resolve});
   await page.route('**/api/actus',async route=>{
    await gate;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({articles:[]})});
   });
   try{
    await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
    const hero=page.locator('#scl-feature');
    await expect(page.locator('#swapp-catalogue-lab')).toBeVisible();
    await expect(hero).toBeVisible();
    await expect(page.getByText('Les bons lives se trouvent ici.')).toHaveCount(0);
    await expect(page.getByText('Ancien accueil')).toHaveCount(0);
    await expect(page.locator('#scl-feature-title')).toBeVisible();
    const geometry=await page.evaluate(()=>{
     const region=document.querySelector('#scl-feature').getBoundingClientRect();
     return {left:region.left,right:region.right,width:region.width,viewport:innerWidth,
      overflow:document.documentElement.scrollWidth>innerWidth+3};
    });
    expect(geometry.left).toBeGreaterThanOrEqual(-2);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport+2);
    expect(geometry.width).toBeGreaterThan(120);
    expect(geometry.overflow).toBe(false);
    await page.screenshot({path:info.outputPath('immersive-first-paint-'+name+'.png')});
   }finally{allowNews()}
  });
 });
}
