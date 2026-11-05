'use strict';
const {layout}=require('./swapp-news/site-shell');
// Zero new registration or fake programme: the client reads existing verified
// live discovery / SWAPP Spotlight schedule / SWAPP TV creator queue.
function page(kind){
 const marathon=kind==='marathon';
 const content=marathon?`<main class="sco" id="swapp-marathon">
 <nav class="sco-breadcrumb" aria-label="Navigation"><a href="/tv">SWAPP TV</a><span aria-hidden="true">/</span>MARATHON</nav>
 <header class="sco-hero">
 <div><span class="sco-eyebrow">SWAPP / MARATHON</span><h1>Un jeu. Des créateurs.<br>Un direct qui continue.</h1>
 <p>Choisis un jeu. Retrouve les créateurs déjà en direct et les rendez-vous réellement programmés.</p></div>
 <a class="sco-action" href="/tv">Regarder SWAPP TV</a></header>
 <section class="sco-panel" aria-labelledby="sm-title">
 <div class="sco-bar"><div><span class="sco-eyebrow">01 / LE JEU</span><h2 id="sm-title">Quel jeu regardes-tu ?</h2></div>
 <label class="sco-select"><span>Jeu</span><select id="sm-game" aria-label="Jeu du marathon"><option value="">Chargement des jeux…</option></select></label></div>
 <div id="sm-status" class="sco-message" role="status" aria-live="polite">Recherche des directs vérifiés…</div>
 <div class="sco-section-head"><h3>En direct maintenant</h3><small>Chaînes vérifiées · mêmes catégories uniquement</small></div>
 <div id="sm-live" class="sco-list" aria-live="polite"></div>
 <div class="sco-section-head"><h3>À venir</h3><small>Créneaux Spotlight confirmés, pas des directs inventés</small></div>
 <div id="sm-program" class="sco-list" aria-live="polite"></div>
 </section>
 <footer class="sco-footer"><p>Tu diffuses ? Les lives SWAPP apparaissent automatiquement. Pour les créneaux Twitch, utilise les outils créateur existants.</p>
 <div><a href="/tv#stv-creator-access">Rejoindre la régie</a><a href="/ascension">Mon impact</a></div></footer>
 </main>`:`<main class="sco" id="swapp-ascension">
 <nav class="sco-breadcrumb" aria-label="Navigation"><a href="/tv">SWAPP TV</a><span aria-hidden="true">/</span>ASCENSION</nav>
 <header class="sco-hero"><div><span class="sco-eyebrow">SWAPP / ASCENSION</span><h1>L'impact réel.<br>Sans chiffres inventés.</h1>
 <p>Les passages ouverts vers ta chaîne grâce à SWAPP PASSAGE, comptés sans identifier les spectateurs.</p></div>
 <a class="sco-action" href="/marathon">Explorer les marathons</a></header>
 <section class="sco-panel" aria-labelledby="sa-title">
 <div class="sco-bar"><div><span class="sco-eyebrow">30 DERNIERS JOURS</span><h2 id="sa-title">Mon impact</h2></div>
 <button id="sa-refresh" class="sco-outline" type="button">Actualiser</button></div>
 <div class="sco-stats">
 <div><small>Passages reçus</small><strong id="sa-received">—</strong><span>Pages de ta chaîne ouvertes</span></div>
 <div><small>Passages envoyés</small><strong id="sa-sent">—</strong><span>Depuis tes directs SWAPP</span></div>
 <div><small>Créateurs d'origine</small><strong id="sa-creators">—</strong><span>Chaînes ayant relayé vers toi</span></div>
 </div>
 <p id="sa-status" class="sco-message" role="status" aria-live="polite">Vérification de ton compte SWAPP…</p>
 <p class="sco-note">Ce ne sont ni des spectateurs uniques, ni des abonnements, ni une mesure de visionnage. Aucun profil ni historique spectateur n'est enregistré.</p>
 </section>
 <footer class="sco-footer"><p>Développe ton audience en participant aux directs collectifs.</p><a href="/marathon">Découvrir les créateurs</a></footer>
 </main>`;
 return layout({
  title:marathon?'SWAPP MARATHON — La découverte collective':'SWAPP ASCENSION — Mon impact créateur',
  description:marathon?'Marathon par jeu : lives vérifiés et programmation Spotlight réelle':'Mesurer les ouvertures de relais SWAPP, sans traçage des spectateurs',
  content,active:'tv',
  scripts:'<link rel="stylesheet" href="/assets/swapp-collective.css?v=20261105-v1">'+
   (marathon?'<script defer src="/assets/swapp-marathon.js?v=20261105-v1"></script>':
    '<script defer src="/assets/swapp-ascension.js?v=20261105-v1"></script>')
 });
}
module.exports={page};
