'use strict';
const {layout}=require('./swapp-news/site-shell');
const fs=require('node:fs');
const path=require('node:path');
// Both TV and programme reuse SWAPP's layout CSS on the server to prevent stale visual themes.
const PROGRAM_CSS=fs.readFileSync(path.join(__dirname,'../assets/swapp-program.css'),'utf8');
function page(kind){
 const tv=kind==='tv';
 const calendar=`<main id="swapp-calendar" class="scal">
 <header class="scal-head"><div><span class="scal-kicker">SWAPP TV / PROGRAMMATION</span><h1>LE PROGRAMME <em>DE LA CHAÎNE.</em></h1><p>Les rendez-vous annoncés et confirmés, dans un calendrier directement relié à SWAPP TV.</p></div><div class="scal-head-side"><a href="/tv">◉ REJOINDRE SWAPP TV ↗</a></div></header>
 <section class="scal-shell" aria-label="Calendrier des événements SWAPP">
 <div class="scal-toolbar"><div><span class="scal-kicker">PROGRAMMATION</span><h2 id="scal-month-label">Chargement…</h2></div><div class="scal-tools"><button id="scal-today" type="button">AUJOURD'HUI</button><button id="scal-prev" type="button" aria-label="Mois précédent">←</button><button id="scal-next" type="button" aria-label="Mois suivant">→</button></div></div>
 <div class="scal-filters"><label for="scal-game">JEU</label><select id="scal-game"><option value="">Tous les jeux</option></select><span id="scal-status" role="status" aria-live="polite">Chargement des rendez-vous confirmés…</span></div>
 <div class="scal-workspace"><div><div class="scal-weekdays" aria-hidden="true"><span>LUN</span><span>MAR</span><span>MER</span><span>JEU</span><span>VEN</span><span>SAM</span><span>DIM</span></div><div id="scal-grid" class="scal-grid" role="grid" aria-label="Jours du mois"></div></div>
 <aside class="scal-aside"><span class="scal-kicker">SÉLECTION DU JOUR</span><h3 id="scal-selected-label">Aujourd'hui</h3><div id="scal-day-events" aria-live="polite"><p>Sélectionne une date pour voir les rendez-vous.</p></div><div class="scal-aside-tv"><span class="scal-kicker">LA CHAÎNE</span><h3>LE LIVE<br>NE S'ARRÊTE PAS.</h3><p>Découvre les créateurs et les jeux à l'antenne.</p><a href="/tv">OUVRIR SWAPP TV ↗</a></div></aside></div></section>
 <footer class="scal-foot"><span>SWAPP / AGENDA</span><span>TOUTES LES HEURES SONT LOCALES · AUCUN ÉVÉNEMENT INVENTÉ</span></footer>
 </main>`;
 const content=tv?`<main id="swapp-tv" class="stv" aria-label="SWAPP TV">
  <header class="stv-mast">
   <div class="stv-brand"><span class="stv-brandline">SWAPP / GAME UNIVERSE</span><strong>SWAPP TV</strong><span class="stv-station-label">LA CHAÎNE</span></div>
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
    <div class="stv-nowbar"><div><span class="stv-label">MAINTENANT</span><strong id="stv-now-name">Antenne en préparation</strong><span id="stv-now-game">En attente de programmation</span></div><div class="stv-now-actions"><button id="stv-watch" type="button" aria-pressed="false" disabled>▶ REGARDER</button><button id="stv-dock-toggle" type="button" aria-controls="stv-dock" aria-expanded="false">◧ TCHATS / FILE</button><button id="stv-immersive" type="button" aria-pressed="false">⛶ IMMERSION</button></div></div>
   </div>
   <aside class="stv-rail stv-dock" id="stv-dock" aria-label="Tchats et file SWAPP TV">
    <div class="stv-dock-top">
     <div class="stv-dock-tabs" role="tablist" aria-label="Tchat et file de la chaîne">
      <button type="button" id="stv-tab-twitch" role="tab" aria-selected="true" aria-controls="stv-pane-twitch">Twitch</button>
      <button type="button" id="stv-tab-swapp" role="tab" aria-selected="false" aria-controls="stv-pane-swapp" tabindex="-1">SWAPP</button>
      <button type="button" id="stv-tab-queue" role="tab" aria-selected="false" aria-controls="stv-pane-queue" tabindex="-1">File <span id="stv-queue-count" class="stv-queue-count"></span></button>
     </div>
     <button type="button" class="stv-programme-link" id="stv-program-open" aria-haspopup="dialog" aria-controls="stv-program-dialog" title="Voir les rendez-vous de la chaîne">Agenda</button>
    </div>
    <div id="stv-pane-queue" class="stv-dock-queue" role="tabpanel" aria-labelledby="stv-tab-queue" hidden>
    <div class="stv-rail-head">
     <span class="stv-label">LE CONDUCTEUR</span>
     <div class="stv-air-meta"><span id="stv-air-state" class="stv-air-state">HORS ANTENNE</span><span id="stv-slot-clock" class="stv-slot-clock" aria-live="off" hidden></span></div>
    </div>
    <div class="stv-upnext">
     <div class="stv-next-heading"><span id="stv-next-title" class="stv-label">À SUIVRE</span></div>
     <div id="stv-next-list"><p>Le programme est en préparation.</p></div>
    </div>
    <details id="stv-creator-access" class="stv-creator-inline">
     <summary><span class="stv-creator-summary-icon" aria-hidden="true">＋</span><span>Je suis créateur <small id="stv-creator-hint">Rejoindre la file SWAPP TV</small></span><span class="stv-creator-chevron" aria-hidden="true">⌄</span></summary>
     <div class="stv-creator-content">
      <p>Compte SWAPP et Twitch lié requis. Le jeu doit être couvert par la rédaction. L'inscription ne garantit pas un passage à l'antenne.</p>
      <label for="stv-game">Jeu diffusé</label>
      <select id="stv-game"><option value="">Chargement des jeux…</option></select>
      <div class="stv-queue-buttons">
       <button id="stv-join" type="button" disabled>Rejoindre la file</button>
       <button id="stv-leave" type="button" disabled>Quitter</button>
      </div>
      <p id="stv-queue-status" role="status" aria-live="polite">Vérification du service…</p>
     </div>
    </details>
    </div>
    <section class="stv-chat" id="stv-chat-area" aria-label="Discussions de la chaîne">
     <div id="stv-pane-swapp" class="stv-chat-pane" role="tabpanel" aria-labelledby="stv-tab-swapp" hidden>
      <div id="stv-swapp-messages" class="stv-chat-feed" role="log" aria-live="polite" aria-label="Messages SWAPP TV"><p>Connexion à la discussion SWAPP…</p></div>
      <form id="stv-swapp-chat-form" class="stv-chat-form"><label class="stv-sr-only" for="stv-swapp-chat-input">Message SWAPP TV</label><input id="stv-swapp-chat-input" name="body" maxlength="160" autocomplete="off" placeholder="Discuter sur SWAPP…" required><button type="submit" aria-label="Envoyer sur SWAPP">↗</button></form>
      <p id="stv-chat-status" class="stv-chat-status" role="status" aria-live="polite">Compte SWAPP requis pour écrire.</p>
     </div>
     <div id="stv-pane-twitch" class="stv-chat-pane" role="tabpanel" aria-labelledby="stv-tab-twitch">
      <div id="stv-twitch-chat" class="stv-twitch-chat"><p>Sélectionne un créateur à regarder pour afficher son tchat Twitch.</p></div>
      <p class="stv-chat-status">Le chat Twitch est celui du créateur sélectionné. Connexion Twitch éventuellement requise pour participer.</p>
     </div>
    </section>
   </aside>
   <div id="stv-dock-scrim" class="stv-dock-scrim" hidden></div>
  </section>
  <dialog id="stv-program-dialog" class="stv-program-dialog" aria-labelledby="stv-dialog-title">
   <div class="stv-dialog-tools"><div class="stv-dialog-brand"><span class="stv-dialog-kicker">SWAPP TV / PROGRAMMATION</span><strong id="stv-dialog-title">Agenda de la chaîne</strong></div><button id="stv-program-close" type="button" aria-label="Fermer l’agenda">Fermer</button></div>
   ${calendar.replace(/^<main/,'<section').replace(/<\/main>$/,'</section>')}
  </dialog>
 </main>`:calendar;
 return layout({title:tv?'SWAPP TV — La chaîne du Game Universe':'Programme SWAPP TV',description:tv?'La chaîne gaming collective, découverte équitable et directs vérifiés':'Agenda des rendez-vous Spotlight SWAPP',content,active:tv?'tv':'agenda',extraCss:PROGRAM_CSS,scripts:'<link rel="stylesheet" href="/assets/swapp-program.css?v=20261025-tv-station-clock-v3">'+
  (tv?'<script defer src="/assets/swapp-tv-broadcast.js?v=20261025-tv-station-clock-v3"></script>':'')+
  '<script defer src="/assets/swapp-calendar.js?v=20261021-calendar-health-v2"></script>'});
}
module.exports={page};
