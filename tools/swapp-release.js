'use strict';
// SWAPP release fingerprint: compare repository files with the Node instance
// actually serving swapp.tv. No git checkout, secrets or paid services needed.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const RELEASE_FILES=Object.freeze([
 'server.js',
 'app.js',
 'index.html',
 'index_script.js',
 'modules/swapp-hubs.js',
 'modules/swapp-shop-catalog.js',
 'modules/swapp-shop-router.js',
 'data/swapp-shop.json',
 'assets/swapp-shop.css',
 'assets/swapp-storefront.js',
 'assets/swapp-shop-admin.css',
 'assets/swapp-shop-admin.js',
 'assets/swapp-editor-nav.js',
 'assets/swapp-hubs.css',
 'modules/swapp-discovery-diversity.js',
 'modules/swapp-fair-admin.js',
 'assets/swapp-fair-admin.js',
 'assets/swapp-fair-admin.css',
 'modules/swapp-fair-metrics.js',
 'modules/swapp-fair-offers.js',
 'migrations/mysql/011_swapp_fair_opportunities_daily.sql',
 'assets/swapp-fair-v3.js',
 'assets/swapp-fair-v3.css',
 'migrations/mysql/010_swapp_fair_exposure_daily.sql',
 'modules/swapp-seo.js',
 'modules/swapp-game-pages.js',
 'modules/swapp-news/site-shell.js',
 'modules/swapp-news/router.js',
 'modules/swapp-news/native-pages.js',
 'modules/swapp-news/editor-ui.js',
 'modules/swapp-news/editorial-corrections.js',
 'modules/swapp-news/legal-pages.js',
 'assets/swapp-article-immersive.css',
 'assets/swapp-article-trailer-bg.js',
 'assets/swapp-editor-enhance.js',
 'assets/swapp-adsense-inarticle.js',
 'assets/swapp-article-extras.js',
 'assets/swapp-footer.js',
 'assets/swapp-unified-nav.css',
 'assets/swapp-mobile-comfort.css',
 'assets/swapp-mobile-nav-follow.js',
 'assets/swapp-home-news.js',
 'assets/swapp-game-identity.js',
 'assets/swapp-creator-workspace.css',
 'modules/swapp-news/game-identity.js',
 'modules/swapp-news/content-metadata.js',
 'assets/swapp-live-curation.js',
 'assets/swapp-home-motion.js',
 'assets/swapp-actus-app.js',
 'assets/swapp-video-player.js',
 'assets/swapp-video-gallery.css',
 'assets/swapp-presentation-polish.css',
 'assets/swapp-game-journey.css',
 'assets/swapp-discover-comfort.js',
 'assets/swapp-media.css',
 'assets/swapp-live-articles.js',
 'assets/swapp-media-live.js',
 'assets/swapp-my-games.js',
 'assets/swapp-my-games-live.js',
 'assets/swapp-my-games.css',
 'assets/swapp-wishlist-rewards.js',
 'assets/swapp-social-next.js',
 'assets/swapp-social-interactions.js',
 'assets/swapp-social-interactions.css',
 'modules/swapp-social-personal-rooms.js',
 'modules/swapp-social-room-access.js',
 'modules/swapp-social-game-context.js',
 'modules/swapp-social-mysql.js',
 'modules/swapp-social-mysql-schema.js',
 'modules/swapp-social-voice.js',
 'migrations/mysql/008_swapp_personal_channels.sql',
 'modules/swapp-news/article-core.js',
 'assets/swapp-social-native/social-body.html',
 'assets/swapp-social-native/social-swapp.css',
 'assets/swapp-social-native/app.js',
 'assets/swapp-social-native/core.js',
 'assets/swapp-social-native/session.js',
 'assets/swapp-social-native/views.js',
 'ads.txt',
 'robots.txt'
]);
function releaseInfo(base=path.resolve(__dirname,'..'),env=process.env){
 const hash=crypto.createHash('sha256');
 const missing=[];
 for(const name of RELEASE_FILES){
  const full=path.resolve(base,name);
  try{
   const stat=fs.statSync(full);
   if(!stat.isFile())throw Error('not a regular file');
   // Boundary-delimited filenames prevent ambiguous concatenations.
   const data=fs.readFileSync(full);
   hash.update(name+'\x00'+data.length+'\x00');
   hash.update(data);
   hash.update('\x00');
  }catch(_){missing.push(name)}
 }
 const revision=String(env.SWAPP_GIT_SHA||env.GITHUB_SHA||'').trim();
 return {
  fingerprint:missing.length===0?hash.digest('hex'):null,
  revision:/^[a-f0-9]{7,40}$/i.test(revision)?revision.toLowerCase():null,
  complete:missing.length===0,
  trackedFiles:RELEASE_FILES.length,
  missing
 };
}
module.exports={RELEASE_FILES,releaseInfo};
if(require.main===module){
 const info=releaseInfo();
 process.stdout.write(JSON.stringify(info,null,2)+'\n');
 if(!info.complete)process.exitCode=1;
}
