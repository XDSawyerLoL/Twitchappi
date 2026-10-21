/* SWAPP / X ↔ Discord. Real first-party HTML/CSS, no third-party embed.
 * X uses a share intent; Discord uses an article-link copy. A Discord
 * incoming webhook is not a server invite, so never display it publicly.
 */
(()=>{
 'use strict';
 const ARTICLE=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
 const text=(tag,className,value)=>{
  const node=document.createElement(tag);if(className)node.className=className;
  if(value!==undefined)node.textContent=value;return node;
 };
 function latestArticle(articles){
  return (Array.isArray(articles)?articles:[]).find(a=>a&&ARTICLE.test(String(a.slug||''))&&String(a.title||'').trim())||null;
 }
 function buildXIntent(article){
  const target=article?'https://swapp.tv/actus/'+article.slug:'https://swapp.tv/actus';
  const headline=article?String(article.title||'').trim().slice(0,135):'Toute l’actualité du jeu vidéo sur SWAPP';
  return 'https://x.com/intent/tweet?'+new URLSearchParams({
   text:'🎮 '+headline+' — à découvrir sur SWAPP',url:target
  }).toString();
 }
 function build(container,articles){
  if(!container||!container.isConnected)return null;
  const existing=container.querySelector('[data-swapp-social-bridge]');
  if(existing)return existing;
  const item=latestArticle(articles);
  const href=item?'https://swapp.tv/actus/'+item.slug:'https://swapp.tv/actus';
  const panel=text('section','swapp-social-bridge');panel.dataset.swappSocialBridge='1';
  panel.setAttribute('aria-labelledby','swapp-social-bridge-title');
  const kicker=text('div','swapp-social-bridge-kicker','SWAPP / LES ACTUS SE PARTAGENT');
  const intro=text('div','swapp-social-bridge-intro');
  intro.append(text('h2','', 'Fais circuler l’info. Fais vivre la communauté.'),
   text('p','','Deux façons de faire rayonner les jeux, les articles et les créateurs SWAPP.'));
  intro.querySelector('h2').id='swapp-social-bridge-title';
  const sides=text('div','swapp-social-bridge-sides');
  const x=text('div','swapp-social-bridge-side swapp-social-bridge-x');
  const xbrand=text('div','swapp-social-bridge-platform');
  const xicon=text('span','swapp-social-bridge-symbol','𝕏');
  xicon.setAttribute('aria-hidden','true');
  xbrand.append(xicon,text('span','swapp-social-bridge-name','X · FAIRE DÉCOUVRIR'));
  const xheadline=text('h3','', 'Une annonce qui voyage.');
  const xdesc=text('p','','Partage une actualité SWAPP avec ton réseau. Attire de nouveaux joueurs et donne de la visibilité aux créateurs du jeu.');
  const xlink=text('a','swapp-social-bridge-action','Partager l’article sur X ↗');
  xlink.href=buildXIntent(item);xlink.target='_blank';xlink.rel='noopener noreferrer';
  xlink.setAttribute('aria-label','Préparer une publication X avec le lien de l’article SWAPP');
  x.append(xbrand,xheadline,xdesc,xlink);
  const connection=text('div','swapp-social-bridge-connection');
  connection.setAttribute('aria-hidden','true');
  connection.append(text('span','','→'),text('span','','SWAPP'),text('span','','→'));
  const discord=text('div','swapp-social-bridge-side swapp-social-bridge-discord');
  const dbrand=text('div','swapp-social-bridge-platform');
  const dicon=text('span','swapp-social-bridge-symbol swapp-social-bridge-chat','◈');dicon.setAttribute('aria-hidden','true');
  dbrand.append(dicon,text('span','swapp-social-bridge-name','DISCORD · RASSEMBLER'));
  const dheadline=text('h3','','Une communauté qui revient.');
  const ddesc=text('p','','Prolonge la discussion dans ton salon Discord. Partage l’article, organise les échanges et retrouve les joueurs autour du même jeu.');
  const copy=text('button','swapp-social-bridge-action','Copier le lien pour Discord ↗');copy.type='button';
  const notice=text('span','swapp-social-bridge-notice','');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  copy.addEventListener('click',async()=>{
   try{
    if(!navigator.clipboard?.writeText)throw Error('clipboard_unavailable');
    await navigator.clipboard.writeText(href);
    notice.textContent='Lien de l’article copié. Colle-le dans ton salon Discord.';
    copy.textContent='Lien copié ✓';
   }catch{
    // Never imply the link was copied if a browser denied clipboard access.
    notice.textContent='Copie ce lien pour le partager dans Discord : '+href;
   }
  });
  discord.append(dbrand,dheadline,ddesc,copy,notice);
  sides.append(x,connection,discord);
  const footer=text('p','swapp-social-bridge-footnote','X pour découvrir · Discord pour échanger · SWAPP pour tout retrouver.');
  panel.append(kicker,intro,sides,footer);
  container.append(panel);
  return panel;
 }
 window.SwappSocialBridge={mount:build,buildXIntent,latestArticle};
})();