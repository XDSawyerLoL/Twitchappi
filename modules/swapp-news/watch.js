'use strict';
const {escapeHtml}=require('./article-core');
function isTwitchLogin(v){return /^[a-z0-9_]{2,25}$/.test(String(v||''));}
function renderTwitchWatch(login) {
  if(!isTwitchLogin(login))throw new Error('Twitch login invalide');
  const user=escapeHtml(login);
  const channel=encodeURIComponent(login);
  const parents='&parent=swapp.tv&parent=www.swapp.tv';
  const player='https://player.twitch.tv/?channel='+channel+parents+'&muted=false';
  const chat='https://www.twitch.tv/embed/'+channel+'/chat?darkpopout&parent=swapp.tv&parent=www.swapp.tv';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="theme-color" content="#10151f"><title>'+user+' · Live SWAPP</title>'+
    '<link rel="stylesheet" href="/assets/swapp-media.css"></head><body>'+
    '<header><a href="/"><strong>SWAPP</strong></a><nav><a href="/">Accueil</a><a href="/decouvrir">Découvrir</a><a href="/actus">ACTUS × LIVE</a><a href="/compte">Compte</a></nav></header>'+
    '<main class="swapp-watch-main swapp-media-main"><span class="swapp-media-kicker">ACTUS × LIVE · Maintenant</span>'+
    '<h1 style="font-size:clamp(28px,4vw,52px);margin:10px 0">Live de '+user+'</h1><p style="color:#b5c2d5">Un live Twitch intégré à SWAPP. Découvre les actualités et continue à regarder sans changer de site.</p>'+
    '<div class="swapp-watch-layout"><div class="swapp-watch-player">'+
    '<iframe title="Live Twitch de '+user+'" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="'+player+'"></iframe>'+
    '</div><div class="swapp-watch-chat"><iframe title="Chat de '+user+'" src="'+chat+'" loading="lazy"></iframe></div></div>'+
    '<div class="swapp-media-buttons"><a class="swapp-media-button primary" href="/actus">Lire les actus gaming →</a>'+
    '<a class="swapp-media-button" href="/decouvrir">Découvrir d’autres lives →</a></div></main></body></html>';
}
module.exports={isTwitchLogin,renderTwitchWatch};
