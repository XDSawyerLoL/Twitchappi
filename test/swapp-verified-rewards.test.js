'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {registerSeoRoutes,verifiedIndexedGame}=require('../modules/swapp-seo');
const {renderGameIndex,renderGamePage,renderMyGames,gameHubs}=require('../modules/swapp-game-pages');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const games=[
 {slug:'gta-news-1',game:'GTA 6',title:'GTA 6 : les infos officielles',summary:'Informations vérifiées',status:'published'},
 {slug:'gta-news-2',game:'Grand Theft Auto VI',title:'Analyse GTA VI',summary:'Analyse et contexte',status:'published'},
 {slug:'hidden-game-1',game:'Imaginary Game',title:'Contenu non public',summary:'Ne doit pas compter',status:'draft'},
 {slug:'only-one-game',game:'Hades II',title:'Une seule publication',summary:'Un seul article',status:'published'}
];
test('reward eligibility uses real published multi-article game hubs',async()=>{
 const app={get(){}};
 registerSeoRoutes(app,{getPublished:async()=>games});
 const official=await verifiedIndexedGame('grand-theft-auto-vi');
 assert.equal(official.slug,'grand-theft-auto-vi');
 assert.equal(official.game,'Grand Theft Auto VI');
 assert.equal(await verifiedIndexedGame('hades-ii'),null);
 assert.equal(await verifiedIndexedGame('imaginary-game'),null);
 assert.equal(await verifiedIndexedGame('../../secret'),null);
});
test('outage never invents reward-eligible games',async()=>{
 const app={get(){}};
 registerSeoRoutes(app,{getPublished:async()=>{throw Error('offline')}});
 assert.equal(await verifiedIndexedGame('grand-theft-auto-vi'),null);
});
test('Mes jeux renders account-backed wishes and points without fabricated offers',()=>{
 const html=renderMyGames(gameHubs(games));
 assert.match(html,/data-swapp-wishlist-results/);
 assert.match(html,/data-swapp-loyalty-status/);
 assert.match(html,/data-swapp-rewards-points/);
 assert.match(html,/data-swapp-rewards-track/);
 assert.match(html,/aria-valuemax="100"/);
 assert.match(html,/data-swapp-wishlist-game/);
 assert.match(html,/Aucun prix ni disponibilité n’est affiché sans offre vérifiée/);
 assert.doesNotMatch(html,/Gagne des remises|temps limité|essai gratuit automatique/i);
});
test('store and article game journeys expose wishlists without another store panel',()=>{
 const store=read('modules/swapp-hubs.js');
 const story=read('modules/swapp-news/native-pages.js');
 const index=renderGameIndex(gameHubs(games));
 const page=renderGamePage(gameHubs(games)[0]);
 assert.match(store,/data-swapp-wishlist-game/);
 assert.match(store,/steamTopSection\(\)/);
 assert.match(story,/data-swapp-wishlist-game/);
 assert.match(index,/data-swapp-wishlist-game/);
 assert.match(page,/data-swapp-wishlist-game/);
});
test('browser only shows points returned by the authenticated API',()=>{
 const client=read('assets/swapp-wishlist-rewards.js');
 const server=read('modules/swapp-social-next.js');
 assert.match(client,/const p=data\.rewards/);
 assert.match(client,/Number\.isInteger\(p\.points\)/);
 assert.match(client,/data-swapp-rewards-points/);
 assert.match(server,/INSERT IGNORE INTO swapp_social_reward_ledger/);
 assert.match(server,/resolveIndexedGame\(slug\)/);
 assert.match(server,/FOR UPDATE/);
 assert.match(server,/rewardEarned/);
 assert.doesNotMatch(client,/Math\.random\(|localStorage\.setItem|setInterval\(/);
});
