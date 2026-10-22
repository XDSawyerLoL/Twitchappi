'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {partnerOffersHtml}=require('../assets/swapp-article-extras');
const link=url=>({title:'Voir le jeu',merchant:'Instant Gaming',kind:'affiliate',url});
const crimson='https://www.instant-gaming.com/fr/23880-acheter-crimson-desert-enhanced-charting-the-unknown-pc-mac-steam/?igr=SANSAHD';
const witcher='https://www.instant-gaming.com/fr/1497-acheter-the-witcher-3-wild-hunt/?igr=SANSAHD';
test('rejects a Crimson Desert affiliate offer incorrectly attached to a Cyberpunk article',()=>{
 const html=partnerOffersHtml({game:'Cyberpunk 2077',commercialLinks:[link(crimson)]});
 assert.equal(html,'');
});
test('keeps a genuinely matching affiliate link and preserves referral disclosure',()=>{
 const html=partnerOffersHtml({game:'Crimson Desert',commercialLinks:[link(crimson)]});
 assert.match(html,/23880-acheter-crimson-desert/);
 assert.match(html,/OFFRE INSTANT GAMING · LIEN AFFILIÉ/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
});
test('permits an editorial remaster story to link to its original same-franchise game',()=>{
 const html=partnerOffersHtml({game:'The Witcher 3: Wild Hunt Remastered',commercialLinks:[link(witcher)]});
 assert.match(html,/1497-acheter-the-witcher-3-wild-hunt/);
});
test('does not regress legitimate partner links or general articles without a game identity',()=>{
 const thirdParty={title:'Acheter',merchant:'Partenaire',url:'https://merchant.example/item',kind:'sponsored'};
 assert.match(partnerOffersHtml({game:'Valor Mortis',commercialLinks:[thirdParty]}),/merchant\.example/);
 assert.match(partnerOffersHtml({commercialLinks:[link(crimson)]}),/23880-acheter-crimson-desert/);
});
