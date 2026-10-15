'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/swapp-play.js');
const spa=read('index.html');
const shell=read('modules/swapp-news/site-shell.js');
const {community}=require('../modules/swapp-hubs');
const {renderTwitchWatch}=require('../modules/swapp-news/watch');

test('spatial engine is syntactically valid and loaded in SPA and native site shell',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(spa,/\/assets\/swapp-play\.js\?v=20261015-spatial-3/);
 assert.match(shell,/\/assets\/swapp-play\.js\?v=20261015-spatial-3/);
 assert.match(community(),/\/assets\/swapp-play\.js\?v=20261015-spatial-3/);
 assert.match(renderTwitchWatch('streamer'),/\/assets\/swapp-play\.js\?v=20261015-spatial-3/);
});
test('SOCIAL uses its real navigation and locks controller focus to open dialogs',()=>{
 assert.match(js,/\.pulse-sidebar \.pulse-nav-item/);
 assert.match(js,/\.pulse-mobile-nav button/);
 assert.match(js,/function modal\(\)/);
 assert.match(js,/if\(modal\(\)\)\{focusItem\(navigable\(\)\[0\]\);return\}/);
 assert.match(js,/pulse-modal-close/);
});
test('gamepad supports D-pad and thumbsticks with A, B, X and shoulder buttons',()=>{
 assert.match(js,/navigator\.getGamepads/);
 for(const button of ['pressed(0)','pressed(1)','pressed(2)','pressed(4)','pressed(5)','pressed(12)','pressed(13)','pressed(14)','pressed(15)'])assert.ok(js.includes(button),button);
 assert.match(js,/Math\.abs\(axes\[0\]/);
 assert.match(js,/Math\.abs\(axes\[1\]/);
 assert.match(js,/jumpNav\(1\)/);
});
test('accessibility and reduced motion protect text entry and users sensitive to motion',()=>{
 assert.match(js,/prefers-reduced-motion:reduce/);
 assert.match(js,/reduced\(\)/);
 assert.match(js,/isContentEditable/);
 assert.match(js,/e\.isComposing/);
 assert.match(js,/aria-label/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/role.*status/);
});
test('no fake lives and no content sections added to the homepage',()=>{
 assert.match(js,/homeLiveBadge1014/);
 assert.match(js,/classList\.toggle\('swapp-pulse-live',!!el\.querySelector\(badgeSelector\)\)/);
 assert.match(js,/function pickLive\(\)/);
 assert.doesNotMatch(js,/createElement\('section'\)/);
 assert.doesNotMatch(js,/autoplay\s*=/i);
});
test('keyboard and pointer remain first-class interactions',()=>{
 assert.match(js,/altKey&&e\.code==='KeyG'/);
 assert.match(js,/function visible\(el\)/);
 assert.match(js,/pointerdown/);
 assert.match(js,/scrollIntoView/);
 assert.match(js,/ArrowUp/);
});
test('lighting follows focus without blocking clicks or flashing',()=>{
 assert.match(js,/swapp-play-aura/);
 assert.match(js,/pointer-events:none/);
 assert.match(js,/showAura\(el\)/);
 assert.match(js,/scroll.*showAura/);
 assert.match(js,/prefers-reduced-motion: reduce/);
});
test('route changes and open SOCIAL modals preserve safe navigation',()=>{
 assert.match(js,/lastRoute!==location\.pathname/);
 assert.match(js,/function closeOverlay\(\)/);
 assert.match(js,/if\(closeOverlay\(\)\)return/);
 assert.match(js,/const dialog=modal\(\),list=/);
});
