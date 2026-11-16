'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {renderProfile}=require('../modules/swapp-servers-profile');
const {renderCommunityPanels}=require('../modules/swapp-servers-community');
const server={
 id:'a'.repeat(32),slug:'serveur-swapp',name:'Communauté SWAPP',
 game:'Discord / Multigaming',region:'France',language:'fr',
 tags:'FR, Coopération',created_at:'2026-11-15T12:00:00Z',
 description:'Un serveur de jeu multigaming',twitch_url:'https://www.twitch.tv/vnhz'
};
const profile=()=>renderProfile({server,votes:12,rank:2,
 stats:{allVotes:45,allClicks:30,monthClicks:8,history:{}},
 reviewSummary:{count:1,staff:4,atmosphere:5,availability:4},
 communityPanels:renderCommunityPanels(server),
 outbound:'https://discord.gg/example',canEdit:true});
test('practical information displays static facts without repeating all measured metrics',()=>{
 const html=profile();
 const facts=html.match(/<dl class="ss-pro-facts">([\s\S]*?)<\/dl>/)?.[1];
 assert.ok(facts,'semantic definition list retained');
 for(const label of ['Jeu / catégorie','Pays / région','Langue','Ajouté sur SWAPP','Catégories'])
  assert.ok(facts.includes(label),label);
 for(const duplicate of ['Votes du mois','Votes cumulés','Clics enregistrés','Avis des membres'])
  assert.ok(!facts.includes(duplicate),'duplicate '+duplicate);
 assert.match(html,/<section id="statistiques"/);
 assert.match(html,/data-ss-profile-votes/);
 assert.match(html,/<section id="avis"/);
});
test('sidebar is a single action area, with share inside it and working hooks retained',()=>{
 const html=profile();
 assert.equal((html.match(/class="ss-pro-aside-card"/g)||[]).length,1);
 assert.match(html,/class="ss-pro-share-inline"/);
 assert.match(html,/data-ss-share/);
 assert.match(html,/data-ss-vote-id=/);
 assert.match(html,/data-ss-outbound-id=/);
 assert.match(html,/ss-pro-owner-edit/);
 assert.match(html,/ss-pro-social-links/);
 assert.match(html,/href="#informations"/);
 assert.match(html,/href="#directs"/);
});
test('lives list appears before concise verification disclaimer',()=>{
 const community=renderCommunityPanels(server);
 assert.ok(community.indexOf('id="ss-community-lives"')<community.indexOf('ss-community-explainer'));
 assert.match(community,/Seuls les directs vérifiés/);
 assert.doesNotMatch(community,/Seules les chaînes associées et réellement présentes/);
 assert.match(community,/id="ss-lfg-form"/);
 assert.match(community,/id="ss-creator-actions"/);
});
test('CSS flattens only server profiles, not creation or directory UI',()=>{
 const css=read('assets/swapp-servers.css');
 const flat=css.slice(css.indexOf('SERVEUR + V22 — editorial detail page'));
 assert.ok(flat.length>3000);
 assert.match(flat,/\.ss-pro \.ss-pro-primary>\.ss-pro-panel/);
 assert.match(flat,/background:transparent!important/);
 assert.match(flat,/border-radius:0!important/);
 assert.match(flat,/\.ss-pro \.ss-pro-facts>div/);
 assert.match(flat,/\.ss-pro \.ss-pro-review-breakdown/);
 assert.match(flat,/\.ss-pro \.ss-pro-aside \.ss-pro-aside-card/);
 assert.doesNotMatch(flat,/\.ss-directory|\.ss-owner-manage-card/);
 const community=read('assets/swapp-servers-community.css');
 assert.match(community,/people are rows, not cards inside cards/);
 assert.match(community,/\.ss-pro \.ss-community-offair/);
 assert.match(community,/\.ss-pro \.ss-community-live/);
 assert.match(community,/@media\(max-width:480px\)/);
});
test('all stylesheet references are refreshed and old profile cache is not used',()=>{
 const backend=read('modules/swapp-servers.js');
 assert.match(backend,/swapp-servers\.css\?v=20261116-category-hero-v24/);
 assert.match(backend,/swapp-servers-community\.css\?v=20261116-lfg-premium-v4/);
 assert.doesNotMatch(backend,/20261116-compact-cards-v21/);
 assert.doesNotMatch(backend,/20261115-community-v2/);
});
