'use strict';
(()=> {
 const root=document.querySelector('.ss');if(!root)return;
 const $=s=>root.querySelector(s), results=$('#ss-results'),feedback=$('#ss-feedback'),count=$('#ss-count');
 // Submission is handled by the dedicated /serveurs/creer page.
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
 const state={servers:[],loading:false,request:0,page:1,total:0,hasMore:false,status:'loading',errorMessage:'',errorKind:''};
 // Category pages already contain verified published listings in their initial HTML.
 // Do not erase them if the API is rejected or temporarily unavailable.
 let keepServerRendered=!!results.querySelector('.ss-category-preloaded');
 const more=make('button','ss-load-more','Afficher 24 serveurs supplémentaires');
 more.type='button';more.hidden=true;more.setAttribute('aria-label','Charger la page suivante du classement');
 results.after(more);
 more.addEventListener('click',()=>load(false));

 const gameSlug=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75);
 const setGame=name=>{
  const next='/serveurs'+(name?'/'+encodeURIComponent(gameSlug(name)):'');
  if(location.pathname!==next)location.assign(next);
 };
 if(root.dataset.ssCurrentGame)$('#ss-game').value=root.dataset.ssCurrentGame;


 // Genuine, game-matched publisher/store key art, never a generic or unrelated illustration.
 // Minecraft is not on Steam: use Twitch's actual Minecraft category artwork.
 const STEAM_GAME_IDS=Object.freeze({
  'GTA V / FiveM':271590,'GTA RP':271590,'Rust':252490,'DayZ':221100,
  'Cyberpunk 2077':1091500,'Arma 3':107410,'Arma Reforger':1874880,
  'ARK Survival Ascended':2399830,'ARK Survival Evolved':346110,
  'Project Zomboid':108600,'Palworld':1623730,'Red Dead Redemption 2':1174180,
  'Garry’s Mod':4000,'Valheim':892970,'Enshrouded':1203620,
  'Conan Exiles':440900,'SCUM':513710,'Counter-Strike 2':730,
  '7 Days to Die':251570,'Eco':382310,'V Rising':1604030,
  'Unturned':304930,'Space Engineers':244850,'Dune Awakening':1172710,
  'Hell Let Loose':686810,'Squad':393380,'Terraria':105600,
  'No Man’s Sky':275850,'Satisfactory':526870,
  'Don’t Starve Together':322330,'Lethal Company':1966720
 });
 const gameArt=name=>{
  if(name==='Minecraft')return 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-720x960.jpg';
  const id=STEAM_GAME_IDS[name];
  return id?'https://cdn.cloudflare.steamstatic.com/steam/apps/'+id+'/header.jpg':'';
 };
 function artInto(host,name,preferred='',ownerName=''){
  const sources=[preferred,gameArt(name)].filter(Boolean);
  if(!sources.length)return;
  let index=0;
  const img=make('img','ss-game-image');
  img.alt=preferred&&ownerName?'Bannière de '+ownerName:'Visuel du jeu '+name;
  img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.onerror=()=>{if(++index<sources.length){img.src=sources[index];img.alt='Visuel du jeu '+name;host.classList.remove('ss-cover-custom')}else img.remove()};
  img.src=sources[0];host.prepend(img);
 }
 const officialGameTiles=Array.from(root.querySelectorAll('.ss-game-tile[data-ss-game]'));
 for(const tile of officialGameTiles){const game=tile.dataset.ssGame;if(game)artInto(tile.querySelector('.ss-game-art'),game)}
 const featuredHost=$('#ss-featured-games');
 const featuredGames=['GTA V / FiveM','Minecraft','Rust'];
 for(const game of featuredGames){
  if(!featuredHost)break;
  const card=make('a','ss-featured-tile');card.href='/serveurs/'+gameSlug(game);card.dataset.ssFeatured=game;
  const picture=make('span','ss-featured-art');artInto(picture,game);
  const copy=make('span','ss-featured-copy');
  copy.append(make('small','', 'UNIVERS MULTIJOUEUR'),make('strong','',game));
  const amount=make('span','ss-featured-count','Classement SWAPP');
  amount.dataset.ssFeaturedCount=game;
  copy.append(amount);card.append(picture,copy);
  // Keep a real anchor: the server renders the category page even with zero listings.
  featuredHost.append(card);
 }
 function displayGameCounts(counts){
  const n=counts&&typeof counts==='object'?counts:null;
  for(const item of root.querySelectorAll('[data-ss-game-count],[data-ss-featured-count]')){
   const key=item.dataset.ssGameCount??item.dataset.ssFeaturedCount;
   const value=n?(key===''?Object.values(n).reduce((sum,num)=>sum+(Number.isSafeInteger(Number(num))&&Number(num)>=0?Number(num):0),0):Object.prototype.hasOwnProperty.call(n,key)?Number(n[key]):0):null;
   item.textContent=value===null||!Number.isSafeInteger(value)||value<0?'Voir les serveurs':value.toLocaleString('fr-FR')+' serveur'+(value===1?'':'s')+' inscrit'+(value===1?'':'s');
  }
 }

 const gameThemes={
  'Discord / Multigaming':['#9380ff','#ea55e5'],'Minecraft':['#72e898','#54b8dd'],
  'GTA RP':['#fc64a9','#875eff'],'GTA V / FiveM':['#fc64a9','#875eff'],
  'Cyberpunk 2077':['#f8e963','#ff5595'],'Rust':['#f2a056','#e45e48'],
  'DayZ':['#e2bd78','#c34b53'],'ARK Survival Ascended':['#67eebf','#63abf1']
 };
 const validHex=value=>/^#[\da-fA-F]{6}$/.test(String(value||''));
 const safeArt=(url,id,kind)=>{
  if(typeof url!=='string')return '';
  if(/^https:\/\/[^<>"'\s]+$/i.test(url))return url;
  return url==='/media/serveurs/'+id+'/'+kind?url:'';
 };

 const serverCard=(s,i)=>{
  const article=make('article','ss-card ss-server-card');
  const palette=gameThemes[s.game]||['#8ceaf0','#9c67ff'];
  article.style.setProperty('--ss-brand-accent',validHex(s.accentColor)?s.accentColor:palette[0]);
  article.style.setProperty('--ss-brand-secondary',validHex(s.secondaryColor)?s.secondaryColor:palette[1]);
  // Give the community's own banner the entire cinematic cover, never a narrow sidebar.
  // The verified game's artwork is only a fallback, not a substitute for owner branding.
  const detailHref=s.slug&&/^[a-z0-9-]{6,90}$/.test(s.slug)?
   '/serveurs/'+encodeURIComponent(gameSlug(s.game))+'/'+encodeURIComponent(s.slug):'';
  const cover=safeArt(s.bannerUrl,s.id,'banner');
  const art=make(detailHref?'a':'div','ss-card-image ss-server-cover');
  if(detailHref){art.href=detailHref;art.setAttribute('aria-label','Découvrir la communauté '+s.name)}
  if(cover)art.classList.add('ss-cover-custom');
  artInto(art,s.game,cover,s.name);
  const mark=make('span','ss-server-logo');
  const logoUrl=safeArt(s.logoUrl,s.id,'logo');
  if(logoUrl){
   const logo=make('img');logo.src=logoUrl;logo.alt='Logo de '+s.name;logo.loading='lazy';
   logo.addEventListener('error',()=>{logo.remove();mark.textContent=String(s.name||'S').slice(0,1).toUpperCase()},{once:true});
   mark.append(logo);
  }else mark.textContent=String(s.name||'S').slice(0,1).toUpperCase();
  art.append(mark);
  const top=make('div','ss-card-top');
  if(Number.isInteger(s.rank)&&s.rank>0)top.append(make('span','ss-rank','#'+s.rank));
  top.append(make('span','ss-card-game',s.game));art.append(top);
  const caption=make('div','ss-cover-caption');
  // Full community title is enough; the repetitive banner label wasted vertical space.
  caption.append(make('h3','ss-cover-title',s.name));
  art.append(caption);
  const content=make('div','ss-card-content');
  const tagline=s.tagline?make('p','ss-server-tagline',s.tagline):null;
  const details=make('p','ss-description',s.description);
  const meta=make('div','ss-meta');
  if(s.region)meta.append(make('span','',s.region));
  const labels={fr:'Français',en:'English',es:'Español',de:'Deutsch',it:'Italiano',pt:'Português'};
  if(s.language&&labels[s.language])meta.append(make('span','',labels[s.language]));
  const created=s.createdAt?new Date(s.createdAt):new Date(NaN);
  if(Number.isFinite(created.getTime())){
   meta.append(make('span','','Ajouté le '+new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(created)));
   if(Date.now()-created.getTime()>=0&&Date.now()-created.getTime()<30*86400000){
    const fresh=make('span','ss-card-new','Nouveau');fresh.title='Ajouté sur SWAPP il y a moins de 30 jours';meta.append(fresh);
   }
  }
  const tags=make('div','ss-tags');(Array.isArray(s.tags)?s.tags:[]).slice(0,6).forEach(t=>tags.append(make('span','',t)));
  const number=n=>Number(n).toLocaleString('fr-FR');
  const validNum=n=>n===null||n===undefined||n===''?null:Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):null;
  const reviews=validNum(s.reviewCount),avg=Number(s.ratingAverage);
  const rated=reviews>0&&Number.isFinite(avg)&&avg>=1&&avg<=5;
  const rating=make('div','ss-card-rating');
  const star=make('span','ss-rating-stars','★★★★★');star.setAttribute('aria-hidden','true');
  star.style.setProperty('--ss-fill',(rated?Math.round(avg*20):0)+'%');
  const reviewLabel=rated?avg.toFixed(1).replace('.',',')+'/5 · '+number(reviews)+' avis':reviews===0?'Aucun avis':'Avis indisponibles';
  rating.setAttribute('aria-label',reviewLabel);
  rating.append(star,make('span','',reviewLabel));
  const metrics=make('div','ss-card-stats ss-card-facts');
  const fact=(value,label)=>{
   const cell=make('span','ss-card-fact');
   cell.append(make('strong','',value),make('small','',label));metrics.append(cell);
  };
  const votes=validNum(s.votes_month),clicks=validNum(s.clicksTotal),lfg=validNum(s.lfgCount),capacity=validNum(s.capacity);
  if(votes!==null)fact(number(votes),'votes ce mois');
  if(clicks!==null)fact(number(clicks),'clics SWAPP');
  if(s.game==='Discord / Multigaming'){
   const members=validNum(s.discordMembers),online=validNum(s.discordOnline);
   if(members!==null)fact('≈ '+number(members),'membres Discord');
   if(online!==null)fact('≈ '+number(online),'en ligne Discord');
   if(members===null&&online===null)fact('Indisponible','effectif Discord');
  }else fact(capacity!==null&&capacity>0?number(capacity):'Non renseignée','capacité / slots');
  if(lfg!==null)fact(number(lfg),'joueurs disponibles');
  const heading=make('h3','ss-card-heading');
  const headingLink=make('a','',s.name);headingLink.href=detailHref||'#';
  heading.append(headingLink);
  content.append(heading,rating);
  if(tagline)content.append(tagline);
  content.append(details,meta);
  if(tags.childElementCount)content.append(tags);
  content.append(metrics);
  const actions=make('div','ss-card-actions'),vote=make('button','ss-vote');
  const heart=make('span','ss-heart','♥');heart.setAttribute('aria-hidden','true');
  vote.append(heart,make('span','','Voter'));vote.setAttribute('aria-label','Voter pour '+s.name);
  vote.type='button';
  vote.addEventListener('click',async()=>{
   vote.disabled=true;
   try{
    const r=await fetch('/api/swapp/serveurs/'+encodeURIComponent(s.id)+'/vote',{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json'}});
    const data=await r.json();
    if(!r.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP pour voter.',vote_deja_effectue:'Tu as déjà voté pour ce serveur. Nouveau vote dans deux heures.',vote_daily_limit:'Limite de 3 votes sur 24 heures atteinte pour ce serveur.',origine_invalide:'Session invalide, recharge la page.'})[data.error]||'Vote indisponible.');
    feedback.textContent='Vote enregistré pour '+s.name+'.';await load();
   }catch(e){feedback.textContent=e.message}finally{vote.disabled=false}
  });
  actions.append(vote);
  if(detailHref){
   const detail=make('a','ss-details','Voir la fiche');
   detail.href=detailHref;
   actions.append(detail);
   const teammates=make('a','ss-community-quick','Trouver des joueurs');teammates.href=detail.href+'#joueurs';actions.append(teammates);
   const streams=make('a','ss-community-quick','Lives associés');streams.href=detail.href+'#directs';actions.append(streams);
  }
  if(s.canEdit&&s.slug){
   const edit=make('a','ss-owner-edit','Personnaliser');
   edit.href='/serveurs/gerer/'+encodeURIComponent(s.slug);
   actions.append(edit);
  }
  if(s.website){const link=make('a','ss-join','Rejoindre ↗');link.href=s.website;link.target='_blank';link.rel='noopener noreferrer nofollow';actions.append(link)}
  if(s.joinAddress){const address=make('button','ss-address','Copier l’adresse');address.type='button';address.onclick=async()=>{try{await navigator.clipboard.writeText(s.joinAddress);address.textContent='Adresse copiée'}catch{address.textContent=s.joinAddress}};actions.append(address)}
  content.append(actions);article.append(art,content);return article;
 };
 const draw=()=>{
  const items=state.servers;
  if(state.status==='error'&&keepServerRendered&&!$('#ss-q').value.trim()){
   // Keep already rendered published listings and their verified count intact.
   more.hidden=true;more.disabled=false;return;
  }
  count.hidden=state.status==='error';
  if(state.status!=='error')count.textContent=state.total.toLocaleString('fr-FR')+' serveur'+(state.total===1?'':'s')+' référencé'+(state.total===1?'':'s');
  more.hidden=!state.hasMore||state.status==='error';more.disabled=state.loading;
  keepServerRendered=false;
  results.replaceChildren(...items.map(serverCard));
  if(!items.length){
   const empty=make('div','ss-empty');
   if(state.status==='error'){
    const blocked=state.errorKind==='challenge';
    empty.append(make('h3','',blocked?'Vérification du site nécessaire':'Classement temporairement indisponible'),
     make('p','',blocked?'La protection du site empêche actuellement le chargement du classement. Vérifie ton accès, puis réessaie.':'Le classement ne répond pas actuellement. Les inscriptions existantes ne sont pas modifiées.'));
    if(blocked){
     const verify=make('a','ss-empty-external','Vérifier mon accès au site');
     verify.href='/api/swapp/serveurs';verify.target='_blank';verify.rel='noopener noreferrer';empty.append(verify);
    }
    const retry=make('button','ss-empty-retry','Réessayer');retry.type='button';retry.addEventListener('click',()=>load());empty.append(retry);
   }else if($('#ss-q').value.trim()){
    empty.append(make('h3','','Aucun serveur trouvé pour cette recherche'),
     make('p','','Modifie tes critères de recherche ou explore les autres communautés.'));
   }else{
    const selected=$('#ss-game').value;
    empty.append(make('h3','',selected?'Aucun serveur inscrit sur SWAPP pour '+selected+'.':'Aucun serveur inscrit sur SWAPP pour le moment.'),
     make('p','','Sois le premier à présenter ta communauté et à rejoindre ce classement.'));
    const create=make('a','ss-empty-create','Ajouter le premier serveur');
    create.href='/serveurs/creer'+(selected?'?jeu='+encodeURIComponent(selected):'');
    empty.append(create);
    const external=document.querySelector('.ss-partner-card[href]');
    if(selected&&external){
     const other=make('a','ss-empty-external','Voir le classement externe ↗');
     other.href=external.href;other.target='_blank';other.rel='noopener noreferrer nofollow';empty.append(other);
    }
   }
   results.append(empty)
  }
 };
 // HTTP 503 from SWAPP (JSON) and a browser challenge (HTML) are different.
 async function apiFailure(response){
  const mime=(response.headers.get('content-type')||'').toLowerCase();
  if(mime.includes('text/html')){
   const html=(await response.text().catch(()=>'' )).slice(0,16000);
   const challenge=/checking your browser|verify that you are not a robot|recaptcha|captcha|just a moment|browser verification|challenge-platform/i.test(html);
   return Object.assign(Error('Classement temporairement indisponible'),{kind:challenge?'challenge':'upstream',httpStatus:response.status});
  }
  return Object.assign(Error('Classement temporairement indisponible'),{kind:mime.includes('json')?'api':'network',httpStatus:response.status});
 }
 async function load(reset=true){
  if(state.loading&&!reset)return;
  const seq=++state.request;
  if(reset){state.page=1;state.servers=[];state.total=0;state.hasMore=false;state.status='loading'}
  const requestedPage=reset?1:state.page+1;
  const params=new URLSearchParams({q:$('#ss-q').value.trim(),game:$('#ss-game').value,sort:$('#ss-sort').value,page:String(requestedPage)});
  state.loading=true;more.disabled=true;
  feedback.textContent='Mise à jour du classement…';
  try{
   const res=await fetch('/api/swapp/serveurs?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(!res.ok)throw await apiFailure(res);
   if(!(res.headers.get('content-type')||'').toLowerCase().includes('application/json'))
    throw await apiFailure(res);
   const data=await res.json();if(seq!==state.request)return;
   if(!data||!Array.isArray(data.servers)||!Number.isFinite(Number(data.total)))
    throw Error('Classement temporairement indisponible');
   const items=data.servers;
   state.page=requestedPage;state.total=Number(data.total)||0;state.hasMore=Boolean(data.hasMore);state.status='ready';state.errorMessage='';state.errorKind='';
   state.servers=reset?items:state.servers.concat(items);
   displayGameCounts(data.gameCounts);
   feedback.textContent=data.ranking==='temporarily_unavailable'?'Les fiches sont accessibles ; les votes ne sont pas disponibles pour le moment.':'Classement basé sur les votes enregistrés ce mois-ci, sans faux statut en ligne.';
  }catch(e){
   if(seq!==state.request)return;
   if(reset){
    displayGameCounts(null);state.servers=[];state.total=0;state.status='error';
    state.errorMessage='Classement temporairement indisponible';state.errorKind=e?.kind||'api';
   }
   // One error surface only, whether the category was SSR-rendered or not.
   feedback.textContent='';
   console.warn('[SWAPP SERVEURS] Echec chargement annuaire',{type:e?.kind||'unknown',httpStatus:e?.httpStatus||null});
  }finally{
   if(seq===state.request){state.loading=false;draw();more.disabled=false}
  }
 }
 let timer;$('#ss-q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250)});
 $('#ss-game').addEventListener('change',()=>setGame($('#ss-game').value));$('#ss-sort').addEventListener('change',load);
 function syncGameChips(){
  root.querySelectorAll('[data-ss-game]').forEach(b=>{
   const selected=b.dataset.ssGame===$('#ss-game').value;
   b.classList.toggle('is-selected',selected);
   if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
 }
 // Category tiles are real links; do not hijack them with pushState.
 // Their server-rendered destinations exist even when no server is registered.
 syncGameChips();
 const gameSearch=$('#ss-game-search');
 if(gameSearch)gameSearch.addEventListener('input',()=>{
  const term=gameSearch.value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for(const tile of officialGameTiles){
   const name=tile.dataset.ssGame.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   tile.hidden=!!term&&!name.includes(term);
  }
 });
 const admin=$('#ss-review'),adminRefresh=$('#ss-review-refresh');
 if(admin&&adminRefresh){
  async function review(){
   admin.textContent='Chargement des propositions…';
   try{
    const response=await fetch('/api/swapp/serveurs/moderation',{credentials:'same-origin'});
    if(!response.ok)throw Error('Modération indisponible.');
    const data=await response.json();
    const servers=Array.isArray(data.servers)?data.servers:[];
    admin.replaceChildren();
    if(!servers.length){admin.append(make('p','','Aucune proposition en attente.'));return}
    for(const item of servers){
     const card=make('article','ss-review-card');
     card.append(make('h3','',item.name+' · '+item.game),make('p','',item.description),make('p','',item.website||item.joinAddress||'Aucun lien'));
     for(const [decision,label] of [['published','Approuver'],['rejected','Refuser']]){
      const button=make('button','',label);button.type='button';
      button.onclick=async()=>{
       button.disabled=true;
       try{
        const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(item.id)+'/moderation',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({status:decision})});
        if(!response.ok)throw Error('Décision impossible.');
        await review();await load();
       }catch(error){admin.prepend(make('p','',error.message));button.disabled=false}
      };
      card.append(button);
     }
     admin.append(card);
    }
   }catch(error){admin.textContent=error.message}
  }
  adminRefresh.onclick=review;review();
 }

 load();
})();