'use strict';
/* Full SWAPP profile: original design, content drawn only from published database rows. */
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>x===null||x===undefined||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('fr-FR');
const rating=x=>x===null||x===undefined||!Number.isFinite(Number(x))?'—':Number(x).toFixed(1).replace('.',',')+'/5';
const day=x=>{const d=new Date(x);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d):'Non renseignée'};
function renderProfile({server,votes=null,rank=null,stats=null,reviews=[],reviewSummary=null,cover='',outbound='',gamePath='/serveurs'}={}){
 if(!server||!/^[a-f0-9]{32}$/.test(String(server.id||'')))throw Error('invalid_server_profile');
 const name=String(server.name||''),game=String(server.game||''),description=String(server.description||'');
 const tags=String(server.tags||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,8);
 const count=reviewSummary?Number(reviewSummary.count||0):null;
 const mean=reviewSummary&&count?([reviewSummary.staff,reviewSummary.atmosphere,reviewSummary.availability].reduce((n,x)=>n+Number(x||0),0)/3):null;
 const img=cover?`<img src="${esc(cover)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">`:'';
 const visit=outbound?`<a class="ss-pro-button ss-pro-visit" href="${esc(outbound)}" target="_blank" rel="noopener noreferrer nofollow" data-ss-outbound-id="${esc(server.id)}">Rejoindre la communauté ↗</a>`:'';
 const vote=`<button class="ss-pro-button ss-pro-vote" type="button" data-ss-vote-id="${esc(server.id)}">♥ Voter pour ce serveur</button>`;
 const text=description.split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
 const reviewsHtml=(Array.isArray(reviews)?reviews:[]).map(r=>`<article class="ss-pro-review"><div class="ss-pro-review-title"><strong>Avis de membre SWAPP</strong><span>${rating((Number(r.staff)+Number(r.atmosphere)+Number(r.availability))/3)}</span></div><p>${esc(r.comment)}</p><time>${esc(day(r.createdAt||r.created_at))}</time></article>`).join('')||'<p class="ss-pro-empty">Aucun avis publié pour le moment. Les évaluations sont vérifiées avant publication.</p>';
 const chartData=stats?JSON.stringify({history:stats.history||{},allVotes:stats.allVotes,allClicks:stats.allClicks}).replace(/</g,'\\u003c').replace(/&/g,'\\u0026'):'null';
 const address=server.join_address?`<div class="ss-pro-connect"><small>Adresse de connexion</small><code>${esc(server.join_address)}</code><button type="button" data-ss-copy="${esc(server.join_address)}">Copier</button></div>`:'';
 return `<main class="ss ss-detail ss-pro" data-ss-server-id="${esc(server.id)}">
 <section class="ss-pro-hero" aria-labelledby="ss-pro-title"><div class="ss-pro-backdrop" aria-hidden="true">${img}</div><div class="ss-inner ss-pro-hero-inner">
  <nav class="ss-pro-breadcrumb" aria-label="Fil d’Ariane"><a href="/serveurs">SERVEUR +</a><span>/</span><a href="${esc(gamePath)}">${esc(game)}</a><span>/</span><span>Fiche serveur</span></nav>
  <div class="ss-pro-intro"><div class="ss-pro-art">${img}</div><div class="ss-pro-intro-copy"><p class="ss-overline">COMMUNAUTÉ · ${esc(game.toUpperCase())}${rank?' · N°'+Number(rank)+' AU CLASSEMENT':''}</p>
  <h1 id="ss-pro-title">${esc(name)}</h1><div class="ss-pro-chips"><span>Référencé sur SWAPP</span>${tags.map(t=>'<span>'+esc(t)+'</span>').join('')}</div>
  <p>${esc(description.slice(0,210))}${description.length>210?'…':''}</p></div></div>
  <div class="ss-pro-hero-footer"><div class="ss-pro-metrics"><div><strong data-ss-profile-votes>${number(votes)}</strong><small>Votes du mois</small></div><div><strong>${number(stats?.monthClicks)}</strong><small>Clics enregistrés</small></div><div><strong>${number(count)}</strong><small>Avis publiés</small></div></div><div class="ss-pro-actions" id="voter">${vote}${visit}</div></div>
 </div></section>
 <nav class="ss-pro-tabs" aria-label="Sections de la fiche"><div class="ss-inner"><a href="#presentation" aria-current="true">Présentation</a><a href="#caracteristiques">Caractéristiques</a><a href="#statistiques">Statistiques</a><a href="#avis">Avis (${number(count)})</a><a href="#voter">Voter</a></div></nav>
 <div class="ss-inner ss-pro-columns"><div class="ss-pro-primary">
  <section id="presentation" class="ss-pro-panel"><p class="ss-overline">LE SERVEUR EN DÉTAIL</p><h2>${esc(name)}</h2><div class="ss-pro-description">${text||'<p>Description non disponible.</p>'}</div>${server.banner_url?'<figure class="ss-pro-owner-banner">'+img+'</figure>':''}</section>
  <section id="statistiques" class="ss-pro-panel"><p class="ss-overline">DONNÉES AUTHENTIQUES</p><h2>Activité du serveur</h2><p class="ss-pro-muted">Votes et clics enregistrés par SWAPP, sans estimation de joueurs connectés.</p><div class="ss-pro-totals"><div><small>Total des votes</small><strong>${number(stats?.allVotes)}</strong></div><div><small>Total des clics</small><strong>${number(stats?.allClicks)}</strong></div></div>
  <div class="ss-pro-period" role="group" aria-label="Période"><button type="button" data-ss-period="daily">7 jours</button><button type="button" data-ss-period="weekly">8 semaines</button><button type="button" data-ss-period="monthly" aria-pressed="true">12 mois</button></div>
  <div class="ss-pro-chart" id="ss-profile-chart" role="img" aria-label="Graphique des votes et visites">Historique en cours de chargement…</div><div class="ss-pro-legend"><span>Votes</span><span>Visites</span></div>
  <script type="application/json" id="ss-profile-chart-data">${chartData}</script></section>
  <section id="avis" class="ss-pro-panel"><p class="ss-overline">LA COMMUNAUTÉ S'EXPRIME</p><h2>Avis des joueurs</h2><div class="ss-pro-reviews-summary"><strong>${rating(mean)}</strong><span>${count===null?'Avis indisponibles':count===0?'Aucun avis publié':number(count)+' avis publiés'}</span></div>
  <div class="ss-pro-reviews">${reviewsHtml}</div>
  <form id="ss-review-form" class="ss-pro-review-form"><h3>Partager son expérience</h3><p>Un avis par compte SWAPP. Modération avant publication.</p><div class="ss-pro-review-ratings">${[['staff',"Qualité de l'équipe"],['atmosphere','Ambiance'],['availability','Disponibilité']].map(([key,label])=>'<label>'+esc(label)+'<select name="'+key+'" required><option value="">Choisir</option>'+[1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+' / 5</option>').join('')+'</select></label>').join('')}</div><label>Votre avis<textarea name="comment" minlength="40" maxlength="1200" required rows="4" placeholder="Expliquez votre expérience sur ce serveur…"></textarea></label><div class="ss-pro-form-actions"><button type="submit">Soumettre mon avis</button><span role="status" id="ss-review-status" aria-live="polite"></span></div></form></section>
  <a href="${esc(gamePath)}" class="ss-pro-back">← Retour au classement ${esc(game)}</a>
 </div><aside class="ss-pro-aside" id="caracteristiques"><div class="ss-pro-aside-card"><p class="ss-overline">INFORMATIONS</p><h2>Caractéristiques</h2><dl>
 <div><dt>Jeu</dt><dd>${esc(game)}</dd></div><div><dt>Région</dt><dd>${esc(server.region||'Non renseignée')}</dd></div><div><dt>Accès</dt><dd>${outbound?'Lien disponible':'Non communiqué'}</dd></div><div><dt>Inscription</dt><dd>${esc(day(server.created_at||server.createdAt))}</dd></div><div><dt>Joueurs connectés</dt><dd>Non mesuré</dd></div><div><dt>Note moyenne</dt><dd>${rating(mean)}</dd></div></dl><div class="ss-pro-side-actions">${vote}${visit}</div>${address}<p class="ss-pro-disclaimer">Une invitation Discord vérifiée ne prouve pas la propriété du serveur ou la qualité de sa modération.</p></div>
 <div class="ss-pro-aside-card"><h3>Partager ce serveur</h3><button type="button" class="ss-pro-share" data-ss-share>Copier le lien SWAPP</button></div></aside></div>
 <div class="ss-pro-feedback" id="ss-detail-feedback" role="status" aria-live="polite"></div></main>`;
}
module.exports={renderProfile};
