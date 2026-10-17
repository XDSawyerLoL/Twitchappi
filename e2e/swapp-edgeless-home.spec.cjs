'use strict';
// Verify after Hostinger has deployed V19. No GitHub Actions required.
// npm install --no-save @playwright/test@1.56.0
// npx playwright test e2e/swapp-edgeless-home.spec.cjs --reporter=line
const {test,expect}=require('@playwright/test');
const ORIGIN=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
for(const device of [
 {name:'desktop',viewport:{width:1920,height:1080},isMobile:false,hasTouch:false},
 {name:'iPhone',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
]){
 test.describe('SWAPP V19 edgeless hero '+device.name,()=>{
  test.use({browserName:'chromium',viewport:device.viewport,isMobile:device.isMobile,hasTouch:device.hasTouch});
  test('published hero really reaches both window edges and fades to the page',async({page},testInfo)=>{
   await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
   const hero=page.locator('#home .homeHeroInner1014.swapp-feature-ready > .swapp-home-hero-feature');
   await expect(hero).toBeVisible({timeout:25000});
   const image=hero.locator('img');
   await expect(image).toBeVisible();
   const snapshot=await page.evaluate(()=>{
    const tile=document.querySelector('#home .homeHeroInner1014.swapp-feature-ready > .swapp-home-hero-feature');
    const image=tile.querySelector('img');
    const actions=document.querySelector('#home .homeHeroInner1014.swapp-feature-ready > .swapp-home-feature-bridge');
    const rect=tile.getBoundingClientRect(),controls=actions.getBoundingClientRect();
    const tileCss=getComputedStyle(tile),artCss=getComputedStyle(image);
    const mask=artCss.webkitMaskImage||artCss.maskImage;
    return {
     vw:innerWidth,left:rect.left,right:rect.right,tileWidth:rect.width,
     controlsLeft:controls.left,controlsRight:controls.right,
     borderRadius:tileCss.borderTopLeftRadius,background:tileCss.backgroundColor,
     mask,overflow:document.documentElement.scrollWidth>innerWidth+1,
     links:[...actions.querySelectorAll('a')].map(a=>a.textContent.trim())
    };
   });
   expect(Math.abs(snapshot.left)).toBeLessThanOrEqual(2);
   expect(Math.abs(snapshot.right-snapshot.vw)).toBeLessThanOrEqual(2);
   expect(Math.abs(snapshot.controlsLeft)).toBeLessThanOrEqual(2);
   expect(Math.abs(snapshot.controlsRight-snapshot.vw)).toBeLessThanOrEqual(2);
   expect(snapshot.borderRadius).toBe('0px');
   expect(snapshot.background).toBe('rgba(0, 0, 0, 0)');
   expect(snapshot.mask).toContain('gradient');
   expect(snapshot.overflow).toBe(false);
   for(const action of ['Lire l’article','Voir les lives','En discuter'])
    expect(snapshot.links).toContain(action);
   await page.screenshot({path:testInfo.outputPath(device.name+'-edgeless-home.png')});
  });
 });
}
