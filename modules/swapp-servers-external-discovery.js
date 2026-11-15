'use strict';
/**
 * External discovery, NOT syndication: only first-party authored text and
 * verified outbound links to Top-Serveurs' public ranking category pages.
 *
 * Top-Serveurs' public API is documented chiefly for individual-server
 * tokens. Its CGU restrict reproduction of third-party listings for commercial
 * purposes without consent. Do not fetch, scrape, proxy, store, copy images,
 * mirror vote counts or re-rank their listings here.
 *
 * These links always lead to their current game ranking, so users can consult
 * the actual top-ranked servers on the provider's own page.
 */
const CATEGORY_LINKS=Object.freeze([
 Object.freeze({games:['Minecraft'],label:'Minecraft',href:'https://top-serveurs.net/minecraft',accent:'#72e898'}),
 Object.freeze({games:['GTA V / FiveM','GTA RP'],label:'GTA RP & FiveM',href:'https://top-serveurs.net/gta',accent:'#fb7cbd'}),
 Object.freeze({games:['Cyberpunk 2077'],label:'Cyberpunk 2077',href:'https://top-serveurs.net/cyberpunk-2077',accent:'#f5e767'}),
 Object.freeze({games:['Discord / Multigaming'],label:'Discord',href:'https://top-serveurs.net/discord',accent:'#a995ff'}),
 Object.freeze({games:['Rust'],label:'Rust',href:'https://top-serveurs.net/rust',accent:'#f8a56f'}),
 Object.freeze({games:['DayZ'],label:'DayZ',href:'https://top-serveurs.net/dayz',accent:'#bfe9b1'})
]);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderExternalDiscovery(game=''){
 const active=game?CATEGORY_LINKS.filter(item=>item.games.includes(game)):CATEGORY_LINKS;
 if(!active.length)return '';
 const cards=active.map((item,index)=>
  '<a class="ss-partner-card" href="'+escape(item.href)+'" target="_blank" rel="noopener noreferrer nofollow" style="--ss-partner-accent:'+item.accent+'"'+
  ' aria-label="Consulter le classement '+escape(item.label)+' sur Top-Serveurs (site externe)">'+
   '<div class="ss-partner-card-art" aria-hidden="true"><span class="ss-partner-icon">'+String(index+1).padStart(2,'0')+'</span>'+
    '<span class="ss-partner-spark">✦</span></div>'+
   '<div class="ss-partner-card-copy"><span class="ss-partner-source">CLASSEMENT EXTERNE</span>'+
   '<strong>'+escape(item.label)+'</strong><span class="ss-partner-card-cta">Voir les mieux classés <span aria-hidden="true">↗</span></span></div></a>').join('');
 return '<section class="ss-partner-discovery ss-inner" aria-labelledby="ss-partner-title">'+
  '<div class="ss-partner-head"><div><p class="ss-overline">ENCORE PLUS DE COMMUNAUTÉS À DÉCOUVRIR</p>'+
  '<h2 id="ss-partner-title">Les tops <em>chez nos voisins.</em></h2>'+
  '<p>Compare les serveurs les plus populaires sur Top-Serveurs, directement dans leur classement actualisé.</p></div>'+
  '<span class="ss-partner-badge">Source externe · Top-Serveurs</span></div>'+
  '<div class="ss-partner-cards">'+cards+'</div>'+
  '<p class="ss-partner-disclaimer">Ce sont des liens vers les classements publics de Top-Serveurs, pas des fiches importées. Les votes, résultats et serveurs externes ne sont pas comptabilisés dans le classement indépendant de SWAPP. SWAPP n’est pas affilié à Top-Serveurs.</p>'+
 '</section>';
}
module.exports={renderExternalDiscovery,CATEGORY_LINKS};
