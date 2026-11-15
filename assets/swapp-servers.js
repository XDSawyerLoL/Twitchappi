'use strict';
(()=> {
 const root=document.querySelector('.ss');if(!root)return;
 const $=s=>root.querySelector(s), results=$('#ss-results'),feedback=$('#ss-feedback'),count=$('#ss-count');
 const dialog=$('#ss-dialog'),form=$('#ss-form'),status=$('#ss-form-status');
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
 const state={servers:[],loading:false,request:0};

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
 function artInto(host,name,preferred=''){
  const sources=[preferred,gameArt(name)].filter(Boolean);
  if(!sources.length)return;
  let index=0;
  const img=make('img','ss-game-image');
  img.alt='Visuel du jeu '+name;
  img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.onerror=()=>{if(++index<sources.length)img.src=sources[index];else img.remove()};
  img.src=sources[0];host.prepend(img);
 }
 const officialGameTiles=Array.from(root.querySelectorAll('.ss-game-tile[data-ss-game]'));
 for(const tile of officialGameTiles){const game=tile.dataset.ssGame;if(game)artInto(tile.querySelector('.ss-game-art'),game)}
 const featuredHost=$('#ss-featured-games');
 const featuredGames=['GTA V / FiveM','Minecraft','Rust'];
 for(const game of featuredGames){
  if(!featuredHost)break;
  const card=make('button','ss-featured-tile');card.type='button';card.dataset.ssFeatured=game;
  const picture=make('span','ss-featured-art');artInto(picture,game);
  const copy=make('span','ss-featured-copy');
  copy.append(make('small','', 'UNIVERS MULTIJOUEUR'),make('strong','',game));
  const amount=make('span','ss-featured-count','Classement SWAPP');
  amount.dataset.ssFeaturedCount=game;
  copy.append(amount);card.append(picture,copy);
  card.addEventListener('click',()=>{$('#ss-game').value=game;syncGameChips();load();document.querySelector('.ss-results')?.scrollIntoView({behavior:'smooth',block:'start'})});
  featuredHost.append(card);
 }
 function displayGameCounts(counts){
  const n=counts&&typeof counts==='object'?counts:null;
  for(const item of root.querySelectorAll('[data-ss-game-count],[data-ss-featured-count]')){
   const key=item.dataset.ssGameCount??item.dataset.ssFeaturedCount;
   const value=n?Object.prototype.hasOwnProperty.call(n,key)?Number(n[key]):0:null;
   item.textContent=value===null?'Comptage indisponible':Number(value).toLocaleString('fr-FR')+' serveur'+(value===1?'':'s')+' SWAPP';
  }
 }

 const serverCard=(s,i)=>{
  const article=make('article','ss-card');
  const art=make('div','ss-card-image');
  artInto(art,s.game,s.bannerUrl||'');
  const top=make('div','ss-card-top');top.append(make('span','ss-rank','#'+(i+1)),make('span','ss-card-game',s.game));art.append(top);
  const content=make('div','ss-card-content'),heading=make('h3','',s.name);
  const details=make('p','ss-description',s.description);
  const meta=make('div','ss-meta');meta.append(make('span','',s.region||'Région non précisée'),make('span','',Number(s.votes_month||0).toLocaleString('fr-FR')+' vote(s) ce mois'));
  const tags=make('div','ss-tags');(Array.isArray(s.tags)?s.tags:[]).slice(0,5).forEach(t=>tags.append(make('span','',t)));
  content.append(heading,details,meta,tags);
  const actions=make('div','ss-card-actions'),vote=make('button','ss-vote','♥ Voter');
  vote.type='button';
  vote.addEventListener('click',async()=>{
   vote.disabled=true;
   try{
    const r=await fetch('/api/swapp/serveurs/'+encodeURIComponent(s.id)+'/vote',{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json'}});
    const data=await r.json();
    if(!r.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP pour voter.',vote_deja_effectue:'Tu as déjà voté pour ce serveur. Nouveau vote dans deux heures.',origine_invalide:'Session invalide, recharge la page.'})[data.error]||'Vote indisponible.');
    feedback.textContent='Vote enregistré pour '+s.name+'.';await load();
   }catch(e){feedback.textContent=e.message}finally{vote.disabled=false}
  });
  actions.append(vote);
  if(s.website){const link=make('a','ss-join','Rejoindre ↗');link.href=s.website;link.target='_blank';link.rel='noopener noreferrer nofollow';actions.append(link)}
  if(s.joinAddress){const address=make('button','ss-address','Copier l’adresse');address.type='button';address.onclick=async()=>{try{await navigator.clipboard.writeText(s.joinAddress);address.textContent='Adresse copiée'}catch{address.textContent=s.joinAddress}};actions.append(address)}
  content.append(actions);article.append(art,content);return article;
 };
 const draw=()=>{
  const items=state.servers;count.textContent=items.length+' serveur'+(items.length===1?'':'s')+' référencé'+(items.length===1?'':'s');
  results.replaceChildren(...items.map(serverCard));
  if(!items.length){const empty=make('div','ss-empty');empty.append(make('h3','','Aucun serveur référencé pour cette recherche'),make('p','','Ajoute ton serveur : les nouvelles fiches seront visibles après modération.'));results.append(empty)}
 };
 async function load(){
  const seq=++state.request;
  const params=new URLSearchParams({q:$('#ss-q').value.trim(),game:$('#ss-game').value,sort:$('#ss-sort').value});
  feedback.textContent='Mise à jour du classement…';
  try{const res=await fetch('/api/swapp/serveurs?'+params.toString(),{credentials:'same-origin',headers:{Accept:'application/json'}});if(!res.ok)throw Error('L’annuaire est temporairement indisponible.');const data=await res.json();if(seq!==state.request)return;state.servers=Array.isArray(data.servers)?data.servers:[];displayGameCounts(data.gameCounts);draw();feedback.textContent='Classement basé sur les votes réels du mois, sans faux statut en ligne.'}
  catch(e){if(seq!==state.request)return;displayGameCounts(null);results.replaceChildren();count.textContent='Indisponible';feedback.textContent=e.message}
 }
 let timer;$('#ss-q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250)});
 $('#ss-game').addEventListener('change',()=>{syncGameChips();load()});$('#ss-sort').addEventListener('change',load);
 function syncGameChips(){
  root.querySelectorAll('[data-ss-game]').forEach(b=>{
   const selected=b.dataset.ssGame===$('#ss-game').value;
   b.classList.toggle('is-selected',selected);
   b.setAttribute('aria-pressed',String(selected));
  });
 }
 root.querySelectorAll('[data-ss-game]').forEach(b=>b.addEventListener('click',()=>{
  $('#ss-game').value=b.dataset.ssGame;syncGameChips();load();
 }));
 syncGameChips();
 const gameSearch=$('#ss-game-search');
 if(gameSearch)gameSearch.addEventListener('input',()=>{
  const term=gameSearch.value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for(const tile of officialGameTiles){
   const name=tile.dataset.ssGame.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   tile.hidden=!!term&&!name.includes(term);
  }
 });
 $('#ss-add').onclick=()=>dialog.showModal();$('#ss-cancel').onclick=()=>dialog.close();
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Vérification…';
  const payload=Object.fromEntries(new FormData(form).entries());
  try{const res=await fetch('/api/swapp/serveurs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP avant de proposer un serveur.',limite_de_cinq_serveurs:'Limite de cinq fiches par compte atteinte.',informations_invalides:'Vérifie le nom, la description, le jeu et les URL HTTPS.'})[data.error]||'Soumission indisponible.');status.textContent='Serveur soumis. La fiche est en attente de validation.';form.reset()}catch(e){status.textContent=e.message}finally{button.disabled=false}
 };
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