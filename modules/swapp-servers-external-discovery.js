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
// Covers are linked from the game's official Steam store or Twitch category,
// never from the competing directory. Discord uses a published brand icon.
const CATEGORY_LINKS=Object.freeze([
 Object.freeze({games:['Minecraft'],label:'Minecraft',href:'https://top-serveurs.net/minecraft',accent:'#72e898',cover:'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-720x960.jpg'}),
 Object.freeze({games:['GTA V / FiveM','GTA RP'],label:'GTA RP & FiveM',href:'https://top-serveurs.net/gta',accent:'#fb7cbd',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg'}),
 Object.freeze({games:['Cyberpunk 2077'],label:'Cyberpunk 2077',href:'https://top-serveurs.net/cyberpunk-2077',accent:'#f5e767',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg'}),
 Object.freeze({games:['Discord / Multigaming'],label:'Discord',href:'https://top-serveurs.net/discord',accent:'#a995ff',cover:'https://cdn.simpleicons.org/discord/5865F2'}),
 Object.freeze({games:['Rust'],label:'Rust',href:'https://top-serveurs.net/rust',accent:'#f8a56f',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/252490/header.jpg'}),
 Object.freeze({games:['DayZ'],label:'DayZ',href:'https://top-serveurs.net/dayz',accent:'#bfe9b1',cover:'https://cdn.cloudflare.steamstatic.com/steam/apps/221100/header.jpg'})
]);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderExternalDiscovery(game=''){
 const active=game?CATEGORY_LINKS.filter(item=>item.games.includes(game)):CATEGORY_LINKS;
 if(!active.length)return '';
 const cards=active.map(item=>
  '<a class="ss-partner-card" href="'+escape(item.href)+'" target="_blank" rel="noopener noreferrer nofollow" style="--ss-partner-accent:'+item.accent+'"'+
  ' aria-label="Consulter le classement '+escape(item.label)+' sur Top-Serveurs (site externe)">'+
   '<div class="ss-partner-card-art">'+
    '<img src="'+escape(item.cover)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="Visuel de '+escape(item.label)+'">'+
    '<span class="ss-partner-card-fallback" aria-hidden="true">'+escape(item.label.slice(0,2).toUpperCase())+'</span>'+
   '</div>'+
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
