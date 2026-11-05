'use strict';
// SWAPP PORTAIL: a standalone, accessible entry to verified first-party live creators.
// No stream metadata is invented server-side and no player starts without a click.
const {layout}=require('./swapp-news/site-shell');
const CSS='<link rel="stylesheet" href="/assets/swapp-portail.css?v=20261105-1">';
const JS='<script defer src="/assets/swapp-portail.js?v=20261105-1"></script>';
function page(){
 const body=`<main class="sp-shell" id="swapp-portail">
 <header class="sp-hero">
   <span class="sp-eyebrow"><span aria-hidden="true">✦</span> SWAPP / PORTAIL</span>
   <div class="sp-hero-grid">
     <div>
       <h1>LE PROCHAIN CRÉATEUR<br><em>EST UNE SURPRISE.</em></h1>
       <p>Pas de course aux spectateurs. Pas de classement acheté. Un véritable direct SWAPP, découvert autrement.</p>
       <div class="sp-principles"><span>01 · Directs vérifiés</span><span>02 · Découverte équitable</span><span>03 · Sans profilage</span></div>
     </div>
     <div class="sp-orbit" aria-hidden="true"><div class="sp-orbit-one"></div><div class="sp-orbit-two"></div><div class="sp-orbit-core">S</div></div>
   </div>
 </header>
 <section class="sp-deck" aria-labelledby="sp-heading">
   <div class="sp-deck-top">
     <div><span class="sp-kicker">UNE RENCONTRE, PAS UN SCORE</span><h2 id="sp-heading">OUVRE LE PORTAIL.</h2></div>
     <span class="sp-counter" id="sp-count">Vérification des directs…</span>
   </div>
   <div class="sp-stage">
     <div class="sp-identity">
       <span class="sp-avatar" id="sp-glyph" aria-hidden="true">S</span>
       <div class="sp-identity-copy"><span class="sp-kicker" id="sp-category">SWAPP / CRÉATEURS</span>
       <strong id="sp-name">LA PROCHAINE RENCONTRE</strong></div>
     </div>
     <h3 id="sp-title">Un direct que tu n’aurais peut-être jamais découvert.</h3>
     <p class="sp-suggestion" id="sp-suggestion"></p>
     <p class="sp-status" id="sp-status" role="status" aria-live="polite">Recherche des directs natifs vérifiés…</p>
     <div class="sp-actions">
       <a id="sp-watch" href="/tv" class="sp-watch" hidden>REGARDER CE DIRECT</a>
       <button id="sp-next" type="button" class="sp-next" disabled>Découvrir un créateur</button>
     </div>
   </div>
   <div class="sp-controls">
     <label for="sp-game">Explorer un jeu</label>
     <select id="sp-game"><option value="">Tous les jeux</option></select>
     <button id="sp-refresh" type="button">Actualiser les directs</button>
   </div>
 </section>
 <footer class="sp-explain">
   <div><span class="sp-kicker">NOTRE PROMESSE</span><h2>LA VISIBILITÉ NE S’ACHÈTE PAS.</h2></div>
   <p>Les créateurs disponibles sont uniquement ceux dont le serveur SWAPP confirme un flux HLS public actif. Leur ordre change par créneaux de 15 minutes, sans utiliser tes habitudes, ton historique ou le nombre de spectateurs. Aucun cookie ni identifiant de visiteur n’est utilisé pour cette sélection.</p>
   <nav aria-label="Aller plus loin"><a href="/tv">Rejoindre SWAPP TV</a><a href="/jeux">Explorer les jeux</a></nav>
 </footer>
 </main>`;
 return layout({title:'SWAPP PORTAIL — Découvrir un créateur en direct',
 description:'Rencontre un streamer SWAPP réellement en direct, grâce à une sélection transparente sans profilage ni classement payant.',
 active:'tv',content:body,
 metadata:'<link rel="canonical" href="https://swapp.tv/portail">',
 scripts:CSS+JS});
}
module.exports={page};
