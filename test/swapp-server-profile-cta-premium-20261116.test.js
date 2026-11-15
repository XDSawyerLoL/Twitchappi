'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const {renderProfile}=require('../modules/swapp-servers-profile');
const server={id:'a'.repeat(32),slug:'swapp-communaute-aaaa',name:'SWAPP Multigaming',
 game:'Discord / Multigaming',region:'France',description:'Jouer ensemble et découvrir des communautés.'};
const render=({outbound='https://discord.gg/serveur-exemple',canEdit=true}={})=>
 renderProfile({server,outbound,canEdit,votes:26,stats:{monthClicks:14}});
function actionMarkup(html,selector){
 const anchor=selector==='hero'?'<div class="ss-pro-actions" id="voter"':'<div class="ss-pro-side-actions"';
 const start=html.indexOf(anchor);
 assert.ok(start>=0,selector+' action group missing');
 const end=html.indexOf('</div>',start); // next closing div is the action group: labels use spans.
 assert.ok(end>start,selector+' action group malformed');
 return html.slice(start,end);
}
test('join is the first and only prominent action in the hero and sidebar',()=>{
 const html=render();
 for(const target of ['hero','sidebar']){
  const actions=actionMarkup(html,target);
  const join=actions.indexOf('ss-pro-visit');
  const vote=actions.indexOf('ss-pro-vote');
  const edit=actions.indexOf('ss-pro-owner-edit');
  assert.ok(join>=0&&join<vote&&vote<edit,target+' priority order');
  assert.match(actions,/Rejoindre la communauté/);
  assert.match(actions,/Soutenir sa visibilité/);
  assert.match(actions,/data-ss-vote-id="a{32}"/);
  assert.match(actions,/data-ss-outbound-id="a{32}"/);
  assert.match(actions,/href="\/serveurs\/gerer\/swapp-communaute-aaaa"/);
 }
 assert.equal((html.match(/data-ss-outbound-id=/g)||[]).length,2);
 assert.equal((html.match(/data-ss-vote-id=/g)||[]).length,2);
});
test('profiles without external links do not render a fake join CTA',()=>{
 const html=render({outbound:'',canEdit:false});
 assert.doesNotMatch(html,/ss-pro-visit/);
 assert.doesNotMatch(html,/ss-pro-owner-edit/);
 assert.equal((html.match(/data-ss-vote-id=/g)||[]).length,2);
});
test('CTAs have clear accessible text, decorative icons and retain safe URLs',()=>{
 const html=render();
 assert.match(html,/ss-pro-cta-symbol" aria-hidden="true"/);
 assert.match(html,/ss-pro-cta-arrow" aria-hidden="true"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer nofollow" data-ss-outbound-id/);
 assert.match(html,/Gérer ma communauté/);
 assert.match(html,/Ouvrir le lien du serveur/);
});
test('CTA CSS overrides legacy saturated buttons without affecting directory or edit form',()=>{
 const css=read('assets/swapp-servers.css');
 const marker='V23 — refined server profile actions';
 const block=css.slice(css.indexOf(marker));
 assert.ok(block.length>4000);
 for(const selector of ['ss-pro-hero-footer .ss-pro-actions','ss-pro-side-actions','ss-pro-visit',
  'ss-pro-vote','ss-pro-owner-edit','ss-pro-cta-label','ss-pro-cta-arrow'])
  assert.ok(block.includes(selector),selector);
 assert.match(block,/linear-gradient\(118deg,#c4f9f1/);
 assert.match(block,/--ss-cta-pink:#f78da4/);
 assert.match(block,/width:auto!important/);
 assert.match(block,/@media\(max-width:700px\)/);
 assert.match(block,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(block,/:focus-visible/);
 assert.doesNotMatch(block,/\.ss-directory|\.ss-owner-manage-card/);
});
test('cache busted on all routes sharing profile stylesheet',()=>{
 const backend=read('modules/swapp-servers.js');
 assert.ok((backend.match(/swapp-servers\.css\?v=20261116-cta-premium-v23/g)||[]).length>=3);
 assert.doesNotMatch(backend,/20261116-flat-profile-v22/);
});
