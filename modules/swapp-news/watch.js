'use strict';
const {escapeHtml}=require('./article-core');
const {layout}=require('./site-shell');
function isTwitchLogin(value){return /^[a-z0-9_]{2,25}$/.test(String(value||''));}
function renderTwitchWatch(login,{game=''}={}){
 if(!isTwitchLogin(login))throw Error('Twitch login invalide');
 const user=escapeHtml(login),label=String(game||'').trim().slice(0,90);
 const channel=encodeURIComponent(login),parents='&parent=swapp.tv&parent=www.swapp.tv';
 const player='https://player.twitch.tv/?channel='+channel+parents+'&muted=false';
 const chat='https://www.twitch.tv/embed/'+channel+'/chat?darkpopout&parent=swapp.tv&parent=www.swapp.tv';
 const content='<main class="swapp-watch-main swapp-media-main">'+
  '<span class="swapp-media-kicker">SWAPP · Lives</span><h1 style="font-size:clamp(28px,4vw,52px);margin:10px 0">Live de '+user+'</h1>'+
  '<p style="color:#b5c2d5">Le live et le chat sont accessibles dans SWAPP. Continue aussi à découvrir les actualités du jeu.</p>'+
  '<div class="swapp-watch-layout"><div class="swapp-watch-player"><iframe title="Live Twitch de '+user+'" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="'+player+'"></iframe></div>'+
  '<div class="swapp-watch-chat"><iframe title="Chat de '+user+'" src="'+chat+'" loading="lazy"></iframe></div></div>'+
  '<section class="swapp-media-section" data-articles-for-game="'+escapeHtml(label)+'"><div class="swapp-media-heading"><div><span class="swapp-media-kicker">SWAPP · Actualités</span><h2>Dans l’actualité du jeu</h2></div><a class="swapp-media-button" href="/actus">Toutes les actualités →</a></div><div class="swapp-live-grid" data-related-results><p class="swapp-live-notice">Recherche des articles…</p></div></section>'+
  '<div class="swapp-media-buttons"><a class="swapp-media-button primary" href="/actus">Actualités SWAPP →</a><a class="swapp-media-button" href="/decouvrir">Autres lives →</a></div></main>';
 return layout({title:'Live '+login,description:'Regarder '+login+' et découvrir les actualités du jeu sur SWAPP',content});
}
module.exports={isTwitchLogin,renderTwitchWatch};