// SWAPP Mes jeux — explicit follows, only local preferences, no tracking or polling.
(()=>{
 'use strict';
 const KEY='swapp:followed-games:v1',LIMIT=30,SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
 const validSlug=s=>typeof s==='string'&&s.length>=3&&s.length<=90&&SLUG.test(s);
 const cleanName=v=>String(v||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,100);
 const now=()=>new Date().toISOString();
 function read(){
  try{
   const stored=JSON.parse(localStorage.getItem(KEY)||'null');
   if(!stored||stored.version!==1||!Array.isArray(stored.games))return[];
   const ids=new Set();
   return stored.games.filter(item=>{
    if(!validSlug(item?.slug)||ids.has(item.slug))return false;
    ids.add(item.slug);return true;
   }).slice(0,LIMIT).map(item=>({
    slug:item.slug,game:cleanName(item.game)||item.slug,
    followedAt:typeof item.followedAt==='string'&&!Number.isNaN(Date.parse(item.followedAt))?item.followedAt:now(),
    seenAt:typeof item.seenAt==='string'&&!Number.isNaN(Date.parse(item.seenAt))?item.seenAt:''
   }));
  }catch{return []}
 }
 function save(games){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,games}));return true}
  catch{return false}
 }
 let games=read();
 const root=document.querySelector('[data-swapp-library-root]');
 const $=q=>document.querySelector(q);
 const $$=q=>[...document.querySelectorAll(q)];
 const status=(message)=>{
  const element=$('[data-my-games-status]');
  if(element)element.textContent=message;
 };
 function isFollowing(slug){return games.some(game=>game.slug===slug)}
 function articleDate(article){
  const d=article.dataset.storyDate;
  const stamp=Date.parse(d||'');
  return Number.isFinite(stamp)?stamp:0;
 }
 function unseen(card,item){
  if(!item)return 0;
  const since=Math.max(Date.parse(item.followedAt)||0,Date.parse(item.seenAt)||0);
  return [...card.querySelectorAll('[data-story-date]')].filter(a=>articleDate(a)>since).length;
 }
 function update(){
  const favorites=new Map(games.map(item=>[item.slug,item]));
  $$('[data-swapp-follow-game]').forEach(button=>{
   const slug=button.dataset.gameSlug;
   const picked=favorites.has(slug);
   button.setAttribute('aria-pressed',String(picked));
   button.textContent=picked?'✓ Jeu suivi':'＋ Suivre ce jeu';
   button.setAttribute('aria-label',(picked?'Ne plus suivre ':'Suivre ')+(button.dataset.gameName||slug));
  });
  $$('[data-swapp-favorites-count]').forEach(el=>el.textContent=String(games.length));
  if(!root)return;
  const followed=root.querySelector('[data-my-games-followed]');
  const explore=root.querySelector('[data-my-games-available]');
  const empty=root.querySelector('[data-my-games-empty]');
  const count=root.querySelector('[data-my-games-count]');
  const cards=[...root.querySelectorAll('[data-swapp-game-card]')];
  const selected=[],others=[];
  for(const card of cards){
   const item=favorites.get(card.dataset.gameSlug);
   const target=item?selected:others;
   target.push(card);
   const label=card.querySelector('[data-my-games-news]');
   const mark=card.querySelector('[data-my-games-mark-seen]');
   const countNew=unseen(card,item);
   if(label){label.hidden=!item||countNew===0;label.textContent=countNew+' nouvelle'+(countNew>1?'s':'')+' actu'+(countNew>1?'s':'');}
   if(mark)mark.hidden=!item||countNew===0;
  }
  // Keep saved titles in user's chosen order; never sort by an engagement score.
  selected.sort((a,b)=>games.findIndex(g=>g.slug===a.dataset.gameSlug)-games.findIndex(g=>g.slug===b.dataset.gameSlug));
  followed.replaceChildren(...selected);
  explore.replaceChildren(...others);
  if(empty)empty.hidden=selected.length>0;
  if(count)count.textContent=String(selected.length);
  const search=root.querySelector('[data-my-games-search]');
  const q=(search?.value||'').trim().toLocaleLowerCase('fr');
  for(const card of others)card.hidden=!!q&&!card.dataset.gameName.toLocaleLowerCase('fr').includes(q);
  const none=root.querySelector('[data-my-games-no-match]');
  if(none)none.hidden=!q||others.some(card=>!card.hidden);
 }
 document.addEventListener('click',event=>{
  const follow=event.target.closest('[data-swapp-follow-game]');
  if(follow){
   const slug=follow.dataset.gameSlug,game=cleanName(follow.dataset.gameName);
   if(!validSlug(slug)||!game)return;
   const existing=games.find(x=>x.slug===slug);
   const next=existing?games.filter(x=>x.slug!==slug):[...games,{slug,game,followedAt:now(),seenAt:''}];
   if(!existing&&next.length>LIMIT){status('Tu peux suivre 30 jeux au maximum.');return}
   if(!save(next)){status('Enregistrement local indisponible. Autorise le stockage dans ton navigateur.');return}
   games=next;update();
   status(existing?'Jeu retiré de ta sélection.':'Jeu ajouté. Les prochaines actualités seront signalées ici.');
   return;
  }
  const seen=event.target.closest('[data-my-games-mark-seen]');
  if(seen){
   const slug=seen.closest('[data-swapp-game-card]')?.dataset.gameSlug;
   const next=games.map(x=>x.slug===slug?{...x,seenAt:now()}:x);
   if(!save(next)){status('Impossible de sauvegarder cette action.');return}
   games=next;update();status('Nouveautés marquées comme consultées.');
  }
 });
 if(root){
  root.querySelector('[data-my-games-search]')?.addEventListener('input',update);
  root.querySelector('[data-my-games-clear]')?.addEventListener('click',()=>{
   if(!games.length)return;
   // Deliberately explicit: clearing your library does not delete the account.
   if(!window.confirm('Ne plus suivre tous les jeux sur cet appareil ?'))return;
   if(!save([])){status('Impossible de modifier la sélection.');return}
   games=[];update();status('Sélection locale effacée.');
  });
 }
 // Your account menu is rebuilt by the SPA: attach a single durable, low-noise link.
 const menu=$('#userMenu');
 function menuLink(){
  if(!menu||menu.querySelector('[data-my-games-menu]'))return;
  const a=document.createElement('a');
  a.href='/mes-jeux';a.dataset.myGamesMenu='1';
  a.textContent='Mes jeux suivis';
  const badge=document.createElement('small');badge.setAttribute('data-swapp-favorites-count','');badge.textContent=String(games.length);
  badge.setAttribute('aria-label',' jeux suivis');
  a.append(' ',badge);menu.appendChild(a);
 }
 if(menu){
  menuLink();
  new MutationObserver(menuLink).observe(menu,{childList:true});
 }
 window.addEventListener('storage',e=>{
  if(e.key===KEY||e.key===null){games=read();update();}
 });
 update();
})();