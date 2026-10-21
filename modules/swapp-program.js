'use strict';
const {layout}=require('./swapp-news/site-shell');
function page(kind){
 const tv=kind==='tv';
 const content=tv?`<main id="swapp-tv" class="stv" aria-label="SWAPP TV">
  <header class="stv-mast">
   <div class="stv-brand"><span class="stv-mark">S<span>●</span></span><span>SWAPP <strong>TV</strong></span><span class="stv-brandline">LA CHAÎNE DU GAME UNIVERSE</span></div>
   <nav aria-label="Navigation TV"><a href="/agenda">PROGRAMME</a><a href="/jeux">LES JEUX</a><a href="/social">COMMUNAUTÉ</a></nav>
  </header>
  <section class="stv-broadcast" aria-labelledby="stv-heading">
   <div class="stv-stage">
    <div class="stv-screen" id="stv-screen">
     <div class="stv-screen-inner" id="stv-screen-inner">
      <span class="stv-noise" aria-hidden="true"></span>
      <div class="stv-signal"><span class="stv-signal-icon">◉</span> SWAPP TV <span class="stv-signal-sep">/</span> ANTENNE</div>
      <div class="stv-empty"><span class="stv-orb" aria-hidden="true">S</span><span class="stv-screen-eyebrow">UNE NOUVELLE FAÇON DE DÉCOUVRIR</span><h1 id="stv-heading">LE GAMING<br><em>À L'ANTENNE.</em></h1><p id="stv-stage-status" role="status" aria-live="polite">Connexion à la programmation SWAPP TV…</p></div>
      <div class="stv-screen-bottom"><span id="stv-screen-game">GAME UNIVERSE</span><span id="stv-screen-clock">SWAPP / LIVE DISCOVERY</span></div>
     </div>
    </div>
    <div class="stv-nowbar"><div><span class="stv-label">MAINTENANT</span><strong id="stv-now-name">Antenne en préparation</strong><span id="stv-now-game">En attente de programmation</span></div><div class="stv-now-actions"><button id="stv-watch" type="button" disabled>▶ REGARDER</button><button id="stv-immersive" type="button" aria-pressed="false">⛶ IMMERSION</button></div></div>
   </div>
   <aside class="stv-rail" aria-label="Programme SWAPP TV"><div class="stv-rail-head"><span class="stv-label">LE CONDUCTEUR</span><span id="stv-air-state" class="stv-air-state">HORS ANTENNE</span></div><div class="stv-upnext"><span class="stv-label">À SUIVRE</span><div id="stv-next-list"><p>Le programme est en préparation.</p></div></div><div class="stv-queue-tease"><span class="stv-label">ACCÈS CRÉATEURS</span><h2>TA PLACE.<br>TON MOMENT.</h2><p>Une antenne commune. Une rotation équitable. Un vrai public à découvrir.</p><a href="#stv-queue" class="stv-join">REJOINDRE LA FILE <span>↗</span></a></div></aside>
  </section>
  <section class="stv-bottom" id="stv-queue"><div class="stv-section-head"><span class="stv-label">SWAPP TV / CREATOR ACCESS</span><h2>ENTRE DANS <em>LE PROGRAMME.</em></h2><p>Compte SWAPP, chaîne Twitch liée et jeu couvert par la rédaction. Aucune place ou diffusion garantie avant vérification.</p></div><div class="stv-queue-grid"><div class="stv-queue-panel"><div class="stv-kicker">01 / INSCRIPTION</div><label for="stv-game">TON JEU</label><select id="stv-game"><option value="">Chargement des jeux…</option></select><div class="stv-queue-buttons"><button id="stv-join" type="button" disabled>REJOINDRE LA FILE ↗</button><button id="stv-leave" type="button" disabled>QUITTER LA FILE</button></div><p id="stv-queue-status" role="status" aria-live="polite">Vérification du service…</p></div><div class="stv-queue-panel"><div class="stv-kicker">02 / PROGRAMMATION</div><h3>LA FILE EN DIRECT</h3><ol id="stv-queue-list"><li>En attente des données de programmation.</li></ol></div></div></section>
  <footer class="stv-footer"><span>SWAPP TV <span class="stv-dot">●</span> DISCOVERY FIRST</span><a href="/agenda">AGENDA ↗</a><a href="/social">SOCIAL ↗</a><a href="/actus">ACTUALITÉ ↗</a></footer>
 </main>`:`<main id="swapp-program" data-mode="agenda" class="swapp-program"><header class="swapp-program-header"><small>SWAPP / GAME UNIVERSE</small><h1>Agenda SWAPP</h1><p>Les rendez-vous Spotlight confirmés sur les jeux couverts par SWAPP.</p><nav><a href="/tv">SWAPP TV</a><a href="/social">SOCIAL</a></nav></header><p id="swapp-program-status" role="status" aria-live="polite">Chargement des données publiques…</p><div id="swapp-program-controls"></div><div id="swapp-program-content"></div></main>`;
 return layout({title:tv?'SWAPP TV — La chaîne du Game Universe':'Agenda SWAPP',description:tv?'La chaîne gaming collective, découverte équitable et directs vérifiés':'Agenda des rendez-vous Spotlight SWAPP',content,active:tv?'tv':'agenda',scripts:'<link rel="stylesheet" href="/assets/swapp-program.css?v=20261021-broadcast-v1">'+(tv?'<script defer src="/assets/swapp-tv-broadcast.js?v=20261021-broadcast-v1"></script>':'<script defer src="/assets/swapp-program.js?v=20261021-broadcast-v1"></script>')});
}
module.exports={page};
