'use strict';
const {layout}=require('./swapp-news/site-shell');
const fs=require('node:fs');
const path=require('node:path');
// Both TV and programme reuse SWAPP's layout CSS on the server to prevent stale visual themes.
const PROGRAM_CSS=fs.readFileSync(path.join(__dirname,'../assets/swapp-program.css'),'utf8');
function page(kind){
 const tv=kind==='tv';
 const content=tv?`<main id="swapp-tv" class="stv" aria-label="SWAPP TV">
  <header class="stv-mast">
   <div class="stv-brand"><span class="stv-brandline">SWAPP / GAME UNIVERSE</span><strong>SWAPP TV</strong><span class="stv-station-label">LA CHAÎNE</span></div>
   <nav aria-label="Navigation SWAPP TV"><a href="/tv/programme">Programme TV</a><a href="/actus">Actualités</a><a href="/social">Social</a></nav>
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
  <footer class="stv-footer"><span>SWAPP TV <span class="stv-dot">●</span> DISCOVERY FIRST</span><a href="/tv/programme">PROGRAMME ↗</a><a href="/social">SOCIAL ↗</a><a href="/actus">ACTUALITÉ ↗</a></footer>
 </main>`:`<main id="swapp-calendar" class="scal">
 <header class="scal-head"><div><span class="scal-kicker">SWAPP TV / PROGRAMMATION</span><h1>LE PROGRAMME <em>DE LA CHAÎNE.</em></h1><p>Les rendez-vous annoncés et confirmés, dans un calendrier directement relié à SWAPP TV.</p></div><div class="scal-head-side"><a href="/tv">◉ REJOINDRE SWAPP TV ↗</a></div></header>
 <section class="scal-shell" aria-label="Calendrier des événements SWAPP">
 <div class="scal-toolbar"><div><span class="scal-kicker">PROGRAMMATION</span><h2 id="scal-month-label">Chargement…</h2></div><div class="scal-tools"><button id="scal-today" type="button">AUJOURD'HUI</button><button id="scal-prev" type="button" aria-label="Mois précédent">←</button><button id="scal-next" type="button" aria-label="Mois suivant">→</button></div></div>
 <div class="scal-filters"><label for="scal-game">JEU</label><select id="scal-game"><option value="">Tous les jeux</option></select><span id="scal-status" role="status" aria-live="polite">Chargement des rendez-vous confirmés…</span></div>
 <div class="scal-workspace"><div><div class="scal-weekdays" aria-hidden="true"><span>LUN</span><span>MAR</span><span>MER</span><span>JEU</span><span>VEN</span><span>SAM</span><span>DIM</span></div><div id="scal-grid" class="scal-grid" role="grid" aria-label="Jours du mois"></div></div>
 <aside class="scal-aside"><span class="scal-kicker">SÉLECTION DU JOUR</span><h3 id="scal-selected-label">Aujourd'hui</h3><div id="scal-day-events" aria-live="polite"><p>Sélectionne une date pour voir les rendez-vous.</p></div><div class="scal-aside-tv"><span class="scal-kicker">LA CHAÎNE</span><h3>LE LIVE<br>NE S'ARRÊTE PAS.</h3><p>Découvre les créateurs et les jeux à l'antenne.</p><a href="/tv">OUVRIR SWAPP TV ↗</a></div></aside></div></section>
 <footer class="scal-foot"><span>SWAPP / AGENDA</span><span>TOUTES LES HEURES SONT LOCALES · AUCUN ÉVÉNEMENT INVENTÉ</span></footer>
 </main>`;
 return layout({title:tv?'SWAPP TV — La chaîne du Game Universe':'Programme SWAPP TV',description:tv?'La chaîne gaming collective, découverte équitable et directs vérifiés':'Agenda des rendez-vous Spotlight SWAPP',content,active:tv?'tv':'agenda',extraCss:PROGRAM_CSS,scripts:'<link rel="stylesheet" href="/assets/swapp-program.css?v=20261022-unified-da-v3">'+(tv?'<script defer src="/assets/swapp-tv-broadcast.js?v=20261021-broadcast-v1"></script>':'<script defer src="/assets/swapp-calendar.js?v=20261021-calendar-health-v2"></script>')});
}
module.exports={page};
