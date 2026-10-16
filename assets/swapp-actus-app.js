/* ACTUS is a real view inside the existing SWAPP application. */
(()=>{'use strict';
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=String(text);return x;};
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
const date=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';};
const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(s||'');
const fetchJson=async route=>{
 // AbortSignal.timeout is unavailable on older iPhone Safari releases.
 // AbortController + a finally-cleaned timer works on those devices too.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(route,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
  if(!r.ok)throw Error('Contenu temporairement indisponible ('+r.status+').');
  return await r.json();
 }catch(error){
  if(error?.name==='AbortError')throw Error('Chargement trop long. Réessayez.');
  throw error;
 }finally{clearTimeout(timer)}
};
let items=[];
function cover(article){const p=el('div','swapp-actus-cover'),source=url(article.image?.url||article.imageUrl);if(source){const img=el('img');img.src=source;img.alt=article.title||'Visuel du jeu';img.loading='lazy';img.onerror=()=>{img.remove();if(!p.childElementCount)p.append(el('span','swapp-actus-cover-empty',article.game||article.category||'Jeux vidéo'))};p.append(img)}else p.append(el('span','swapp-actus-cover-empty',article.game||article.category||'Jeux vidéo'));return p;}
function makeCard(a){if(!slugOk(a.slug))return null;const link=el('a','swapp-actus-card');link.href='/actus/'+encodeURIComponent(a.slug);
const info=el('div','swapp-actus-info');info.append(el('small','',a.game||a.category||'Actualité'),el('h2','',a.title),el('p','',a.summary||''),el('span','',date(a.publishedAt||a.originalPublishedAt)+' · Lire l’article →'));
link.append(cover(a),info);link.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();window.SwappLocalTastes?.record?.(a.game);open(a.slug)};return link;}
function paragraphContent(parent,raw){let list=null;for(const lineRaw of String(raw||'').split(/\r?\n/)){const line=lineRaw.trim();if(!line){list=null;continue;}let m;if((m=line.match(/^(#{2,3})\s+(.+)/))){parent.append(el('h'+m[1].length,'',m[2]));list=null;}else if((m=line.match(/^[-*]\s+(.+)/))){if(!list){list=el('ul');parent.append(list)}list.append(el('li','',m[1]));}else{list=null;parent.append(el('p','',line.replace(/\*\*(.*?)\*\*/g,'$1')));}}}
async function showList(node){const headline=el('header','swapp-actus-head');headline.append(el('small','','SWAPP / Actualité'),el('h1','','L’actualité du jeu vidéo'),el('p','','Des articles complets et des créateurs en direct, sans quitter SWAPP.'));node.append(headline);
const tools=el('div','swapp-actus-tools'),search=el('input');search.type='search';search.placeholder='Rechercher un jeu ou une actualité';search.setAttribute('aria-label','Recherche Actualité');const live=el('button','swapp-actus-go-live','Découvrir les lives →');live.onclick=()=>window.setView('discover');const category=el('select','swapp-actus-category');category.setAttribute('aria-label','Filtrer par catégorie');const all=el('option','','Toutes les catégories');all.value='';category.append(all);tools.append(search,category,live);node.append(tools);window.SwappArticleFeedback?.mountList(node);
const liveSection=el('section','swapp-discover-live');liveSection.setAttribute('aria-label','Créateurs en direct pour le jeu sélectionné');const liveHeading=el('div','swapp-discover-live-heading');liveHeading.append(el('h2','','Les créateurs en direct'));const liveStatus=el('p','swapp-discover-live-status');liveSection.append(liveHeading,liveStatus);const liveCards=el('div','swapp-discover-live-grid');liveSection.append(liveCards);node.append(liveSection);
let liveResults=null,liveLoading=null,liveTicket=0;
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matches=(a,b)=>{a=normalized(a);b=normalized(b);return !!(a&&b&&(a===b||(a.length>=7&&b.includes(a))||(b.length>=7&&a.includes(b))))};
const loadLives=game=>fetchJson('/api/discovery/game-lives?limit=12&game='+encodeURIComponent(game)).then(data=>Array.isArray(data.items)?data.items:[]);
async function updateLives(){const ticket=++liveTicket;const game=activeGame;if(!game){liveSection.hidden=true;return}liveSection.hidden=false;liveCards.replaceChildren();liveHeading.querySelector('h2').textContent='En direct sur '+game;liveStatus.textContent='Recherche des créateurs en cours…';
try{const result=await loadLives(game);if(ticket!==liveTicket||!liveSection.isConnected)return;const seen=new Set();const found=result.filter(item=>{const login=String(item.login||'').toLowerCase(),platform=String(item.platform||'').toLowerCase(),key=platform+':'+login;if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||!matches(game,item.game_name||item.game||item.category))return false;seen.add(key);return true}).sort((a,b)=>Number(['swapp','oryon'].includes(String(b.platform||'').toLowerCase()))-Number(['swapp','oryon'].includes(String(a.platform||'').toLowerCase()))||Number(b.viewer_count||0)-Number(a.viewer_count||0)).slice(0,4);
liveStatus.textContent=found.length?found.length+' créateur'+(found.length>1?'s':'')+' repéré'+(found.length>1?'s':'')+' en direct dans les suggestions':'Aucun live correspondant dans les suggestions chargées. D’autres créateurs peuvent être en direct sur ce jeu.';
for(const item of found){const login=String(item.login).toLowerCase(),native=['swapp','oryon'].includes(String(item.platform||'').toLowerCase());const link=el('a','swapp-discover-stream');link.href=native?'/'+encodeURIComponent(login):'https://www.twitch.tv/'+encodeURIComponent(login);if(!native)link.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const opened=window.SwappArticlePlayer?.openFull({login,name:item.display_name||login,game});if(opened)event.preventDefault()};const image=el('div','swapp-discover-stream-cover'),src=url(item.thumbnail_url);if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();image.append(img)}image.append(el('span','swapp-discover-stream-badge','EN DIRECT'));const info=el('div','swapp-discover-stream-info');info.append(el('strong','',item.display_name||login),el('small','',item.title||'Regarder ce live'));link.append(image,info);liveCards.append(link)}
}catch{if(ticket===liveTicket&&liveSection.isConnected)liveStatus.textContent='Lives temporairement indisponibles. Les articles restent accessibles.'}}
liveSection.hidden=true;
const gamesBar=el('div','swapp-actus-game-filters');gamesBar.setAttribute('aria-label','Explorer les jeux');node.append(gamesBar);let activeGame='',gamesExpanded=false;const count=el('p','swapp-actus-count');count.setAttribute('aria-live','polite');node.append(count);const feed=el('div','swapp-actus-grid');node.append(feed);
const update=()=>{feed.replaceChildren();const query=search.value.toLocaleLowerCase('fr').trim();const available=items.filter(x=>(!activeGame||String(x.game||'')===activeGame)&&(!category.value||(x.category||'')===category.value)&&[x.title,x.game,x.summary,x.category].join(' ').toLocaleLowerCase('fr').includes(query));count.textContent=available.length+' article'+(available.length>1?'s':'')+' à découvrir';if(!available.length){feed.append(el('p','swapp-actus-state',query?'Aucun résultat.':'Aucun article complet récupéré pour le moment.'));return;}available.forEach(a=>{const c=makeCard(a);if(c)feed.append(c)});};
search.oninput=update;category.onchange=update;feed.append(el('p','swapp-actus-state','Chargement des articles…'));
try{const data=await fetchJson('/api/actus');if(!node.isConnected)return;items=Array.isArray(data.articles)?data.articles:[];const categories=[...new Set(items.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));for(const name of categories){const option=el('option','',name);option.value=name;category.append(option)}
const games=[...new Set(items.map(x=>String(x.game||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')).slice(0,16);
if(games.length){
 const renderGames=()=>{
  gamesBar.replaceChildren();
  const chips=el('div','swapp-actus-game-options'+(gamesExpanded?' is-expanded':''));
  chips.id='swapp-actus-available-games';
  for(const game of ['',...games]){
   const b=el('button','swapp-actus-game-chip'+(activeGame===game?' active':''),game||'Tous les jeux');
   b.type='button';b.setAttribute('aria-pressed',String(activeGame===game));
   b.onclick=()=>{activeGame=game;renderGames();update();updateLives()};
   chips.append(b);
  }
  gamesBar.append(chips);
  if(games.length>4){
   const toggle=el('button','swapp-actus-games-more',gamesExpanded?'Réduire':'Voir tous les jeux');
   toggle.type='button';toggle.setAttribute('aria-controls',chips.id);toggle.setAttribute('aria-expanded',String(gamesExpanded));
   toggle.onclick=()=>{gamesExpanded=!gamesExpanded;renderGames()};
   gamesBar.append(toggle);
  }
 };
 renderGames();
}update()}catch(e){if(node.isConnected){const message=el('p','swapp-actus-state',e.message),retry=el('button','swapp-actus-go-live','Réessayer');retry.onclick=()=>{node.replaceChildren();showList(node)};feed.replaceChildren(message,retry)}}}
async function showArticle(node,slug){node.append(el('p','swapp-actus-state','Chargement de l’article…'));try{const a=await fetchJson('/api/actus/'+encodeURIComponent(slug));if(!node.isConnected)return;node.replaceChildren();node.classList.add('swapp-actus-reading');
const back=el('button','swapp-actus-go-back','← Toutes les actualités');back.type='button';back.onclick=home;const nav=el('nav','swapp-actus-reader-nav');nav.setAttribute('aria-label','Retour à la rubrique Actualités');nav.append(back);node.append(nav);
const article=el('article','swapp-actus-article');
const heading=el('header','swapp-reader-hero swapp-immersive-hero');
const heroCopy=el('div','swapp-immersive-content');
// The image belongs to the article environment, not to the header.
const heroImage=url(a.image?.url||a.imageUrl);
const scene=el('div','swapp-article-scene');
scene.setAttribute('aria-hidden','true');
if(heroImage){
 const sceneImage=el('img');
 sceneImage.src=heroImage;sceneImage.alt='';sceneImage.decoding='async';sceneImage.fetchPriority='high';
 sceneImage.onerror=()=>{scene.classList.remove('has-art');sceneImage.remove()};
 scene.append(sceneImage);scene.classList.add('has-art');
}
node.prepend(scene);
const kicker=el('div','swapp-reader-kicker');
kicker.append(el('span','swapp-reader-kicker-main',a.category||'Actualité'));
if(a.game)kicker.append(el('span','swapp-reader-kicker-game',a.game));
heroCopy.append(kicker,el('h1','',a.title));
if(a.summary)heroCopy.append(el('p','swapp-actus-summary',a.summary));
heroCopy.append(el('p','swapp-actus-author',[a.author,date(a.publishedAt||a.originalPublishedAt)].filter(Boolean).join(' · ')));
heading.append(heroCopy);article.append(heading);
if(heroImage&&a.image?.credit)heroCopy.append(el('p','swapp-immersive-credit',a.image.credit));
const controls=el('div','swapp-reader-controls');const words=String(a.body||'').trim().split(/\s+/).filter(Boolean).length;controls.append(el('span','swapp-read-time',Math.max(1,Math.ceil(words/220))+' min de lecture'));
const share=el('button','swapp-reader-share','Partager l’article');share.type='button';share.onclick=async()=>{const address=location.origin+'/actus/'+encodeURIComponent(slug);try{if(navigator.share){await navigator.share({title:a.title,url:address});return}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(address);share.textContent='Lien copié';return}}catch(e){if(e.name==='AbortError')return}share.textContent='Copier le lien : '+address};controls.append(share);if(a.game){const jump=el('a','swapp-reader-live-jump','Voir les lives du jeu ↓');jump.href='#swapp-article-lives';jump.onclick=e=>{const target=article.querySelector('#swapp-article-lives');if(!target)return;e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};controls.append(jump)}heroCopy.append(controls);
// Artwork remains behind the heading. Reading progress is now a small TOC label,
// not a second horizontal line underneath the SWAPP navigation.
const reading=el('div','swapp-article-reading');
const body=el('div','swapp-actus-body');body.id='article-content';paragraphContent(body,a.body);
const sections=[...body.querySelectorAll('h2,h3')];
const toc=el('nav','swapp-reader-toc');
toc.setAttribute('aria-label','Sommaire de l’article');
toc.append(el('strong','','Dans cet article'));
function addTocLink(title,target,subsection=false){
 const link=el('a',subsection?'subsection':'',title);
 link.href='#'+target;
 link.onclick=e=>{const destination=article.querySelector('#'+target);if(!destination)return;e.preventDefault();destination.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});history.replaceState(history.state,'',location.pathname+'#'+target)};
 toc.append(link);
}
if(sections.length<2)addTocLink('Introduction','article-content');
for(const [i,heading] of sections.entries()){
 heading.id='section-'+(i+1);
 addTocLink(heading.textContent,heading.id,heading.tagName==='H3');
}
if(!sections.length){
 if(a.sources?.some(source=>url(source.url)))addTocLink('Sources et références','swapp-article-sources');
 if(a.game)addTocLink('Créateurs en direct','swapp-article-lives');
}
reading.append(toc);
reading.append(body);article.append(reading);window.SwappArticleExtras?.mount(article,a);
if(a.sources?.length){const sources=el('aside','swapp-actus-sources swapp-reader-source-panel');sources.id='swapp-article-sources';const intro=el('div','swapp-reader-source-intro');intro.append(el('span','swapp-reader-source-icon','↗'),el('div','swapp-reader-source-copy'));intro.lastChild.append(el('h2','','Sources'),el('p','','Retrouver les références de cet article'));sources.append(intro);const sourceLinks=el('div','swapp-reader-source-links');sources.append(sourceLinks);for(const source of a.sources){const address=url(source.url);if(!address)continue;const link=el('a','',source.label||'Source originale');link.href=address;link.target='_blank';link.rel='noopener noreferrer';link.className='swapp-reader-source-link';link.append(el('span','',' ↗'));sourceLinks.append(link)}if(sourceLinks.children.length)article.append(sources);}
if(a.game){const games=el('section','swapp-actus-related swapp-reader-live-panel');games.id='swapp-article-lives';games.append(el('h2','','En direct sur '+a.game),el('p','swapp-actus-live-status','Créateurs qui jouent à ce jeu actuellement'));article.append(games);
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matches=(x,y)=>{x=normal(x);y=normal(y);return !!(x&&y&&(x===y||(x.length>=7&&y.includes(x))||(y.length>=7&&x.includes(y))))};
fetchJson('/api/discovery/game-lives?limit=12&game='+encodeURIComponent(a.game)).then(data=>{if(!games.isConnected)return;const seen=new Set();const streams=(Array.isArray(data.items)?data.items:[]).filter(x=>{const login=String(x.login||'').toLowerCase(),platform=String(x.platform||'').toLowerCase(),key=platform+':'+login;if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||!matches(a.game,x.game_name||x.game||x.category))return false;seen.add(key);return true}).sort((x,y)=>Number(['swapp','oryon'].includes(String(y.platform||'').toLowerCase()))-Number(['swapp','oryon'].includes(String(x.platform||'').toLowerCase()))||Number(y.viewer_count||0)-Number(x.viewer_count||0));games.replaceChildren(el('h2','','En direct sur '+a.game));if(!streams.length){games.append(el('p','swapp-actus-live-status','Aucun live correspondant trouvé pour le moment.'));return;}const grid=el('div','swapp-reader-live-grid');for(const stream of streams){const login=String(stream.login||'').toLowerCase();if(!/^[a-z0-9_]{2,25}$/.test(login))continue;const native=['swapp','oryon'].includes(String(stream.platform||'').toLowerCase());const link=el(native?'a':'div','swapp-reader-live-card');const streamHref=native?'/'+encodeURIComponent(login):'https://www.twitch.tv/'+encodeURIComponent(login);if(native)link.href=streamHref;const imgSrc=url(stream.thumbnail_url);const coverBox=el('div','swapp-reader-live-cover');if(imgSrc){const img=el('img');img.src=imgSrc;img.alt='';img.loading='lazy';coverBox.append(img)}coverBox.append(el('span','swapp-reader-live-badge','● EN DIRECT'));const info=el('div','swapp-reader-live-info');info.append(el('b','',stream.display_name||login),el('small','',stream.title||'Regarder ce live'));link.append(coverBox,info);
if(!native){
  const actions=el('div','swapp-reader-live-actions');
  const canEmbed=!!window.SwappArticlePlayer?.canEmbed?.(window.innerWidth,window.innerHeight);
  if(canEmbed){
    const mini=el('button','swapp-reader-live-inline','▶ Regarder ici');
    mini.type='button';
    mini.setAttribute('aria-label','Regarder '+(stream.display_name||login)+' dans un mini-lecteur');
    mini.onclick=()=>{
      const opened=window.SwappArticlePlayer?.open({login,name:stream.display_name||login,game:a.game,source:mini});
      if(!opened)window.open(streamHref,'_blank','noopener');
    };
    actions.append(mini);
  }
  const full=el('a','swapp-reader-live-full',canEmbed?'Voir la chaîne ↗':'Voir le live ↗');
  full.href=streamHref;full.target='_blank';full.rel='noopener noreferrer';
  full.onclick=event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const opened=window.SwappArticlePlayer?.openFull({login,name:stream.display_name||login,game:a.game});
    if(opened)event.preventDefault();
  };
  actions.append(full);
  link.append(actions);
}
grid.append(link)}if(grid.children.length){games.append(el('p','swapp-actus-live-status',streams.length+' créateur'+(streams.length>1?'s':'')+' en direct sur ce jeu'));const cards=[...grid.children];const visible=3;cards.forEach((card,i)=>{if(i>=visible)card.hidden=true});games.append(grid);if(cards.length>visible){const more=el('button','swapp-reader-live-more','Voir les '+(cards.length-visible)+' autres lives');more.type='button';more.setAttribute('aria-expanded','false');more.onclick=()=>{const expanded=more.getAttribute('aria-expanded')==='true';cards.forEach((card,i)=>{card.hidden=expanded&&i>=visible});more.setAttribute('aria-expanded',String(!expanded));more.textContent=expanded?'Voir les '+(cards.length-visible)+' autres lives':'Voir moins de lives';};games.append(more)}}}).catch(()=>{if(games.isConnected){games.replaceChildren(el('h2','','En direct sur '+a.game),el('p','swapp-actus-live-status','Lives momentanément indisponibles.'))}});
}
const recommend=el('details','swapp-reader-next');recommend.open=true;
const recommendHeading=el('summary','','À découvrir ensuite');
const recommendations=el('div','swapp-reader-next-list');
recommend.append(recommendHeading,recommendations);
const commercial=(a.commercialLinks?.length?null:window.SwappInstantGaming?.forArticle?.(a));
if(commercial){
 const partner=el('aside','swapp-affiliate-offer');
 partner.setAttribute('aria-label','Lien affilié Instant Gaming');
 partner.append(el('span','swapp-affiliate-kicker','PARTENAIRE · LIEN AFFILIÉ'));
 partner.append(el('strong','swapp-affiliate-game',commercial.game));
 partner.append(el('span','swapp-affiliate-platform',commercial.platform));
 const shopLink=el('a','swapp-affiliate-link','Voir le jeu sur Instant Gaming ↗');
 shopLink.href=commercial.url;shopLink.target='_blank';
 shopLink.rel='sponsored nofollow noopener noreferrer';
 partner.append(shopLink);
 partner.append(el('small','swapp-affiliate-disclosure','SWAPP peut toucher une commission. Prix, stock et région à vérifier chez le marchand.'));
 recommend.append(partner);
}
reading.append(recommend);
const fillRecommendations=list=>{if(!recommend.isConnected)return;recommendations.replaceChildren();const base=String(a.game||'').toLocaleLowerCase('fr');const baseTokens=new Set(String(a.title||'').toLocaleLowerCase('fr').split(/[^\\p{L}\\p{N}]+/u).filter(w=>w.length>=5));const candidates=list.filter(x=>x.slug!==slug&&x.slug!==a.slug&&slugOk(x.slug)).sort((x,y)=>{const score=z=>{const game=Number(!!base&&String(z.game||'').toLocaleLowerCase('fr')===base)*10;const category=Number(!!a.category&&z.category===a.category)*2;const common=String(z.title||'').toLocaleLowerCase('fr').split(/[^\\p{L}\\p{N}]+/u).filter(w=>baseTokens.has(w)).length;const time=Number(new Date(z.publishedAt||z.originalPublishedAt||0))||0;return [game+category+Math.min(common,3),time]};const sy=score(y),sx=score(x);return sy[0]-sx[0]||sy[1]-sx[1]}).slice(0,3);candidates.forEach(x=>{
 const link=el('a','swapp-reader-next-item');link.href='/actus/'+encodeURIComponent(x.slug);
 const imgUrl=url(x.image?.url||x.imageUrl);
 if(imgUrl){const img=el('img','swapp-reader-next-thumb');img.src=imgUrl;img.alt='';img.loading='lazy';link.append(img);}
 const content=el('span','swapp-reader-next-copy');
 content.append(el('small','',x.game||x.category||'Actualité'),el('strong','',x.title));
 link.append(content);
 link.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();window.SwappLocalTastes?.record?.(x.game);open(x.slug)};
 recommendations.append(link);
});
if(!recommendations.children.length){
 const all=el('a','swapp-reader-next-all','Explorer toute l’actualité →');
 all.href='/actus';all.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();home()};recommendations.append(all);
}};
node.append(article);window.SwappArticleFeedback?.mountArticle(article,a.slug||slug);if(items.length)fillRecommendations(items);else fetchJson('/api/actus').then(data=>{items=Array.isArray(data.articles)?data.articles:[];fillRecommendations(items)}).catch(()=>fillRecommendations([]));
}catch(e){
 if(!node.isConnected)return;
 const status=el('p','swapp-actus-state',e.message||'Article temporairement indisponible.');
 const actions=el('div','swapp-actus-recovery');
 const retry=el('button','swapp-actus-go-live','Réessayer');
 retry.type='button';
 retry.onclick=()=>{node.replaceChildren();showArticle(node,slug)};
 const back=el('a','swapp-actus-go-back','← Toutes les actualités');
 back.href='/actus';
 back.onclick=event=>{
  if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();home();
 };
 actions.append(retry,back);
 node.replaceChildren(status,actions);
}}
function render(target){if(!target)return;window.SwappArticlePlayer?.close();target.replaceChildren();const node=el('div','swapp-actus-native');target.append(node);const parts=location.pathname.split('/').filter(Boolean);return parts.length===2&&parts[0]==='actus'&&slugOk(parts[1])?showArticle(node,parts[1]):showList(node);}
function open(slug){if(!slugOk(slug))return;history.pushState({view:'actus'},'','/actus/'+encodeURIComponent(slug));render(document.getElementById('actus'));window.scrollTo(0,0);}
function home(){history.pushState({view:'actus'},'','/actus');render(document.getElementById('actus'));window.scrollTo(0,0);}
window.SwappActus=Object.freeze({render,open,home});
})();