/* ====== AUTO HELP (❓) ON ALL MODULE HEADERS/TABS ====== */
(function(){
  const HELP_TEXT_BY_TITLE = {
    "Alertes automatiques": "Déclenche des alertes quand un signal important apparaît (tendance, score, changement de marché).",
    "Courbe daily": "Évolution quotidienne des signaux/performances. Utile pour voir la progression sur plusieurs jours.",
    "IA – plan d’action": "Génère un plan concret (actions prioritaires) à partir de tes données et du contexte du stream.",
    "Simulation": "Teste différents scénarios (horaire, jeu, niche) et compare l'impact potentiel avant de décider.",
    "Chaîne vs Jeu": "Compare ta chaîne à un jeu/niche pour repérer où tu as le plus de traction et où tu perds des viewers.",
    "Heatmap meilleures heures (jeu)": "Carte chaleur des meilleures heures pour streamer ce jeu (où l'audience est la plus favorable).",
    "Tendance": "Mesure la dynamique actuelle (en hausse/baisse) et les signaux de hype.",
    "Top Jeux": "Liste des jeux les plus porteurs selon les signaux (hype, viewers, stabilité).",
    "Langues": "Aide à choisir la langue la plus pertinente selon l'audience et la concurrence.",
    "🎯 BEST TIME TO STREAM": "Recommandations d'horaires optimisés (créneaux où tu as le meilleur ratio visibilité / concurrence).",
    "MARCHÉ — ouvrir la fenêtre": "Mini-bourse de tendances : tu 'mises' sur des niches/jeux et tu suis la performance des signaux.",
    "SCANNER IA": "Analyse automatique de niches, chaînes et tendances pour détecter des opportunités rapidement.",
    "RAID FINDER": "Trouve des chaînes compatibles pour raid (taille, jeu, langue) afin de maximiser les retours.",
    "CO-STREAM MATCH": "Propose des co-streamers compatibles (même vibe, même jeux, audience proche).",
    "BOOST": "Met en avant un live à lancer (rotation) ou une opportunité de collaboration/raid selon les signaux."
  };

  const HELP_TEXT_BY_TAB = {
    "OVERVIEW": "Vue synthèse : KPIs, raccourcis et état global du live.",
    "ANALYTICS PRO": "Analyse avancée : courbes, segments, perf, signaux et comparaisons.",
    "NICHE": "Niche & opportunités : idées de jeux/sujets, concurrence, timing et angles gagnants.",

    "CHAT": "Chat du stream : Twitch + Hub Secure. Rien d'autre n'apparaît en dessous.",
    "STATS": "Tableaux et métriques (audience, tendances, historique).",
    "OUTILS": "Tous les modules d'analyse (best time, marché, scanner, raid finder, etc.)."
  };

  function norm(s){ return String(s||"").replace(/\s+/g," ").trim(); }

  function addHelpTo(el, text){
    if (!el || el.querySelector('.help')) return;
    const span = document.createElement('span');
    span.className = 'help';
    span.setAttribute('data-help', text);
    span.textContent = '?';
    el.appendChild(document.createTextNode(' '));
    el.appendChild(span);
  }

  function apply(){
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => {
      const t = norm(h.textContent);
      if (HELP_TEXT_BY_TITLE[t]) addHelpTo(h, HELP_TEXT_BY_TITLE[t]);
    });

    document.querySelectorAll('.tab-btn').forEach(b => {
      const t = norm(b.textContent);
      if (HELP_TEXT_BY_TAB[t]) addHelpTo(b, HELP_TEXT_BY_TAB[t]);
    });

    document.querySelectorAll('.u-tab-btn').forEach(b => {
      const t = norm(b.textContent).toUpperCase();
      if (HELP_TEXT_BY_TAB[t]) addHelpTo(b, HELP_TEXT_BY_TAB[t]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
