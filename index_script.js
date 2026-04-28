/* Oryon Product Clarity v2 — navigation viewer + menu créateur à droite */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const qs=o=>new URLSearchParams(Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
const state={session:{local:null,twitch:null},view:'home',socket:null,socketLogin:null,room:null,watchRoom:null,stream:null,peers:{},selectedGif:'',selectedEmote:null,channelEmotes:[],catsCursor:null,currentTwitch:null,lastChannelLogin:null,viewerProfile:null,zap:{items:[],index:0,last:null},discoverPlayer:null,mini:null,channelSupport:null};
async function api(url,opt={}){const r=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});let j;try{j=await r.json()}catch{j={success:false,error:await r.text()}} if(!r.ok&&j.success!==false)j.success=false; return j}
function toast(t){const el=$('#toast'); if(!el)return; el.textContent=t||''; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),3200)}
function isAdmin(){return !!state.session?.local?.is_admin || (state.session?.local?.login||'').toLowerCase()==='sansahd'}
function renderNav(){const nav=$('#nav'), mob=$('#mobileNav'); if(!nav||!mob)return; nav.innerHTML=''; mob.innerHTML=''; const items=[['home','Accueil'],['discover','Découvrir'],['categories','Catégories'],['teams','Équipes']]; const wrap=document.createElement('div'); wrap.className='navGroup'; items.forEach(([id,label])=>{const b=document.createElement('button'); b.textContent=label; b.className=state.view===id?'active':''; b.onclick=()=>setView(id); wrap.appendChild(b)}); nav.appendChild(wrap); [['home','Accueil'],['discover','Découvrir'],['categories','Catégories'],['settings','Compte']].forEach(([id,label])=>{const b=document.createElement('button'); b.textContent=label; b.className=state.view===id?'active':''; b.onclick=()=>setView(id); mob.appendChild(b)})}
function renderUserMenu(){const u=state.session.local, t=state.session.twitch; $('#userAvatar').src=u?.avatar_url||t?.profile_image_url||''; $('#userLabel').textContent=u?.display_name||u?.login||t?.display_name||'Compte'; const parts=[]; if(u){parts.push(`<div class="small" style="padding:8px 12px">Compte Oryon<br><b>${esc(u.display_name||u.login)}</b></div>`); parts.push(`<button onclick="state.watchRoom=null;setView('channel')">Ma chaîne</button>`); parts.push(`<button onclick="setView('manager')">Gestionnaire de stream</button>`); parts.push(`<button onclick="setView('dashboard')">Tableau de bord créateur</button>`); parts.push(`<button onclick="setView('studio')">Outils créateur</button>`); parts.push(`<div class="sep"></div>`)} parts.push(`<button onclick="setView('settings')">Profil, connexions, paramètres</button>`); parts.push(t?`<button onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button onclick="connectTwitch()">Connecter Twitch</button>`); if(u)parts.push(`<button onclick="logoutOryon()">Déconnecter Oryon</button>`); if(isAdmin())parts.push(`<div class="sep"></div><button onclick="setView('admin')">Administration</button>`); $('#userMenu').innerHTML=parts.join('')}
async function loadSession(){const s=await api('/api/oryon/session'); if(s.success){state.session.local=s.local||null; state.session.twitch=s.twitch||null} renderNav(); renderUserMenu()}
function authRequired(){return `<div class="protectedHint panel"><h2>Compte Oryon requis</h2><p class="muted">Cette section concerne ta chaîne ou tes outils créateur. Connecte-toi d’abord.</p><div class="row" style="justify-content:center"><button class="btn" onclick="setView('settings')">Connexion / inscription</button><button class="btn secondary" onclick="setView('home')">Retour accueil</button></div></div>`}
async function setView(id){
 if(id==='admin'&&!isAdmin())id='home';
 if(['manager','dashboard','studio'].includes(id)&&!state.session.local)id='settings';
 if(id==='channel'&&!state.session.local&&!state.watchRoom)id='settings';
 if(id!=='channel') state.watchRoom=null;
 state.view=id;
 $$(".view").forEach(v=>v.classList.toggle("active",v.id===id));
 renderNav(); renderUserMenu();
 if(id==='channel' && state.watchRoom) location.hash='channel/'+encodeURIComponent(state.watchRoom); else location.hash=id;
 const map={home:renderHome,discover:renderDiscover,twitch:renderTwitch,categories:renderCategories,teams:renderTeams,channel:renderChannel,manager:renderManager,dashboard:renderDashboard,studio:renderStudio,settings:renderSettings,admin:renderAdmin};
 await map[id]?.();
 renderMiniPlayer();
}
$('#userBtn').onclick=()=>$('#userMenu').classList.toggle('open'); document.addEventListener('click',e=>{if(!e.target.closest('.userArea'))$('#userMenu')?.classList.remove('open')});
function thumbT(x){return (x.thumbnail_url||'').replace('{width}','640').replace('{height}','360')||'https://static-cdn.jtvnw.net/ttv-static/404_preview-640x360.jpg'}
function liveCard(x){const platform=x.platform||((x.embed_url||x.watch_url)?'peertube':(x.login||x.user_login?'twitch':'oryon')); const isT=platform==='twitch'; const isP=platform==='peertube'; const login=x.login||x.user_login||x.host_login||x.room; const name=x.display_name||x.user_name||x.host_name||login||'Live'; const viewers=x.viewer_count??x.viewers??0; const game=x.game_name||x.category||platform; const title=x.title||`Live de ${name}`; const img=x.thumbnail_url?thumbT(x):''; const action=isP?`openPeerTube('${esc(x.embed_url||'')}','${esc(x.watch_url||'')}','${esc(name)}')`:(isT?`openTwitch('${esc(login)}')`:`openOryon('${esc(login)}')`); return `<article class="liveCard"><div class="thumb">${img?`<img src="${esc(img)}" alt="">`:`<div style="height:100%;display:grid;place-items:center;color:#64748b">${isP?'PEERTUBE':isT?'TWITCH':'LIVE ORYON'}</div>`}</div><div class="liveBody"><div class="row"><span class="pill">${isP?'PeerTube':isT?'Twitch':'Oryon'}</span><span class="pill">${viewers} viewers</span></div><div class="title">${esc(title)}</div><div class="desc">${esc(name)} · ${esc(game)}</div><div class="row" style="margin-top:10px"><button class="btn" onclick="${action}">Regarder</button></div></div></article>`}


/* Oryon Discovery Experience — ambiance, zapping, viewer impact, mini-player */
(function injectDiscoveryStyle(){
 if(document.getElementById('oryonDiscoveryStyle'))return;
 const st=document.createElement('style'); st.id='oryonDiscoveryStyle'; st.textContent=`
 .discoverHero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:16px;align-items:stretch}.ambianceGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.ambianceBtn{border:1px solid var(--line);background:rgba(255,255,255,.045);color:white;border-radius:16px;padding:13px;text-align:left}.ambianceBtn b{display:block}.ambianceBtn:hover{border-color:rgba(139,92,246,.72);background:rgba(139,92,246,.13)}.zapStage{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;align-items:stretch}.zapCard{border:1px solid rgba(139,92,246,.45);border-radius:24px;overflow:hidden;background:linear-gradient(135deg,rgba(139,92,246,.16),rgba(34,211,238,.06));box-shadow:var(--shadow)}.zapThumb{aspect-ratio:16/9;background:#030508;position:relative;overflow:hidden}.zapThumb img{width:100%;height:100%;object-fit:cover;display:block}.zapBadge{position:absolute;left:12px;top:12px;background:rgba(8,11,18,.82);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:6px 10px;font-weight:950;font-size:12px}.zapBody{padding:16px}.whyList{display:grid;gap:8px;margin-top:10px}.whyList div,.impactLine{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.045);padding:10px}.viewerImpact{display:grid;gap:10px}.badgeWall{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);border-radius:999px;padding:6px 9px;font-size:12px;font-weight:950}.eventGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.eventCard{border:1px solid var(--line);border-radius:18px;background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(255,255,255,.035));padding:16px}.eventCard b{display:block;font-size:18px}.liveContext{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.42fr);gap:12px;align-items:start}.contextReasons{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.supporters{display:flex;gap:8px;flex-wrap:wrap}.supportChip{border:1px solid rgba(245,158,11,.42);background:rgba(245,158,11,.10);border-radius:999px;padding:6px 9px;font-size:12px;font-weight:950}.chatAssist{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;border-top:1px solid var(--line);background:rgba(255,255,255,.025)}.chatAssist button{border:1px solid var(--line);background:rgba(255,255,255,.055);color:white;border-radius:12px;padding:9px;font-weight:900}.miniPlayer{position:fixed;right:18px;bottom:18px;z-index:120;width:min(390px,calc(100vw - 36px));border:1px solid var(--line);border-radius:18px;background:#0b101c;box-shadow:var(--shadow);overflow:hidden}.miniHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-bottom:1px solid var(--line);font-weight:950}.miniPlayer iframe{width:100%;aspect-ratio:16/9;border:0;display:block;background:#000}.miniBody{padding:12px}.postLiveBox{border:1px solid rgba(34,197,94,.34);background:rgba(34,197,94,.07);border-radius:18px;padding:14px}.discoverLine{grid-template-columns:minmax(0,1.1fr) .48fr .5fr .42fr .38fr auto auto!important}
 @media(max-width:980px){.discoverHero,.zapStage,.liveContext{grid-template-columns:1fr}.discoverLine{grid-template-columns:1fr!important}.miniPlayer{left:12px;right:12px;bottom:78px;width:auto}.chatAssist{grid-template-columns:1fr}}
 `; document.head.appendChild(st);

})();
(function injectImmersiveExperienceStyle(){
 if(document.getElementById('oryonImmersiveExperienceStyle'))return;
 const st=document.createElement('style'); st.id='oryonImmersiveExperienceStyle'; st.textContent=`
 .flowHero{position:relative;overflow:hidden;border-radius:34px;border:1px solid rgba(139,92,246,.42);background:radial-gradient(circle at 24% 18%,rgba(34,211,238,.24),transparent 30%),linear-gradient(135deg,rgba(139,92,246,.28),rgba(8,11,18,.96) 58%,rgba(34,211,238,.11));min-height:430px;padding:28px;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:end}.flowHero:before{content:"";position:absolute;inset:-30%;background:conic-gradient(from 160deg,transparent,rgba(139,92,246,.16),transparent,rgba(34,211,238,.13),transparent);animation:oryonFloat 16s linear infinite}.flowHero>*{position:relative;z-index:1}.flowTitle{font-size:clamp(54px,7vw,108px);line-height:.84;letter-spacing:-.08em;margin:12px 0}.flowDock{display:grid;gap:10px}.flowOrb{width:74px;height:74px;border-radius:26px;background:linear-gradient(135deg,var(--brand),var(--cyan));box-shadow:0 0 60px rgba(139,92,246,.45),inset 0 0 18px rgba(255,255,255,.24);display:grid;place-items:center;font-size:36px}.moodDeck{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px}.moodTile{position:relative;min-height:92px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.045);color:white;text-align:left;padding:14px;overflow:hidden}.moodTile:hover{transform:translateY(-1px);border-color:rgba(34,211,238,.52);background:rgba(34,211,238,.075)}.moodTile i{font-style:normal;font-size:24px;display:block;margin-bottom:8px}.flowStage{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:14px}.flowLive{position:relative;border:1px solid rgba(255,255,255,.14);border-radius:30px;overflow:hidden;min-height:420px;background:#030508;box-shadow:0 30px 90px rgba(0,0,0,.38)}.flowLive .zapThumb{aspect-ratio:auto;height:100%;min-height:420px}.flowLive .zapThumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,5,8,.04),rgba(3,5,8,.18) 38%,rgba(3,5,8,.88))}.flowOverlay{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:22px}.flowOverlay h2{font-size:clamp(28px,3.2vw,50px);line-height:.95;letter-spacing:-.045em;margin:8px 0}.signalStack{display:grid;gap:10px}.comfortRing{width:86px;height:86px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--cyan) var(--score),rgba(255,255,255,.11) 0);box-shadow:inset 0 0 0 10px rgba(8,11,18,.95);font-weight:1000;font-size:22px}.reasonChips,.emoteShelf,.reactionDock{display:flex;gap:8px;flex-wrap:wrap}.reasonChip{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.075);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900}.zapActions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.microHint{color:#d7e3f7;font-size:13px}.vibeBar{display:grid;gap:8px}.vibeLine{display:grid;grid-template-columns:70px 1fr 36px;gap:8px;align-items:center;font-size:12px;color:var(--muted)}.vibeLine i{height:7px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.vibeLine i:after{content:"";display:block;height:100%;width:var(--w);background:linear-gradient(90deg,var(--brand),var(--cyan));border-radius:inherit}.flowQueue{display:flex;gap:8px;overflow:auto;padding-bottom:4px}.flowQueue .liveCard{min-width:210px}.channelBadgeRail{display:flex;gap:10px;overflow:auto;padding:4px 2px 12px}.channelBadgeBig{min-width:148px;border:1px solid rgba(245,158,11,.38);background:linear-gradient(135deg,rgba(245,158,11,.17),rgba(139,92,246,.08));border-radius:20px;padding:14px;text-align:center}.channelBadgeBig strong{display:block;font-size:28px;margin-bottom:5px}.channelBadgeBig b{display:block}.livePrelude{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid rgba(34,211,238,.28);background:linear-gradient(135deg,rgba(34,211,238,.08),rgba(139,92,246,.05));border-radius:22px;padding:14px}.reactionDock button,.emoteBtn{border:1px solid var(--line);background:rgba(255,255,255,.06);color:white;border-radius:13px;padding:9px 10px;font-weight:900}.emoteBtn.locked{opacity:.48;filter:saturate(.6)}.emoteBtn img{width:30px;height:30px;object-fit:contain;vertical-align:middle}.emotePanel{border-top:1px solid var(--line);padding:10px;background:rgba(255,255,255,.025);max-height:174px;overflow:auto}.emoteCreatorGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.emoteCard{border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.04);padding:12px}.emoteCard img{width:58px;height:58px;object-fit:contain;display:block;margin-bottom:8px}.teamLogo{width:64px;height:64px;border-radius:18px;object-fit:cover;background:linear-gradient(135deg,var(--brand),var(--cyan));border:1px solid rgba(255,255,255,.18)}.teamCreateGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.viewerTrail{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.trailCard{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.04);padding:13px}.trailCard b{font-size:26px;display:block}.sparkCard{border:1px solid rgba(34,211,238,.26);background:linear-gradient(135deg,rgba(34,211,238,.10),rgba(139,92,246,.07));border-radius:22px;padding:16px}.nativeFixedChat .chatForm{grid-template-columns:minmax(0,1fr) 76px 58px 96px!important}.likePulse{animation:oryonPulse .45s ease}@keyframes oryonFloat{to{transform:rotate(360deg)}}@keyframes oryonPulse{0%{transform:scale(.98)}60%{transform:scale(1.04)}100%{transform:scale(1)}}@media(max-width:1040px){.flowHero,.flowStage{grid-template-columns:1fr}.flowHero{min-height:0}.flowLive,.flowLive .zapThumb{min-height:320px}.teamCreateGrid{grid-template-columns:1fr}.livePrelude{grid-template-columns:1fr}.flowTitle{font-size:54px}}
 `; document.head.appendChild(st);
})();
(function injectSpotlightFusionStyle(){
 if(document.getElementById('oryonSpotlightFusionStyle'))return;
 const st=document.createElement('style'); st.id='oryonSpotlightFusionStyle'; st.textContent=`
 .discoverCommand{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;border:1px solid rgba(139,92,246,.32);background:linear-gradient(135deg,rgba(139,92,246,.13),rgba(34,211,238,.05));border-radius:26px;padding:14px}.discoverMoodRail{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.discoverMoodRail .moodTile{min-width:132px;padding:10px 12px}.discoverMoodRail .moodTile span{display:none}.discoverControls{display:grid;grid-template-columns:minmax(170px,1fr) 150px 150px 98px auto auto;gap:8px}.spotlightFusion{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,430px);gap:16px;align-items:stretch}.spotlightStage{position:relative;min-height:clamp(460px,52vw,760px);border:1px solid rgba(139,92,246,.35);border-radius:28px;overflow:hidden;background:#030508;box-shadow:0 30px 90px rgba(0,0,0,.35)}.spotlightStage:before{content:"";position:absolute;inset:-1px;background:radial-gradient(circle at 18% 16%,rgba(139,92,246,.34),transparent 28%),radial-gradient(circle at 86% 12%,rgba(34,211,238,.22),transparent 28%);pointer-events:none;z-index:1}.spotlightMedia,.spotlightMedia iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}.spotlightPoster{position:absolute;inset:0}.spotlightPoster img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.08) contrast(1.04)}.spotlightPoster:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,5,8,.08),rgba(3,5,8,.25) 42%,rgba(3,5,8,.88));}.spotlightEmpty{height:100%;display:grid;place-items:center;color:#75839b;background:linear-gradient(135deg,#050814,#11172a)}.spotlightHud{position:absolute;left:18px;right:18px;bottom:18px;z-index:2;display:grid;gap:12px}.spotlightTop{position:absolute;left:16px;right:16px;top:14px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px}.spotlightTitle{font-size:clamp(28px,3.4vw,58px);line-height:.95;margin:0;max-width:980px;text-shadow:0 10px 28px rgba(0,0,0,.48)}.spotlightSub{display:flex;align-items:center;gap:9px;flex-wrap:wrap;color:#d8e5ff}.spotlightActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.spotlightActions .btn{box-shadow:0 14px 40px rgba(139,92,246,.22)}.spotlightSide{display:flex;flex-direction:column;gap:12px;min-height:clamp(460px,52vw,760px)}.spotlightPanel{border:1px solid var(--line);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));padding:14px;box-shadow:0 16px 48px rgba(0,0,0,.20)}.spotlightPanel.compact{padding:12px}.spotlightPanel h2{margin:0 0 10px;font-size:18px}.signalGrid{display:grid;gap:8px}.signalChip{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);border-radius:14px;padding:9px 10px;font-weight:900}.signalChip span{color:var(--muted);font-size:12px}.spotlightChat{flex:1 1 auto;min-height:260px;overflow:hidden;padding:0;display:flex;flex-direction:column}.spotlightChat iframe{width:100%;height:100%;border:0;display:block;background:#111}.softChatPreview{flex:1;display:grid;place-items:center;text-align:center;color:var(--muted);padding:16px}.softChatPreview b{display:block;color:#fff;font-size:20px;margin-bottom:5px}.spotlightQueue{display:flex;gap:10px;overflow:auto;padding-bottom:4px}.queuePill{min-width:210px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.04);padding:10px;cursor:pointer}.queuePill:hover{border-color:rgba(139,92,246,.65);background:rgba(139,92,246,.10)}.queuePill b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.queuePill.active{border-color:rgba(34,211,238,.75);box-shadow:inset 0 0 0 1px rgba(34,211,238,.15)}.discoverAfter{display:grid;grid-template-columns:1fr 1fr;gap:14px}.discoverAfter .panel{margin:0}.discoverResultsSlim{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.discoverResultsSlim:empty{display:none}.inlineTwitchConnect{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:18px;padding:12px;background:rgba(255,255,255,.035)}
 @media(max-width:1180px){.spotlightFusion{grid-template-columns:1fr}.spotlightStage,.spotlightSide{min-height:auto}.spotlightStage{aspect-ratio:16/9}.spotlightSide{display:grid;grid-template-columns:1fr 1fr}.spotlightChat{min-height:360px}.discoverControls{grid-template-columns:1fr 1fr 1fr}.discoverAfter{grid-template-columns:1fr}}
 @media(max-width:760px){.discoverCommand{grid-template-columns:1fr}.discoverControls{grid-template-columns:1fr}.spotlightSide{display:flex}.spotlightTitle{font-size:30px}.spotlightActions .btn{flex:1}.spotlightStage{border-radius:20px}.spotlightHud{left:12px;right:12px;bottom:12px}.spotlightTop{left:12px;right:12px}.spotlightChat{min-height:320px}}
 `; document.head.appendChild(st);
})();
const AMBIANCES=[['chill','Chill','Détendu, sans pression','🌙'],['rp','RP / jeu de rôle','Univers, personnages, narration','🎭'],['discussion','Discussion','Chat lisible et conversation','💬'],['nuit','Nuit calme','Late night, petit comité','🫧'],['decouverte-jeu','Découverte jeu','Jeu ou catégorie à explorer','🎮'],['petite-commu','Petite commu','Créateur accessible','✨']];
function ambianceIcon(id){return (AMBIANCES.find(x=>x[0]===id)||[])[3]||'✦'}
function viewerStorageKey(){return 'oryon_viewer_impact_v1_'+(state.session?.local?.login||state.session?.twitch?.login||'guest')}
function loadViewerImpact(){try{state.viewerProfile=JSON.parse(localStorage.getItem(viewerStorageKey())||'null')||null}catch{} if(!state.viewerProfile)state.viewerProfile={points:0,discoveries:[],firstSupports:[],badges:['Explorateur']}; return state.viewerProfile}
function saveViewerImpact(){try{localStorage.setItem(viewerStorageKey(),JSON.stringify(state.viewerProfile||{}))}catch{}}
function liveIdentity(x={}){const platform=x.platform||((x.login||x.user_login)?'twitch':'oryon'); const login=x.login||x.user_login||x.host_login||x.room||''; const name=x.display_name||x.user_name||x.host_name||login||'Live'; return {platform,login,name,title:x.title||`Live de ${name}`,game:x.game_name||x.category||'Live',viewers:Number(x.viewer_count??x.viewers??0)||0,img:x.thumbnail_url?thumbT(x):''}}
function platformLabel(p){return p==='twitch'?'Twitch':p==='oryon'?'Oryon':'Oryon'}
function comfortScore(x){const id=liveIdentity(x); let score=72; if(id.platform==='oryon')score+=8; if(id.viewers<=20)score+=14; else if(id.viewers<=50)score+=9; else if(id.viewers>200)score-=12; if(id.game)score+=3; return Math.max(38,Math.min(98,score));}
function vibeMetrics(x){const id=liveIdentity(x); const tiny=id.viewers<=20; return [{k:'Calme',v:tiny?82:66},{k:'Lisible',v:id.viewers<=50?90:62},{k:'Accueil',v:id.platform==='oryon'?88:72},{k:'Découverte',v:tiny?96:76}];}
function discoverReasonFor(x){const id=liveIdentity(x); const reasons=[]; if(id.platform==='oryon')reasons.push('Natif Oryon'); if(id.platform==='twitch')reasons.push('Twitch filtré'); if(id.viewers<=20)reasons.push('Très petit live'); else if(id.viewers<=50)reasons.push('Chat lisible'); else reasons.push('Audience raisonnable'); if(id.game)reasons.push(id.game); reasons.push('Entrée sans pression'); return reasons.slice(0,4)}
function microContextFor(x){const id=liveIdentity(x); if(id.viewers<=20)return 'petite salle'; if(id.viewers<=50)return 'chat clair'; return 'live filtré';}
function queuePreview(items){return (items||[]).slice(1,5).map(x=>liveCard(x)).join('')||'<div class="empty">La file se remplit après Zapper.</div>'}
function markZapFeedback(kind){const map={quiet:'discussion',loud:'nuit',small:'petite-commu',rp:'rp',game:'decouverte-jeu'}; if(map[kind]&&$('#dMood'))$('#dMood').value=map[kind]; const q=$('#dQuery'); if(q&&kind==='small')q.value=''; findLive();}
function trackDiscovery(x){const id=liveIdentity(x); if(!id.login)return; const vp=loadViewerImpact(); const key=id.platform+':'+id.login; const exists=vp.discoveries.some(d=>d.key===key); if(!exists){vp.discoveries.unshift({key,platform:id.platform,login:id.login,name:id.name,title:id.title,game:id.game,ts:Date.now()}); vp.discoveries=vp.discoveries.slice(0,30); vp.points=Number(vp.points||0)+5; if(vp.discoveries.length>=3&&!vp.badges.includes('Chercheur de pépites'))vp.badges.push('Chercheur de pépites'); if(vp.discoveries.length>=10&&!vp.badges.includes('Radar humain'))vp.badges.push('Radar humain'); saveViewerImpact(); renderViewerImpact();}}
function viewerImpactCard(){const vp=loadViewerImpact(); const last=(vp.discoveries||[]).slice(0,4); return `<div class="viewerImpact"><div class="viewerTrail"><div class="trailCard"><span class="small">Aura</span><b>${Number(vp.points||0)}</b></div><div class="trailCard"><span class="small">Pépites</span><b>${(vp.discoveries||[]).length}</b></div><div class="trailCard"><span class="small">Soutiens</span><b>${(vp.firstSupports||[]).length}</b></div></div><div class="badgeWall">${(vp.badges||['Explorateur']).map(b=>`<span class="badge">${b==='Premier soutien'?'⭐':'🏷️'} ${esc(b)}</span>`).join('')}</div>${last.length?`<div class="flowQueue">${last.map(d=>`<div class="sparkCard"><b>${esc(d.name)}</b><br><span class="small">${esc(d.game||platformLabel(d.platform))}</span></div>`).join('')}</div>`:'<div class="empty">Tes pépites apparaîtront ici.</div>'}</div>`}
function renderViewerImpact(){const box=$('#viewerImpactBox'); if(box)box.innerHTML=viewerImpactCard()}
function discoveryEventsHtml(){return `<div class="section"><div class="pageHead"><div><h1>Événements découverte</h1><p>Des rendez-vous pensés pour pousser les petits lives sans dépendre des gros raids.</p></div></div><div class="eventGrid"><article class="eventCard"><span class="pill">Bientôt</span><b>Soirée Pépites</b><p class="muted">Sélection de chaînes sous le radar, avec zapping guidé.</p><button class="btn secondary" onclick="discoverMood('petite-commu',50)">Préparer ma sélection</button></article><article class="eventCard"><span class="pill">Late</span><b>Nuit chill</b><p class="muted">Ambiances calmes, discussion posée, chat lisible.</p><button class="btn secondary" onclick="discoverMood('nuit',50)">Entrer en mode nuit</button></article><article class="eventCard"><span class="pill">Collectif</span><b>Raid inversé collectif</b><p class="muted">La commu part chercher un petit créateur à soutenir.</p><button class="btn secondary" onclick="discoverMood('petite-commu',20)">Trouver une cible</button></article></div></div>`}
function openActionFor(x){const id=liveIdentity(x); return id.platform==='twitch'?`openTwitch('${esc(id.login)}')`:`openOryon('${esc(id.login)}')`}
function isSpotlightActive(x){const id=liveIdentity(x||{}); return !!(state.currentTwitch && id.platform==='twitch' && id.login===state.currentTwitch)}
function spotlightMedia(x){
 if(!x)return `<div class="spotlightEmpty"><div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h2>Choisis une ambiance</h2></div></div>`;
 const id=liveIdentity(x), active=isSpotlightActive(x), parent=location.hostname;
 if(active && id.platform==='twitch')return `<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=false"></iframe>`;
 return `<div class="spotlightPoster">${id.img?`<img src="${esc(id.img)}" alt="">`:`<div class="spotlightEmpty">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>`;
}
function spotlightChat(x){
 if(!x)return `<div class="softChatPreview"><div><b>Tchat prêt</b><span>Il apparaît quand tu entres.</span></div></div>`;
 const id=liveIdentity(x), parent=location.hostname;
 if(isSpotlightActive(x) && id.platform==='twitch')return `<iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe>`;
 return `<div class="softChatPreview"><div><b>Entrée douce</b><span>Regarde d'abord, parle ensuite.</span><div class="chatAssist section"><button onclick="toast('Question copiée quand le tchat est ouvert')">Question</button><button onclick="toast('Message de nouveau prêt')">Nouveau ici</button><button onclick="toast('Réaction douce prête')">Réagir</button></div></div></div>`;
}
function spotlightQueue(items){return (items||[]).slice(0,8).map((x,i)=>{const id=liveIdentity(x);return `<button class="queuePill ${i===state.zap.index?'active':''}" onclick="state.zap.index=${i};state.currentTwitch=null;renderZap()"><b>${esc(id.name)}</b><span class="small">${esc(platformLabel(id.platform))} · ${id.viewers} · ${esc(id.game)}</span></button>`}).join('')||''}
function renderZapCard(x){
 const id=x?liveIdentity(x):null, score=x?comfortScore(x):0, reasons=x?discoverReasonFor(x):[];
 return `<div class="spotlightStage"><div class="spotlightMedia">${spotlightMedia(x)}</div>${x?`<div class="spotlightTop"><span class="zapBadge">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span><span class="pill">${score}% confort</span></div><div class="spotlightHud"><div class="spotlightSub"><span class="pill">${esc(microContextFor(x))}</span><span class="pill">${esc(id.game)}</span>${reasons.slice(0,2).map(r=>`<span class="pill">${esc(r)}</span>`).join('')}</div><h2 class="spotlightTitle">${esc(id.title)}</h2><div class="spotlightActions"><button class="btn good" onclick="zapOpenCurrent()">${isSpotlightActive(x)?'Ouvert':'Entrer'}</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="findLive()">Zapper</button></div></div>`:`<div class="spotlightHud"><h2 class="spotlightTitle">Trouve ton live.</h2><div class="spotlightActions"><button class="btn good" onclick="findLive()">Zapper</button></div></div>`}</div>`;
}
function renderZap(){
 const box=$('#zapResult'); if(!box)return;
 const items=state.zap.items||[], cur=items[state.zap.index]||null, score=cur?comfortScore(cur):0, id=cur?liveIdentity(cur):null;
 box.innerHTML=`<div class="spotlightFusion"><div>${renderZapCard(cur)}</div><aside class="spotlightSide"><div class="spotlightPanel compact"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Signal</h2><span class="small">${cur?esc(platformLabel(id.platform)):'Oryon + Twitch'}</span></div><div class="comfortRing" style="--score:${score}%">${cur?score:'—'}</div></div>${cur?`<div class="vibeBar section">${vibeMetrics(cur).map(v=>`<div class="vibeLine"><span>${esc(v.k)}</span><i style="--w:${v.v}%"></i><b>${v.v}</b></div>`).join('')}</div>`:'<div class="empty section">Lance une proposition.</div>'}</div><div class="spotlightPanel compact"><h2>Pourquoi</h2><div class="signalGrid">${cur?discoverReasonFor(cur).map(r=>`<div class="signalChip"><b>${esc(r)}</b><span>✓</span></div>`).join(''):'<div class="empty">Aucun live sélectionné.</div>'}</div></div><div class="spotlightPanel spotlightChat"><div class="chatHeader"><span>${cur?`Tchat · ${esc(id.name)}`:'Tchat'}</span></div>${spotlightChat(cur)}</div></aside></div>${items.length?`<div class="section"><div class="spotlightQueue">${spotlightQueue(items)}</div></div>`:''}`;
 renderViewerImpact();
}
function zapNext(){const items=state.zap.items||[]; if(!items.length)return findLive(); state.zap.index=(state.zap.index+1)%items.length; state.currentTwitch=null; renderZap()}
function zapBack(){const items=state.zap.items||[]; if(!items.length)return; state.zap.index=(state.zap.index-1+items.length)%items.length; state.currentTwitch=null; renderZap()}
function zapOpenCurrent(){const x=(state.zap.items||[])[state.zap.index]; if(!x)return; trackDiscovery(x); const id=liveIdentity(x); if(id.platform==='twitch'){state.currentTwitch=id.login; setMiniLive({type:'twitch',login:id.login,title:'Twitch · '+id.login}); renderZap(); return;} openOryon(id.login)}
async function firstSupport(login){await loadSession(); if(!state.session.local){toast('Compte Oryon requis pour devenir premier soutien.');return setView('settings')} const r=await api('/api/oryon/support/first/'+encodeURIComponent(login),{method:'POST'}); if(r.success){const vp=loadViewerImpact(); if(!vp.firstSupports.some(x=>x.login===login)){vp.firstSupports.unshift({login,ts:Date.now()}); vp.points=Number(vp.points||0)+20; if(!vp.badges.includes('Premier soutien'))vp.badges.push('Premier soutien'); saveViewerImpact();} toast(r.message||'Premier soutien enregistré'); if(state.view==='channel')renderChannel();} else toast(r.error||'Impossible de soutenir cette chaîne')}
function supportButton(login,support){if(!login||support?.is_self)return ''; if(support?.already)return `<span class="supportChip">⭐ Premier soutien</span>`; if(support?.full)return `<span class="supportChip">Premiers soutiens complets</span>`; return `<button class="btn secondary" onclick="firstSupport('${esc(login)}')">Premier soutien</button>`}
async function likeOryon(login){if(!state.session.local){toast('Compte Oryon requis');return setView('settings')} const r=await api('/api/oryon/like/'+encodeURIComponent(login),{method:'POST'}); toast(r.success?'Aimé':r.error); const b=$('#likeBtn'); if(b)b.classList.add('likePulse'); await refreshEmoteShelf(login);}
function chatQuick(kind){const input=$('#chatInput'); if(!input)return; const presets={question:'C’est quoi le contexte ?',new:'Je découvre via Oryon 👋',react:'Bonne vibe ✨'}; input.value=presets[kind]||''; input.focus()}
function setMiniLive(data){state.mini=data; renderMiniPlayer()}
function closeMini(){state.mini=null; $('#oryonMiniPlayer')?.remove()}
function expandMini(){const m=state.mini; if(!m)return; if(m.type==='twitch')openTwitch(m.login); else if(m.login)openOryon(m.login)}
function renderMiniPlayer(){let host=$('#oryonMiniPlayer'); const m=state.mini; if(!m){host?.remove();return} if(!host){host=document.createElement('div'); host.id='oryonMiniPlayer'; host.className='miniPlayer'; document.body.appendChild(host)} const title=esc(m.title||m.login||'Live en cours'); const parent=location.hostname; host.innerHTML=`<div class="miniHead"><span>▶ ${title}</span><div class="row"><button class="btn ghost" onclick="expandMini()">Ouvrir</button><button class="btn ghost" onclick="closeMini()">×</button></div></div>${m.type==='twitch'?`<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(m.login)}&parent=${encodeURIComponent(parent)}&muted=false"></iframe>`:`<div class="miniBody"><p class="muted">Live Oryon actif. La base mini-player garde le live accessible pendant la navigation.</p><button class="btn" onclick="expandMini()">Revenir au live</button></div>`}`}
async function renderHome(){
 const el=$('#home');
 el.innerHTML=`<div id="featuredHome" class="section"><div class="empty">Chargement du bandeau des petits lives…</div></div>
 <div class="heroGrid section"><div class="hero"><span class="eyebrow"><i class="dot"></i>Découverte anti-gros</span><h1>Entre dans la bonne ambiance.</h1><p class="lead">Un live proposé, un signal clair, zéro pression.</p><div class="row"><button class="btn" onclick="quickGem()">Propose-moi un live</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button>${state.session.local?`<button class="btn ghost" onclick="setView('manager')">Streamer</button>`:`<button class="btn ghost" onclick="setView('settings')">Créer mon compte</button>`}</div></div><div class="panel"><h2>Mode Ambiance</h2><div class="ambianceGrid">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="moodTile" onclick="discoverMood('${id}',${id==='petite-commu'?20:50})"><i>${icon}</i><b>${esc(label)}</b><span class="small">${esc(desc)}</span></button>`).join('')}</div></div></div>
 ${discoveryEventsHtml()}
 <div class="section two"><div class="panel"><h2>Profil viewer avec impact</h2><div id="viewerImpactBox">${viewerImpactCard()}</div></div><div class="panel"><h2>Zapping intelligent</h2><div class="row"><button class="btn good" onclick="quickGem()">Zapper</button><button class="btn secondary" onclick="setView('discover')">Ouvrir Découvrir</button></div></div></div>
 <div class="section"><div class="pageHead"><div><h1>En direct maintenant</h1><p>Oryon d’abord. Si personne n’est live, petits lives Twitch FR 10–50 viewers.</p></div></div><div id="homeLives" class="rail"><div class="empty">Chargement…</div></div></div>
 <div class="section"><h2>Catégories</h2><div id="homeCats" class="grid smallCards"></div></div>`;
 await loadFeaturedHome(); await loadHomeLives(); await loadHomeCats(); renderMiniPlayer();
}
async function loadHomeLives(){
 const box=$('#homeLives');
 const n=await api('/api/native/lives');
 let items=n.items||[];
 if(items.length){box.innerHTML=items.map(liveCard).join('');return}
 const t=await api('/api/twitch/streams/small?lang=fr&min=10&max=50');
 const arr=t.items||[];
 box.innerHTML=arr.length?arr.map(liveCard).join(''):'<div class="empty">Aucun petit live trouvé. Essaie Découvrir.</div>';
}
async function loadFeaturedHome(){
 const box=$('#featuredHome'); if(!box)return;
 let r=await api('/api/native/lives');
 let items=(r.items||[]).slice(0,5);
 if(!items.length){ r=await api('/api/twitch/streams/small?lang=fr&min=10&max=50'); items=(r.items||[]).slice(0,5); }
 if(!items.length){ box.innerHTML=''; return; }
 const main=items[0]; const bg=main.thumbnail_url?thumbT(main):'';
 box.innerHTML=`<div class="featuredLive" style="--bgImg:url('${esc(bg)}')"><div class="featuredLiveInner"><div class="featuredCopy"><span class="eyebrow"><i class="dot"></i>Petits lives en avant</span><h2>À découvrir maintenant</h2><p>Un signal clair. Une entrée facile.</p><div class="row"><button class="btn" onclick="${(main.platform==='twitch'||main.login||main.user_login)?`openTwitch('${esc(main.login||main.user_login)}')`:`openOryon('${esc(main.host_login||main.room)}')`}">Regarder la pépite</button><button class="btn secondary" onclick="quickGem()">Une autre</button></div></div><div class="featuredStack">${items.map((x,i)=>featuredCard(x,i)).join('')}</div></div></div>`;
}
function featuredCard(x,i){const cls=i===0?'main':i===1?'left':i===2?'right':'far';const login=x.login||x.user_login||x.host_login||x.room;const name=x.display_name||x.user_name||x.host_name||login;const viewers=x.viewer_count??x.viewers??0;const img=x.thumbnail_url?thumbT(x):'';const fn=(x.platform==='twitch'||x.login||x.user_login)?`openTwitch('${esc(login)}')`:`openOryon('${esc(login)}')`;return `<article class="featuredCard ${cls}" onclick="${fn}">${img?`<img src="${esc(img)}" alt="">`:`<div class="thumb"><div style="height:100%;display:grid;place-items:center;color:#64748b">LIVE ORYON</div></div>`}<div class="liveBody"><div class="row"><span class="pill">${viewers} viewers</span><span class="pill">${esc(x.game_name||x.category||'Live')}</span></div><div class="title">${esc(name)}</div></div></article>`}

async function quickGem(){await setView('discover'); $('#dMax').value='50'; $('#dMood').value='petite-commu'; $('#dSource').value='both'; findLive()}
async function discoverMood(m,max){await setView('discover'); $('#dMood').value=m; $('#dMax').value=String(max); findLive()}
async function loadHomeCats(){const r=await api('/api/categories/top?limit=12'); $('#homeCats').innerHTML=(r.categories||[]).slice(0,12).map(catCard).join('')||'<div class="empty">Catégories indisponibles.</div>'}
async function loadDiscoverCats(){const box=$('#discoverCats'); if(!box)return; const r=await api('/api/categories/top?limit=18'); box.innerHTML=(r.categories||[]).slice(0,18).map(catCard).join('')||'<div class="empty">Catégories indisponibles.</div>'}
function catCard(c){return `<button class="categoryCard" onclick="pickCat('${esc(c.name)}')"><img src="${esc(c.box_art_url||'')}" alt=""><b>${esc(c.name)}</b><span class="small">Petit live au hasard</span></button>`}
async function renderDiscover(){
 const el=$('#discover');
 el.innerHTML=`<div class="discoverCommand section"><div><div class="discoverMoodRail">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="moodTile" onclick="$('#dMood').value='${id}';state.currentTwitch=null;findLive()"><i>${icon}</i><b>${esc(label)}</b><span class="small">${esc(desc)}</span></button>`).join('')}</div></div><div class="discoverControls"><input id="dQuery" placeholder="jeu, pseudo, ambiance"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood"><option value="">Ambiance</option>${AMBIANCES.map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="20">≤20</option><option value="50" selected>≤50</option><option value="200">≤200</option><option value="300">≤300</option></select><button class="btn good" onclick="state.currentTwitch=null;findLive()">Zapper</button><button class="btn secondary" onclick="zapNext()">Suivant</button><select id="dLang" class="hidden"><option value="fr" selected>FR</option><option value="en">EN</option></select></div></div>
 <div id="zapResult" class="section"></div>
 <div class="discoverAfter section"><div class="panel"><div class="pageHead"><div><h2>À côté</h2><p>Autres propositions, sans quitter le spotlight.</p></div></div><div id="discoverResults" class="discoverResultsSlim"></div></div><div class="panel"><div class="pageHead"><div><h2>Viewer</h2><p>Impact, pépites, progression.</p></div></div><div id="viewerImpactBox">${viewerImpactCard()}</div></div></div>
 <div class="section panel"><div class="pageHead"><div><h2>Catégories populaires</h2><p>Un raccourci vers une autre ambiance.</p></div>${state.session.twitch?`<button class="btn secondary" onclick="setView('twitch')">Mes suivis Twitch</button>`:`<button class="btn secondary" onclick="connectTwitch()">Connecter Twitch</button>`}</div><div id="discoverCats" class="grid smallCards section"><div class="empty">Chargement…</div></div></div>`;
 loadDiscoverCats(); renderZap(); renderMiniPlayer();
}

async function findLive(){
 const q=$('#dQuery')?.value||'', mood=$('#dMood')?.value||'', max=$('#dMax')?.value||'50', lang=$('#dLang')?.value||'fr', source=$('#dSource')?.value||'both';
 $('#discoverResults').innerHTML='<div class="empty">Recherche…</div>'; $('#zapResult').innerHTML='<div class="empty">Oryon cherche une proposition lisible…</div>';
 const r=await api('/api/oryon/discover/find-live?'+qs({q,mood,max,lang,source}));
 const items=(r.items||[]).filter(x=>(x.platform||'')!=='peertube'); state.zap.items=items; state.zap.index=0; state.currentTwitch=null; state.zap.last={q,mood,max,lang,source};
 renderZap();
 $('#discoverResults').innerHTML=items.length?items.slice(1).map(liveCard).join(''):'<div class="empty">Aucun résultat. Élargis le plafond, change la source ou choisis une catégorie.</div>';
}
async function renderTwitch(){const el=$('#twitch'); el.innerHTML=`<div class="pageHead"><div><h1>Twitch intégré</h1><p>Lecteur + tchat officiel, lives suivis et recherche. Séparé de la home Oryon.</p></div><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrap" class="section"></div><div id="twitchPlayerArea" class="section"></div><div class="panel section"><div class="searchLine" style="grid-template-columns:1fr auto"><input id="twSearch" placeholder="chercher un streamer Twitch"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="twResults" class="rail section"></div></div>`; await loadFollowed()}
function connectTwitch(){const ret=encodeURIComponent(location.hash||'#discover'); location.href='/twitch_auth_start?returnTo=/'+ret}
async function logoutTwitch(){const r=await api('/twitch_logout',{method:'POST'}); state.session.twitch=null; await loadSession(); if(state.view==='discover') await renderDiscover(); if(state.view==='settings') await renderSettings(); toast(r.success?'Twitch déconnecté':(r.error||'Erreur déconnexion Twitch'))}
async function loadFollowed(){const wrap=$('#followedWrap'); if(!state.session.twitch){wrap.innerHTML='<div class="panel"><h2>Connecte Twitch</h2><p class="muted">Tes chaînes suivies en live apparaîtront ici en bandeau.</p><button class="btn" onclick="connectTwitch()">Connecter Twitch</button></div>';return} wrap.innerHTML='<h2>Chaînes suivies en live</h2><div id="followedRail" class="marquee"><div class="empty">Chargement…</div></div>'; let r=await api('/api/twitch/followed/live'); if(!r.success) r=await api('/followed_streams'); const items=r.items||r.streams||[]; $('#followedRail').innerHTML=items.length?items.map(liveCard).join(''):'<div class="empty">Aucune chaîne suivie en live actuellement.</div>'}
async function searchTwitch(){const q=$('#twSearch').value.trim(); if(!q)return; const r=await api('/api/twitch/channels/search?'+qs({q,live:true})); $('#twResults').innerHTML=(r.items||[]).map(x=>`<article class="liveCard"><div class="liveBody"><div class="row"><img class="avatarMini" src="${esc(x.profile_image_url||'')}"><b>${esc(x.display_name)}</b><span class="pill">${x.is_live?'Live':'Offline'}</span></div><p class="desc">${esc(x.title||x.game_name||'')}</p><button class="btn" onclick="openTwitch('${esc(x.login)}')">Regarder</button></div></article>`).join('')||'<div class="empty">Aucun résultat.</div>'}
function mountTwitchPlayer(login){
 const parent=location.hostname;
 const area=$('#twitchPlayerArea');
 if(area){area.innerHTML=`<div class="watchShell twitchWatch"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div>`; area.scrollIntoView({behavior:'smooth',block:'start'}); return;}
 state.currentTwitch=login; renderZap();
}
function openTwitch(login){
 state.currentTwitch=login;
 const existing=(state.zap.items||[]).find(x=>(x.login||x.user_login)===login);
 const item=existing||{platform:'twitch',login,display_name:login,title:'Twitch · '+login,game_name:'Live Twitch',viewer_count:0};
 if(!existing)state.zap.items=[item,...(state.zap.items||[])];
 state.zap.index=Math.max(0,(state.zap.items||[]).findIndex(x=>(x.login||x.user_login)===login));
 trackDiscovery(item); setMiniLive({type:'twitch',login,title:'Twitch · '+login});
 setView('discover').then(()=>mountTwitchPlayer(login));
}

async function searchPeerTube(){const q=$('#ptSearch')?.value?.trim()||''; const r=await api('/api/peertube/public/search?'+qs({q,max:200,lang:$('#dLang')?.value||'fr'})); $('#ptResults').innerHTML=(r.items||[]).length?(r.items||[]).map(liveCard).join(''):'<div class="empty">Aucun live PeerTube public trouvé.</div>'}
function openPeerTubeFromInput(){const raw=$('#ptSearch')?.value?.trim(); if(!raw)return toast('Colle un lien PeerTube ou cherche un terme.'); if(raw.startsWith('http')) openPeerTube(raw,raw,'PeerTube public'); else searchPeerTube();}
function normalizePeerTubeEmbed(embed,watch){let u=embed||watch||''; try{const url=new URL(u); if(!url.pathname.includes('/videos/embed/') && url.pathname.includes('/w/')){const id=url.pathname.split('/').filter(Boolean).pop(); return url.origin+'/videos/embed/'+id;} return u;}catch{return u}}
function openPeerTube(embed,watch,name='PeerTube'){setView('discover').then(()=>{const target=normalizePeerTubeEmbed(embed,watch); const link=watch||target||''; const box=$('#twitchPlayerArea'); if(!box)return; box.innerHTML=`<div class="pageHead"><div><h2>${esc(name)}</h2><p class="muted">Live public affiché dans Oryon.</p></div>${link?`<a class="btn secondary" href="${esc(link)}" target="_blank" rel="noopener">Ouvrir la source</a>`:''}</div><div class="watchShell twitchWatch"><div class="player premiumPlayer peertubePlayer"><iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(target)}"></iframe></div><aside class="chatPanel nativeFixedChat"><div class="chatHeader">Tchat Oryon</div><div class="chatLog"><div class="empty">PeerTube public est affiché ici. Le tchat Oryon reste séparé pour ne pas mélanger les plateformes.</div></div></aside></div>`; box.scrollIntoView({behavior:'smooth',block:'start'});});}

async function renderCategories(){const el=$('#categories'); el.innerHTML=`<div class="pageHead"><div><h1>Catégories</h1><p>Vignettes compactes. Clique pour un petit live aléatoire dans la catégorie.</p></div><div class="row"><input id="catSearch" placeholder="Rechercher" style="width:260px"><button class="btn secondary" onclick="searchCats()">Rechercher</button></div></div><div id="catPick" class="section"></div><div id="catGrid" class="grid smallCards section"><div class="empty">Chargement…</div></div><div class="row section"><button class="btn secondary" onclick="loadMoreCats()">Charger plus</button></div>`; state.catsCursor=null; await loadMoreCats(true)}
async function loadMoreCats(reset=false){const r=await api('/api/categories/top?'+qs({cursor:state.catsCursor||''})); state.catsCursor=r.cursor; const html=(r.categories||[]).map(catCard).join(''); $('#catGrid').innerHTML=reset?html:($('#catGrid').innerHTML+html)}
async function searchCats(){const q=$('#catSearch').value.trim(); const r=await api('/api/categories/search?q='+encodeURIComponent(q)); $('#catGrid').innerHTML=(r.categories||[]).map(catCard).join('')||'<div class="empty">Aucune catégorie.</div>'}
async function pickCat(name){await setView('categories'); const r=await api('/api/twitch/random-small-live?'+qs({game:name,max:200,language:'fr'})); $('#catPick').innerHTML=r.success&&r.target?`<h2>Pépite dans ${esc(name)}</h2>${liveCard({...r.target,platform:'twitch',login:r.target.login,display_name:r.target.name,viewer_count:r.target.viewers,game_name:r.target.game})}`:`<div class="empty">${esc(r.error||'Aucun live trouvé')}</div>`}
async function renderTeams(){const el=$('#teams'); el.innerHTML=`<div class="pageHead"><div><h1>Équipes gratuites</h1><p>Logo, membres live, identité commune.</p></div>${state.session.local?`<button class="btn" onclick="$('#teamCreate').classList.toggle('hidden')">Créer une équipe</button>`:`<button class="btn" onclick="setView('settings')">Connexion requise</button>`}</div><div id="teamCreate" class="panel hidden"><form id="teamForm" class="teamCreateGrid"><input id="teamName" placeholder="Nom de l'équipe"><input id="teamTags" placeholder="Tags"><textarea id="teamDesc" placeholder="Description courte"></textarea><div><label class="small">Logo d'équipe</label><input id="teamLogoFile" type="file" accept="image/*"><input id="teamLogo" type="hidden"><div class="row section"><div id="teamLogoPreview" class="teamLogo"></div><button class="btn secondary">Créer</button></div></div></form></div><div id="teamsList" class="grid section"><div class="empty">Chargement…</div></div>`; const f=$('#teamLogoFile'); if(f)f.onchange=()=>{const file=f.files[0]; if(!file)return; compressImage(file).then(data=>{$('#teamLogo').value=data; $('#teamLogoPreview').style.backgroundImage=`url(${data})`; $('#teamLogoPreview').style.backgroundSize='cover'; toast('Logo prêt')})}; $('#teamForm')?.addEventListener('submit',createTeam); await loadTeams()}
async function loadTeams(){const r=await api('/api/oryon/teams'); $('#teamsList').innerHTML=(r.items||[]).map(t=>`<article class="card"><div class="row"><img class="teamLogo" src="${esc(t.logo_url||'')}" alt=""><div><h2>${esc(t.name)}</h2><p class="muted">${esc(t.description||'Équipe Oryon')}</p></div></div><p><span class="pill">${t.members?.length||0} membres</span> <span class="pill">${t.points||0} points</span></p><div class="row"><button class="btn" onclick="joinTeam('${esc(t.slug)}')">Rejoindre</button><button class="btn secondary" onclick="viewTeam('${esc(t.slug)}')">Voir</button></div></article>`).join('')||'<div class="empty">Aucune équipe.</div>'}
async function createTeam(e){e.preventDefault(); await loadSession(); if(!state.session.local){toast('Compte Oryon requis');return setView('settings')} const r=await api('/api/oryon/teams',{method:'POST',body:JSON.stringify({name:$('#teamName').value,description:$('#teamDesc').value,tags:$('#teamTags').value,logo_url:$('#teamLogo')?.value||''})}); toast(r.success?'Équipe créée':r.error); if(r.success)loadTeams()}
async function joinTeam(slug){await loadSession(); if(!state.session.local){toast('Compte Oryon requis');return setView('settings')} const r=await api('/api/oryon/teams/'+slug+'/join',{method:'POST'}); toast(r.success?'Équipe rejointe':r.error); loadTeams()}
async function viewTeam(slug){const r=await api('/api/oryon/teams/'+slug); if(!r.success)return toast(r.error); $('#teamsList').insertAdjacentHTML('afterbegin',`<article class="panel"><div class="row"><img class="teamLogo" src="${esc(r.team.logo_url||'')}" alt=""><div><h2>${esc(r.team.name)}</h2><p>${esc(r.team.description||'')}</p></div></div><p class="small">Membres live : ${(r.live_members||[]).length}</p></article>`)}
function creatorShell(active,body){const items=[['channel','Ma chaîne'],['manager','Gestionnaire de stream'],['dashboard','Tableau de bord'],['studio','Outils créateur'],['settings','Profil / paramètres']]; return `<div class="creatorLayout"><aside class="creatorSide"><h3>Créer</h3>${items.map(([id,label])=>`<button class="${active===id?'active':''}" onclick="if('${id}'==='channel')state.watchRoom=null;setView('${id}')">${label}</button>`).join('')}<div class="sep"></div><p class="small" style="padding:0 10px">Ces sections sont visibles uniquement avec ton compte Oryon.</p></aside><main>${body}</main></div>`}
async function renderChannel(){
 const viewer=state.session.local;
 const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
 if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
 state.lastChannelLogin=targetLogin;
 const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
 const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
 const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
 state.channelSupport=support;
 const isOwner=!!viewer && viewer.login===targetLogin;
 const lives=await api('/api/native/lives');
 const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
 const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
 state.channelProfile=p; state.channelOwner=isOwner;
 const offlineImg=p.offline_image_url||p.banner_url||'';
 const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
 const supporters=(support.first_supporters||[]).slice(0,8);
 const channelBadges=channelBadgesFor(p,support,isOwner);
 const ownerActions=isOwner?`<div class="row"><button class="btn" onclick="setView('manager')">Gestionnaire de stream</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button></div>`:`<div class="row"><button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre</button></div>`;
 const liveMode=p.oryon_local_player_url?'Oryon Live / OBS actif':(isLive?'Live navigateur actif':'Hors live');
 const whyEnter=`<div class="livePrelude section"><div><div class="row"><span class="eyebrow"><i class="dot"></i>${isLive?'En direct':'Salon'}</span><span class="pill">${esc(liveMode)}</span><span class="pill">${esc(tags.slice(0,2).join(' · ')||'chill')}</span></div><h2 style="margin:10px 0 0">Entrée douce</h2><div class="reasonChips section"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span></div></div><div class="comfortRing" style="--score:${Number(liveRoom?.viewers||0)<=50?92:74}%">${Number(liveRoom?.viewers||0)<=50?92:74}</div></div><div class="panel section"><h2>Badges de chaîne</h2><div class="channelBadgeRail">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div><div class="panel section"><div class="pageHead"><div><h2>Premiers soutiens</h2></div></div><div class="supporters">${supporters.length?supporters.map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(''):'<span class="small">Aucun encore.</span>'}</div></div>`;
 $('#channel').innerHTML=`<div class="channelPage publicChannel"><div class="pageHead"><div><h1>${isOwner?'Ma chaîne':esc(p.display_name||p.login)}</h1><p>${isOwner?'Ta page publique persistante.':'Page publique du streamer.'}</p></div>${ownerActions}</div><div class="channelBanner">${p.banner_url?`<img src="${esc(p.banner_url)}" alt="">`:`<div class="bannerFallback"></div>`}</div><div class="channelMeta"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div><h1>${esc(p.display_name||p.login)}</h1><p class="muted">${esc(p.bio||'Chaîne Oryon')}</p><div class="row"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${support?.count?`<span class="pill">${support.count} premiers soutiens</span>`:''}</div></div>${isOwner?`<button id="channelLaunchBtn" class="btn good" onclick="setView('manager')">${isLive?'Gérer le live':'Préparer / lancer'}</button>`:''}</div>${whyEnter}<div class="watchShell channelWatch section"><div class="watchMain"><div class="player premiumPlayer oryonMainPlayer">${(p.oryon_local_player_url) ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(p.oryon_local_player_url)}"></iframe>` : ((p.peertube_embed_url||p.peertube_watch_url) && !isLive ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(normalizePeerTubeEmbed(p.peertube_embed_url,p.peertube_watch_url))}"></iframe>` : `<video id="localVideo" autoplay muted playsinline class="${isOwner&&state.stream?'':'hidden'}"></video><video id="remoteVideo" autoplay playsinline class="hidden"></video><div id="offlinePanel" class="emptyStatePlayer" style="display:${(isOwner&&state.stream)?'none':'grid'}">${offlineImg?`<img class="offlinePoster" src="${esc(offlineImg)}" alt="">`:''}<div class="offlineOverlay"><div><h2>${isLive?'Connexion au live…':'Chaîne hors ligne'}</h2><p class="muted">${isLive?'Si la vidéo tarde, utilise le bouton Relancer ou recharge cette page.':'Image hors live ou bannière configurée.'}</p>${isOwner?`<button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button>`:`<button class="btn" onclick="quickGem()">Trouver une autre pépite</button>`}</div></div></div>`)}</div><div class="tabs"><button class="tabBtn active" onclick="chanTab(this,'about')">À propos</button><button class="tabBtn" onclick="chanTab(this,'planning')">Planning</button><button class="tabBtn" onclick="chanTab(this,'clips')">Clips</button></div><div id="channelTab" class="panel"></div></div><aside class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></aside></div></div>`;
 if(isLive)setMiniLive({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
 chanTab(null,'about'); setupSocket(); state.room=targetLogin; state.socket.emit('native:chat:history',{room:state.room});
 if(isOwner && state.stream){ attachCurrentStream(); }
 else if(isLive){ state.socket.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer(),500); setTimeout(()=>{ if($('#remoteVideo') && !$('#remoteVideo').srcObject) toast('Connexion vidéo en attente. Clique sur Relancer si besoin.'); },3500); } }
 updateLiveUi(isLive);
 refreshEmoteShelf(targetLogin);
}
function channelBadgesFor(p,support,isOwner){const base=[{icon:'✦',label:'Oryon',note:'chaîne native'},{icon:'🌙',label:'Ambiance',note:(Array.isArray(p.tags)?p.tags:[]).slice(0,2).join(' · ')||'chill'},{icon:'👋',label:'Accueil',note:'nouveaux visibles'}]; const custom=Array.isArray(p.channel_badges)?p.channel_badges:[]; const out=[...custom.map(b=>({icon:b.icon||'🏷️',label:b.label||'Badge',note:b.note||'visible'})),...base]; if(support?.already)out.unshift({icon:'⭐',label:'Premier soutien',note:'trace visible'}); if(isOwner)out.unshift({icon:'🎙️',label:'Créateur',note:'propriétaire'}); return out.slice(0,8)}
function chanTab(btn,tab){
 $$('.tabBtn').forEach(b=>b.classList.remove('active')); btn?.classList.add('active');
 const p=state.channelProfile||{}; const isOwner=!!state.channelOwner;
 const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
 const supporters=(state.channelSupport?.first_supporters||[]).slice(0,12);
 if(tab==='about'){
   $('#channelTab').innerHTML=`<h2>À propos</h2><div class="summaryList"><div class="summaryItem"><b>Bio</b><p>${esc(p.bio||'Cette chaîne n’a pas encore ajouté de bio.')}</p></div>${tags.length?`<div class="summaryItem"><b>Tags</b><p>${tags.map(t=>`<span class="pill">${esc(t)}</span>`).join(' ')}</p></div>`:''}<div class="summaryItem"><b>Badges visibles</b><div class="channelBadgeRail">${channelBadgesFor(p,state.channelSupport,isOwner).map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div><div class="summaryItem"><b>Premiers soutiens</b><p>${supporters.length?supporters.map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(' '):'<span class="muted">Aucun pour le moment.</span>'}</p></div></div>${isOwner?`<div class="row section"><button class="btn" onclick="setView('settings')">Modifier À propos</button><button class="btn secondary" onclick="setView('studio')">Emotes / badges</button></div>`:''}`;
   return;
 }
 if(tab==='planning'){
   $('#channelTab').innerHTML='<h2>Planning</h2><div id="channelPlanning" class="planningTimeline"><div class="empty">Chargement…</div></div>';
   loadChannelPlanning(p.login); return;
 }
 if(tab==='clips'){
   $('#channelTab').innerHTML=`<h2>Clips</h2><div class="empty">Les clips Oryon arrivent ensuite. En attendant, ajoute tes meilleurs moments dans ta description ou ton planning.</div>`; return;
 }
 $('#channelTab').innerHTML='<div class="empty">Section indisponible.</div>';
}
async function loadChannelPlanning(login){
 const r=await api('/api/oryon/planning?login='+encodeURIComponent(login||''));
 const box=$('#channelPlanning'); if(!box)return;
 const items=(r.items||[]).filter(x=>Number(x.when)>Date.now()).slice(0,6);
 box.innerHTML=items.length?items.map(x=>`<div class="planCard"><b>${esc(x.title||'Live prévu')}</b><span>${new Date(x.when).toLocaleString('fr-FR',{weekday:'long',day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'})}</span><em>${esc(x.category||'Sans catégorie')}</em></div>`).join(''):'<div class="empty">Aucun live planifié pour le moment.</div>';
}
async function renderManager(){
 if(!state.session.local){$('#manager').innerHTML=authRequired();return}
 const u=state.session.local;
 let cfg=await api('/api/oryon/stream-key'); if(!cfg.success) cfg={success:false,stream_key:'Indisponible'};
 let local=await api('/api/oryon/local-agent/config').catch(()=>({success:false}));
 $('#manager').innerHTML=creatorShell('manager',`<div class="pageHead"><div><h1>Gestionnaire de stream</h1><p>Deux méthodes utiles : live navigateur rapide ou OBS avec Oryon Live.</p></div><span class="pill">Compte : ${esc(u.login)}</span></div>
 <div class="streamModeGrid section"><div class="modeCard active"><span class="pill">Navigateur</span><h2>Écran / caméra</h2><p class="muted">Sans installation. Idéal pour tester rapidement.</p></div><div class="modeCard active"><span class="pill">OBS</span><h2>Oryon Live</h2><p class="muted">L’app sur ton PC reçoit OBS et publie le live sur ta chaîne Oryon.</p></div></div>
 <div class="managerHero section"><div class="panel"><h2>Lancer un live navigateur</h2><p class="muted">Capture écran/caméra en 1080p idéal. Le live apparaît sur l’accueil et sur ta chaîne.</p><div class="three"><input id="liveTitle" placeholder="Titre du live" value="Live de ${esc(u.display_name||u.login)}"><input id="liveCategory" placeholder="Catégorie"><input id="liveTags" placeholder="tags : RP, chill, FR"></div><div class="three section"><select id="liveQuality"><option value="1080" selected>1080p recommandé</option><option value="720">720p léger</option></select><select id="liveSource"><option value="screen" selected>Partage écran</option><option value="screen-camera">Écran + caméra incrustée</option><option value="camera">Caméra</option><option value="obs">OBS avec Oryon Live</option></select><button id="startLiveBtn" class="btn good" onclick="if($('#liveSource')?.value==='obs'){document.getElementById('oryonLivePanel')?.scrollIntoView({behavior:'smooth'});toast('Lance Oryon Live puis OBS.')}else startLive()">Lancer en direct</button><button id="stopLiveBtn" class="btn bad hidden" onclick="stopLive()">Arrêter le live</button></div><div class="row section"><span id="streamStateBadge" class="pill">Hors ligne</span><button class="btn ghost" onclick="state.watchRoom=null;setView('channel')">Voir ma chaîne</button><button class="btn ghost" onclick="setView('settings')">Image hors live</button></div><div class="managerPreview section"><h2>Prévisualisation</h2><div class="player premiumPlayer"><video id="localVideo" autoplay muted playsinline></video><div id="managerPreviewEmpty" class="offlineOverlay"><div><h2>Hors ligne</h2><p class="muted">Choisis Navigateur pour prévisualiser ici. Choisis OBS avec Oryon Live pour utiliser l’app.</p></div></div></div></div></div>
 <aside class="obsBox" id="oryonLivePanel"><h2>OBS avec Oryon Live</h2><p class="muted">Télécharge l’app, connecte ton compte Oryon, puis clique Démarrer sur Oryon dans l’app.</p><div class="summaryItem downloadAppCard"><b>Application Oryon Live</b><p class="small">Ton PC reçoit OBS et publie automatiquement le player sur ta chaîne.</p><a class="btn good" href="${esc(local.download_url||'/downloads/oryon-local-app.zip')}" download>Télécharger Oryon Live</a></div><div class="summaryItem section"><b>Réglage OBS</b><div class="codeBox" id="obsLocalConfig">Serveur : ${esc(local.local_rtmp_url||'rtmp://127.0.0.1:1935/live')}<br>Clé : ${esc(cfg.stream_key||local.stream_key||'ta_clé_oryon')}</div><button class="btn secondary section" onclick="copyText('#obsLocalConfig')">Copier config OBS</button><p class="small">Dans OBS : Service personnalisé. Désactive Vidéo multipiste.</p></div></aside></div>`);
 attachCurrentStream(); updateLiveUi(!!state.stream)
}

function copyText(sel){const el=$(sel); if(!el)return; navigator.clipboard?.writeText(el.textContent||''); toast('Copié')}
async function regenStreamKey(){const r=await api('/api/oryon/stream-key/regenerate',{method:'POST'}); toast(r.success?'Clé régénérée':r.error); renderManager()}
async function renderDashboard(){if(!state.session.local){$('#dashboard').innerHTML=authRequired();return} $('#dashboard').innerHTML=creatorShell('dashboard',`<div class="pageHead"><div><h1>Tableau de bord créateur</h1><p>Résumé du stream, progression, objectifs et actions utiles.</p></div><button class="btn" onclick="claimPoints()">Récupérer points</button></div><div id="dashStats" class="stats"></div><div class="managerGrid section"><div class="panel"><h2>Résumé du stream</h2><div id="streamSummary" class="summaryList"></div></div><div class="panel"><h2>Niveau et points</h2><div id="levelBox"></div></div></div><div class="dashGrid section"><div class="panel"><h2>Progression audience / chat / follows</h2><div id="dashChart" class="chart"></div></div><div class="panel"><h2>Conseils actionnables</h2><div id="insights"></div></div></div><div class="three section"><div class="panel"><h2>Meilleurs créneaux</h2><div id="bestSlots"></div></div><div class="panel"><h2>Objectifs</h2><div id="objectives"></div></div><div class="panel"><h2>Historique de streams</h2><div id="streamHistory"></div></div></div>`); await loadDashboard()}
async function loadDashboard(){
 const d=await api('/api/oryon/dashboard/full'); const p=await api('/api/oryon/creator/progression'); if(!d.success){toast(d.error);return} const s=d.stats||{};
 $('#dashStats').innerHTML=[['Followers',s.followers||0],['Suivis',s.following||0],['Score',s.creator_score||0],['Live',s.live?'Oui':'Non']].map(([a,b])=>`<div class="stat"><span class="small">${a}</span><b>${b}</b></div>`).join('');
 $('#streamSummary').innerHTML=[['État',s.live?'En direct':'Hors ligne'],['Après live','Zone préparée pour transformer chaque live en progression concrète : titre, chat, pic, follows, prochaine action.'],['Prochaine action',s.live?'Prépare un raid inversé et surveille le chat':'Prépare titre, catégorie et créneau'],['Priorité Oryon','Régularité, chat sain et découverte des petits créateurs']].map(([a,b])=>`<div class="summaryItem"><b>${a}</b><br><span class="muted">${b}</span></div>`).join('');
 $('#dashChart').innerHTML=(d.history||[]).map(h=>`<div class="bar" style="height:${Math.min(100,12+(h.chat||0))}%"><span>${esc(h.label)}</span></div>`).join('');
 $('#levelBox').innerHTML=`<div class="stat"><span class="small">Niveau</span><b>${p.level||1}</b><p>${p.points||0} points futurs Trade</p><div class="progress"><i style="width:${Math.min(100,((p.points||0)/(p.nextLevelAt||100))*100)}%"></i></div></div><div class="postLiveBox section"><b>Résumé après live préparé</b><p class="small">À la fin d’un live, cette zone pourra convertir les messages, follows et raids inversés en objectifs et points.</p></div>`;
 $('#insights').innerHTML=(d.insights||[]).map(x=>`<p>• ${esc(x)}</p>`).join(''); $('#bestSlots').innerHTML=(d.bestSlots||[]).map(x=>`<p><b>${esc(x.slot)}</b><br><span class="small">${esc(x.why)}</span></p>`).join(''); $('#objectives').innerHTML=(p.objectives||[]).map(o=>`<p>${o.done?'✅':'⬜'} ${esc(o.label)} <span class="small">+${o.points}</span></p>`).join(''); $('#streamHistory').innerHTML=(d.streams||[]).map(x=>`<p><b>${esc(x.title)}</b> — pic ${x.peak}, chat ${x.chat}, follows ${x.follows}</p>`).join('')||'<p class="muted">Aucun historique.</p>'
}
async function claimPoints(){const r=await api('/api/oryon/creator/progression/claim',{method:'POST'}); toast(r.success?`+${r.gained} points`:r.error); renderDashboard()}
function renderStudio(){if(!state.session.local){$('#studio').innerHTML=authRequired();return} const sections=['Résumé du stream','Confidentialité','Portail des appels','Émoticônes','Abonnements','Drops et récompenses','Badges de chaîne','Portefeuille','Réglage du contenu','Langue','Modération']; $('#studio').innerHTML=creatorShell('studio',`<div class="pageHead"><div><h1>Outils créateur</h1><p>Chaque section est séparée pour éviter le panneau confus.</p></div></div><div class="sideLayout"><aside class="side">${sections.map((s,i)=>`<button class="${i?'':'active'}" onclick="studioSec(this,'${esc(s)}')">${esc(s)}</button>`).join('')}</aside><div id="studioBody" class="panel"></div></div>`); studioSec(null,sections[0])}
function studioSec(btn,name){
 $$('.side button').forEach(b=>b.classList.remove('active')); btn?.classList.add('active');
 const blocks={
  'Résumé du stream':`<div class="stats"><div class="stat"><span class="small">Statut</span><b>${state.stream?'En direct':'Hors ligne'}</b></div><div class="stat"><span class="small">Action</span><b>${state.stream?'Surveiller le chat':'Préparer le titre'}</b></div><div class="stat"><span class="small">Priorité</span><b>Clarté du live</b></div></div><div class="summaryItem section"><b>Checklist rapide</b><p class="muted">Titre précis, catégorie juste, tags FR/chill/RP si pertinent, image hors live propre, planning renseigné.</p></div>`,
  'Confidentialité':`<div class="summaryList"><div class="summaryItem"><b>Visibilité de la chaîne</b><p>Choisis ce qui est public : bio, planning, équipes, badges, statistiques.</p></div><div class="summaryItem"><b>Données personnelles</b><p>Prévu : export/suppression de compte, masquage des suivis, blocage utilisateur.</p></div></div>`,
  'Portail des appels':`<div class="summaryList"><div class="summaryItem"><b>Contestations</b><p>Prévu pour contester un ban, un signalement ou une restriction de visibilité.</p></div><div class="summaryItem"><b>Historique</b><p>Les décisions de modération seront listées ici avec leur statut.</p></div></div>`,
  'Émoticônes':emoteStudio(),
  'Abonnements':`<div class="summaryList"><div class="summaryItem"><b>MVP gratuit</b><p>Désactivé pour l’instant. Plus tard : abonnements plus simples et commission plus basse.</p></div></div>`,
  'Drops et récompenses':`<div class="summaryList"><div class="summaryItem"><b>Récompenses communautaires</b><p>Prévu : objectifs de live, badges temporaires, récompenses d’équipe, événements.</p></div></div>`,
  'Badges de chaîne':badgeStudio(),
  'Portefeuille':`<div class="summaryList"><div class="summaryItem"><b>Points créateur</b><p>Ces points préparent le retour de Trade. Ils doivent récompenser la qualité communautaire, pas le farming.</p></div></div>`,
  'Réglage du contenu':`<div class="summaryList"><div class="summaryItem"><b>Tags et ambiance</b><p>Définis langue, catégorie principale, ambiance, contenu mature et règles de salon.</p></div></div>`,
  'Langue':`<div class="summaryList"><div class="summaryItem"><b>Langue principale</b><p>Utilisée pour la découverte, le classement anti-gros et les recommandations.</p></div></div>`,
  'Modération': modPanel()
 };
 $('#studioBody').innerHTML=`<h2>${esc(name)}</h2>${blocks[name]||'<p class="muted">Section en préparation.</p>'}`;
 if(name==='Modération')loadMod(); if(name==='Émoticônes')loadCreatorEmotes(); if(name==='Badges de chaîne')bindBadgeStudio();
}
function emoteStudio(){return `<div class="summaryList"><div class="summaryItem"><b>Ajouter une emote</b><form id="emoteForm" class="three section"><input id="emoteCode" placeholder="Code : GG"><select id="emoteGate"><option value="follow">Follow requis</option><option value="like">Like requis</option><option value="free">Libre</option></select><input id="emoteFile" type="file" accept="image/*"><input id="emoteImage" type="hidden"><button class="btn">Ajouter</button></form></div><div id="creatorEmotes" class="emoteCreatorGrid section"><div class="empty">Chargement…</div></div></div>`}
async function loadCreatorEmotes(){const u=state.session.local;if(!u)return; const img=$('#emoteFile'), hidden=$('#emoteImage'); if(img)fileToData(img,hidden); const form=$('#emoteForm'); if(form&&!form._bound){form._bound=true; form.onsubmit=async e=>{e.preventDefault(); const r=await api('/api/oryon/emotes',{method:'POST',body:JSON.stringify({code:$('#emoteCode').value,image_url:$('#emoteImage').value,gate:$('#emoteGate').value})}); toast(r.success?'Emote ajoutée':r.error); loadCreatorEmotes();};} const r=await api('/api/oryon/emotes/'+encodeURIComponent(u.login)); const box=$('#creatorEmotes'); if(box)box.innerHTML=(r.emotes||[]).map(e=>`<div class="emoteCard"><img src="${esc(e.image_url)}" alt=""><b>:${esc(e.code)}:</b><span class="pill">${e.gate==='free'?'libre':e.gate==='like'?'like requis':'follow requis'}</span></div>`).join('')||'<div class="empty">Aucune emote.</div>'}
function badgeStudio(){const u=state.session.local||{}; const badges=Array.isArray(u.channel_badges)?u.channel_badges:[]; return `<div class="summaryList"><div class="summaryItem"><b>Badges très visibles</b><form id="badgeForm" class="three section"><input id="badgeIcon" placeholder="Icône : 🌙"><input id="badgeLabel" placeholder="Nom : Chill"><input id="badgeNote" placeholder="Note : ambiance douce"><button class="btn">Ajouter</button></form></div><div id="badgePreview" class="channelBadgeRail">${badges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon||'🏷️')}</strong><b>${esc(b.label||'Badge')}</b><span class="small">${esc(b.note||'visible')}</span></div>`).join('')}</div></div>`}
function bindBadgeStudio(){const form=$('#badgeForm'); if(!form)return; form.onsubmit=async e=>{e.preventDefault(); let pr=await api('/api/oryon/profile/'+encodeURIComponent(state.session.local.login)); const current=pr.user||{}; const badges=Array.isArray(current.channel_badges)?current.channel_badges:[]; badges.unshift({icon:$('#badgeIcon').value||'🏷️',label:$('#badgeLabel').value||'Badge',note:$('#badgeNote').value||'visible'}); const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify({display_name:current.display_name||state.session.local.display_name||state.session.local.login,bio:current.bio||'',avatar_url:current.avatar_url||'',banner_url:current.banner_url||'',offline_image_url:current.offline_image_url||'',tags:(current.tags||[]).join(', '),channel_badges:badges.slice(0,8),peertube_watch_url:'',peertube_embed_url:'',oryon_local_player_url:current.oryon_local_player_url||'',oryon_local_status_url:current.oryon_local_status_url||''})}); toast(r.success?'Badge ajouté':r.error); await loadSession(); studioSec(null,'Badges de chaîne');};}
async function refreshEmoteShelf(login){state.channelEmotes=[]; if(!login)return; const r=await api('/api/oryon/emotes/'+encodeURIComponent(login)); state.channelEmotes=r.emotes||[]; renderEmoteShelf();}
function renderEmoteShelf(){const box=$('#customEmoteShelf'); if(!box)return; const items=state.channelEmotes||[]; box.innerHTML=items.length?`<div class="emoteShelf">${items.map(e=>`<button class="emoteBtn ${e.allowed?'':'locked'}" onclick="selectCustomEmote('${esc(e.code)}')" title=":${esc(e.code)}:"><img src="${esc(e.image_url)}" alt=""><span>:${esc(e.code)}:</span></button>`).join('')}</div>`:'<div class="small">Aucune emote de chaîne.</div>';}
function toggleEmotes(){const box=$('#customEmoteShelf'); if(!box)return; box.classList.toggle('hidden'); renderEmoteShelf();}
function selectCustomEmote(code){const e=(state.channelEmotes||[]).find(x=>x.code===code); if(!e)return; if(!e.allowed)return toast(e.gate==='like'?'Aime la chaîne pour utiliser cette emote.':'Suis la chaîne pour utiliser cette emote.'); state.selectedEmote=e; const input=$('#chatInput'); if(input&&!input.value.includes(':'+e.code+':'))input.value=(input.value+' :'+e.code+':').trim(); toast('Emote prête')}
async function renderSettings(){let u=state.session.local; if(u?.login){try{const pr=await api('/api/oryon/profile/'+encodeURIComponent(u.login)); if(pr.success&&pr.user)u=pr.user;}catch(_){}} $('#settings').innerHTML=`<div class="pageHead"><div><h1>Compte et paramètres</h1><p>Profil Oryon, connexions externes et planning. Twitch, Discord et Google se gèrent ici pour rester liés à ton compte.</p></div></div>${u?profileSettings(u):authSettings()}<div class="two section"><div class="panel"><h2>Connexions externes</h2><div class="summaryList"><div class="summaryItem"><b>Twitch</b><p class="small">${state.session.twitch?'Connecté : '+esc(state.session.twitch.display_name||state.session.twitch.login):'Non connecté. Connecte Twitch pour voir tes suivis en live dans Découvrir.'}</p><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="summaryItem"><b>Discord</b><p class="small">Prévu : connexion Discord, rôles communauté et notifications serveur.</p><button class="btn secondary" onclick="toast('Discord sera branché ensuite')">Préparer Discord</button></div><div class="summaryItem"><b>Google</b><p class="small">Prévu : connexion Google pour simplifier la création de compte Oryon.</p><button class="btn secondary" onclick="toast('Connexion Google sera branchée ensuite')">Préparer Google</button></div></div>${u?`<div class="row section"><button class="btn secondary" onclick="logoutOryon()">Déconnecter Oryon</button></div>`:''}</div><div class="panel"><h2>Statut technique</h2><div id="foundationStatus" class="muted">Chargement…</div><p class="small section">Pour éviter de recréer les comptes après redéploiement Render, active une persistance durable : Firebase déjà présent, Supabase/PostgreSQL ou un Render Disk via ORYON_DATA_DIR.</p></div></div><div id="planningSettings" class="section"></div>`; bindSettingsForms(); loadFoundation(); if(u)renderPlanning()}
function authSettings(){return `<div class="two"><form id="loginForm" class="panel"><h2>Connexion Oryon</h2><input id="loginName" placeholder="pseudo"><input id="loginPass" type="password" placeholder="mot de passe"><button class="btn section">Se connecter</button></form><form id="registerForm" class="panel"><h2>Créer un compte</h2><input id="regName" placeholder="pseudo"><input id="regEmail" type="email" placeholder="email"><input id="regPass" type="password" placeholder="mot de passe"><button class="btn section">Créer</button></form></div>`}
function profileSettings(u){return `<form id="profileForm" class="panel"><h2>Profil de chaîne</h2><p class="muted">Ces éléments alimentent ta page chaîne persistante, y compris l’image affichée dans le lecteur quand tu es hors live.</p><div class="two"><input id="profileDisplay" placeholder="Nom affiché" value="${esc(u.display_name||'')}"><input id="profileTags" placeholder="Tags : RP, chill, FR" value="${esc((u.tags||[]).join(', '))}"><textarea id="profileBio" placeholder="Bio">${esc(u.bio||'')}</textarea><div><label class="small">Logo de chaîne</label><input id="avatarFile" type="file" accept="image/*"><input id="profileAvatar" type="hidden" value="${esc(u.avatar_url||'')}"><label class="small">Bannière de chaîne</label><input id="bannerFile" type="file" accept="image/*"><input id="profileBanner" type="hidden" value="${esc(u.banner_url||'')}"><label class="small">Image hors live du lecteur</label><input id="offlineFile" type="file" accept="image/*"><input id="profileOffline" type="hidden" value="${esc(u.offline_image_url||'')}"></div></div><button class="btn section">Sauvegarder</button></form>`}
async function loadFoundation(){const r=await api('/api/oryon/foundation/status'); $('#foundationStatus').innerHTML=r.success?`Persistance : <b>${esc(r.persistence.mode)}</b><br>${esc(r.persistence.note)}<br>Admin : <b>sansahd</b>`:'Indisponible'}
function bindSettingsForms(){const lf=$('#loginForm'); if(lf)lf.onsubmit=async e=>{e.preventDefault(); const r=await api('/api/oryon/login',{method:'POST',body:JSON.stringify({login:$('#loginName').value,password:$('#loginPass').value})}); toast(r.success?'Connecté':r.error); if(r.success){if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null} await loadSession();setView('home')}}; const rf=$('#registerForm'); if(rf)rf.onsubmit=async e=>{e.preventDefault(); const r=await api('/api/oryon/register',{method:'POST',body:JSON.stringify({login:$('#regName').value,email:$('#regEmail').value,password:$('#regPass').value})}); toast(r.success?'Compte créé':r.error); if(r.success){if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null} await loadSession();state.watchRoom=null;setView('channel')}}; const pf=$('#profileForm'); if(pf){fileToData($('#avatarFile'),$('#profileAvatar')); fileToData($('#bannerFile'),$('#profileBanner')); fileToData($('#offlineFile'),$('#profileOffline')); pf.onsubmit=async e=>{e.preventDefault(); const prev=await api('/api/oryon/profile/'+encodeURIComponent(state.session.local?.login||'')); const cur=prev.user||{}; const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify({display_name:$('#profileDisplay').value,bio:$('#profileBio').value,avatar_url:$('#profileAvatar').value,banner_url:$('#profileBanner').value,offline_image_url:$('#profileOffline').value,tags:$('#profileTags').value,channel_badges:cur.channel_badges||[],peertube_watch_url:'',peertube_embed_url:'',oryon_local_player_url:cur.oryon_local_player_url||state.channelProfile?.oryon_local_player_url||'',oryon_local_status_url:cur.oryon_local_status_url||state.channelProfile?.oryon_local_status_url||''})}); toast(r.success?'Profil sauvegardé':r.error); await loadSession(); renderSettings()}}}
function fileToData(input,target){if(!input)return; input.onchange=()=>{const f=input.files[0]; if(!f)return; compressImage(f).then(data=>{target.value=data; toast('Image prête. Clique sur Sauvegarder.')}).catch(()=>toast('Image non lisible.'))}}
function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(); const rd=new FileReader(); rd.onload=()=>{img.onload=()=>{const max=1000; let w=img.width,h=img.height; const ratio=Math.min(1,max/Math.max(w,h)); w=Math.round(w*ratio); h=Math.round(h*ratio); const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h); resolve(c.toDataURL('image/jpeg',0.65));}; img.onerror=reject; img.src=rd.result}; rd.onerror=reject; rd.readAsDataURL(file)})}
function renderPlanning(){const box=$('#planningSettings'); box.innerHTML=`<div class="panel funPlanner"><div class="pageHead"><div><h2>Planning</h2><p>Planifie vite tes prochains lives avec des cartes lisibles sur ta chaîne.</p></div><button class="btn secondary" type="button" onclick="quickPlanTonight()">Ce soir 21h</button></div><form id="planningForm" class="plannerForm"><input id="planTitle" placeholder="Titre du live"><input id="planCategory" placeholder="Catégorie"><input id="planTags" placeholder="Tags"><input id="planWhen" type="datetime-local"><button class="btn">Ajouter</button></form><div id="planningList" class="planningTimeline section"></div></div>`; $('#planningForm').onsubmit=async e=>{e.preventDefault();const r=await api('/api/oryon/planning',{method:'POST',body:JSON.stringify({title:$('#planTitle').value,category:$('#planCategory').value,tags:$('#planTags').value,when:$('#planWhen').value})});toast(r.success?'Live planifié':r.error);loadPlanning()}; loadPlanning()}
function quickPlanTonight(){const d=new Date();d.setHours(21,0,0,0); if(d<Date.now())d.setDate(d.getDate()+1); $('#planWhen').value=d.toISOString().slice(0,16); if(!$('#planTitle').value)$('#planTitle').value='Live du soir';}
async function loadPlanning(){const r=await api('/api/oryon/planning?login='+(state.session.local?.login||'')); $('#planningList').innerHTML=(r.items||[]).map(x=>`<div class="card"><b>${esc(x.title)}</b><p>${new Date(x.when).toLocaleString('fr-FR')}</p><span class="pill">${esc(x.category)}</span></div>`).join('')||'<div class="empty">Aucun live planifié.</div>'}
async function logoutOryon(){await api('/api/oryon/logout',{method:'POST'}); state.session.local=null; if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null} await loadSession(); setView('home'); toast('Déconnecté')}
async function renderAdmin(){if(!isAdmin())return setView('home'); $('#admin').innerHTML=`<div class="pageHead"><div><h1>Admin</h1><p>Réservé à sansahd / ORYON_ADMIN_LOGINS.</p></div></div><div id="adminBox" class="panel">Chargement…</div>`; const r=await api('/api/oryon/admin/summary'); $('#adminBox').innerHTML=r.success?`<div class="stats">${Object.entries(r.stats).map(([k,v])=>`<div class="stat"><span class="small">${k}</span><b>${v}</b></div>`).join('')}</div><h2 class="section">Signalements</h2>${(r.reports||[]).map(x=>`<p>${esc(x.user)} → ${esc(x.target||x.room)} : ${esc(x.reason)}</p>`).join('')||'<p class="muted">Aucun signalement.</p>'}`:esc(r.error)}
function attachCurrentStream(){const v=$('#localVideo'); if(v&&state.stream){v.srcObject=state.stream; v.muted=true; v.playsInline=true; v.autoplay=true; v.classList.remove('hidden'); v.style.display='block'; v.play?.().catch(()=>{}); const e=$('#managerPreviewEmpty'); if(e){e.classList.add('hidden'); e.style.display='none';} const off=$('#offlinePanel'); if(off) off.style.display='none';} else {const e=$('#managerPreviewEmpty'); if(e){e.classList.remove('hidden'); e.style.display='grid';}}}
function updateLiveUi(isLive){const start=$('#startLiveBtn'), stop=$('#stopLiveBtn'); if(start) start.classList.toggle('hidden',!!isLive); if(stop) stop.classList.toggle('hidden',!isLive); const badge=$('#streamStateBadge'); if(badge) badge.textContent=isLive?'🔴 En direct':'Hors ligne'; const cb=$('#channelLiveBadge'); if(cb) cb.textContent=isLive?'🔴 En direct':'Hors ligne'; const launch=$('#channelLaunchBtn'); if(launch) launch.textContent=isLive?'Gérer le live':'Préparer / lancer';}
function setupSocket(){
 if(state.socket && state.socket.connected !== false)return;
 if(state.socket && state.socket.connected === false){try{state.socket.connect()}catch{}}
 if(state.socket)return;
 state.socketLogin=state.session.local?.login||'';
 state.socket=io({withCredentials:true,reconnection:true,reconnectionAttempts:8,reconnectionDelay:700});
 state.socket.on('connect',()=>{ if(state.view==='channel' && state.watchRoom && !state.stream){ state.socket.emit('native:join',{room:state.watchRoom}); setTimeout(()=>requestOffer(),450); }});
 state.socket.on('native:created',d=>{state.room=d.room;toast('Live lancé'); state.socket.emit('native:chat:history',{room:d.room}); if($('#offlinePanel'))$('#offlinePanel').style.display='none'; updateLiveUi(true)});
 state.socket.on('native:error',e=>toast(e.message||'Erreur live'));
 state.socket.on('native:stopped',()=>{toast('Le live est terminé'); updateLiveUi(false); const off=$('#offlinePanel'); if(off) off.style.display='grid';});
 state.socket.on('native:viewer',async d=>{if(!state.stream)return; await sendOfferToViewer(d.viewerId,d.room)});
 state.socket.on('native:request-offer',async d=>{if(!state.stream)return; await sendOfferToViewer(d.viewerId,d.room)});
 state.socket.on('native:offer',async d=>{const pc=await peer(d.from); await pc.setRemoteDescription(d.offer); const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); state.socket.emit('native:answer',{to:d.from,room:d.room||state.room,answer:ans})});
 state.socket.on('native:answer',d=>state.peers[d.from]?.setRemoteDescription(d.answer));
 state.socket.on('native:ice',d=>state.peers[d.from]?.addIceCandidate(d.candidate).catch(()=>{}));
 state.socket.on('native:chat',m=>addMsg(m));
 state.socket.on('native:chat:history',d=>{$('#nativeChatLog')&&($('#nativeChatLog').innerHTML=(d.messages||[]).map(msgHtml).join(''),scrollChat())});
}
async function sendOfferToViewer(viewerId,room){
 const pc=await peer(viewerId);
 state.stream.getTracks().forEach(t=>{try{pc.addTrack(t,state.stream)}catch{}});
 const offer=await pc.createOffer();
 await pc.setLocalDescription(offer);
 state.socket.emit('native:offer',{to:viewerId,room:room||state.room,offer});
}
function requestOffer(){ if(state.socket && state.room){ state.socket.emit('native:request-offer',{room:state.room}); }}
function retryWatch(){ if(!state.watchRoom&&!state.room)return; state.room=state.watchRoom||state.room; Object.values(state.peers||{}).forEach(pc=>{try{pc.close()}catch{}}); state.peers={}; setupSocket(); state.socket.emit('native:join',{room:state.room}); setTimeout(()=>requestOffer(),450); toast('Reconnexion au live…'); }
async function peer(id){const cfg=await api('/api/webrtc/config'); const pc=new RTCPeerConnection({iceServers:cfg.iceServers||[{urls:'stun:stun.l.google.com:19302'}]}); state.peers[id]=pc; pc.onicecandidate=e=>{if(e.candidate)state.socket.emit('native:ice',{to:id,room:state.room,candidate:e.candidate})}; pc.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(pc.connectionState)&&state.watchRoom)setTimeout(()=>retryWatch(),900)}; pc.ontrack=e=>{const v=$('#remoteVideo'); if(v){v.srcObject=e.streams[0]; v.classList.remove('hidden'); v.style.display='block'; v.play?.().catch(()=>{}); $('#localVideo')?.classList.add('hidden'); const off=$('#offlinePanel'); if(off) off.style.display='none';}}; return pc}
async function createScreenCameraStream(video){
 const screen=await navigator.mediaDevices.getDisplayMedia({video,audio:true});
 let cam=null;
 try{ cam=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:420},height:{ideal:240}},audio:true}); }catch(e){ toast('Caméra indisponible : partage écran seul.'); }
 if(!cam) return screen;
 const canvas=document.createElement('canvas'); canvas.width=video.width?.ideal||1920; canvas.height=video.height?.ideal||1080;
 const ctx=canvas.getContext('2d'); const sv=document.createElement('video'); sv.srcObject=screen; sv.muted=true; sv.play(); const cv=document.createElement('video'); cv.srcObject=cam; cv.muted=true; cv.play();
 function draw(){ ctx.fillStyle='#030508'; ctx.fillRect(0,0,canvas.width,canvas.height); try{ctx.drawImage(sv,0,0,canvas.width,canvas.height)}catch{}; const w=Math.round(canvas.width*.22), h=Math.round(w*9/16), x=canvas.width-w-32, y=32; ctx.fillStyle='rgba(0,0,0,.4)'; ctx.fillRect(x-6,y-6,w+12,h+12); try{ctx.drawImage(cv,x,y,w,h)}catch{}; requestAnimationFrame(draw); }
 draw(); const out=canvas.captureStream(60); [...screen.getAudioTracks(),...cam.getAudioTracks()].forEach(t=>out.addTrack(t)); out._oryonSources=[screen,cam]; return out;
}
async function startLive(){
 if(!state.session.local)return setView('settings');
 if(state.socket && state.socketLogin !== state.session.local.login){ try{state.socket.disconnect()}catch{} state.socket=null; state.socketLogin=null; }
 state.watchRoom=null; setupSocket();
 const q=$('#liveQuality')?.value||'1080'; const source=$('#liveSource')?.value||'screen';
 const video=q==='720'?{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,max:60}}:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60,max:60}};
 try{state.stream= source==='camera' ? await navigator.mediaDevices.getUserMedia({video,audio:true}) : (source==='screen-camera' ? await createScreenCameraStream(video) : await navigator.mediaDevices.getDisplayMedia({video,audio:true}))}
 catch(e){toast('Impossible de capturer la source vidéo. Vérifie les permissions.');return}
 attachCurrentStream(); $('#localVideo')?.play?.().catch(()=>{}); state.stream.getTracks().forEach(t=>t.onended=()=>stopLive(false)); updateLiveUi(true);
 state.room=state.session.local.login;
 state.socket.emit('native:create',{title:$('#liveTitle')?.value||`Live de ${state.session.local.login}`,category:$('#liveCategory')?.value||'',tags:$('#liveTags')?.value||'',quality:q})
}
function stopLive(stopTracks=true){if(stopTracks){ state.stream?._oryonSources?.forEach(src=>src.getTracks().forEach(t=>t.stop())); state.stream?.getTracks().forEach(t=>t.stop()); } state.stream=null; if(state.socket) state.socket.emit('native:leave'); Object.values(state.peers||{}).forEach(pc=>{try{pc.close()}catch{}}); state.peers={}; updateLiveUi(false); const v=$('#localVideo'); if(v) v.srcObject=null; $('#offlinePanel')&&( $('#offlinePanel').style.display='block'); $('#managerPreviewEmpty')?.classList.remove('hidden'); toast('Live arrêté')}
function openOryon(room){state.watchRoom=String(room||'').toLowerCase(); const item=(state.zap.items||[]).find(x=>(x.host_login||x.room)===state.watchRoom)||{platform:'oryon',host_login:state.watchRoom,host_name:state.watchRoom}; trackDiscovery(item); state.room=state.watchRoom; setMiniLive({type:'oryon',login:state.watchRoom,title:'Oryon · '+state.watchRoom}); location.hash='channel/'+encodeURIComponent(state.watchRoom); setView('channel')}
function sendChat(){if(!state.room)return toast('Aucun salon Oryon actif'); if(!state.socket)setupSocket(); if(!state.session.local)return toast('Connecte-toi à Oryon pour écrire dans le tchat natif.'); state.socket.emit('native:chat',{room:state.room,text:$('#chatInput').value,gif:state.selectedGif,emote:state.selectedEmote?{code:state.selectedEmote.code,image_url:state.selectedEmote.image_url}:null}); $('#chatInput').value=''; state.selectedGif=''; state.selectedEmote=null; $('#gifGrid')?.classList.add('hidden')}
function msgHtml(m){return `<div class="msg"><b>${esc(m.user_display||m.user)}</b> <span class="small">${new Date(m.ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><div>${esc(m.text||'')}</div>${m.emote?`<img src="${esc(m.emote.image_url)}" title=":${esc(m.emote.code)}:">`:''}${m.gif?`<img src="${esc(m.gif)}">`:''}</div>`}
function addMsg(m){const l=$('#nativeChatLog'); if(l){l.insertAdjacentHTML('beforeend',msgHtml(m));scrollChat()}}
function scrollChat(){const l=$('#nativeChatLog'); if(l)l.scrollTop=l.scrollHeight}
async function toggleGifs(){const g=$('#gifGrid'); if(!g)return; g.classList.toggle('hidden'); if(!g.classList.contains('hidden')){const r=await api('/api/gifs/search?q=funny'); const gifs=(r.gifs||[]).slice(0,15); g.innerHTML=gifs.map(x=>`<img src="${esc(x.url||x.images?.fixed_height_small?.url||x)}" onclick="state.selectedGif=this.src;toast('GIF sélectionné')">`).join('')||'<div class="small">Aucun GIF.</div>'}}
async function followOryon(login){if(!state.session.local){toast('Compte Oryon requis');return setView('settings')} const r=await api('/api/oryon/follow/'+encodeURIComponent(login),{method:'POST'}); toast(r.success?'Chaîne suivie':r.error); if(r.success)await refreshEmoteShelf(login)}
function reportRoom(){api('/api/oryon/report',{method:'POST',body:JSON.stringify({room:state.room||state.session.local?.login,reason:'Signalement depuis la page live'})});toast('Signalement envoyé')}
async function init(){await loadSession(); const raw=(location.hash||'#home').slice(1); const parts=raw.split('/'); if(parts[0]==='channel'&&parts[1]){state.watchRoom=decodeURIComponent(parts[1]).toLowerCase(); await setView('channel');} else {await setView(parts[0]||'home')}}
window.addEventListener('hashchange',()=>{const raw=(location.hash||'#home').slice(1); const parts=raw.split('/'); if(parts[0]==='channel'&&parts[1]){state.watchRoom=decodeURIComponent(parts[1]).toLowerCase(); setView('channel');}});
init();


/* Oryon clean live polish */


/* Oryon Flow fusion — banner + lecteur + chat in one spotlight */
(function injectFlowFusionStyle(){
 if(document.getElementById('oryonFlowFusionStyle')) return;
 const st=document.createElement('style');
 st.id='oryonFlowFusionStyle';
 st.textContent=`
 .flowHero.compact{padding:18px 20px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,rgba(139,92,246,.16),rgba(10,16,28,.96) 58%,rgba(34,211,238,.10));display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:center}
 .flowHero.compact .flowTitle{margin:10px 0 0;font-size:clamp(32px,4.2vw,58px);line-height:.95}
 .flowHero.compact .lead{margin:10px 0 0;font-size:15px;max-width:720px;color:#dbe7ff}
 .flowHero.compact .flowDock{display:grid;gap:10px}
 .flowStage.fused{grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start}
 .spotlightShell{display:grid;gap:12px}
 .flowLive.fused{position:relative;overflow:hidden;border:1px solid rgba(139,92,246,.42);border-radius:28px;background:#050810;box-shadow:var(--shadow)}
 .flowLive.fused .zapThumb{aspect-ratio:16/9;position:relative;background:#030508}
 .flowLive.fused .zapThumb::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,7,12,.10),rgba(4,7,12,.74))}
 .flowLive.fused .zapThumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
 .flowOverlay.fused{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:24px;display:grid;gap:12px}
 .reasonChips{display:flex;gap:8px;flex-wrap:wrap}
 .reasonChip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(8,11,18,.72);font-weight:850;font-size:12px}
 .zapActions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
 .microHint{font-size:12px;color:#cbd5e1}
 .spotlightPlay{display:grid;gap:12px}
 .spotlightTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:4px 2px}
 .spotlightTop h2{margin:4px 0 0;font-size:24px;letter-spacing:-.03em}
 .spotlightTop p{margin:6px 0 0;color:var(--muted)}
 .spotlightWatch{grid-template-columns:minmax(0,1fr) 390px!important;gap:12px;background:transparent;border:0}
 .spotlightWatch .player,.spotlightWatch .chatPanel{height:clamp(440px,50vw,720px);min-height:440px;border-radius:22px}
 .spotlightWatch .chatPanel{max-width:none;resize:none}
 .spotlightBar{display:flex;gap:8px;flex-wrap:wrap}
 .compactSignal{display:grid;gap:12px}
 .compactSignal .panel{padding:16px}
 .compactTools{display:grid;grid-template-columns:minmax(0,1fr) 260px auto;gap:10px;align-items:center}
 .compactFollowRail{display:flex;gap:10px;overflow:auto;padding-bottom:4px}
 .compactFollowChip{display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.05);white-space:nowrap}
 .compactFollowChip img{width:26px;height:26px;border-radius:50%;object-fit:cover}
 .compactSearchResults{display:flex;gap:10px;overflow:auto;padding-bottom:4px}
 .compactSearchCard{min-width:240px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.04);padding:12px}
 .compactSearchCard .row{justify-content:space-between}
 .softQueueTitle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}
 @media(max-width:1200px){.flowHero.compact,.flowStage.fused,.spotlightWatch,.compactTools{grid-template-columns:1fr!important}.spotlightWatch .player,.spotlightWatch .chatPanel{height:430px;min-height:430px}.flowHero.compact .flowDock{order:-1}.compactTools{align-items:stretch}}
 `;
 document.head.appendChild(st);
})();

function currentZapItem(){ return (state.zap.items||[])[state.zap.index]||null; }
function currentZapIdentity(){ const x=currentZapItem(); return x?liveIdentity(x):null; }
function ensureSpotlightItem(platform, login){
 const items=state.zap.items||[];
 const idx=items.findIndex(x=>{ const id=liveIdentity(x); return id.platform===platform && id.login===login; });
 if(idx>=0){ state.zap.index=idx; return items[idx]; }
 const seed = platform==='twitch' ? {platform:'twitch', login, display_name:login, user_name:login, title:'Live Twitch', viewer_count:0, game_name:'Twitch'} : {platform:'oryon', host_login:login, host_name:login, title:'Live Oryon', viewers:0, category:'Oryon'};
 state.zap.items=[seed, ...items.filter(x=>liveIdentity(x).login!==login)];
 state.zap.index=0;
 return seed;
}
function clearSpotlightPlayer(){ state.discoverPlayer=null; }
function spotlightIsPlaying(x){ const id=x&&liveIdentity(x); return !!(x && id && state.discoverPlayer && state.discoverPlayer.type===id.platform && state.discoverPlayer.login===id.login); }
function renderSpotlightPreview(x){
 if(!x)return `<div class="flowLive fused"><div class="zapThumb"></div><div class="flowOverlay fused"><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h2>Choisis une ambiance.</h2><p class="muted">Puis Zapper pour recevoir une proposition claire.</p></div></div>`;
 const id=liveIdentity(x), reasons=discoverReasonFor(x), score=comfortScore(x);
 return `<article class="flowLive fused"><div class="zapThumb">${id.img?`<img src="${esc(id.img)}" alt="">`:`<div style="height:100%;display:grid;place-items:center;color:#64748b">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}<span class="zapBadge">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span></div><div class="flowOverlay fused"><div class="row"><span class="pill">${esc(microContextFor(x))}</span><span class="pill">${esc(id.game)}</span><span class="pill">${score}% confort</span></div><h2 style="margin:0;font-size:clamp(28px,3.6vw,48px);line-height:.95">${esc(id.title)}</h2><p class="muted" style="margin:0">${esc(id.name)}</p><div class="reasonChips">${reasons.map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="zapActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="findLive()">Zapper</button><span class="microHint">Test sans pression</span></div></div></article>`;
}
function renderSpotlightPlayer(x){
 const id=liveIdentity(x);
 if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
 const parent=location.hostname;
 return `<div class="spotlightPlay"><div class="spotlightTop"><div><span class="eyebrow"><i class="dot"></i>Lecture en cours</span><h2>${esc(id.name)}</h2><p>${esc(id.title||'Live Twitch')}</p></div><div class="spotlightBar"><span class="pill">${id.viewers} viewers</span><span class="pill">${esc(id.game)}</span><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Retour carte</button><button class="btn ghost" onclick="zapNext()">Suivant</button></div></div><div class="watchShell twitchWatch spotlightWatch"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderCompactFollowed(){
 if(!state.session.twitch){
   const box=$('#followedWrapCompact'); if(box) box.innerHTML=`<div class="row" style="justify-content:space-between;gap:12px"><div><h2 style="margin:0">Twitch dans Oryon Flow</h2><p class="small" style="margin:6px 0 0">Connecte Twitch pour retrouver tes suivis sans quitter Découvrir.</p></div><button class="btn" onclick="connectTwitch()">Connecter Twitch</button></div>`;
   return;
 }
 const box=$('#followedWrapCompact'); if(!box) return;
 box.innerHTML='<div class="small">Chargement des suivis…</div>';
 api('/api/twitch/followed/live').then(async r=>{
   if(!r.success) r=await api('/followed_streams');
   const items=r.items||r.streams||[];
   box.innerHTML=items.length?`<div class="softQueueTitle"><h2 style="margin:0">Tes suivis en live</h2><span class="small">Accès direct</span></div><div class="compactFollowRail">${items.map(x=>`<button class="compactFollowChip" onclick="openTwitch('${esc(x.login||x.user_login)}')"><img src="${esc(x.profile_image_url||'')}" alt=""><span>${esc(x.display_name||x.user_name||x.login||x.user_login)}</span><b>${Number(x.viewer_count||x.viewers||0)}</b></button>`).join('')}</div>`:'<div class="small">Aucune chaîne suivie en live pour le moment.</div>';
 }).catch(()=>{ box.innerHTML='<div class="small">Impossible de charger les suivis Twitch.</div>'; });
}
function renderCompactTwitchSearchResults(items){
 const box=$('#twResults'); if(!box) return;
 box.innerHTML=(items||[]).length ? `<div class="compactSearchResults">${items.map(x=>`<article class="compactSearchCard"><div class="row"><div class="row"><img class="avatarMini" src="${esc(x.profile_image_url||'')}"><b>${esc(x.display_name||x.login)}</b></div><span class="pill">${x.is_live?'Live':'Offline'}</span></div><p class="small" style="margin:10px 0">${esc(x.title||x.game_name||'')}</p><button class="btn" onclick="openTwitch('${esc(x.login)}')">Regarder</button></article>`).join('')}</div>` : '<div class="empty">Aucun résultat Twitch.</div>';
}
async function searchTwitch(){
 const q=$('#twSearch')?.value.trim(); if(!q) return;
 const r=await api('/api/twitch/channels/search?'+qs({q,live:true}));
 renderCompactTwitchSearchResults(r.items||[]);
}
function renderSpotlightMeta(cur){
 const score=cur?comfortScore(cur):0;
 const id=cur?liveIdentity(cur):null;
 const reasons=cur?discoverReasonFor(cur):[];
 return `<aside class="compactSignal"><div class="panel"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Pourquoi ce live</h2><span class="small">${cur?esc(platformLabel(id.platform)):'Signal clair'}</span></div><div class="comfortRing" style="--score:${score}%">${cur?score:'—'}</div></div>${cur?`<div class="reasonChips section">${reasons.map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="vibeBar section">${vibeMetrics(cur).map(v=>`<div class="vibeLine"><span>${esc(v.k)}</span><i style="--w:${v.v}%"></i><b>${v.v}</b></div>`).join('')}</div>`:'<div class="empty section">Aucune proposition pour le moment.</div>'}</div><div class="panel"><h2 style="margin-top:0">Affiner</h2><div class="reactionDock"><button onclick="markZapFeedback('small')">+ petit</button><button onclick="markZapFeedback('quiet')">+ discussion</button><button onclick="markZapFeedback('rp')">RP</button><button onclick="markZapFeedback('game')">jeu</button></div></div><div id="viewerImpactBox" class="panel">${viewerImpactCard()}</div></aside>`;
}
function renderZap(){
 const box=$('#zapResult'); if(!box) return;
 const items=state.zap.items||[];
 const cur=items[state.zap.index]||null;
 box.innerHTML=`<div class="flowStage fused"><div class="spotlightShell">${renderSpotlightPlayer(cur)}</div>${renderSpotlightMeta(cur)}</div>${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Passe au suivant sans perdre le fil</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}`;
 renderViewerImpact();
}
async function findLive(){
 const q=$('#dQuery')?.value||'', mood=$('#dMood')?.value||'', max=$('#dMax')?.value||'50', lang=$('#dLang')?.value||'fr', source=$('#dSource')?.value||'both';
 const results=$('#discoverResults'); if(results) results.innerHTML='<div class="empty">Recherche…</div>';
 const zap=$('#zapResult'); if(zap) zap.innerHTML='<div class="empty">Oryon cherche une proposition lisible…</div>';
 state.discoverPlayer=null;
 const r=await api('/api/oryon/discover/find-live?'+qs({q,mood,max,lang,source}));
 const items=(r.items||[]).filter(x=>(x.platform||'')!=='peertube');
 state.zap.items=items; state.zap.index=0; state.zap.last={q,mood,max,lang,source};
 renderZap();
 if(results) results.innerHTML=items.length?items.slice(1).map(liveCard).join(''):'<div class="empty">Aucun résultat. Élargis le plafond ou change l’ambiance.</div>';
}
function zapNext(){ const items=state.zap.items||[]; if(!items.length) return findLive(); state.discoverPlayer=null; state.zap.index=(state.zap.index+1)%items.length; renderZap(); }
function zapBack(){ const items=state.zap.items||[]; if(!items.length)return; state.discoverPlayer=null; state.zap.index=(state.zap.index-1+items.length)%items.length; renderZap(); }
function zapOpenCurrent(){ const x=currentZapItem(); if(!x) return; const id=liveIdentity(x); trackDiscovery(x); if(id.platform==='twitch'){ state.discoverPlayer={type:'twitch',login:id.login}; setMiniLive({type:'twitch',login:id.login,title:'Twitch · '+id.login}); renderZap(); } else openOryon(id.login); }
function mountTwitchPlayer(login){ const area=$('#twitchPlayerArea'); if(area){ const parent=location.hostname; area.innerHTML=`<div class="watchShell twitchWatch"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div>`; return; } state.discoverPlayer={type:'twitch',login}; renderZap(); }
function openTwitch(login){
 state.currentTwitch=login;
 const item=ensureSpotlightItem('twitch', login);
 trackDiscovery(item);
 setMiniLive({type:'twitch',login,title:'Twitch · '+login});
 if(state.view==='twitch') return mountTwitchPlayer(login);
 const activate=()=>{ state.discoverPlayer={type:'twitch',login}; renderZap(); };
 if(state.view==='discover') return activate();
 setView('discover').then(activate);
}
async function renderDiscover(){
 const el=$('#discover');
 el.innerHTML=`<div class="flowHero compact section"><div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1 class="flowTitle">Trouve ton live.</h1><p class="lead">Une seule scène principale. Tu choisis l’ambiance, Oryon te sert la meilleure entrée.</p><div class="row"><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="quickGem()">Petite commu</button></div></div><aside class="flowDock"><div id="viewerImpactHeroBox">${viewerImpactCard()}</div></aside></div>
 <div class="panel section"><div class="pageHead"><div><h2>Mode Ambiance</h2><p>Des choix simples, sans pavé inutile.</p></div></div><div class="moodDeck">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="moodTile" onclick="$('#dMood').value='${id}';findLive()"><i>${icon}</i><b>${esc(label)}</b><span class="small">${esc(desc)}</span></button>`).join('')}</div><div class="searchLine discoverLine section"><input id="dQuery" placeholder="jeu, pseudo, ambiance"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood"><option value="">Ambiance</option>${AMBIANCES.map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="20">≤20</option><option value="50" selected>≤50</option><option value="200">≤200</option><option value="300">≤300</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div>
 <div id="zapResult" class="section"></div>
 <div class="panel section"><div class="pageHead"><div><h2>Accès Twitch</h2><p>Suivis et recherche, intégrés sans casser la scène principale.</p></div><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="compactTools"><input id="twSearch" placeholder="chercher un streamer Twitch"><div id="followedHint" class="small">Tu peux ouvrir un suivi ou rechercher un live.</div><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="followedWrapCompact" class="section"></div><div id="twResults" class="section"></div></div>
 <div id="discoverResults" class="grid section"></div>
 ${discoveryEventsHtml()}`;
 renderCompactFollowed();
 renderZap();
 renderMiniPlayer();
}

/* Oryon Premium Immersion v3 — calm cinematic discovery */
(function injectPremiumImmersionStyle(){
 if(document.getElementById('oryonPremiumImmersionStyle')) return;
 const st=document.createElement('style');
 st.id='oryonPremiumImmersionStyle';
 st.textContent=`
 .premiumFlowWrap{position:relative;isolation:isolate}
 .ambientBackplate{position:absolute;inset:-18px;z-index:-1;border-radius:38px;overflow:hidden;pointer-events:none;opacity:.72;background:radial-gradient(circle at 18% 12%,rgba(139,92,246,.34),transparent 34%),radial-gradient(circle at 78% 18%,rgba(34,211,238,.18),transparent 36%)}
 .ambientBackplate::before{content:"";position:absolute;inset:0;background:var(--spotBg,none);background-size:cover;background-position:center;filter:blur(44px) saturate(1.22);transform:scale(1.14);opacity:.34}
 .ambientBackplate::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,11,18,.35),#080b12 84%)}
 .flowStage.fused.premium{position:relative;animation:flowRise .38s ease both}
 @keyframes flowRise{from{opacity:0;transform:translateY(12px) scale(.992)}to{opacity:1;transform:translateY(0) scale(1)}}
 .flowLive.fused.premium{border-radius:32px;border-color:rgba(255,255,255,.16);box-shadow:0 30px 100px rgba(0,0,0,.48),0 0 0 1px rgba(139,92,246,.18) inset;transform:translateZ(0);transition:transform .24s ease,border-color .24s ease,box-shadow .24s ease}
 .flowLive.fused.premium:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.55);box-shadow:0 38px 120px rgba(0,0,0,.55),0 0 0 1px rgba(34,211,238,.14) inset}
 .flowLive.fused.premium .zapThumb::after{background:linear-gradient(180deg,rgba(3,6,12,.02),rgba(3,6,12,.52) 58%,rgba(3,6,12,.94))}
 .flowLive.fused.premium .zapThumb img{transform:scale(1.012);transition:transform 5s ease,filter .25s ease;filter:saturate(1.08) contrast(1.04)}
 .flowLive.fused.premium:hover .zapThumb img{transform:scale(1.05)}
 .flowOverlay.fused.premium{padding:clamp(20px,3vw,34px)}
 .premiumHeadline{display:grid;gap:8px;max-width:980px}.premiumHeadline h2{font-size:clamp(30px,4.1vw,64px)!important;letter-spacing:-.06em!important;max-width:1050px;text-wrap:balance}.premiumHeadline p{max-width:780px}
 .quietProof{display:flex;gap:8px;flex-wrap:wrap}.quietProof span{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:rgba(8,11,18,.60);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:900;backdrop-filter:blur(10px)}
 .premiumActions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.premiumActions .btn{box-shadow:0 12px 35px rgba(0,0,0,.24)}
 .softBtn{border:1px solid var(--line);background:rgba(255,255,255,.055);color:#edf4ff;border-radius:13px;padding:10px 12px;font-weight:900}.softBtn:hover{background:rgba(255,255,255,.10)}
 .spotlightPlay.premium{position:relative;animation:flowRise .34s ease both}.spotlightPlay.premium::before{content:"";position:absolute;inset:-16px;z-index:-1;border-radius:34px;background:radial-gradient(circle at 28% 12%,rgba(139,92,246,.20),transparent 38%),radial-gradient(circle at 80% 18%,rgba(34,211,238,.14),transparent 36%)}
 .spotlightTop.premium{padding:10px 4px 4px}.spotlightTop.premium h2{font-size:clamp(28px,3vw,44px);letter-spacing:-.045em}.spotlightWatch.premium .player,.spotlightWatch.premium .chatPanel{border-color:rgba(255,255,255,.14);box-shadow:0 22px 80px rgba(0,0,0,.38)}
 .spotlightWatch.premium .player{position:relative}.spotlightWatch.premium .player::after{content:"";position:absolute;inset:0;border-radius:22px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);pointer-events:none}.spotlightWatch.premium iframe{background:#000}
 .viewerCapsule{display:grid;gap:10px}.viewerCapsuleHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.viewerCapsuleHead b{font-size:18px}.capsuleStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.capsuleStats div{border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:16px;padding:10px}.capsuleStats span{display:block;color:var(--muted);font-size:12px}.capsuleStats b{font-size:22px}.savedRail{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.savedChip{min-width:130px;border:1px solid var(--line);background:rgba(255,255,255,.04);border-radius:14px;padding:9px;font-size:12px}.savedChip b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.moodPad{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.moodPad button{border:1px solid var(--line);background:rgba(255,255,255,.055);color:white;border-radius:14px;padding:10px;font-weight:900;text-align:left}.moodPad button:hover{background:rgba(139,92,246,.13);border-color:rgba(139,92,246,.50)}
 .signalCards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.signalMini{border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:16px;padding:11px}.signalMini span{display:block;color:var(--muted);font-size:12px}.signalMini b{display:block;font-size:18px;margin-top:3px}.ritualRow{display:flex;gap:8px;flex-wrap:wrap}.ritualRow button{border:1px solid var(--line);background:rgba(255,255,255,.055);color:white;border-radius:999px;padding:8px 10px;font-weight:900;font-size:12px}.ritualRow button:hover{background:rgba(34,211,238,.10);border-color:rgba(34,211,238,.35)}
 .cinemaMode .top,.cinemaMode .mobileNav,.cinemaMode .flowHero.compact,.cinemaMode #discover>.panel:first-of-type,.cinemaMode #discover>.panel:nth-of-type(2),.cinemaMode #discoverResults,.cinemaMode .eventGrid,.cinemaMode .pageHead{display:none!important}.cinemaMode .app{max-width:1900px;padding-top:14px}.cinemaMode .flowStage.fused.premium{grid-template-columns:minmax(0,1fr) 360px}.cinemaMode .spotlightWatch.premium .player,.cinemaMode .spotlightWatch.premium .chatPanel{height:calc(100vh - 96px);min-height:620px}.cinemaMode .spotlightTop.premium{display:none}.cinemaMode .spotlightWatch.premium{grid-template-columns:minmax(0,1fr) 390px!important}.cinemaMode .miniPlayer{display:none}
 .focusPulse{animation:focusPulse .75s ease}@keyframes focusPulse{0%{box-shadow:0 0 0 rgba(34,211,238,0)}45%{box-shadow:0 0 0 7px rgba(34,211,238,.14)}100%{box-shadow:0 0 0 rgba(34,211,238,0)}}
 .kbdHints{display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:12px}.kbdHints span{border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:8px;padding:4px 7px}.saveFlash{animation:saveFlash .9s ease}@keyframes saveFlash{0%{transform:scale(1)}35%{transform:scale(1.018);filter:saturate(1.4)}100%{transform:scale(1)}}
 @media(max-width:1200px){.cinemaMode .flowStage.fused.premium,.cinemaMode .spotlightWatch.premium{grid-template-columns:1fr!important}.cinemaMode .spotlightWatch.premium .player,.cinemaMode .spotlightWatch.premium .chatPanel{height:430px;min-height:430px}.capsuleStats,.signalCards,.moodPad{grid-template-columns:1fr}}
 `;
 document.head.appendChild(st);
})();
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
function writeStore(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch{}}
function savedLives(){return readStore('oryon_saved_lives',[])}
function saveCurrentLive(){const x=currentZapItem(); if(!x)return; const id=liveIdentity(x); const all=savedLives().filter(v=>!(v.platform===id.platform&&v.login===id.login)); all.unshift({platform:id.platform,login:id.login,name:id.name,title:id.title,game:id.game,img:id.img,ts:Date.now()}); writeStore('oryon_saved_lives',all.slice(0,24)); const shell=$('.flowLive.fused,.spotlightPlay'); shell?.classList.add('saveFlash'); setTimeout(()=>shell?.classList.remove('saveFlash'),900); toast('Sauvegardé dans tes pépites'); renderZap();}
function notMyVibe(kind='mood'){const labels={mood:'Pas mon mood',loud:'Trop intense',empty:'Trop vide',big:'Trop gros'}; toast(labels[kind]||'Signal envoyé'); if(kind==='loud')markZapFeedback('quiet'); else if(kind==='big')markZapFeedback('small'); else zapNext();}
function viewerCapsuleHtml(){const vp=loadViewerImpact(); const saved=savedLives().slice(0,5); const streak=readStore('oryon_soft_streak',{days:0,last:0}); return `<div class="viewerCapsule"><div class="viewerCapsuleHead"><div><b>Trace viewer</b><div class="small">Impact visible, sans pression.</div></div><span class="pill">${Number(vp.points||0)} aura</span></div><div class="capsuleStats"><div><span>Pépites</span><b>${(vp.discoveries||[]).length}</b></div><div><span>Sauvées</span><b>${savedLives().length}</b></div><div><span>Soutiens</span><b>${(vp.firstSupports||[]).length}</b></div></div>${saved.length?`<div class="savedRail">${saved.map(s=>`<div class="savedChip"><b>${esc(s.name||s.login)}</b><span>${esc(s.game||platformLabel(s.platform))}</span></div>`).join('')}</div>`:'<div class="small">Les lives sauvegardés apparaissent ici.</div>'}<div class="kbdHints"><span>Espace regarder</span><span>→ suivant</span><span>S sauver</span><span>C cinéma</span></div></div>`}
function moodPadHtml(){return `<div class="moodPad"><button onclick="notMyVibe('mood')">Pas mon mood</button><button onclick="notMyVibe('loud')">Plus calme</button><button onclick="notMyVibe('big')">Plus petit</button><button onclick="findLive()">Surprends-moi</button></div>`}
function signalCardsHtml(cur){if(!cur)return '<div class="empty">Aucun signal.</div>'; const score=comfortScore(cur), id=liveIdentity(cur); const small=id.viewers<=20?'Très petite':id.viewers<=50?'Petite':'Moyenne'; const type=id.platform==='twitch'?'Twitch':'Oryon'; return `<div class="signalCards"><div class="signalMini"><span>Confort</span><b>${score}%</b></div><div class="signalMini"><span>Taille</span><b>${small}</b></div><div class="signalMini"><span>Source</span><b>${esc(type)}</b></div><div class="signalMini"><span>Entrée</span><b>Facile</b></div></div>`}
function ritualButtonsHtml(){return `<div class="ritualRow"><button onclick="saveCurrentLive()">Sauver</button><button onclick="toast('Moment marqué')">Marquer</button><button onclick="toast('Réaction douce envoyée')">Bonne vibe</button><button onclick="toggleCinema()">Cinéma</button></div>`}
function toggleCinema(){document.body.classList.toggle('cinemaMode'); toast(document.body.classList.contains('cinemaMode')?'Mode cinéma':'Mode normal')}
function renderSpotlightPreview(x){
 if(!x)return `<div class="flowLive fused premium"><div class="zapThumb"></div><div class="flowOverlay fused premium"><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><div class="premiumHeadline"><h2>Choisis une ambiance.</h2><p class="muted">Une scène, un signal, une entrée simple.</p></div><div class="premiumActions"><button class="btn good" onclick="findLive()">Zapper</button></div></div></div>`;
 const id=liveIdentity(x), reasons=discoverReasonFor(x), score=comfortScore(x);
 return `<article class="flowLive fused premium"><div class="zapThumb">${id.img?`<img src="${esc(id.img)}" alt="">`:`<div style="height:100%;display:grid;place-items:center;color:#64748b">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}<span class="zapBadge">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span></div><div class="flowOverlay fused premium"><div class="quietProof"><span>${score}% confort</span><span>${esc(microContextFor(x))}</span><span>${esc(id.game)}</span></div><div class="premiumHeadline"><h2>${esc(id.title)}</h2><p class="muted">${esc(id.name)}</p></div><div class="reasonChips">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="premiumActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="softBtn" onclick="saveCurrentLive()">Sauver</button><button class="softBtn" onclick="notMyVibe('mood')">Pas mon mood</button><span class="microHint">Preview sans saut de page</span></div></div></article>`;
}
function renderSpotlightPlayer(x){
 const id=liveIdentity(x);
 if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
 const parent=location.hostname;
 return `<div class="spotlightPlay premium"><div class="spotlightTop premium"><div><span class="eyebrow"><i class="dot"></i>Lecture en cours</span><h2>${esc(id.name)}</h2><p>${esc(id.title||'Live Twitch')}</p></div><div class="spotlightBar"><span class="pill">${id.viewers} viewers</span><span class="pill">${esc(id.game)}</span><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Carte</button><button class="btn ghost" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="toggleCinema()">Cinéma</button></div></div><div class="watchShell twitchWatch spotlightWatch premium"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderSpotlightMeta(cur){
 const score=cur?comfortScore(cur):0; const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur):[];
 return `<aside class="compactSignal"><div class="panel"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Signal</h2><span class="small">${cur?esc(platformLabel(id.platform)):'Prêt'}</span></div><div class="comfortRing" style="--score:${score}%">${cur?score:'—'}</div></div>${cur?`<div class="reasonChips section">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="section">${signalCardsHtml(cur)}</div>`:'<div class="empty section">Choisis une ambiance.</div>'}</div><div class="panel"><h2 style="margin-top:0">Contrôle mood</h2>${moodPadHtml()}</div><div class="panel"><h2 style="margin-top:0">Rituels</h2>${ritualButtonsHtml()}</div><div class="panel">${viewerCapsuleHtml()}</div></aside>`;
}
function renderZap(){
 const box=$('#zapResult'); if(!box) return;
 const items=state.zap.items||[]; const cur=items[state.zap.index]||null; const id=cur?liveIdentity(cur):null; const bg=id?.img?`url('${esc(id.img)}')`:'none';
 box.innerHTML=`<div class="premiumFlowWrap" style="--spotBg:${bg}"><div class="ambientBackplate"></div><div class="flowStage fused premium"><div class="spotlightShell">${renderSpotlightPlayer(cur)}</div>${renderSpotlightMeta(cur)}</div>${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Passe au suivant sans perdre le fil</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}</div>`;
}
(function bindOryonPremiumKeys(){
 if(window.__oryonPremiumKeys) return; window.__oryonPremiumKeys=true;
 document.addEventListener('keydown',e=>{if(state.view!=='discover')return; const tag=(e.target?.tagName||'').toLowerCase(); if(['input','textarea','select'].includes(tag))return; if(e.key==='ArrowRight'){e.preventDefault();zapNext()} if(e.key==='ArrowLeft'){e.preventDefault();zapBack()} if(e.key.toLowerCase()==='s'){e.preventDefault();saveCurrentLive()} if(e.key.toLowerCase()==='c'){e.preventDefault();toggleCinema()} if(e.code==='Space'){e.preventDefault();zapOpenCurrent()}});
})();

/* Oryon Room Depth v4 — immersive room, soft quests, duo discovery, living emotes */
(function injectRoomDepthStyle(){
 if(document.getElementById('oryonRoomDepthStyle')) return;
 const st=document.createElement('style');
 st.id='oryonRoomDepthStyle';
 st.textContent=`
 .roomMode .top{background:rgba(4,7,13,.82)}
 .roomMode .flowHero.compact,.roomMode #discover>.panel:first-of-type,.roomMode #discover>.panel:nth-of-type(2),.roomMode #discoverResults{display:none!important}
 .roomShell{position:relative;border:1px solid rgba(139,92,246,.36);border-radius:34px;overflow:hidden;background:#030508;min-height:calc(100vh - 126px);box-shadow:0 30px 120px rgba(0,0,0,.44)}
 .roomShell::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,5,8,.92),rgba(3,5,8,.54) 48%,rgba(3,5,8,.88)),var(--roomBg,none);background-size:cover;background-position:center;filter:saturate(1.15) blur(0px);transform:scale(1.02)}
 .roomShell::after{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 22% 18%,rgba(139,92,246,.36),transparent 24%),radial-gradient(circle at 80% 12%,rgba(34,211,238,.22),transparent 22%),radial-gradient(circle at 58% 92%,rgba(16,185,129,.12),transparent 24%);pointer-events:none}
 .roomGrid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:16px;min-height:inherit;padding:18px}
 .roomMain{display:flex;flex-direction:column;gap:14px;min-width:0}
 .roomTopBar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
 .roomTitle{margin:auto 0 0;display:grid;gap:10px;max-width:980px;padding:0 4px 6px}.roomTitle h1{font-size:clamp(38px,5.4vw,86px);line-height:.86;letter-spacing:-.075em;margin:0;text-shadow:0 22px 70px rgba(0,0,0,.65)}.roomTitle p{margin:0;color:#dbeafe;font-size:16px}
 .roomVideo{position:relative;border:1px solid rgba(255,255,255,.16);border-radius:30px;overflow:hidden;background:#000;min-height:360px;aspect-ratio:16/9;box-shadow:0 24px 80px rgba(0,0,0,.38)}
 .roomVideo iframe,.roomVideo img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}.roomVideo img{filter:saturate(1.08) contrast(1.03)}.roomVideo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,5,8,.04),rgba(3,5,8,.18) 58%,rgba(3,5,8,.74));pointer-events:none}
 .roomOverlayActions{position:absolute;left:16px;right:16px;bottom:16px;z-index:3;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.roomOverlayActions .btn{box-shadow:0 16px 42px rgba(0,0,0,.34)}
 .roomSide{display:flex;flex-direction:column;gap:12px;min-height:0}.roomCard{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.072),rgba(255,255,255,.032));backdrop-filter:blur(18px);padding:14px;box-shadow:0 18px 56px rgba(0,0,0,.24)}.roomCard h2{font-size:17px;margin:0 0 10px}.roomCard p{margin:0;color:var(--muted)}
 .roomChat{flex:1 1 auto;min-height:330px;padding:0;overflow:hidden;display:flex;flex-direction:column}.roomChat iframe{width:100%;height:100%;border:0;background:#10141f}.roomNativeChatHint{flex:1;display:grid;place-items:center;text-align:center;padding:18px;color:var(--muted)}.roomNativeChatHint b{color:#fff;display:block;font-size:19px;margin-bottom:4px}
 .introOverlay{position:absolute;inset:0;z-index:8;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,rgba(139,92,246,.22),transparent 28%),rgba(3,5,8,.78);backdrop-filter:blur(12px)}.introCard{width:min(560px,calc(100% - 34px));border:1px solid rgba(255,255,255,.18);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.045));padding:22px;box-shadow:0 24px 90px rgba(0,0,0,.48)}.introCard h2{font-size:clamp(26px,3.4vw,44px);line-height:.95;margin:8px 0}.introTicks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.introTicks span{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.065);border-radius:16px;padding:10px;text-align:center;font-weight:900}.introProgress{height:6px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:16px}.introProgress i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--brand),var(--cyan));animation:introLoad 3s linear forwards}@keyframes introLoad{to{width:100%}}
 .questPanel{display:grid;gap:8px}.questItem{display:grid;grid-template-columns:28px 1fr auto;gap:9px;align-items:center;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.043);border-radius:15px;padding:9px}.questItem.done{border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.075)}.questItem strong{font-size:13px}.questItem span{font-size:12px;color:var(--muted)}.questItem b{font-size:12px;color:#dbeafe}.questDot{width:23px;height:23px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:12px}.questItem.done .questDot{background:rgba(34,197,94,.22)}
 .duoPanel{display:grid;gap:9px}.duoCode{font-size:22px;letter-spacing:.12em;font-weight:1000;border:1px dashed rgba(34,211,238,.38);background:rgba(34,211,238,.07);border-radius:16px;padding:10px;text-align:center}.growthCard{border:1px solid rgba(245,158,11,.34);background:linear-gradient(135deg,rgba(245,158,11,.12),rgba(139,92,246,.06));border-radius:18px;padding:12px}.growthCard b{display:block;font-size:20px}.growthCard span{color:var(--muted);font-size:12px}
 .chatBadgeBig{display:inline-flex;align-items:center;gap:4px;margin-left:6px;border:1px solid rgba(245,158,11,.42);background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(139,92,246,.12));border-radius:999px;padding:3px 7px;font-size:11px;font-weight:1000;color:#fde68a;vertical-align:middle}.msg .chatNameLine{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.msg .emoteInline{max-width:54px!important;max-height:54px!important;margin-top:6px;object-fit:contain;filter:drop-shadow(0 0 14px rgba(139,92,246,.35))}
 .liveEmoteBurst{position:fixed;z-index:500;left:50%;bottom:110px;pointer-events:none;animation:emoteFloat 1.8s ease-out forwards;filter:drop-shadow(0 14px 24px rgba(0,0,0,.35))}.liveEmoteBurst img{width:72px;height:72px;object-fit:contain}.liveEmoteBurst span{font-size:56px}@keyframes emoteFloat{0%{opacity:0;transform:translate(-50%,20px) scale(.8) rotate(-8deg)}18%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)), -180px) scale(1.25) rotate(8deg)}}
 .roomModeToggle{border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);color:white;border-radius:999px;padding:8px 11px;font-weight:950}.roomMiniRail{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.roomMiniRail .reasonChip{white-space:nowrap}.roomActionsRow{display:flex;gap:8px;flex-wrap:wrap}.roomActionsRow button{border:1px solid var(--line);background:rgba(255,255,255,.055);color:white;border-radius:13px;padding:9px 10px;font-weight:900}
 @media(max-width:1160px){.roomGrid{grid-template-columns:1fr}.roomShell{min-height:auto}.roomSide{display:grid;grid-template-columns:1fr 1fr}.roomChat{min-height:360px}.introTicks{grid-template-columns:1fr}}
 @media(max-width:740px){.roomGrid{padding:12px}.roomSide{display:flex}.roomVideo{border-radius:22px;min-height:260px}.roomTitle h1{font-size:42px}.roomOverlayActions .btn{flex:1}.roomChat{min-height:310px}}
 `;
 document.head.appendChild(st);
 try{state.roomMode=localStorage.getItem('oryon_room_mode')==='1'}catch{state.roomMode=false}
 document.body?.classList.toggle('roomMode',!!state.roomMode);
})();

function activeLiveKey(x){const id=liveIdentity(x||{}); return id.platform+':'+id.login}
function roomStatusText(cur){if(!cur)return 'Choisis une ambiance'; const id=liveIdentity(cur); return `${platformLabel(id.platform)} · ${id.viewers} viewers · ${id.game}`}
function toggleRoomMode(){state.roomMode=!state.roomMode; try{localStorage.setItem('oryon_room_mode',state.roomMode?'1':'0')}catch{} document.body.classList.toggle('roomMode',!!state.roomMode); renderZap(); toast(state.roomMode?'Mode Room':'Mode Flow')}
function showIntroFor(x){return !!(state.roomIntro && activeLiveKey(x)===state.roomIntro.key)}
function liveIntroOverlay(x){if(!showIntroFor(x))return ''; const id=liveIdentity(x); const reasons=discoverReasonFor(x); return `<div class="introOverlay"><div class="introCard"><span class="eyebrow"><i class="dot"></i>Entrée douce</span><h2>${esc(id.name)}</h2><p class="muted">${esc(id.title)}</p><div class="introTicks"><span>${esc(reasons[0]||'Signal')}</span><span>${comfortScore(x)}% confort</span><span>${esc(microContextFor(x))}</span></div><div class="introProgress"><i></i></div></div></div>`}
function startLiveIntro(){const x=currentZapItem(); if(!x)return; const id=liveIdentity(x); const token=Date.now(); state.roomIntro={key:activeLiveKey(x),token}; renderZap(); setTimeout(()=>{if(!state.roomIntro||state.roomIntro.token!==token)return; state.roomIntro=null; trackDiscovery(x); if(id.platform==='twitch'){state.discoverPlayer={type:'twitch',login:id.login}; setMiniLive({type:'twitch',login:id.login,title:'Twitch · '+id.login}); renderZap();}else{openOryon(id.login)}},3000)}
function zapOpenCurrent(){startLiveIntro()}

function trackDiscovery(x){
 const id=liveIdentity(x); if(!id.login)return;
 const vp=loadViewerImpact(); const key=activeLiveKey(x);
 let item=(vp.discoveries||[]).find(d=>d.key===key);
 if(!item){
   item={key,platform:id.platform,login:id.login,name:id.name,title:id.title,game:id.game,firstViewers:id.viewers,bestViewers:id.viewers,lastViewers:id.viewers,ts:Date.now()};
   vp.discoveries.unshift(item); vp.discoveries=vp.discoveries.slice(0,50); vp.points=Number(vp.points||0)+5;
 }else{
   item.lastViewers=id.viewers; item.bestViewers=Math.max(Number(item.bestViewers||0),id.viewers); item.seenAgain=Date.now();
 }
 if((vp.discoveries||[]).length>=3&&!vp.badges.includes('Chercheur de pépites'))vp.badges.push('Chercheur de pépites');
 if((vp.discoveries||[]).length>=10&&!vp.badges.includes('Radar humain'))vp.badges.push('Radar humain');
 if(id.viewers<=20&&!vp.badges.includes('Avant la foule'))vp.badges.push('Avant la foule');
 saveViewerImpact(); renderViewerImpact();
}
function growthCardHtml(cur){
 if(!cur)return '<div class="growthCard"><b>Trace</b><span>Découvre un live pour créer une trace.</span></div>';
 const id=liveIdentity(cur); const vp=loadViewerImpact(); const d=(vp.discoveries||[]).find(x=>x.key===activeLiveKey(cur));
 const first=Number(d?.firstViewers??id.viewers??0), now=Number(id.viewers||d?.lastViewers||0), best=Math.max(Number(d?.bestViewers||0),now);
 if(!d)return `<div class="growthCard"><b>À découvrir tôt</b><span>${esc(id.name)} peut devenir une pépite de ton historique.</span></div>`;
 if(best>first)return `<div class="growthCard"><b>+${best-first} depuis toi</b><span>Tu l’avais vu à ${first} viewer${first>1?'s':''}.</span></div>`;
 return `<div class="growthCard"><b>Vu tôt</b><span>Première trace à ${first} viewer${first>1?'s':''}.</span></div>`;
}
function questData(){const vp=loadViewerImpact(); const saved=savedLives(); const supports=vp.firstSupports||[]; return [
 {id:'discover3',icon:'✨',title:'Trouver 3 pépites',now:Math.min((vp.discoveries||[]).length,3),max:3,done:(vp.discoveries||[]).length>=3},
 {id:'save1',icon:'💾',title:'Sauver un live',now:Math.min(saved.length,1),max:1,done:saved.length>=1},
 {id:'support1',icon:'⭐',title:'Premier soutien',now:Math.min(supports.length,1),max:1,done:supports.length>=1},
 {id:'room1',icon:'🌌',title:'Entrer en Room',now:readStore('oryon_room_used',false)?1:0,max:1,done:!!readStore('oryon_room_used',false)}
 ];}
function questPanelHtml(){return `<div class="questPanel">${questData().map(q=>`<div class="questItem ${q.done?'done':''}"><div class="questDot">${q.done?'✓':q.icon}</div><div><strong>${esc(q.title)}</strong><br><span>${q.done?'validé':'quête douce'}</span></div><b>${q.now}/${q.max}</b></div>`).join('')}</div>`}
function newDuoCode(){return Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase()}
function startDuoSession(){const code=newDuoCode(); writeStore('oryon_duo_code',code); writeStore('oryon_duo_queue',(state.zap.items||[]).slice(0,8).map(liveIdentity)); try{navigator.clipboard?.writeText(code)}catch{} toast('Code duo copié'); renderZap()}
function joinDuoPrompt(){const code=prompt('Code duo'); if(!code)return; writeStore('oryon_duo_code',code.trim().toUpperCase()); toast('Session duo prête'); renderZap()}
function duoPanelHtml(){const code=readStore('oryon_duo_code',''); return `<div class="duoPanel"><div class="duoCode">${esc(code||'DUO')}</div><div class="roomActionsRow"><button onclick="startDuoSession()">Créer</button><button onclick="joinDuoPrompt()">Rejoindre</button></div></div>`}

function spawnLiveEmote(emote){
 const node=document.createElement('div'); node.className='liveEmoteBurst'; node.style.setProperty('--dx',(Math.round(Math.random()*120)-60)+'px');
 if(emote?.image_url)node.innerHTML=`<img src="${esc(emote.image_url)}" alt="">`; else node.innerHTML='<span>✨</span>';
 document.body.appendChild(node); setTimeout(()=>node.remove(),1900);
}
function viewerChatBadges(user){const u=(state.session.local?.login||state.session.twitch?.login||'').toLowerCase(); const mine=String(user||'').toLowerCase()===u; const vp=loadViewerImpact(); if(!mine)return ''; const labels=[]; if((vp.firstSupports||[]).length)labels.push('Premier soutien'); if((vp.discoveries||[]).length>=3)labels.push('Découvreur'); if((vp.badges||[]).includes('Avant la foule'))labels.push('Avant la foule'); return labels.slice(0,2).map(x=>`<span class="chatBadgeBig">${esc(x)}</span>`).join('')}
function msgHtml(m){return `<div class="msg"><div class="chatNameLine"><b>${esc(m.user_display||m.user)}</b>${viewerChatBadges(m.user)}<span class="small">${new Date(m.ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span></div><div>${esc(m.text||'')}</div>${m.emote?`<img class="emoteInline" src="${esc(m.emote.image_url)}" title=":${esc(m.emote.code)}:">`:''}${m.gif?`<img src="${esc(m.gif)}">`:''}</div>`}
function sendChat(){
 if(!state.room)return toast('Aucun salon Oryon actif'); if(!state.socket)setupSocket(); if(!state.session.local)return toast('Connecte-toi à Oryon pour écrire dans le tchat natif.');
 const payload={room:state.room,text:$('#chatInput')?.value||'',gif:state.selectedGif,emote:state.selectedEmote?{code:state.selectedEmote.code,image_url:state.selectedEmote.image_url}:null};
 state.socket.emit('native:chat',payload); if(payload.emote)spawnLiveEmote(payload.emote); $('#chatInput')&&($('#chatInput').value=''); state.selectedGif=''; state.selectedEmote=null; $('#gifGrid')?.classList.add('hidden')
}
function ritualButtonsHtml(){return `<div class="ritualRow"><button onclick="saveCurrentLive()">Sauver</button><button onclick="toast('Moment marqué')">Marquer</button><button onclick="spawnLiveEmote();toast('Bonne vibe')">Bonne vibe</button><button onclick="toggleCinema()">Cinéma</button><button onclick="toggleRoomMode()">Room</button></div>`}

function renderRoomChat(cur){
 if(!cur)return `<div class="roomNativeChatHint"><div><b>Chat prêt</b><span>Choisis un live.</span></div></div>`;
 const id=liveIdentity(cur); const parent=location.hostname;
 if(id.platform==='twitch' && spotlightIsPlaying(cur))return `<iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe>`;
 return `<div class="roomNativeChatHint"><div><b>Entrée sans pression</b><span>Regarde, sauve ou passe au suivant.</span><div class="roomActionsRow section"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="spawnLiveEmote();toast('Réaction douce')">Réagir</button></div></div></div>`;
}
function renderRoomShell(cur){
 const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur):[]; const parent=location.hostname; const playing=cur&&spotlightIsPlaying(cur)&&id.platform==='twitch';
 const media=cur?(playing?`<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe>`:(id.img?`<img src="${esc(id.img)}" alt="">`:`<div class="spotlightEmpty">LIVE ${esc(id.platform||'Oryon').toUpperCase()}</div>`)):`<div class="spotlightEmpty">Choisis une ambiance</div>`;
 return `<div class="roomShell" style="--roomBg:${id?.img?`url('${esc(id.img)}')`:'none'}"><div class="roomGrid"><main class="roomMain"><div class="roomTopBar"><span class="eyebrow"><i class="dot"></i>Mode Room</span><div class="row"><button class="roomModeToggle" onclick="toggleRoomMode()">Quitter Room</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div><div class="roomVideo">${media}${cur?liveIntroOverlay(cur):''}<div class="roomOverlayActions"><button class="btn good" onclick="zapOpenCurrent()">${playing?'Regarder':'Entrer'}</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button><button class="btn ghost" onclick="notMyVibe('mood')">Pas mon mood</button></div></div><div class="roomTitle"><div class="roomMiniRail">${reasons.map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><h1>${esc(id?.title||'Trouve ton live.')}</h1><p>${esc(id?`${id.name} · ${roomStatusText(cur)}`:'Une salle immersive, une ambiance claire, peu de texte.')}</p></div></main><aside class="roomSide"><div class="roomCard"><h2>Signal</h2>${cur?signalCardsHtml(cur):'<p>En attente.</p>'}</div><div class="roomCard">${growthCardHtml(cur)}</div><div class="roomCard"><h2>Quêtes de soirée</h2>${questPanelHtml()}</div><div class="roomCard"><h2>Duo viewer</h2>${duoPanelHtml()}</div><div class="roomCard roomChat"><div class="chatHeader"><span>Chat / présence</span><button class="btn ghost" onclick="spawnLiveEmote();toast('Bonne vibe')">✨</button></div>${renderRoomChat(cur)}</div></aside></div></div>`
}
function renderSpotlightPreview(x){
 if(state.roomMode)return renderRoomShell(x);
 if(!x)return `<div class="flowLive fused premium"><div class="zapThumb"></div><div class="flowOverlay fused premium"><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><div class="premiumHeadline"><h2>Choisis une ambiance.</h2><p class="muted">Une scène, un signal, une entrée simple.</p></div><div class="premiumActions"><button class="btn good" onclick="findLive()">Zapper</button><button class="softBtn" onclick="toggleRoomMode()">Room</button></div></div></div>`;
 const id=liveIdentity(x), reasons=discoverReasonFor(x), score=comfortScore(x);
 return `<article class="flowLive fused premium"><div class="zapThumb">${id.img?`<img src="${esc(id.img)}" alt="">`:`<div style="height:100%;display:grid;place-items:center;color:#64748b">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}<span class="zapBadge">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span></div>${liveIntroOverlay(x)}<div class="flowOverlay fused premium"><div class="quietProof"><span>${score}% confort</span><span>${esc(microContextFor(x))}</span><span>${esc(id.game)}</span></div><div class="premiumHeadline"><h2>${esc(id.title)}</h2><p class="muted">${esc(id.name)}</p></div><div class="reasonChips">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="premiumActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="softBtn" onclick="saveCurrentLive()">Sauver</button><button class="softBtn" onclick="toggleRoomMode()">Room</button><button class="softBtn" onclick="notMyVibe('mood')">Pas mon mood</button></div></div></article>`;
}
function renderSpotlightPlayer(x){
 if(state.roomMode)return renderRoomShell(x);
 const id=liveIdentity(x); if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
 const parent=location.hostname;
 return `<div class="spotlightPlay premium"><div class="spotlightTop premium"><div><span class="eyebrow"><i class="dot"></i>Lecture en cours</span><h2>${esc(id.name)}</h2><p>${esc(id.title||'Live Twitch')}</p></div><div class="spotlightBar"><span class="pill">${id.viewers} viewers</span><span class="pill">${esc(id.game)}</span><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Carte</button><button class="btn ghost" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="toggleRoomMode()">Room</button><button class="btn ghost" onclick="toggleCinema()">Cinéma</button></div></div><div class="watchShell twitchWatch spotlightWatch premium"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderSpotlightMeta(cur){
 const score=cur?comfortScore(cur):0; const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur):[];
 return `<aside class="compactSignal"><div class="panel"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Signal</h2><span class="small">${cur?esc(platformLabel(id.platform)):'Prêt'}</span></div><div class="comfortRing" style="--score:${score}%">${cur?score:'—'}</div></div>${cur?`<div class="reasonChips section">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="section">${signalCardsHtml(cur)}</div>`:'<div class="empty section">Choisis une ambiance.</div>'}</div><div class="panel"><h2 style="margin-top:0">Contrôle mood</h2>${moodPadHtml()}</div><div class="panel"><h2 style="margin-top:0">Rituels</h2>${ritualButtonsHtml()}</div><div class="panel">${growthCardHtml(cur)}</div><div class="panel"><h2 style="margin-top:0">Quêtes</h2>${questPanelHtml()}</div><div class="panel"><h2 style="margin-top:0">Duo</h2>${duoPanelHtml()}</div><div class="panel">${viewerCapsuleHtml()}</div></aside>`;
}
function renderZap(){
 const box=$('#zapResult'); if(!box) return;
 const items=state.zap.items||[]; const cur=items[state.zap.index]||null; const id=cur?liveIdentity(cur):null; const bg=id?.img?`url('${esc(id.img)}')`:'none';
 if(state.roomMode){writeStore('oryon_room_used',true); box.innerHTML=`${renderRoomShell(cur)}${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Zapping partagé, sans rupture</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}`; return;}
 box.innerHTML=`<div class="premiumFlowWrap" style="--spotBg:${bg}"><div class="ambientBackplate"></div><div class="flowStage fused premium"><div class="spotlightShell">${renderSpotlightPlayer(cur)}</div>${renderSpotlightMeta(cur)}</div>${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Passe au suivant sans perdre le fil</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}</div>`;
}

/* Oryon UX Declutter v5 — fixes overlapping controls and removes the bazaar effect */
(function injectUxDeclutterStyle(){
 if(document.getElementById('oryonUxDeclutterStyle')) return;
 const st=document.createElement('style');
 st.id='oryonUxDeclutterStyle';
 st.textContent=`
 /* kill the old absolute spotlight header that was covering Twitch chat */
 .spotlightPlay .spotlightTop,.spotlightPlay .spotlightTop.premium,.spotlightTop.cleanTop{position:static!important;left:auto!important;right:auto!important;top:auto!important;z-index:auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:0!important;margin:0 0 12px!important;background:transparent!important}
 .spotlightPlay .spotlightTop h2,.spotlightTop.cleanTop h2{margin:3px 0 0!important;font-size:clamp(22px,2vw,34px)!important;line-height:1!important;letter-spacing:-.04em!important;max-width:900px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .spotlightPlay .spotlightTop p,.spotlightTop.cleanTop p{margin:4px 0 0!important;max-width:850px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .spotlightBar.cleanBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.spotlightBar.cleanBar .btn{padding:9px 12px;border-radius:12px}
 .watchShell.spotlightWatch.cleanWatch{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(330px,380px)!important;gap:14px!important;align-items:stretch!important;background:transparent!important;border:0!important;overflow:visible!important}
 .spotlightWatch.cleanWatch .player,.spotlightWatch.cleanWatch .chatPanel{height:clamp(430px,46vw,680px)!important;min-height:430px!important;border-radius:22px!important;overflow:hidden!important;box-shadow:0 18px 70px rgba(0,0,0,.30)!important}.spotlightWatch.cleanWatch .chatPanel{resize:none!important;max-width:none!important}.spotlightWatch.cleanWatch iframe{display:block;width:100%;height:100%;border:0;background:#000}
 .flowStage.fused.cleanFlow{grid-template-columns:minmax(0,1fr) minmax(292px,330px)!important;gap:16px!important;align-items:start!important}.compactSignal.cleanSide{display:grid!important;gap:12px!important;align-content:start!important}.compactSignal.cleanSide .panel{padding:14px!important;border-radius:20px!important}.sidePanelTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}.sidePanelTitle h2{margin:0;font-size:18px}.sidePanelTitle span{font-size:12px;color:var(--muted)}
 .cleanActionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cleanActionGrid button{border:1px solid var(--line);background:rgba(255,255,255,.055);color:white;border-radius:12px;padding:9px 10px;font-weight:900;text-align:center}.cleanActionGrid button.primary{background:linear-gradient(135deg,var(--brand),#bd46ff);border:0}.cleanActionGrid button:hover{border-color:rgba(139,92,246,.65)}
 .cleanSignalGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cleanSignalGrid .signalMini{min-height:auto;padding:10px;border-radius:14px}.cleanSignalGrid .signalMini b{font-size:16px}.cleanSignalGrid .signalMini span{font-size:11px}.cleanMetaRow{display:flex;gap:6px;flex-wrap:wrap}.cleanMetaRow .reasonChip{font-size:11px;padding:5px 8px}
 .cleanDrawer{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.035);overflow:hidden}.cleanDrawer summary{cursor:pointer;list-style:none;padding:11px 12px;font-weight:950;display:flex;align-items:center;justify-content:space-between}.cleanDrawer summary::-webkit-details-marker{display:none}.cleanDrawer summary:after{content:'+';color:var(--muted)}.cleanDrawer[open] summary:after{content:'–'}.cleanDrawerBody{padding:0 12px 12px}.compactQuest{display:grid;gap:7px}.compactQuest .questItem{grid-template-columns:26px 1fr auto;padding:8px;border-radius:12px}.compactQuest .questItem span{display:none}.compactQuest .questDot{width:24px;height:24px}.compactDuo{display:flex;gap:8px;align-items:center;justify-content:space-between}.compactDuo .duoCode{flex:1;padding:8px 10px;min-height:auto;font-size:13px}
 .viewerMiniCapsule{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.viewerMiniCapsule div{border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:13px;padding:10px;text-align:center}.viewerMiniCapsule span{display:block;color:var(--muted);font-size:11px}.viewerMiniCapsule b{display:block;font-size:18px;margin-top:2px}
 /* Room cleaned: no stacked sidebar wall, no floating buttons over the player */
 .roomShell.cleanRoom{min-height:auto!important;border-radius:28px!important}.roomShell.cleanRoom::before{background:linear-gradient(90deg,rgba(3,5,8,.91),rgba(3,5,8,.58) 56%,rgba(3,5,8,.90)),var(--roomBg,none)!important;background-size:cover!important;background-position:center!important}.roomShell.cleanRoom .roomGrid{grid-template-columns:minmax(0,1fr) minmax(300px,340px)!important;gap:16px!important;padding:16px!important;min-height:auto!important}.roomMainClean{display:grid;gap:12px;min-width:0}.roomTopBar.clean{position:static!important;background:transparent!important;padding:0!important}.roomVideoClean{position:relative;border:1px solid rgba(255,255,255,.14);border-radius:24px;overflow:hidden;background:#030508;aspect-ratio:16/9;min-height:0!important;box-shadow:0 22px 80px rgba(0,0,0,.36)}.roomVideoClean iframe,.roomVideoClean img,.roomVideoClean video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;background:#000}.roomVideoClean .spotlightEmpty{height:100%}.roomActionBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.roomActionBar .btn,.roomActionBar button{padding:9px 12px;border-radius:12px}.roomInfoClean{display:grid;gap:8px}.roomInfoClean h1{font-size:clamp(30px,3.6vw,56px);line-height:.92;letter-spacing:-.06em;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.roomInfoClean p{margin:0;color:#dbeafe}.roomSide.clean{display:grid!important;gap:12px!important;align-content:start!important;max-height:none!important;overflow:visible!important}.roomCard.clean{padding:14px!important;border-radius:20px!important}.roomChatCompact{min-height:310px;overflow:hidden}.roomChatCompact iframe{height:310px!important;width:100%;border:0}.roomNativeChatHint{min-height:240px}.roomMiniRail.clean{display:flex;gap:6px;flex-wrap:wrap}.roomMiniRail.clean .reasonChip{font-size:11px;padding:5px 8px}
 /* Channel page cleaned */
 .channelPage.cleanChannel{max-width:1760px!important;margin:auto}.channelPage.cleanChannel .channelBanner{height:210px!important;border-radius:26px}.channelPage.cleanChannel .channelMeta{margin-top:-42px;margin-bottom:10px}.channelProofStrip{display:flex;align-items:center;gap:8px;overflow:auto;padding:10px 0 4px}.channelProofStrip .channelBadgeBig{min-width:120px;max-width:170px;padding:10px;border-radius:16px}.channelProofStrip .channelBadgeBig strong{font-size:20px}.channelProofStrip .supportChip{white-space:nowrap}.channelLiveFocus{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(320px,380px)!important;gap:14px!important;align-items:start!important;margin-top:16px}.channelLiveFocus .oryonMainPlayer{aspect-ratio:16/9!important;height:auto!important;min-height:0!important;border-radius:24px!important}.channelLiveFocus .nativeFixedChat{height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:auto!important;border-radius:22px!important;resize:none!important}.channelLiveFocus .chatLog{height:360px!important;min-height:360px!important}.channelInfoBar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 10px;padding:12px 14px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.035)}.channelInfoBar h2{margin:0;font-size:20px}.channelInfoBar .reasonChips{margin:0}.channelChatCompact .chatAssist{grid-template-columns:repeat(3,1fr)!important}.channelChatCompact .chatForm{grid-template-columns:minmax(0,1fr) auto auto!important}.channelPage.cleanChannel .tabs{margin:14px 0 10px}.channelPage.cleanChannel #channelTab{border-radius:20px}
 @media(max-width:1200px){.flowStage.fused.cleanFlow,.watchShell.spotlightWatch.cleanWatch,.roomShell.cleanRoom .roomGrid,.channelLiveFocus{grid-template-columns:1fr!important}.spotlightWatch.cleanWatch .player,.spotlightWatch.cleanWatch .chatPanel{height:420px!important;min-height:420px!important}.roomSide.clean{grid-template-columns:1fr 1fr}.roomChatCompact{grid-column:1/-1}.channelLiveFocus .chatLog{height:320px!important;min-height:320px!important}}
 @media(max-width:720px){.spotlightTop.cleanTop{align-items:flex-start!important}.spotlightBar.cleanBar{justify-content:flex-start}.cleanActionGrid,.cleanSignalGrid,.roomSide.clean{grid-template-columns:1fr}.channelPage.cleanChannel .channelMeta{grid-template-columns:84px 1fr}.channelPage.cleanChannel .avatar{width:84px;height:84px}.channelProofStrip .channelBadgeBig{min-width:112px}.channelChatCompact .chatAssist,.channelChatCompact .chatForm{grid-template-columns:1fr!important}}
 `;
 document.head.appendChild(st);
})();

function cleanQuestPanelHtml(){return `<div class="compactQuest">${questData().map(q=>`<div class="questItem ${q.done?'done':''}"><div class="questDot">${q.done?'✓':q.icon}</div><div><strong>${esc(q.title)}</strong></div><b>${q.now}/${q.max}</b></div>`).join('')}</div>`}
function cleanViewerMiniHtml(){const vp=loadViewerImpact(); return `<div class="viewerMiniCapsule"><div><span>Aura</span><b>${Number(vp.points||0)}</b></div><div><span>Pépites</span><b>${(vp.discoveries||[]).length}</b></div><div><span>Sauvées</span><b>${savedLives().length}</b></div></div>`}
function cleanSignalGridHtml(cur){if(!cur)return '<div class="empty">Choisis une ambiance.</div>'; const id=liveIdentity(cur), score=comfortScore(cur), small=id.viewers<=20?'Très petite':id.viewers<=50?'Petite':'Moyenne'; return `<div class="cleanSignalGrid"><div class="signalMini"><span>Confort</span><b>${score}%</b></div><div class="signalMini"><span>Taille</span><b>${small}</b></div><div class="signalMini"><span>Source</span><b>${esc(platformLabel(id.platform))}</b></div><div class="signalMini"><span>Entrée</span><b>Facile</b></div></div>`}
function cleanDuoHtml(){const code=readStore('oryon_duo_code',''); return `<div class="compactDuo"><div class="duoCode">${esc(code||'DUO')}</div><button class="btn secondary" onclick="startDuoSession()">Créer</button></div>`}

function renderSpotlightPlayer(x){
 if(state.roomMode)return renderRoomShell(x);
 const id=x?liveIdentity(x):null;
 if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
 const parent=location.hostname;
 return `<div class="spotlightPlay premium cleanPlay"><div class="spotlightTop cleanTop"><div><span class="eyebrow"><i class="dot"></i>Lecture</span><h2>${esc(id.name)}</h2><p class="muted">${esc(id.title||'Live Twitch')}</p></div><div class="spotlightBar cleanBar"><span class="pill">${id.viewers} viewers</span><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Carte</button><button class="btn ghost" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="toggleRoomMode()">Room</button><button class="btn ghost" onclick="toggleCinema()">Cinéma</button></div></div><div class="watchShell twitchWatch spotlightWatch premium cleanWatch"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}

function renderSpotlightMeta(cur){
 const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur).slice(0,3):[];
 return `<aside class="compactSignal cleanSide"><div class="panel"><div class="sidePanelTitle"><h2>Signal</h2><span>${cur?esc(platformLabel(id.platform)):'Prêt'}</span></div>${cur?`<div class="cleanMetaRow">${reasons.map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="section">${cleanSignalGridHtml(cur)}</div>`:'<div class="empty">Zappe pour recevoir un live.</div>'}</div><div class="panel"><div class="sidePanelTitle"><h2>Actions</h2><span>rapide</span></div><div class="cleanActionGrid"><button class="primary" onclick="zapOpenCurrent()">Regarder</button><button onclick="zapNext()">Suivant</button><button onclick="saveCurrentLive()">Sauver</button><button onclick="notMyVibe('mood')">Pas mon mood</button><button onclick="markZapFeedback('quiet')">Plus calme</button><button onclick="toggleRoomMode()">Room</button></div></div><div class="panel"><div class="sidePanelTitle"><h2>Trace</h2><span>viewer</span></div>${cleanViewerMiniHtml()}</div><details class="cleanDrawer"><summary>Plus</summary><div class="cleanDrawerBody"><div class="section"><b>Quêtes</b>${cleanQuestPanelHtml()}</div><div class="section"><b>Duo</b>${cleanDuoHtml()}</div>${growthCardHtml(cur)}</div></details></aside>`;
}

function renderRoomShell(cur){
 const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur).slice(0,3):[]; const parent=location.hostname; const playing=cur&&spotlightIsPlaying(cur)&&id.platform==='twitch';
 const media=cur?(playing?`<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe>`:(id.img?`<img src="${esc(id.img)}" alt="">`:`<div class="spotlightEmpty">LIVE ${esc(id.platform||'Oryon').toUpperCase()}</div>`)):`<div class="spotlightEmpty">Choisis une ambiance</div>`;
 return `<div class="roomShell cleanRoom" style="--roomBg:${id?.img?`url('${esc(id.img)}')`:'none'}"><div class="roomGrid"><main class="roomMainClean"><div class="roomTopBar clean"><span class="eyebrow"><i class="dot"></i>Room</span><div class="roomActionBar"><button class="btn secondary" onclick="toggleRoomMode()">Quitter</button><button class="btn ghost" onclick="zapNext()">Suivant</button></div></div><div class="roomVideoClean">${media}${cur?liveIntroOverlay(cur):''}</div><div class="roomActionBar"><button class="btn good" onclick="zapOpenCurrent()">${playing?'Regarder':'Entrer'}</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button><button class="btn ghost" onclick="notMyVibe('mood')">Pas mon mood</button><button class="btn ghost" onclick="spawnLiveEmote();toast('Bonne vibe')">Bonne vibe</button></div><div class="roomInfoClean"><div class="roomMiniRail clean">${reasons.map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><h1>${esc(id?.title||'Trouve ton live.')}</h1><p>${esc(id?`${id.name} · ${roomStatusText(cur)}`:'Une ambiance claire, pas un tableau de bord.')}</p></div></main><aside class="roomSide clean"><div class="roomCard clean"><div class="sidePanelTitle"><h2>Signal</h2><span>${cur?comfortScore(cur)+'%':'—'}</span></div>${cleanSignalGridHtml(cur)}</div><div class="roomCard clean"><div class="sidePanelTitle"><h2>Actions</h2><span>viewer</span></div><div class="cleanActionGrid"><button class="primary" onclick="zapOpenCurrent()">Entrer</button><button onclick="zapNext()">Suivant</button><button onclick="saveCurrentLive()">Sauver</button><button onclick="toggleCinema()">Cinéma</button></div></div><div class="roomCard clean roomChatCompact"><div class="chatHeader"><span>Chat</span><button class="btn ghost" onclick="spawnLiveEmote();toast('Bonne vibe')">✨</button></div>${renderRoomChat(cur)}</div><details class="cleanDrawer"><summary>Progression</summary><div class="cleanDrawerBody">${growthCardHtml(cur)}<div class="section">${cleanQuestPanelHtml()}</div><div class="section">${cleanDuoHtml()}</div></div></details></aside></div></div>`;
}

function renderZap(){
 const box=$('#zapResult'); if(!box) return;
 const items=state.zap.items||[]; const cur=items[state.zap.index]||null; const id=cur?liveIdentity(cur):null; const bg=id?.img?`url('${esc(id.img)}')`:'none';
 if(state.roomMode){writeStore('oryon_room_used',true); box.innerHTML=`${renderRoomShell(cur)}${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Suivant sans rupture</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}`; return;}
 box.innerHTML=`<div class="premiumFlowWrap" style="--spotBg:${bg}"><div class="ambientBackplate"></div><div class="flowStage fused premium cleanFlow"><div class="spotlightShell">${renderSpotlightPlayer(cur)}</div>${renderSpotlightMeta(cur)}</div>${items.length>1?`<div class="section panel"><div class="softQueueTitle"><h2 style="margin:0">File douce</h2><span class="small">Passe au suivant sans perdre le fil</span></div><div class="flowQueue">${queuePreview(items)}</div></div>`:''}</div>`;
}

async function renderChannel(){
 const viewer=state.session.local;
 const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
 if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
 state.lastChannelLogin=targetLogin;
 const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
 const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
 const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
 state.channelSupport=support;
 const isOwner=!!viewer && viewer.login===targetLogin;
 const lives=await api('/api/native/lives');
 const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
 const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
 state.channelProfile=p; state.channelOwner=isOwner;
 const offlineImg=p.offline_image_url||p.banner_url||'';
 const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
 const supporters=(support.first_supporters||[]).slice(0,8);
 const channelBadges=channelBadgesFor(p,support,isOwner).slice(0,5);
 const ownerActions=isOwner?`<div class="row"><button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Profil</button></div>`:`<div class="row"><button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre</button></div>`;
 const liveMode=p.oryon_local_player_url?'Oryon Live / OBS':(isLive?'Live navigateur':'Hors live');
 const playerHtml=(p.oryon_local_player_url) ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(p.oryon_local_player_url)}"></iframe>` : ((p.peertube_embed_url||p.peertube_watch_url) && !isLive ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(normalizePeerTubeEmbed(p.peertube_embed_url,p.peertube_watch_url))}"></iframe>` : `<video id="localVideo" autoplay muted playsinline class="${isOwner&&state.stream?'':'hidden'}"></video><video id="remoteVideo" autoplay playsinline class="hidden"></video><div id="offlinePanel" class="emptyStatePlayer" style="display:${(isOwner&&state.stream)?'none':'grid'}">${offlineImg?`<img class="offlinePoster" src="${esc(offlineImg)}" alt="">`:''}<div class="offlineOverlay"><div><h2>${isLive?'Connexion au live…':'Hors ligne'}</h2><p class="muted">${isLive?'Connexion au flux en cours.':'Image hors live configurée.'}</p>${isOwner?`<button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button>`:`<button class="btn" onclick="quickGem()">Autre pépite</button>`}</div></div></div>`);
 $('#channel').innerHTML=`<div class="channelPage publicChannel cleanChannel"><div class="pageHead"><div><h1>${isOwner?'Ma chaîne':esc(p.display_name||p.login)}</h1><p>${isOwner?'Page publique.':'Page publique du streamer.'}</p></div>${ownerActions}</div><div class="channelBanner">${p.banner_url?`<img src="${esc(p.banner_url)}" alt="">`:`<div class="bannerFallback"></div>`}</div><div class="channelMeta"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div><h1>${esc(p.display_name||p.login)}</h1><p class="muted">${esc(p.bio||'Chaîne Oryon')}</p><div class="row"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${support?.count?`<span class="pill">${support.count} premiers soutiens</span>`:''}</div></div>${isOwner?`<button id="channelLaunchBtn" class="btn good" onclick="setView('manager')">${isLive?'Gérer':'Préparer'}</button>`:''}</div><div class="channelProofStrip">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}${supporters.length?supporters.map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(''):`<span class="small">Aucun premier soutien.</span>`}</div><div class="watchShell channelWatch channelLiveFocus"><div class="watchMain"><div class="channelInfoBar"><div><h2>${isLive?'En direct':'Salon hors ligne'}</h2><span class="small">${esc(liveMode)}</span></div><div class="reasonChips"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span></div></div><div class="player premiumPlayer oryonMainPlayer">${playerHtml}</div><div class="tabs"><button class="tabBtn active" onclick="chanTab(this,'about')">À propos</button><button class="tabBtn" onclick="chanTab(this,'planning')">Planning</button><button class="tabBtn" onclick="chanTab(this,'clips')">Clips</button></div><div id="channelTab" class="panel"></div></div><aside class="chatPanel nativeFixedChat channelChatCompact" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn" onclick="sendChat()">Envoyer</button></div></aside></div></div>`;
 if(isLive)setMiniLive({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
 chanTab(null,'about'); setupSocket(); state.room=targetLogin; state.socket.emit('native:chat:history',{room:state.room});
 if(isOwner && state.stream){ attachCurrentStream(); }
 else if(isLive){ state.socket.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer(),500); setTimeout(()=>{ if($('#remoteVideo') && !$('#remoteVideo').srcObject) toast('Connexion vidéo en attente.'); },3500); } }
 updateLiveUi(isLive); refreshEmoteShelf(targetLogin);
}


/* Declutter pass — cleaner layouts for Flow, Room and Channel */
(function injectDeclutterPass(){
  if(document.getElementById('oryonDeclutterPass')) return;
  const st=document.createElement('style');
  st.id='oryonDeclutterPass';
  st.textContent=`
  .spotlightPlay.clean{display:grid;gap:12px}
  .spotlightHeadClean{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:2px 2px 0}
  .spotlightHeadClean h2{margin:2px 0 4px;font-size:clamp(26px,2.6vw,40px);letter-spacing:-.04em}
  .spotlightHeadClean p{margin:0;color:var(--muted)}
  .spotlightWatch.clean{grid-template-columns:minmax(0,1fr) 340px!important;gap:14px}
  .spotlightWatch.clean .player,.spotlightWatch.clean .chatPanel{height:clamp(420px,48vw,680px);min-height:420px}
  .spotlightActionDock{display:flex;gap:8px;flex-wrap:wrap;padding:0 2px}
  .spotlightActionDock .btn,.spotlightActionDock .softBtn{min-height:40px}
  .metaAsideClean{display:grid;gap:14px}
  .metaPanelTight{padding:16px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))}
  .metaPanelTight h3{margin:0 0 12px;font-size:20px}
  .quickActionGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .quickActionGrid button,.quickActionGrid .softBtn{width:100%;justify-content:center}
  .stackMini{display:grid;gap:10px}
  .stackMini .summaryItem,.stackMini .questCard,.stackMini .duoBox{margin:0}
  .questPanelCompact{display:grid;gap:10px}
  .questPanelCompact .questCard{padding:12px 14px}
  .roomShell.clean{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:28px;overflow:hidden;background:linear-gradient(180deg,rgba(4,7,12,.92),rgba(6,9,16,.98))}
  .roomShell.clean::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top left, rgba(139,92,246,.18), transparent 38%),radial-gradient(circle at top right, rgba(34,211,238,.12), transparent 32%);pointer-events:none}
  .roomGrid.clean{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;padding:18px;align-items:start;position:relative;z-index:1}
  .roomMainClean{display:grid;gap:14px}
  .roomVideoFrame{border:1px solid rgba(255,255,255,.10);border-radius:24px;overflow:hidden;background:#020408;box-shadow:var(--shadow)}
  .roomVideoFrame iframe,.roomVideoFrame img,.roomVideoFrame .spotlightEmpty{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
  .roomTopClean{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .roomTopClean h1{margin:4px 0 6px;font-size:clamp(28px,3vw,44px);letter-spacing:-.045em}
  .roomTopClean p{margin:0;color:var(--muted)}
  .roomActionBarClean{display:flex;gap:8px;flex-wrap:wrap}
  .roomInfoStrip{display:flex;gap:8px;flex-wrap:wrap}
  .roomSide.clean{display:grid;gap:14px}
  .roomCard.clean{padding:16px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))}
  .roomCard.clean h2{margin:0 0 12px;font-size:20px}
  .roomDualPanel{display:grid;gap:10px}
  .roomChatEmbed{min-height:360px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:#05070d}
  .roomChatEmbed iframe{width:100%;height:360px;border:0}
  .compactSupportStrip{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02))}
  .compactSupportStrip .left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .compactSupportStrip .supporters{display:flex;gap:8px;flex-wrap:wrap}
  .channelWatch.clean{grid-template-columns:minmax(0,1fr) 320px!important;align-items:start}
  .channelSideClean{display:grid;gap:12px}
  .channelSideCard{padding:14px 16px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02))}
  .channelSideCard h3{margin:0 0 10px;font-size:18px}
  .channelHeroCompact{display:grid;gap:12px;margin-top:12px}
  .channelHeroLine{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .channelHeroLine .reasonChip,.channelHeroLine .pill{margin:0}
  .channelAfterGrid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
  .channelAsideStack{display:grid;gap:14px}
  .channelBadgeRail.tight{display:flex;gap:10px;overflow:auto;padding-bottom:4px}
  .channelBadgeRail.tight .channelBadgeBig{min-width:180px}
  .nativeFixedChat.compact .chatHeader{padding:12px 14px}
  .nativeFixedChat.compact .chatAssist{padding:10px 12px;border-top:1px solid var(--line)}
  .nativeFixedChat.compact .chatForm{padding:10px 12px}
  .nativeFixedChat.compact .chatLog{min-height:300px;max-height:480px}
  @media(max-width:1200px){
    .spotlightWatch.clean,.roomGrid.clean,.channelWatch.clean,.channelAfterGrid{grid-template-columns:1fr!important}
    .spotlightWatch.clean .player,.spotlightWatch.clean .chatPanel{height:410px;min-height:410px}
  }
  `;
  document.head.appendChild(st);
})();

function compactQuestPanelHtml(){
  const q=loadQuests();
  return `<div class="questPanelCompact">${q.map(x=>`<div class="questCard ${x.done?'done':''}"><div><b>${esc(x.label)}</b><div class="small">${esc(x.done?'validée':'quête douce')}</div></div><span>${x.progress||0}/${x.goal||1}</span></div>`).join('')}</div>`;
}

function compactSupportBar(supporters, supportCount, channelBadges){
  return `<div class="compactSupportStrip section"><div class="left"><span class="pill">Badges visibles</span>${channelBadges.slice(0,3).map(b=>`<span class="supportChip">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}<span class="pill">${Number(supportCount||0)} premiers soutiens</span></div><div class="supporters">${supporters.length?supporters.slice(0,4).map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(''):'<span class="small">Premiers soutiens à venir.</span>'}</div></div>`;
}

function renderSpotlightPlayer(x){
  if(state.roomMode) return renderRoomShell(x);
  const id=liveIdentity(x);
  if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
  const parent=location.hostname;
  return `<div class="spotlightPlay premium clean"><div class="spotlightHeadClean"><div><span class="eyebrow"><i class="dot"></i>Lecture en cours</span><h2>${esc(id.name)}</h2><p>${esc(id.title||'Live Twitch')}</p></div><div class="row"><span class="pill">${id.viewers} viewers</span><span class="pill">${esc(id.game)}</span></div></div><div class="watchShell twitchWatch spotlightWatch premium clean"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div><div class="spotlightActionDock"><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Carte</button><button class="btn ghost" onclick="zapNext()">Suivant</button><button class="btn ghost" onclick="toggleRoomMode()">Room</button><button class="btn ghost" onclick="toggleCinema()">Cinéma</button><button class="softBtn" onclick="saveCurrentLive()">Sauver</button></div></div>`;
}

function renderSpotlightMeta(cur){
  const score=cur?comfortScore(cur):0; const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur):[];
  return `<aside class="metaAsideClean"><div class="metaPanelTight"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>Signal</h3><div class="small">${cur?esc(platformLabel(id.platform)):'Prêt'}</div></div><div class="comfortRing" style="--score:${score}%">${cur?score:'—'}</div></div>${cur?`<div class="reasonChips section">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="section">${signalCardsHtml(cur)}</div>`:'<div class="empty section">Choisis une ambiance.</div>'}</div><div class="metaPanelTight"><h3>Actions</h3><div class="quickActionGrid"><button class="softBtn" onclick="notMyVibe('mood')">Pas mon mood</button><button class="softBtn" onclick="markZapFeedback('quiet')">Plus calme</button><button class="softBtn" onclick="markZapFeedback('small')">Plus petit</button><button class="softBtn" onclick="findLive()">Surprends-moi</button><button class="softBtn" onclick="saveCurrentLive()">Sauver</button><button class="softBtn" onclick="spawnLiveEmote();toast('Bonne vibe')">Bonne vibe</button></div><div class="section"><div class="small" style="margin-bottom:8px">Duo rapide</div>${duoPanelHtml()}</div></div><div class="metaPanelTight"><h3>Progression</h3><div class="stackMini">${growthCardHtml(cur)}${compactQuestPanelHtml()}</div></div><div class="metaPanelTight">${viewerCapsuleHtml()}</div></aside>`;
}

function renderRoomChatClean(cur){
  if(!cur) return `<div class="roomNativeChatHint"><div><b>Chat prêt</b><span>Choisis un live.</span></div></div>`;
  const id=liveIdentity(cur); const parent=location.hostname;
  if(id.platform==='twitch' && spotlightIsPlaying(cur)) return `<div class="roomChatEmbed"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></div>`;
  return `<div class="roomNativeChatHint"><div><b>Entrée sans pression</b><span>Regarde, sauve ou passe au suivant.</span><div class="roomActionsRow section"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="spawnLiveEmote();toast('Réaction douce')">Réagir</button></div></div></div>`;
}

function renderRoomShell(cur){
 const id=cur?liveIdentity(cur):null; const reasons=cur?discoverReasonFor(cur):[]; const parent=location.hostname; const playing=cur&&spotlightIsPlaying(cur)&&id.platform==='twitch';
 const media=cur?(playing?`<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe>`:(id.img?`<img src="${esc(id.img)}" alt="">`:`<div class="spotlightEmpty">LIVE ${esc(id.platform||'Oryon').toUpperCase()}</div>`)):`<div class="spotlightEmpty">Choisis une ambiance</div>`;
 return `<div class="roomShell clean" style="--roomBg:${id?.img?`url('${esc(id.img)}')`:'none'}"><div class="roomGrid clean"><main class="roomMainClean"><div class="roomTopClean"><div><span class="eyebrow"><i class="dot"></i>Mode Room</span><h1>${esc(id?.title||'Trouve ton live.')}</h1><p>${esc(id?`${id.name} · ${roomStatusText(cur)}`:'Une salle immersive, claire et lisible.')}</p></div><div class="row"><button class="roomModeToggle" onclick="toggleRoomMode()">Quitter Room</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div><div class="roomVideoFrame">${media}${cur?liveIntroOverlay(cur):''}</div><div class="roomInfoStrip">${reasons.slice(0,4).map(r=>`<span class="reasonChip">${esc(r)}</span>`).join('')}</div><div class="roomActionBarClean"><button class="btn good" onclick="zapOpenCurrent()">${playing?'Regarder':'Entrer'}</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button><button class="btn ghost" onclick="notMyVibe('mood')">Pas mon mood</button><button class="btn ghost" onclick="spawnLiveEmote();toast('Bonne vibe')">Bonne vibe</button></div></main><aside class="roomSide clean"><div class="roomCard clean"><h2>Signal</h2>${cur?signalCardsHtml(cur):'<div class="empty">En attente.</div>'}</div><div class="roomCard clean"><h2>Présence</h2>${growthCardHtml(cur)}<div class="section">${compactQuestPanelHtml()}</div></div><div class="roomCard clean roomChat"><div class="chatHeader"><span>Chat / présence</span><button class="btn ghost" onclick="spawnLiveEmote();toast('Bonne vibe')">✨</button></div>${renderRoomChatClean(cur)}</div><div class="roomCard clean">${viewerCapsuleHtml()}<div class="section">${duoPanelHtml()}</div></div></aside></div></div>`;
}

async function renderChannel(){
 const viewer=state.session.local;
 const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
 if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
 state.lastChannelLogin=targetLogin;
 const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
 const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
 const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
 state.channelSupport=support;
 const isOwner=!!viewer && viewer.login===targetLogin;
 const lives=await api('/api/native/lives');
 const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
 const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
 state.channelProfile=p; state.channelOwner=isOwner;
 const offlineImg=p.offline_image_url||p.banner_url||'';
 const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
 const supporters=(support.first_supporters||[]).slice(0,8);
 const channelBadges=channelBadgesFor(p,support,isOwner);
 const ownerActions=isOwner?`<div class="row"><button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button></div>`:`<div class="row"><button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre</button></div>`;
 const liveMode=p.oryon_local_player_url?'Oryon Live / OBS actif':(isLive?'Live navigateur actif':'Hors live');
 const intro=`<div class="channelHeroCompact"><div class="channelHeroLine"><span class="eyebrow"><i class="dot"></i>${isLive?'En direct':'Salon'}</span><span class="pill">${esc(liveMode)}</span><span class="pill">${esc(tags.slice(0,2).join(' · ')||'chill')}</span><span class="pill">${Number(liveRoom?.viewers||0)<=50?92:74}% confort</span></div><div class="channelHeroLine"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span></div></div>`;
 $('#channel').innerHTML=`<div class="channelPage publicChannel"><div class="pageHead"><div><h1>${isOwner?'Ma chaîne':esc(p.display_name||p.login)}</h1><p>${isOwner?'Ta page publique persistante.':'Page publique du streamer.'}</p></div>${ownerActions}</div><div class="channelBanner">${p.banner_url?`<img src="${esc(p.banner_url)}" alt="">`:`<div class="bannerFallback"></div>`}</div><div class="channelMeta"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div><h1>${esc(p.display_name||p.login)}</h1><p class="muted">${esc(p.bio||'Chaîne Oryon')}</p><div class="row"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${support?.count?`<span class="pill">${support.count} premiers soutiens</span>`:''}</div>${intro}</div>${isOwner?`<button id="channelLaunchBtn" class="btn good" onclick="setView('manager')">${isLive?'Gérer le live':'Préparer / lancer'}</button>`:''}</div>${compactSupportBar(supporters,support?.count,channelBadges)}<div class="watchShell channelWatch clean section"><div class="watchMain"><div class="player premiumPlayer oryonMainPlayer">${(p.oryon_local_player_url) ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(p.oryon_local_player_url)}"></iframe>` : ((p.peertube_embed_url||p.peertube_watch_url) && !isLive ? `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(normalizePeerTubeEmbed(p.peertube_embed_url,p.peertube_watch_url))}"></iframe>` : `<video id="localVideo" autoplay muted playsinline class="${isOwner&&state.stream?'':'hidden'}"></video><video id="remoteVideo" autoplay playsinline class="hidden"></video><div id="offlinePanel" class="emptyStatePlayer" style="display:${(isOwner&&state.stream)?'none':'grid'}">${offlineImg?`<img class="offlinePoster" src="${esc(offlineImg)}" alt="">`:''}<div class="offlineOverlay"><div><h2>${isLive?'Connexion au live…':'Chaîne hors ligne'}</h2><p class="muted">${isLive?'Si la vidéo tarde, recharge la page ou relance le live.':'Image hors live ou bannière configurée.'}</p>${isOwner?`<button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button>`:`<button class="btn" onclick="quickGem()">Trouver une autre pépite</button>`}</div></div></div>`)}</div><div class="tabs"><button class="tabBtn active" onclick="chanTab(this,'about')">À propos</button><button class="tabBtn" onclick="chanTab(this,'planning')">Planning</button><button class="tabBtn" onclick="chanTab(this,'clips')">Clips</button></div><div id="channelTab" class="panel"></div></div><aside class="channelSideClean"><div class="chatPanel nativeFixedChat compact" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div><div class="channelSideCard"><h3>Badges</h3><div class="channelBadgeRail tight">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div></aside></div></div>`;
 if(isLive)setMiniLive({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
 chanTab(null,'about'); setupSocket(); state.room=targetLogin; state.socket.emit('native:chat:history',{room:state.room});
 if(isOwner && state.stream){ attachCurrentStream(); }
 else if(isLive){ state.socket.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer(),500); setTimeout(()=>{ if($('#remoteVideo') && !$('#remoteVideo').srcObject) toast('Connexion vidéo en attente. Clique sur Relancer si besoin.'); },3500); } }
 updateLiveUi(isLive);
 refreshEmoteShelf(targetLogin);
}

function chanTab(btn,tab){
 $$('.tabBtn').forEach(b=>b.classList.remove('active')); btn?.classList.add('active');
 const p=state.channelProfile||{}; const isOwner=!!state.channelOwner;
 const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
 const supporters=(state.channelSupport?.first_supporters||[]).slice(0,12);
 if(tab==='about'){
   $('#channelTab').innerHTML=`<div class="summaryList"><div class="summaryItem"><b>Bio</b><p>${esc(p.bio||'Cette chaîne n’a pas encore ajouté de bio.')}</p></div>${tags.length?`<div class="summaryItem"><b>Tags</b><p>${tags.map(t=>`<span class="pill">${esc(t)}</span>`).join(' ')}</p></div>`:''}<div class="summaryItem"><b>Premiers soutiens</b><p>${supporters.length?supporters.map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(' '):'<span class="muted">Aucun pour le moment.</span>'}</p></div></div>${isOwner?`<div class="row section"><button class="btn" onclick="setView('settings')">Modifier À propos</button><button class="btn secondary" onclick="setView('studio')">Emotes / badges</button></div>`:''}`;
   return;
 }
 if(tab==='planning'){
   $('#channelTab').innerHTML='<div id="channelPlanning" class="planningTimeline"><div class="empty">Chargement…</div></div>';
   loadChannelPlanning(p.login); return;
 }
 if(tab==='clips'){
   $('#channelTab').innerHTML=`<div class="empty">Les clips Oryon arrivent ensuite. En attendant, garde ici tes meilleurs moments.</div>`; return;
 }
 $('#channelTab').innerHTML='<div class="empty">Section indisponible.</div>';
}


/* Premium final polish — visual coherence, breathing space, subtle motion */
(function injectPremiumFinalPolish(){
  if(document.getElementById('oryonPremiumFinalPolish')) return;
  const st=document.createElement('style');
  st.id='oryonPremiumFinalPolish';
  st.textContent=`
  :root{
    --oryon-bg-0:#05070d;
    --oryon-bg-1:#080c15;
    --oryon-bg-2:#101624;
    --oryon-card:rgba(13,19,32,.78);
    --oryon-card-soft:rgba(255,255,255,.045);
    --oryon-border:rgba(148,163,184,.18);
    --oryon-border-soft:rgba(148,163,184,.11);
    --oryon-text:#f8fbff;
    --oryon-muted:#93a4bc;
    --oryon-purple:#9b5cff;
    --oryon-cyan:#35d6f4;
    --oryon-green:#2ee59d;
    --oryon-radius-xl:30px;
    --oryon-radius-lg:22px;
    --oryon-radius-md:16px;
    --oryon-shadow-soft:0 20px 70px rgba(0,0,0,.34);
    --oryon-shadow-glow:0 24px 90px rgba(139,92,246,.18);
    --oryon-ease:cubic-bezier(.2,.8,.2,1);
  }
  html{scroll-behavior:smooth}
  body{
    background:
      radial-gradient(circle at 15% 0%,rgba(139,92,246,.16),transparent 34%),
      radial-gradient(circle at 82% 12%,rgba(34,211,238,.09),transparent 30%),
      linear-gradient(180deg,var(--oryon-bg-0),#070a11 44%,#05070d);
  }
  .app{max-width:1500px;padding-left:clamp(16px,2vw,30px);padding-right:clamp(16px,2vw,30px)}
  .section{margin-top:clamp(18px,2vw,30px)}
  .panel,.flowHero.compact,.flowLive.fused,.roomShell.clean,.compactSupportStrip,.channelBanner,.channelMeta,.watchShell{
    border-color:var(--oryon-border)!important;
    box-shadow:var(--oryon-shadow-soft);
  }
  .panel,.metaPanelTight,.roomCard.clean,.channelSideCard,.compactSupportStrip{
    background:
      linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025)),
      rgba(8,12,22,.72)!important;
    backdrop-filter:blur(18px);
  }
  .top{
    background:rgba(5,7,13,.72)!important;
    backdrop-filter:blur(22px);
    border-bottom:1px solid var(--oryon-border-soft);
  }
  .nav button,.creatorMenu button,.btn,.softBtn,.moodTile,.tabBtn,.chatAssist button,.ritualRow button,.reactionDock button{
    transition:transform .22s var(--oryon-ease),border-color .22s var(--oryon-ease),background .22s var(--oryon-ease),box-shadow .22s var(--oryon-ease),opacity .22s var(--oryon-ease);
  }
  .btn:hover,.softBtn:hover,.moodTile:hover,.tabBtn:hover,.chatAssist button:hover,.ritualRow button:hover,.reactionDock button:hover{
    transform:translateY(-1px);
    border-color:rgba(155,92,255,.42)!important;
    box-shadow:0 10px 28px rgba(0,0,0,.18);
  }
  .btn.good,.btn:not(.secondary):not(.ghost):not(.bad){
    background:linear-gradient(135deg,var(--oryon-purple),#b44cff)!important;
    box-shadow:0 12px 32px rgba(155,92,255,.28);
  }
  .btn.secondary,.softBtn{
    background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.04))!important;
    border:1px solid var(--oryon-border)!important;
  }
  input,select,textarea{
    border-color:var(--oryon-border)!important;
    background:rgba(6,10,18,.72)!important;
    transition:border-color .2s var(--oryon-ease),box-shadow .2s var(--oryon-ease),background .2s var(--oryon-ease);
  }
  input:focus,select:focus,textarea:focus{
    outline:none;
    border-color:rgba(53,214,244,.5)!important;
    box-shadow:0 0 0 4px rgba(53,214,244,.10);
  }
  .flowHero.compact{
    position:relative;
    overflow:hidden;
    padding:clamp(20px,2.3vw,34px)!important;
    background:
      radial-gradient(circle at 18% 12%,rgba(155,92,255,.26),transparent 34%),
      radial-gradient(circle at 90% 20%,rgba(53,214,244,.16),transparent 30%),
      linear-gradient(135deg,rgba(15,21,35,.94),rgba(7,11,20,.96))!important;
  }
  .flowHero.compact::after{
    content:"";
    position:absolute;
    inset:auto -80px -160px auto;
    width:320px;
    height:320px;
    background:radial-gradient(circle,rgba(155,92,255,.22),transparent 68%);
    pointer-events:none;
  }
  .flowTitle{
    background:linear-gradient(90deg,#fff,#dce8ff 52%,#9eeeff);
    -webkit-background-clip:text;
    background-clip:text;
    color:transparent!important;
    letter-spacing:-.065em;
  }
  .moodDeck{
    display:grid!important;
    grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;
    gap:12px!important;
  }
  .moodTile{
    min-height:88px!important;
    padding:16px!important;
    border-radius:20px!important;
    background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025))!important;
  }
  .moodTile i{font-size:22px}
  .discoverLine{
    grid-template-columns:minmax(210px,1fr) 170px 150px 120px 110px auto auto!important;
    gap:10px!important;
  }
  .premiumFlowWrap{
    border-radius:32px;
    padding:clamp(12px,1.4vw,20px);
    background:
      radial-gradient(circle at 20% 15%,rgba(155,92,255,.18),transparent 34%),
      linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));
    border:1px solid rgba(255,255,255,.06);
  }
  .flowStage.fused.premium{
    grid-template-columns:minmax(0,1fr) minmax(300px,340px)!important;
    gap:clamp(14px,1.6vw,22px)!important;
  }
  .flowLive.fused.premium{
    border-radius:30px!important;
    overflow:hidden;
    box-shadow:var(--oryon-shadow-glow),var(--oryon-shadow-soft);
  }
  .flowLive.fused.premium .zapThumb{aspect-ratio:16/9}
  .flowLive.fused.premium .zapThumb img{
    transform:scale(1.01);
    filter:saturate(1.05) contrast(1.03);
    transition:transform .7s var(--oryon-ease),filter .7s var(--oryon-ease);
  }
  .flowLive.fused.premium:hover .zapThumb img{transform:scale(1.035);filter:saturate(1.16) contrast(1.06)}
  .flowOverlay.fused.premium{
    padding:clamp(20px,2.4vw,34px)!important;
    background:linear-gradient(180deg,transparent,rgba(3,5,10,.62) 18%,rgba(3,5,10,.9))!important;
  }
  .premiumHeadline h2,.spotlightHeadClean h2,.roomTopClean h1{
    text-wrap:balance;
  }
  .premiumActions,.spotlightActionDock,.roomActionBarClean{
    gap:10px!important;
  }
  .reasonChip,.pill,.supportChip{
    border:1px solid rgba(255,255,255,.10)!important;
    background:rgba(8,12,22,.68)!important;
    backdrop-filter:blur(10px);
  }
  .metaAsideClean,.compactSignal{
    gap:clamp(12px,1.3vw,18px)!important;
  }
  .metaPanelTight{
    padding:clamp(14px,1.4vw,20px)!important;
    border-radius:22px!important;
  }
  .quickActionGrid{gap:10px!important}
  .quickActionGrid .softBtn,.quickActionGrid button{
    min-height:42px;
    border-radius:14px!important;
  }
  .signalCards{
    gap:10px!important;
  }
  .signalCard{
    border-radius:16px!important;
    background:rgba(255,255,255,.045)!important;
  }
  .comfortRing{
    background:
      conic-gradient(var(--oryon-cyan) var(--score),rgba(255,255,255,.09) 0),
      rgba(255,255,255,.04)!important;
    box-shadow:inset 0 0 0 8px rgba(5,7,13,.82),0 0 34px rgba(53,214,244,.12);
  }
  .watchShell.spotlightWatch.clean,.channelWatch.clean{
    gap:16px!important;
  }
  .spotlightWatch.clean .player,.spotlightWatch.clean .chatPanel,.channelWatch.clean .player,.nativeFixedChat.compact{
    border-radius:24px!important;
    overflow:hidden;
  }
  .twitchChat iframe,.premiumPlayer iframe{background:#05070d}
  .chatPanel,.nativeFixedChat.compact{
    background:linear-gradient(180deg,rgba(8,12,22,.95),rgba(5,7,13,.98))!important;
    border-color:var(--oryon-border)!important;
  }
  .chatHeader{
    min-height:48px;
    padding:12px 16px!important;
    border-bottom:1px solid var(--oryon-border-soft)!important;
    background:rgba(255,255,255,.035);
  }
  .chatAssist button{
    border-radius:14px!important;
    min-height:40px;
  }
  .chatForm{
    gap:8px!important;
  }
  .roomShell.clean{
    border-radius:32px!important;
    padding:2px;
  }
  .roomGrid.clean{
    grid-template-columns:minmax(0,1fr) minmax(300px,340px)!important;
    gap:clamp(14px,1.7vw,24px)!important;
    padding:clamp(16px,1.8vw,26px)!important;
  }
  .roomVideoFrame{
    position:relative;
    border-radius:28px!important;
    box-shadow:0 28px 90px rgba(0,0,0,.38);
  }
  .roomVideoFrame::after{
    content:"";
    position:absolute;
    inset:0;
    pointer-events:none;
    border-radius:28px;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -90px 120px rgba(0,0,0,.22);
  }
  .roomCard.clean{
    border-radius:22px!important;
  }
  .roomInfoStrip{margin-top:-2px}
  .roomChatEmbed iframe{height:420px!important}
  .questCard{
    border-radius:16px!important;
    background:rgba(255,255,255,.04)!important;
  }
  .questCard.done{
    background:linear-gradient(135deg,rgba(46,229,157,.18),rgba(255,255,255,.04))!important;
    border-color:rgba(46,229,157,.36)!important;
  }
  .viewerCapsule{
    border-radius:20px!important;
    background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02))!important;
  }
  .channelPage.publicChannel{
    display:grid;
    gap:clamp(14px,1.6vw,22px);
  }
  .channelBanner{
    border-radius:28px!important;
    max-height:240px;
    overflow:hidden;
  }
  .channelBanner img{filter:saturate(1.04) contrast(1.02)}
  .channelMeta{
    border-radius:28px!important;
    padding:clamp(18px,2vw,28px)!important;
    background:
      radial-gradient(circle at 15% 0%,rgba(155,92,255,.16),transparent 34%),
      linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))!important;
  }
  .channelHeroCompact{
    margin-top:14px!important;
  }
  .compactSupportStrip{
    margin-top:0!important;
  }
  .channelWatch.clean{
    margin-top:0!important;
  }
  .channelSideClean{
    gap:14px!important;
  }
  .channelSideCard{
    border-radius:22px!important;
  }
  .channelBadgeBig{
    border-radius:18px!important;
    background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025))!important;
  }
  .tabs{
    margin-top:14px!important;
    gap:8px!important;
  }
  .tabBtn{
    border-radius:999px!important;
    padding:10px 14px!important;
  }
  #channelTab.panel{
    margin-top:12px;
    padding:18px!important;
    border-radius:22px!important;
  }
  .flowQueue{
    gap:12px!important;
  }
  .queueCard,.liveCard,.compactSearchCard{
    border-radius:20px!important;
    transition:transform .24s var(--oryon-ease),box-shadow .24s var(--oryon-ease),border-color .24s var(--oryon-ease);
  }
  .queueCard:hover,.liveCard:hover,.compactSearchCard:hover{
    transform:translateY(-2px);
    border-color:rgba(155,92,255,.36)!important;
    box-shadow:0 16px 46px rgba(0,0,0,.28);
  }
  .view.active,.premiumFlowWrap,.roomShell.clean,.channelPage.publicChannel,.spotlightPlay.clean{
    animation:oryonFadeLift .38s var(--oryon-ease) both;
  }
  @keyframes oryonFadeLift{
    from{opacity:0;transform:translateY(10px)}
    to{opacity:1;transform:translateY(0)}
  }
  @media(prefers-reduced-motion:reduce){
    *{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
  }
  @media(max-width:1200px){
    .flowStage.fused.premium,.roomGrid.clean,.discoverLine{grid-template-columns:1fr!important}
    .roomSide.clean,.metaAsideClean{grid-template-columns:1fr}
    .discoverLine .btn{width:100%}
  }
  @media(max-width:720px){
    .app{padding-left:12px;padding-right:12px}
    .flowHero.compact{border-radius:24px!important}
    .premiumActions,.spotlightActionDock,.roomActionBarClean{display:grid!important;grid-template-columns:1fr 1fr}
    .premiumActions .btn.good,.roomActionBarClean .btn.good{grid-column:1/-1}
    .channelMeta{grid-template-columns:1fr!important}
  }
  `;
  document.head.appendChild(st);
})();

(function installPremiumMicroInteractions(){
  if(window.__oryonPremiumMicroInteractions) return;
  window.__oryonPremiumMicroInteractions=true;
  let lastHash=location.hash;
  window.addEventListener('hashchange',()=>{
    const app=document.querySelector('.app');
    if(!app || lastHash===location.hash) return;
    lastHash=location.hash;
    app.classList.remove('routePulse');
    void app.offsetWidth;
    app.classList.add('routePulse');
    setTimeout(()=>app.classList.remove('routePulse'),420);
  });
})();


/* Pro clean pass — production-grade declutter and reliable Twitch followed list */
(function injectOryonProClean(){
  if(document.getElementById('oryonProCleanStyle')) return;
  const st=document.createElement('style');
  st.id='oryonProCleanStyle';
  st.textContent=`
  .proDiscover{display:grid;gap:22px}
  .proHero{border:1px solid var(--oryon-border,rgba(148,163,184,.18));border-radius:28px;padding:22px;background:linear-gradient(135deg,rgba(17,24,39,.88),rgba(7,11,20,.96));box-shadow:var(--oryon-shadow-soft,0 20px 70px rgba(0,0,0,.32))}
  .proHero h1{margin:0;font-size:clamp(34px,4vw,64px);letter-spacing:-.06em;line-height:.94;background:linear-gradient(90deg,#fff,#dce8ff 58%,#91f0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .proHero p{margin:10px 0 0;color:var(--muted,#93a4bc);max-width:720px}
  .proSearchPanel{border:1px solid var(--oryon-border,rgba(148,163,184,.18));border-radius:24px;background:rgba(10,15,26,.72);padding:16px;display:grid;gap:14px}
  .proMoodRow{display:flex;gap:10px;overflow:auto;padding-bottom:2px;scrollbar-width:none}
  .proMoodRow::-webkit-scrollbar{display:none}
  .proMoodBtn{min-width:132px;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.045);padding:12px 14px;text-align:left;color:#fff;display:grid;gap:4px;cursor:pointer}
  .proMoodBtn i{font-size:22px}
  .proMoodBtn b{font-size:14px}
  .proMoodBtn span{font-size:11px;color:var(--muted,#93a4bc);line-height:1.25}
  .proSearchLine{display:grid;grid-template-columns:minmax(220px,1fr) 150px 135px 95px 84px auto auto;gap:10px;align-items:center}
  .proStage{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
  .proMain{min-width:0}
  .proCard{position:relative;overflow:hidden;border:1px solid rgba(139,92,246,.30);border-radius:30px;background:#05070d;box-shadow:0 28px 80px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.03)}
  .proMedia{position:relative;aspect-ratio:16/9;background:#060913}
  .proMedia img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.06) contrast(1.03)}
  .proMedia::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.24) 44%,rgba(3,5,10,.90))}
  .proEmptyMedia{height:100%;display:grid;place-items:center;color:#64748b;font-weight:900;letter-spacing:.04em}
  .proBadgeTop{position:absolute;top:16px;left:16px;z-index:2;display:flex;gap:8px;flex-wrap:wrap}
  .proPill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.10);background:rgba(5,8,15,.72);backdrop-filter:blur(12px);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:850;color:#f8fbff}
  .proOverlay{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:clamp(20px,2.8vw,34px);display:grid;gap:13px}
  .proOverlay h2{margin:0;font-size:clamp(30px,4vw,58px);line-height:.92;letter-spacing:-.055em;text-wrap:balance}
  .proOverlay .muted{margin:0;color:#cbd5e1}
  .proReasons{display:flex;gap:8px;flex-wrap:wrap}
  .proActions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .proActions .btn{min-height:42px}
  .proPlayer{display:grid;gap:12px}
  .proPlayerHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:2px}
  .proPlayerHead h2{margin:0 0 5px;font-size:clamp(24px,2.5vw,38px);letter-spacing:-.04em}
  .proPlayerGrid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px}
  .proPlayerGrid .player,.proPlayerGrid .chatPanel{height:clamp(430px,48vw,680px);min-height:430px;border-radius:24px;overflow:hidden;border:1px solid var(--oryon-border,rgba(148,163,184,.18))}
  .proPlayerGrid iframe{width:100%;height:100%;border:0;background:#05070d}
  .proSide{border:1px solid var(--oryon-border,rgba(148,163,184,.18));border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.022));padding:12px;position:sticky;top:86px}
  .proTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}
  .proTabBtn{border:1px solid transparent;border-radius:14px;background:rgba(255,255,255,.045);color:#cbd5e1;padding:10px 8px;font-weight:900;cursor:pointer}
  .proTabBtn.active{background:linear-gradient(135deg,rgba(155,92,255,.34),rgba(53,214,244,.16));border-color:rgba(155,92,255,.38);color:#fff}
  .proTabPanel{display:grid;gap:12px}
  .proMetricGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .proMetric{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.045);padding:12px}
  .proMetric span{display:block;font-size:11px;color:var(--muted,#93a4bc);margin-bottom:5px}
  .proMetric b{font-size:16px}
  .proActionGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .proActionGrid .softBtn,.proActionGrid button{min-height:42px;border-radius:14px;width:100%;justify-content:center}
  .proMore{border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
  .proMore summary{cursor:pointer;color:var(--muted,#93a4bc);font-weight:850}
  .proMore .row{margin-top:10px}
  .proQueue{display:flex;gap:12px;overflow:auto;padding:2px 2px 8px;scrollbar-width:none}
  .proQueue::-webkit-scrollbar{display:none}
  .proQueueItem{min-width:220px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.04);padding:10px;display:grid;gap:8px;text-align:left;color:#fff;cursor:pointer}
  .proQueueItem.active{border-color:rgba(46,229,157,.40);background:rgba(46,229,157,.08)}
  .proTwitchPanel{border:1px solid var(--oryon-border,rgba(148,163,184,.18));border-radius:24px;background:rgba(10,15,26,.66);padding:16px;display:grid;gap:14px}
  .proTwitchHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .proTwitchSearch{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px}
  .proFollowGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .proFollowCard{border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.04);padding:11px 12px;display:flex;align-items:center;gap:10px;color:#fff;text-align:left;cursor:pointer;min-width:0}
  .proFollowCard:hover,.proQueueItem:hover,.proMoodBtn:hover{transform:translateY(-1px);border-color:rgba(155,92,255,.38);background:rgba(255,255,255,.065)}
  .proFollowText{min-width:0;display:grid;gap:2px;flex:1}
  .proFollowText b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .proFollowText span{font-size:12px;color:var(--muted,#93a4bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .proViewers{font-weight:900;font-size:13px;color:#cbd5e1}
  .proAvatar{width:38px;height:38px;border-radius:14px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,rgba(155,92,255,.42),rgba(53,214,244,.20));flex:0 0 auto;border:1px solid rgba(255,255,255,.10)}
  .proAvatar img{width:100%;height:100%;object-fit:cover;display:block}
  .proAvatar i{width:100%;height:100%;display:grid;place-items:center;font-style:normal;font-weight:950;color:#fff}
  .proResults{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
  .proNotice{border:1px dashed rgba(255,255,255,.12);border-radius:18px;padding:14px;color:var(--muted,#93a4bc);background:rgba(255,255,255,.025)}
  .proHiddenNoise{display:none!important}
  @media(max-width:1250px){.proStage,.proPlayerGrid{grid-template-columns:1fr}.proSide{position:relative;top:auto}.proSearchLine{grid-template-columns:1fr 1fr}.proSearchLine input{grid-column:1/-1}}
  @media(max-width:720px){.proSearchLine,.proTwitchSearch{grid-template-columns:1fr}.proActions,.proActionGrid{grid-template-columns:1fr}.proActions .btn{width:100%}.proOverlay h2{font-size:34px}.proFollowGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
})();

function proInitial(name){
  const s=String(name||'?').trim();
  return esc((s[0]||'?').toUpperCase());
}
function proAvatarHtml(x){
  const name=x.display_name||x.user_name||x.login||x.user_login||x.channel||'Live';
  const img=x.profile_image_url||x.avatar_url||x.profile_image||'';
  if(img){
    return `<span class="proAvatar"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><i style="display:none">${proInitial(name)}</i></span>`;
  }
  return `<span class="proAvatar"><i>${proInitial(name)}</i></span>`;
}
function proLoginOf(x){ return String(x.login||x.user_login||x.broadcaster_login||x.host_login||x.channel||x.display_name||x.user_name||'').trim(); }
function proNameOf(x){ return x.display_name||x.user_name||x.login||x.user_login||x.host_name||x.host_login||'Live'; }
function proViewersOf(x){ return Number(x.viewer_count||x.viewers||x.viewerCount||0)||0; }
function proSetTab(tab){ state.proTab=tab||'signal'; renderZap(); }
function proCurrent(){ return (state.zap.items||[])[state.zap.index]||null; }
function proTabButton(id,label){
  const active=(state.proTab||'signal')===id?' active':'';
  return `<button class="proTabBtn${active}" onclick="proSetTab('${id}')">${label}</button>`;
}
function proSignalTab(cur){
  if(!cur) return `<div class="proNotice">Lance une proposition pour voir le signal utile.</div>`;
  const id=liveIdentity(cur), score=comfortScore(cur), reasons=discoverReasonFor(cur).slice(0,3);
  return `<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">Signal</h2><span class="small">${esc(platformLabel(id.platform))}</span></div><div class="comfortRing" style="--score:${score}%">${score}</div></div>
  <div class="proReasons">${reasons.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div>
  <div class="proMetricGrid">
    <div class="proMetric"><span>Confort</span><b>${score}%</b></div>
    <div class="proMetric"><span>Taille</span><b>${id.viewers<=20?'Très petite':id.viewers<=80?'Petite':'Active'}</b></div>
    <div class="proMetric"><span>Source</span><b>${esc(platformLabel(id.platform))}</b></div>
    <div class="proMetric"><span>Entrée</span><b>${id.viewers<=50?'Facile':'Normale'}</b></div>
  </div>`;
}
function proActionsTab(cur){
  return `<h2 style="margin:0">Actions</h2>
  <div class="proActionGrid">
    <button class="softBtn" onclick="zapNext()">Suivant</button>
    <button class="softBtn" onclick="saveCurrentLive()">Sauver</button>
    <button class="softBtn" onclick="notMyVibe('mood')">Pas mon mood</button>
    <button class="softBtn" onclick="markZapFeedback('quiet')">Plus calme</button>
    <button class="softBtn" onclick="markZapFeedback('small')">Plus petit</button>
    <button class="softBtn" onclick="findLive()">Surprends-moi</button>
  </div>
  <details class="proMore"><summary>Options avancées</summary><div class="row">
    <button class="btn ghost" onclick="window.toggleRoomMode&&toggleRoomMode()">Room</button>
    <button class="btn ghost" onclick="window.toggleCinema&&toggleCinema()">Cinéma</button>
  </div></details>`;
}
function proProfileTab(){
  const vp=state.viewerProfile||loadViewerProfile?.()||{};
  return `<h2 style="margin:0">Profil</h2>
  <div class="proMetricGrid">
    <div class="proMetric"><span>Aura</span><b>${Number(vp.aura||5)}</b></div>
    <div class="proMetric"><span>Pépites</span><b>${Number(vp.gems||vp.discoveries||0)}</b></div>
    <div class="proMetric"><span>Sauvés</span><b>${(vp.saved||[]).length||0}</b></div>
    <div class="proMetric"><span>Soutiens</span><b>${Number(vp.supports||vp.first_supports||0)}</b></div>
  </div>
  <div class="proNotice">Les traces viewer restent discrètes. L’écran principal reste concentré sur le live.</div>`;
}
function renderSpotlightMeta(cur){
  const tab=state.proTab||'signal';
  const panel=tab==='actions'?proActionsTab(cur):(tab==='profile'?proProfileTab():proSignalTab(cur));
  return `<aside class="proSide"><div class="proTabs">${proTabButton('signal','Signal')}${proTabButton('actions','Actions')}${proTabButton('profile','Profil')}</div><div class="proTabPanel">${panel}</div></aside>`;
}
function renderSpotlightPreview(x){
  if(!x) return `<article class="proCard"><div class="proMedia"><div class="proEmptyMedia">ORYON FLOW</div></div><div class="proOverlay"><h2>Trouve ton live.</h2><p class="muted">Choisis une ambiance, puis lance une proposition.</p><div class="proActions"><button class="btn good" onclick="findLive()">Zapper</button></div></div></article>`;
  const id=liveIdentity(x), reasons=discoverReasonFor(x).slice(0,3), score=comfortScore(x);
  return `<article class="proCard"><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="lazy">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span><span class="proPill">${score}% confort</span></div>
    <div class="proOverlay"><div class="proReasons">${reasons.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button></div>
    </div></article>`;
}
function renderSpotlightPlayer(x){
  const id=x?liveIdentity(x):null;
  if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
  const parent=location.hostname;
  return `<div class="proPlayer"><div class="proPlayerHead"><div><span class="eyebrow"><i class="dot"></i>Lecture</span><h2>${esc(id.name)}</h2><p class="muted">${esc(id.title||'Live Twitch')}</p></div><div class="row"><span class="proPill">${id.viewers} viewers</span><button class="btn secondary" onclick="clearSpotlightPlayer();renderZap()">Carte</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div>
  <div class="proPlayerGrid"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderZap(){
  const box=$('#zapResult'); if(!box) return;
  const items=state.zap.items||[];
  const cur=items[state.zap.index]||null;
  const queue=items.length>1?`<div class="section"><div class="proQueue">${items.slice(0,10).map((x,i)=>{const id=liveIdentity(x);return `<button class="proQueueItem ${i===state.zap.index?'active':''}" onclick="state.zap.index=${i};clearSpotlightPlayer();renderZap()"><b>${esc(id.name)}</b><span class="small">${esc(id.game)} · ${id.viewers} viewers</span></button>`}).join('')}</div></div>`:'';
  box.innerHTML=`<div class="proStage"><main class="proMain">${renderSpotlightPlayer(cur)}${queue}</main>${renderSpotlightMeta(cur)}</div>`;
  renderViewerImpact?.();
}
function ensureSpotlightItem(platform, login, seed={}){
  const items=state.zap.items||[];
  const idx=items.findIndex(x=>{ const id=liveIdentity(x); return id.platform===platform && String(id.login||'').toLowerCase()===String(login||'').toLowerCase(); });
  if(idx>=0){ state.zap.index=idx; return items[idx]; }
  const item={platform, login, user_login:login, display_name:seed.display_name||seed.user_name||login, user_name:seed.user_name||login, title:seed.title||`Live ${platform}`, game_name:seed.game_name||'Live', viewer_count:proViewersOf(seed), thumbnail_url:seed.thumbnail_url||seed.img||''};
  state.zap.items=[item,...items];
  state.zap.index=0;
  return item;
}
function mountTwitchPlayer(login){
  state.discoverPlayer={type:'twitch',login};
  const item=ensureSpotlightItem('twitch', login);
  const id=liveIdentity(item);
  if(id.login!==login){ item.login=login; item.user_login=login; }
  renderZap();
}
function openTwitch(login){
  if(!login) return;
  state.currentTwitch=login;
  const item=ensureSpotlightItem('twitch', login);
  trackDiscovery(item);
  setMiniLive({type:'twitch',login,title:'Twitch · '+login});
  if(state.view==='discover') return mountTwitchPlayer(login);
  setView('discover').then(()=>mountTwitchPlayer(login));
}
async function renderCompactFollowed(){
  const box=$('#followedWrapCompact'); if(!box) return;
  if(!state.session.twitch){
    box.innerHTML=`<div class="proNotice">Connecte Twitch pour afficher tes suivis en direct ici.</div>`;
    return;
  }
  box.innerHTML='<div class="proNotice">Chargement des suivis Twitch…</div>';
  try{
    let r=await api('/api/twitch/followed/live');
    if(!r || !r.success) r=await api('/followed_streams');
    const items=(r.items||r.streams||[]).filter(Boolean);
    if(!items.length){ box.innerHTML='<div class="proNotice">Aucune chaîne suivie en live pour le moment.</div>'; return; }
    box.innerHTML=`<div class="proFollowGrid">${items.map(x=>{
      const login=proLoginOf(x), name=proNameOf(x), viewers=proViewersOf(x);
      return `<button class="proFollowCard" onclick="openTwitch('${esc(login)}')">${proAvatarHtml(x)}<span class="proFollowText"><b>${esc(name)}</b><span>${esc(x.game_name||x.category||x.title||'Live Twitch')}</span></span><span class="proViewers">${viewers}</span></button>`;
    }).join('')}</div>`;
  }catch(e){
    box.innerHTML='<div class="proNotice">Impossible de charger tes suivis Twitch.</div>';
  }
}
function renderCompactTwitchSearchResults(items){
  const box=$('#twResults'); if(!box) return;
  const clean=(items||[]).filter(Boolean);
  if(!clean.length){ box.innerHTML='<div class="proNotice">Aucun résultat Twitch.</div>'; return; }
  box.innerHTML=`<div class="proResults">${clean.map(x=>{
    const login=proLoginOf(x), name=proNameOf(x);
    return `<button class="proFollowCard" onclick="openTwitch('${esc(login)}')">${proAvatarHtml(x)}<span class="proFollowText"><b>${esc(name)}</b><span>${esc(x.title||x.game_name||'Twitch')}</span></span><span class="proViewers">${x.is_live?'Live':'—'}</span></button>`;
  }).join('')}</div>`;
}
async function searchTwitch(){
  const q=$('#twSearch')?.value?.trim(); if(!q) return;
  const box=$('#twResults'); if(box) box.innerHTML='<div class="proNotice">Recherche Twitch…</div>';
  try{
    const r=await api('/api/twitch/channels/search?'+qs({q,live:true}));
    renderCompactTwitchSearchResults(r.items||[]);
  }catch(e){
    if(box) box.innerHTML='<div class="proNotice">Recherche Twitch indisponible.</div>';
  }
}
async function renderDiscover(){
  const el=$('#discover');
  el.innerHTML=`<div class="proDiscover">
    <section class="proHero"><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Un live, pas un bazar.</h1><p>Choisis une ambiance. Oryon propose. Tu regardes, tu sauves ou tu passes au suivant.</p></section>
    <section class="proSearchPanel"><div class="proMoodRow">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="proMoodBtn" onclick="$('#dMood').value='${id}';findLive()"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div>
      <div class="proSearchLine"><input id="dQuery" placeholder="jeu, pseudo, ambiance"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood"><option value="">Ambiance</option>${AMBIANCES.map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="20">≤20</option><option value="50" selected>≤50</option><option value="200">≤200</option><option value="300">≤300</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></section>
    <section id="zapResult"></section>
    <section class="proTwitchPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Accès Twitch</h2><p class="small" style="margin:6px 0 0">Suivis et recherche, sans vignettes cassées ni surcharge.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="followedWrapCompact"></div><div id="twResults"></div></section>
  </div>`;
  state.proTab=state.proTab||'signal';
  renderCompactFollowed();
  renderZap();
  renderMiniPlayer?.();
}

/* Pro watch fix — main player must open large, never only in mini-player */
(function injectProWatchFix(){
  if(document.getElementById('oryonProWatchFix')) return;
  const st=document.createElement('style');
  st.id='oryonProWatchFix';
  st.textContent=`
  .proStage.proStageWatching{display:block!important}
  .proStage.proStageWatching .proMain{width:100%;min-width:0}
  .proStage.proStageWatching .proPlayer{gap:14px}
  .proStage.proStageWatching .proPlayerHead{padding:0 2px 2px}
  .proStage.proStageWatching .proPlayerHead h2{font-size:clamp(32px,3.2vw,52px);line-height:.96}
  .proStage.proStageWatching .proPlayerGrid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(300px,360px)!important;gap:14px;align-items:stretch}
  .proStage.proStageWatching .proPlayerGrid .player,.proStage.proStageWatching .proPlayerGrid .chatPanel{height:clamp(620px,72vh,880px)!important;min-height:620px!important;border-radius:26px}
  .proStage.proStageWatching .proPlayerGrid .player{box-shadow:0 30px 90px rgba(0,0,0,.46),0 0 0 1px rgba(139,92,246,.24)}
  .proStage.proStageWatching .proSide{position:relative!important;top:auto!important;margin-top:16px;padding:10px;border-radius:22px}
  .proStage.proStageWatching .proTabs{display:flex;gap:8px;margin-bottom:10px;overflow:auto;scrollbar-width:none}
  .proStage.proStageWatching .proTabs::-webkit-scrollbar{display:none}
  .proStage.proStageWatching .proTabBtn{min-width:120px}
  .proStage.proStageWatching .proTabPanel{max-width:980px}
  .proStage.proStageWatching + .proTwitchPanel{margin-top:26px}
  .miniPlayer.proSuppressed{display:none!important}
  @media(max-width:980px){
    .proStage.proStageWatching .proPlayerGrid{grid-template-columns:1fr!important}
    .proStage.proStageWatching .proPlayerGrid .player{height:auto!important;min-height:0!important;aspect-ratio:16/9}
    .proStage.proStageWatching .proPlayerGrid .chatPanel{height:420px!important;min-height:420px!important}
  }
  `;
  document.head.appendChild(st);
})();

function spotlightIsPlaying(x){
  const id=x&&liveIdentity(x);
  return !!(x && id && state.discoverPlayer &&
    String(state.discoverPlayer.type||'').toLowerCase()===String(id.platform||'').toLowerCase() &&
    String(state.discoverPlayer.login||'').toLowerCase()===String(id.login||'').toLowerCase());
}
function proSuppressMiniWhileWatching(){
  const host=document.getElementById('oryonMiniPlayer');
  if(host) host.classList.add('proSuppressed');
}
function proOpenTwitchInMain(login, seed){
  if(!login) return;
  login=String(login).trim();
  state.currentTwitch=login;
  const item=ensureSpotlightItem('twitch', login, seed||{});
  item.platform='twitch';
  item.login=login;
  item.user_login=login;
  if(seed){
    item.display_name=seed.display_name||seed.user_name||item.display_name||login;
    item.user_name=seed.user_name||item.user_name||login;
    item.title=seed.title||item.title||`Live Twitch`;
    item.game_name=seed.game_name||item.game_name||'Twitch';
    item.viewer_count=seed.viewer_count??seed.viewers??item.viewer_count??0;
    item.thumbnail_url=seed.thumbnail_url||item.thumbnail_url||'';
  }
  state.discoverPlayer={type:'twitch',login};
  state.roomIntro=null;
  closeMini?.();
  renderZap();
  proSuppressMiniWhileWatching();
  document.getElementById('zapResult')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function zapOpenCurrent(){
  const x=currentZapItem();
  if(!x) return;
  const id=liveIdentity(x);
  trackDiscovery(x);
  if(id.platform==='twitch') return proOpenTwitchInMain(id.login, x);
  closeMini?.();
  openOryon(id.login);
}
function mountTwitchPlayer(login){ proOpenTwitchInMain(login); }
function openTwitch(login){
  if(!login) return;
  if(state.view==='discover') return proOpenTwitchInMain(login);
  setView('discover').then(()=>proOpenTwitchInMain(login));
}
function startLiveIntro(){ zapOpenCurrent(); }
function renderSpotlightPlayer(x){
  const id=x?liveIdentity(x):null;
  if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
  const parent=location.hostname;
  return `<div class="proPlayer"><div class="proPlayerHead"><div><span class="eyebrow"><i class="dot"></i>Lecture grand format</span><h2>${esc(id.name)}</h2><p class="muted">${esc(id.title||'Live Twitch')}</p></div><div class="row"><span class="proPill">${id.viewers} viewers</span><button class="btn secondary" onclick="clearSpotlightPlayer();closeMini?.();renderZap()">Carte</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div>
  <div class="proPlayerGrid"><div class="player premiumPlayer"><iframe allow="autoplay; fullscreen" allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=false"></iframe></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderZap(){
  const box=$('#zapResult'); if(!box) return;
  const items=state.zap.items||[];
  const cur=items[state.zap.index]||null;
  const watching=!!(cur&&spotlightIsPlaying(cur));
  const queue=items.length>1?`<div class="section"><div class="proQueue">${items.slice(0,10).map((x,i)=>{const id=liveIdentity(x);return `<button class="proQueueItem ${i===state.zap.index?'active':''}" onclick="state.zap.index=${i};clearSpotlightPlayer();closeMini?.();renderZap()"><b>${esc(id.name)}</b><span class="small">${esc(id.game)} · ${id.viewers} viewers</span></button>`}).join('')}</div></div>`:'';
  box.innerHTML=`<div class="proStage ${watching?'proStageWatching':''}"><main class="proMain">${renderSpotlightPlayer(cur)}${queue}</main>${renderSpotlightMeta(cur)}</div>`;
  if(watching) proSuppressMiniWhileWatching();
  renderViewerImpact?.();
}

/* Mobile/desktop reliability pass — real preview first, moods trigger search, watch opens main player */
(function injectMobileDesktopReliability(){
  if(document.getElementById('oryonMobileDesktopReliability')) return;
  const st=document.createElement('style');
  st.id='oryonMobileDesktopReliability';
  st.textContent=`
  .proDiscover{width:100%;max-width:1360px;margin:0 auto;padding-bottom:96px}
  .proHero{margin:14px auto 12px;min-height:auto}
  .proHero h1{font-size:clamp(30px,4.4vw,64px);line-height:.92;margin:8px 0}
  .proSearchPanel{margin:0 auto 14px}
  .proMoodRow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
  .proMoodBtn{min-height:96px;touch-action:manipulation}
  .proMoodBtn.active{border-color:rgba(139,92,246,.85);box-shadow:inset 0 0 0 1px rgba(139,92,246,.38),0 18px 46px rgba(139,92,246,.14);background:linear-gradient(135deg,rgba(139,92,246,.18),rgba(34,211,238,.06))}
  .proSearchLine{display:grid;grid-template-columns:minmax(220px,1fr) 150px 150px 80px 70px auto auto;gap:9px;align-items:center}
  .proStage{margin-top:14px}
  .proCard{min-height:clamp(420px,56vw,720px)}
  .proMedia{min-height:100%}
  .proMedia img{width:100%;height:100%;object-fit:cover;display:block}
  .proEmptyMedia{min-height:420px;display:grid;place-items:center;background:radial-gradient(circle at 30% 10%,rgba(139,92,246,.35),transparent 34%),linear-gradient(135deg,#070b16,#111827);font-size:clamp(28px,4vw,54px);font-weight:1000;color:#dfe7ff;letter-spacing:-.05em;text-align:center;padding:24px}
  .proStartCard{position:relative;overflow:hidden;border:1px solid rgba(139,92,246,.34);border-radius:28px;min-height:clamp(360px,46vw,620px);background:radial-gradient(circle at 30% 16%,rgba(139,92,246,.32),transparent 34%),radial-gradient(circle at 80% 10%,rgba(34,211,238,.20),transparent 36%),linear-gradient(135deg,#050813,#101827);display:grid;align-items:end;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.35)}
  .proStartCard h2{font-size:clamp(34px,5vw,72px);line-height:.9;margin:8px 0;letter-spacing:-.06em;max-width:850px}
  .proStartCard p{max-width:680px;color:#cbd5e1}
  .proStartCard .btn{min-height:44px}
  .proFallbackBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;color:#cbd5e1;font-size:12px}
  .proPlayerNotice{position:absolute;left:14px;right:14px;bottom:14px;z-index:3;display:none;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.14);background:rgba(5,8,19,.80);backdrop-filter:blur(14px);border-radius:16px;padding:10px 12px}
  .premiumPlayer{position:relative;overflow:hidden}
  .premiumPlayer:hover .proPlayerNotice,.premiumPlayer:focus-within .proPlayerNotice{display:flex}
  .proStageWatching .proPlayerGrid{width:100%}
  .proStageWatching .premiumPlayer iframe{width:100%;height:100%;border:0;display:block}
  .proTwitchPanel{margin-top:18px}
  @media(max-width:980px){
    main.app,.app{padding-left:14px!important;padding-right:14px!important}
    .proDiscover{max-width:none;padding-bottom:110px}
    .proHero{border-radius:22px;padding:16px;margin-top:10px}
    .proSearchPanel{border-radius:22px;padding:10px}
    .proMoodRow{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:2px;scrollbar-width:none}
    .proMoodRow::-webkit-scrollbar{display:none}
    .proMoodBtn{min-width:104px;min-height:84px;padding:10px;scroll-snap-align:start;border-radius:16px}
    .proMoodBtn i{font-size:20px}.proMoodBtn b{font-size:13px}.proMoodBtn span{font-size:10px;line-height:1.15}
    .proSearchLine{grid-template-columns:1fr 1fr;gap:8px}
    .proSearchLine input{grid-column:1/-1;min-height:42px}
    .proSearchLine .btn{min-height:44px}
    .proCard,.proStartCard{border-radius:22px;min-height:420px}
    .proOverlay{padding:16px}.proOverlay h2{font-size:28px;line-height:.98}
    .proActions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.proActions .btn{padding:10px 8px;min-height:42px}
    .proBadgeTop{left:10px;right:10px;top:10px;gap:6px}.proPill{font-size:10px;padding:6px 8px}
    .proStage{display:block!important;margin-top:12px}.proMain{width:100%}.proSide{margin-top:12px}
    .proTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.proTabBtn{min-width:0;font-size:12px;padding:10px 8px}
    .proStageWatching .proPlayerHead{display:grid;gap:8px}.proStageWatching .proPlayerHead h2{font-size:28px}
    .proStageWatching .proPlayerGrid{grid-template-columns:1fr!important;gap:10px}
    .proStageWatching .proPlayerGrid .player{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:16/9;border-radius:18px!important}
    .proStageWatching .proPlayerGrid .chatPanel{height:360px!important;min-height:360px!important;border-radius:18px!important}
    .proQueue{display:flex;overflow-x:auto;gap:8px;scrollbar-width:none}.proQueue::-webkit-scrollbar{display:none}.proQueueItem{min-width:160px}
    .proTwitchHead{display:grid!important;gap:10px}.proTwitchSearch{grid-template-columns:1fr auto!important}.proFollowGrid,.proResults{grid-template-columns:1fr!important}
  }
  @media(min-width:981px){
    .proStage:not(.proStageWatching){display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}
    .proStageWatching{display:block!important}.proStageWatching .proPlayerGrid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px}
  }
  `;
  document.head.appendChild(st);
})();

function proIsMobile(){ return window.matchMedia && window.matchMedia('(max-width: 980px)').matches; }
function setDiscoverMood(id){
  const mood=$('#dMood'); if(mood) mood.value=id||'';
  $$('.proMoodBtn').forEach(btn=>btn.classList.toggle('active', btn.dataset.mood===id));
  const max=$('#dMax'); if(max && id==='petite-commu') max.value='20';
  state.currentTwitch=null;
  clearSpotlightPlayer?.();
  return findLive();
}
function proOpenExternalTwitch(login){
  if(!login) return;
  window.open(`https://www.twitch.tv/${encodeURIComponent(login)}`,'_blank','noopener,noreferrer');
}
function renderSpotlightPreview(x){
  if(!x) return `<article class="proStartCard"><div><span class="eyebrow"><i class="dot"></i>Prêt à découvrir</span><h2>Choisis une ambiance, ou lance direct.</h2><p>Sur mobile comme sur PC, Oryon affiche d’abord une vraie scène de découverte. Pas de page vide, pas de bouton mort.</p><div class="proActions"><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="setDiscoverMood('discussion')">Discussion</button><button class="btn secondary" onclick="setDiscoverMood('chill')">Chill</button></div></div></article>`;
  const id=liveIdentity(x), reasons=discoverReasonFor(x).slice(0,3), score=comfortScore(x);
  return `<article class="proCard"><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="eager">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span><span class="proPill">${score}% confort</span></div>
    <div class="proOverlay"><div class="proReasons">${reasons.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button></div>
    </div></article>`;
}
function renderSpotlightPlayer(x){
  const id=x?liveIdentity(x):null;
  if(!x || !spotlightIsPlaying(x) || id.platform!=='twitch') return renderSpotlightPreview(x);
  const parent=location.hostname;
  const playerSrc=`https://player.twitch.tv/?channel=${encodeURIComponent(id.login)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=${proIsMobile()?'true':'false'}&playsinline=true`;
  return `<div class="proPlayer"><div class="proPlayerHead"><div><span class="eyebrow"><i class="dot"></i>Lecture grand format</span><h2>${esc(id.name)}</h2><p class="muted">${esc(id.title||'Live Twitch')}</p></div><div class="row"><span class="proPill">${id.viewers} viewers</span><button class="btn secondary" onclick="clearSpotlightPlayer();closeMini?.();renderZap()">Carte</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></div>
  <div class="proPlayerGrid"><div class="player premiumPlayer"><iframe allow="autoplay; fullscreen; picture-in-picture" allowfullscreen playsinline src="${playerSrc}"></iframe><div class="proPlayerNotice"><span>Si Twitch bloque la lecture sur mobile, ouvre le live directement.</span><button class="btn secondary" onclick="proOpenExternalTwitch('${esc(id.login)}')">Ouvrir Twitch</button></div></div><aside class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(id.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout"></iframe></aside></div></div>`;
}
function renderZap(){
  const box=$('#zapResult'); if(!box) return;
  const items=state.zap.items||[];
  const cur=items[state.zap.index]||null;
  const watching=!!(cur&&spotlightIsPlaying(cur));
  const queue=items.length>1?`<div class="section"><div class="proQueue">${items.slice(0,10).map((x,i)=>{const id=liveIdentity(x);return `<button class="proQueueItem ${i===state.zap.index?'active':''}" onclick="state.zap.index=${i};clearSpotlightPlayer();closeMini?.();renderZap()"><b>${esc(id.name)}</b><span class="small">${esc(id.game)} · ${id.viewers} viewers</span></button>`}).join('')}</div></div>`:'';
  box.innerHTML=`<div class="proStage ${watching?'proStageWatching':''}"><main class="proMain">${renderSpotlightPlayer(cur)}${queue}</main>${renderSpotlightMeta(cur)}</div>`;
  if(watching) proSuppressMiniWhileWatching?.();
  renderViewerImpact?.();
}
async function renderDiscover(){
  const el=$('#discover');
  el.innerHTML=`<div class="proDiscover">
    <section class="proHero"><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Un live, pas un bazar.</h1><p>Choisis une ambiance. Oryon propose. Tu regardes, tu sauves ou tu passes au suivant.</p></section>
    <section class="proSearchPanel"><div class="proMoodRow">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="proMoodBtn" data-mood="${esc(id)}" onclick="setDiscoverMood('${esc(id)}')"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div>
      <div class="proSearchLine"><input id="dQuery" placeholder="jeu, pseudo, ambiance" onkeydown="if(event.key==='Enter')findLive()"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood" onchange="setDiscoverMood(this.value)"><option value="">Ambiance</option>${AMBIANCES.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="20">≤20</option><option value="50" selected>≤50</option><option value="200">≤200</option><option value="300">≤300</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="zapNext()">Suivant</button></div></section>
    <section id="zapResult"></section>
    <section class="proTwitchPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Accès Twitch</h2><p class="small" style="margin:6px 0 0">Suivis et recherche, sans vignettes cassées ni surcharge.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch" onkeydown="if(event.key==='Enter')searchTwitch()"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="followedWrapCompact"></div><div id="twResults"></div></section>
  </div>`;
  state.proTab=state.proTab||'signal';
  renderZap();
  renderCompactFollowed();
  closeMini?.();
}


/* Final responsive centering pass — strict no horizontal overflow, true mobile layout */
(function injectOryonFinalResponsiveCentering(){
  if(document.getElementById('oryonFinalResponsiveCentering')) return;
  const st=document.createElement('style');
  st.id='oryonFinalResponsiveCentering';
  st.textContent=`
  html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important;}
  body{position:relative!important;}
  *,*::before,*::after{box-sizing:border-box;}
  iframe,img,video,canvas{max-width:100%;}
  .app,main.app{width:min(100%,1500px)!important;max-width:1500px!important;margin-inline:auto!important;left:auto!important;right:auto!important;transform:none!important;translate:none!important;overflow-x:clip!important;}
  #discover.view.active{width:100%!important;max-width:1360px!important;margin-inline:auto!important;overflow-x:clip!important;}
  .proDiscover{width:100%!important;max-width:1360px!important;margin-inline:auto!important;overflow-x:clip!important;transform:none!important;translate:none!important;}
  .proHero,.proSearchPanel,#zapResult,.proTwitchPanel,.proStage,.proMain,.proSide,.proCard,.proStartCard,.proPlayer,.proPlayerGrid,.proQueue{max-width:100%!important;min-width:0!important;}
  .proHero,.proSearchPanel,.proTwitchPanel{width:100%!important;margin-left:auto!important;margin-right:auto!important;}
  .proStage{width:100%!important;margin-left:auto!important;margin-right:auto!important;}
  .proMain{width:100%!important;}
  .proPlayerGrid{width:100%!important;}
  .proSearchLine>* , .proTwitchSearch>* , .proActionGrid>* , .proMetricGrid>*{min-width:0!important;}
  .proMoodRow{max-width:100%!important;min-width:0!important;}
  .proMoodBtn{min-width:0!important;}
  .proOverlay{max-width:100%!important;overflow:hidden!important;}
  .proOverlay h2,.proPlayerHead h2{max-width:100%;overflow-wrap:anywhere;word-break:normal;}
  .proActions{max-width:100%!important;}
  .proActions .btn{min-width:0!important;white-space:nowrap;}
  .proQueue{max-width:100%!important;overflow-x:auto!important;overscroll-behavior-x:contain;}
  .proQueueItem{min-width:180px;max-width:240px;}
  .mobileNav{max-width:100vw!important;overflow:hidden!important;}
  @media(min-width:981px){
    .app,main.app{padding-left:24px!important;padding-right:24px!important;}
    #discover.view.active,.proDiscover{max-width:1360px!important;}
    .proHero,.proSearchPanel,.proTwitchPanel,#zapResult{max-width:1360px!important;}
    .proStage:not(.proStageWatching){grid-template-columns:minmax(0,1fr) 310px!important;justify-content:center!important;}
    .proStage.proStageWatching{display:block!important;}
    .proStage.proStageWatching .proPlayerHead,.proStage.proStageWatching .proPlayerGrid,.proStage.proStageWatching .proQueue,.proStage.proStageWatching .proSide{max-width:1260px!important;margin-left:auto!important;margin-right:auto!important;}
    .proStage.proStageWatching .proPlayerGrid{grid-template-columns:minmax(0,1fr) 340px!important;}
    .proCard,.proStartCard{margin-left:auto!important;margin-right:auto!important;}
  }
  @media(max-width:980px){
    html,body{min-width:0!important;touch-action:pan-y;}
    .top,.topbar{max-width:100vw!important;overflow:hidden!important;}
    .brand span{font-size:12px;}
    .brandMark{width:28px!important;height:28px!important;border-radius:11px!important;}
    .app,main.app{width:100%!important;max-width:none!important;margin:0!important;padding:10px 14px 112px!important;overflow-x:hidden!important;}
    #discover.view.active,.proDiscover{width:100%!important;max-width:none!important;margin:0!important;padding:0 0 96px!important;overflow:hidden!important;}
    .proHero{margin:8px 0 10px!important;padding:14px!important;border-radius:20px!important;}
    .proHero h1{font-size:clamp(28px,7vw,38px)!important;line-height:.96!important;letter-spacing:-.055em!important;}
    .proHero p{font-size:12px!important;line-height:1.35!important;margin-top:6px!important;}
    .eyebrow{font-size:10px!important;padding:5px 8px!important;}
    .proSearchPanel{margin:0 0 12px!important;padding:10px!important;border-radius:20px!important;}
    .proMoodRow{display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;width:100%!important;padding-bottom:4px!important;scroll-snap-type:x proximity;}
    .proMoodBtn{flex:0 0 clamp(96px,28vw,128px)!important;width:clamp(96px,28vw,128px)!important;min-height:82px!important;padding:9px!important;border-radius:15px!important;scroll-snap-align:start;}
    .proMoodBtn i{font-size:19px!important;}
    .proMoodBtn b{font-size:12px!important;line-height:1.1!important;}
    .proMoodBtn span{font-size:9px!important;line-height:1.15!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .proSearchLine{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;width:100%!important;}
    .proSearchLine input{grid-column:1/-1!important;}
    .proSearchLine input,.proSearchLine select,.proSearchLine button{width:100%!important;min-width:0!important;min-height:42px!important;font-size:13px!important;padding:10px 11px!important;border-radius:12px!important;}
    .proSearchLine button.btn.good{grid-column:1/2!important;}
    .proSearchLine button.btn.secondary{grid-column:2/3!important;}
    #zapResult{width:100%!important;overflow:hidden!important;}
    .proStage{display:block!important;width:100%!important;margin:10px 0 0!important;}
    .proSide{width:100%!important;margin-top:12px!important;padding:10px!important;border-radius:20px!important;}
    .proTabs{width:100%!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;}
    .proTabBtn{min-width:0!important;font-size:12px!important;white-space:nowrap!important;}
    .proCard,.proStartCard{width:100%!important;min-height:0!important;border-radius:22px!important;overflow:hidden!important;}
    .proCard .proMedia{aspect-ratio:16/11!important;min-height:0!important;height:auto!important;}
    .proStartCard{min-height:330px!important;padding:16px!important;}
    .proStartCard h2{font-size:clamp(28px,9vw,40px)!important;line-height:.94!important;}
    .proStartCard p{font-size:13px!important;}
    .proOverlay{padding:14px!important;gap:10px!important;}
    .proOverlay h2{font-size:clamp(24px,7.2vw,32px)!important;line-height:1!important;letter-spacing:-.045em!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .proOverlay .muted{font-size:14px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .proBadgeTop{left:9px!important;right:9px!important;top:9px!important;}
    .proPill{font-size:10px!important;padding:6px 8px!important;max-width:100%;}
    .proReasons{gap:6px!important;overflow:hidden!important;max-height:36px!important;}
    .proActions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;width:100%!important;}
    .proActions .btn{width:100%!important;min-height:42px!important;padding:10px 8px!important;font-size:13px!important;}
    .proActions .btn.good{grid-column:1/-1!important;font-size:15px!important;}
    .proQueue{display:flex!important;width:100%!important;gap:8px!important;overflow-x:auto!important;padding-bottom:6px!important;}
    .proQueueItem{flex:0 0 min(44vw,180px)!important;min-width:0!important;padding:10px!important;border-radius:15px!important;}
    .proQueueItem b{font-size:13px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .proQueueItem span{font-size:11px!important;}
    .proMetricGrid{grid-template-columns:1fr 1fr!important;gap:8px!important;}
    .proMetric{padding:10px!important;border-radius:14px!important;}
    .proStageWatching .proPlayerHead{display:grid!important;gap:8px!important;padding:0!important;}
    .proStageWatching .proPlayerHead h2{font-size:clamp(24px,7vw,34px)!important;line-height:1!important;}
    .proStageWatching .proPlayerHead .row{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;gap:8px!important;}
    .proStageWatching .proPlayerHead .row>*{width:100%!important;justify-content:center!important;text-align:center;}
    .proStageWatching .proPlayerGrid{grid-template-columns:1fr!important;width:100%!important;gap:10px!important;}
    .proStageWatching .proPlayerGrid .player{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:16/9!important;border-radius:18px!important;}
    .proStageWatching .proPlayerGrid .chatPanel{width:100%!important;max-width:none!important;min-width:0!important;height:340px!important;min-height:340px!important;border-radius:18px!important;resize:none!important;}
    .proPlayerNotice{display:flex!important;position:static!important;margin-top:8px!important;background:rgba(10,15,26,.86)!important;}
    .proTwitchPanel{width:100%!important;margin-top:16px!important;padding:12px!important;border-radius:20px!important;}
    .proTwitchHead{display:grid!important;grid-template-columns:1fr!important;}
    .proTwitchSearch{grid-template-columns:1fr auto!important;gap:8px!important;}
    .proTwitchSearch input{min-width:0!important;}
    .proFollowGrid,.proResults{grid-template-columns:1fr!important;}
    .proFollowCard{min-width:0!important;width:100%!important;}
    .mobileNav{height:64px!important;padding:8px 6px calc(8px + env(safe-area-inset-bottom))!important;}
    .mobileNav button{font-size:12px!important;padding:8px 10px!important;}
  }
  @media(max-width:420px){
    .app,main.app{padding-left:10px!important;padding-right:10px!important;}
    .proSearchLine{grid-template-columns:1fr!important;}
    .proSearchLine button.btn.good,.proSearchLine button.btn.secondary{grid-column:auto!important;}
    .proActions{grid-template-columns:1fr!important;}
    .proMetricGrid{grid-template-columns:1fr!important;}
    .proTwitchSearch{grid-template-columns:1fr!important;}
  }
  `;
  document.head.appendChild(st);
})();

(function lockHorizontalScroll(){
  if(window.__oryonLockHorizontalScroll) return;
  window.__oryonLockHorizontalScroll=true;
  const reset=()=>{ if(window.scrollX) window.scrollTo(0, window.scrollY); };
  window.addEventListener('load',reset,{passive:true});
  window.addEventListener('resize',reset,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(reset,80),{passive:true});
  window.addEventListener('scroll',reset,{passive:true});
})();

/* Category mobile density pass — compact by default, user can resize */
(function injectCategoryDensityStyle(){
  if(document.getElementById('oryonCategoryDensityStyle')) return;
  const st=document.createElement('style');
  st.id='oryonCategoryDensityStyle';
  st.textContent=`
  #categories.view.active{width:100%;max-width:1280px;margin-inline:auto;overflow-x:hidden;}
  #categories .catHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px;}
  #categories .catHead h1{margin:0;font-size:clamp(28px,4vw,46px);letter-spacing:-.055em;}
  #categories .catHead p{margin:6px 0 0;color:var(--muted);}
  #categories .catTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
  #categories .catSearch{display:grid;grid-template-columns:minmax(180px,260px) auto;gap:8px;align-items:center;}
  #categories .catSizeControl{display:flex;gap:4px;padding:4px;border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:999px;}
  #categories .catSizeControl button{border:0;background:transparent;color:#dbe4f3;border-radius:999px;padding:8px 10px;font-weight:900;font-size:12px;}
  #categories[data-cat-size="compact"] .catSizeControl button[data-size="compact"],
  #categories[data-cat-size="normal"] .catSizeControl button[data-size="normal"],
  #categories[data-cat-size="large"] .catSizeControl button[data-size="large"]{background:linear-gradient(135deg,rgba(139,92,246,.9),rgba(34,211,238,.45));color:white;}
  #catGrid.catGridResponsive{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(var(--cat-min,140px),1fr))!important;gap:12px!important;align-items:start;}
  #categories[data-cat-size="compact"] #catGrid{--cat-min:122px;}
  #categories[data-cat-size="normal"] #catGrid{--cat-min:165px;}
  #categories[data-cat-size="large"] #catGrid{--cat-min:230px;}
  #categories .categoryCard{width:100%;min-width:0;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.028));box-shadow:none;transition:transform .18s ease,border-color .18s ease,background .18s ease;overflow:hidden;}
  #categories .categoryCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.7);background:linear-gradient(180deg,rgba(139,92,246,.14),rgba(255,255,255,.032));}
  #categories .categoryCard img{width:100%;aspect-ratio:16/10!important;object-fit:cover;display:block;}
  #categories .categoryCard b{display:block;padding:10px 11px 3px!important;font-size:14px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #categories .categoryCard span{display:block;padding:0 11px 11px!important;font-size:12px;line-height:1.25;}
  #categories[data-cat-size="compact"] .categoryCard img{aspect-ratio:16/9!important;}
  #categories[data-cat-size="compact"] .categoryCard b{font-size:13px;padding:8px 9px 2px!important;}
  #categories[data-cat-size="compact"] .categoryCard span{font-size:11px;padding:0 9px 9px!important;}
  #categories[data-cat-size="large"] .categoryCard img{aspect-ratio:3/4!important;}
  #categories[data-cat-size="large"] .categoryCard b{font-size:17px;padding:12px 13px 4px!important;}
  #categories[data-cat-size="large"] .categoryCard span{font-size:13px;padding:0 13px 13px!important;}
  @media(max-width:760px){
    #categories.view.active{max-width:none;margin:0;padding-bottom:92px;}
    #categories .catHead{display:grid;grid-template-columns:1fr;gap:12px;margin:4px 0 12px;}
    #categories .catTools{justify-content:stretch;width:100%;}
    #categories .catSearch{grid-template-columns:1fr auto;width:100%;}
    #categories .catSearch input{min-width:0;width:100%;height:42px;font-size:14px;}
    #categories .catSearch .btn{height:42px;padding:0 12px;}
    #categories .catSizeControl{width:100%;display:grid;grid-template-columns:repeat(3,1fr);border-radius:16px;}
    #categories .catSizeControl button{padding:10px 6px;border-radius:12px;}
    #catGrid.catGridResponsive{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:12px!important;}
    #categories[data-cat-size="large"] #catGrid.catGridResponsive{grid-template-columns:1fr!important;}
    #categories[data-cat-size="normal"] #catGrid.catGridResponsive{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
    #categories .categoryCard{border-radius:16px;}
    #categories .categoryCard img{aspect-ratio:16/9!important;}
    #categories .categoryCard b{font-size:13px!important;padding:8px 9px 2px!important;}
    #categories .categoryCard span{font-size:11px!important;padding:0 9px 9px!important;}
    #categories[data-cat-size="compact"] .categoryCard img{aspect-ratio:16/8!important;}
    #categories[data-cat-size="compact"] .categoryCard b{font-size:12px!important;}
    #categories[data-cat-size="compact"] .categoryCard span{display:none!important;}
    #categories[data-cat-size="large"] .categoryCard img{aspect-ratio:16/9!important;}
    #categories[data-cat-size="large"] .categoryCard b{font-size:18px!important;padding:12px 14px 4px!important;}
    #categories[data-cat-size="large"] .categoryCard span{display:block!important;font-size:13px!important;padding:0 14px 14px!important;}
  }
  @media(max-width:380px){
    #catGrid.catGridResponsive{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;}
    #categories[data-cat-size="normal"] #catGrid.catGridResponsive{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
    #categories[data-cat-size="large"] #catGrid.catGridResponsive{grid-template-columns:1fr!important;}
  }
  `;
  document.head.appendChild(st);
})();

function getCategorySize(){
  const saved=localStorage.getItem('oryon_category_size');
  return ['compact','normal','large'].includes(saved)?saved:'compact';
}
function setCategorySize(size){
  if(!['compact','normal','large'].includes(size)) size='compact';
  localStorage.setItem('oryon_category_size',size);
  const el=document.getElementById('categories');
  if(el) el.dataset.catSize=size;
  document.querySelectorAll('#categories .catSizeControl button').forEach(b=>b.classList.toggle('active',b.dataset.size===size));
}
function catSizeControls(){
  const cur=getCategorySize();
  return `<div class="catSizeControl" role="group" aria-label="Taille des vignettes"><button type="button" data-size="compact" onclick="setCategorySize('compact')" ${cur==='compact'?'class="active"':''}>Compact</button><button type="button" data-size="normal" onclick="setCategorySize('normal')" ${cur==='normal'?'class="active"':''}>Normal</button><button type="button" data-size="large" onclick="setCategorySize('large')" ${cur==='large'?'class="active"':''}>Grand</button></div>`;
}
function catCard(c){
  const img=c.box_art_url||c.image_url||'';
  return `<button class="categoryCard" onclick="pickCat('${esc(c.name)}')">${img?`<img src="${esc(img)}" alt="">`:`<div style="aspect-ratio:16/9;display:grid;place-items:center;background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(34,211,238,.12));color:#cbd5e1">${esc((c.name||'?').slice(0,1))}</div>`}<b>${esc(c.name)}</b><span class="small">Petit live au hasard</span></button>`;
}
async function renderCategories(){
  const el=document.getElementById('categories');
  const size=getCategorySize();
  el.dataset.catSize=size;
  el.innerHTML=`<div class="catHead"><div><span class="eyebrow"><i class="dot"></i>Catégories</span><h1>Choisis une ambiance.</h1><p>Vignettes réglables : compact sur mobile, grand si tu veux explorer visuellement.</p></div><div class="catTools">${catSizeControls()}<div class="catSearch"><input id="catSearch" placeholder="Rechercher"><button class="btn secondary" onclick="searchCats()">OK</button></div></div></div><div id="catPick" class="section"></div><div id="catGrid" class="catGridResponsive section"><div class="empty">Chargement…</div></div><div class="row section"><button class="btn secondary" onclick="loadMoreCats()">Charger plus</button></div>`;
  const input=document.getElementById('catSearch');
  if(input) input.addEventListener('keydown',e=>{if(e.key==='Enter') searchCats();});
  state.catsCursor=null;
  await loadMoreCats(true);
}


/* Discover Tinder pass — bigger mobile controls, real mood launch, swipe right/left */
(function injectDiscoverTinderPass(){
  if(document.getElementById('oryonDiscoverTinderPass')) return;
  const st=document.createElement('style');
  st.id='oryonDiscoverTinderPass';
  st.textContent=`
  .proSearchLine .btn,.proActions .btn{font-weight:1000;letter-spacing:-.01em}
  .proActions .btn{min-height:52px;padding:0 22px;font-size:15px;border-radius:16px}
  .proActions .btn.good{font-size:16px;box-shadow:0 18px 52px rgba(168,85,247,.36)}
  .proMoodBtn{min-height:112px;min-width:164px;padding:16px 18px;border-radius:22px;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
  .proMoodBtn i{font-size:28px}.proMoodBtn b{font-size:16px;line-height:1.1}.proMoodBtn span{font-size:12px;line-height:1.25}
  .proMoodBtn.active{border-color:rgba(168,85,247,.95)!important;box-shadow:0 0 0 1px rgba(168,85,247,.5),0 20px 60px rgba(168,85,247,.20)!important;background:linear-gradient(135deg,rgba(139,92,246,.24),rgba(34,211,238,.08))!important}
  .proCard[data-swipe-card="1"]{touch-action:pan-y;will-change:transform;transition:transform .18s ease,opacity .18s ease,border-color .18s ease;cursor:grab}
  .proCard[data-swipe-card="1"]:active{cursor:grabbing}
  .swipeStamp{position:absolute;top:24px;z-index:5;padding:10px 16px;border-radius:999px;border:2px solid currentColor;background:rgba(3,6,12,.58);backdrop-filter:blur(14px);font-size:20px;font-weight:1000;letter-spacing:.02em;text-transform:uppercase;opacity:0;transform:scale(.92);transition:opacity .12s ease,transform .12s ease;pointer-events:none}
  .swipeStamp.like{right:22px;color:#34d399}.swipeStamp.nope{left:22px;color:#fb7185}
  .proCard.swipe-like .swipeStamp.like,.proCard.swipe-nope .swipeStamp.nope{opacity:1;transform:scale(1) rotate(var(--r,0deg))}
  .swipeHint{display:none;color:#cbd5e1;font-size:12px;font-weight:800;margin-top:2px}
  @media(max-width:760px){
    .proHero h1{font-size:clamp(28px,8.2vw,42px)!important}
    .proHero p{font-size:13px!important;line-height:1.35!important}
    .proMoodRow{gap:10px!important;scroll-padding:16px!important}
    .proMoodBtn{flex:0 0 clamp(136px,39vw,176px)!important;width:clamp(136px,39vw,176px)!important;min-width:clamp(136px,39vw,176px)!important;min-height:112px!important;padding:14px!important;border-radius:20px!important}
    .proMoodBtn i{font-size:27px!important;margin-bottom:3px!important}.proMoodBtn b{font-size:15px!important}.proMoodBtn span{font-size:11px!important;-webkit-line-clamp:2!important}
    .proSearchLine{gap:10px!important}.proSearchLine input,.proSearchLine select{min-height:48px!important;font-size:14px!important;border-radius:14px!important}
    .proSearchLine .btn{min-height:52px!important;font-size:15px!important;border-radius:15px!important}
    .proSearchLine .btn.good{box-shadow:0 18px 46px rgba(168,85,247,.35)!important}
    .proCard .proOverlay h2{font-size:clamp(24px,7.4vw,36px)!important;line-height:.98!important;max-height:2.05em;overflow:hidden}
    .proCard .proOverlay p{font-size:16px!important}.proPill{font-size:12px!important;padding:8px 11px!important}
    .proActions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;width:100%!important}.proActions .btn{min-height:56px!important;font-size:15px!important;border-radius:17px!important}.proActions .btn.good{grid-column:1/-1!important;font-size:17px!important}
    .swipeHint{display:block}.swipeStamp{font-size:17px;top:18px;padding:9px 14px}.swipeStamp.like{right:16px}.swipeStamp.nope{left:16px}
  }
  @media(min-width:761px){
    .proSearchLine .btn{min-height:46px}.proActions .btn:hover{transform:translateY(-1px)}
  }
  `;
  document.head.appendChild(st);
})();

function setDiscoverMood(id){
  const mood=$('#dMood');
  const normalized=id||'';
  if(mood) mood.value=normalized;
  $$('.proMoodBtn').forEach(btn=>btn.classList.toggle('active', btn.dataset.mood===normalized));
  const max=$('#dMax');
  if(max && normalized==='petite-commu') max.value='20';
  const zap=$('#zapResult');
  if(zap) zap.innerHTML='<div class="empty">Recherche dans cette ambiance…</div>';
  state.currentTwitch=null;
  clearSpotlightPlayer?.();
  closeMini?.();
  requestAnimationFrame(()=>document.getElementById('zapResult')?.scrollIntoView({block:'start',behavior:'smooth'}));
  return findLive();
}

function renderSpotlightPreview(x){
  if(!x) return `<article class="proStartCard"><div><span class="eyebrow"><i class="dot"></i>Prêt à découvrir</span><h2>Choisis une ambiance, Oryon lance vraiment la recherche.</h2><p>Sur mobile : swipe à droite pour aimer, à gauche pour passer.</p><div class="proActions"><button class="btn good" onclick="findLive()">Zapper</button><button class="btn secondary" onclick="setDiscoverMood('discussion')">Discussion</button><button class="btn secondary" onclick="setDiscoverMood('chill')">Chill</button></div></div></article>`;
  const id=liveIdentity(x), reasons=discoverReasonFor(x).slice(0,3), score=comfortScore(x);
  return `<article class="proCard" data-swipe-card="1"><div class="swipeStamp like">J'aime</div><div class="swipeStamp nope">Pas ouf</div><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="eager">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span><span class="proPill">${score}% confort</span></div>
    <div class="proOverlay"><div class="proReasons">${reasons.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p><div class="swipeHint">Swipe droite : j’aime · gauche : pas ouf</div>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button></div>
    </div></article>`;
}

function proSwipeRight(){
  const x=currentZapItem?.();
  if(!x) return findLive();
  saveCurrentLive?.();
  toast?.('Aimé — on garde cette vibe');
  setTimeout(()=>zapNext(),120);
}
function proSwipeLeft(){
  const items=state.zap.items||[];
  if(!items.length) return findLive();
  clearSpotlightPlayer?.();
  closeMini?.();
  toast?.('Pas ouf — suivant');
  state.zap.index=(state.zap.index+1)%items.length;
  renderZap();
}
function bindProSwipe(){
  const card=document.querySelector('.proCard[data-swipe-card="1"]');
  if(!card || card.__oryonSwipeBound) return;
  card.__oryonSwipeBound=true;
  let startX=0,startY=0,dx=0,dy=0,dragging=false;
  const start=(e)=>{
    if(e.target.closest('button,a,input,select,textarea')) return;
    const p=e.touches?e.touches[0]:e;
    startX=p.clientX; startY=p.clientY; dx=0; dy=0; dragging=true;
    card.style.transition='none';
  };
  const move=(e)=>{
    if(!dragging) return;
    const p=e.touches?e.touches[0]:e;
    dx=p.clientX-startX; dy=p.clientY-startY;
    if(Math.abs(dx)<10) return;
    if(Math.abs(dx)>Math.abs(dy)*1.15 && e.cancelable) e.preventDefault();
    const rot=Math.max(-8,Math.min(8,dx/18));
    card.style.transform=`translateX(${dx}px) rotate(${rot}deg)`;
    card.classList.toggle('swipe-like',dx>38);
    card.classList.toggle('swipe-nope',dx<-38);
  };
  const end=()=>{
    if(!dragging) return;
    dragging=false;
    card.style.transition='transform .18s ease, opacity .18s ease';
    const threshold=Math.min(120,Math.max(72,window.innerWidth*.18));
    if(dx>threshold){
      card.style.transform='translateX(120vw) rotate(10deg)';
      card.style.opacity='.2';
      return setTimeout(proSwipeRight,130);
    }
    if(dx<-threshold){
      card.style.transform='translateX(-120vw) rotate(-10deg)';
      card.style.opacity='.2';
      return setTimeout(proSwipeLeft,130);
    }
    card.style.transform='';
    card.classList.remove('swipe-like','swipe-nope');
  };
  card.addEventListener('touchstart',start,{passive:true});
  card.addEventListener('touchmove',move,{passive:false});
  card.addEventListener('touchend',end,{passive:true});
  card.addEventListener('pointerdown',start);
  window.addEventListener('pointermove',move,{passive:false});
  window.addEventListener('pointerup',end);
}

function renderZap(){
  const box=$('#zapResult'); if(!box) return;
  const items=state.zap.items||[];
  const cur=items[state.zap.index]||null;
  const watching=!!(cur&&spotlightIsPlaying(cur));
  const queue=items.length>1?`<div class="section"><div class="proQueue">${items.slice(0,10).map((x,i)=>{const id=liveIdentity(x);return `<button class="proQueueItem ${i===state.zap.index?'active':''}" onclick="state.zap.index=${i};clearSpotlightPlayer();closeMini?.();renderZap()"><b>${esc(id.name)}</b><span class="small">${esc(id.game)} · ${id.viewers} viewers</span></button>`}).join('')}</div></div>`:'';
  box.innerHTML=`<div class="proStage ${watching?'proStageWatching':''}"><main class="proMain">${renderSpotlightPlayer(cur)}${queue}</main>${renderSpotlightMeta(cur)}</div>`;
  if(watching) proSuppressMiniWhileWatching?.();
  renderViewerImpact?.();
  bindProSwipe();
}


/* Mood-first Discover pass — one tap, one live, swipe next */
(function injectMoodFirstDiscoverPass(){
  if(document.getElementById('oryonMoodFirstDiscoverPass')) return;
  const st=document.createElement('style');
  st.id='oryonMoodFirstDiscoverPass';
  st.textContent=`
  #discover.view.active{max-width:1320px!important;margin-inline:auto!important;}
  .moodFirst{width:100%;display:grid;gap:18px;margin-inline:auto;}
  .moodFirstHero{position:relative;overflow:hidden;border:1px solid rgba(139,92,246,.32);border-radius:30px;background:radial-gradient(circle at 18% 20%,rgba(139,92,246,.30),transparent 34%),radial-gradient(circle at 92% 12%,rgba(34,211,238,.16),transparent 28%),linear-gradient(135deg,rgba(10,16,28,.96),rgba(3,6,14,.98));padding:24px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end;box-shadow:0 24px 70px rgba(0,0,0,.25);}
  .moodFirstHero h1{margin:8px 0 6px;font-size:clamp(38px,5.4vw,78px);line-height:.88;letter-spacing:-.075em;max-width:780px;}
  .moodFirstHero p{margin:0;color:#d7e4f8;max-width:620px;font-size:clamp(15px,1.6vw,18px);line-height:1.42;}
  .moodFirstHint{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
  .moodFirstHint span{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;color:#e5eefc;}
  .moodFirstPanel{border:1px solid var(--line);border-radius:26px;background:linear-gradient(180deg,rgba(255,255,255,.052),rgba(255,255,255,.022));padding:16px;display:grid;gap:14px;}
  .moodFirstPanelHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;}
  .moodFirstPanelHead h2{margin:0;font-size:clamp(22px,2.5vw,34px);letter-spacing:-.045em;}
  .moodFirstPanelHead p{margin:4px 0 0;color:var(--muted);}
  .moodFirstGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;}
  .moodFirstCard{position:relative;min-height:118px;display:grid;align-content:end;gap:6px;text-align:left;color:white;border:1px solid rgba(255,255,255,.10);border-radius:22px;background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.026));padding:15px;overflow:hidden;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease;}
  .moodFirstCard::before{content:"";position:absolute;inset:auto -25% -48% -25%;height:76%;background:radial-gradient(circle,rgba(139,92,246,.30),transparent 64%);opacity:.8;transition:opacity .18s ease,transform .18s ease;}
  .moodFirstCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.82);background:linear-gradient(145deg,rgba(139,92,246,.18),rgba(34,211,238,.055));}
  .moodFirstCard.active{border-color:rgba(34,211,238,.9);box-shadow:0 0 0 1px rgba(34,211,238,.26),0 20px 60px rgba(34,211,238,.12);background:linear-gradient(145deg,rgba(139,92,246,.24),rgba(34,211,238,.10));}
  .moodFirstCard i{position:relative;font-style:normal;font-size:30px;line-height:1;}
  .moodFirstCard b{position:relative;font-size:16px;line-height:1.05;letter-spacing:-.025em;}
  .moodFirstCard span{position:relative;color:#cbd8ec;font-size:12px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .moodFirstAdvanced{border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.028);overflow:hidden;}
  .moodFirstAdvanced summary{cursor:pointer;padding:12px 14px;font-weight:950;color:#dbe7fb;list-style:none;display:flex;justify-content:space-between;align-items:center;}
  .moodFirstAdvanced summary::-webkit-details-marker{display:none;}
  .moodFirstAdvanced summary::after{content:"Réglages";font-size:12px;color:var(--muted);font-weight:800;}
  .moodFirstAdvanced[open] summary{border-bottom:1px solid var(--line);}
  .moodFirstAdvanced .proSearchLine{padding:12px;display:grid!important;grid-template-columns:minmax(180px,1fr) 150px 128px 92px auto!important;gap:8px!important;}
  .moodFirstAdvanced #dMood{display:none!important;}
  .moodFirstStart{min-height:clamp(360px,42vw,560px);border:1px solid rgba(139,92,246,.28);border-radius:28px;background:radial-gradient(circle at 22% 12%,rgba(139,92,246,.32),transparent 34%),radial-gradient(circle at 80% 24%,rgba(34,211,238,.18),transparent 30%),linear-gradient(135deg,#050814,#0b1020);display:grid;place-items:center;text-align:center;padding:24px;overflow:hidden;}
  .moodFirstStart h2{margin:10px auto 8px;font-size:clamp(30px,4.2vw,58px);line-height:.95;letter-spacing:-.06em;max-width:720px;}
  .moodFirstStart p{margin:0 auto;color:#cbd8ec;max-width:560px;}
  .moodFirstStart .moodFirstMiniGrid{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px;}
  .moodFirstStart .moodFirstMiniGrid button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:white;border-radius:999px;padding:10px 13px;font-weight:950;}
  .moodFirstSelected{display:inline-flex;gap:8px;align-items:center;border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);border-radius:999px;padding:8px 12px;font-weight:950;}
  .moodFirst #zapResult{display:block;width:100%;}
  .moodFirst .proStage{margin-top:0!important;}
  @media(max-width:1120px){
    .moodFirstGrid{grid-template-columns:repeat(3,minmax(0,1fr));}
    .moodFirstHero{grid-template-columns:1fr;}
    .moodFirstHint{justify-content:flex-start;}
  }
  @media(max-width:760px){
    #discover.view.active{padding-bottom:86px!important;}
    .moodFirst{gap:12px;}
    .moodFirstHero{border-radius:22px;padding:17px;}
    .moodFirstHero h1{font-size:clamp(34px,10.5vw,48px);}
    .moodFirstHero p{font-size:14px;}
    .moodFirstHint{display:none;}
    .moodFirstPanel{border-radius:22px;padding:12px;}
    .moodFirstPanelHead{display:block;}
    .moodFirstPanelHead h2{font-size:23px;}
    .moodFirstPanelHead p{font-size:13px;}
    .moodFirstGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}
    .moodFirstCard{min-height:112px;border-radius:19px;padding:12px;}
    .moodFirstCard i{font-size:27px;}
    .moodFirstCard b{font-size:15px;}
    .moodFirstCard span{font-size:11px;}
    .moodFirstAdvanced summary{padding:12px;font-size:14px;}
    .moodFirstAdvanced .proSearchLine{grid-template-columns:1fr!important;padding:10px!important;}
    .moodFirstAdvanced .proSearchLine input,.moodFirstAdvanced .proSearchLine select,.moodFirstAdvanced .proSearchLine button{min-height:46px!important;}
    .moodFirstStart{min-height:360px;border-radius:22px;padding:18px;}
    .moodFirstStart h2{font-size:clamp(30px,9vw,42px);}
    .moodFirstStart p{font-size:14px;}
  }
  @media(max-width:380px){
    .moodFirstCard{min-height:104px;padding:11px;}
    .moodFirstCard b{font-size:14px;}
  }
  `;
  document.head.appendChild(st);
})();

function moodFirstMaxFor(id){
  if(id==='petite-commu') return '20';
  if(id==='nuit' || id==='chill' || id==='discussion') return '50';
  return '200';
}

function moodFirstLabel(id){
  const m=(AMBIANCES||[]).find(x=>x[0]===id);
  return m?m[1]:'Ambiance';
}

function setDiscoverMood(id){
  const normalized=id||'chill';
  state.moodFirstMood=normalized;
  const mood=$('#dMood'); if(mood) mood.value=normalized;
  const max=$('#dMax'); if(max) max.value=moodFirstMaxFor(normalized);
  $$('.moodFirstCard,.proMoodBtn').forEach(btn=>btn.classList.toggle('active', btn.dataset.mood===normalized));
  const zap=$('#zapResult');
  if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(normalized))}</span><h2>Je cherche le bon live…</h2><p>Oryon filtre pour toi. Ensuite tu swipes.</p></div></div>`;
  closeMini?.();
  state.discoverPlayer=null;
  requestAnimationFrame(()=>document.getElementById('zapResult')?.scrollIntoView({block:'start',behavior:'smooth'}));
  return findLive();
}

async function findLive(){
  const mood=state.moodFirstMood || $('#dMood')?.value || 'chill';
  const q=$('#dQuery')?.value || '';
  const source=$('#dSource')?.value || 'both';
  const max=$('#dMax')?.value || moodFirstMaxFor(mood);
  const lang=$('#dLang')?.value || 'fr';
  const results=$('#discoverResults'); if(results) results.innerHTML='';
  const zap=$('#zapResult');
  if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Recherche en cours…</h2><p>Une proposition adaptée arrive.</p></div></div>`;
  state.currentTwitch=null;
  state.discoverPlayer=null;
  closeMini?.();
  try{
    const r=await api('/api/oryon/discover/find-live?'+qs({q,mood,max,lang,source}));
    const items=(r.items||[]).filter(x=>(x.platform||'')!=='peertube');
    state.zap.items=items;
    state.zap.index=0;
    state.zap.last={q,mood,max,lang,source};
    renderZap();
    if(results) results.innerHTML='';
    if(!items.length && zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Aucun live trouvé.</h2><p>Essaie une autre ambiance ou ouvre les options avancées.</p><div class="moodFirstMiniGrid">${AMBIANCES.map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></div>`;
  }catch(e){
    if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><h2>Recherche impossible.</h2><p>Le service de découverte ne répond pas pour le moment.</p></div></div>`;
    console.error(e);
  }
}

function renderSpotlightPreview(x){
  if(!x){
    return `<article class="moodFirstStart"><div><span class="eyebrow"><i class="dot"></i>Découvrir</span><h2>Choisis ton mood. Oryon choisit le live.</h2><p>Pas de formulaire obligatoire. Un tap, une proposition, puis swipe droite ou gauche.</p><div class="moodFirstMiniGrid">${AMBIANCES.slice(0,4).map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></article>`;
  }
  const id=liveIdentity(x), reasons=discoverReasonFor(x).slice(0,3), score=comfortScore(x);
  return `<article class="proCard" data-swipe-card="1"><div class="swipeStamp like">J'aime</div><div class="swipeStamp nope">Pas ouf</div><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="eager">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span><span class="proPill">${score}% confort</span></div>
    <div class="proOverlay"><div class="proReasons">${reasons.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p><div class="swipeHint">Swipe droite : j’aime · gauche : pas ouf</div>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button></div>
    </div></article>`;
}

async function renderDiscover(){
  const el=$('#discover');
  if(!el) return;
  const current=state.moodFirstMood || 'chill';
  el.innerHTML=`<div class="moodFirst">
    <section class="moodFirstHero">
      <div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Choisis ton mood.</h1><p>Oryon te propose un live en deux secondes. Ensuite tu swipes : droite si ça te parle, gauche si ce n’est pas ta vibe.</p></div>
      <div class="moodFirstHint"><span>1 tap</span><span>1 live</span><span>swipe ensuite</span></div>
    </section>
    <section class="moodFirstPanel">
      <div class="moodFirstPanelHead"><div><h2>Ambiance</h2><p>Le choix technique reste caché. Le viewer choisit une intention.</p></div>${state.moodFirstMood?`<span class="moodFirstSelected">${esc(moodFirstLabel(state.moodFirstMood))}</span>`:''}</div>
      <div class="moodFirstGrid">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="moodFirstCard ${id===current?'active':''}" data-mood="${esc(id)}" onclick="setDiscoverMood('${esc(id)}')"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div>
      <details class="moodFirstAdvanced">
        <summary>Options avancées</summary>
        <div class="proSearchLine"><input id="dQuery" placeholder="jeu, pseudo, ambiance" onkeydown="if(event.key==='Enter')findLive()"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood"><option value="${esc(current)}">${esc(moodFirstLabel(current))}</option>${AMBIANCES.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="20">≤20</option><option value="50" selected>≤50</option><option value="200">≤200</option><option value="300">≤300</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn secondary" onclick="findLive()">Relancer</button></div>
      </details>
    </section>
    <section id="zapResult"></section>
    <section class="proTwitchPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Accès Twitch</h2><p class="small" style="margin:6px 0 0">Recherche manuelle si tu sais déjà qui tu veux voir.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch" onkeydown="if(event.key==='Enter')searchTwitch()"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="followedWrapCompact"></div><div id="twResults"></div></section>
  </div>`;
  const mood=$('#dMood'); if(mood) mood.value=current;
  const max=$('#dMax'); if(max) max.value=moodFirstMaxFor(current);
  state.proTab=state.proTab||'signal';
  renderZap();
  renderCompactFollowed?.();
  closeMini?.();
}


/* Home vitrine final pass — recommendations, tags, followed status */
(function injectHomeVitrineFinal(){
  if(document.getElementById('oryonHomeVitrineFinal')) return;
  const st=document.createElement('style');
  st.id='oryonHomeVitrineFinal';
  st.textContent=`
  #home.view.active{width:100%;max-width:1380px;margin-inline:auto;overflow-x:hidden;}
  .homeShowcase{position:relative;overflow:hidden;border:1px solid rgba(148,163,184,.18);border-radius:32px;background:linear-gradient(135deg,rgba(15,23,42,.94),rgba(12,10,22,.94));box-shadow:0 30px 90px rgba(0,0,0,.36);}
  .homeShowcase:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 12% 8%,rgba(139,92,246,.30),transparent 34%),radial-gradient(circle at 92% 18%,rgba(34,211,238,.20),transparent 34%);pointer-events:none;}
  .homeShowcaseInner{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.35fr);gap:22px;padding:24px;align-items:stretch;}
  .homeShowcaseCopy{display:flex;flex-direction:column;justify-content:space-between;gap:22px;padding:10px;}
  .homeShowcaseCopy h1{font-size:clamp(42px,6.5vw,86px);line-height:.92;letter-spacing:-.075em;margin:10px 0 12px;}
  .homeShowcaseCopy p{font-size:clamp(17px,2vw,22px);line-height:1.35;color:#cbd5e1;max-width:660px;margin:0;}
  .homeShowcaseActions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
  .homeShowcaseActions .btn{min-height:52px;padding-inline:20px;font-size:15px;}
  .homeLiveGrid{display:grid;grid-template-columns:1.25fr .85fr;grid-template-rows:1fr 1fr;gap:12px;min-height:500px;}
  .homeRecCard{position:relative;overflow:hidden;border:1px solid rgba(148,163,184,.18);border-radius:26px;background:#050914;min-height:230px;cursor:pointer;isolation:isolate;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;}
  .homeRecCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.72);box-shadow:0 22px 70px rgba(0,0,0,.34);}
  .homeRecCard.primary{grid-row:1/3;min-height:500px;}
  .homeRecCard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.02);filter:saturate(1.08) contrast(1.02);}
  .homeRecCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.15) 38%,rgba(2,6,23,.92));z-index:1;}
  .homeRecBody{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:18px;display:grid;gap:10px;}
  .homeRecCard.primary .homeRecBody{padding:24px;gap:13px;}
  .homeRecBody h2{margin:0;font-size:clamp(21px,2.2vw,34px);line-height:1.02;letter-spacing:-.04em;text-shadow:0 4px 20px rgba(0,0,0,.45);}
  .homeRecBody p{margin:0;color:#cbd5e1;font-weight:800;}
  .homeTagCloud,.signalTagCloud{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  .homeTag,.signalTag{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.13);background:rgba(2,6,23,.54);backdrop-filter:blur(12px);color:#f8fafc;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:950;line-height:1;}
  .signalTagCloud{padding:2px 0 4px;}
  .signalTag{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));font-size:13px;padding:10px 12px;}
  .signalTag.main{border-color:rgba(139,92,246,.58);background:linear-gradient(135deg,rgba(139,92,246,.28),rgba(34,211,238,.10));}
  .signalExplain{margin-top:12px;color:#aab6ca;line-height:1.45;font-size:14px;}
  .homeMoodStrip{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}
  .homeMoodStrip button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:white;border-radius:999px;padding:10px 13px;font-weight:950;}
  .homeMoodStrip button:hover{background:rgba(139,92,246,.18);border-color:rgba(139,92,246,.55);}
  .homeSectionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:26px 0 12px;}
  .homeSectionHead h2{font-size:clamp(24px,3vw,38px);letter-spacing:-.05em;margin:0;}
  .homeSectionHead p{color:#aab6ca;margin:6px 0 0;}
  .homeFollowPanel,.homeImpactPanel{border:1px solid rgba(148,163,184,.18);border-radius:26px;background:linear-gradient(180deg,rgba(15,23,42,.74),rgba(15,23,42,.36));padding:18px;}
  .homeTwoGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;}
  .proMetricGrid,.signalCards{display:none!important;}
  .comfortRing{display:none!important;}
  .proBadgeTop .proPill:nth-child(2){display:none!important;}
  .proFollowGrid.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:12px;}
  .proFollowCard.statusCard{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;width:100%;min-height:74px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));border-radius:18px;padding:10px 12px;color:#e5edf8;}
  .proFollowCard.statusCard:hover{border-color:rgba(139,92,246,.58);background:linear-gradient(180deg,rgba(139,92,246,.14),rgba(255,255,255,.035));}
  .proFollowStatus{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:7px 9px;font-size:11px;font-weight:950;border:1px solid rgba(255,255,255,.12);}
  .proFollowStatus.live{background:rgba(34,197,94,.12);color:#86efac;border-color:rgba(34,197,94,.35);}
  .proFollowStatus.offline{background:rgba(148,163,184,.08);color:#cbd5e1;}
  .proFollowText span{display:block;color:#94a3b8;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .proAvatar img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;}
  .proAvatar{width:44px;height:44px;min-width:44px;border-radius:14px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,rgba(139,92,246,.5),rgba(34,211,238,.22));border:1px solid rgba(255,255,255,.14);}
  .proAvatar i{font-style:normal;font-weight:1000;color:white;display:grid;place-items:center;width:100%;height:100%;}
  @media(max-width:980px){
    #home.view.active{max-width:none;}
    .homeShowcase{border-radius:26px;margin-top:4px;}
    .homeShowcaseInner{grid-template-columns:1fr;padding:16px;gap:16px;}
    .homeShowcaseCopy{padding:4px;}
    .homeShowcaseCopy h1{font-size:clamp(42px,14vw,72px);}
    .homeShowcaseCopy p{font-size:17px;}
    .homeShowcaseActions{display:grid;grid-template-columns:1fr;}
    .homeShowcaseActions .btn{width:100%;min-height:58px;font-size:16px;}
    .homeLiveGrid{grid-template-columns:1fr;grid-template-rows:auto;min-height:0;}
    .homeRecCard,.homeRecCard.primary{grid-row:auto;min-height:280px;aspect-ratio:16/13;}
    .homeRecCard.primary{min-height:420px;}
    .homeRecBody{padding:16px;}
    .homeTwoGrid{grid-template-columns:1fr;}
    .homeSectionHead{align-items:flex-start;flex-direction:column;}
    .proFollowGrid.status{grid-template-columns:1fr;}
  }
  @media(max-width:520px){
    .homeRecCard,.homeRecCard.primary{min-height:320px;aspect-ratio:auto;}
    .homeRecBody h2{font-size:24px;}
    .homeTag,.signalTag{font-size:11px;padding:7px 9px;}
  }
  `;
  document.head.appendChild(st);
})();

function liveOpenAction(x){
  const id=liveIdentity(x||{});
  if(id.platform==='twitch' || x?.login || x?.user_login) return `openTwitch('${esc(id.login)}')`;
  return `openOryon('${esc(id.login||x?.room||x?.host_login||'')}')`;
}
function liveStableTags(x){
  const id=liveIdentity(x||{});
  const tags=[];
  tags.push(id.platform==='twitch'?'Twitch':'Oryon');
  if(id.viewers>=15 && id.viewers<=30) tags.push('15–30 viewers');
  else if(id.viewers<=50) tags.push('petit live');
  if(Number(x?.chat_messages||0)>5) tags.push('chat actif');
  else tags.push('chat lisible');
  if(x?.started_at || x?.createdAt) tags.push('en direct');
  if(id.game) tags.push(id.game);
  return [...new Set(tags)].slice(0,5);
}
function signalTagsFor(cur){
  if(!cur) return [];
  const id=liveIdentity(cur);
  const tags=[];
  tags.push(id.platform==='twitch'?'Twitch intégré':'Oryon natif');
  if(id.viewers<=20) tags.push('très petit live');
  else if(id.viewers<=50) tags.push('petit live');
  else tags.push('audience active');
  tags.push(id.viewers<=50?'entrée facile':'entrée normale');
  if(Number(cur.chat_messages||0)>5) tags.push('chat actif');
  else tags.push('chat lisible');
  if(id.game) tags.push(id.game);
  const mood=state.moodFirstMood||$('#dMood')?.value;
  if(mood) tags.push(moodFirstLabel(mood));
  return [...new Set(tags)].slice(0,7);
}
function signalTagsHtml(cur){
  const tags=signalTagsFor(cur);
  if(!tags.length) return '<div class="proNotice">Lance une proposition pour voir les tags utiles.</div>';
  return `<div class="signalTagCloud">${tags.map((t,i)=>`<span class="signalTag ${i===0?'main':''}">${esc(t)}</span>`).join('')}</div><div class="signalExplain">Signal résumé en tags : pas de score décoratif, juste les raisons de tenter ce live.</div>`;
}
function signalCardsHtml(cur){ return signalTagsHtml(cur); }
function proSignalTab(cur){
  if(!cur) return `<div class="proNotice">Lance une proposition pour voir les tags utiles.</div>`;
  return `<h2 style="margin:0 0 12px">Signal</h2>${signalTagsHtml(cur)}`;
}
function renderSpotlightMeta(cur){
  const tab=state.proTab||'signal';
  const panel=tab==='actions'?proActionsTab(cur):(tab==='profile'?proProfileTab():proSignalTab(cur));
  return `<aside class="proSide"><div class="proTabs">${proTabButton('signal','Signal')}${proTabButton('actions','Actions')}${proTabButton('profile','Profil')}</div><div class="proTabPanel">${panel}</div></aside>`;
}
function renderSpotlightPreview(x){
  if(!x){
    return `<article class="moodFirstStart"><div><span class="eyebrow"><i class="dot"></i>Découvrir</span><h2>Choisis ton mood. Oryon choisit le live.</h2><p>Propose-moi un live lance automatiquement une recommandation. Choisir une ambiance te laisse décider la vibe.</p><div class="moodFirstMiniGrid">${AMBIANCES.slice(0,4).map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></article>`;
  }
  const id=liveIdentity(x), tags=signalTagsFor(x).slice(0,5);
  return `<article class="proCard" data-swipe-card="1"><div class="swipeStamp like">J'aime</div><div class="swipeStamp nope">Pas ouf</div><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="eager">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span></div>
    <div class="proOverlay"><div class="proReasons">${tags.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p><div class="swipeHint">Swipe droite : j’aime · gauche : pas ouf</div>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="zapNext()">Suivant</button><button class="btn secondary" onclick="saveCurrentLive()">Sauver</button></div>
    </div></article>`;
}
async function autoProposeLive(){
  state.moodFirstMood = state.moodFirstMood || 'petite-commu';
  await setView('discover');
  const source=$('#dSource'); if(source) source.value='both';
  const max=$('#dMax'); if(max) max.value='30';
  const lang=$('#dLang'); if(lang) lang.value='fr';
  const mood=$('#dMood'); if(mood) mood.value=state.moodFirstMood;
  await findLive();
}
async function quickGem(){ return autoProposeLive(); }
function homeRecommendationCard(x,i){
  const id=liveIdentity(x||{}), tags=liveStableTags(x), action=liveOpenAction(x);
  return `<article class="homeRecCard ${i===0?'primary':''}" onclick="${action}">${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:`<div class="proEmptyMedia">LIVE</div>`}<div class="homeRecBody"><div class="homeTagCloud">${tags.slice(0,4).map(t=>`<span class="homeTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live recommandé')}</h2><p>${esc(id.name)} · ${id.viewers} viewers</p></div></article>`;
}
async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML='<div class="proNotice">Sélection des lives recommandés…</div>';
  try{
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    const twitch=await api('/api/twitch/streams/small?lang=fr&min=15&max=30').catch(()=>({items:[]}));
    let items=[...(native.items||[]).map(x=>({...x,platform:'oryon'})),...(twitch.items||[]).map(x=>({...x,platform:'twitch'}))];
    items=items.filter(x=>{const v=Number(x.viewer_count??x.viewers??0)||0; return v>=0 && v<=50;});
    items.sort((a,b)=>{
      const av=Number(a.viewer_count??a.viewers??0)||0, bv=Number(b.viewer_count??b.viewers??0)||0;
      const as=(av>=15&&av<=30?50:0)+Math.min(25,Number(a.chat_messages||0));
      const bs=(bv>=15&&bv<=30?50:0)+Math.min(25,Number(b.chat_messages||0));
      return bs-as || Math.abs(av-22)-Math.abs(bv-22);
    });
    items=items.slice(0,3);
    if(!items.length){
      box.innerHTML=`<div class="proNotice">Aucun live 15–30 viewers pour le moment. Utilise “Propose-moi un live”.</div>`;
      return;
    }
    box.innerHTML=items.map(homeRecommendationCard).join('');
  }catch(e){
    box.innerHTML='<div class="proNotice">Impossible de charger la vitrine pour le moment.</div>';
  }
}
async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<section class="homeShowcase section"><div class="homeShowcaseInner"><div class="homeShowcaseCopy"><div><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Recommandations en haut : petits lives, entrée facile, chat lisible. Tu ne configures rien, tu testes.</p><div class="homeMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div></div><div class="homeShowcaseActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button>${state.session.local?`<button class="btn ghost" onclick="setView('manager')">Streamer</button>`:`<button class="btn ghost" onclick="setView('settings')">Créer mon compte</button>`}</div></div><div id="homeShowcaseLives" class="homeLiveGrid"><div class="proNotice">Chargement des recommandations…</div></div></div></section>
  <div class="homeSectionHead"><div><h2>Pourquoi ces lives ?</h2><p>Oryon privilégie les créateurs accessibles plutôt que les gros flux déjà saturés.</p></div><button class="btn secondary" onclick="autoProposeLive()">Surprends-moi</button></div>
  <div class="homeTwoGrid"><section class="homeImpactPanel"><h2>Trace viewer</h2><div id="viewerImpactBox">${viewerImpactCard()}</div></section><section class="homeFollowPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Tes suivis Twitch</h2><p class="small" style="margin:6px 0 0">Logo de chaîne, statut live ou hors ligne.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact"></div></section></div>`;
  await loadHomeRecommendations();
  await renderCompactFollowed();
  closeMini?.();
}
async function renderCompactFollowed(){
  const box=$('#followedWrapCompact'); if(!box) return;
  if(!state.session.twitch){ box.innerHTML=`<div class="proNotice">Connecte Twitch pour voir tes suivis avec leur statut.</div>`; return; }
  box.innerHTML='<div class="proNotice">Chargement des suivis Twitch…</div>';
  try{
    let r=await api('/api/twitch/followed/status').catch(()=>null);
    if(!r || !r.success) r=await api('/api/twitch/followed/live').catch(()=>null);
    if(!r || !r.success) r=await api('/followed_streams').catch(()=>null);
    const items=(r?.items||r?.streams||[]).filter(Boolean);
    if(!items.length){ box.innerHTML='<div class="proNotice">Aucun suivi trouvé. Twitch peut aussi ne renvoyer que les chaînes live selon les autorisations.</div>'; return; }
    box.innerHTML=`<div class="proFollowGrid status">${items.slice(0,12).map(x=>{
      const login=proLoginOf(x), name=proNameOf(x), viewers=proViewersOf(x), live=!!(x.is_live||x.live||viewers>0);
      const game=x.game_name||x.category||x.title||'Chaîne suivie';
      return `<button class="proFollowCard statusCard" onclick="openTwitch('${esc(login)}')">${proAvatarHtml(x)}<span class="proFollowText"><b>${esc(name)}</b><span>${esc(game)}</span></span><span class="proFollowStatus ${live?'live':'offline'}">${live?'● Live':'Hors ligne'}${live&&viewers?` · ${viewers}`:''}</span></button>`;
    }).join('')}</div>`;
  }catch(e){ box.innerHTML='<div class="proNotice">Impossible de charger tes suivis Twitch.</div>'; }
}
async function searchTwitch(){
  const q=$('#twSearch')?.value?.trim(); if(!q)return;
  const box=$('#twResults'); if(box) box.innerHTML='<div class="proNotice">Recherche…</div>';
  const r=await api('/api/twitch/channels/search?'+qs({q,live:false})).catch(()=>({items:[]}));
  if(!box) return;
  const items=r.items||[];
  box.innerHTML=items.length?`<div class="proFollowGrid status">${items.map(x=>`<button class="proFollowCard statusCard" onclick="openTwitch('${esc(x.login)}')">${proAvatarHtml(x)}<span class="proFollowText"><b>${esc(x.display_name||x.login)}</b><span>${esc(x.title||x.game_name||'Chaîne Twitch')}</span></span><span class="proFollowStatus ${x.is_live?'live':'offline'}">${x.is_live?'● Live':'Hors ligne'}${x.viewer_count?` · ${x.viewer_count}`:''}</span></button>`).join('')}</div>`:'<div class="proNotice">Aucun résultat.</div>';
}

/* Final UX polish — followed Twitch banners, category hero thumbnails, anchored top menu */
(function injectBannerFollowAndMenuPass(){
  if(document.getElementById('oryonBannerFollowAndMenuPass')) return;
  const st=document.createElement('style');
  st.id='oryonBannerFollowAndMenuPass';
  st.textContent=`
  .top{overflow:visible!important;z-index:120!important}
  .userArea{position:relative!important}
  .menu{top:calc(100% + 10px)!important;right:0!important;width:min(360px,calc(100vw - 24px))!important;max-height:calc(100vh - 92px)!important;overflow:auto!important;border-radius:20px!important;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(8,11,18,.98))!important;box-shadow:0 24px 80px rgba(0,0,0,.5)!important;z-index:140!important}
  .menu.open{display:block!important;animation:oryonDrop .14s ease-out both}
  @keyframes oryonDrop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  .homeShowcase{margin-top:18px!important}
  .homeShowcaseActions .btn{font-size:16px!important;min-height:56px!important}
  .homeFollowPanel{overflow:hidden}
  .followBannerRail{display:flex;gap:14px;overflow:auto;padding:12px 2px 6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
  .followBannerRail::-webkit-scrollbar{height:7px}.followBannerRail::-webkit-scrollbar-thumb{background:rgba(148,163,184,.24);border-radius:99px}
  .followBannerCard{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-rows:1fr auto;align-items:end;min-width:300px;width:300px;height:150px;scroll-snap-align:start;border:1px solid rgba(148,163,184,.18);border-radius:24px;background:#0b1020;color:white;text-align:left;padding:0;box-shadow:0 14px 50px rgba(0,0,0,.24);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
  .followBannerCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.65);box-shadow:0 22px 70px rgba(0,0,0,.36)}
  .followBannerBg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.04);transform:scale(1.02);z-index:-3}
  .followBannerCard.offline .followBannerBg{filter:saturate(.75) brightness(.6) blur(1px)}
  .followBannerFallback{position:absolute;inset:0;z-index:-3;background:radial-gradient(circle at 18% 20%,rgba(139,92,246,.45),transparent 38%),radial-gradient(circle at 80% 12%,rgba(34,211,238,.22),transparent 35%),#0b1020}
  .followBannerCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.08),rgba(2,6,23,.35) 40%,rgba(2,6,23,.92));z-index:-1}
  .followBannerTop{position:absolute;left:12px;right:12px;top:12px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .followBannerStatus{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:7px 10px;border:1px solid rgba(255,255,255,.14);background:rgba(3,7,18,.55);backdrop-filter:blur(12px);font-size:12px;font-weight:1000;color:#e5edf8}
  .followBannerStatus.live{background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.45);color:#bbf7d0}.followBannerStatus.offline{color:#cbd5e1}
  .followBannerBody{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:end;padding:0 14px 14px;width:100%}
  .followBannerAvatar{width:52px;height:52px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.22);box-shadow:0 10px 30px rgba(0,0,0,.35);background:linear-gradient(135deg,rgba(139,92,246,.65),rgba(34,211,238,.3));display:grid;place-items:center;font-size:22px;font-weight:1000}
  .followBannerAvatar img{width:100%;height:100%;object-fit:cover;display:block}.followBannerText{min-width:0}.followBannerText b{display:block;font-size:18px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.followBannerText span{display:block;margin-top:5px;color:#cbd5e1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .followBannerSearch{display:grid;gap:12px;margin-top:14px}.followBannerSearch .followBannerCard{width:100%;min-width:0;height:170px}
  .categoryPickHero{position:relative;overflow:hidden;border:1px solid rgba(148,163,184,.18);border-radius:30px;min-height:320px;background:#080d18;isolation:isolate;box-shadow:0 24px 80px rgba(0,0,0,.32)}
  .categoryPickHero img.catBg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.02);transform:scale(1.03);z-index:-3}.categoryPickHero:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,6,23,.92),rgba(2,6,23,.58) 48%,rgba(2,6,23,.25));z-index:-1}.categoryPickContent{padding:28px;max-width:720px}.categoryPickContent h2{font-size:clamp(34px,5vw,64px);line-height:.95;letter-spacing:-.065em;margin:12px 0}.categoryPickContent p{color:#cbd5e1;font-size:18px;margin:0 0 18px}.categoryPickLive{margin-top:18px;max-width:560px}.categoryPickLive .liveCard{background:rgba(8,11,18,.70);backdrop-filter:blur(18px)}
  .categoryCard{transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.categoryCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.62);box-shadow:0 16px 50px rgba(0,0,0,.26)}
  @media(max-width:1080px){
    .userArea{position:static!important}.menu{position:fixed!important;top:76px!important;right:12px!important;left:auto!important;width:min(380px,calc(100vw - 24px))!important;max-height:calc(100vh - 152px)!important}.topbar{height:68px!important}.brand{font-size:15px}.brandMark{width:36px;height:36px}.userBtn{padding:6px!important}.userBtn span{display:none!important}.avatarMini{width:34px!important;height:34px!important}
    .followBannerRail{gap:12px;padding-bottom:10px}.followBannerCard{min-width:82vw;width:82vw;height:168px;border-radius:24px}.followBannerText b{font-size:20px}.followBannerAvatar{width:56px;height:56px}.homeTwoGrid{grid-template-columns:1fr!important}.categoryPickHero{min-height:360px}.categoryPickHero:after{background:linear-gradient(180deg,rgba(2,6,23,.50),rgba(2,6,23,.92))}.categoryPickContent{padding:22px}.categoryPickContent h2{font-size:clamp(40px,12vw,68px)}
  }
  @media(max-width:520px){.followBannerCard{min-width:88vw;width:88vw;height:164px}.followBannerTop{top:10px;left:10px;right:10px}.followBannerBody{padding:0 12px 12px}.homeShowcaseActions .btn{min-height:60px!important}.categoryPickHero{border-radius:26px}.categoryPickContent{padding:18px}}
  `;
  document.head.appendChild(st);
})();

function proBannerImageOf(x){return String(x?.thumbnail_url||x?.preview_url||x?.offline_image_url||x?.banner_url||'').replace('{width}','640').replace('{height}','360');}
function proProfileImageOf(x){return String(x?.profile_image_url||x?.avatar_url||x?.avatar||'');}
function followBannerCard(x){
  const login=proLoginOf(x), name=proNameOf(x), viewers=proViewersOf(x), live=!!(x?.is_live||x?.live||viewers>0);
  const bg=proBannerImageOf(x), avatar=proProfileImageOf(x), game=x?.game_name||x?.category||x?.title||'Chaîne suivie';
  const status=live?`● Live${viewers?` · ${viewers}`:''}`:'Hors ligne';
  const cls=live?'live':'offline';
  return `<button class="followBannerCard ${cls}" onclick="openTwitch('${esc(login)}')">${bg?`<img class="followBannerBg" src="${esc(bg)}" alt="" loading="lazy">`:`<div class="followBannerFallback"></div>`}<div class="followBannerTop"><span class="followBannerStatus ${cls}">${esc(status)}</span></div><div class="followBannerBody"><div class="followBannerAvatar">${avatar?`<img src="${esc(avatar)}" alt="">`:esc((name||login||'?').slice(0,1).toUpperCase())}</div><div class="followBannerText"><b>${esc(name||login||'Streamer')}</b><span>${esc(game)}</span></div></div></button>`;
}

async function renderCompactFollowed(){
  const box=$('#followedWrapCompact'); if(!box) return;
  if(!state.session.twitch){ box.innerHTML=`<div class="proNotice">Connecte Twitch pour voir tes suivis avec leur logo et leur statut.</div>`; return; }
  box.innerHTML='<div class="proNotice">Chargement des suivis Twitch…</div>';
  try{
    let r=await api('/api/twitch/followed/status').catch(()=>null);
    if(!r || !r.success) r=await api('/api/twitch/followed/live').catch(()=>null);
    if(!r || !r.success) r=await api('/followed_streams').catch(()=>null);
    const items=(r?.items||r?.streams||[]).filter(Boolean);
    if(!items.length){ box.innerHTML='<div class="proNotice">Aucun suivi trouvé. Connecte Twitch avec les autorisations suivis pour afficher la vitrine.</div>'; return; }
    const sorted=items.slice().sort((a,b)=>(Number(!!(b.is_live||b.live||proViewersOf(b)>0))-Number(!!(a.is_live||a.live||proViewersOf(a)>0))) || (proViewersOf(b)-proViewersOf(a)) || proNameOf(a).localeCompare(proNameOf(b)));
    box.innerHTML=`<div class="followBannerRail">${sorted.slice(0,18).map(followBannerCard).join('')}</div>`;
  }catch(e){ box.innerHTML='<div class="proNotice">Impossible de charger tes suivis Twitch.</div>'; }
}

async function searchTwitch(){
  const q=$('#twSearch')?.value?.trim(); if(!q)return;
  const box=$('#twResults'); if(box) box.innerHTML='<div class="proNotice">Recherche…</div>';
  const r=await api('/api/twitch/channels/search?'+qs({q,live:false})).catch(()=>({items:[]}));
  if(!box) return;
  const items=r.items||[];
  box.innerHTML=items.length?`<div class="followBannerSearch">${items.map(followBannerCard).join('')}</div>`:'<div class="proNotice">Aucun résultat.</div>';
}

function catCard(c){
  const name=String(c?.name||'Catégorie');
  const img=String(c?.box_art_url||c?.image_url||'').replace('{width}','420').replace('{height}','560');
  return `<button class="categoryCard" onclick="pickCatEncoded('${encodeURIComponent(name)}','${encodeURIComponent(img)}')">${img?`<img src="${esc(img)}" alt="">`:`<div style="aspect-ratio:16/9;display:grid;place-items:center;background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(34,211,238,.12));color:#cbd5e1">${esc(name.slice(0,1))}</div>`}<b>${esc(name)}</b><span class="small">Trouver un live</span></button>`;
}
function pickCatEncoded(name,img){return pickCat(decodeURIComponent(name||''), decodeURIComponent(img||''));}
async function pickCat(name,img=''){
  await setView('categories');
  const target=$('#catPick'); if(!target) return;
  const safeName=String(name||'Jeu');
  const safeImg=String(img||'').replace('{width}','640').replace('{height}','854');
  target.innerHTML=`<section class="categoryPickHero">${safeImg?`<img class="catBg" src="${esc(safeImg)}" alt="">`:''}<div class="categoryPickContent"><span class="eyebrow"><i class="dot"></i>Jeu sélectionné</span><h2>${esc(safeName)}</h2><p>Oryon cherche un petit live dans cette catégorie, pas un flux saturé.</p><div class="homeTagCloud"><span class="homeTag">petit live</span><span class="homeTag">chat lisible</span><span class="homeTag">${esc(safeName)}</span></div><div class="categoryPickLive"><div class="proNotice">Recherche d’une pépite…</div></div></div></section>`;
  try{
    const r=await api('/api/twitch/random-small-live?'+qs({game:safeName,max:200,language:'fr'}));
    const liveBox=target.querySelector('.categoryPickLive');
    if(r.success&&r.target){
      liveBox.innerHTML=liveCard({...r.target,platform:'twitch',login:r.target.login,display_name:r.target.name,viewer_count:r.target.viewers,game_name:r.target.game,thumbnail_url:r.target.thumbnail_url});
    }else{
      liveBox.innerHTML=`<div class="proNotice">${esc(r.error||'Aucun live trouvé pour cette catégorie.')}</div>`;
    }
  }catch(e){
    const liveBox=target.querySelector('.categoryPickLive'); if(liveBox) liveBox.innerHTML='<div class="proNotice">Impossible de chercher un live pour ce jeu.</div>';
  }
}

async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML='<div class="proNotice">Sélection des lives recommandés…</div>';
  try{
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    let twitch=await api('/api/twitch/streams/small?lang=fr&min=15&max=30').catch(()=>({items:[]}));
    if(!(twitch.items||[]).length) twitch=await api('/api/twitch/streams/small?lang=fr&min=5&max=80').catch(()=>({items:[]}));
    let items=[...(native.items||[]).map(x=>({...x,platform:'oryon'})),...(twitch.items||[]).map(x=>({...x,platform:'twitch'}))];
    items=items.filter(x=>{const v=Number(x.viewer_count??x.viewers??0)||0; return v>=0 && v<=100;});
    items.sort((a,b)=>{
      const av=Number(a.viewer_count??a.viewers??0)||0, bv=Number(b.viewer_count??b.viewers??0)||0;
      const as=(av>=15&&av<=30?80:av>=5&&av<=50?45:0)+Math.min(30,Number(a.chat_messages||0));
      const bs=(bv>=15&&bv<=30?80:bv>=5&&bv<=50?45:0)+Math.min(30,Number(b.chat_messages||0));
      return bs-as || Math.abs(av-22)-Math.abs(bv-22);
    });
    items=items.slice(0,3);
    if(!items.length){
      box.innerHTML=`<div class="proNotice">Pas assez de lives recommandables maintenant. “Propose-moi un live” lance quand même une recherche directe.</div>`;
      return;
    }
    box.innerHTML=items.map(homeRecommendationCard).join('');
  }catch(e){
    box.innerHTML='<div class="proNotice">Impossible de charger la vitrine pour le moment.</div>';
  }
}

/* Home vitrine + mobile creator final pass */
(function injectHomeOryonVitrinePass(){
  if(document.getElementById('oryonHomeOryonVitrinePass')) return;
  const st=document.createElement('style');
  st.id='oryonHomeOryonVitrinePass';
  st.textContent=`
  .homeShowcase{margin-top:18px!important;padding:0!important;overflow:hidden!important}
  .homeShowcaseInner.vitrineFinal{display:grid!important;grid-template-columns:1fr!important;gap:20px!important;padding:26px!important;align-items:stretch!important}
  .homeVitrineTop{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr);gap:24px;align-items:stretch}
  .homeShowcaseCopy.final{padding:8px 2px;gap:18px;min-width:0}
  .homeShowcaseCopy.final h1{font-size:clamp(44px,5.8vw,82px);line-height:.92;letter-spacing:-.075em;margin:10px 0 12px}
  .homeShowcaseCopy.final p{font-size:clamp(16px,1.45vw,21px);line-height:1.38;color:#d8e2f5;max-width:640px}
  .homeShowcaseActions.final{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
  .homeShowcaseActions.final .btn{min-height:58px;font-size:16px;border-radius:16px;display:flex;align-items:center;justify-content:center;text-align:center}
  .homeShowcaseActions.final .btn.streamBtn{background:linear-gradient(135deg,var(--brand),#bd46ff)!important;border:0!important;box-shadow:0 18px 52px rgba(139,92,246,.24)}
  .homeLiveCarousel{display:flex!important;gap:16px!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;padding:2px 2px 14px!important;min-height:auto!important}
  .homeLiveCarousel::-webkit-scrollbar,.oryonLiveBand::-webkit-scrollbar{height:7px}.homeLiveCarousel::-webkit-scrollbar-thumb,.oryonLiveBand::-webkit-scrollbar-thumb{background:rgba(148,163,184,.35);border-radius:999px}
  .homeSlideCard{position:relative;overflow:hidden;border:1px solid rgba(148,163,184,.20);border-radius:28px;background:#050914;min-width:min(760px,72vw);width:min(760px,72vw);aspect-ratio:16/9;scroll-snap-align:center;cursor:pointer;isolation:isolate;box-shadow:0 24px 75px rgba(0,0,0,.34);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
  .homeSlideCard:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.72);box-shadow:0 28px 90px rgba(0,0,0,.44)}
  .homeSlideCard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.02);filter:saturate(1.08) contrast(1.02)}
  .homeSlideCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.12) 38%,rgba(2,6,23,.92));z-index:1}
  .homeSlideBody{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:22px;display:grid;gap:12px}
  .homeSlideBody h2{margin:0;font-size:clamp(24px,3vw,42px);line-height:1.02;letter-spacing:-.05em;text-shadow:0 5px 24px rgba(0,0,0,.5)}
  .homeSlideBody p{margin:0;color:#cbd5e1;font-weight:900;font-size:15px}
  .homeSlideCard.oryonPromo{background:radial-gradient(circle at 18% 12%,rgba(139,92,246,.48),transparent 38%),radial-gradient(circle at 88% 20%,rgba(34,211,238,.28),transparent 34%),linear-gradient(135deg,#111827,#060913)}
  .homeSlideCard.oryonPromo:before{content:"ORYON LIVE";position:absolute;right:22px;top:18px;z-index:2;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 11px;background:rgba(2,6,23,.48);font-weight:1000;font-size:12px;letter-spacing:.04em}
  .homeSlideCard.oryonPromo .homeSlideBody{top:0;justify-content:end;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(2,6,23,.72))}
  .homeSlideCard.oryonPromo h2{font-size:clamp(32px,4vw,56px)}
  .oryonLiveBandWrap{border:1px solid rgba(148,163,184,.18);border-radius:28px;background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(15,23,42,.34));padding:18px;overflow:hidden}
  .oryonLiveBandHead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
  .oryonLiveBandHead h2{margin:0;font-size:clamp(24px,2.6vw,36px);letter-spacing:-.045em}.oryonLiveBandHead p{margin:6px 0 0;color:#aab6ca}
  .oryonLiveBand{display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity}
  .oryonMiniLive{min-width:260px;width:260px;aspect-ratio:16/9;border-radius:22px;overflow:hidden;border:1px solid rgba(148,163,184,.18);background:linear-gradient(135deg,rgba(139,92,246,.34),rgba(34,211,238,.13)),#090d17;position:relative;text-align:left;color:white;padding:0;scroll-snap-align:start}
  .oryonMiniLive img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.oryonMiniLive:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(2,6,23,.86))}.oryonMiniBody{position:absolute;z-index:2;left:14px;right:14px;bottom:14px}.oryonMiniBody b{display:block;font-size:17px}.oryonMiniBody span{display:block;color:#cbd5e1;font-size:13px;margin-top:4px}.oryonMiniLive.create{display:grid;place-items:end start;padding:16px}.oryonMiniLive.create:after{display:none}.oryonMiniLive.create b{font-size:24px;line-height:1.05}.oryonMiniLive.create span{font-size:14px;color:#dbeafe;margin-top:8px}
  .moodFirstPanelHead p{display:none!important}.moodFirstPanelHead h2{margin-bottom:0!important}.moodFirstHero p{max-width:760px}
  .menu{top:calc(100% + 10px)!important;right:0!important;left:auto!important;z-index:240!important}.menu.open{display:block!important}.menu .sep{margin:8px 0!important}
  .creatorLayout{max-width:1380px;margin-inline:auto}.creatorSide{z-index:30}.creatorSide p.small{display:none}
  @media(max-width:1080px){
    .homeVitrineTop{grid-template-columns:1fr!important}.homeShowcaseInner.vitrineFinal{padding:18px!important}.homeShowcaseCopy.final h1{font-size:clamp(40px,12vw,72px)}.homeShowcaseActions.final{grid-template-columns:1fr!important}.homeSlideCard{min-width:86vw;width:86vw;aspect-ratio:16/9;border-radius:24px}.homeSlideBody{padding:16px}.oryonLiveBandWrap{border-radius:24px;padding:14px}.oryonLiveBandHead{align-items:flex-start;flex-direction:column}.oryonMiniLive{min-width:78vw;width:78vw}.homeTwoGrid{grid-template-columns:1fr!important}.homeSectionHead{display:none!important}
    .userArea{position:static!important}.menu{position:fixed!important;top:74px!important;left:12px!important;right:12px!important;width:auto!important;max-height:calc(100vh - 150px)!important;overflow:auto!important;border-radius:22px!important;padding:10px!important}.menu button{min-height:48px;font-size:15px!important}
    .creatorLayout{display:grid!important;grid-template-columns:1fr!important;gap:14px!important}.creatorSide{position:sticky!important;top:70px!important;border-radius:0 0 20px 20px!important;margin:-16px -16px 12px!important;padding:10px 12px!important;display:flex!important;gap:8px!important;overflow-x:auto!important;background:rgba(8,11,18,.96)!important;backdrop-filter:blur(16px)!important;border-left:0!important;border-right:0!important}.creatorSide h3,.creatorSide .sep{display:none!important}.creatorSide button{min-width:max-content!important;width:auto!important;padding:11px 13px!important;border:1px solid rgba(148,163,184,.18)!important;background:rgba(255,255,255,.045)!important}.creatorSide button.active{background:rgba(139,92,246,.24)!important;border-color:rgba(139,92,246,.55)!important}
    .managerGrid,.streamHero,.dashGrid,.plannerForm,.three,.two,.four{grid-template-columns:1fr!important}.pageHead{display:grid!important;gap:10px}.pageHead .row{display:grid!important;grid-template-columns:1fr!important}.pageHead .btn,.managerHero .btn{width:100%;min-height:52px}.panel{padding:16px!important}.app{padding-inline:14px!important}
  }
  @media(max-width:520px){.homeSlideCard{min-width:90vw;width:90vw}.homeSlideBody h2{font-size:24px}.homeTag,.signalTag{font-size:11px!important}.oryonMiniLive{min-width:84vw;width:84vw}.homeShowcaseCopy.final p{font-size:16px}.homeMoodStrip{gap:7px}.homeMoodStrip button{font-size:12px;padding:9px 10px}.moodFirstGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.moodFirstCard{min-height:126px!important}.moodFirstCard i{font-size:24px!important}.moodFirstCard b{font-size:15px!important}.moodFirstCard span{font-size:11px!important}}
  `;
  document.head.appendChild(st);
})();

function streamTargetView(){ return state.session.local ? 'manager' : 'settings'; }
function streamTargetLabel(){ return state.session.local ? 'Streamer sur Oryon' : 'Créer ma chaîne Oryon'; }
function homeStreamPromoCard(size='large'){
  return `<article class="homeSlideCard oryonPromo" onclick="setView('${streamTargetView()}')"><div class="homeSlideBody"><div class="homeTagCloud"><span class="homeTag">Oryon Live</span><span class="homeTag">OBS ou navigateur</span><span class="homeTag">Twitch friendly</span></div><h2>À toi de live.</h2><p>Lance ton stream sur Oryon, garde Twitch à côté, et deviens découvrable sans être noyé.</p><button class="btn streamBtn" onclick="event.stopPropagation();setView('${streamTargetView()}')">${esc(streamTargetLabel())}</button></div></article>`;
}
function oryonMiniLiveCard(x){
  const id=liveIdentity(x||{});
  const img=id.img || x?.offline_image_url || x?.banner_url || '';
  return `<button class="oryonMiniLive" onclick="openOryon('${esc(id.login||x?.room||x?.host_login||'')}')">${img?`<img src="${esc(img)}" alt="" loading="lazy">`:''}<div class="oryonMiniBody"><b>${esc(id.name||'Live Oryon')}</b><span>${esc(id.title||id.game||'En direct sur Oryon')}</span></div></button>`;
}
function oryonCreateMiniCard(){
  return `<button class="oryonMiniLive create" onclick="setView('${streamTargetView()}')"><div><b>À toi de live</b><span>Crée ton live Oryon en navigateur ou avec OBS.</span></div></button>`;
}
function homeRecommendationCard(x,i){
  const id=liveIdentity(x||{}), tags=liveStableTags(x), action=liveOpenAction(x);
  return `<article class="homeSlideCard" onclick="${action}">${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:`<div class="proEmptyMedia">LIVE</div>`}<div class="homeSlideBody"><div class="homeTagCloud">${tags.slice(0,4).map(t=>`<span class="homeTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live recommandé')}</h2><p>${esc(id.name)} · ${id.viewers} viewers</p></div></article>`;
}
async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=homeStreamPromoCard()+`<div class="proNotice">Sélection des lives recommandés…</div>`;
  try{
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    let twitch=await api('/api/twitch/streams/small?lang=fr&min=15&max=30').catch(()=>({items:[]}));
    if(!(twitch.items||[]).length) twitch=await api('/api/twitch/streams/small?lang=fr&min=1&max=80').catch(()=>({items:[]}));
    let nativeItems=(native.items||[]).map(x=>({...x,platform:'oryon'}));
    let twitchItems=(twitch.items||[]).map(x=>({...x,platform:'twitch'}));
    let items=[...nativeItems,...twitchItems].filter(x=>{const v=Number(x.viewer_count??x.viewers??0)||0; return v>=0 && v<=120;});
    items.sort((a,b)=>{
      const av=Number(a.viewer_count??a.viewers??0)||0, bv=Number(b.viewer_count??b.viewers??0)||0;
      const ap=(a.platform==='oryon'?35:0), bp=(b.platform==='oryon'?35:0);
      const as=ap+(av>=15&&av<=30?80:av>=1&&av<=50?48:0)+Math.min(30,Number(a.chat_messages||0));
      const bs=bp+(bv>=15&&bv<=30?80:bv>=1&&bv<=50?48:0)+Math.min(30,Number(b.chat_messages||0));
      return bs-as || Math.abs(av-22)-Math.abs(bv-22);
    });
    const picked=items.slice(0,5);
    box.innerHTML=homeStreamPromoCard()+picked.map(homeRecommendationCard).join('')+(picked.length?'':`<article class="homeSlideCard" onclick="autoProposeLive()"><div class="homeSlideBody"><div class="homeTagCloud"><span class="homeTag">Recherche directe</span><span class="homeTag">petits lives</span></div><h2>Pas de vitrine live maintenant.</h2><p>Oryon peut quand même te proposer un live en un clic.</p><button class="btn" onclick="event.stopPropagation();autoProposeLive()">Propose-moi un live</button></div></article>`);
    const band=$('#oryonLiveBand');
    if(band){ band.innerHTML=oryonCreateMiniCard()+nativeItems.slice(0,8).map(oryonMiniLiveCard).join(''); }
  }catch(e){
    box.innerHTML=homeStreamPromoCard()+`<article class="homeSlideCard" onclick="autoProposeLive()"><div class="homeSlideBody"><h2>Vitrine indisponible.</h2><p>Tu peux lancer une recherche directe.</p><button class="btn" onclick="event.stopPropagation();autoProposeLive()">Propose-moi un live</button></div></article>`;
  }
}
async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<section class="homeShowcase section"><div class="homeShowcaseInner vitrineFinal"><div class="homeVitrineTop"><div class="homeShowcaseCopy final"><div><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Des recommandations visuelles, des petits créateurs, et une vraie place pour lancer ton propre live.</p><div class="homeMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div></div><div class="homeShowcaseActions final"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView()}')">${esc(streamTargetLabel())}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="homeLiveCarousel">${homeStreamPromoCard()}</div></div></div></section>
  <section class="oryonLiveBandWrap section"><div class="oryonLiveBandHead"><div><h2>Live sur Oryon</h2><p>Oryon n’est pas seulement un lecteur Twitch : tu peux aussi streamer ici.</p></div><button class="btn streamBtn" onclick="setView('${streamTargetView()}')">${esc(streamTargetLabel())}</button></div><div id="oryonLiveBand" class="oryonLiveBand">${oryonCreateMiniCard()}</div></section>
  <div class="homeTwoGrid section"><section class="homeImpactPanel"><h2>Trace viewer</h2><div id="viewerImpactBox">${viewerImpactCard()}</div></section><section class="homeFollowPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Tes suivis Twitch</h2><p class="small" style="margin:6px 0 0">Bandeau, miniature, logo et statut live.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact"></div></section></div>`;
  await loadHomeRecommendations();
  await renderCompactFollowed();
  closeMini?.();
}
async function autoProposeLive(){
  state.moodFirstMood = state.moodFirstMood || 'discussion';
  await setView('discover');
  const source=$('#dSource'); if(source) source.value='both';
  const max=$('#dMax'); if(max) max.value='200';
  const lang=$('#dLang'); if(lang) lang.value='fr';
  const mood=$('#dMood'); if(mood) mood.value=state.moodFirstMood;
  await findLive();
}
async function quickGem(){ return autoProposeLive(); }
async function findLive(){
  const mood=state.moodFirstMood || $('#dMood')?.value || 'discussion';
  const q=$('#dQuery')?.value || '';
  const source=$('#dSource')?.value || 'both';
  const max=$('#dMax')?.value || moodFirstMaxFor(mood) || '200';
  const lang=$('#dLang')?.value || 'fr';
  const results=$('#discoverResults'); if(results) results.innerHTML='';
  const zap=$('#zapResult');
  if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Recherche en cours…</h2><p>Oryon élargit si la catégorie est trop vide.</p></div></div>`;
  state.currentTwitch=null; state.discoverPlayer=null; closeMini?.();
  async function tryDiscover(params){
    const r=await api('/api/oryon/discover/find-live?'+qs(params)).catch(()=>({items:[]}));
    return (r.items||[]).filter(x=>(x.platform||'')!=='peertube');
  }
  try{
    let items=await tryDiscover({q,mood,max,lang,source});
    if(!items.length) items=await tryDiscover({q,mood,max:'300',lang,source:'both'});
    if(!items.length) items=await tryDiscover({q:'',mood:'discussion',max:'300',lang,source:'both'});
    if(!items.length){
      const t=await api('/api/twitch/streams/small?lang=fr&min=0&max=300').catch(()=>({items:[]}));
      items=(t.items||[]).map(x=>({...x,platform:'twitch'}));
    }
    state.zap.items=items; state.zap.index=0; state.zap.last={q,mood,max,lang,source}; renderZap();
    if(results) results.innerHTML='';
    if(!items.length && zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Aucun live trouvé.</h2><p>Essaie un autre mood ou relance dans quelques minutes.</p><div class="moodFirstMiniGrid">${AMBIANCES.map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></div>`;
  }catch(e){
    if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><h2>Recherche impossible.</h2><p>Le service de découverte ne répond pas pour le moment.</p></div></div>`;
    console.error(e);
  }
}
async function renderDiscover(){
  const el=$('#discover'); if(!el) return;
  const current=state.moodFirstMood || 'discussion';
  el.innerHTML=`<div class="moodFirst"><section class="moodFirstHero"><div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Choisis ton mood.</h1><p>Un tap lance une vraie proposition. Ensuite tu swipes : droite si ça te parle, gauche si ce n’est pas ta vibe.</p></div><div class="moodFirstHint"><span>mood</span><span>live</span><span>swipe</span></div></section><section class="moodFirstPanel"><div class="moodFirstPanelHead"><div><h2>Ambiance</h2></div>${state.moodFirstMood?`<span class="moodFirstSelected">${esc(moodFirstLabel(state.moodFirstMood))}</span>`:''}</div><div class="moodFirstGrid">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="moodFirstCard ${id===current?'active':''}" data-mood="${esc(id)}" onclick="setDiscoverMood('${esc(id)}')"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div><details class="moodFirstAdvanced"><summary>Options avancées</summary><div class="proSearchLine"><input id="dQuery" placeholder="jeu, pseudo, ambiance" onkeydown="if(event.key==='Enter')findLive()"><select id="dSource"><option value="both" selected>Oryon + Twitch</option><option value="oryon">Oryon</option><option value="twitch">Twitch</option></select><select id="dMood"><option value="${esc(current)}">${esc(moodFirstLabel(current))}</option>${AMBIANCES.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select><select id="dMax"><option value="50">≤50</option><option value="200" selected>≤200</option><option value="300">≤300</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn secondary" onclick="findLive()">Relancer</button></div></details></section><section id="zapResult"></section><section class="proTwitchPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Accès Twitch</h2><p class="small" style="margin:6px 0 0">Recherche manuelle si tu sais déjà qui tu veux voir.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch" onkeydown="if(event.key==='Enter')searchTwitch()"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="followedWrapCompact"></div><div id="twResults"></div></section></div>`;
  const mood=$('#dMood'); if(mood) mood.value=current; const max=$('#dMax'); if(max) max.value='200'; state.proTab=state.proTab||'signal'; renderZap(); renderCompactFollowed?.(); closeMini?.();
}


/* Final product pass — swipe memory, viewer profile, live vitrine 30-100, followed-live banners, channel customization */
(function injectOryonProductFinalPass(){
  if(document.getElementById('oryonProductFinalPass')) return;
  const st=document.createElement('style');
  st.id='oryonProductFinalPass';
  st.textContent=`
  :root{--viewer-accent:var(--brand,#8b5cf6)}
  body{background:radial-gradient(circle at 16% 10%, color-mix(in srgb,var(--viewer-accent) 20%, transparent), transparent 32%), var(--bg,#05070d)!important}
  .homeShowcaseInner.finalReco{display:grid!important;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr)!important;gap:26px!important;align-items:stretch!important;padding:28px!important}
  .homeShowcaseActions.finalReco{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.homeShowcaseActions.finalReco .btn{min-height:60px;border-radius:17px;font-weight:1000}.homeShowcaseActions.finalReco .streamBtn{background:linear-gradient(135deg,var(--viewer-accent),#bd46ff)!important;border:0!important;box-shadow:0 18px 52px color-mix(in srgb,var(--viewer-accent) 30%, transparent)}
  .homeLiveCarousel.finalReco{display:flex!important;gap:18px!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;padding:3px 3px 16px!important;align-items:stretch!important}.homeLiveCarousel.finalReco::-webkit-scrollbar{height:8px}.homeLiveCarousel.finalReco::-webkit-scrollbar-thumb{background:rgba(148,163,184,.38);border-radius:999px}
  .homeSlideCard.finalLive{min-width:min(820px,72vw)!important;width:min(820px,72vw)!important;aspect-ratio:16/9!important;border-radius:30px!important;background:#050914;position:relative;overflow:hidden;border:1px solid color-mix(in srgb,var(--viewer-accent) 38%, rgba(148,163,184,.18));box-shadow:0 28px 90px rgba(0,0,0,.42);scroll-snap-align:center;cursor:pointer}.homeSlideCard.finalLive img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}.homeSlideCard.finalLive:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.03),rgba(0,0,0,.18) 40%,rgba(2,6,23,.94));z-index:1}.homeSlideCard.finalLive .homeSlideBody{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:24px;display:grid;gap:12px}.homeSlideCard.finalLive h2{font-size:clamp(30px,3.4vw,52px)!important;line-height:.96!important;letter-spacing:-.06em!important;margin:0}.homeSlideCard.finalLive p{margin:0;color:#dbeafe;font-weight:900}.homeTagCloud{display:flex;gap:8px;flex-wrap:wrap}.homeTag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.16);background:rgba(2,6,23,.58);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000;color:#fff;backdrop-filter:blur(10px)}
  .viewerProfilePanel{border:1px solid rgba(148,163,184,.18);border-radius:28px;background:linear-gradient(180deg,rgba(15,23,42,.74),rgba(15,23,42,.36));padding:18px}.viewerProfileHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.viewerProfileHead h2{margin:0;font-size:clamp(24px,2vw,34px);letter-spacing:-.04em}.viewerProfileGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.viewerStat{border:1px solid rgba(148,163,184,.15);border-radius:18px;padding:14px;background:rgba(255,255,255,.045)}.viewerStat span{display:block;color:#aab6ca;font-size:12px}.viewerStat b{display:block;font-size:26px;margin-top:5px}.viewerPrefs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.viewerPref{border:1px solid rgba(34,211,238,.32);background:rgba(34,211,238,.08);border-radius:999px;padding:7px 10px;font-weight:1000;font-size:12px;color:#e0f7ff}.viewerHistory{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.viewerHistory .sparkCard{margin:0}.themeControl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.themeControl input[type=color]{width:44px;height:36px;border:0;border-radius:12px;background:transparent;padding:0;overflow:hidden}
  .proFollowLiveRail{display:flex;gap:16px;overflow-x:auto;padding:4px 2px 12px;scroll-snap-type:x proximity}.proFollowLiveRail::-webkit-scrollbar{height:8px}.proFollowLiveRail::-webkit-scrollbar-thumb{background:rgba(148,163,184,.38);border-radius:999px}.followLiveBanner{position:relative;min-width:310px;width:310px;aspect-ratio:16/9;border-radius:24px;overflow:hidden;border:1px solid rgba(148,163,184,.18);background:#070b14;text-align:left;color:#fff;scroll-snap-align:start;box-shadow:0 18px 50px rgba(0,0,0,.28)}.followLiveBanner>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.08)}.followLiveBanner:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(2,6,23,.88));z-index:1}.followLiveBody{position:absolute;z-index:2;left:14px;right:14px;bottom:14px;display:grid;gap:8px}.followLiveTop{position:absolute;z-index:3;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;gap:8px}.followAvatar{width:46px;height:46px;border-radius:15px;border:2px solid rgba(255,255,255,.26);object-fit:cover;background:#111827}.liveDot{display:inline-flex;border-radius:999px;padding:7px 10px;background:rgba(16,185,129,.86);font-size:12px;font-weight:1000;box-shadow:0 10px 28px rgba(16,185,129,.24)}.followLiveBody b{font-size:20px;line-height:1.05}.followLiveBody span{color:#dbeafe;font-size:13px;font-weight:850}.followEmpty{border:1px dashed rgba(148,163,184,.28);border-radius:20px;padding:18px;color:#aab6ca;background:rgba(255,255,255,.025)}
  .swipeStamp{position:absolute!important;left:50%!important;top:50%!important;z-index:8!important;transform:translate(-50%,-50%) scale(.86) rotate(0deg)!important;opacity:0!important;border:4px solid currentColor!important;border-radius:24px!important;padding:18px 28px!important;background:rgba(2,6,23,.72)!important;backdrop-filter:blur(12px)!important;font-size:clamp(34px,9vw,72px)!important;line-height:1!important;font-weight:1000!important;text-transform:uppercase!important;letter-spacing:-.04em!important;box-shadow:0 24px 90px rgba(0,0,0,.48);pointer-events:none}.swipeStamp.like{color:#22c55e!important}.swipeStamp.nope{color:#fb7185!important}.proCard.swipe-like .swipeStamp.like,.proCard.swipe-nope .swipeStamp.nope{opacity:1!important;transform:translate(-50%,-50%) scale(1) rotate(-3deg)!important}.proCard.swipe-like:before,.proCard.swipe-nope:before{content:"";position:absolute;inset:0;z-index:7;pointer-events:none}.proCard.swipe-like:before{background:radial-gradient(circle at center,rgba(34,197,94,.22),transparent 55%)}.proCard.swipe-nope:before{background:radial-gradient(circle at center,rgba(251,113,133,.22),transparent 55%)}
  .signalTagCloud.profileTags{margin-top:12px}.proProfileFull{display:grid;gap:12px}.likedChannels{display:grid;gap:8px}.likedChannels .savedChip{border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;background:rgba(255,255,255,.04)}
  .channelPage.viewerTint{background:radial-gradient(circle at 14% 6%, color-mix(in srgb,var(--viewer-accent) 24%, transparent), transparent 28%), linear-gradient(180deg,rgba(15,23,42,.62),rgba(2,6,23,.18));border-radius:30px;padding:18px}.channelPage .channelBanner{height:clamp(260px,34vw,520px)!important;border-radius:30px!important;overflow:hidden!important;background:#050914!important}.channelPage .channelBanner img,.channelPage .bannerFallback{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}.channelPage .watchShell.channelWatch.clean{grid-template-columns:1fr!important;gap:16px!important}.channelPage .watchMain{width:100%!important}.channelPage .player.premiumPlayer.oryonMainPlayer,.channelPage .premiumPlayer.oryonMainPlayer{min-height:clamp(420px,56vw,880px)!important;aspect-ratio:16/9!important;border-radius:28px!important}.channelCustomizer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid rgba(148,163,184,.18);border-radius:22px;background:rgba(15,23,42,.54);padding:14px 16px;margin:14px 0}.channelCustomizer h3{margin:0;font-size:18px}.channelCustomizer p{margin:4px 0 0;color:#aab6ca;font-size:13px}.channelCustomizer .btn{min-height:42px}.channelSideClean{grid-template-columns:1fr!important}.nativeFixedChat.compact{max-height:none!important}
  @media(max-width:1080px){.homeShowcaseInner.finalReco{grid-template-columns:1fr!important;padding:18px!important}.homeSlideCard.finalLive{min-width:88vw!important;width:88vw!important}.homeShowcaseActions.finalReco{grid-template-columns:1fr!important}.viewerProfileGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.viewerHistory{grid-template-columns:repeat(2,minmax(0,1fr))}.followLiveBanner{min-width:78vw;width:78vw}.channelPage.viewerTint{padding:10px;border-radius:22px}.channelPage .channelBanner{height:260px!important;border-radius:22px!important}.channelCustomizer{display:grid}.channelPage .player.premiumPlayer.oryonMainPlayer,.channelPage .premiumPlayer.oryonMainPlayer{min-height:auto!important;width:100%!important}}
  @media(max-width:560px){.homeSlideCard.finalLive{min-width:90vw!important;width:90vw!important;border-radius:24px!important}.homeSlideCard.finalLive .homeSlideBody{padding:16px}.homeSlideCard.finalLive h2{font-size:26px!important}.viewerProfileGrid{grid-template-columns:1fr 1fr}.viewerStat b{font-size:24px}.followLiveBanner{min-width:84vw;width:84vw}.swipeStamp{font-size:clamp(38px,13vw,68px)!important;padding:16px 22px!important}.channelPage .channelBanner{height:220px!important}}
  `;
  document.head.appendChild(st);
})();

function viewerUserKey(){
  const u=state.session?.local?.login || state.session?.local?.id || 'guest';
  return 'oryon_viewer_profile_v2:'+String(u).toLowerCase();
}
function viewerSeenKey(){
  const u=state.session?.local?.login || state.session?.local?.id || 'guest';
  return 'oryon_seen_lives_v2:'+String(u).toLowerCase();
}
function readJsonSafe(k,fb){try{return JSON.parse(localStorage.getItem(k)||'')||fb}catch{return fb}}
function writeJsonSafe(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function liveKeyOf(x){const id=liveIdentity(x||{}); return `${id.platform}:${String(id.login||id.name||id.title||'').toLowerCase()}`;}
function viewerProfileV2(){
  const old=loadViewerImpact?.()||{};
  const p=readJsonSafe(viewerUserKey(),null)||{};
  p.aura=Number(p.aura ?? old.points ?? 0);
  p.discoveries=Array.isArray(p.discoveries)?p.discoveries:(old.discoveries||[]);
  p.saved=Array.isArray(p.saved)?p.saved:savedLives?.()||[];
  p.supports=Array.isArray(p.supports)?p.supports:(old.firstSupports||[]);
  p.badges=Array.isArray(p.badges)?p.badges:(old.badges||['Explorateur']);
  p.likedChannels=Array.isArray(p.likedChannels)?p.likedChannels:[];
  p.rejectedChannels=Array.isArray(p.rejectedChannels)?p.rejectedChannels:[];
  p.likedCategories=Array.isArray(p.likedCategories)?p.likedCategories:[];
  p.moodCounts=p.moodCounts&&typeof p.moodCounts==='object'?p.moodCounts:{};
  return p;
}
function saveViewerProfileV2(p){writeJsonSafe(viewerUserKey(),p)}
function markLiveSeen(x,action='seen'){
  if(!x) return;
  const id=liveIdentity(x), key=liveKeyOf(x);
  if(!id.login && !id.name) return;
  const seen=readJsonSafe(viewerSeenKey(),{});
  seen[key]={key,action,platform:id.platform,login:id.login,name:id.name,title:id.title,game:id.game,img:id.img,ts:Date.now()};
  writeJsonSafe(viewerSeenKey(),seen);
  const p=viewerProfileV2();
  p.aura=Number(p.aura||0)+(action==='like'?6:action==='open'?4:1);
  p.moodCounts[state.moodFirstMood||'general']=Number(p.moodCounts[state.moodFirstMood||'general']||0)+1;
  const channel={key,platform:id.platform,login:id.login,name:id.name,game:id.game,img:id.img,ts:Date.now()};
  if(action==='like' || action==='open'){
    p.likedChannels=[channel,...p.likedChannels.filter(c=>c.key!==key)].slice(0,48);
    if(id.game) p.likedCategories=[id.game,...p.likedCategories.filter(g=>String(g).toLowerCase()!==String(id.game).toLowerCase())].slice(0,16);
  }
  if(action==='nope') p.rejectedChannels=[channel,...p.rejectedChannels.filter(c=>c.key!==key)].slice(0,80);
  p.discoveries=[channel,...(p.discoveries||[]).filter(c=>c.key!==key)].slice(0,60);
  p.saved=savedLives?.()||p.saved||[];
  saveViewerProfileV2(p);
}
function isLiveSeen(x){return !!readJsonSafe(viewerSeenKey(),{})[liveKeyOf(x)]}
function filterUnseen(items){return (items||[]).filter(x=>!isLiveSeen(x));}
function moodTermsFor(mood){
  return {
    chill:['chill','calme','relax','cozy','music','musique','détente','detente','art','dessin','just chatting'],
    discussion:['just chatting','discussion','talk','tchat','chat','irl','conversation','débat','debat','questions'],
    'nuit-calme':['nuit','late','calme','chill','asmr','cozy','music','lofi','relax'],
    'rp':['rp','roleplay','gta rp','jdr','dnd','donjons','narration','personnage','pirate'],
    'decouverte-jeu':['découverte','decouverte','blind','first play','exploration','nouveau jeu','lets play','let\'s play'],
    'petite-commu':['petit','small','commu','chill','discussion','nouveau','fr']
  }[mood]||[];
}
function moodScoreItem(x,mood){
  const id=liveIdentity(x); const v=Number(id.viewers||0); const text=[id.title,id.game,id.name,x.tags?.join?.(' ')||'',x.category||'',x.game_name||''].join(' ').toLowerCase();
  const terms=moodTermsFor(mood); let score=0;
  for(const t of terms){ if(text.includes(String(t).toLowerCase())) score+=24; }
  if(mood==='petite-commu'){ if(v>=3&&v<=80)score+=80; if(v>=15&&v<=50)score+=40; if(v>120)score-=100; }
  else { if(v>=15&&v<=120)score+=26; if(v>300)score-=80; }
  if(mood==='discussion' && /just chatting|discussion|irl|talk|chat/.test(text)) score+=70;
  if(mood==='chill' && /chill|calme|relax|music|musique|cozy/.test(text)) score+=55;
  if(mood==='nuit-calme' && /late|nuit|asmr|lofi|calme|chill/.test(text)) score+=55;
  if(mood==='rp' && /\brp\b|roleplay|jdr|dnd|gta rp|narr/.test(text)) score+=70;
  if(mood==='decouverte-jeu' && !/just chatting/.test(text)) score+=28;
  score += Math.min(40, Number(x.chat_messages||x.message_count||0));
  score += Math.max(0, 30-Math.abs(v-45)/3);
  return score;
}
function sortByMood(items,mood){return [...(items||[])].sort((a,b)=>moodScoreItem(b,mood)-moodScoreItem(a,mood));}
function moodQueryFor(mood){
  return {chill:'chill',discussion:'Just Chatting','nuit-calme':'chill','rp':'RP','decouverte-jeu':'','petite-commu':''}[mood]||'';
}
async function setDiscoverMood(id){
  const normalized=id||'discussion'; state.moodFirstMood=normalized;
  const mood=$('#dMood'); if(mood) mood.value=normalized;
  const query=$('#dQuery'); if(query && !query.value) query.value=moodQueryFor(normalized);
  $$('.moodFirstCard,.proMoodBtn').forEach(btn=>btn.classList.toggle('active', btn.dataset.mood===normalized));
  const zap=$('#zapResult'); if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(normalized))}</span><h2>Je cherche un live vraiment dans cette vibe…</h2><p>Priorité au chat actif, aux petits créateurs et aux titres cohérents.</p></div></div>`;
  clearSpotlightPlayer?.(); closeMini?.();
  requestAnimationFrame(()=>document.getElementById('zapResult')?.scrollIntoView({block:'start',behavior:'smooth'}));
  return findLive();
}
async function findLive(){
  const mood=state.moodFirstMood || $('#dMood')?.value || 'discussion';
  const q=($('#dQuery')?.value || moodQueryFor(mood) || '').trim();
  const source=$('#dSource')?.value || 'both';
  const max=$('#dMax')?.value || (mood==='petite-commu'?'80':'180');
  const lang=$('#dLang')?.value || 'fr';
  const zap=$('#zapResult');
  if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Recherche en cours…</h2><p>Oryon trie selon ton mood, puis retire ce que tu as déjà swipé.</p></div></div>`;
  state.currentTwitch=null; state.discoverPlayer=null; closeMini?.();
  async function call(params){const r=await api('/api/oryon/discover/find-live?'+qs(params)).catch(()=>({items:[]}));return (r.items||[]).filter(x=>(x.platform||'')!=='peertube');}
  try{
    let items=await call({q,mood,max,lang,source});
    if(items.length<4) items=[...items,...await call({q:'',mood,max:mood==='petite-commu'?'120':'220',lang,source:'both'})];
    if(items.length<4){const t=await api(`/api/twitch/streams/small?lang=${encodeURIComponent(lang)}&min=0&max=${encodeURIComponent(mood==='petite-commu'?'120':'250')}`).catch(()=>({items:[]}));items=[...items,...(t.items||[]).map(x=>({...x,platform:'twitch'}))];}
    const seenFiltered=filterUnseen(items);
    items=sortByMood(seenFiltered,mood);
    const dedupe=[]; const keys=new Set();
    for(const it of items){const k=liveKeyOf(it); if(!keys.has(k)){keys.add(k); dedupe.push(it)}}
    state.zap.items=dedupe.slice(0,18); state.zap.index=0; state.zap.last={q,mood,max,lang,source};
    renderZap();
    if(!state.zap.items.length && zap) zap.innerHTML=`<div class="moodFirstStart"><div><span class="moodFirstSelected">${esc(moodFirstLabel(mood))}</span><h2>Tu as déjà vu les propositions disponibles.</h2><p>Change de mood, attends de nouveaux lives, ou ouvre la recherche manuelle.</p><div class="moodFirstMiniGrid">${AMBIANCES.map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></div>`;
  }catch(e){ if(zap) zap.innerHTML=`<div class="moodFirstStart"><div><h2>Recherche impossible.</h2><p>Le service de découverte ne répond pas pour le moment.</p></div></div>`; console.error(e); }
}
function renderSpotlightPreview(x){
  if(!x){return `<article class="moodFirstStart"><div><span class="eyebrow"><i class="dot"></i>Découvrir</span><h2>Choisis ton mood. Oryon choisit le live.</h2><p>Un tap lance la recherche. Ensuite : droite j’aime, gauche pas ouf.</p><div class="moodFirstMiniGrid">${AMBIANCES.slice(0,4).map(([id,label])=>`<button onclick="setDiscoverMood('${esc(id)}')">${esc(label)}</button>`).join('')}</div></div></article>`;}
  const id=liveIdentity(x), tags=signalTagsFor?.(x).slice(0,5)||discoverReasonFor(x).slice(0,4);
  return `<article class="proCard" data-swipe-card="1"><div class="swipeStamp like">J'aime</div><div class="swipeStamp nope">Pas ouf</div><div class="proMedia">${id.img?`<img src="${esc(id.img)}" alt="" loading="eager">`:`<div class="proEmptyMedia">LIVE ${esc(platformLabel(id.platform)).toUpperCase()}</div>`}</div>
    <div class="proBadgeTop"><span class="proPill">${esc(platformLabel(id.platform))} · ${id.viewers} viewers</span></div>
    <div class="proOverlay"><div class="proReasons">${tags.map(r=>`<span class="proPill">${esc(r)}</span>`).join('')}</div><h2>${esc(id.title||'Live en cours')}</h2><p class="muted">${esc(id.name||id.login||'Streamer')}</p><div class="swipeHint">Droite : j’aime · gauche : pas ouf</div>
      <div class="proActions"><button class="btn good" onclick="zapOpenCurrent()">Regarder</button><button class="btn secondary" onclick="proSwipeLeft()">Pas ouf</button><button class="btn secondary" onclick="proSwipeRight()">J'aime</button></div>
    </div></article>`;
}
function proSwipeRight(){
  const x=currentZapItem?.() || (state.zap.items||[])[state.zap.index];
  if(!x) return findLive();
  markLiveSeen(x,'like'); saveCurrentLive?.(); toast?.('J’aime — on ne te le reproposera plus');
  setTimeout(()=>zapNext(),120);
}
function proSwipeLeft(){
  const x=currentZapItem?.() || (state.zap.items||[])[state.zap.index];
  if(!x) return findLive();
  markLiveSeen(x,'nope'); clearSpotlightPlayer?.(); closeMini?.(); toast?.('Pas ouf — retiré de tes propositions');
  setTimeout(()=>zapNext(),80);
}
function zapNext(){
  const items=state.zap.items||[];
  if(!items.length) return findLive();
  let tries=0;
  do{state.zap.index=(state.zap.index+1)%items.length; tries++;}while(tries<items.length && isLiveSeen(items[state.zap.index]));
  if(tries>=items.length && isLiveSeen(items[state.zap.index])) return findLive();
  state.currentTwitch=null; state.discoverPlayer=null; clearSpotlightPlayer?.(); closeMini?.(); renderZap();
}
function zapOpenCurrent(){
  const x=currentZapItem?.() || (state.zap.items||[])[state.zap.index]; if(!x) return;
  markLiveSeen(x,'open'); trackDiscovery?.(x);
  const id=liveIdentity(x);
  if(id.platform==='twitch'){ state.discoverPlayer={type:'twitch',login:id.login}; closeMini?.(); renderZap(); } else openOryon(id.login);
}
function bindProSwipe(){
  const card=document.querySelector('.proCard[data-swipe-card="1"]'); if(!card || card.__oryonSwipeBoundFinal) return; card.__oryonSwipeBoundFinal=true;
  let startX=0,startY=0,dx=0,dy=0,dragging=false;
  const start=e=>{if(e.target.closest('button,a,input,select,textarea'))return; const p=e.touches?e.touches[0]:e; startX=p.clientX; startY=p.clientY; dx=0; dy=0; dragging=true; card.style.transition='none';};
  const move=e=>{if(!dragging)return; const p=e.touches?e.touches[0]:e; dx=p.clientX-startX; dy=p.clientY-startY; if(Math.abs(dx)<8)return; if(Math.abs(dx)>Math.abs(dy)*1.12 && e.cancelable)e.preventDefault(); const rot=Math.max(-9,Math.min(9,dx/18)); card.style.transform=`translateX(${dx}px) rotate(${rot}deg)`; card.classList.toggle('swipe-like',dx>36); card.classList.toggle('swipe-nope',dx<-36);};
  const end=()=>{if(!dragging)return; dragging=false; card.style.transition='transform .18s ease, opacity .18s ease'; const threshold=Math.min(120,Math.max(70,window.innerWidth*.18)); if(dx>threshold){card.classList.add('swipe-like'); card.style.transform='translateX(120vw) rotate(10deg)'; card.style.opacity='.2'; return setTimeout(proSwipeRight,130);} if(dx<-threshold){card.classList.add('swipe-nope'); card.style.transform='translateX(-120vw) rotate(-10deg)'; card.style.opacity='.2'; return setTimeout(proSwipeLeft,130);} card.style.transform=''; card.classList.remove('swipe-like','swipe-nope');};
  card.addEventListener('touchstart',start,{passive:true}); card.addEventListener('touchmove',move,{passive:false}); card.addEventListener('touchend',end,{passive:true}); card.addEventListener('pointerdown',start); window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',end);
}
function viewerProfileCard(){
  const p=viewerProfileV2(); const saved=savedLives?.()||[]; const liked=(p.likedChannels||[]).slice(0,4); const cats=(p.likedCategories||[]).slice(0,6); const moods=Object.entries(p.moodCounts||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([m])=>moodFirstLabel?.(m)||m);
  return `<div class="viewerProfilePanel"><div class="viewerProfileHead"><div><h2>Profil Viewer</h2><p class="small">Tes goûts Oryon + Twitch, tes pépites, tes chaînes aimées.</p></div><div class="themeControl"><span class="small">Couleur</span><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}" oninput="setViewerThemeColor(this.value)"></div></div><div class="viewerProfileGrid"><div class="viewerStat"><span>Aura</span><b>${Number(p.aura||0)}</b></div><div class="viewerStat"><span>Pépites vues</span><b>${(p.discoveries||[]).length}</b></div><div class="viewerStat"><span>Sauvées</span><b>${saved.length}</b></div><div class="viewerStat"><span>Chaînes aimées</span><b>${(p.likedChannels||[]).length}</b></div><div class="viewerStat"><span>Pas ouf retirés</span><b>${(p.rejectedChannels||[]).length}</b></div><div class="viewerStat"><span>Soutiens</span><b>${(p.supports||[]).length}</b></div></div><div class="viewerPrefs">${[...moods,...cats].slice(0,10).map(x=>`<span class="viewerPref">${esc(x)}</span>`).join('')||'<span class="viewerPref">À construire</span>'}</div>${liked.length?`<div class="viewerHistory">${liked.map(c=>`<div class="sparkCard"><b>${esc(c.name||c.login)}</b><br><span class="small">${esc(c.game||platformLabel(c.platform))}</span></div>`).join('')}</div>`:'<div class="followEmpty" style="margin-top:12px">Swipe à droite pour remplir ton profil viewer.</div>'}</div>`;
}
function viewerImpactCard(){return viewerProfileCard();}
function viewerCapsuleHtml(){return viewerProfileCard();}
function proProfileTab(){
  const p=viewerProfileV2(); const liked=(p.likedChannels||[]).slice(0,4);
  return `<div class="proProfileFull"><h2 style="margin:0">Profil Viewer</h2><div class="proMetricGrid"><div class="proMetric"><span>Aura</span><b>${Number(p.aura||0)}</b></div><div class="proMetric"><span>Pépites</span><b>${(p.discoveries||[]).length}</b></div><div class="proMetric"><span>Chaînes aimées</span><b>${(p.likedChannels||[]).length}</b></div><div class="proMetric"><span>Retirées</span><b>${(p.rejectedChannels||[]).length}</b></div></div><div class="signalTagCloud profileTags">${(p.likedCategories||[]).slice(0,6).map(c=>`<span class="signalTag">${esc(c)}</span>`).join('')||'<span class="signalTag">Préférences à apprendre</span>'}</div>${liked.length?`<div class="likedChannels">${liked.map(c=>`<div class="savedChip"><b>${esc(c.name||c.login)}</b><span>${esc(c.game||platformLabel(c.platform))}</span></div>`).join('')}</div>`:''}</div>`;
}
function followedThumb(x){return x.thumbnail_url?thumbT({...x,thumbnail_url:x.thumbnail_url}):(x.profile_image_url||x.avatar_url||x.box_art_url||'');}
async function renderCompactFollowed(){
  const box=$('#followedWrapCompact'); if(!box) return;
  if(!state.session.twitch){box.innerHTML=`<div class="followEmpty">Connecte Twitch pour afficher uniquement tes suivis en ligne.</div>`;return;}
  box.innerHTML='<div class="followEmpty">Chargement des suivis en live…</div>';
  try{
    let r=await api('/api/twitch/followed/status').catch(()=>null); if(!r || !r.success) r=await api('/api/twitch/followed/live').catch(()=>null); if(!r || !r.success) r=await api('/followed_streams').catch(()=>null);
    let items=(r?.items||r?.streams||[]).filter(Boolean).filter(x=>!!(x.is_live||x.live||Number(x.viewer_count||x.viewers||0)>0));
    if(!items.length){box.innerHTML='<div class="followEmpty">Aucun de tes suivis Twitch n’est en live actuellement.</div>';return;}
    box.innerHTML=`<div class="proFollowLiveRail">${items.slice(0,20).map(x=>{const login=proLoginOf?.(x)||x.user_login||x.login||x.broadcaster_login||''; const name=proNameOf?.(x)||x.user_name||x.display_name||x.broadcaster_name||login; const viewers=proViewersOf?.(x)||x.viewer_count||x.viewers||0; const game=x.game_name||x.category||'Live'; const thumb=followedThumb(x); const avatar=x.profile_image_url||x.avatar_url||x.logo||thumb; return `<button class="followLiveBanner" onclick="openTwitch('${esc(login)}')">${thumb?`<img src="${esc(thumb)}" alt="" loading="lazy">`:''}<div class="followLiveTop"><img class="followAvatar" src="${esc(avatar||'')}" alt=""><span class="liveDot">● Live · ${Number(viewers)||0}</span></div><div class="followLiveBody"><b>${esc(name)}</b><span>${esc(game)}</span></div></button>`;}).join('')}</div>`;
  }catch(e){box.innerHTML='<div class="followEmpty">Impossible de charger les suivis live.</div>';}
}
function homeRecommendationCard(x,i=0){
  const id=liveIdentity(x); const action=id.platform==='twitch'?`state.discoverPlayer={type:'twitch',login:'${esc(id.login)}'};state.zap.items=[${JSON.stringify(x).replace(/</g,'\\u003c')}];state.zap.index=0;setView('discover')`:`openOryon('${esc(id.login)}')`;
  const tags=(signalTagsFor?.(x)||[platformLabel(id.platform),id.game,`${id.viewers} viewers`]).slice(0,4);
  return `<article class="homeSlideCard finalLive" onclick="${action}">${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:`<div class="proEmptyMedia">LIVE</div>`}<div class="homeSlideBody"><div class="homeTagCloud">${tags.map(t=>`<span class="homeTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live vitrine')}</h2><p>${esc(id.name)} · ${id.viewers} viewers</p></div></article>`;
}
async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return; box.innerHTML='<div class="followEmpty">Sélection de la vitrine live…</div>';
  try{
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    let twitch=await api('/api/twitch/streams/small?lang=fr&min=30&max=100').catch(()=>({items:[]}));
    if(!(twitch.items||[]).length) twitch=await api('/api/twitch/streams/small?lang=fr&min=15&max=120').catch(()=>({items:[]}));
    let items=[...(native.items||[]).map(x=>({...x,platform:'oryon'})),...(twitch.items||[]).map(x=>({...x,platform:'twitch'}))];
    items=items.filter(x=>{const v=Number(x.viewer_count??x.viewers??0)||0; return v>=15 && v<=120;});
    items.sort((a,b)=>{const av=Number(a.viewer_count??a.viewers??0)||0,bv=Number(b.viewer_count??b.viewers??0)||0; const as=(av>=30&&av<=100?90:40)+Math.min(50,Number(a.chat_messages||0)); const bs=(bv>=30&&bv<=100?90:40)+Math.min(50,Number(b.chat_messages||0)); return bs-as;});
    items=items.slice(0,5);
    box.innerHTML=items.length?items.map(homeRecommendationCard).join(''):`<article class="homeSlideCard finalLive" onclick="autoProposeLive()"><div class="homeSlideBody"><div class="homeTagCloud"><span class="homeTag">Recherche directe</span><span class="homeTag">Live vitrine</span></div><h2>Pas de live vitrine maintenant.</h2><p>Oryon peut quand même te proposer un live.</p></div></article>`;
  }catch(e){box.innerHTML='<div class="followEmpty">Impossible de charger la vitrine.</div>';}
}
async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<section class="homeShowcase section"><div class="homeShowcaseInner finalReco"><div class="homeShowcaseCopy final"><div><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Un live vitrine entre 30 et 100 viewers, puis une découverte plus fine selon ton mood.</p><div class="homeMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div></div><div class="homeShowcaseActions finalReco"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="homeLiveCarousel finalReco"><div class="followEmpty">Chargement…</div></div></div></section><div class="homeTwoGrid section"><section>${viewerProfileCard()}</section><section class="homeFollowPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Tes suivis Twitch en ligne</h2><p class="small" style="margin:6px 0 0">Uniquement les chaînes live, avec miniature et logo.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact"></div></section></div>`;
  await loadHomeRecommendations(); await renderCompactFollowed(); closeMini?.();
}
function setViewerThemeColor(color){
  const c=color||'#8b5cf6'; localStorage.setItem('oryon_viewer_accent',c); document.documentElement.style.setProperty('--viewer-accent',c); document.documentElement.style.setProperty('--brand',c); document.documentElement.style.setProperty('--accent',c); document.querySelectorAll('input[type=color]').forEach(i=>{if(i.value!==c)i.value=c});
}
function applyViewerThemeColor(){setViewerThemeColor(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}
applyViewerThemeColor();
(function wrapChannelCustomizer(){
  if(window.__oryonChannelCustomizerWrapped) return; window.__oryonChannelCustomizerWrapped=true;
  const original=renderChannel;
  renderChannel=async function(){
    await original.apply(this,arguments);
    const page=document.querySelector('#channel .channelPage'); if(!page) return;
    page.classList.add('viewerTint'); applyViewerThemeColor();
    if(!page.querySelector('.channelCustomizer')){
      const html=`<div class="channelCustomizer"><div><h3>Personnalisation viewer</h3><p>Change la couleur de toute la page selon ton goût.</p></div><div class="themeControl"><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}" oninput="setViewerThemeColor(this.value)"><button class="btn" onclick="setViewerThemeColor('#8b5cf6')">Violet</button><button class="btn secondary" onclick="setViewerThemeColor('#06b6d4')">Cyan</button><button class="btn secondary" onclick="setViewerThemeColor('#22c55e')">Vert</button></div></div>`;
      const meta=page.querySelector('.channelMeta')||page.querySelector('.pageHead')||page.firstElementChild; meta?.insertAdjacentHTML('afterend',html);
    }
  };
})();


/* Full-width Twitch-like platform pass — desktop-first channel/home/teams */
(function injectFullWidthTwitchLikePass(){
  if(document.getElementById('oryonFullWidthTwitchLikePass')) return;
  const st=document.createElement('style');
  st.id='oryonFullWidthTwitchLikePass';
  st.textContent=`
  :root{--site-pad:clamp(18px,2.8vw,48px);--channel-max:none;--viewer-accent:var(--brand,#8b5cf6)}
  html,body{overflow-x:hidden!important}
  body{background:radial-gradient(circle at 0 0,rgba(6,182,212,.16),transparent 28%),radial-gradient(circle at 0 72%,rgba(139,92,246,.14),transparent 34%),#05070d!important}
  main,#app,.appShell,.view.active{width:100%!important;max-width:none!important;margin:0!important;padding-left:0!important;padding-right:0!important;box-sizing:border-box!important}
  .view.active>#home,.view.active>#discover,.view.active>#channel,.view.active>#teams{width:100%!important;max-width:none!important;margin:0!important}
  .section,.pageHead{max-width:none!important;box-sizing:border-box}
  #home.view.active,#discover.view.active,#channel.view.active,#teams.view.active,#categories.view.active{max-width:none!important;width:100%!important;padding-left:var(--site-pad)!important;padding-right:var(--site-pad)!important}
  #home.view.active{padding-top:28px!important}
  #discover.view.active{padding-top:22px!important}
  #teams.view.active,#channel.view.active{padding-top:0!important}
  .homeShowcase.fullBleed{margin:0!important;padding:0!important;border-radius:0!important;border-left:0!important;border-right:0!important;background:linear-gradient(125deg,rgba(41,22,88,.88),rgba(5,22,36,.95))!important;box-shadow:none!important;overflow:hidden!important}
  .homeFullInner{display:grid;grid-template-columns:minmax(320px,.72fr) minmax(620px,1.55fr);gap:28px;align-items:stretch;width:100%;padding:clamp(22px,3.1vw,54px) var(--site-pad)}
  .homeFullCopy{display:flex;flex-direction:column;justify-content:center;gap:20px;min-width:0}
  .homeFullCopy h1{font-size:clamp(56px,6.3vw,112px);line-height:.88;letter-spacing:-.085em;margin:0;max-width:900px}
  .homeFullCopy p{font-size:clamp(17px,1.35vw,23px);line-height:1.38;color:#d8e2f5;max-width:720px;margin:0}
  .homeFullActions{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px}.homeFullActions .btn{min-height:60px;border-radius:18px;font-size:16px;justify-content:center}.homeFullActions .streamBtn{background:linear-gradient(135deg,var(--viewer-accent),#bd46ff)!important;border:0!important;box-shadow:0 22px 60px rgba(139,92,246,.30)}
  .homeMoodStrip.full{display:flex;gap:8px;flex-wrap:wrap}.homeMoodStrip.full button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:10px 13px;font-weight:1000;color:white;cursor:pointer}
  .homeVitrineStage{min-height:clamp(360px,38vw,640px);display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 14px;align-items:stretch}.homeVitrineStage::-webkit-scrollbar,.fwLiveRail::-webkit-scrollbar{height:8px}.homeVitrineStage::-webkit-scrollbar-thumb,.fwLiveRail::-webkit-scrollbar-thumb{background:rgba(148,163,184,.32);border-radius:999px}
  .homeSlideCard.full{position:relative;min-width:min(980px,68vw);width:min(980px,68vw);aspect-ratio:16/9;border-radius:32px;overflow:hidden;border:1px solid rgba(34,211,238,.34);background:#030712;scroll-snap-align:center;box-shadow:0 34px 110px rgba(0,0,0,.45);cursor:pointer;isolation:isolate}.homeSlideCard.full img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.08) contrast(1.04)}.homeSlideCard.full:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.10) 42%,rgba(2,6,23,.92));z-index:1}.homeSlideCard.full .homeSlideBody{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:clamp(20px,2vw,34px);display:grid;gap:13px}.homeSlideCard.full .homeSlideBody h2{font-size:clamp(30px,3.4vw,58px);line-height:.98;letter-spacing:-.055em;margin:0;text-shadow:0 8px 30px rgba(0,0,0,.55)}.homeSlideCard.full .homeSlideBody p{margin:0;color:#dbeafe;font-weight:1000;font-size:16px}
  .homeFallbackLive{display:grid;place-items:center;text-align:left}.homeFallbackLive .homeSlideBody{position:relative!important;inset:auto!important;padding:36px!important}.homeFallbackLive h2{font-size:clamp(38px,4vw,70px)!important}.homePlatformGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;padding:22px var(--site-pad) 42px}.homePlatformGrid section{min-width:0}.homeFollowPanel,.viewerProfilePanel{height:100%}
  #channel.view.active{padding-left:0!important;padding-right:0!important}.channelPage.twitchLike{width:100%!important;max-width:none!important;margin:0!important}.channelTopHero{position:relative;width:100%;min-height:clamp(250px,25vw,430px);overflow:hidden;background:linear-gradient(135deg,rgba(15,23,42,.78),rgba(2,6,23,.95));border-bottom:1px solid rgba(148,163,184,.14)}.channelTopHero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.04)}.channelTopHero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.18),rgba(2,6,23,.82));z-index:1}.channelHeroContent{position:absolute;left:var(--site-pad);right:var(--site-pad);bottom:22px;z-index:2;display:flex;align-items:end;justify-content:space-between;gap:18px}.channelIdentity{display:flex;align-items:end;gap:18px;min-width:0}.channelIdentity .avatar{width:112px!important;height:112px!important;border-radius:28px!important;border:3px solid rgba(255,255,255,.18);box-shadow:0 22px 70px rgba(0,0,0,.45);object-fit:cover;background:#111827}.channelTitleBlock{min-width:0}.channelTitleBlock h1{font-size:clamp(38px,4.2vw,82px);line-height:.92;margin:0 0 8px;letter-spacing:-.075em}.channelTitleBlock p{margin:0 0 10px;color:#d7e2f2;font-size:16px;max-width:900px}.channelActionDock{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.channelActionDock .btn{min-height:48px;border-radius:16px}.channelSubNav{position:sticky;top:58px;z-index:30;background:rgba(5,7,13,.88);backdrop-filter:blur(18px);border-bottom:1px solid rgba(148,163,184,.12);padding:0 var(--site-pad);display:flex;gap:8px;overflow-x:auto}.channelSubNav button{padding:18px 14px;border:0;background:transparent;color:#cbd5e1;font-weight:1000;cursor:pointer;border-bottom:3px solid transparent}.channelSubNav button.active,.channelSubNav button:hover{color:white;border-bottom-color:var(--viewer-accent)}
  .channelLiveLayout{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;width:100%;padding:18px var(--site-pad) 0}.channelMainPlayer{min-width:0}.channelMainPlayer .player,.channelMainPlayer .oryonMainPlayer{width:100%!important;height:auto!important;aspect-ratio:16/9!important;min-height:0!important;border-radius:22px!important;overflow:hidden;background:#000;border:1px solid rgba(148,163,184,.17);box-shadow:0 22px 70px rgba(0,0,0,.38)}.channelMainPlayer iframe,.channelMainPlayer video,.channelMainPlayer img{width:100%!important;height:100%!important;object-fit:cover!important}.channelLiveSidebar{min-width:0}.channelLiveSidebar .chatPanel{position:sticky;top:122px;height:calc(100vh - 142px);min-height:620px;border-radius:22px;overflow:hidden}.channelContentGrid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;padding:22px var(--site-pad) 60px}.channelInfoStack{display:grid;gap:16px}.channelInfoCard{padding:20px;border:1px solid rgba(148,163,184,.16);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))}.channelInfoCard h2,.channelInfoCard h3{margin-top:0}.channelBadgesBar{display:flex;gap:9px;flex-wrap:wrap}.channelCustomizer.full{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.themeControl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.themeControl input[type=color]{width:44px;height:36px;border:0;background:transparent;padding:0}
  #teams.view.active{padding-left:var(--site-pad)!important;padding-right:var(--site-pad)!important}.teamsHero{padding:clamp(30px,4vw,70px) 0 26px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px}.teamsHero h1{font-size:clamp(52px,5.5vw,98px);line-height:.9;margin:0;letter-spacing:-.085em}.teamsHero p{font-size:18px;color:#cbd5e1;margin:12px 0 0}.teamsGridFull{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:18px}.teamsGridFull .card,.teamCardFull{min-height:220px;border-radius:26px;padding:22px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));border:1px solid rgba(148,163,184,.16)}.teamCreateFull{margin-bottom:22px}.teamLogo{width:64px!important;height:64px!important;border-radius:18px!important;object-fit:cover;background:linear-gradient(135deg,var(--viewer-accent),#22d3ee)}
  .creatorLayout{width:100%!important;max-width:none!important;padding:0 var(--site-pad)!important;box-sizing:border-box}.creatorLayout main{min-width:0}.creatorSide{position:sticky;top:70px;align-self:start}
  @media(max-width:1200px){.homeFullInner,.channelLiveLayout,.channelContentGrid{grid-template-columns:1fr}.channelLiveSidebar .chatPanel{position:relative;top:auto;height:520px;min-height:520px}.homePlatformGrid{grid-template-columns:1fr}.teamsGridFull{grid-template-columns:repeat(2,minmax(0,1fr))}.homeSlideCard.full{min-width:78vw;width:78vw}.channelHeroContent{align-items:flex-start;flex-direction:column}.channelActionDock{justify-content:flex-start}.channelIdentity .avatar{width:92px!important;height:92px!important;border-radius:24px!important}}
  @media(max-width:760px){:root{--site-pad:14px}.homeFullInner{display:block;padding:18px var(--site-pad) 24px}.homeFullCopy h1{font-size:clamp(42px,12vw,70px)}.homeFullActions{grid-template-columns:1fr}.homeVitrineStage{margin-top:18px;min-height:auto}.homeSlideCard.full{min-width:88vw;width:88vw;border-radius:24px}.homePlatformGrid{padding:14px var(--site-pad) 110px}.channelTopHero{min-height:360px}.channelHeroContent{bottom:16px}.channelIdentity{align-items:flex-start;flex-direction:column;gap:10px}.channelIdentity .avatar{width:84px!important;height:84px!important}.channelTitleBlock h1{font-size:46px}.channelLiveLayout{padding:12px var(--site-pad) 0}.channelContentGrid{padding:16px var(--site-pad) 110px}.channelSubNav{top:0;padding:0 var(--site-pad)}.channelLiveSidebar .chatPanel{height:420px;min-height:420px}.teamsHero{grid-template-columns:1fr}.teamsGridFull{grid-template-columns:1fr}.creatorLayout{grid-template-columns:1fr!important;padding:0 var(--site-pad) 100px!important}.creatorSide{position:relative;top:auto;display:flex;gap:8px;overflow-x:auto}.creatorSide h3,.creatorSide .sep,.creatorSide p{display:none}.creatorSide button{white-space:nowrap;min-width:max-content}}
  `;
  document.head.appendChild(st);
})();

function fwLiveMediaHtml(p,isOwner,isLive,offlineImg){
  if(p.oryon_local_player_url) return `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(p.oryon_local_player_url)}"></iframe>`;
  if((p.peertube_embed_url||p.peertube_watch_url) && !isLive) return `<iframe allowfullscreen sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="${esc(normalizePeerTubeEmbed(p.peertube_embed_url,p.peertube_watch_url))}"></iframe>`;
  return `<video id="localVideo" autoplay muted playsinline class="${isOwner&&state.stream?'':'hidden'}"></video><video id="remoteVideo" autoplay playsinline class="hidden"></video><div id="offlinePanel" class="emptyStatePlayer" style="display:${(isOwner&&state.stream)?'none':'grid'}">${offlineImg?`<img class="offlinePoster" src="${esc(offlineImg)}" alt="">`:''}<div class="offlineOverlay"><div><h2>${isLive?'Connexion au live…':'Chaîne hors ligne'}</h2><p class="muted">${isLive?'Connexion vidéo en attente.':'Bannière hors live, planning et infos de chaîne restent visibles.'}</p>${isOwner?`<button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button>`:`<button class="btn" onclick="quickGem()">Trouver une pépite</button>`}</div></div></div>`;
}

async function renderChannel(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner;
  const banner=p.banner_url||p.offline_image_url||'';
  const offlineImg=p.offline_image_url||p.banner_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const supportCount=Number(support?.count||0);
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=fwLiveMediaHtml(p,isOwner,isLive,offlineImg);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span><span class="pill">${supportCount} premiers soutiens</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div></div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="chanTab(this,'about')">Accueil</button><button onclick="chanTab(this,'about')">À propos</button><button onclick="chanTab(this,'planning')">Planning</button><button onclick="chanTab(this,'clips')">Clips</button><button onclick="setView('studio')">Badges / emotes</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section><section class="channelContentGrid"><div class="channelInfoStack"><div class="channelInfoCard channelCustomizer full"><div><h3>Personnalisation viewer</h3><p class="small">Change la couleur de la page selon ton goût.</p></div><div class="themeControl"><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}" oninput="setViewerThemeColor(this.value)"><button class="btn" onclick="setViewerThemeColor('#8b5cf6')">Violet</button><button class="btn secondary" onclick="setViewerThemeColor('#06b6d4')">Cyan</button><button class="btn secondary" onclick="setViewerThemeColor('#22c55e')">Vert</button></div></div><div class="channelInfoCard"><h2>Pourquoi entrer ici ?</h2><div class="channelBadgesBar"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span>${channelBadges.slice(0,5).map(b=>`<span class="reasonChip">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}</div></div><div id="channelTab" class="channelInfoCard"></div></div><aside class="channelInfoStack"><div class="channelInfoCard"><h3>Badges visibles</h3><div class="channelBadgeRail tight">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div><div class="channelInfoCard"><h3>Premiers soutiens</h3>${(support.first_supporters||[]).length?(support.first_supporters||[]).slice(0,8).map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(' '):'<p class="muted">Premiers soutiens à venir.</p>'}</div></aside></section></div>`;
  applyViewerThemeColor?.();
  if(isLive)setMiniLive({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  chanTab(null,'about'); setupSocket(); state.room=targetLogin; state.socket.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){ attachCurrentStream(); }
  else if(isLive){ state.socket.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer(),500); } }
  updateLiveUi(isLive);
  refreshEmoteShelf(targetLogin);
}

function homeRecommendationCard(x,i=0){
  const id=liveIdentity(x);
  const safe=JSON.stringify(x).replace(/</g,'\\u003c').replace(/`/g,'\\`');
  const action=id.platform==='twitch'?`state.discoverPlayer={type:'twitch',login:'${esc(id.login)}'};state.zap.items=[${safe}];state.zap.index=0;setView('discover')`:`openOryon('${esc(id.login)}')`;
  const tags=(signalTagsFor?.(x)||[platformLabel(id.platform),id.game,`${id.viewers} viewers`]).filter(Boolean).slice(0,4);
  return `<article class="homeSlideCard full" onclick="${action}">${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:''}<div class="homeSlideBody"><div class="homeTagCloud">${tags.map(t=>`<span class="homeTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live vitrine')}</h2><p>${esc(id.name)} · ${id.viewers} viewers</p></div></article>`;
}
async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return; box.innerHTML='<div class="followEmpty">Sélection de la vitrine live…</div>';
  try{
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    let twitch=await api('/api/twitch/streams/small?lang=fr&min=30&max=100').catch(()=>({items:[]}));
    if(!(twitch.items||[]).length) twitch=await api('/api/twitch/streams/small?lang=fr&min=15&max=120').catch(()=>({items:[]}));
    let items=[...(native.items||[]).map(x=>({...x,platform:'oryon'})),...(twitch.items||[]).map(x=>({...x,platform:'twitch'}))];
    items=items.filter(x=>{const v=Number(x.viewer_count??x.viewers??0)||0; return v>=15 && v<=120;});
    items.sort((a,b)=>{const av=Number(a.viewer_count??a.viewers??0)||0,bv=Number(b.viewer_count??b.viewers??0)||0; return ((bv>=30&&bv<=100)?100:50)+Math.min(60,Number(b.chat_messages||0))-(((av>=30&&av<=100)?100:50)+Math.min(60,Number(a.chat_messages||0)));});
    items=items.slice(0,7);
    box.innerHTML=items.length?items.map(homeRecommendationCard).join(''):`<article class="homeSlideCard full homeFallbackLive" onclick="autoProposeLive()"><div class="homeSlideBody"><div class="homeTagCloud"><span class="homeTag">Recherche directe</span><span class="homeTag">Oryon Flow</span></div><h2>Lance la vitrine.</h2><p>Oryon va chercher un live maintenant, même hors créneau vitrine.</p></div></article>`;
  }catch(e){box.innerHTML='<div class="followEmpty">Impossible de charger la vitrine.</div>';}
}
async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<section class="homeShowcase fullBleed"><div class="homeFullInner"><div class="homeFullCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Un grand live vitrine entre 30 et 100 viewers, puis une découverte plus fine selon ton mood.</p><div class="homeMoodStrip full">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="homeFullActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="homeVitrineStage"><div class="followEmpty">Chargement…</div></div></div></section><div class="homePlatformGrid"><section>${viewerProfileCard()}</section><section class="homeFollowPanel"><div class="proTwitchHead"><div><h2 style="margin:0">Tes suivis Twitch en ligne</h2><p class="small" style="margin:6px 0 0">Uniquement les chaînes live, avec miniature et logo.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact"></div></section></div>`;
  await loadHomeRecommendations(); await renderCompactFollowed(); closeMini?.();
}

async function renderTeams(){
  const el=$('#teams');
  el.innerHTML=`<section class="teamsHero"><div><span class="eyebrow"><i class="dot"></i>Communautés</span><h1>Équipes gratuites.</h1><p>Logo, bannière, membres live, identité commune. Plus proche d’une team Twitch, mais ouverte.</p></div>${state.session.local?`<button class="btn" onclick="$('#teamCreate').classList.toggle('hidden')">Créer une équipe</button>`:`<button class="btn" onclick="setView('settings')">Connexion requise</button>`}</section><div id="teamCreate" class="panel teamCreateFull hidden"><form id="teamForm" class="teamCreateGrid"><input id="teamName" placeholder="Nom de l'équipe"><input id="teamTags" placeholder="Tags"><textarea id="teamDesc" placeholder="Description courte"></textarea><div><label class="small">Logo d'équipe</label><input id="teamLogoFile" type="file" accept="image/*"><input id="teamLogo" type="hidden"><div class="row section"><div id="teamLogoPreview" class="teamLogo"></div><button class="btn secondary">Créer</button></div></div></form></div><div id="teamsList" class="teamsGridFull"><div class="empty">Chargement…</div></div>`;
  const f=$('#teamLogoFile'); if(f)f.onchange=()=>{const file=f.files[0]; if(!file)return; compressImage(file).then(data=>{$('#teamLogo').value=data; $('#teamLogoPreview').style.backgroundImage=`url(${data})`; $('#teamLogoPreview').style.backgroundSize='cover'; toast('Logo prêt')})};
  $('#teamForm')?.addEventListener('submit',createTeam); await loadTeams();
}
async function loadTeams(){
  const r=await api('/api/oryon/teams').catch(()=>({items:[]}));
  $('#teamsList').innerHTML=(r.items||[]).map(t=>`<article class="teamCardFull"><div class="row"><img class="teamLogo" src="${esc(t.logo_url||'')}" alt=""><div><h2>${esc(t.name)}</h2><p class="muted">${esc(t.description||'Équipe Oryon')}</p></div></div><p><span class="pill">${t.members?.length||0} membres</span> <span class="pill">${t.points||0} points</span></p><div class="row"><button class="btn" onclick="joinTeam('${esc(t.slug)}')">Rejoindre</button><button class="btn secondary" onclick="viewTeam('${esc(t.slug)}')">Voir</button></div></article>`).join('')||'<div class="teamCardFull"><h2>Aucune équipe pour le moment.</h2><p class="muted">Crée la première équipe avec un logo, une identité et des membres live.</p></div>';
}


/* =========================================================
   ORYON HARD FIX — full-width platform + working live pools
   This block intentionally overrides previous experimental passes.
   Goals:
   - Desktop uses the full viewport like a live platform.
   - Home always attempts to show real live recommendations.
   - Discover never gets stuck on “already seen everything”.
   - Mood cards trigger real discovery directly.
   - Channel page behaves closer to Twitch: huge banner + huge player.
========================================================= */
(function injectOryonHardFixStyle(){
  if(document.getElementById('oryonHardFixStyle')) return;
  const st=document.createElement('style');
  st.id='oryonHardFixStyle';
  st.textContent=`
  :root{--site-pad:clamp(18px,2.4vw,48px);--viewer-accent:var(--viewer-accent,#8b5cf6)}
  html,body{width:100%;max-width:100%;overflow-x:hidden;background:radial-gradient(circle at 0% 10%,rgba(34,211,238,.12),transparent 30%),radial-gradient(circle at 20% 100%,rgba(139,92,246,.18),transparent 34%),#05070d!important}
  .app{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
  .view.active{width:100%!important;max-width:none!important;margin:0!important}
  .topbar{padding:0 var(--site-pad)!important}

  /* HOME: real platform showcase */
  .hfHome{width:100%;display:grid;gap:28px;padding:34px var(--site-pad) 54px}
  .hfHero{display:grid;grid-template-columns:minmax(360px,.54fr) minmax(680px,1fr);gap:30px;align-items:stretch;width:100%;min-height:clamp(520px,62vh,760px);border:1px solid rgba(148,163,184,.16);background:linear-gradient(125deg,rgba(45,28,95,.96),rgba(5,18,32,.96));box-shadow:0 30px 100px rgba(0,0,0,.38);overflow:hidden;border-radius:34px}
  .hfHeroCopy{display:flex;flex-direction:column;justify-content:center;gap:20px;padding:clamp(28px,3.4vw,58px);min-width:0}
  .hfHeroCopy h1{margin:0;font-size:clamp(66px,7.4vw,128px);line-height:.84;letter-spacing:-.09em;max-width:900px}
  .hfHeroCopy p{margin:0;color:#dbe7fb;font-size:clamp(18px,1.35vw,24px);line-height:1.4;max-width:780px}
  .hfMoodStrip{display:flex;gap:9px;flex-wrap:wrap}.hfMoodStrip button{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:9px 13px;font-weight:1000}
  .hfActions{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:780px}.hfActions .btn{min-height:64px;border-radius:18px;font-size:16px;display:grid;place-items:center}.hfActions .streamBtn{background:linear-gradient(135deg,var(--brand),#bd46ff)!important;box-shadow:0 18px 60px rgba(139,92,246,.32)}
  .hfLiveStage{position:relative;min-width:0;display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:clamp(18px,2vw,36px);align-items:stretch;background:linear-gradient(90deg,rgba(2,6,23,.12),rgba(2,6,23,.44))}.hfLiveStage::-webkit-scrollbar,.hfRail::-webkit-scrollbar{height:8px}.hfLiveStage::-webkit-scrollbar-thumb,.hfRail::-webkit-scrollbar-thumb{background:rgba(148,163,184,.42);border-radius:999px}
  .hfLiveCard{position:relative;min-width:min(920px,70vw);width:min(920px,70vw);aspect-ratio:16/9;border:1px solid rgba(34,211,238,.32);border-radius:30px;overflow:hidden;background:#030712;scroll-snap-align:center;box-shadow:0 32px 110px rgba(0,0,0,.42);cursor:pointer;color:#fff;text-align:left}
  .hfLiveCard>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.08) contrast(1.03)}
  .hfLiveCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.12) 35%,rgba(2,6,23,.93));z-index:1}
  .hfLiveBody{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:26px;display:grid;gap:12px}.hfLiveBody h2{font-size:clamp(34px,3.8vw,62px);line-height:.94;letter-spacing:-.065em;margin:0;max-width:880px}.hfLiveBody p{margin:0;color:#eaf2ff;font-weight:950;font-size:16px}.hfTagRow{display:flex;gap:8px;flex-wrap:wrap}.hfTag{display:inline-flex;border:1px solid rgba(255,255,255,.16);background:rgba(2,6,23,.58);backdrop-filter:blur(8px);color:#fff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000}
  .hfEmptyLive{min-width:min(920px,70vw);width:min(920px,70vw);aspect-ratio:16/9;border:1px dashed rgba(148,163,184,.32);border-radius:30px;background:radial-gradient(circle at 30% 25%,rgba(139,92,246,.24),transparent 34%),#050814;display:grid;place-items:center;text-align:center;padding:30px;scroll-snap-align:center}.hfEmptyLive h2{font-size:clamp(38px,4vw,68px);line-height:.92;margin:0 0 10px;letter-spacing:-.07em}.hfEmptyLive p{color:#cbd5e1;margin:0 0 18px;max-width:620px}
  .hfBelow{display:grid;grid-template-columns:minmax(0,1fr) minmax(420px,.82fr);gap:22px}.hfPanel{border:1px solid rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(15,23,42,.34));border-radius:28px;padding:22px;min-width:0}.hfPanel h2{font-size:clamp(28px,2.5vw,44px);letter-spacing:-.06em;margin:0 0 8px}.hfPanel p{color:#aebbd0;margin:0}.hfRail{display:flex;gap:14px;overflow-x:auto;padding:8px 0 14px}.hfFollowCard{position:relative;min-width:330px;width:330px;aspect-ratio:16/9;border-radius:24px;overflow:hidden;background:#030712;border:1px solid rgba(148,163,184,.18);color:#fff}.hfFollowCard img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hfFollowCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(2,6,23,.90));z-index:1}.hfFollowBody{position:absolute;z-index:2;left:14px;right:14px;bottom:14px}.hfFollowBody b{font-size:20px}.hfAvatar{width:46px;height:46px;border-radius:15px;border:2px solid rgba(255,255,255,.24);object-fit:cover;background:#111827}.hfLivePill{position:absolute;z-index:3;top:12px;right:12px;border-radius:999px;padding:7px 10px;background:rgba(16,185,129,.9);font-weight:1000;font-size:12px}

  /* DISCOVER: mood -> card -> swipe */
  .hfDiscover{width:100%;padding:34px var(--site-pad) 70px;display:grid;gap:22px}.hfDiscoverHero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px;border:1px solid rgba(139,92,246,.26);border-radius:32px;background:radial-gradient(circle at 18% 12%,rgba(139,92,246,.26),transparent 34%),linear-gradient(135deg,rgba(12,18,32,.96),rgba(5,8,16,.98));padding:clamp(24px,3vw,46px)}.hfDiscoverHero h1{font-size:clamp(58px,6.5vw,112px);line-height:.86;letter-spacing:-.09em;margin:8px 0}.hfDiscoverHero p{margin:0;color:#d5e0f3;font-size:18px}.hfDiscoverHint{display:flex;gap:8px}.hfDiscoverHint span{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:999px;padding:8px 12px;font-weight:950;font-size:12px}
  .hfMoodPanel{border:1px solid rgba(148,163,184,.16);border-radius:28px;background:rgba(255,255,255,.035);padding:16px}.hfMoodHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.hfMoodHead h2{margin:0;font-size:34px;letter-spacing:-.055em}.hfMoodGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.hfMoodCard{min-height:128px;border:1px solid rgba(255,255,255,.11);background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.024));color:#fff;border-radius:24px;padding:16px;text-align:left;display:grid;align-content:end;gap:6px}.hfMoodCard:hover,.hfMoodCard.active{border-color:rgba(34,211,238,.8);background:linear-gradient(145deg,rgba(139,92,246,.23),rgba(34,211,238,.10));transform:translateY(-2px)}.hfMoodCard i{font-size:32px;font-style:normal}.hfMoodCard b{font-size:17px}.hfMoodCard span{font-size:12px;color:#c8d4e7;line-height:1.25}.hfAdvanced{margin-top:12px;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.025);overflow:hidden}.hfAdvanced summary{cursor:pointer;list-style:none;padding:13px 15px;font-weight:950}.hfAdvanced summary::-webkit-details-marker{display:none}.hfAdvancedBody{display:grid;grid-template-columns:minmax(220px,1fr) 150px 120px 90px auto;gap:9px;padding:13px;border-top:1px solid rgba(255,255,255,.09)}
  .hfZap{min-height:clamp(520px,56vw,820px);display:grid}.hfZap .hfLiveCard{width:100%;min-width:0;height:auto;max-width:none}.hfZap .hfLiveCard{aspect-ratio:16/9}.hfSwipeStamp{position:absolute;left:50%;top:50%;z-index:8;transform:translate(-50%,-50%) scale(.86);opacity:0;border:5px solid currentColor;border-radius:26px;padding:20px 30px;background:rgba(2,6,23,.72);backdrop-filter:blur(12px);font-size:clamp(50px,8vw,110px);font-weight:1000;text-transform:uppercase;letter-spacing:-.06em;pointer-events:none}.hfSwipeStamp.like{color:#22c55e}.hfSwipeStamp.nope{color:#fb7185}.hfLiveCard.swipe-like .hfSwipeStamp.like,.hfLiveCard.swipe-nope .hfSwipeStamp.nope{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-3deg)}.hfSwipeHint{position:absolute;z-index:2;top:16px;left:16px;border:1px solid rgba(255,255,255,.16);background:rgba(2,6,23,.62);border-radius:999px;padding:8px 11px;font-weight:950;font-size:12px}.hfDiscoverActions{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:10px;margin-top:4px}.hfDiscoverActions .btn{min-height:56px;border-radius:16px}

  /* CHANNEL: full-width Twitch-like public page */
  #channel{padding:0!important}.channelPage.twitchLike,.channelPage.viewerTint,.channelPage{width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;padding:0!important;background:transparent!important}.channelTopHero{width:100%!important;min-height:clamp(360px,32vw,560px)!important;border-radius:0!important;border-left:0!important;border-right:0!important;position:relative;overflow:hidden}.channelTopHero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.channelTopHero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.08),rgba(2,6,23,.78))}.channelHeroContent{position:absolute!important;z-index:2;left:var(--site-pad)!important;right:var(--site-pad)!important;bottom:28px!important;display:flex!important;justify-content:space-between!important;align-items:flex-end!important;gap:18px}.channelIdentity{display:flex!important;align-items:flex-end!important;gap:18px!important}.channelIdentity .avatar{width:130px!important;height:130px!important;border-radius:28px!important;border:4px solid rgba(2,6,23,.88)!important}.channelTitleBlock h1{font-size:clamp(52px,5vw,96px)!important;line-height:.9!important;letter-spacing:-.08em!important;margin:0!important}.channelSubNav{position:sticky;top:68px;z-index:40;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(5,7,13,.92);backdrop-filter:blur(12px);padding:0 var(--site-pad)!important;margin:0!important;display:flex;gap:22px}.channelSubNav button{min-height:56px;color:#dbeafe}.channelLiveLayout{width:100%!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(360px,430px)!important;gap:18px!important;padding:22px var(--site-pad) 0!important}.channelMainPlayer{min-width:0}.channelMainPlayer .oryonMainPlayer,.channelMainPlayer .player{width:100%!important;min-height:auto!important;height:auto!important;aspect-ratio:16/9!important;border-radius:24px!important;background:#030712!important}.channelLiveSidebar .chatPanel{height:auto!important;min-height:0!important;aspect-ratio:auto!important;max-height:none!important;border-radius:24px!important}.channelLiveSidebar{min-width:0}.channelContentGrid{width:100%!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(360px,430px)!important;gap:18px!important;padding:22px var(--site-pad) 80px!important}.channelInfoCard{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.52);padding:18px}

  @media(max-width:1200px){.hfHero{grid-template-columns:1fr}.hfLiveCard,.hfEmptyLive{min-width:84vw;width:84vw}.hfBelow{grid-template-columns:1fr}.hfMoodGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.channelLiveLayout,.channelContentGrid{grid-template-columns:1fr!important}.channelLiveSidebar .chatPanel{height:480px!important}.channelHeroContent{align-items:flex-start!important;flex-direction:column}.channelIdentity .avatar{width:96px!important;height:96px!important}.channelTitleBlock h1{font-size:58px!important}}
  @media(max-width:760px){:root{--site-pad:14px}.topbar{height:56px}.hfHome,.hfDiscover{padding:16px var(--site-pad) 96px}.hfHero{border-radius:24px;min-height:0}.hfHeroCopy{padding:20px}.hfHeroCopy h1{font-size:clamp(46px,14vw,74px)}.hfActions{grid-template-columns:1fr}.hfLiveStage{padding:14px}.hfLiveCard,.hfEmptyLive{min-width:88vw;width:88vw;border-radius:24px}.hfLiveBody{padding:16px}.hfLiveBody h2{font-size:28px}.hfBelow{gap:14px}.hfPanel{border-radius:22px;padding:16px}.hfMoodGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.hfMoodCard{min-height:112px;border-radius:19px;padding:12px}.hfAdvancedBody{grid-template-columns:1fr}.hfDiscoverHero{grid-template-columns:1fr;border-radius:24px;padding:18px}.hfDiscoverHero h1{font-size:clamp(42px,13vw,68px)}.hfDiscoverHint{display:none}.hfZap{min-height:auto}.hfDiscoverActions{grid-template-columns:1fr}.channelTopHero{min-height:340px!important}.channelHeroContent{left:14px!important;right:14px!important;bottom:16px!important}.channelSubNav{top:56px;overflow-x:auto}.channelSubNav button{white-space:nowrap}.channelLiveLayout{padding:12px 14px 0!important}.channelContentGrid{padding:14px 14px 96px!important}.channelLiveSidebar .chatPanel{height:420px!important}.hfFollowCard{min-width:82vw;width:82vw}}
  `;
  document.head.appendChild(st);
})();

function hfReadJson(key, fallback){ try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback} }
function hfWriteJson(key, value){ try{localStorage.setItem(key, JSON.stringify(value))}catch(_){} }
function hfViewerKey(){ return String(state.session?.local?.login || state.session?.twitch?.login || 'guest').toLowerCase(); }
function hfSeenKey(){ return 'oryon_seen_soft_v4:'+hfViewerKey(); }
function hfLiveId(x){
  const id = liveIdentity?.(x||{}) || {};
  return {
    platform:id.platform || x.platform || 'twitch',
    login:String(id.login || x.login || x.user_login || x.host_login || x.room || '').toLowerCase(),
    name:id.name || x.display_name || x.user_name || x.host_name || x.login || 'Live',
    title:id.title || x.title || 'Live en cours',
    game:id.game || x.game_name || x.category || 'Live',
    viewers:Number(id.viewers ?? x.viewer_count ?? x.viewers ?? 0)||0,
    img:id.img || x.thumbnail_url || ''
  };
}
function hfLiveKey(x){ const id=hfLiveId(x); return `${id.platform}:${id.login}`; }
function hfTags(x){ const id=hfLiveId(x); const base=[]; base.push(id.platform==='oryon'?'Oryon Live':'Twitch'); if(id.viewers) base.push(`${id.viewers} viewers`); if(id.game) base.push(id.game); const t=signalTagsFor?.(x)||[]; return [...new Set([...t,...base].filter(Boolean))].slice(0,5); }
function hfOpenLive(x){ const id=hfLiveId(x); if(id.platform==='oryon') return openOryon(id.login); state.discoverPlayer={type:'twitch', login:id.login}; state.zap.items=[x]; state.zap.index=0; setView('discover'); }
function hfMoodQuery(mood){ return ({chill:'chill',discussion:'Just Chatting','nuit-calme':'chill',rp:'RP','decouverte-jeu':'','petite-commu':''}[mood]||''); }
function hfMoodScore(x,mood){
  const id=hfLiveId(x); const text=[id.title,id.game,id.name,(x.tags||[]).join?.(' ')||''].join(' ').toLowerCase();
  const v=id.viewers; let s=0;
  const terms={chill:['chill','calme','relax','cozy','musique','music','lofi'],discussion:['just chatting','discussion','chat','talk','irl','débat','debat'], 'nuit-calme':['nuit','late','asmr','lofi','calme','chill'], rp:['rp','roleplay','jdr','dnd','gta rp','narration'], 'decouverte-jeu':['découverte','decouverte','first play','blind','exploration','nouveau'], 'petite-commu':['petit','commu','small','fr'] }[mood]||[];
  for(const t of terms){ if(text.includes(t)) s+=40; }
  if(mood==='discussion' && /just chatting|discussion|talk|irl|chat/.test(text)) s+=80;
  if(mood==='rp' && /\brp\b|roleplay|jdr|dnd|gta rp/.test(text)) s+=80;
  if(mood==='petite-commu'){ if(v>=3&&v<=80)s+=80; if(v>=15&&v<=50)s+=45; if(v>150)s-=140; }
  else { if(v>=15&&v<=150)s+=35; if(v>400)s-=80; }
  s += Math.max(0, 40 - Math.abs(v-45)/2);
  return s;
}
async function hfFetchLivePool({mood='petite-commu', q='', min=0, max=200, lang='fr'}={}){
  const calls=[];
  calls.push(api('/api/oryon/discover/find-live?'+qs({q, mood, max, lang, source:'both'})).catch(()=>({items:[]})));
  calls.push(api(`/api/twitch/streams/small?lang=${encodeURIComponent(lang)}&min=${encodeURIComponent(min)}&max=${encodeURIComponent(max)}`).catch(()=>({items:[]})));
  calls.push(api('/api/twitch/followed/live').catch(()=>({items:[]})));
  calls.push(api('/api/native/lives').catch(()=>({items:[]})));
  const results=await Promise.all(calls);
  const out=[]; const keys=new Set();
  for(const r of results){
    for(const item of (r.items||[])){
      const x={...item, platform:item.platform || (item.host_login||item.room?'oryon':'twitch')};
      const id=hfLiveId(x); if(!id.login) continue;
      const v=id.viewers; if(v<min || v>Math.max(max, min)) continue;
      const k=hfLiveKey(x); if(keys.has(k)) continue; keys.add(k); out.push(x);
    }
  }
  return out.sort((a,b)=>hfMoodScore(b,mood)-hfMoodScore(a,mood));
}
function hfLiveCardHtml(x, i=0, opts={}){
  const id=hfLiveId(x); const tags=hfTags(x); const safe=encodeURIComponent(JSON.stringify(x));
  return `<article class="hfLiveCard ${opts.swipe?'hfSwipeCard':''}" data-live-json="${safe}" onclick="${opts.click!==false?`hfOpenLive(JSON.parse(decodeURIComponent(this.dataset.liveJson)))`:''}">
    ${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:''}
    ${opts.swipe?`<div class="hfSwipeStamp like">J'aime</div><div class="hfSwipeStamp nope">Pas ouf</div><div class="hfSwipeHint">Swipe droite / gauche</div>`:''}
    <div class="hfLiveBody"><div class="hfTagRow">${tags.map(t=>`<span class="hfTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title)}</h2><p>${esc(id.name)} · ${esc(id.game)} · ${id.viewers} viewers</p>${opts.actions?`<div class="hfDiscoverActions"><button class="btn good" onclick="event.stopPropagation();hfWatchCurrent()">Regarder</button><button class="btn secondary" onclick="event.stopPropagation();hfSwipeLeft()">Pas ouf</button><button class="btn secondary" onclick="event.stopPropagation();hfSwipeRight()">J'aime</button></div>`:''}</div>
  </article>`;
}
function hfEmptyLiveHtml(){ return `<div class="hfEmptyLive"><div><h2>Aucun live récupéré.</h2><p>La page fonctionne, mais le serveur ne reçoit aucun flux exploitable. Vérifie les variables Twitch sur Render ou connecte Twitch pour utiliser tes suivis comme fallback.</p><button class="btn" onclick="autoProposeLive()">Relancer la recherche</button></div></div>`; }
async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=`<div class="hfEmptyLive"><div><h2>Chargement de la vitrine…</h2><p>Oryon cherche un live entre 30 et 100 viewers.</p></div></div>`;
  const items=await hfFetchLivePool({mood:'petite-commu', min:30, max:100, lang:'fr'});
  const fallback=items.length?items:await hfFetchLivePool({mood:'petite-commu', min:1, max:250, lang:'fr'});
  box.innerHTML=fallback.length?fallback.slice(0,8).map((x,i)=>hfLiveCardHtml(x,i)).join(''):hfEmptyLiveHtml();
}
async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<div class="hfHome"><section class="hfHero"><div class="hfHeroCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Un live vitrine entre 30 et 100 viewers. Si le créneau est vide, Oryon élargit sans laisser l’accueil mort.</p><div class="hfMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="hfActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="hfLiveStage">${hfEmptyLiveHtml()}</div></section><div class="hfBelow"><section class="hfPanel">${viewerProfileCard?.()||'<h2>Profil Viewer</h2>'}</section><section class="hfPanel"><div class="proTwitchHead"><div><h2>Tes suivis Twitch en ligne</h2><p>Uniquement les chaînes live, en bandeau avec miniature.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact" class="hfRail"></div></section></div></div>`;
  await loadHomeRecommendations();
  await renderCompactFollowed?.();
  closeMini?.();
}
async function renderCompactFollowed(){
  const el=$('#followedWrapCompact'); if(!el) return;
  if(!state.session.twitch){ el.innerHTML='<div class="followEmpty">Connecte Twitch pour voir tes suivis en ligne.</div>'; return; }
  let r=await api('/api/twitch/followed/status').catch(()=>({items:[]}));
  let items=(r.items||[]).filter(x=>x.is_live || Number(x.viewer_count||0)>0);
  if(!items.length){ r=await api('/api/twitch/followed/live').catch(()=>({items:[]})); items=(r.items||[]); }
  el.innerHTML=items.length?items.slice(0,12).map(x=>{const id=hfLiveId({...x,platform:'twitch'});return `<button class="hfFollowCard" onclick="openTwitch('${esc(id.login)}')"><img class="bg" src="${esc(id.img)}" alt=""><span class="hfLivePill">● Live · ${id.viewers}</span><div class="hfFollowBody"><img class="hfAvatar" src="${esc(x.profile_image_url||'')}" alt=""><br><b>${esc(id.name)}</b><br><span class="small">${esc(id.game)}</span></div></button>`}).join(''):'<div class="followEmpty">Aucun suivi Twitch en ligne maintenant.</div>';
}
async function setDiscoverMood(id){
  state.moodFirstMood=id||'petite-commu';
  await findLive();
}
async function findLive(){
  const mood=state.moodFirstMood || $('#dMood')?.value || 'petite-commu';
  const q=($('#dQuery')?.value || hfMoodQuery(mood) || '').trim();
  const max=Number($('#dMax')?.value || (mood==='petite-commu'?120:250));
  const lang=$('#dLang')?.value || 'fr';
  const zap=$('#zapResult'); if(zap) zap.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche ${esc(moodFirstLabel?.(mood)||mood)}…</h2><p>Tri par mood, taille humaine et chat exploitable.</p></div></div>`;
  state.currentTwitch=null; state.discoverPlayer=null; closeMini?.();
  let items=await hfFetchLivePool({mood,q,max,lang});
  if(!items.length) items=await hfFetchLivePool({mood,q:'',max:400,lang});
  const seen=hfReadJson(hfSeenKey(),{});
  let fresh=items.filter(x=>!seen[hfLiveKey(x)]);
  // Important: never block the product because the local profile saw everything.
  // If all are seen, reuse the best live instead of showing a dead screen.
  if(!fresh.length && items.length){ fresh=items; }
  state.zap.items=fresh.slice(0,20); state.zap.index=0; state.zap.last={q,mood,max,lang};
  renderZap();
}
function renderZap(){
  const zap=$('#zapResult'); if(!zap) return;
  const x=(state.zap.items||[])[state.zap.index];
  if(!x){ zap.innerHTML=hfEmptyLiveHtml(); return; }
  const id=hfLiveId(x);
  if(state.discoverPlayer?.type==='twitch' && state.discoverPlayer.login){
    zap.innerHTML=`<section class="watchShell twitchWatch"><div class="player premiumPlayer"><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(state.discoverPlayer.login)}&parent=${encodeURIComponent(location.hostname)}&autoplay=true&muted=false"></iframe></div><div class="chatPanel twitchChat"><iframe src="https://www.twitch.tv/embed/${encodeURIComponent(state.discoverPlayer.login)}/chat?parent=${encodeURIComponent(location.hostname)}&darkpopout"></iframe></div></section>`;
    return;
  }
  zap.innerHTML=`<section class="hfZap">${hfLiveCardHtml(x,0,{swipe:true,actions:true,click:false})}</section>`;
  hfBindSwipe();
}
function hfMark(x,action){ const seen=hfReadJson(hfSeenKey(),{}); seen[hfLiveKey(x)]={action,ts:Date.now(),live:hfLiveId(x)}; hfWriteJson(hfSeenKey(),seen); if(action==='like') saveCurrentLive?.(); }
function hfNext(){ const items=state.zap.items||[]; if(!items.length) return findLive(); state.zap.index=(state.zap.index+1)%items.length; state.discoverPlayer=null; renderZap(); }
function hfSwipeRight(){ const x=(state.zap.items||[])[state.zap.index]; if(!x) return; hfMark(x,'like'); toast?.('J’aime — ajouté au profil viewer'); setTimeout(hfNext,90); }
function hfSwipeLeft(){ const x=(state.zap.items||[])[state.zap.index]; if(!x) return; hfMark(x,'nope'); toast?.('Pas ouf — retiré pour ce compte'); setTimeout(hfNext,90); }
function hfWatchCurrent(){ const x=(state.zap.items||[])[state.zap.index]; if(!x) return; hfMark(x,'watch'); const id=hfLiveId(x); if(id.platform==='oryon') return openOryon(id.login); state.discoverPlayer={type:'twitch',login:id.login}; renderZap(); }
function zapOpenCurrent(){ return hfWatchCurrent(); }
function zapNext(){ return hfNext(); }
function proSwipeRight(){ return hfSwipeRight(); }
function proSwipeLeft(){ return hfSwipeLeft(); }
function hfBindSwipe(){
  const card=document.querySelector('.hfSwipeCard'); if(!card || card.__hfSwipe) return; card.__hfSwipe=true;
  let sx=0,sy=0,dx=0,dy=0,drag=false;
  const start=e=>{ if(e.target.closest('button,a,input,select,textarea')) return; const p=e.touches?e.touches[0]:e; sx=p.clientX; sy=p.clientY; dx=dy=0; drag=true; card.style.transition='none'; };
  const move=e=>{ if(!drag) return; const p=e.touches?e.touches[0]:e; dx=p.clientX-sx; dy=p.clientY-sy; if(Math.abs(dx)>Math.abs(dy)*1.08 && e.cancelable) e.preventDefault(); const rot=Math.max(-10,Math.min(10,dx/18)); card.style.transform=`translateX(${dx}px) rotate(${rot}deg)`; card.classList.toggle('swipe-like',dx>35); card.classList.toggle('swipe-nope',dx<-35); };
  const end=()=>{ if(!drag) return; drag=false; const threshold=Math.min(150,Math.max(80,window.innerWidth*.16)); card.style.transition='transform .18s ease, opacity .18s ease'; if(dx>threshold){ card.classList.add('swipe-like'); card.style.transform='translateX(120vw) rotate(10deg)'; card.style.opacity='.18'; return setTimeout(hfSwipeRight,120); } if(dx<-threshold){ card.classList.add('swipe-nope'); card.style.transform='translateX(-120vw) rotate(-10deg)'; card.style.opacity='.18'; return setTimeout(hfSwipeLeft,120); } card.style.transform=''; card.classList.remove('swipe-like','swipe-nope'); };
  card.addEventListener('touchstart',start,{passive:true}); card.addEventListener('touchmove',move,{passive:false}); card.addEventListener('touchend',end,{passive:true}); card.addEventListener('pointerdown',start); window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',end);
}
async function renderDiscover(){
  const el=$('#discover'); if(!el) return;
  const current=state.moodFirstMood||'petite-commu';
  el.innerHTML=`<div class="hfDiscover"><section class="hfDiscoverHero"><div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Choisis ton mood.</h1><p>Un tap lance une vraie proposition. Ensuite tu swipes : droite si ça te parle, gauche si ce n’est pas ta vibe.</p></div><div class="hfDiscoverHint"><span>mood</span><span>live</span><span>swipe</span></div></section><section class="hfMoodPanel"><div class="hfMoodHead"><h2>Ambiance</h2><span class="moodFirstSelected">${esc(moodFirstLabel?.(current)||current)}</span></div><div class="hfMoodGrid">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="hfMoodCard ${id===current?'active':''}" onclick="setDiscoverMood('${esc(id)}')"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div><details class="hfAdvanced"><summary>Options avancées</summary><div class="hfAdvancedBody"><input id="dQuery" placeholder="jeu, pseudo, ambiance" onkeydown="if(event.key==='Enter')findLive()"><select id="dMax"><option value="80">≤80</option><option value="150" selected>≤150</option><option value="300">≤300</option><option value="500">≤500</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn secondary" onclick="localStorage.removeItem(hfSeenKey());findLive()">Réinitialiser swipes</button><button class="btn" onclick="findLive()">Relancer</button></div></details></section><section id="zapResult"></section><section class="hfPanel"><div class="proTwitchHead"><div><h2>Accès Twitch</h2><p>Recherche manuelle si tu sais déjà qui tu veux voir.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch" onkeydown="if(event.key==='Enter')searchTwitch()"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="twResults"></div></section></div>`;
  renderZap();
  closeMini?.();
}
async function autoProposeLive(){ state.moodFirstMood=state.moodFirstMood||'petite-commu'; await setView('discover'); await findLive(); }
async function quickGem(){ return autoProposeLive(); }

/* =====================================================================
   Oryon emergency platform pass — real desktop full-width, no centered app
   ===================================================================== */
(function injectOryonTruePlatformPass(){
  const old=document.getElementById('oryonTruePlatformPass');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonTruePlatformPass';
  st.textContent=`
  html,body{width:100%!important;min-width:0!important;overflow-x:hidden!important;background:#05070d!important}
  body{--platform-pad:clamp(18px,2.4vw,54px)}
  main.app,.app{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;overflow:visible!important}
  .view,.view.active{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;overflow:visible!important}
  #home.view.active,#discover.view.active,#channel.view.active,#teams.view.active,#categories.view.active{width:100vw!important;max-width:none!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important;padding-left:0!important;padding-right:0!important;box-sizing:border-box!important;overflow-x:hidden!important}
  .topbar{padding-left:var(--platform-pad)!important;padding-right:var(--platform-pad)!important}

  /* HOME: platform, not centered card */
  .owHomeFull,.hfHome{width:100vw!important;max-width:none!important;margin:0!important;padding:0 0 72px!important;display:grid!important;gap:28px!important;background:radial-gradient(circle at 0 8%,rgba(34,211,238,.13),transparent 28%),radial-gradient(circle at 18% 100%,rgba(139,92,246,.18),transparent 35%),#05070d!important}
  .owHeroTheater,.hfHero{width:100vw!important;max-width:none!important;margin:0!important;border-radius:0!important;border-left:0!important;border-right:0!important;min-height:calc(100vh - 72px)!important;display:grid!important;grid-template-columns:minmax(340px,30vw) minmax(0,1fr)!important;gap:0!important;background:linear-gradient(115deg,rgba(42,28,90,.98) 0%,rgba(18,20,45,.94) 31%,rgba(3,10,21,.98) 100%)!important;overflow:hidden!important;box-shadow:none!important}
  .owHeroCopy,.hfHeroCopy{padding:clamp(34px,4.2vw,82px) clamp(26px,3.1vw,60px)!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:flex-start!important;gap:18px!important;min-width:0!important;z-index:2!important;background:linear-gradient(90deg,rgba(16,10,45,.72),rgba(16,10,45,.10))!important}
  .owHeroCopy h1,.hfHeroCopy h1{font-size:clamp(56px,5.8vw,116px)!important;line-height:.84!important;letter-spacing:-.095em!important;margin:0!important;max-width:620px!important;word-break:normal!important;overflow:visible!important}
  .owHeroCopy p,.hfHeroCopy p{font-size:clamp(17px,1.25vw,23px)!important;line-height:1.35!important;color:#dce7fa!important;max-width:540px!important;margin:0!important}
  .owActions,.hfActions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important;width:100%!important;max-width:540px!important}.owActions .btn,.hfActions .btn{min-height:62px!important;border-radius:18px!important;font-size:16px!important}.owActions .btn:nth-child(3),.hfActions .btn:nth-child(3){grid-column:1/-1!important;background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.14)!important}
  .owMoodStrip,.hfMoodStrip{display:flex!important;gap:8px!important;flex-wrap:wrap!important;max-width:560px!important}.owMoodStrip button,.hfMoodStrip button{border:1px solid rgba(255,255,255,.16)!important;background:rgba(255,255,255,.075)!important;color:#fff!important;border-radius:999px!important;padding:9px 12px!important;font-weight:1000!important}
  .owLiveTheater,.hfLiveStage{width:100%!important;min-width:0!important;height:calc(100vh - 72px)!important;min-height:600px!important;display:flex!important;gap:24px!important;align-items:center!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;padding:clamp(26px,3vw,62px) var(--platform-pad)!important;background:linear-gradient(90deg,rgba(2,6,23,.10),rgba(2,6,23,.60))!important}
  .owLiveTheater::-webkit-scrollbar,.hfLiveStage::-webkit-scrollbar{height:10px}.owLiveTheater::-webkit-scrollbar-thumb,.hfLiveStage::-webkit-scrollbar-thumb{background:rgba(148,163,184,.46);border-radius:999px}
  .owShowCard,.homeSlideCard.full,.hfLiveStage .hfLiveCard{position:relative!important;flex:0 0 min(1240px,72vw)!important;width:min(1240px,72vw)!important;min-width:min(1240px,72vw)!important;aspect-ratio:16/9!important;border-radius:34px!important;overflow:hidden!important;background:#020617!important;border:1px solid rgba(34,211,238,.34)!important;box-shadow:0 36px 120px rgba(0,0,0,.55)!important;scroll-snap-align:center!important;color:#fff!important;isolation:isolate!important;cursor:pointer!important}
  .owShowCard img,.homeSlideCard.full img,.hfLiveStage .hfLiveCard>img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;filter:saturate(1.08) contrast(1.04)!important}
  .owShowCard:after,.homeSlideCard.full:after,.hfLiveStage .hfLiveCard:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.10) 36%,rgba(2,6,23,.94))!important;z-index:1!important}
  .owShowBody,.homeSlideBody,.hfLiveStage .hfLiveBody{position:absolute!important;left:0!important;right:0!important;bottom:0!important;z-index:2!important;padding:clamp(22px,2.5vw,46px)!important;display:grid!important;gap:13px!important}.owShowBody h2,.homeSlideBody h2,.hfLiveStage .hfLiveBody h2{font-size:clamp(38px,4.8vw,86px)!important;line-height:.9!important;letter-spacing:-.075em!important;margin:0!important;max-width:1120px!important;text-shadow:0 10px 34px rgba(0,0,0,.62)!important}.owShowBody p,.homeSlideBody p,.hfLiveStage .hfLiveBody p{font-size:18px!important;color:#e8f1ff!important;font-weight:1000!important;margin:0!important}
  .owBelow,.hfBelow,.homePlatformGrid{width:100vw!important;max-width:none!important;padding:0 var(--platform-pad)!important;margin:0!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(420px,.7fr)!important;gap:24px!important}.owPanel,.hfPanel,.homeFollowPanel,.viewerProfilePanel{border:1px solid rgba(148,163,184,.16)!important;border-radius:28px!important;background:linear-gradient(180deg,rgba(15,23,42,.70),rgba(15,23,42,.34))!important;padding:22px!important;min-width:0!important}

  /* DISCOVER: wide and focused */
  .hfDiscover{width:100vw!important;max-width:none!important;margin:0!important;padding:28px var(--platform-pad) 80px!important}.hfDiscoverHero,.hfMoodPanel,#zapResult,.hfDiscover>.hfPanel{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}.hfMoodGrid{grid-template-columns:repeat(6,minmax(0,1fr))!important}.hfZap{width:100%!important;min-height:calc(100vh - 260px)!important}.hfZap .hfLiveCard{width:100%!important;min-width:0!important;max-width:none!important;aspect-ratio:16/9!important}.spotlightPlay,.watchShell.twitchWatch{width:100%!important;max-width:none!important}.watchShell.twitchWatch{grid-template-columns:minmax(0,1fr) minmax(360px,430px)!important}.watchShell.twitchWatch .player,.watchShell.twitchWatch .chatPanel{height:calc(100vh - 190px)!important;min-height:640px!important}

  /* CHANNEL: Twitch-like, full page */
  #channel.view.active{padding:0!important;background:#05070d!important}.channelPage.twitchLike,.channelPage.viewerTint,.channelPage{width:100vw!important;max-width:none!important;margin:0!important;padding:0!important;border-radius:0!important;background:#05070d!important;overflow:hidden!important}.channelTopHero{width:100vw!important;min-height:clamp(420px,38vh,620px)!important;border-radius:0!important;border-left:0!important;border-right:0!important;margin:0!important;background:radial-gradient(circle at 12% 20%,rgba(139,92,246,.24),transparent 35%),linear-gradient(135deg,#0b1220,#020617)!important}.channelTopHero>img,.channelTopHero img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;filter:saturate(1.08) contrast(1.06)!important}.channelTopHero:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(2,6,23,.03),rgba(2,6,23,.38) 45%,rgba(2,6,23,.92))!important;z-index:1!important}.channelHeroContent{position:absolute!important;z-index:2!important;left:var(--platform-pad)!important;right:var(--platform-pad)!important;bottom:30px!important;display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:24px!important}.channelIdentity{display:flex!important;align-items:flex-end!important;gap:22px!important;min-width:0!important}.channelIdentity .avatar{width:150px!important;height:150px!important;min-width:150px!important;border-radius:32px!important;border:4px solid rgba(2,6,23,.88)!important;object-fit:cover!important;background:linear-gradient(135deg,var(--brand),var(--cyan))!important}.channelTitleBlock h1{font-size:clamp(64px,5.4vw,112px)!important;line-height:.86!important;letter-spacing:-.09em!important;margin:0 0 8px!important}.channelTitleBlock p{font-size:18px!important;max-width:860px!important;color:#d8e6f8!important;margin:0 0 12px!important}.channelActionDock .btn{min-height:54px!important;border-radius:18px!important;padding:0 20px!important}
  .channelSubNav{width:100vw!important;position:sticky!important;top:68px!important;z-index:45!important;background:rgba(5,7,13,.94)!important;backdrop-filter:blur(16px)!important;padding:0 var(--platform-pad)!important;margin:0!important;border-top:1px solid rgba(255,255,255,.08)!important;border-bottom:1px solid rgba(255,255,255,.10)!important;display:flex!important;gap:22px!important;overflow-x:auto!important}.channelSubNav button{min-height:60px!important;border:0!important;background:transparent!important;color:#d9e4f5!important;font-weight:1000!important;border-bottom:3px solid transparent!important}.channelSubNav button.active{color:#fff!important;border-bottom-color:var(--viewer-accent,var(--brand))!important}
  .channelLiveLayout{width:100vw!important;max-width:none!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(380px,440px)!important;gap:20px!important;padding:24px var(--platform-pad) 0!important;margin:0!important}.channelMainPlayer{min-width:0!important;width:100%!important}.channelMainPlayer .player,.channelMainPlayer .oryonMainPlayer{width:100%!important;height:auto!important;aspect-ratio:16/9!important;min-height:0!important;border-radius:24px!important;background:#000!important;border:1px solid rgba(148,163,184,.18)!important;box-shadow:0 30px 100px rgba(0,0,0,.46)!important;overflow:hidden!important}.channelMainPlayer iframe,.channelMainPlayer video,.channelMainPlayer img,.offlinePoster{width:100%!important;height:100%!important;object-fit:cover!important}.emptyStatePlayer{position:relative!important;width:100%!important;height:100%!important;min-height:100%!important;background:linear-gradient(135deg,#020617,#0f172a)!important}.offlineOverlay{position:absolute!important;inset:0!important;z-index:3!important;display:grid!important;place-items:center!important;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.42),rgba(2,6,23,.78))!important;text-align:center!important}.offlineOverlay h2{font-size:clamp(34px,3vw,62px)!important;letter-spacing:-.06em!important;margin:0 0 8px!important}.channelLiveSidebar{min-width:0!important}.channelLiveSidebar .chatPanel{width:100%!important;max-width:none!important;min-width:0!important;height:calc(100vh - 160px)!important;min-height:640px!important;border-radius:24px!important;position:sticky!important;top:142px!important;resize:none!important}.channelContentGrid{width:100vw!important;max-width:none!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(360px,440px)!important;gap:20px!important;padding:24px var(--platform-pad) 84px!important;margin:0!important}.channelInfoStack{display:grid!important;gap:16px!important}.channelInfoCard{border:1px solid rgba(148,163,184,.16)!important;border-radius:24px!important;background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(15,23,42,.32))!important;padding:22px!important;min-width:0!important}

  /* TEAMS and categories not centered on desktop */
  #teams.view.active,#categories.view.active{padding:30px var(--platform-pad) 90px!important}.teamsHero,.teamsGridFull,.grid{max-width:none!important;width:100%!important}

  @media(max-width:1180px){.owHeroTheater,.hfHero{grid-template-columns:1fr!important;min-height:auto!important}.owLiveTheater,.hfLiveStage{height:auto!important;min-height:auto!important}.owShowCard,.homeSlideCard.full,.hfLiveStage .hfLiveCard{flex-basis:84vw!important;width:84vw!important;min-width:84vw!important}.owBelow,.hfBelow,.homePlatformGrid{grid-template-columns:1fr!important}.hfMoodGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.watchShell.twitchWatch,.channelLiveLayout,.channelContentGrid{grid-template-columns:1fr!important}.channelLiveSidebar .chatPanel{position:relative!important;top:auto!important;height:520px!important;min-height:520px!important}.channelHeroContent{align-items:flex-start!important;flex-direction:column!important}.channelIdentity .avatar{width:104px!important;height:104px!important;min-width:104px!important}.channelTitleBlock h1{font-size:58px!important}}
  @media(max-width:760px){body{--platform-pad:14px}.owHomeFull,.hfHome{padding-bottom:98px!important}.owHeroCopy,.hfHeroCopy{padding:22px!important}.owHeroCopy h1,.hfHeroCopy h1{font-size:clamp(44px,13vw,70px)!important}.owActions,.hfActions{grid-template-columns:1fr!important}.owShowCard,.homeSlideCard.full,.hfLiveStage .hfLiveCard{flex-basis:88vw!important;width:88vw!important;min-width:88vw!important;border-radius:24px!important}.owShowBody,.homeSlideBody,.hfLiveStage .hfLiveBody{padding:16px!important}.owShowBody h2,.homeSlideBody h2,.hfLiveStage .hfLiveBody h2{font-size:28px!important}.hfMoodGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.hfMoodCard{min-height:108px!important}.hfDiscover{padding-bottom:100px!important}.watchShell.twitchWatch .player,.watchShell.twitchWatch .chatPanel{height:420px!important;min-height:420px!important}.channelTopHero{min-height:360px!important}.channelHeroContent{left:14px!important;right:14px!important;bottom:16px!important}.channelIdentity{align-items:flex-start!important;flex-direction:column!important;gap:10px!important}.channelIdentity .avatar{width:84px!important;height:84px!important;min-width:84px!important}.channelTitleBlock h1{font-size:46px!important}.channelSubNav{top:56px!important;padding:0 14px!important}.channelLiveLayout{padding:12px 14px 0!important}.channelContentGrid{padding:16px 14px 110px!important}.channelLiveSidebar .chatPanel{height:420px!important;min-height:420px!important}.channelActionDock{width:100%!important}.channelActionDock .btn{flex:1!important}}
  `;
  document.head.appendChild(st);
})();

function owLiveCardHtml(x,i=0){
  const id=hfLiveId(x);
  const tags=hfTags(x).slice(0,5);
  const safe=encodeURIComponent(JSON.stringify(x));
  return `<article class="owShowCard" data-live-json="${safe}" onclick="hfOpenLive(JSON.parse(decodeURIComponent(this.dataset.liveJson)))">
    ${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:''}
    <div class="owShowBody"><div class="hfTagRow">${tags.map(t=>`<span class="hfTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live vitrine')}</h2><p>${esc(id.name)} · ${esc(id.game)} · ${id.viewers} viewers</p></div>
  </article>`;
}

async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche d’un live vitrine…</h2><p>Oryon privilégie un live entre 30 et 100 viewers.</p></div></div>`;
  try{
    let items=await hfFetchLivePool({mood:'petite-commu',min:30,max:100,lang:'fr'});
    if(!items.length) items=await hfFetchLivePool({mood:'petite-commu',min:15,max:180,lang:'fr'});
    if(!items.length) items=await hfFetchLivePool({mood:'discussion',min:1,max:350,lang:'fr'});
    box.innerHTML=items.length
      ? items.slice(0,10).map((x,i)=>owLiveCardHtml(x,i)).join('')
      : `<div class="hfEmptyLive"><div><h2>Aucun live récupéré.</h2><p>Ajoute TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET sur Render, ou lance un live Oryon natif.</p><button class="btn" onclick="autoProposeLive()">Relancer</button></div></div>`;
  }catch(e){
    console.error(e);
    box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche indisponible.</h2><p>Le serveur n’a pas pu récupérer les lives. Réessaie après vérification des variables Twitch.</p><button class="btn" onclick="loadHomeRecommendations()">Réessayer</button></div></div>`;
  }
}

async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<div class="owHomeFull"><section class="owHeroTheater"><div class="owHeroCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><p>Un grand live vitrine entre 30 et 100 viewers. Oryon élargit si besoin, sans laisser l’accueil vide.</p><div class="owMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="owActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="owLiveTheater"></div></section><div class="owBelow"><section class="owPanel">${viewerProfileCard?.()||'<h2>Profil Viewer</h2>'}</section><section class="owPanel"><div class="proTwitchHead"><div><h2>Tes suivis Twitch en ligne</h2><p>Uniquement les chaînes live, en bandeau avec miniature.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact" class="hfRail"></div></section></div></div>`;
  await loadHomeRecommendations();
  await renderCompactFollowed?.();
  closeMini?.();
}


/* =====================================================================
   Oryon user-request final pass — home 3-up, viewer memory, viewer/streamer mode,
   fixed discover mood, followed rail + 6 multiwatch slots
   ===================================================================== */
(function injectOryonUserRequestFinalPass(){
  const old=document.getElementById('oryonUserRequestFinalPass');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonUserRequestFinalPass';
  st.textContent=`
  .owHeroTheater.userFixHero{grid-template-columns:minmax(340px,28vw) minmax(0,1fr)!important;min-height:calc(100vh - 72px)!important}
  .owHeroCopy.userFixCopy p{display:none!important}
  .owLiveTheater.userFix3{display:grid!important;grid-template-columns:1.35fr .92fr .92fr!important;gap:18px!important;align-items:stretch!important;overflow:visible!important;height:auto!important;min-height:calc(100vh - 72px)!important;padding:clamp(22px,2.6vw,48px) var(--platform-pad)!important}
  .owLiveTheater.userFix3 .owShowCard{width:100%!important;min-width:0!important;max-width:none!important;flex:none!important;height:100%!important;min-height:min(70vh,780px)!important}
  .owLiveTheater.userFix3 .owShowCard:first-child{min-height:min(76vh,860px)!important}
  .owLiveTheater.userFix3 .owShowBody h2{font-size:clamp(36px,3.8vw,72px)!important}
  .owLiveTheater.userFix3 .owShowCard:nth-child(n+2) .owShowBody h2{font-size:clamp(28px,2.8vw,46px)!important}
  .owLiveTheater.userFix3 .owShowCard:nth-child(n+2) .owShowBody{padding:24px!important}
  .owLiveTheater.userFix3 .owShowCard:nth-child(n+2) .owShowBody p{font-size:15px!important}
  .modeSwitch{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.modeSwitch .btn{min-height:44px}.modeBadge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(34,211,238,.32);background:rgba(34,211,238,.08);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000}
  .followCardActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.followCardActions .btn{min-height:36px;padding:0 12px;border-radius:12px;font-size:12px}
  .hfFollowMiniRail{display:flex;gap:12px;overflow:auto;padding:6px 0 14px}.hfFollowMiniCard{position:relative;min-width:250px;width:250px;aspect-ratio:16/9;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.16);background:#020617;color:#fff;text-align:left}.hfFollowMiniCard img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hfFollowMiniCard:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(2,6,23,.92));z-index:1}.hfFollowMiniCard .content{position:absolute;z-index:2;left:10px;right:10px;bottom:10px}.hfFollowMiniCard .content b{font-size:18px}.hfFollowMiniCard .avatar{width:36px;height:36px;border-radius:12px;object-fit:cover;border:2px solid rgba(255,255,255,.22);background:#111827}.hfFollowMiniCard .top{position:absolute;top:10px;left:10px;right:10px;z-index:2;display:flex;justify-content:space-between;gap:8px}.hfFollowMiniCard .pillLive{border-radius:999px;padding:6px 10px;background:rgba(16,185,129,.9);font-size:12px;font-weight:1000}
  .multiWatchDock{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.multiSlot{border:1px dashed rgba(148,163,184,.24);border-radius:18px;min-height:180px;background:rgba(255,255,255,.03);overflow:hidden;position:relative}.multiSlot.drag{border-color:rgba(34,211,238,.8);background:rgba(34,211,238,.08)}.multiSlot iframe{display:block;width:100%;height:120px;border:0;background:#000}.multiSlotHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}.multiSlotBody{padding:10px;display:grid;gap:8px}.multiSlotEmpty{height:100%;display:grid;place-items:center;text-align:center;color:#8ea0bb;padding:14px}.multiSlotActions{display:flex;gap:8px;flex-wrap:wrap}.multiSlotActions .btn{min-height:34px;padding:0 10px;border-radius:10px;font-size:12px}
  .discoverAccessStack{display:grid;gap:14px}
  @media(max-width:1180px){.owLiveTheater.userFix3{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important}.owLiveTheater.userFix3 .owShowCard{min-width:84vw!important;width:84vw!important;scroll-snap-align:center!important}.multiWatchDock{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:760px){.multiWatchDock{grid-template-columns:1fr}.hfFollowMiniCard{min-width:78vw;width:78vw}.owLiveTheater.userFix3 .owShowCard{min-width:88vw!important;width:88vw!important}}
  `;
  document.head.appendChild(st);
})();

function appModeKey(){return 'oryon_app_mode:'+String(state.session?.local?.login||state.session?.twitch?.login||'guest').toLowerCase()}
function getAppMode(){try{return localStorage.getItem(appModeKey()) || (state.session?.local?'streamer':'viewer')}catch(_){return state.session?.local?'streamer':'viewer'}}
function setAppMode(mode){ try{ localStorage.setItem(appModeKey(), mode); }catch(_){} state.appMode=mode; renderUserMenu?.(); toast?.(mode==='streamer'?'Mode streamer activé':'Mode viewer activé'); if(mode==='streamer'){ return setView(state.session?.local?'manager':'settings'); } return setView('settings'); }

function viewerUserKey(){
  const u = state.session?.local?.login || state.session?.twitch?.login || state.session?.local?.id || 'guest';
  return 'oryon_viewer_profile_v3:'+String(u).toLowerCase();
}
function viewerSeenKey(){
  const u = state.session?.local?.login || state.session?.twitch?.login || state.session?.local?.id || 'guest';
  return 'oryon_seen_lives_v3:'+String(u).toLowerCase();
}
function viewerProfileV2(){
  const old = loadViewerImpact?.() || {};
  const guest = readJsonSafe('oryon_viewer_profile_v3:guest', null) || {};
  const current = readJsonSafe(viewerUserKey(), null) || {};
  const base = Object.keys(current).length ? current : guest;
  const p = {...base};
  p.aura = Number(p.aura ?? old.points ?? 0);
  p.discoveries = Array.isArray(p.discoveries) ? p.discoveries : (old.discoveries || []);
  p.saved = Array.isArray(p.saved) ? p.saved : (savedLives?.() || []);
  p.supports = Array.isArray(p.supports) ? p.supports : (old.firstSupports || []);
  p.badges = Array.isArray(p.badges) ? p.badges : (old.badges || ['Explorateur']);
  p.likedChannels = Array.isArray(p.likedChannels) ? p.likedChannels : [];
  p.rejectedChannels = Array.isArray(p.rejectedChannels) ? p.rejectedChannels : [];
  p.likedCategories = Array.isArray(p.likedCategories) ? p.likedCategories : [];
  p.moodCounts = p.moodCounts && typeof p.moodCounts === 'object' ? p.moodCounts : {};
  return p;
}
function saveViewerProfileV2(p){ writeJsonSafe(viewerUserKey(), p); }

function renderUserMenu(){
  const u=state.session.local, t=state.session.twitch; $('#userAvatar').src=u?.avatar_url||t?.profile_image_url||''; $('#userLabel').textContent=u?.display_name||u?.login||t?.display_name||'Compte';
  const mode=getAppMode();
  const parts=[];
  if(u||t){
    parts.push(`<div class="small" style="padding:10px 12px">Compte actif<br><b>${esc(u?.display_name||u?.login||t?.display_name||t?.login||'Utilisateur')}</b><br><span class="modeBadge" style="margin-top:8px">${mode==='streamer'?'🎥 Mode streamer':'👁️ Mode viewer'}</span></div>`);
    parts.push(`<div class="modeSwitch" style="padding:0 12px 8px"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div>`);
    parts.push(`<div class="sep"></div>`);
  }
  if(u){ parts.push(`<button onclick="state.watchRoom=null;setView('channel')">Ma chaîne</button>`); parts.push(`<button onclick="setView('manager')">Gestionnaire de stream</button>`); parts.push(`<button onclick="setView('dashboard')">Tableau de bord créateur</button>`); parts.push(`<button onclick="setView('studio')">Outils créateur</button>`); parts.push(`<div class="sep"></div>`); }
  parts.push(`<button onclick="setView('settings')">Profil, connexions, paramètres</button>`);
  parts.push(t?`<button onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button onclick="connectTwitch()">Connecter Twitch</button>`);
  if(u) parts.push(`<button onclick="logoutOryon()">Déconnecter Oryon</button>`);
  if(isAdmin()) parts.push(`<div class="sep"></div><button onclick="setView('admin')">Administration</button>`);
  $('#userMenu').innerHTML=parts.join('');
}

async function renderSettings(){
  let u=state.session.local;
  if(u?.login){ try{ const pr=await api('/api/oryon/profile/'+encodeURIComponent(u.login)); if(pr.success&&pr.user)u=pr.user; }catch(_){} }
  const mode=getAppMode();
  $('#settings').innerHTML=`<div class="pageHead"><div><h1>${mode==='streamer'?'Page streamer':'Page viewer'}</h1><p>${mode==='streamer'?'Ton espace créateur et ton menu stream.':'Ton profil viewer, tes goûts, ta mémoire et tes connexions.'}</p></div><div class="modeSwitch"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div></div>
  <div class="two section"><div class="panel">${mode==='viewer'?viewerProfileCard():(u?profileSettings(u):authSettings())}</div><div class="panel">${mode==='streamer' ? (u ? `<h2>Menu stream</h2><div class="summaryList"><div class="summaryItem"><b>Ma chaîne</b><p class="small">Page publique, lecteur et chat.</p><button class="btn" onclick="setView('channel')">Ouvrir ma chaîne</button></div><div class="summaryItem"><b>Gestionnaire de stream</b><p class="small">Préparer, lancer et configurer ton live Oryon.</p><button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button></div><div class="summaryItem"><b>Outils créateur</b><p class="small">Studio, overlays et outils de chaîne.</p><button class="btn" onclick="setView('studio')">Ouvrir les outils</button></div></div>` : authSettings()) : `<h2>Connexions</h2><div class="summaryList"><div class="summaryItem"><b>Twitch</b><p class="small">${state.session.twitch?'Connecté : '+esc(state.session.twitch.display_name||state.session.twitch.login):'Non connecté. Connecte Twitch pour retrouver tes suivis et améliorer les recommandations.'}</p><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="summaryItem"><b>Mémoire viewer</b><p class="small">Conserve tes swipes, pépites vues et chaînes aimées même après navigation ou reconnexion.</p><button class="btn secondary" onclick="toast('La mémoire viewer est locale et persistante dans ce navigateur.')">Compris</button></div></div>`}</div></div>`;
  bindSettingsForms?.();
}

function multiWatchKey(){ return 'oryon_multiwatch_v1:'+String(state.session?.local?.login||state.session?.twitch?.login||'guest').toLowerCase(); }
function loadMultiWatch(){ const v=readJsonSafe(multiWatchKey(), null); return Array.isArray(v) && v.length===6 ? v : Array.from({length:6},()=>null); }
function saveMultiWatch(v){ writeJsonSafe(multiWatchKey(), (v||[]).slice(0,6)); }
function oryonDragLive(ev, payload){ try{ ev.dataTransfer.setData('text/oryon-live', payload); ev.dataTransfer.effectAllowed='copy'; }catch(_){} }
function addLiveToMultiWatch(meta, preferredIndex){
  if(!meta?.login) return;
  const slots=loadMultiWatch();
  let idx = Number.isInteger(preferredIndex) ? preferredIndex : slots.findIndex(x=>!x);
  if(idx<0) idx=0;
  slots[idx]={login:meta.login,name:meta.name||meta.login,game:meta.game||'',img:meta.img||'',viewers:Number(meta.viewers||0)};
  saveMultiWatch(slots);
  renderMultiWatchDock();
  toast?.('Live ajouté dans la mosaïque');
}
function clearMultiWatchSlot(idx){ const slots=loadMultiWatch(); slots[idx]=null; saveMultiWatch(slots); renderMultiWatchDock(); }
function multiWatchAllow(ev){ ev.preventDefault(); const slot=ev.currentTarget; if(slot) slot.classList.add('drag'); }
function multiWatchLeave(ev){ const slot=ev.currentTarget; if(slot) slot.classList.remove('drag'); }
function multiWatchDrop(ev, idx){ ev.preventDefault(); const slot=ev.currentTarget; if(slot) slot.classList.remove('drag'); let raw=''; try{ raw=ev.dataTransfer.getData('text/oryon-live')||''; }catch(_){} if(!raw) return; try{ addLiveToMultiWatch(JSON.parse(decodeURIComponent(raw)), idx); }catch(_){} }
function renderMultiWatchDock(){
  const box=$('#multiWatchDock'); if(!box) return;
  const slots=loadMultiWatch();
  box.innerHTML=slots.map((slot,idx)=> slot ? `<div class="multiSlot"><div class="multiSlotHead"><b>${esc(slot.name||slot.login)}</b><button class="btn secondary" onclick="clearMultiWatchSlot(${idx})">Vider</button></div><iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(slot.login)}&parent=${encodeURIComponent(location.hostname)}&autoplay=false&muted=true"></iframe><div class="multiSlotBody"><div class="small">${esc(slot.game||'Live Twitch')}</div><div class="multiSlotActions"><button class="btn" onclick="openTwitch('${esc(slot.login)}')">Grand format</button><button class="btn secondary" onclick="clearMultiWatchSlot(${idx})">Retirer</button></div></div></div>` : `<div class="multiSlot" ondragover="multiWatchAllow(event)" ondragleave="multiWatchLeave(event)" ondrop="multiWatchDrop(event,${idx})"><div class="multiSlotEmpty"><div><b>Case ${idx+1}</b><br>Glisse un live ici</div></div></div>`).join('');
}

function compactFollowCardHtml(x, withActions=true){
  const id=hfLiveId({...x,platform:'twitch'});
  const payload=encodeURIComponent(JSON.stringify({login:id.login,name:id.name,game:id.game,img:id.img,viewers:id.viewers,platform:'twitch'}));
  return `<article class="hfFollowMiniCard" draggable="true" ondragstart="oryonDragLive(event,'${payload}')"><img class="bg" src="${esc(id.img)}" alt=""><div class="top"><span class="pillLive">Live · ${id.viewers}</span></div><div class="content"><img class="avatar" src="${esc(x.profile_image_url||'')}" alt=""><div style="margin-top:8px"><b>${esc(id.name)}</b><div class="small">${esc(id.game)}</div>${withActions?`<div class="followCardActions"><button class="btn" onclick="event.stopPropagation();openTwitch('${esc(id.login)}')">Ouvrir</button><button class="btn secondary" onclick="event.stopPropagation();addLiveToMultiWatch(${JSON.stringify({'__js__':'meta'})})">Ajouter</button></div>`.replace('addLiveToMultiWatch({"__js__":"meta"})',`addLiveToMultiWatch(JSON.parse(decodeURIComponent('${payload}')))`):''}</div></div></article>`;
}

async function renderCompactFollowed(){
  const el=$('#followedWrapCompact'); if(!el) return;
  if(!state.session.twitch){ el.innerHTML='<div class="followEmpty">Connecte Twitch pour afficher le fil de tes chaînes suivies en miniature.</div>'; renderMultiWatchDock?.(); return; }
  let r=await api('/api/twitch/followed/status').catch(()=>({items:[]}));
  let items=(r.items||[]).filter(x=>x.is_live || Number(x.viewer_count||0)>0);
  if(!items.length){ r=await api('/api/twitch/followed/live').catch(()=>({items:[]})); items=(r.items||[]); }
  el.innerHTML=items.length ? items.slice(0,18).map(x=>compactFollowCardHtml(x,true)).join('') : '<div class="followEmpty">Aucun suivi Twitch en ligne maintenant.</div>';
  renderMultiWatchDock?.();
}

async function searchTwitch(){
  const q=$('#twSearch')?.value?.trim(); if(!q) return;
  const res=await api('/api/twitch/channels/search?'+qs({q,live:true})).catch(()=>({items:[]}));
  const box=$('#twResults'); if(!box) return;
  box.innerHTML=(res.items||[]).map(x=>{
    const id=hfLiveId({...x,platform:'twitch'});
    const payload=encodeURIComponent(JSON.stringify({login:id.login,name:id.name,game:id.game,img:id.img,viewers:id.viewers,platform:'twitch'}));
    return `<article class="hfFollowMiniCard" draggable="true" ondragstart="oryonDragLive(event,'${payload}')"><img class="bg" src="${esc(id.img)}" alt=""><div class="top"><span class="pillLive">${x.is_live?'Live':'Résultat'}</span></div><div class="content"><img class="avatar" src="${esc(x.profile_image_url||'')}" alt=""><div style="margin-top:8px"><b>${esc(id.name)}</b><div class="small">${esc(id.game||x.game_name||'Twitch')}</div><div class="followCardActions"><button class="btn" onclick="event.stopPropagation();openTwitch('${esc(id.login)}')">Ouvrir</button><button class="btn secondary" onclick="event.stopPropagation();addLiveToMultiWatch(JSON.parse(decodeURIComponent('${payload}')))">Ajouter</button></div></div></div></article>`;
  }).join('') || '<div class="followEmpty">Aucun résultat.</div>';
}

async function hfFetchLivePool({mood='petite-commu', q='', min=0, max=200, lang='fr'}={}){
  const calls=[];
  calls.push(api('/api/oryon/discover/find-live?'+qs({q, mood, max, lang, source:'both'})).catch(()=>({items:[]})));
  calls.push(api(`/api/twitch/streams/small?lang=${encodeURIComponent(lang)}&min=${encodeURIComponent(min)}&max=${encodeURIComponent(max)}`).catch(()=>({items:[]})));
  if(state.session?.twitch) calls.push(api('/api/twitch/followed/live').catch(()=>({items:[]})));
  calls.push(api('/api/native/lives').catch(()=>({items:[]})));
  const results=await Promise.all(calls);
  const out=[]; const keys=new Set();
  for(const r of results){
    for(const item of (r.items||[])){
      const x={...item, platform:item.platform || (item.host_login||item.room?'oryon':'twitch')};
      const id=hfLiveId(x); if(!id.login) continue;
      const v=id.viewers; if(v<min || v>Math.max(max, min)) continue;
      const k=hfLiveKey(x); if(keys.has(k)) continue; keys.add(k); out.push(x);
    }
  }
  return out.sort((a,b)=>hfMoodScore(b,mood)-hfMoodScore(a,mood));
}

function owLiveCardHtml(x,i=0){
  const id=hfLiveId(x);
  const tags=hfTags(x).slice(0,4);
  const safe=encodeURIComponent(JSON.stringify(x));
  return `<article class="owShowCard" data-live-json="${safe}" onclick="hfOpenLive(JSON.parse(decodeURIComponent(this.dataset.liveJson)))">${id.img?`<img src="${esc(id.img)}" alt="" loading="${i?'lazy':'eager'}">`:''}<div class="owShowBody"><div class="hfTagRow">${tags.map(t=>`<span class="hfTag">${esc(t)}</span>`).join('')}</div><h2>${esc(id.title||'Live vitrine')}</h2><p>${esc(id.name)} · ${esc(id.game)} · ${id.viewers} viewers</p></div></article>`;
}

async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche des 3 lives recommandés…</h2></div></div>`;
  try{
    let items=await hfFetchLivePool({mood:'petite-commu',min:30,max:100,lang:'fr'});
    if(!items.length) items=await hfFetchLivePool({mood:'petite-commu',min:15,max:180,lang:'fr'});
    if(!items.length) items=await hfFetchLivePool({mood:'discussion',min:1,max:350,lang:'fr'});
    box.innerHTML=items.length ? items.slice(0,3).map((x,i)=>owLiveCardHtml(x,i)).join('') : `<div class="hfEmptyLive"><div><h2>Aucun live récupéré.</h2><p>Vérifie les variables Twitch sur Render, ou lance un live Oryon natif.</p><button class="btn" onclick="autoProposeLive()">Relancer</button></div></div>`;
  }catch(e){
    console.error(e);
    box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche indisponible.</h2><p>Le serveur n’a pas pu récupérer les lives.</p><button class="btn" onclick="loadHomeRecommendations()">Réessayer</button></div></div>`;
  }
}

async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<div class="owHomeFull"><section class="owHeroTheater userFixHero"><div class="owHeroCopy userFixCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><div class="owMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="owActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="owLiveTheater userFix3"></div></section><div class="owBelow"><section class="owPanel">${viewerProfileCard?.()||'<h2>Profil Viewer</h2>'}</section><section class="owPanel"><div class="proTwitchHead"><div><h2>Tes suivis Twitch en ligne</h2><p>Fil de chaînes suivies en miniature.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact" class="hfFollowMiniRail"></div></section></div></div>`;
  await loadHomeRecommendations();
  await renderCompactFollowed();
  closeMini?.();
}

async function renderDiscover(){
  const el=$('#discover'); if(!el) return;
  const current=state.moodFirstMood||'petite-commu';
  state.zap.items=[]; state.zap.index=0; state.discoverPlayer=null;
  el.innerHTML=`<div class="hfDiscover"><section class="hfDiscoverHero"><div><span class="eyebrow"><i class="dot"></i>Oryon Flow</span><h1>Choisis ton mood.</h1><p>Un tap lance une vraie proposition. Ensuite tu swipes : droite si ça te parle, gauche si ce n’est pas ta vibe.</p></div><div class="hfDiscoverHint"><span>mood</span><span>live</span><span>swipe</span></div></section><section class="hfMoodPanel"><div class="hfMoodHead"><h2>Ambiance</h2><span class="moodFirstSelected">${esc(moodFirstLabel?.(current)||current)}</span></div><div class="hfMoodGrid">${AMBIANCES.map(([id,label,desc,icon])=>`<button class="hfMoodCard ${id===current?'active':''}" onclick="setDiscoverMood('${esc(id)}')"><i>${icon}</i><b>${esc(label)}</b><span>${esc(desc)}</span></button>`).join('')}</div><details class="hfAdvanced"><summary>Options avancées</summary><div class="hfAdvancedBody"><input id="dQuery" placeholder="jeu, pseudo, ambiance" onkeydown="if(event.key==='Enter')findLive()"><select id="dMax"><option value="80">≤80</option><option value="150" selected>≤150</option><option value="300">≤300</option><option value="500">≤500</option></select><select id="dLang"><option value="fr">FR</option><option value="en">EN</option></select><button class="btn secondary" onclick="localStorage.removeItem(hfSeenKey());findLive()">Réinitialiser swipes</button><button class="btn" onclick="findLive()">Relancer</button></div></details></section><section id="zapResult"></section><section class="hfPanel"><div class="discoverAccessStack"><div class="proTwitchHead"><div><h2>Accès Twitch</h2><p>Fil des chaînes suivies en miniature, puis mosaïque 6 cases pour garder plusieurs lives sous la main.</p></div><div>${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div id="followedWrapCompact" class="hfFollowMiniRail"></div><div class="proTwitchSearch"><input id="twSearch" placeholder="chercher un streamer Twitch" onkeydown="if(event.key==='Enter')searchTwitch()"><button class="btn" onclick="searchTwitch()">Chercher</button></div><div id="multiWatchDock" class="multiWatchDock"></div><div id="twResults" class="hfFollowMiniRail"></div></div></section></div>`;
  await renderCompactFollowed();
  renderMultiWatchDock();
  await findLive();
  closeMini?.();
}


/* =========================================================
   Oryon polish pass — settings/profile/channel layout fixes
   ========================================================= */
(function injectOryonPolishFixStyle(){
  const old=document.getElementById('oryonPolishFixStyle');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonPolishFixStyle';
  st.textContent=`
  .settingsShell{width:100%;padding:26px var(--site-pad,clamp(18px,2.4vw,48px)) 54px;display:grid;gap:22px}
  .settingsHero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.settingsHero h1{margin:0;font-size:clamp(38px,3vw,60px);line-height:.95}.settingsHero p{margin:8px 0 0;color:#a9b8cf;max-width:860px}
  .settingsGrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:18px}.settingsStack{display:grid;gap:18px}
  .authCenterWrap{display:grid;place-items:center;min-height:calc(100vh - 180px);padding:16px 0}.authCenterGrid{width:min(1080px,100%);display:grid;grid-template-columns:repeat(2,minmax(320px,420px));justify-content:center;gap:22px}.authCard{padding:26px;border:1px solid rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(17,24,39,.98),rgba(8,14,26,.98));border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.26)}.authCard h2{margin:0 0 8px}.authCard p{margin:0 0 16px;color:#9fb0c7;font-size:14px}.authCard .btn{margin-top:12px;min-height:48px}.authCard input,.authCard textarea,.authCard select{min-height:48px}
  .viewerProfileInline{display:grid;gap:18px}
  .channelPage.twitchLike.viewerTint{width:100%;max-width:none;padding:0 var(--site-pad,clamp(18px,2.4vw,48px)) 56px;display:grid;gap:20px}
  .channelTopHero{min-height:340px;border-radius:0 0 30px 30px;overflow:hidden;position:relative}.channelTopHero img{width:100%;height:100%;object-fit:cover;display:block}.channelTopHero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,7,18,.12),rgba(3,7,18,.45) 55%,rgba(3,7,18,.88))}
  .channelHeroContent{position:absolute;inset:auto 0 0 0;z-index:2;padding:34px var(--site-pad,clamp(18px,2.4vw,48px)) 24px;display:flex;justify-content:space-between;gap:24px;align-items:flex-end;flex-wrap:wrap}
  .channelIdentity{display:flex !important;align-items:flex-end !important;gap:22px !important;min-width:0;max-width:min(100%,980px)}
  .channelIdentity .avatar{width:112px !important;height:112px !important;min-width:112px;border-radius:28px;object-fit:cover;object-position:center center;background:linear-gradient(135deg,#52f36a,#36cfd7);border:3px solid rgba(255,255,255,.18);box-shadow:0 20px 50px rgba(0,0,0,.30);position:relative!important;left:auto!important;top:auto!important;margin:0!important}
  .channelTitleBlock{display:grid;gap:10px;min-width:0;padding-left:0!important;margin-left:0!important}
  .channelTitleBlock h1{margin:0 !important;font-size:clamp(40px,5.6vw,88px);line-height:.9;letter-spacing:-.05em;word-break:break-word;text-shadow:0 10px 40px rgba(0,0,0,.35)}
  .channelTitleBlock p{margin:0;color:#c8d4ea;font-size:16px;max-width:78ch}
  .channelActionDock{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.channelActionDock .btn{min-height:48px;border-radius:16px}
  .channelSubNav{display:flex;gap:10px;flex-wrap:wrap;padding:0 0 2px;border-bottom:1px solid rgba(255,255,255,.08)}
  .channelLiveLayout{display:grid !important;grid-template-columns:minmax(0,1fr) clamp(320px,26vw,430px);gap:18px;align-items:stretch}
  .channelMainPlayer,.channelLiveSidebar{min-width:0}.channelMainPlayer .player,.channelLiveSidebar .chatPanel{height:100%;min-height:clamp(560px,68vh,920px)}
  .channelMainPlayer .player{border-radius:28px;overflow:hidden;border:1px solid rgba(148,163,184,.16);background:#020617}
  .channelLiveSidebar{display:flex;min-height:0}.channelLiveSidebar .chatPanel{width:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto auto auto;overflow:hidden;border-radius:28px;border:1px solid rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(8,12,22,.97),rgba(4,8,18,.97))}
  .channelLiveSidebar .chatHeader,.channelLiveSidebar .chatAssist,.channelLiveSidebar .chatForm{padding-left:14px;padding-right:14px}.channelLiveSidebar .chatHeader{padding-top:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)}
  .channelLiveSidebar .chatLog{min-height:0;height:auto;padding:14px;overflow:auto}.channelLiveSidebar .chatAssist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding-top:12px}.channelLiveSidebar .chatAssist button{min-height:40px}.channelLiveSidebar .chatForm{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;padding-top:12px;padding-bottom:14px;border-top:1px solid rgba(255,255,255,.08)}
  .channelContentGrid{display:grid;grid-template-columns:minmax(0,1fr) clamp(300px,24vw,360px);gap:18px;align-items:start}.channelInfoStack{display:grid;gap:18px}.channelInfoCard{border-radius:24px}
  .viewerProfileCompact .impactGrid{grid-template-columns:repeat(3,minmax(0,1fr))}
  @media (max-width:1100px){.settingsGrid{grid-template-columns:1fr}.channelLiveLayout,.channelContentGrid{grid-template-columns:1fr}.channelMainPlayer .player,.channelLiveSidebar .chatPanel{min-height:460px}.channelHeroContent{align-items:flex-start}.channelLiveSidebar .chatForm{grid-template-columns:1fr 1fr}.channelLiveSidebar .chatForm input{grid-column:1/-1}.authCenterGrid{grid-template-columns:1fr}}
  @media (max-width:760px){.channelTopHero{min-height:300px}.channelHeroContent{padding:22px 16px 18px}.channelIdentity{align-items:center !important;gap:14px !important}.channelIdentity .avatar{width:84px !important;height:84px !important;min-width:84px}.channelTitleBlock h1{font-size:clamp(30px,9vw,48px)}.channelLiveSidebar .chatAssist{grid-template-columns:1fr}.channelLiveSidebar .chatForm{grid-template-columns:1fr 1fr}.authCard{padding:20px}}
  `;
  document.head.appendChild(st);
})();

function authSettings(){
  return `<div class="authCenterWrap"><div class="authCenterGrid"><form id="loginForm" class="authCard"><h2>Connexion Oryon</h2><p>Connecte-toi pour retrouver ta chaîne, ton profil viewer et ton menu stream.</p><input id="loginName" placeholder="pseudo"><input id="loginPass" type="password" placeholder="mot de passe"><button class="btn">Se connecter</button></form><form id="registerForm" class="authCard"><h2>Créer un compte</h2><p>Crée ton compte Oryon dans un espace propre et centré.</p><input id="regName" placeholder="pseudo"><input id="regEmail" type="email" placeholder="email"><input id="regPass" type="password" placeholder="mot de passe"><button class="btn">Créer</button></form></div></div>`;
}

function viewerProfilePanel(){
  return `<section class="panel viewerProfileCompact"><h2>Profil viewer</h2><p class="small">Visible aussi depuis ton profil Oryon quand tu es connecté.</p>${viewerProfileCard()}</section>`;
}

async function renderSettings(){
  const root = $('#settings'); if(!root) return;
  let u=state.session.local;
  if(u?.login){ try{ const pr=await api('/api/oryon/profile/'+encodeURIComponent(u.login)); if(pr.success&&pr.user) u=pr.user; }catch(_){} }
  const mode=getAppMode();
  if(!u){
    root.innerHTML=`<div class="settingsShell"><div class="settingsHero"><div><h1>${mode==='streamer'?'Page streamer':'Page viewer'}</h1><p>${mode==='streamer'?'Crée ou connecte ton compte pour débloquer le menu stream et ta chaîne Oryon.':'Crée ou connecte ton compte pour conserver ton profil viewer, tes préférences et ta mémoire.'}</p></div><div class="modeSwitch"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div></div>${authSettings()}<section class="panel"><h2>Connexions externes</h2><div class="summaryList"><div class="summaryItem"><b>Twitch</b><p class="small">${state.session.twitch?'Connecté : '+esc(state.session.twitch.display_name||state.session.twitch.login):'Non connecté. Connecte Twitch pour remonter tes suivis et nourrir les recommandations.'}</p><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div></div></section></div>`;
    bindSettingsForms?.();
    return;
  }
  root.innerHTML=`<div class="settingsShell"><div class="settingsHero"><div><h1>${mode==='streamer'?'Page streamer':'Page viewer'}</h1><p>${mode==='streamer'?'Ton espace créateur, ton menu stream et aussi ton profil viewer dans la même page de profil.':'Ton profil viewer complet, ta mémoire et tes connexions Oryon / Twitch.'}</p></div><div class="modeSwitch"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div></div>${mode==='viewer'?`<div class="settingsStack">${viewerProfilePanel()}<section class="panel"><h2>Connexions</h2><div class="summaryList"><div class="summaryItem"><b>Twitch</b><p class="small">${state.session.twitch?'Connecté : '+esc(state.session.twitch.display_name||state.session.twitch.login):'Non connecté. Connecte Twitch pour retrouver tes suivis et améliorer les recommandations.'}</p><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="summaryItem"><b>Mémoire viewer</b><p class="small">Conserve tes swipes, pépites vues, chaînes aimées et sauvegardes dans ce navigateur.</p><button class="btn secondary" onclick="toast('La mémoire viewer est bien conservée pour ton compte Oryon dans ce navigateur.')">Compris</button></div><div class="summaryItem"><b>Compte Oryon</b><p class="small">Connecté en tant que ${esc(u.display_name||u.login)}.</p><button class="btn secondary" onclick="logoutOryon()">Déconnecter Oryon</button></div></div></section></div>`:`<div class="settingsGrid"><div class="settingsStack"><section class="panel">${profileSettings(u)}</section>${viewerProfilePanel()}</div><div class="settingsStack"><section class="panel"><h2>Menu stream</h2><div class="summaryList"><div class="summaryItem"><b>Ma chaîne</b><p class="small">Page publique, lecteur géant et tchat adaptatif.</p><button class="btn" onclick="setView('channel')">Ouvrir ma chaîne</button></div><div class="summaryItem"><b>Gestionnaire</b><p class="small">Préparer, lancer et configurer ton live Oryon.</p><button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button></div><div class="summaryItem"><b>Outils créateur</b><p class="small">Studio, overlays et outils de chaîne.</p><button class="btn" onclick="setView('studio')">Ouvrir les outils</button></div><div class="summaryItem"><b>Twitch</b><p class="small">${state.session.twitch?'Connecté : '+esc(state.session.twitch.display_name||state.session.twitch.login):'Non connecté. Connecte Twitch pour relier tes suivis et ton profil viewer.'}</p><div class="row">${state.session.twitch?`<button class="btn secondary" onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button class="btn" onclick="connectTwitch()">Connecter Twitch</button>`}</div></div><div class="summaryItem"><b>Compte</b><p class="small">Déconnecte-toi si besoin.</p><button class="btn secondary" onclick="logoutOryon()">Déconnecter Oryon</button></div></div></section><section id="planningSettings" class="panel"></section></div></div>`}</div>`;
  bindSettingsForms?.();
  loadFoundation?.();
  if(u && mode==='streamer') renderPlanning?.();
}

async function renderChannel(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner;
  const banner=p.banner_url||p.offline_image_url||'';
  const offlineImg=p.offline_image_url||p.banner_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const supportCount=Number(support?.count||0);
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=fwLiveMediaHtml(p,isOwner,isLive,offlineImg);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'') || ''}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span><span class="pill">${supportCount} premiers soutiens</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div></div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="chanTab(this,'about')">Accueil</button><button onclick="chanTab(this,'about')">À propos</button><button onclick="chanTab(this,'planning')">Planning</button><button onclick="chanTab(this,'clips')">Clips</button><button onclick="setView('studio')">Badges / emotes</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section><section class="channelContentGrid"><div class="channelInfoStack"><div class="channelInfoCard channelCustomizer full"><div><h3>Personnalisation viewer</h3><p class="small">Change la couleur de la page selon ton goût.</p></div><div class="themeControl"><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}" oninput="setViewerThemeColor(this.value)"><button class="btn" onclick="setViewerThemeColor('#8b5cf6')">Violet</button><button class="btn secondary" onclick="setViewerThemeColor('#06b6d4')">Cyan</button><button class="btn secondary" onclick="setViewerThemeColor('#22c55e')">Vert</button></div></div><div class="channelInfoCard"><h2>Pourquoi entrer ici ?</h2><div class="channelBadgesBar"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span>${channelBadges.slice(0,5).map(b=>`<span class="reasonChip">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}</div></div><div id="channelTab" class="channelInfoCard"></div></div><aside class="channelInfoStack"><div class="channelInfoCard"><h3>Badges visibles</h3><div class="channelBadgeRail tight">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div><div class="channelInfoCard"><h3>Premiers soutiens</h3>${(support.first_supporters||[]).length?(support.first_supporters||[]).slice(0,8).map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(' '):'<p class="muted">Premiers soutiens à venir.</p>'}</div></aside></section></div>`;
  applyViewerThemeColor?.();
  if(isLive) setMiniLive?.({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  chanTab?.(null,'about');
  setupSocket?.(); state.room=targetLogin; state.socket?.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){ attachCurrentStream?.(); }
  else if(isLive){ state.socket?.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer?.(),500); } }
  updateLiveUi?.(isLive);
  refreshEmoteShelf?.(targetLogin);
}


/* =========================================================
   Oryon final requested fixes — discovery home, global theme, channel chat fit
   ========================================================= */
(function injectOryonFinalRequestedCss(){
  const old=document.getElementById('oryonFinalRequestedCss'); if(old) old.remove();
  const st=document.createElement('style'); st.id='oryonFinalRequestedCss';
  st.textContent=`
  body,.app,#home,#discover,#settings,#channel{background:radial-gradient(circle at 0 8%,color-mix(in srgb,var(--viewer-accent,#8b5cf6) 18%,transparent),transparent 30%),radial-gradient(circle at 18% 100%,rgba(34,211,238,.10),transparent 35%),#05070d!important}
  .themeMenuBox{padding:10px 12px;display:grid;gap:8px}.themeMenuBox label{font-size:12px;color:#aab6ca}.themeMenuRow{display:flex;gap:8px;align-items:center}.themeMenuRow input[type=color]{width:44px;height:34px;border:0;border-radius:10px;background:transparent;padding:0}.themeSwatch{width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.22);cursor:pointer}
  .homeDiscoveryPanel{min-height:220px;display:grid;align-content:center;gap:12px}.homeDiscoveryPanel h2{font-size:clamp(30px,2.4vw,46px);margin:0;letter-spacing:-.06em}.homeDiscoveryPanel p{color:#aebbd0;max-width:780px}.homeDiscoveryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.homeDiscoveryMini{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:rgba(255,255,255,.045);padding:14px;min-height:120px}.homeDiscoveryMini b{font-size:18px}.homeDiscoveryMini span{display:block;color:#aebbd0;margin-top:6px}
  .hfDiscover{background:radial-gradient(circle at 0 8%,color-mix(in srgb,var(--viewer-accent,#8b5cf6) 18%,transparent),transparent 30%),radial-gradient(circle at 18% 100%,rgba(34,211,238,.10),transparent 35%),#05070d!important;min-height:calc(100vh - 64px)}
  .hfPanel,.owPanel,.viewerProfilePanel,.homeDiscoveryPanel,.channelInfoCard,.settingsShell .panel{background:linear-gradient(180deg,rgba(15,23,42,.78),rgba(15,23,42,.38))!important;border-color:rgba(148,163,184,.18)!important}
  .channelIdentity .avatar{width:150px!important;height:150px!important;min-width:150px!important;border-radius:36px!important;object-position:center center!important}.channelTitleBlock{padding-left:6px!important}.channelTitleBlock h1{padding-left:0!important;margin-left:0!important}
  .channelLiveLayout{display:grid!important;grid-template-columns:minmax(0,1fr) clamp(360px,26vw,460px)!important;align-items:stretch!important;gap:18px!important}.channelMainPlayer{display:flex!important;min-width:0!important}.channelMainPlayer .player{width:100%!important;aspect-ratio:16/9!important;min-height:0!important;height:auto!important}.channelLiveSidebar{display:flex!important;min-height:0!important}.channelLiveSidebar .chatPanel{height:auto!important;min-height:0!important;max-height:none!important;align-self:stretch!important;flex:1 1 auto!important;display:grid!important;grid-template-rows:auto minmax(0,1fr) auto auto auto!important}.channelLiveSidebar .chatLog{min-height:0!important;overflow:auto!important}.channelMainPlayer .emptyStatePlayer{height:100%!important;min-height:100%!important}.nativeFixedChat{resize:none!important}
  .badgesNoScrollbar,.channelBadgeRail.tight{overflow-x:auto!important;scrollbar-width:none}.badgesNoScrollbar::-webkit-scrollbar,.channelBadgeRail.tight::-webkit-scrollbar{display:none}.channelBadgeRail.tight{padding-bottom:0!important}.channelBadgeBig{min-width:150px}
  @media(max-width:1100px){.channelLiveLayout{grid-template-columns:1fr!important}.channelLiveSidebar .chatPanel{height:420px!important}.channelIdentity .avatar{width:104px!important;height:104px!important;min-width:104px!important}.homeDiscoveryGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
})();

function setViewerThemeColor(color){
  const c=color||'#8b5cf6';
  try{localStorage.setItem('oryon_viewer_accent',c)}catch(_){}
  document.documentElement.style.setProperty('--viewer-accent',c);
  document.documentElement.style.setProperty('--brand',c);
  document.documentElement.style.setProperty('--accent',c);
  document.querySelectorAll('input[type=color]').forEach(i=>{try{if(i.value!==c)i.value=c}catch(_){}});
}
function applyViewerThemeColor(){ setViewerThemeColor(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6'); }
function themeMenuHtml(){
  const current=esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6');
  const colors=['#8b5cf6','#06b6d4','#22c55e','#84cc16','#f97316','#ef4444','#ec4899'];
  return `<div class="sep"></div><div class="themeMenuBox"><label>Couleur de l’interface</label><div class="themeMenuRow"><input type="color" value="${current}" oninput="setViewerThemeColor(this.value)">${colors.map(c=>`<button class="themeSwatch" style="background:${c}" onclick="setViewerThemeColor('${c}')" title="${c}"></button>`).join('')}</div></div>`;
}

function renderUserMenu(){
  const u=state.session.local, t=state.session.twitch;
  $('#userAvatar').src=u?.avatar_url||t?.profile_image_url||'';
  $('#userLabel').textContent=u?.display_name||u?.login||t?.display_name||'Compte';
  const mode=getAppMode?.()||'viewer';
  const parts=[];
  if(u||t){
    parts.push(`<div class="small" style="padding:10px 12px">Compte actif<br><b>${esc(u?.display_name||u?.login||t?.display_name||t?.login||'Utilisateur')}</b><br><span class="modeBadge" style="margin-top:8px">${mode==='streamer'?'🎥 Mode streamer':'👁️ Mode viewer'}</span></div>`);
    parts.push(`<div class="modeSwitch" style="padding:0 12px 8px"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div>`);
  }
  parts.push(themeMenuHtml());
  if(u){ parts.push(`<div class="sep"></div><button onclick="state.watchRoom=null;setView('channel')">Ma chaîne</button>`); parts.push(`<button onclick="setView('manager')">Gestionnaire de stream</button>`); parts.push(`<button onclick="setView('dashboard')">Tableau de bord créateur</button>`); parts.push(`<button onclick="setView('studio')">Outils créateur</button>`); }
  parts.push(`<div class="sep"></div><button onclick="setView('settings')">Profil, connexions, paramètres</button>`);
  parts.push(t?`<button onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button onclick="connectTwitch()">Connecter Twitch</button>`);
  if(u) parts.push(`<button onclick="logoutOryon()">Déconnecter Oryon</button>`);
  if(isAdmin()) parts.push(`<div class="sep"></div><button onclick="setView('admin')">Administration</button>`);
  $('#userMenu').innerHTML=parts.join('');
}

async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche de lives à découvrir…</h2><p>La vitrine ne dépend pas de tes suivis Twitch.</p></div></div>`;
  try{
    let items=[];
    const native=await api('/api/native/lives').catch(()=>({items:[]}));
    items.push(...(native.items||[]).map(x=>({...x,platform:'oryon'})));
    const pools=[
      '/api/twitch/streams/small?lang=fr&min=30&max=100&discover=1',
      '/api/twitch/streams/small?lang=fr&min=15&max=180&discover=1',
      '/api/oryon/discover/find-live?mood=discussion&max=220&lang=fr&source=both&discover=1'
    ];
    for(const url of pools){
      if(items.length>=3) break;
      const r=await api(url).catch(()=>({items:[]}));
      for(const x of (r.items||[])) items.push({...x,platform:x.platform||'twitch'});
    }
    const seen=new Set();
    items=items.filter(x=>{const id=hfLiveId?.(x)||liveIdentity?.(x)||{}; const key=(id.platform||x.platform||'twitch')+':'+String(id.login||x.login||x.user_login||x.host_login||x.room||'').toLowerCase(); if(!key||seen.has(key))return false; seen.add(key); return true;});
    box.innerHTML=items.length ? items.slice(0,3).map((x,i)=>owLiveCardHtml(x,i)).join('') : `<div class="hfEmptyLive"><div><h2>Aucun live public récupéré.</h2><p>Connecte les variables Twitch serveur ou lance un live Oryon natif. La home ne pioche pas dans tes suivis.</p><button class="btn" onclick="autoProposeLive()">Proposer un live</button></div></div>`;
  }catch(e){ console.error(e); box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche indisponible.</h2><button class="btn" onclick="loadHomeRecommendations()">Réessayer</button></div></div>`; }
}

async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<div class="owHomeFull"><section class="owHeroTheater userFixHero"><div class="owHeroCopy userFixCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><div class="owMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="owActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="owLiveTheater userFix3"></div></section><div class="owBelow"><section class="owPanel">${viewerProfileCard?.()||'<h2>Profil Viewer</h2>'}</section><section class="owPanel homeDiscoveryPanel"><h2>Découverte, pas suivis.</h2><p>L’accueil sert à découvrir de nouveaux lives Oryon ou Twitch. Tes suivis Twitch restent dans Accès Twitch, pas dans la vitrine.</p><div class="homeDiscoveryGrid"><div class="homeDiscoveryMini"><b>Mood</b><span>Choisis une ambiance et Oryon cherche pour toi.</span></div><div class="homeDiscoveryMini"><b>Swipe</b><span>J’aime / pas ouf remplit ton profil viewer.</span></div><div class="homeDiscoveryMini"><b>Streamer</b><span>Le bouton streamer garde Oryon visible comme plateforme native.</span></div></div></section></div></div>`;
  await loadHomeRecommendations();
  applyViewerThemeColor?.();
  closeMini?.();
}

async function hfFetchLivePool({mood='petite-commu', q='', min=0, max=200, lang='fr'}={}){
  const calls=[];
  calls.push(api('/api/oryon/discover/find-live?'+qs({q, mood, max, lang, source:'both', discover:'1'})).catch(()=>({items:[]})));
  calls.push(api(`/api/twitch/streams/small?lang=${encodeURIComponent(lang)}&min=${encodeURIComponent(min)}&max=${encodeURIComponent(max)}&discover=1`).catch(()=>({items:[]})));
  calls.push(api('/api/native/lives').catch(()=>({items:[]})));
  const results=await Promise.all(calls);
  const out=[]; const keys=new Set();
  for(const r of results){
    for(const item of (r.items||[])){
      const x={...item, platform:item.platform || (item.host_login||item.room?'oryon':'twitch')};
      const id=hfLiveId(x); if(!id.login) continue;
      const v=id.viewers; if(v<min || v>Math.max(max, min)) continue;
      const k=hfLiveKey(x); if(keys.has(k)) continue; keys.add(k); out.push(x);
    }
  }
  return out.sort((a,b)=>hfMoodScore(b,mood)-hfMoodScore(a,mood));
}

async function renderChannel(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner;
  const banner=p.banner_url||p.offline_image_url||'';
  const offlineImg=p.offline_image_url||p.banner_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const supportCount=Number(support?.count||0);
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=fwLiveMediaHtml(p,isOwner,isLive,offlineImg);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span><span class="pill">${supportCount} premiers soutiens</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div></div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="chanTab(this,'about')">Accueil</button><button onclick="chanTab(this,'about')">À propos</button><button onclick="chanTab(this,'planning')">Planning</button><button onclick="chanTab(this,'clips')">Clips</button><button onclick="setView('studio')">Badges / emotes</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section><section class="channelContentGrid"><div class="channelInfoStack"><div class="channelInfoCard channelCustomizer full"><div><h3>Personnalisation viewer</h3><p class="small">Change la couleur de la page selon ton goût.</p></div><div class="themeControl"><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#8b5cf6')}" oninput="setViewerThemeColor(this.value)"><button class="btn" onclick="setViewerThemeColor('#8b5cf6')">Violet</button><button class="btn secondary" onclick="setViewerThemeColor('#06b6d4')">Cyan</button><button class="btn secondary" onclick="setViewerThemeColor('#22c55e')">Vert</button></div></div><div class="channelInfoCard"><h2>Pourquoi entrer ici ?</h2><div class="channelBadgesBar"><span class="reasonChip">chat lisible</span><span class="reasonChip">nouveaux bienvenus</span><span class="reasonChip">réactions rapides</span>${channelBadges.slice(0,5).map(b=>`<span class="reasonChip">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}</div></div><div id="channelTab" class="channelInfoCard"></div></div><aside class="channelInfoStack"><div class="channelInfoCard"><h3>Badges visibles</h3><div class="channelBadgeRail tight badgesNoScrollbar">${channelBadges.map(b=>`<div class="channelBadgeBig"><strong>${esc(b.icon)}</strong><b>${esc(b.label)}</b><span class="small">${esc(b.note)}</span></div>`).join('')}</div></div><div class="channelInfoCard"><h3>Premiers soutiens</h3>${(support.first_supporters||[]).length?(support.first_supporters||[]).slice(0,8).map(s=>`<span class="supportChip">⭐ ${esc(s.display_name||s.login)}</span>`).join(' '):'<p class="muted">Premiers soutiens à venir.</p>'}</div></aside></section></div>`;
  applyViewerThemeColor?.();
  if(isLive) setMiniLive?.({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  chanTab?.(null,'about'); setupSocket?.(); state.room=targetLogin; state.socket?.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){ attachCurrentStream?.(); }
  else if(isLive){ state.socket?.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer?.(),500); } }
  updateLiveUi?.(isLive); refreshEmoteShelf?.(targetLogin);
}

applyViewerThemeColor();


/* =========================================================
   FINAL VERIFY FIX — home discovery only, brighter theme, menu color control
   ========================================================= */
(function injectFinalVerifyStyle(){
  const old=document.getElementById('oryonFinalVerifyStyle'); if(old) old.remove();
  const st=document.createElement('style'); st.id='oryonFinalVerifyStyle';
  st.textContent=`
  :root{--viewer-accent:${localStorage.getItem('oryon_viewer_accent')||'#22d3ee'};--brand:var(--viewer-accent);--accent:var(--viewer-accent);--glow:0 0 44px color-mix(in srgb,var(--viewer-accent) 46%,transparent)}
  body{background:radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--viewer-accent) 22%,transparent),transparent 28%),radial-gradient(circle at 26% 100%,rgba(139,92,246,.24),transparent 34%),#05070d!important}
  .btn:not(.secondary):not(.ghost),.streamBtn{background:linear-gradient(135deg,color-mix(in srgb,var(--viewer-accent) 78%,#ffffff 12%),#bd46ff)!important;box-shadow:0 16px 46px color-mix(in srgb,var(--viewer-accent) 36%,transparent)!important}
  .topThemePanel{padding:12px;display:grid;gap:10px}.topThemePanel b{font-size:13px}.topThemeColors{display:flex;gap:8px;flex-wrap:wrap}.topThemeColors button,.topThemeColors input{width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.18);cursor:pointer}.topThemeColors input{padding:0;background:transparent;overflow:hidden}.topThemeColors button{box-shadow:0 0 22px rgba(255,255,255,.08)}
  .owHomeFull.homeClean{padding-bottom:48px!important}.owHeroTheater.homeCleanHero{grid-template-columns:minmax(320px,26vw) minmax(0,1fr)!important;min-height:calc(100vh - 72px)!important}.owHeroCopy.homeCleanCopy{background:linear-gradient(90deg,color-mix(in srgb,var(--viewer-accent) 20%,rgba(16,10,45,.80)),rgba(16,10,45,.08))!important}.owHeroCopy.homeCleanCopy h1{font-size:clamp(58px,6.6vw,122px)!important}.owLiveTheater.homeCleanLives{display:grid!important;grid-template-columns:1.35fr .92fr .92fr!important;gap:18px!important;align-items:stretch!important;overflow:visible!important;height:auto!important;min-height:calc(100vh - 72px)!important;padding:clamp(22px,2.6vw,48px) var(--platform-pad,var(--site-pad,48px))!important}.owLiveTheater.homeCleanLives .owShowCard{width:100%!important;min-width:0!important;max-width:none!important;height:100%!important;min-height:min(72vh,860px)!important;flex:none!important}.owLiveTheater.homeCleanLives .owShowCard:nth-child(n+2) .owShowBody h2{font-size:clamp(26px,2.7vw,44px)!important}.homeOnlyMain{width:100%;padding:0 var(--platform-pad,var(--site-pad,48px)) 54px}.homeOnlyMain .viewerProfilePanel{max-width:100%}.homeStreamerStrip{border:1px solid rgba(148,163,184,.18);background:linear-gradient(135deg,color-mix(in srgb,var(--viewer-accent) 16%,rgba(15,23,42,.86)),rgba(15,23,42,.48));border-radius:28px;padding:22px;display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap}.homeStreamerStrip h2{margin:0 0 4px;font-size:clamp(28px,2.4vw,42px)}.homeStreamerStrip p{margin:0;color:#b8c7dc}.hfDiscover,.hfDiscoverHero,.hfMoodPanel,.hfPanel{background:transparent!important}.hfDiscover{background:radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--viewer-accent) 20%,transparent),transparent 30%),#05070d!important}.hfMoodPanel,.hfPanel{background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(15,23,42,.38))!important}.hfDiscoverHero{background:radial-gradient(circle at 20% 12%,color-mix(in srgb,var(--viewer-accent) 28%,transparent),transparent 36%),linear-gradient(135deg,rgba(12,18,32,.98),rgba(5,8,16,.98))!important}.badgesNoScrollbar,.channelBadgeRail{overflow-x:auto;scrollbar-width:none!important}.badgesNoScrollbar::-webkit-scrollbar,.channelBadgeRail::-webkit-scrollbar{display:none!important}.channelBadgeBig{min-width:170px!important}.channelIdentity .avatar{width:138px!important;height:138px!important;min-width:138px!important}.channelLiveLayout{grid-template-columns:minmax(0,1fr) clamp(360px,27vw,480px)!important}.channelMainPlayer .player,.channelLiveSidebar .chatPanel{min-height:clamp(620px,72vh,980px)!important}.channelLiveSidebar .chatPanel{height:100%!important;align-self:stretch!important}.channelTitleBlock h1{padding-left:0!important;margin-left:0!important}.channelPage{background:radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--viewer-accent) 16%,transparent),transparent 30%),#05070d!important}
  @media(max-width:1180px){.owLiveTheater.homeCleanLives{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important}.owLiveTheater.homeCleanLives .owShowCard{min-width:84vw!important;width:84vw!important;scroll-snap-align:center!important}.channelLiveLayout{grid-template-columns:1fr!important}.channelMainPlayer .player,.channelLiveSidebar .chatPanel{min-height:520px!important}.channelIdentity .avatar{width:104px!important;height:104px!important;min-width:104px!important}}
  @media(max-width:760px){.owHeroTheater.homeCleanHero{grid-template-columns:1fr!important}.owLiveTheater.homeCleanLives .owShowCard{min-width:88vw!important;width:88vw!important}.channelIdentity .avatar{width:86px!important;height:86px!important;min-width:86px!important}.homeStreamerStrip{align-items:flex-start}}
  `;
  document.head.appendChild(st);
})();

function setViewerThemeColor(color){
  const c=color||'#22d3ee';
  localStorage.setItem('oryon_viewer_accent',c);
  document.documentElement.style.setProperty('--viewer-accent',c);
  document.documentElement.style.setProperty('--brand',c);
  document.documentElement.style.setProperty('--accent',c);
  document.querySelectorAll('input[type=color]').forEach(i=>{try{i.value=c}catch(_){}});
}
function applyViewerThemeColor(){setViewerThemeColor(localStorage.getItem('oryon_viewer_accent')||'#22d3ee')}

function renderUserMenu(){
  const u=state.session.local, t=state.session.twitch; $('#userAvatar').src=u?.avatar_url||t?.profile_image_url||''; $('#userLabel').textContent=u?.display_name||u?.login||t?.display_name||'Compte';
  const mode=getAppMode?.() || (u?'streamer':'viewer');
  const colors=['#22d3ee','#a855f7','#22c55e','#f59e0b','#f43f5e','#ffffff'];
  const parts=[];
  parts.push(`<div class="topThemePanel"><b>Couleur du site</b><div class="topThemeColors"><input type="color" value="${esc(localStorage.getItem('oryon_viewer_accent')||'#22d3ee')}" oninput="setViewerThemeColor(this.value)">${colors.map(c=>`<button style="background:${c}" onclick="setViewerThemeColor('${c}')"></button>`).join('')}</div></div><div class="sep"></div>`);
  if(u||t){
    parts.push(`<div class="small" style="padding:10px 12px">Compte actif<br><b>${esc(u?.display_name||u?.login||t?.display_name||t?.login||'Utilisateur')}</b><br><span class="modeBadge" style="margin-top:8px">${mode==='streamer'?'🎥 Mode streamer':'👁️ Mode viewer'}</span></div>`);
    parts.push(`<div class="modeSwitch" style="padding:0 12px 8px"><button class="btn ${mode==='viewer'?'':'secondary'}" onclick="setAppMode('viewer')">Page viewer</button><button class="btn ${mode==='streamer'?'':'secondary'}" onclick="setAppMode('streamer')">Page streamer</button></div><div class="sep"></div>`);
  }
  if(u){ parts.push(`<button onclick="state.watchRoom=null;setView('channel')">Ma chaîne</button><button onclick="setView('manager')">Gestionnaire de stream</button><button onclick="setView('dashboard')">Tableau de bord créateur</button><button onclick="setView('studio')">Outils créateur</button><div class="sep"></div>`); }
  parts.push(`<button onclick="setView('settings')">Profil, connexions, paramètres</button>`);
  parts.push(t?`<button onclick="logoutTwitch()">Déconnecter Twitch</button>`:`<button onclick="connectTwitch()">Connecter Twitch</button>`);
  if(u) parts.push(`<button onclick="logoutOryon()">Déconnecter Oryon</button>`);
  if(isAdmin?.()) parts.push(`<div class="sep"></div><button onclick="setView('admin')">Administration</button>`);
  $('#userMenu').innerHTML=parts.join('');
}

async function loadHomeRecommendations(){
  const box=$('#homeShowcaseLives'); if(!box) return;
  box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche de lives publics…</h2><p>Oryon cherche des lives à découvrir, pas tes suivis.</p></div></div>`;
  try{
    let r=await api('/api/discovery/home-lives?limit=3&lang=fr').catch(()=>({items:[]}));
    let items=(r.items||[]);
    if(items.length<3){
      const r2=await api('/api/twitch/streams/small?lang=fr&min=1&max=5000&first=100&discover=1').catch(()=>({items:[]}));
      const keys=new Set(items.map(x=>String((hfLiveId?.(x)||{}).platform)+':'+String((hfLiveId?.(x)||{}).login)));
      for(const x of (r2.items||[])){ const id=hfLiveId?.(x)||{}; const k=String(id.platform)+':'+String(id.login); if(!keys.has(k)){keys.add(k); items.push(x)} if(items.length>=3) break; }
    }
    if(items.length<3){
      const r3=await api('/api/native/lives').catch(()=>({items:[]}));
      const keys=new Set(items.map(x=>String((hfLiveId?.(x)||{}).platform)+':'+String((hfLiveId?.(x)||{}).login)));
      for(const x of (r3.items||[])){ const y={...x,platform:'oryon'}; const id=hfLiveId?.(y)||{}; const k=String(id.platform)+':'+String(id.login); if(!keys.has(k)){keys.add(k); items.push(y)} if(items.length>=3) break; }
    }
    box.innerHTML=items.length ? items.slice(0,3).map((x,i)=>owLiveCardHtml(x,i)).join('') : `<div class="hfEmptyLive"><div><h2>Aucun live public récupéré.</h2><p>La vitrine ne peut afficher Twitch que si TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET sont actifs côté Render, ou si un live Oryon natif est lancé.</p><button class="btn" onclick="loadHomeRecommendations()">Réessayer</button></div></div>`;
  }catch(e){ console.error(e); box.innerHTML=`<div class="hfEmptyLive"><div><h2>Recherche indisponible.</h2><button class="btn" onclick="loadHomeRecommendations()">Réessayer</button></div></div>`; }
}

async function renderHome(){
  const el=$('#home'); if(!el) return;
  el.innerHTML=`<div class="owHomeFull homeClean"><section class="owHeroTheater homeCleanHero"><div class="owHeroCopy homeCleanCopy"><span class="eyebrow"><i class="dot"></i>Vitrine Oryon</span><h1>Des lives à taille humaine.</h1><div class="owMoodStrip">${AMBIANCES.slice(0,6).map(([id,label])=>`<button onclick="state.moodFirstMood='${esc(id)}';autoProposeLive()">${esc(label)}</button>`).join('')}</div><div class="owActions"><button class="btn" onclick="autoProposeLive()">Propose-moi un live</button><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button><button class="btn secondary" onclick="setView('discover')">Choisir mon ambiance</button></div></div><div id="homeShowcaseLives" class="owLiveTheater homeCleanLives"></div></section><div class="homeOnlyMain"><section class="homeStreamerStrip"><div><h2>Streamer sur Oryon</h2><p>La plateforme met aussi en avant les créateurs Oryon natifs. Lance ton live depuis le gestionnaire.</p></div><button class="btn streamBtn" onclick="setView('${streamTargetView?.()||'manager'}')">${esc(streamTargetLabel?.()||'Streamer sur Oryon')}</button></section></div></div>`;
  await loadHomeRecommendations();
  applyViewerThemeColor?.();
  closeMini?.();
}

async function hfFetchLivePool({mood='petite-commu', q='', min=0, max=200, lang='fr'}={}){
  const calls=[];
  calls.push(api('/api/oryon/discover/find-live?'+qs({q, mood, max, lang, source:'both', discover:'1'})).catch(()=>({items:[]})));
  calls.push(api(`/api/twitch/streams/small?lang=${encodeURIComponent(lang)}&min=${encodeURIComponent(min)}&max=${encodeURIComponent(Math.max(max,5000))}&first=100&discover=1`).catch(()=>({items:[]})));
  calls.push(api('/api/native/lives').catch(()=>({items:[]})));
  const results=await Promise.all(calls);
  const out=[]; const keys=new Set();
  for(const r of results){
    for(const item of (r.items||[])){
      const x={...item, platform:item.platform || (item.host_login||item.room?'oryon':'twitch')};
      const id=hfLiveId(x); if(!id.login) continue;
      const v=id.viewers; if(v<min) continue;
      const k=hfLiveKey(x); if(keys.has(k)) continue; keys.add(k); out.push(x);
    }
  }
  return out.sort((a,b)=>hfMoodScore(b,mood)-hfMoodScore(a,mood));
}

applyViewerThemeColor();

/* =========================================================
   Creator channel refine — Twitch-like channel page only
   - Badges on banner
   - Bigger channel logo
   - No creator tools / badge-emote link in public nav
   - Bio directly below live
   - Real channel panels area like Twitch
   - No duplicate viewer customization / why enter / first support blocks
   ========================================================= */
(function injectCreatorChannelRefineStyle(){
  const old=document.getElementById('oryonCreatorChannelRefineStyle');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonCreatorChannelRefineStyle';
  st.textContent=`
  #channel .channelPage.creatorRefine{
    width:100%;
    max-width:none;
    padding:0 var(--site-pad,clamp(20px,2.8vw,56px)) 64px;
    display:grid;
    gap:22px;
  }
  #channel .creatorRefine .channelTopHero{
    min-height:clamp(360px,34vw,560px);
    border-radius:0 0 34px 34px;
    overflow:hidden;
    position:relative;
    background:
      radial-gradient(circle at 18% 25%,color-mix(in srgb,var(--viewer-accent,#22d3ee) 30%,transparent),transparent 34%),
      linear-gradient(135deg,#111827,#020617 68%);
    border:1px solid rgba(148,163,184,.13);
    border-top:0;
    box-shadow:0 30px 90px rgba(0,0,0,.34);
  }
  #channel .creatorRefine .channelTopHero>img{
    position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.82;filter:saturate(1.04) contrast(1.02);
  }
  #channel .creatorRefine .channelTopHero:after{
    content:"";position:absolute;inset:0;
    background:
      linear-gradient(180deg,rgba(2,6,23,.04),rgba(2,6,23,.25) 46%,rgba(2,6,23,.92)),
      linear-gradient(90deg,rgba(2,6,23,.88),rgba(2,6,23,.32) 52%,rgba(2,6,23,.78));
    z-index:1;
  }
  #channel .creatorRefine .channelHeroContent{
    position:absolute;z-index:2;left:0;right:0;bottom:0;
    padding:clamp(26px,3vw,48px) var(--site-pad,clamp(20px,2.8vw,56px));
    display:flex;align-items:flex-end;justify-content:space-between;gap:28px;flex-wrap:wrap;
  }
  #channel .creatorRefine .channelIdentity{
    display:flex!important;align-items:flex-end!important;gap:clamp(18px,2vw,30px)!important;min-width:0;
  }
  #channel .creatorRefine .channelIdentity .avatar{
    width:clamp(150px,10vw,210px)!important;
    height:clamp(150px,10vw,210px)!important;
    min-width:clamp(150px,10vw,210px)!important;
    border-radius:36px!important;
    object-fit:cover!important;
    object-position:center!important;
    border:4px solid rgba(255,255,255,.20)!important;
    background:linear-gradient(135deg,color-mix(in srgb,var(--viewer-accent,#22d3ee) 70%,#fff 10%),#7c3aed)!important;
    box-shadow:0 30px 80px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.08) inset!important;
    margin:0!important;position:relative!important;left:auto!important;top:auto!important;
  }
  #channel .creatorRefine .channelTitleBlock{display:grid;gap:12px;min-width:0;max-width:min(880px,62vw);padding:0!important;margin:0!important;}
  #channel .creatorRefine .channelTitleBlock h1{
    margin:0!important;font-size:clamp(54px,6vw,112px);line-height:.86;letter-spacing:-.06em;text-shadow:0 18px 56px rgba(0,0,0,.52);word-break:break-word;
  }
  #channel .creatorRefine .channelTitleBlock p{margin:0;color:#d8e4f8;font-size:clamp(15px,1vw,19px);line-height:1.45;max-width:70ch;text-shadow:0 8px 30px rgba(0,0,0,.52);}
  #channel .creatorRefine .channelBadgesBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  #channel .creatorRefine .channelBadgesBar .pill{background:rgba(2,6,23,.62);border-color:rgba(255,255,255,.16);backdrop-filter:blur(14px);}
  #channel .creatorRefine .bannerBadgeDock{
    display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:2px;
  }
  #channel .creatorRefine .bannerBadge{
    display:inline-flex;align-items:center;gap:8px;padding:10px 13px;border-radius:999px;
    background:linear-gradient(135deg,rgba(255,255,255,.13),rgba(255,255,255,.045));
    border:1px solid color-mix(in srgb,var(--viewer-accent,#22d3ee) 34%,rgba(255,255,255,.16));
    box-shadow:0 14px 34px rgba(0,0,0,.25),0 0 26px color-mix(in srgb,var(--viewer-accent,#22d3ee) 20%,transparent);
    backdrop-filter:blur(18px);font-weight:1000;font-size:13px;color:#fff;
  }
  #channel .creatorRefine .bannerBadge strong{font-size:18px;line-height:1;}
  #channel .creatorRefine .channelActionDock{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
  #channel .creatorRefine .channelActionDock .btn{min-height:50px;border-radius:17px;padding-inline:18px;}
  #channel .creatorRefine .channelSubNav{display:flex;gap:12px;flex-wrap:wrap;border-bottom:1px solid rgba(148,163,184,.15);padding:0 0 2px;margin-top:2px;}
  #channel .creatorRefine .channelSubNav button{min-height:46px;padding:0 18px;border-radius:14px 14px 0 0;background:transparent;border:0;color:#c7d3e6;font-weight:1000;cursor:pointer;}
  #channel .creatorRefine .channelSubNav button.active{color:#fff;box-shadow:inset 0 -3px 0 var(--viewer-accent,#22d3ee);}
  #channel .creatorRefine .channelLiveLayout{
    display:grid!important;grid-template-columns:minmax(0,1fr) clamp(340px,25vw,450px)!important;gap:18px;align-items:stretch;margin:0;
  }
  #channel .creatorRefine .channelMainPlayer,.creatorRefine .channelLiveSidebar{min-width:0;}
  #channel .creatorRefine .channelMainPlayer .player,
  #channel .creatorRefine .channelLiveSidebar .chatPanel{
    min-height:clamp(600px,68vh,940px)!important;height:100%!important;border-radius:28px!important;border:1px solid rgba(148,163,184,.17)!important;overflow:hidden;background:#030712;
  }
  #channel .creatorRefine .channelMainPlayer .player{box-shadow:0 28px 85px rgba(0,0,0,.36);}
  #channel .creatorRefine .channelLiveSidebar .chatPanel{display:grid;grid-template-rows:auto minmax(0,1fr) auto auto auto;background:linear-gradient(180deg,rgba(7,12,23,.98),rgba(3,7,18,.98));}
  #channel .creatorRefine .chatHeader{padding:16px;border-bottom:1px solid rgba(255,255,255,.08);}
  #channel .creatorRefine .chatLog{min-height:0;overflow:auto;padding:16px;}
  #channel .creatorRefine .chatAssist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;border-top:1px solid rgba(255,255,255,.08);}
  #channel .creatorRefine .chatAssist button{min-height:42px;border-radius:14px;}
  #channel .creatorRefine .chatForm{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;padding:0 14px 16px;}
  #channel .creatorRefine .offlinePremium{
    position:relative;width:100%;height:100%;min-height:inherit;display:grid;place-items:center;overflow:hidden;background:#020617;color:#fff;
  }
  #channel .creatorRefine .offlinePremiumBg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.42;filter:blur(1px) saturate(1.05);transform:scale(1.015);}
  #channel .creatorRefine .offlinePremium:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 35%,color-mix(in srgb,var(--viewer-accent,#22d3ee) 28%,transparent),transparent 36%),linear-gradient(180deg,rgba(2,6,23,.36),rgba(2,6,23,.92));z-index:1;}
  #channel .creatorRefine .offlinePremiumContent{position:relative;z-index:2;text-align:center;max-width:720px;padding:40px;display:grid;gap:18px;justify-items:center;}
  #channel .creatorRefine .offlinePremiumAvatar{width:116px;height:116px;border-radius:30px;object-fit:cover;border:3px solid rgba(255,255,255,.18);box-shadow:0 22px 60px rgba(0,0,0,.35);}
  #channel .creatorRefine .offlinePremium h2{margin:0;font-size:clamp(36px,3.6vw,68px);letter-spacing:-.045em;line-height:.96;}
  #channel .creatorRefine .offlinePremium p{margin:0;color:#c5d3e8;font-size:16px;line-height:1.5;}
  #channel .creatorRefine .offlineTags{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
  #channel .creatorRefine .offlineTags span{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:1000;}
  #channel .creatorRefine .channelBelowLive{display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,24vw,420px);gap:18px;align-items:start;}
  #channel .creatorRefine .channelBelowMain{display:grid;gap:18px;min-width:0;}
  #channel .creatorRefine .bioPremium,
  #channel .creatorRefine .channelPanelArea,
  #channel .creatorRefine .identityCompact,
  #channel .creatorRefine .sideCompactCard{
    border:1px solid rgba(148,163,184,.17);border-radius:26px;background:linear-gradient(180deg,rgba(15,23,42,.84),rgba(15,23,42,.40));box-shadow:0 20px 56px rgba(0,0,0,.20);
  }
  #channel .creatorRefine .bioPremium{padding:26px;}
  #channel .creatorRefine .bioPremium h2{margin:0 0 10px;font-size:clamp(28px,2vw,40px);letter-spacing:-.025em;}
  #channel .creatorRefine .bioPremium p{margin:0;color:#dbe7fb;line-height:1.65;font-size:16px;max-width:95ch;}
  #channel .creatorRefine .channelPanelArea{padding:22px;display:grid;gap:16px;}
  #channel .creatorRefine .panelAreaHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
  #channel .creatorRefine .panelAreaHead h2{margin:0;font-size:clamp(24px,1.6vw,32px);}
  #channel .creatorRefine .panelAreaHead p{margin:4px 0 0;color:#9fb0c7;font-size:13px;}
  #channel .creatorRefine .channelPanelGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
  #channel .creatorRefine .channelPanel{min-height:154px;border:1px dashed rgba(148,163,184,.24);border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.025));overflow:hidden;position:relative;padding:16px;text-align:left;color:#dbe7fb;display:flex;align-items:flex-end;}
  #channel .creatorRefine .channelPanel.hasImage{border-style:solid;padding:0;}
  #channel .creatorRefine .channelPanel img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  #channel .creatorRefine .channelPanel:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.05),rgba(2,6,23,.78));z-index:1;}
  #channel .creatorRefine .channelPanelBody{position:relative;z-index:2;display:grid;gap:4px;}
  #channel .creatorRefine .channelPanelBody b{font-size:16px;color:#fff;}
  #channel .creatorRefine .channelPanelBody span{font-size:13px;color:#bfccdf;}
  #channel .creatorRefine .identityCompact{padding:20px;display:grid;gap:14px;}
  #channel .creatorRefine .identityCompact h2{margin:0;font-size:24px;}
  #channel .creatorRefine .identityRows{display:grid;gap:13px;}
  #channel .creatorRefine .identityTitle{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.10em;color:#92a2bb;font-weight:1000;margin-bottom:8px;}
  #channel .creatorRefine .tagCloudCompact,.badgeCloudCompact{display:flex;gap:8px;flex-wrap:wrap;}
  #channel .creatorRefine .tagChipCompact,.badgeChipCompact{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:1000;}
  #channel .creatorRefine .tagChipCompact{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);}
  #channel .creatorRefine .badgeChipCompact{border:1px solid color-mix(in srgb,var(--viewer-accent,#22d3ee) 42%,rgba(255,255,255,.14));background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.03));}
  #channel .creatorRefine .channelBelowSide{display:grid;gap:18px;min-width:0;}
  #channel .creatorRefine .sideCompactCard{padding:20px;}
  #channel .creatorRefine .sideCompactCard h3{margin:0 0 10px;font-size:20px;}
  #channel .creatorRefine .sideCompactCard p{margin:0;color:#b8c7dc;line-height:1.5;}
  #channel .creatorRefine .channelContentGrid,.creatorRefine .channelCustomizer,.creatorRefine .channelInfoCard:has(.themeControl){display:none!important;}
  @media(max-width:1160px){
    #channel .creatorRefine .channelLiveLayout,#channel .creatorRefine .channelBelowLive{grid-template-columns:1fr!important;}
    #channel .creatorRefine .channelTitleBlock{max-width:100%;}
    #channel .creatorRefine .channelMainPlayer .player,#channel .creatorRefine .channelLiveSidebar .chatPanel{min-height:470px!important;}
    #channel .creatorRefine .channelPanelGrid{grid-template-columns:repeat(2,minmax(0,1fr));}
  }
  @media(max-width:760px){
    #channel .creatorRefine{padding-inline:14px!important;}
    #channel .creatorRefine .channelTopHero{min-height:390px;border-radius:0 0 24px 24px;}
    #channel .creatorRefine .channelHeroContent{padding:20px 14px;align-items:flex-start;}
    #channel .creatorRefine .channelIdentity{align-items:center!important;gap:14px!important;}
    #channel .creatorRefine .channelIdentity .avatar{width:108px!important;height:108px!important;min-width:108px!important;border-radius:26px!important;}
    #channel .creatorRefine .channelTitleBlock h1{font-size:clamp(36px,10vw,54px);}
    #channel .creatorRefine .channelPanelGrid{grid-template-columns:1fr;}
    #channel .creatorRefine .chatAssist{grid-template-columns:1fr;}
    #channel .creatorRefine .chatForm{grid-template-columns:1fr 1fr;}
    #channel .creatorRefine .chatForm input{grid-column:1/-1;}
  }
  `;
  document.head.appendChild(st);
})();

function oryonCreatorBannerBadgesHtml(channelBadges){
  return `<div class="bannerBadgeDock">${(channelBadges||[]).slice(0,5).map(b=>`<span class="bannerBadge"><strong>${esc(b.icon)}</strong>${esc(b.label)}</span>`).join('')}</div>`;
}

function oryonOfflinePremiumHtml(p,isOwner,tags){
  const bg=p.offline_image_url||p.banner_url||'';
  const avatar=p.avatar_url||'';
  const tagHtml=(tags||[]).slice(0,5).map(t=>`<span>${esc(t)}</span>`).join('') || '<span>Oryon</span><span>Chaîne native</span>';
  return `<div class="offlinePremium">${bg?`<img class="offlinePremiumBg" src="${esc(bg)}" alt="">`:''}<div class="offlinePremiumContent">${avatar?`<img class="offlinePremiumAvatar" src="${esc(avatar)}" alt="">`:''}<div class="offlineTags"><span>Hors ligne</span>${tagHtml}</div><h2>${esc(p.display_name||p.login||'Chaîne')} revient bientôt.</h2><p>La bannière, la bio et les infos de chaîne restent visibles. Le live prendra automatiquement cette place quand il sera lancé.</p>${isOwner?`<button class="btn" onclick="setView('manager')">Ouvrir le gestionnaire</button>`:`<button class="btn" onclick="followOryon('${esc(p.login)}')">Suivre la chaîne</button>`}</div></div>`;
}

function oryonChannelPanelsHtml(p,isOwner){
  const raw = Array.isArray(p.panels) ? p.panels : (Array.isArray(p.channel_panels) ? p.channel_panels : []);
  const panels = raw.filter(Boolean).slice(0,6);
  if(panels.length){
    return `<section class="channelPanelArea"><div class="panelAreaHead"><div><h2>Panneaux de chaîne</h2><p>Bannières, liens, extensions et infos mises en avant.</p></div>${isOwner?`<button class="btn secondary" onclick="setView('settings')">Modifier</button>`:''}</div><div class="channelPanelGrid">${panels.map(panel=>`<article class="channelPanel ${panel.image_url||panel.image?'hasImage':''}">${panel.image_url||panel.image?`<img src="${esc(panel.image_url||panel.image)}" alt="">`:''}<div class="channelPanelBody"><b>${esc(panel.title||'Panneau')}</b><span>${esc(panel.text||panel.description||'Information de chaîne')}</span></div></article>`).join('')}</div></section>`;
  }
  return `<section class="channelPanelArea"><div class="panelAreaHead"><div><h2>Panneaux de chaîne</h2><p>Espace prévu pour tes futures bannières, liens et extensions.</p></div>${isOwner?`<button class="btn secondary" onclick="setView('settings')">Ajouter plus tard</button>`:''}</div><div class="channelPanelGrid"><article class="channelPanel"><div class="channelPanelBody"><b>Bannière libre</b><span>Image, lien ou annonce.</span></div></article><article class="channelPanel"><div class="channelPanelBody"><b>Extension future</b><span>Un module pourra s’intégrer ici.</span></div></article><article class="channelPanel"><div class="channelPanelBody"><b>Infos utiles</b><span>Discord, planning, règles ou sponsor.</span></div></article></div></section>`;
}

function oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner){
  const bio=esc(p.bio||"Cette chaîne n'a pas encore ajouté de bio.");
  const tagHtml=(tags||[]).slice(0,14).map(t=>`<span class="tagChipCompact">${esc(t)}</span>`).join('') || '<span class="tagChipCompact">Oryon</span>';
  const badgeHtml=(channelBadges||[]).slice(0,8).map(b=>`<span class="badgeChipCompact"><strong>${esc(b.icon)}</strong>${esc(b.label)}</span>`).join('');
  return `<section class="channelBelowLive"><main class="channelBelowMain"><article class="bioPremium"><h2>Bio</h2><p>${bio}</p></article>${oryonChannelPanelsHtml(p,isOwner)}<article class="identityCompact"><h2>Identité de chaîne</h2><div class="identityRows"><div><span class="identityTitle">Tags</span><div class="tagCloudCompact">${tagHtml}</div></div><div><span class="identityTitle">Badges visibles</span><div class="badgeCloudCompact">${badgeHtml}</div></div></div></article></main><aside class="channelBelowSide"><article class="sideCompactCard"><h3>À propos</h3><p>${esc(p.display_name||p.login)} diffuse sur Oryon. Les badges sont visibles sur la bannière pour donner une identité immédiate à la chaîne.</p></article></aside></section>`;
}

async function renderChannel(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner;
  const banner=p.banner_url||p.offline_image_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=isLive ? fwLiveMediaHtml(p,isOwner,isLive,p.offline_image_url||p.banner_url||'') : oryonOfflinePremiumHtml(p,isOwner,tags);
  const bannerBadges=oryonCreatorBannerBadgesHtml(channelBadges);
  const belowLive=oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint creatorRefine"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div>${bannerBadges}</div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="chanTab(this,'about')">Accueil</button><button onclick="chanTab(this,'about')">À propos</button><button onclick="chanTab(this,'planning')">Planning</button><button onclick="chanTab(this,'clips')">Clips</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section>${belowLive}</div>`;
  applyViewerThemeColor?.();
  if(isLive) setMiniLive?.({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  setupSocket?.(); state.room=targetLogin; state.socket?.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){ attachCurrentStream?.(); }
  else if(isLive){ state.socket?.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer?.(),500); } }
  updateLiveUi?.(isLive);
  refreshEmoteShelf?.(targetLogin);
}

/* ===== Follow-up creator channel fixes ===== */
(function(){
  const st=document.createElement('style');
  st.textContent=`
  #channel .creatorRefine .channelIdentity .avatar{width:140px!important;height:140px!important;min-width:140px!important;border-radius:30px!important;}
  #channel .creatorRefine .channelLiveLayout{display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,26vw,380px);gap:16px;align-items:stretch;}
  #channel .creatorRefine .channelLiveSidebar{display:flex;min-width:0;}
  #channel .creatorRefine .channelLiveSidebar .chatPanel{width:100%;height:100%;min-height:100%;display:grid;grid-template-rows:auto 1fr auto auto;}
  #channel .creatorRefine .channelBelowLive{grid-template-columns:minmax(0,1fr)!important;overflow:visible!important;}
  #channel .creatorRefine .channelBelowMain>*{min-width:0;}
  #channel .creatorRefine .channelBelowSide{display:none!important;}
  #channel .creatorRefine .channelSubNav{display:flex;gap:10px;flex-wrap:wrap;overflow:auto;padding-bottom:4px;}
  #channel .creatorRefine .channelSubNav button.active{background:linear-gradient(135deg,var(--viewer-accent,#8b5cf6),rgba(255,255,255,.14));border-color:color-mix(in srgb,var(--viewer-accent,#8b5cf6) 46%, rgba(255,255,255,.14));box-shadow:0 10px 30px color-mix(in srgb,var(--viewer-accent,#8b5cf6) 28%, transparent);}
  #channel .creatorRefine .channelBelowMain{overflow:visible;}
  #channel .creatorRefine .vignetteArea{padding:22px;display:grid;gap:16px;}
  #channel .creatorRefine .vignetteHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
  #channel .creatorRefine .vignetteHead h2{margin:0;font-size:clamp(24px,1.6vw,32px);}
  #channel .creatorRefine .vignetteHead p{margin:4px 0 0;color:#9fb0c7;font-size:13px;}
  #channel .creatorRefine .vignetteGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
  #channel .creatorRefine .vignetteCard{position:relative;border:1px solid rgba(148,163,184,.22);border-radius:22px;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.03));aspect-ratio:1/1;display:flex;align-items:flex-end;min-width:0;}
  #channel .creatorRefine .vignetteCard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  #channel .creatorRefine .vignetteCard::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.04),rgba(2,6,23,.78));z-index:1;}
  #channel .creatorRefine .vignetteBody{position:relative;z-index:2;padding:14px;display:grid;gap:4px;}
  #channel .creatorRefine .vignetteBody b{font-size:15px;color:#fff;}
  #channel .creatorRefine .vignetteBody span{font-size:12px;color:#bfd0e8;}
  #channel .creatorRefine .vignetteEmpty{border-style:dashed;justify-content:center;align-items:center;text-align:center;padding:18px;}
  #channel .creatorRefine .vignetteEmpty::after{display:none;}
  #channel .creatorRefine .vignetteEmpty .vignetteBody{position:static;z-index:1;}
  #channel .creatorRefine .identityCompact{padding:22px;}
  #channel .creatorRefine .bioPremium,#channel .creatorRefine .identityCompact,#channel .creatorRefine .vignetteArea{scroll-margin-top:110px;}
  @media(max-width:980px){
    #channel .creatorRefine .channelLiveLayout{grid-template-columns:1fr;}
    #channel .creatorRefine .channelIdentity .avatar{width:112px!important;height:112px!important;min-width:112px!important;}
  }
  `;
  document.head.appendChild(st);
})();

const ORYON_SESSION_BACKUP_KEY='oryon_local_backup_user';
const ORYON_VIGNETTES_BACKUP_PREFIX='oryon_channel_vignettes_';
function saveOryonLocalBackup(u){try{if(u)localStorage.setItem(ORYON_SESSION_BACKUP_KEY,JSON.stringify(u));}catch(_){}}
function readOryonLocalBackup(){try{return JSON.parse(localStorage.getItem(ORYON_SESSION_BACKUP_KEY)||'null')}catch(_){return null}}
function clearOryonLocalBackup(){try{localStorage.removeItem(ORYON_SESSION_BACKUP_KEY)}catch(_){}}

const __oryonOrigLoadSession = loadSession;
loadSession = async function(){
  let s=null;
  try{s=await api('/api/oryon/session')}catch(_){s=null}
  if(s&&s.success){
    state.session.local=s.local||readOryonLocalBackup()||null;
    state.session.twitch=s.twitch||null;
    if(state.session.local)saveOryonLocalBackup(state.session.local);
  }else{
    state.session.local=readOryonLocalBackup()||null;
  }
  renderNav();
  renderUserMenu();
};

const __oryonOrigLogout = logoutOryon;
logoutOryon = async function(){
  clearOryonLocalBackup();
  return __oryonOrigLogout();
};

const __oryonOrigBindSettingsForms = bindSettingsForms;
bindSettingsForms = function(){
  __oryonOrigBindSettingsForms();
  const lf=$('#loginForm');
  if(lf && lf.onsubmit && !lf.__oryonPersistWrapped){
    const orig=lf.onsubmit;
    lf.__oryonPersistWrapped=true;
    lf.onsubmit=async function(e){
      await orig.call(this,e);
      if(state.session.local)saveOryonLocalBackup(state.session.local);
    };
  }
  const rf=$('#registerForm');
  if(rf && rf.onsubmit && !rf.__oryonPersistWrapped){
    const orig=rf.onsubmit;
    rf.__oryonPersistWrapped=true;
    rf.onsubmit=async function(e){
      await orig.call(this,e);
      if(state.session.local)saveOryonLocalBackup(state.session.local);
    };
  }
  const pf=$('#profileForm');
  if(pf && pf.onsubmit && !pf.__oryonPersistWrapped){
    const orig=pf.onsubmit;
    pf.__oryonPersistWrapped=true;
    pf.onsubmit=async function(e){
      await orig.call(this,e);
      if(state.session.local)saveOryonLocalBackup(state.session.local);
    };
  }
};

function oryonReadVignetteBackup(login){
  if(!login)return [];
  try{return JSON.parse(localStorage.getItem(ORYON_VIGNETTES_BACKUP_PREFIX+login.toLowerCase())||'[]')}catch(_){return []}
}
function oryonSaveVignetteBackup(login,items){
  if(!login)return;
  try{localStorage.setItem(ORYON_VIGNETTES_BACKUP_PREFIX+login.toLowerCase(),JSON.stringify(items||[]))}catch(_){ }
}
function oryonGetChannelVignettes(p){
  const raw = Array.isArray(p.channel_vignettes) ? p.channel_vignettes : (Array.isArray(p.channel_panels) ? p.channel_panels : []);
  const mapped = raw.filter(Boolean).map((item,i)=>({
    image_url:item.image_url||item.image||'',
    title:item.title||('Vignette '+(i+1)),
    description:item.text||item.description||'Image de chaîne'
  })).filter(v=>v.image_url).slice(0,6);
  if(mapped.length)return mapped;
  return oryonReadVignetteBackup(p.login).slice(0,6);
}
function compressImageMax(file,max=800){
  return new Promise((resolve,reject)=>{
    const img=new Image(); const rd=new FileReader();
    rd.onload=()=>{ img.onload=()=>{
      let w=img.width,h=img.height;
      const ratio=Math.min(1,max/Math.max(w,h));
      w=Math.max(1,Math.round(w*ratio)); h=Math.max(1,Math.round(h*ratio));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/jpeg',0.82));
    }; img.onerror=reject; img.src=rd.result;};
    rd.onerror=reject; rd.readAsDataURL(file);
  });
}
async function saveChannelVignettes(images){
  const viewer=state.session.local; const p=state.channelProfile||viewer||{};
  const login=(viewer?.login||p.login||'').toLowerCase();
  if(!login){toast('Compte Oryon requis'); return}
  const prev=await api('/api/oryon/profile/'+encodeURIComponent(login)).catch(()=>({}));
  const cur=prev.user||p||viewer||{};
  const panels=(images||[]).map((img,i)=>({image_url:img.image_url||img.image||img,title:img.title||('Vignette '+(i+1)),text:img.description||img.text||'Image de chaîne'}));
  oryonSaveVignetteBackup(login,panels);
  const body={
    display_name:cur.display_name||viewer?.display_name||viewer?.login||login,
    bio:cur.bio||'',
    avatar_url:cur.avatar_url||'',
    banner_url:cur.banner_url||'',
    offline_image_url:cur.offline_image_url||'',
    tags:Array.isArray(cur.tags)?cur.tags.join(', '):(cur.tags||''),
    channel_badges:cur.channel_badges||[],
    channel_panels:panels,
    channel_vignettes:panels,
    peertube_watch_url:cur.peertube_watch_url||'',
    peertube_embed_url:cur.peertube_embed_url||'',
    oryon_local_player_url:cur.oryon_local_player_url||'',
    oryon_local_status_url:cur.oryon_local_status_url||''
  };
  const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify(body)}).catch(()=>({success:false}));
  if(r?.success){toast('Vignettes enregistrées'); await loadSession(); await renderChannel();}
  else {toast(r?.error||'Vignettes gardées localement dans ce navigateur'); state.channelProfile={...cur,channel_panels:panels,channel_vignettes:panels}; await renderChannel();}
}
async function handleChannelVignettesUpload(files){
  const current=oryonGetChannelVignettes(state.channelProfile||{});
  const selected=[...(files||[])].slice(0,6);
  if(!selected.length)return;
  const items=[];
  for(let i=0;i<selected.length;i++){
    const file=selected[i];
    const data=await compressImageMax(file,800);
    items.push({image_url:data,title:file.name.replace(/\.[^.]+$/,''),description:'Image de chaîne'});
  }
  const merged=[...current,...items].slice(0,6);
  await saveChannelVignettes(merged);
}
function openChannelVignettesEditor(){
  const input=$('#channelVignetteInput');
  if(input)input.click();
}
function removeChannelVignette(idx){
  const items=oryonGetChannelVignettes(state.channelProfile||{}).filter((_,i)=>i!==idx);
  saveChannelVignettes(items);
}
function oryonChannelPanelsHtml(p,isOwner){
  const panels=oryonGetChannelVignettes(p);
  return `<section id="channelVignettesSection" class="vignetteArea"><div class="vignetteHead"><div><h2>Vignettes de chaîne</h2><p>Ajoute jusqu'à 6 images. Chaque image est automatiquement limitée à 800×800 max.</p></div>${isOwner?`<div class="row"><button class="btn secondary" onclick="openChannelVignettesEditor()">Éditer vignettes</button><input id="channelVignetteInput" type="file" accept="image/*" multiple class="hidden"></div>`:''}</div><div class="vignetteGrid">${panels.length?panels.map((panel,i)=>`<article class="vignetteCard"><img src="${esc(panel.image_url)}" alt=""><div class="vignetteBody"><b>${esc(panel.title||('Vignette '+(i+1)))}</b><span>${esc(panel.description||'Image de chaîne')}</span>${isOwner?`<button class="btn secondary" style="margin-top:6px;width:max-content" onclick="removeChannelVignette(${i})">Retirer</button>`:''}</div></article>`).join(''):`<article class="vignetteCard vignetteEmpty"><div class="vignetteBody"><b>Aucune vignette pour l’instant</b><span>${isOwner?'Clique sur “Éditer vignettes” pour uploader des images.':'Le créateur n’a pas encore ajouté de vignettes.'}</span></div></article>`}</div></section>`;
}
function oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner){
  const bio=esc(p.bio||"Cette chaîne n'a pas encore ajouté de bio.");
  const tagHtml=(tags||[]).slice(0,14).map(t=>`<span class="tagChipCompact">${esc(t)}</span>`).join('') || '<span class="tagChipCompact">Oryon</span>';
  const badgeHtml=(channelBadges||[]).slice(0,8).map(b=>`<span class="badgeChipCompact"><strong>${esc(b.icon)}</strong>${esc(b.label)}</span>`).join('');
  return `<section class="channelBelowLive"><main class="channelBelowMain"><article id="channelBioSection" class="bioPremium"><h2>Bio</h2><p>${bio}</p></article>${oryonChannelPanelsHtml(p,isOwner)}<article id="channelIdentitySection" class="identityCompact"><h2>Identité de chaîne</h2><div class="identityRows"><div><span class="identityTitle">Tags</span><div class="tagCloudCompact">${tagHtml}</div></div><div><span class="identityTitle">Badges visibles</span><div class="badgeCloudCompact">${badgeHtml}</div></div></div></article></main></section>`;
}
function channelSubNav(btn,tab){
  $$('.channelSubNav button').forEach(b=>b.classList.remove('active'));
  btn?.classList.add('active');
  const map={home:'#channelPlayerTop',about:'#channelBioSection',planning:'#channelVignettesSection',clips:'#channelIdentitySection'};
  const target=document.querySelector(map[tab]||map.home);
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}
renderChannel = async function(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner;
  if(viewer)saveOryonLocalBackup(viewer);
  const banner=p.banner_url||p.offline_image_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=isLive ? fwLiveMediaHtml(p,isOwner,isLive,p.offline_image_url||p.banner_url||'') : oryonOfflinePremiumHtml(p,isOwner,tags);
  const bannerBadges=oryonCreatorBannerBadgesHtml(channelBadges);
  const belowLive=oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint creatorRefine"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div>${bannerBadges}</div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="channelSubNav(this,'home')">Accueil</button><button onclick="channelSubNav(this,'about')">À propos</button><button onclick="channelSubNav(this,'planning')">Vignettes</button><button onclick="channelSubNav(this,'clips')">Identité</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer" id="channelPlayerTop"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section>${belowLive}</div>`;
  const input=$('#channelVignetteInput');
  if(input && !input.__oryonBound){ input.__oryonBound=true; input.addEventListener('change',e=>handleChannelVignettesUpload(e.target.files)); }
  applyViewerThemeColor?.();
  if(isLive) setMiniLive?.({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  setupSocket?.(); state.room=targetLogin; state.socket?.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){ attachCurrentStream?.(); }
  else if(isLive){ state.socket?.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){ setTimeout(()=>requestOffer?.(),500); } }
  updateLiveUi?.(isLive);
  refreshEmoteShelf?.(targetLogin);
};


/* ===== Final memory + creator channel vignette layout fix ===== */
(function(){
  const st=document.createElement('style');
  st.textContent=`
  #channel .creatorRefine .channelIdentity .avatar{width:180px!important;height:180px!important;min-width:180px!important;border-radius:38px!important;}
  #channel .creatorRefine .channelTitleBlock h1{font-size:clamp(52px,5.8vw,96px)!important;}
  #channel .creatorRefine .channelBelowLive{grid-template-columns:1fr!important;max-width:100%!important;overflow:visible!important;}
  #channel .creatorRefine .channelBelowSide{display:none!important;}
  #channel .creatorRefine .identityCompact{display:none!important;}
  #channel .creatorRefine .vignetteArea{padding:22px;display:grid;gap:16px;border:1px solid rgba(148,163,184,.16);border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.9),rgba(8,13,24,.94));}
  #channel .creatorRefine .vignetteHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
  #channel .creatorRefine .vignetteHead h2{margin:0;font-size:clamp(24px,1.5vw,32px);}
  #channel .creatorRefine .vignetteGrid{display:grid;grid-template-columns:repeat(4,minmax(0,250px));gap:14px;justify-content:start;align-items:start;}
  #channel .creatorRefine .vignetteCard{position:relative;width:100%;max-width:250px;aspect-ratio:1/1;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.24);background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));display:flex;align-items:flex-end;}
  #channel .creatorRefine .vignetteCard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  #channel .creatorRefine .vignetteCard::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.02),rgba(2,6,23,.78));z-index:1;}
  #channel .creatorRefine .vignetteCard.empty{border-style:dashed;align-items:center;justify-content:center;text-align:center;}
  #channel .creatorRefine .vignetteCard.empty::after{display:none;}
  #channel .creatorRefine .vignetteBody{position:relative;z-index:2;padding:12px;display:grid;gap:4px;min-width:0;}
  #channel .creatorRefine .vignetteBody b{font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #channel .creatorRefine .vignetteBody span{font-size:12px;color:#bfd0e8;}
  #channel .creatorRefine .bioPremium{scroll-margin-top:104px;}
  #channel .creatorRefine .channelLiveLayout{grid-template-columns:minmax(0,1fr) clamp(320px,25vw,410px)!important;align-items:stretch!important;}
  #channel .creatorRefine .channelLiveSidebar{display:flex!important;min-width:0!important;}
  #channel .creatorRefine .channelLiveSidebar .chatPanel{width:100%!important;height:100%!important;display:grid!important;grid-template-rows:auto minmax(0,1fr) auto auto!important;}
  @media(max-width:1120px){#channel .creatorRefine .channelLiveLayout{grid-template-columns:1fr!important;}#channel .creatorRefine .vignetteGrid{grid-template-columns:repeat(2,minmax(0,250px));}#channel .creatorRefine .channelIdentity .avatar{width:136px!important;height:136px!important;min-width:136px!important;}}
  @media(max-width:640px){#channel .creatorRefine .vignetteGrid{grid-template-columns:repeat(2,minmax(0,1fr));}#channel .creatorRefine .channelIdentity .avatar{width:108px!important;height:108px!important;min-width:108px!important;}#channel .creatorRefine .channelTitleBlock h1{font-size:42px!important;}}
  `;
  document.head.appendChild(st);
})();

const ORYON_SESSION_BACKUP_KEY_FINAL='oryon_persistent_local_account_v2';
const ORYON_VIGNETTES_BACKUP_PREFIX_FINAL='oryon_channel_vignettes_250_';
function oryonLocalBackupUser(){try{return JSON.parse(localStorage.getItem(ORYON_SESSION_BACKUP_KEY_FINAL)||localStorage.getItem('oryon_local_backup_user')||'null')}catch(_){return null}}
function oryonSaveBackupUser(user, token){
  if(!user)return;
  try{
    const previous=oryonLocalBackupUser()||{};
    localStorage.setItem(ORYON_SESSION_BACKUP_KEY_FINAL, JSON.stringify({user,login:user.login,remember_token:token||previous.remember_token||null,savedAt:Date.now()}));
    localStorage.setItem('oryon_local_backup_user', JSON.stringify(user));
  }catch(_){}
}
function oryonClearBackupUser(){try{localStorage.removeItem(ORYON_SESSION_BACKUP_KEY_FINAL);localStorage.removeItem('oryon_local_backup_user')}catch(_){}}

loadSession = async function(){
  let s=null;
  try{s=await api('/api/oryon/session')}catch(_){s=null}
  if(s?.success && s.local){
    state.session.local=s.local; state.session.twitch=s.twitch||null; oryonSaveBackupUser(s.local); renderNav(); renderUserMenu(); return;
  }
  const backup=oryonLocalBackupUser();
  if(backup?.login && backup?.remember_token){
    try{
      const r=await api('/api/oryon/restore-session',{method:'POST',body:JSON.stringify({login:backup.login,remember_token:backup.remember_token})});
      if(r?.success && r.user){ state.session.local=r.user; state.session.twitch=s?.twitch||null; oryonSaveBackupUser(r.user,backup.remember_token); renderNav(); renderUserMenu(); return; }
    }catch(_){ }
  }
  state.session.local=backup?.user||backup||null;
  state.session.twitch=s?.twitch||null;
  renderNav(); renderUserMenu();
};

logoutOryon = async function(){
  await api('/api/oryon/logout',{method:'POST'}).catch(()=>{});
  oryonClearBackupUser();
  state.session.local=null;
  if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null}
  await loadSession(); setView('home'); toast('Déconnecté');
};

bindSettingsForms = function(){
  const lf=$('#loginForm');
  if(lf)lf.onsubmit=async e=>{
    e.preventDefault();
    const r=await api('/api/oryon/login',{method:'POST',body:JSON.stringify({login:$('#loginName').value,password:$('#loginPass').value})});
    toast(r.success?'Connecté':r.error);
    if(r.success){ if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null} oryonSaveBackupUser(r.user,r.remember_token); await loadSession(); setView('home'); }
  };
  const rf=$('#registerForm');
  if(rf)rf.onsubmit=async e=>{
    e.preventDefault();
    const r=await api('/api/oryon/register',{method:'POST',body:JSON.stringify({login:$('#regName').value,email:$('#regEmail').value,password:$('#regPass').value})});
    toast(r.success?'Compte créé':r.error);
    if(r.success){ if(state.socket){state.socket.disconnect();state.socket=null;state.socketLogin=null} oryonSaveBackupUser(r.user,r.remember_token); await loadSession(); state.watchRoom=null; setView('channel'); }
  };
  const pf=$('#profileForm');
  if(pf){
    fileToData($('#avatarFile'),$('#profileAvatar')); fileToData($('#bannerFile'),$('#profileBanner')); fileToData($('#offlineFile'),$('#profileOffline'));
    pf.onsubmit=async e=>{
      e.preventDefault();
      const prev=await api('/api/oryon/profile/'+encodeURIComponent(state.session.local?.login||'')).catch(()=>({}));
      const cur=prev.user||{};
      const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify({
        display_name:$('#profileDisplay').value,bio:$('#profileBio').value,avatar_url:$('#profileAvatar').value,banner_url:$('#profileBanner').value,offline_image_url:$('#profileOffline').value,tags:$('#profileTags').value,
        channel_badges:cur.channel_badges||[],channel_panels:cur.channel_panels||cur.channel_vignettes||[],channel_vignettes:cur.channel_vignettes||cur.channel_panels||[],
        peertube_watch_url:'',peertube_embed_url:'',oryon_local_player_url:cur.oryon_local_player_url||state.channelProfile?.oryon_local_player_url||'',oryon_local_status_url:cur.oryon_local_status_url||state.channelProfile?.oryon_local_status_url||''
      })});
      toast(r.success?'Profil sauvegardé':r.error); if(r.success)oryonSaveBackupUser(r.user); await loadSession(); renderSettings();
    };
  }
};

function oryonReadVignettes(login){try{return JSON.parse(localStorage.getItem(ORYON_VIGNETTES_BACKUP_PREFIX_FINAL+String(login||'').toLowerCase())||'[]')}catch(_){return []}}
function oryonSaveVignettes(login,items){try{localStorage.setItem(ORYON_VIGNETTES_BACKUP_PREFIX_FINAL+String(login||'').toLowerCase(),JSON.stringify((items||[]).slice(0,8)))}catch(_){}}
function oryonGetChannelVignettes(p){
  const raw=Array.isArray(p.channel_vignettes)?p.channel_vignettes:(Array.isArray(p.channel_panels)?p.channel_panels:[]);
  const server=raw.map((v,i)=>({image_url:v.image_url||v.image||'',title:v.title||`Vignette ${i+1}`,description:v.description||v.text||''})).filter(v=>v.image_url).slice(0,8);
  return server.length?server:oryonReadVignettes(p.login).slice(0,8);
}
function compressImageMax(file,max=250){
  return new Promise((resolve,reject)=>{const img=new Image();const rd=new FileReader();rd.onload=()=>{img.onload=()=>{let w=img.width,h=img.height;const ratio=Math.min(1,max/Math.max(w,h));w=Math.max(1,Math.round(w*ratio));h=Math.max(1,Math.round(h*ratio));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',0.82));};img.onerror=reject;img.src=rd.result};rd.onerror=reject;rd.readAsDataURL(file)});
}
async function saveChannelVignettes(items){
  const viewer=state.session.local; const p=state.channelProfile||viewer||{}; const login=(viewer?.login||p.login||'').toLowerCase();
  if(!login){toast('Compte Oryon requis');return}
  const panels=(items||[]).slice(0,8).map((v,i)=>({image_url:v.image_url||v.image||'',title:v.title||`Vignette ${i+1}`,description:v.description||v.text||''})).filter(v=>v.image_url);
  oryonSaveVignettes(login,panels);
  const prev=await api('/api/oryon/profile/'+encodeURIComponent(login)).catch(()=>({})); const cur=prev.user||p||viewer||{};
  const body={display_name:cur.display_name||viewer?.display_name||login,bio:cur.bio||'',avatar_url:cur.avatar_url||'',banner_url:cur.banner_url||'',offline_image_url:cur.offline_image_url||'',tags:Array.isArray(cur.tags)?cur.tags.join(', '):(cur.tags||''),channel_badges:cur.channel_badges||[],channel_panels:panels,channel_vignettes:panels,peertube_watch_url:cur.peertube_watch_url||'',peertube_embed_url:cur.peertube_embed_url||'',oryon_local_player_url:cur.oryon_local_player_url||'',oryon_local_status_url:cur.oryon_local_status_url||''};
  const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify(body)}).catch(()=>({success:false}));
  if(r.success){oryonSaveBackupUser(r.user); toast('Vignettes enregistrées'); await loadSession();}
  else toast('Vignettes gardées localement');
  state.channelProfile={...cur,channel_panels:panels,channel_vignettes:panels}; await renderChannel();
}
async function handleChannelVignettesUpload(files){
  const current=oryonGetChannelVignettes(state.channelProfile||{});
  const selected=[...(files||[])].slice(0,8-current.length);
  if(!selected.length)return;
  const added=[];
  for(const f of selected){ added.push({image_url:await compressImageMax(f,250),title:f.name.replace(/\.[^.]+$/,''),description:'Image de chaîne'}); }
  await saveChannelVignettes([...current,...added].slice(0,8));
}
function openChannelVignettesEditor(){ $('#channelVignetteInput')?.click(); }
function removeChannelVignette(i){ const items=oryonGetChannelVignettes(state.channelProfile||{}).filter((_,idx)=>idx!==i); saveChannelVignettes(items); }
function oryonChannelPanelsHtml(p,isOwner){
  const panels=oryonGetChannelVignettes(p);
  const cells=[];
  for(let i=0;i<8;i++){
    const v=panels[i];
    cells.push(v?`<article class="vignetteCard"><img src="${esc(v.image_url)}" alt=""><div class="vignetteBody"><b>${esc(v.title||`Vignette ${i+1}`)}</b><span>${esc(v.description||'Image de chaîne')}</span>${isOwner?`<button class="btn secondary" style="margin-top:6px;width:max-content" onclick="removeChannelVignette(${i})">Retirer</button>`:''}</div></article>`:`<article class="vignetteCard empty"><div class="vignetteBody"><b>Emplacement ${i+1}</b><span>${isOwner?'Libre pour une vignette':'Libre'}</span></div></article>`);
  }
  return `<section id="channelVignettesSection" class="vignetteArea"><div class="vignetteHead"><div><h2>Vignettes de chaîne</h2></div>${isOwner?`<div class="row"><button class="btn secondary" onclick="openChannelVignettesEditor()">Éditer vignettes</button><input id="channelVignetteInput" type="file" accept="image/*" multiple class="hidden"></div>`:''}</div><div class="vignetteGrid">${cells.join('')}</div></section>`;
}
function oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner){
  const bio=esc(p.bio||"Cette chaîne n'a pas encore ajouté de bio.");
  return `<section class="channelBelowLive"><main class="channelBelowMain"><article id="channelBioSection" class="bioPremium"><h2>Bio</h2><p>${bio}</p></article>${oryonChannelPanelsHtml(p,isOwner)}</main></section>`;
}
function channelSubNav(btn,tab){
  $$('.channelSubNav button').forEach(b=>b.classList.remove('active')); btn?.classList.add('active');
  const target=document.querySelector(tab==='about'?'#channelBioSection':tab==='vignettes'?'#channelVignettesSection':'#channelPlayerTop');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}
renderChannel = async function(){
  const viewer=state.session.local;
  const targetLogin=(state.watchRoom || viewer?.login || '').toLowerCase();
  if(!targetLogin){ $('#channel').innerHTML=authRequired(); return; }
  state.lastChannelLogin=targetLogin;
  const prof=await api('/api/oryon/profile/'+encodeURIComponent(targetLogin));
  const p=prof.user || (viewer && viewer.login===targetLogin ? viewer : {login:targetLogin,display_name:targetLogin});
  const support=await api('/api/oryon/supporters/'+encodeURIComponent(targetLogin)).catch(()=>({success:false,first_supporters:[]}));
  state.channelSupport=support;
  const isOwner=!!viewer && viewer.login===targetLogin;
  const lives=await api('/api/native/lives').catch(()=>({items:[]}));
  const liveRoom=(lives.items||[]).find(x=>(x.host_login||x.room)===targetLogin);
  const isLive=!!liveRoom || !!(p.local_agent_live && p.oryon_local_player_url) || (isOwner && !!state.stream);
  state.channelProfile=p; state.channelOwner=isOwner; if(viewer)oryonSaveBackupUser(viewer);
  const banner=p.banner_url||p.offline_image_url||'';
  const tags=Array.isArray(p.tags)?p.tags:(String(p.tags||'').split(',').map(x=>x.trim()).filter(Boolean));
  const channelBadges=channelBadgesFor(p,support,isOwner);
  const ownerActions=isOwner?`<button class="btn" onclick="setView('manager')">Gestionnaire</button><button class="btn secondary" onclick="setView('settings')">Modifier profil</button>`:`<button class="btn" onclick="followOryon('${esc(targetLogin)}')">Suivre</button><button id="likeBtn" class="btn secondary" onclick="likeOryon('${esc(targetLogin)}')">Aimer</button>${supportButton(targetLogin,support)}<button class="btn ghost" onclick="quickGem()">Autre live</button>`;
  const media=isLive ? fwLiveMediaHtml(p,isOwner,isLive,p.offline_image_url||p.banner_url||'') : oryonOfflinePremiumHtml(p,isOwner,tags);
  const bannerBadges=oryonCreatorBannerBadgesHtml(channelBadges);
  const belowLive=oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner);
  $('#channel').innerHTML=`<div class="channelPage twitchLike viewerTint creatorRefine"><section class="channelTopHero">${banner?`<img src="${esc(banner)}" alt="">`:''}<div class="channelHeroContent"><div class="channelIdentity"><img class="avatar" src="${esc(p.avatar_url||'')}" alt=""><div class="channelTitleBlock"><h1>${esc(p.display_name||p.login)}</h1><p>${esc(p.bio||'Chaîne Oryon')}</p><div class="channelBadgesBar"><span id="channelLiveBadge" class="pill">${isLive?'🔴 En direct':'Hors ligne'}</span><span class="pill">@${esc(p.login)}</span><span class="pill">${Number(p.followers_count||0)} followers</span>${tags.slice(0,4).map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div>${bannerBadges}</div></div><div class="channelActionDock">${ownerActions}</div></div></section><nav class="channelSubNav"><button class="active" onclick="channelSubNav(this,'home')">Accueil</button><button onclick="channelSubNav(this,'about')">À propos</button><button onclick="channelSubNav(this,'vignettes')">Vignettes</button></nav><section class="channelLiveLayout"><main class="channelMainPlayer" id="channelPlayerTop"><div class="player premiumPlayer oryonMainPlayer">${media}</div></main><aside class="channelLiveSidebar"><div class="chatPanel nativeFixedChat" data-chat="oryon"><div class="chatHeader"><span>Tchat Oryon · ${esc(p.display_name||p.login)}</span><button class="btn ghost" onclick="reportRoom()">Signaler</button></div><div id="nativeChatLog" class="chatLog"></div><div id="customEmoteShelf" class="emotePanel hidden"></div><div id="gifGrid" class="gifGrid hidden"></div><div class="chatAssist"><button onclick="chatQuick('question')">Question</button><button onclick="chatQuick('new')">Nouveau ici</button><button onclick="chatQuick('react')">Réagir</button></div><div class="chatForm"><input id="chatInput" placeholder="Écrire sur Oryon…"><button class="btn secondary" onclick="toggleEmotes()">Emotes</button><button class="btn secondary" onclick="toggleGifs()">GIF</button><button class="btn" onclick="sendChat()">Envoyer</button></div></div></aside></section>${belowLive}</div>`;
  const input=$('#channelVignetteInput'); if(input&&!input.__bound){input.__bound=true; input.addEventListener('change',e=>handleChannelVignettesUpload(e.target.files));}
  applyViewerThemeColor?.(); if(isLive)setMiniLive?.({type:'oryon',login:targetLogin,title:'Oryon · '+(p.display_name||p.login)});
  setupSocket?.(); state.room=targetLogin; state.socket?.emit('native:chat:history',{room:state.room});
  if(isOwner && state.stream){attachCurrentStream?.();}
  else if(isLive){state.socket?.emit('native:join',{room:targetLogin}); if(!p.oryon_local_player_url){setTimeout(()=>requestOffer?.(),500);}}
  updateLiveUi?.(isLive); refreshEmoteShelf?.(targetLogin);
};

/* =========================================================
   Creator channel panels — Twitch-like panels + real recovery pass
   ========================================================= */
(function injectCreatorPanelTwitchStyle(){
  const old=document.getElementById('creatorPanelTwitchStyle'); if(old) old.remove();
  const st=document.createElement('style');
  st.id='creatorPanelTwitchStyle';
  st.textContent=`
  #channel .creatorRefine .channelIdentity .avatar{width:188px!important;height:188px!important;min-width:188px!important;border-radius:38px!important;object-fit:cover!important;box-shadow:0 24px 70px rgba(0,0,0,.42),0 0 0 3px rgba(255,255,255,.12)!important;}
  #channel .creatorRefine .channelTitleBlock h1{font-size:clamp(64px,6vw,112px)!important;line-height:.84!important;}
  #channel .creatorRefine .vignetteArea{padding:26px!important;border-radius:28px!important;background:linear-gradient(180deg,rgba(15,23,42,.94),rgba(8,13,24,.98))!important;}
  #channel .creatorRefine .vignetteHead{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px;}
  #channel .creatorRefine .vignetteHead h2{margin:0;font-size:clamp(26px,1.8vw,36px)!important;}
  #channel .creatorRefine .vignetteHint{margin:4px 0 0;color:#9fb0c7;font-size:13px;}
  #channel .creatorRefine .vignetteGrid{display:grid!important;grid-template-columns:repeat(4,250px)!important;gap:24px!important;align-items:start!important;justify-content:start!important;max-width:1072px!important;}
  #channel .creatorRefine .vignettePanel{width:250px;max-width:250px;display:grid;gap:10px;align-content:start;color:#eef6ff;}
  #channel .creatorRefine .vignetteImageWrap{position:relative;width:250px;height:250px;border-radius:18px;overflow:hidden;border:1px solid rgba(148,163,184,.24);background:rgba(255,255,255,.035);display:grid;place-items:center;text-align:center;color:#9fb0c7;}
  #channel .creatorRefine .vignetteImageWrap img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .18s ease,filter .18s ease;}
  #channel .creatorRefine a.vignetteImageWrap:hover img{transform:scale(1.03);filter:brightness(1.08);}
  #channel .creatorRefine .vignetteEmptyBox{padding:16px;font-size:13px;line-height:1.35;}
  #channel .creatorRefine .vignetteText{display:grid;gap:5px;min-width:0;}
  #channel .creatorRefine .vignetteText b{font-size:16px;line-height:1.1;white-space:normal;overflow-wrap:anywhere;}
  #channel .creatorRefine .vignetteText p{margin:0;color:#c9d5e8;font-size:13px;line-height:1.38;overflow-wrap:anywhere;}
  #channel .creatorRefine .vignetteLinkBadge{position:absolute;right:10px;top:10px;z-index:3;border-radius:999px;background:rgba(2,6,23,.82);border:1px solid rgba(255,255,255,.16);padding:6px 8px;font-size:12px;font-weight:1000;}
  .panelEditorOverlay{position:fixed;inset:0;background:rgba(2,6,23,.76);backdrop-filter:blur(12px);z-index:99999;display:grid;place-items:center;padding:22px;}
  .panelEditorModal{width:min(1180px,96vw);max-height:90vh;overflow:auto;border-radius:28px;border:1px solid rgba(148,163,184,.22);background:linear-gradient(180deg,#111827,#07111f);box-shadow:0 30px 120px rgba(0,0,0,.55);padding:22px;display:grid;gap:18px;}
  .panelEditorHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}
  .panelEditorHead h2{margin:0;font-size:30px;}.panelEditorHead p{margin:6px 0 0;color:#9fb0c7;}
  .panelEditorGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}
  .panelEditCard{border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.04);border-radius:18px;padding:12px;display:grid;gap:10px;}
  .panelEditPreview{width:100%;aspect-ratio:1/1;border-radius:14px;overflow:hidden;border:1px dashed rgba(148,163,184,.3);background:rgba(0,0,0,.22);display:grid;place-items:center;text-align:center;color:#9fb0c7;font-size:12px;}
  .panelEditPreview img{width:100%;height:100%;object-fit:cover;display:block;}
  .panelEditCard input,.panelEditCard textarea{width:100%;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:#06101d;color:#eaf2ff;padding:10px;font-weight:800;box-sizing:border-box;}
  .panelEditCard textarea{min-height:70px;resize:vertical;font-weight:700;}
  .panelEditorActions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}
  @media(max-width:1180px){#channel .creatorRefine .vignetteGrid{grid-template-columns:repeat(2,250px)!important}.panelEditorGrid{grid-template-columns:repeat(2,minmax(0,1fr));}#channel .creatorRefine .channelIdentity .avatar{width:150px!important;height:150px!important;min-width:150px!important;}}
  @media(max-width:640px){#channel .creatorRefine .vignetteGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important}#channel .creatorRefine .vignettePanel,#channel .creatorRefine .vignetteImageWrap{width:100%;max-width:none;height:auto;aspect-ratio:1/1}#channel .creatorRefine .channelIdentity .avatar{width:124px!important;height:124px!important;min-width:124px!important}.panelEditorGrid{grid-template-columns:1fr}.panelEditorOverlay{padding:10px}.panelEditorModal{padding:16px;border-radius:20px}}
  `;
  document.head.appendChild(st);
})();

function panelSafeUrl(url){
  const s=String(url||'').trim();
  if(!s) return '';
  try{const u=new URL(s); return (u.protocol==='http:'||u.protocol==='https:')?u.toString():'';}catch(_){return ''}
}
function oryonLocalFullUserBackup(){try{return JSON.parse(localStorage.getItem(ORYON_SESSION_BACKUP_KEY_FINAL)||localStorage.getItem('oryon_local_backup_user')||'null')}catch(_){return null}}
function oryonSaveBackupUser(user, token){
  if(!user)return;
  try{
    const previous=oryonLocalFullUserBackup()||{};
    const storedUser={...(previous.user||{}),...user};
    localStorage.setItem(ORYON_SESSION_BACKUP_KEY_FINAL,JSON.stringify({user:storedUser,login:storedUser.login,remember_token:token||previous.remember_token||null,savedAt:Date.now()}));
    localStorage.setItem('oryon_local_backup_user',JSON.stringify(storedUser));
  }catch(_){ }
}
async function oryonRecoverClientSession(backup){
  if(!backup?.user && !backup?.login)return null;
  const payload={user:backup.user||backup,remember_token:backup.remember_token||backup.token||''};
  const r=await api('/api/oryon/client-recover',{method:'POST',body:JSON.stringify(payload)}).catch(()=>null);
  if(r?.success&&r.user){oryonSaveBackupUser(r.user,r.remember_token||backup.remember_token);return r.user;}
  return null;
}
loadSession = async function(){
  let s=null; try{s=await api('/api/oryon/session')}catch(_){s=null}
  if(s?.success && s.local){state.session.local=s.local;state.session.twitch=s.twitch||null;oryonSaveBackupUser(s.local);renderNav();renderUserMenu();return;}
  const backup=oryonLocalFullUserBackup();
  if(backup?.login && backup?.remember_token){
    const r=await api('/api/oryon/restore-session',{method:'POST',body:JSON.stringify({login:backup.login,remember_token:backup.remember_token})}).catch(()=>null);
    if(r?.success&&r.user){state.session.local=r.user;state.session.twitch=s?.twitch||null;oryonSaveBackupUser(r.user,backup.remember_token);renderNav();renderUserMenu();return;}
  }
  const recovered=backup?await oryonRecoverClientSession(backup):null;
  if(recovered){state.session.local=recovered;state.session.twitch=s?.twitch||null;renderNav();renderUserMenu();return;}
  state.session.local=backup?.user||backup||null; state.session.twitch=s?.twitch||null; renderNav();renderUserMenu();
};

function oryonReadTeamsBackup(){try{return JSON.parse(localStorage.getItem('oryon_teams_backup_v2')||'[]')}catch(_){return []}}
function oryonSaveTeamsBackup(items){try{localStorage.setItem('oryon_teams_backup_v2',JSON.stringify((items||[]).slice(0,60)))}catch(_){}}
async function oryonRecoverTeamsIfNeeded(serverItems){
  const local=oryonReadTeamsBackup();
  if((serverItems||[]).length || !local.length || !state.session.local)return serverItems||[];
  const r=await api('/api/oryon/teams/recover',{method:'POST',body:JSON.stringify({teams:local})}).catch(()=>null);
  if(r?.success&&Array.isArray(r.items)){oryonSaveTeamsBackup(r.items);return r.items;}
  return local;
}
loadTeams = async function(){
  const r=await api('/api/oryon/teams').catch(()=>({items:[]}));
  let items=await oryonRecoverTeamsIfNeeded(r.items||[]);
  if(items.length)oryonSaveTeamsBackup(items);
  const box=$('#teamsList'); if(!box)return;
  box.innerHTML=items.map(t=>`<article class="teamCardFull"><div class="row"><img class="teamLogo" src="${esc(t.logo_url||'')}" alt=""><div><h2>${esc(t.name)}</h2><p class="muted">${esc(t.description||'Équipe Oryon')}</p></div></div><p><span class="pill">${t.members?.length||0} membres</span> <span class="pill">${t.points||0} points</span></p><div class="row"><button class="btn" onclick="joinTeam('${esc(t.slug)}')">Rejoindre</button><button class="btn secondary" onclick="viewTeam('${esc(t.slug)}')">Voir</button></div></article>`).join('')||'<div class="teamCardFull"><h2>Aucune équipe pour le moment.</h2><p class="muted">Crée la première équipe avec un logo, une identité et des membres live.</p></div>';
};
createTeam = async function(e){
  e.preventDefault(); await loadSession(); if(!state.session.local){toast('Compte Oryon requis');return setView('settings')}
  const r=await api('/api/oryon/teams',{method:'POST',body:JSON.stringify({name:$('#teamName').value,description:$('#teamDesc').value,tags:$('#teamTags').value,logo_url:$('#teamLogo')?.value||''})});
  toast(r.success?'Équipe créée':r.error); if(r.success){const cur=oryonReadTeamsBackup();oryonSaveTeamsBackup([r.team,...cur.filter(t=>t.slug!==r.team.slug)]);loadTeams();}
};
joinTeam = async function(slug){
  await loadSession(); if(!state.session.local){toast('Compte Oryon requis');return setView('settings')}
  const r=await api('/api/oryon/teams/'+slug+'/join',{method:'POST'}); toast(r.success?'Équipe rejointe':r.error); if(r.success){const cur=oryonReadTeamsBackup();oryonSaveTeamsBackup([r.team,...cur.filter(t=>t.slug!==r.team.slug)]);} loadTeams();
};

function oryonGetChannelVignettes(p){
  const raw=Array.isArray(p.channel_vignettes)?p.channel_vignettes:(Array.isArray(p.channel_panels)?p.channel_panels:[]);
  const server=raw.map((v,i)=>({image_url:v.image_url||v.image||'',title:v.title||`Vignette ${i+1}`,description:v.description||v.text||'',link_url:v.link_url||v.url||v.href||''})).filter(v=>v.image_url).slice(0,8);
  return server.length?server:oryonReadVignettes(p.login).slice(0,8);
}
async function saveChannelVignettes(items){
  const viewer=state.session.local; const p=state.channelProfile||viewer||{}; const login=(viewer?.login||p.login||'').toLowerCase();
  if(!login){toast('Compte Oryon requis');return}
  const panels=(items||[]).slice(0,8).map((v,i)=>({image_url:v.image_url||v.image||'',title:String(v.title||`Vignette ${i+1}`).slice(0,60),description:String(v.description||v.text||'').slice(0,220),link_url:panelSafeUrl(v.link_url||v.url||v.href||'')})).filter(v=>v.image_url);
  oryonSaveVignettes(login,panels);
  const prev=await api('/api/oryon/profile/'+encodeURIComponent(login)).catch(()=>({})); const cur=prev.user||p||viewer||{};
  const body={display_name:cur.display_name||viewer?.display_name||login,bio:cur.bio||'',avatar_url:cur.avatar_url||'',banner_url:cur.banner_url||'',offline_image_url:cur.offline_image_url||'',tags:Array.isArray(cur.tags)?cur.tags.join(', '):(cur.tags||''),channel_badges:cur.channel_badges||[],channel_panels:panels,channel_vignettes:panels,peertube_watch_url:cur.peertube_watch_url||'',peertube_embed_url:cur.peertube_embed_url||'',oryon_local_player_url:cur.oryon_local_player_url||'',oryon_local_status_url:cur.oryon_local_status_url||''};
  const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify(body)}).catch(()=>({success:false}));
  if(r.success){oryonSaveBackupUser(r.user);toast('Vignettes enregistrées');await loadSession();}
  else toast('Vignettes gardées localement');
  state.channelProfile={...cur,channel_panels:panels,channel_vignettes:panels}; await renderChannel();
}
function oryonChannelPanelsHtml(p,isOwner){
  const panels=oryonGetChannelVignettes(p);
  const cells=[];
  for(let i=0;i<8;i++){
    const v=panels[i];
    if(v?.image_url){
      const link=panelSafeUrl(v.link_url);
      const image=link?`<a class="vignetteImageWrap" href="${esc(link)}" target="_blank" rel="noopener"><img src="${esc(v.image_url)}" alt=""><span class="vignetteLinkBadge">Lien</span></a>`:`<div class="vignetteImageWrap"><img src="${esc(v.image_url)}" alt=""></div>`;
      cells.push(`<article class="vignettePanel">${image}<div class="vignetteText"><b>${esc(v.title||`Vignette ${i+1}`)}</b>${v.description?`<p>${esc(v.description)}</p>`:''}${isOwner?`<button class="btn secondary" style="width:max-content" onclick="removeChannelVignette(${i})">Retirer</button>`:''}</div></article>`);
    }else if(isOwner){
      cells.push(`<article class="vignettePanel"><div class="vignetteImageWrap"><div class="vignetteEmptyBox"><b>Emplacement ${i+1}</b><br>Image 250×250 max</div></div><div class="vignetteText"><p>Libre pour une vignette.</p></div></article>`);
    }
  }
  return `<section id="channelVignettesSection" class="vignetteArea"><div class="vignetteHead"><div><h2>Vignettes de chaîne</h2><p class="vignetteHint">Images cliquables avec titre, texte et lien, comme des panneaux Twitch.</p></div>${isOwner?`<button class="btn secondary" onclick="openChannelVignettesEditor()">Éditer vignettes</button>`:''}</div><div class="vignetteGrid">${cells.join('') || '<p class="muted">Aucune vignette pour le moment.</p>'}</div></section>`;
}
function openChannelVignettesEditor(){
  const current=oryonGetChannelVignettes(state.channelProfile||{});
  window.__oryonPanelDraft=Array.from({length:8},(_,i)=>current[i]?{...current[i]}:{image_url:'',title:'',description:'',link_url:''});
  renderChannelPanelEditor();
}
function closeChannelPanelEditor(){document.querySelector('.panelEditorOverlay')?.remove();}
function renderChannelPanelEditor(){
  closeChannelPanelEditor();
  const draft=window.__oryonPanelDraft||[];
  const wrap=document.createElement('div'); wrap.className='panelEditorOverlay';
  wrap.innerHTML=`<div class="panelEditorModal"><div class="panelEditorHead"><div><h2>Éditer les vignettes</h2><p>8 emplacements. Images compressées en 250×250 max. L’image devient cliquable si tu ajoutes un lien.</p></div><button class="btn secondary" onclick="closeChannelPanelEditor()">Fermer</button></div><div class="panelEditorGrid">${draft.map((v,i)=>`<article class="panelEditCard"><div class="panelEditPreview">${v.image_url?`<img src="${esc(v.image_url)}" alt="">`:`Emplacement ${i+1}`}</div><input type="file" accept="image/*" onchange="handlePanelEditorFile(${i},this.files)"><input id="panelTitle${i}" value="${esc(v.title||'')}" placeholder="Titre"><textarea id="panelDesc${i}" placeholder="Texte sous l’image">${esc(v.description||'')}</textarea><input id="panelLink${i}" value="${esc(v.link_url||'')}" placeholder="Lien cliquable https://..."><button class="btn secondary" onclick="clearPanelDraft(${i})">Vider</button></article>`).join('')}</div><div class="panelEditorActions"><button class="btn secondary" onclick="closeChannelPanelEditor()">Annuler</button><button class="btn" onclick="savePanelEditorDraft()">Enregistrer</button></div></div>`;
  document.body.appendChild(wrap);
}
async function handlePanelEditorFile(i,files){
  const f=files&&files[0]; if(!f)return;
  const img=await compressImageMax(f,250);
  window.__oryonPanelDraft=window.__oryonPanelDraft||[];
  window.__oryonPanelDraft[i]={...(window.__oryonPanelDraft[i]||{}),image_url:img,title:(window.__oryonPanelDraft[i]?.title||f.name.replace(/\.[^.]+$/,''))};
  renderChannelPanelEditor();
}
function clearPanelDraft(i){window.__oryonPanelDraft[i]={image_url:'',title:'',description:'',link_url:''};renderChannelPanelEditor();}
async function savePanelEditorDraft(){
  const draft=(window.__oryonPanelDraft||[]).map((v,i)=>({
    image_url:v.image_url||'',
    title:document.getElementById('panelTitle'+i)?.value||v.title||`Vignette ${i+1}`,
    description:document.getElementById('panelDesc'+i)?.value||'',
    link_url:document.getElementById('panelLink'+i)?.value||''
  })).filter(v=>v.image_url);
  closeChannelPanelEditor();
  await saveChannelVignettes(draft);
}
function removeChannelVignette(i){const items=oryonGetChannelVignettes(state.channelProfile||{});items.splice(i,1);saveChannelVignettes(items);}


/* =========================================================
   ORYON — Pulse Live + mobile player/chat polish + creator About links
   ========================================================= */
(function(){
  const old=document.getElementById('oryonPulseMobileCreatorPatch');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonPulseMobileCreatorPatch';
  st.textContent=`
  :root{--oryon-pulse:#ff3d77;}
  .pulseLayer{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit;z-index:8}
  .pulseHeart{position:absolute;bottom:54px;right:42px;font-size:28px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.45));animation:pulseFloat 1.15s ease-out forwards;will-change:transform,opacity}
  @keyframes pulseFloat{0%{transform:translate3d(0,0,0) scale(.72) rotate(-8deg);opacity:0}12%{opacity:1}100%{transform:translate3d(var(--dx,0px),-190px,0) scale(1.8) rotate(16deg);opacity:0}}
  .pulseButton{position:absolute;right:14px;bottom:14px;z-index:10;border:1px solid rgba(255,255,255,.2);background:linear-gradient(135deg,#ff3d77,#a855f7);color:#fff;border-radius:999px;min-height:42px;padding:0 16px;font-weight:1000;box-shadow:0 18px 48px rgba(255,61,119,.28);cursor:pointer}
  .pulseButton:hover{transform:translateY(-1px)}
  .pulseDock{margin-top:10px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(7,13,25,.96));border-radius:18px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .pulseDock strong{font-size:14px}.pulseDock small{color:#9fb0c7}.pulseMeter{height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;min-width:160px;flex:1}.pulseMeter>i{display:block;height:100%;width:var(--pulse-width,4%);background:linear-gradient(90deg,#ff3d77,#a855f7,#22d3ee);box-shadow:0 0 20px rgba(255,61,119,.34)}
  .pulseActions{display:flex;gap:8px;flex-wrap:wrap}.pulseActions button{min-height:36px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:900;padding:0 12px;cursor:pointer}
  .pulseMoment{border:1px solid rgba(255,61,119,.28);background:rgba(255,61,119,.08);color:#ffd5df;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900}
  #channel .creatorRefine .channelIdentity .avatar{width:220px!important;height:220px!important;min-width:220px!important;border-radius:42px!important}
  #channel .creatorRefine .channelTitleBlock h1{font-size:clamp(68px,6.4vw,126px)!important;line-height:.84!important}
  #channel .creatorRefine .channelSubNav{margin:18px clamp(14px,2.2vw,36px) 0!important}
  #channel .creatorRefine .channelLiveLayout{margin:16px clamp(14px,2.2vw,36px) 0!important;display:grid!important;grid-template-columns:minmax(0,1fr) clamp(320px,26vw,390px)!important;gap:16px!important;align-items:stretch!important}
  #channel .creatorRefine .channelBelowLive{margin:18px clamp(14px,2.2vw,36px) 0!important;display:block!important}
  #channel .creatorRefine .bioPremium{padding:26px!important;border-radius:26px!important;margin-bottom:16px!important}
  #channel .creatorRefine .aboutComposite{padding:26px!important;border-radius:28px!important;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(7,15,29,.98))!important;display:grid!important;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start;overflow:visible}
  #channel .creatorRefine .aboutMain{min-width:0}
  #channel .creatorRefine .vignetteHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:16px}
  #channel .creatorRefine .vignetteHead h2{margin:0;font-size:clamp(28px,1.8vw,38px)!important}
  #channel .creatorRefine .vignetteHint{margin:6px 0 0;color:#b6c5dd;font-size:13px;max-width:760px}
  #channel .creatorRefine .vignetteGrid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:18px!important}
  #channel .creatorRefine .vignetteCard{border:1px solid rgba(148,163,184,.24);border-radius:24px;overflow:hidden;background:rgba(255,255,255,.04);display:flex;flex-direction:column;min-width:0}
  #channel .creatorRefine .vignetteImageWrap{position:relative;width:100%;aspect-ratio:2/3;max-height:600px;background:rgba(255,255,255,.03);overflow:hidden;display:grid;place-items:center;color:#b8c7de;text-align:center;padding:12px}
  #channel .creatorRefine .vignetteImageWrap img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
  #channel .creatorRefine .vignetteImageWrap a{position:absolute;inset:0;display:block}
  #channel .creatorRefine .vignetteBody{padding:12px 12px 14px;display:grid;gap:6px}
  #channel .creatorRefine .vignetteBody:empty{display:none}
  #channel .creatorRefine .vignetteBody b{font-size:15px;color:#fff;line-height:1.2}
  #channel .creatorRefine .vignetteBody span{font-size:12px;color:#bfd0e8;line-height:1.35}
  #channel .creatorRefine .linksSide{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(255,255,255,.035);padding:16px;display:grid;gap:12px;align-self:start}
  #channel .creatorRefine .linksSide h3{margin:0;font-size:20px}
  #channel .creatorRefine .linkList{display:grid;gap:10px}
  #channel .creatorRefine .linkCard{display:flex;align-items:center;gap:12px;border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(255,255,255,.035);padding:12px;color:#eef4ff;text-decoration:none;min-width:0}
  #channel .creatorRefine .linkCard img{width:22px;height:22px;border-radius:6px;flex:0 0 22px;background:#fff}.linkCard b,.linkCard span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.linkCard span{font-size:12px;color:#9fb0c7}
  #channel .creatorRefine .linkEmpty{border:1px dashed rgba(148,163,184,.18);border-radius:16px;padding:14px;color:#9fb0c7;text-align:center}
  .panelEditorModal .panelEditorGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.panelEditPreview{aspect-ratio:2/3!important;max-height:360px}.linkEditorGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.linkEditCard{border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.04);border-radius:18px;padding:12px;display:grid;gap:10px}.shareLine{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.shareLine input{min-width:260px;flex:1}
  @media(max-width:1180px){#channel .creatorRefine .vignetteGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#channel .creatorRefine .aboutComposite{grid-template-columns:1fr!important}.panelEditorModal .panelEditorGrid,.linkEditorGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:980px){#channel .creatorRefine .channelLiveLayout{grid-template-columns:1fr!important}#channel .creatorRefine .channelIdentity .avatar{width:150px!important;height:150px!important;min-width:150px!important}#channel .creatorRefine .channelTitleBlock h1{font-size:clamp(46px,10vw,86px)!important}}
  @media(max-width:760px){
    body{overflow-x:hidden!important}
    #discover .hfDiscoverHero,#discover .hfMoodPanel{margin-inline:10px!important}
    #discover .hfDiscoverHero h1{font-size:clamp(34px,8.5vw,54px)!important}
    #discover .hfMoodGrid{display:flex!important;overflow-x:auto!important;gap:10px!important;scroll-snap-type:x proximity}
    #discover .hfMoodCard{min-width:145px!important;max-width:165px!important;padding:14px!important;scroll-snap-align:start}
    #discover #zapResult,.hfDiscover #zapResult{margin-inline:10px!important}
    #discover .premiumPlayer,#discover .player,#discover .twitchPlayer,#discover .hfPlayer,#discover .hfLivePlayer,#discover iframe[src*="player.twitch.tv"]{height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:16/9!important;width:100%!important}
    #discover iframe[src*="player.twitch.tv"]{height:100%!important;display:block!important}
    #discover .chatPanel,#discover iframe[src*="chat"]{height:42vh!important;min-height:280px!important;max-height:430px!important;width:100%!important}
    #channel .creatorRefine .channelLiveLayout{margin-inline:10px!important;gap:12px!important}
    #channel .creatorRefine .channelMainPlayer .player,#channel .creatorRefine .oryonMainPlayer,#channel .creatorRefine iframe[src*="player.twitch.tv"]{height:auto!important;min-height:0!important;aspect-ratio:16/9!important;width:100%!important}
    #channel .creatorRefine iframe[src*="player.twitch.tv"]{height:100%!important}
    #channel .creatorRefine .channelLiveSidebar .chatPanel{height:42vh!important;min-height:300px!important;max-height:430px!important}
    #channel .creatorRefine .channelBelowLive{margin-inline:10px!important}
    #channel .creatorRefine .aboutComposite{padding:16px!important;border-radius:22px!important}
    #channel .creatorRefine .vignetteGrid{grid-template-columns:1fr!important}
    #channel .creatorRefine .channelIdentity .avatar{width:128px!important;height:128px!important;min-width:128px!important;border-radius:28px!important}
    .pulseDock{padding:10px}.pulseMeter{min-width:100px}.pulseButton{right:10px;bottom:10px;min-height:38px;padding:0 12px}
  }
  `;
  document.head.appendChild(st);
})();

const ORYON_CHANNEL_LINKS_BACKUP_PREFIX='oryon_channel_links_v2_';
function sanitizeWebUrlOryon(url){const s=String(url||'').trim(); if(!s)return ''; try{const u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s); return (u.protocol==='http:'||u.protocol==='https:')?u.toString():'';}catch(_){return ''}}
function faviconForUrlOryon(url){const clean=sanitizeWebUrlOryon(url); if(!clean)return ''; try{const u=new URL(clean); return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(u.origin)}&sz=64`;}catch(_){return ''}}
function oryonReadChannelLinks(login){try{return JSON.parse(localStorage.getItem(ORYON_CHANNEL_LINKS_BACKUP_PREFIX+String(login||'').toLowerCase())||'[]')}catch(_){return []}}
function oryonSaveChannelLinks(login,items){try{localStorage.setItem(ORYON_CHANNEL_LINKS_BACKUP_PREFIX+String(login||'').toLowerCase(),JSON.stringify((items||[]).slice(0,8)))}catch(_){}}
function oryonGetChannelLinks(p){const raw=Array.isArray(p?.channel_links)?p.channel_links:[];const server=raw.map((l,idx)=>({label:String(l?.label||l?.title||'').trim().slice(0,40),url:sanitizeWebUrlOryon(l?.url||l?.href||l?.link||''),kind:String(l?.kind||'').trim().slice(0,24),order:Number.isFinite(Number(l?.order))?Number(l.order):idx})).filter(l=>l.url).slice(0,8);return server.length?server:oryonReadChannelLinks(p?.login).slice(0,8)}
function oryonGetChannelVignettes(p){const raw=Array.isArray(p?.channel_vignettes)?p.channel_vignettes:(Array.isArray(p?.channel_panels)?p.channel_panels:[]);const server=raw.map(v=>({image_url:v?.image_url||v?.image||'',title:String(v?.title||'').slice(0,60),description:String(v?.description||v?.text||'').slice(0,220),link_url:sanitizeWebUrlOryon(v?.link_url||v?.url||v?.href||'')})).filter(v=>v.image_url).slice(0,8);return server.length?server:oryonReadVignettes(p?.login).slice(0,8)}
function buildChannelShareUrl(login){return `${location.origin}/c/${encodeURIComponent(String(login||'').toLowerCase())}`}
function copyCurrentChannelLink(){const login=(state.watchRoom||state.session.local?.login||state.channelProfile?.login||'').toLowerCase();if(!login)return toast('Chaîne introuvable');const url=buildChannelShareUrl(login);navigator.clipboard?.writeText(url).then(()=>toast('Lien de chaîne copié')).catch(()=>toast(url))}
async function resizePanelToPortrait(file){return new Promise((resolve,reject)=>{const img=new Image();const fr=new FileReader();fr.onload=()=>{img.onload=()=>{const targetW=400,targetH=600;const c=document.createElement('canvas');c.width=targetW;c.height=targetH;const ctx=c.getContext('2d');const scale=Math.max(targetW/img.width,targetH/img.height);const dw=img.width*scale,dh=img.height*scale;ctx.drawImage(img,(targetW-dw)/2,(targetH-dh)/2,dw,dh);resolve(c.toDataURL('image/jpeg',0.86))};img.onerror=reject;img.src=fr.result};fr.onerror=reject;fr.readAsDataURL(file)})}
async function saveChannelAboutData({panels,links}){const viewer=state.session.local;const p=state.channelProfile||viewer||{};const login=(viewer?.login||p.login||'').toLowerCase();if(!login){toast('Compte Oryon requis');return}const cleanPanels=(panels||[]).slice(0,8).map(v=>({image_url:v?.image_url||v?.image||'',title:String(v?.title||'').trim().slice(0,60),description:String(v?.description||v?.text||'').trim().slice(0,220),link_url:sanitizeWebUrlOryon(v?.link_url||v?.url||v?.href||'')})).filter(v=>v.image_url);const cleanLinks=(links||[]).slice(0,8).map((l,idx)=>({label:String(l?.label||l?.title||'').trim().slice(0,40),url:sanitizeWebUrlOryon(l?.url||l?.href||l?.link||''),kind:String(l?.kind||'').trim().slice(0,24),order:idx})).filter(l=>l.url);oryonSaveVignettes(login,cleanPanels);oryonSaveChannelLinks(login,cleanLinks);const prev=await api('/api/oryon/profile/'+encodeURIComponent(login)).catch(()=>({}));const cur=prev.user||p||viewer||{};const body={display_name:cur.display_name||viewer?.display_name||login,bio:cur.bio||'',avatar_url:cur.avatar_url||'',banner_url:cur.banner_url||'',offline_image_url:cur.offline_image_url||'',tags:Array.isArray(cur.tags)?cur.tags.join(', '):(cur.tags||''),channel_badges:cur.channel_badges||[],channel_panels:cleanPanels,channel_vignettes:cleanPanels,channel_links:cleanLinks,peertube_watch_url:cur.peertube_watch_url||'',peertube_embed_url:cur.peertube_embed_url||'',oryon_local_player_url:cur.oryon_local_player_url||'',oryon_local_status_url:cur.oryon_local_status_url||''};const r=await api('/api/oryon/profile',{method:'POST',body:JSON.stringify(body)}).catch(()=>({success:false}));if(r?.success){oryonSaveBackupUser?.(r.user);state.channelProfile={...cur,...r.user,channel_vignettes:cleanPanels,channel_panels:cleanPanels,channel_links:cleanLinks};toast('À propos enregistré')}else{state.channelProfile={...cur,channel_vignettes:cleanPanels,channel_panels:cleanPanels,channel_links:cleanLinks};toast('Sauvegardé localement')}await renderChannel()}
async function handleChannelVignettesUpload(files){const current=oryonGetChannelVignettes(state.channelProfile||{});const selected=[...(files||[])].slice(0,8-current.length);if(!selected.length)return;const added=[];for(const f of selected){added.push({image_url:await resizePanelToPortrait(f),title:f.name.replace(/\.[^.]+$/,''),description:'',link_url:''})}await saveChannelAboutData({panels:[...current,...added].slice(0,8),links:oryonGetChannelLinks(state.channelProfile||{})})}
function openChannelVignettesEditor(){window.__oryonPanelDraft=oryonGetChannelVignettes(state.channelProfile||{}).slice(0,8);while(window.__oryonPanelDraft.length<8)window.__oryonPanelDraft.push({image_url:'',title:'',description:'',link_url:''});window.__oryonQuickLinksDraft=oryonGetChannelLinks(state.channelProfile||{}).slice(0,6);while(window.__oryonQuickLinksDraft.length<6)window.__oryonQuickLinksDraft.push({label:'',url:''});renderChannelPanelEditor()}
function closeChannelPanelEditor(){document.querySelector('.panelEditorOverlay')?.remove()}
function renderChannelPanelEditor(){closeChannelPanelEditor();const draft=window.__oryonPanelDraft||[];const linkDraft=window.__oryonQuickLinksDraft||[];const wrap=document.createElement('div');wrap.className='panelEditorOverlay';wrap.innerHTML=`<div class="panelEditorModal"><div class="panelEditorHead"><div><h2>Éditer À propos</h2><p>8 vignettes en 400×600 et 6 liens rapides avec favicon automatique.</p></div><button class="btn secondary" onclick="closeChannelPanelEditor()">Fermer</button></div><div class="panelEditorGrid">${draft.map((v,i)=>`<article class="panelEditCard"><div class="panelEditPreview">${v.image_url?`<img src="${esc(v.image_url)}" alt="">`:`Emplacement ${i+1}<br>400×600`}</div><input type="file" accept="image/*" onchange="handlePanelEditorFile(${i},this.files)"><input id="panelTitle${i}" value="${esc(v.title||'')}" placeholder="Titre (optionnel)"><textarea id="panelDesc${i}" placeholder="Texte (optionnel)">${esc(v.description||'')}</textarea><input id="panelLink${i}" value="${esc(v.link_url||'')}" placeholder="Lien cliquable https://... (optionnel)"><button class="btn secondary" onclick="clearPanelDraft(${i})">Vider</button></article>`).join('')}</div><div><h3 style="margin:18px 0 10px">Liens rapides</h3><div class="linkEditorGrid">${linkDraft.map((l,i)=>`<article class="linkEditCard"><b>Lien ${i+1}</b><input id="quickLinkLabel${i}" value="${esc(l.label||'')}" placeholder="Libellé (Discord, Don, Boutique...)"><input id="quickLinkUrl${i}" value="${esc(l.url||'')}" placeholder="https://..."></article>`).join('')}</div></div><div class="panelEditorActions"><button class="btn secondary" onclick="closeChannelPanelEditor()">Annuler</button><button class="btn" onclick="savePanelEditorDraft()">Enregistrer</button></div></div>`;document.body.appendChild(wrap)}
async function handlePanelEditorFile(i,files){const f=files?.[0];if(!f)return;window.__oryonPanelDraft=window.__oryonPanelDraft||[];window.__oryonPanelDraft[i]={...(window.__oryonPanelDraft[i]||{}),image_url:await resizePanelToPortrait(f)};renderChannelPanelEditor()}
function clearPanelDraft(i){window.__oryonPanelDraft=window.__oryonPanelDraft||[];window.__oryonPanelDraft[i]={image_url:'',title:'',description:'',link_url:''};renderChannelPanelEditor()}
async function savePanelEditorDraft(){const panels=(window.__oryonPanelDraft||[]).map((v,i)=>({image_url:v.image_url||'',title:(document.getElementById('panelTitle'+i)?.value||'').trim(),description:(document.getElementById('panelDesc'+i)?.value||'').trim(),link_url:(document.getElementById('panelLink'+i)?.value||'').trim()})).filter(v=>v.image_url);const links=[0,1,2,3,4,5].map(i=>({label:(document.getElementById('quickLinkLabel'+i)?.value||'').trim(),url:(document.getElementById('quickLinkUrl'+i)?.value||'').trim()})).filter(l=>l.url);closeChannelPanelEditor();await saveChannelAboutData({panels,links})}
function removeChannelVignette(i){const items=oryonGetChannelVignettes(state.channelProfile||{});items.splice(i,1);saveChannelAboutData({panels:items,links:oryonGetChannelLinks(state.channelProfile||{})})}
function oryonQuickLinksHtml(p,isOwner){const links=oryonGetChannelLinks(p);return `<aside class="linksSide"><h3>Liens rapides</h3><div class="small">Sites, Discord, boutique, dons ou ce que tu veux.</div><div class="linkList">${links.length?links.map(l=>{const url=sanitizeWebUrlOryon(l.url);let host='Lien';try{host=new URL(url).hostname.replace(/^www\./,'')}catch(_){}return `<a class="linkCard" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(faviconForUrlOryon(url))}" alt=""><div style="min-width:0"><b>${esc(l.label||host)}</b><span>${esc(host)}</span></div></a>`}).join(''):`<div class="linkEmpty">${isOwner?'Ajoute tes liens via “Éditer vignettes”.':'Aucun lien ajouté.'}</div>`}</div></aside>`}
function oryonChannelPanelsHtml(p,isOwner){const panels=oryonGetChannelVignettes(p);const cells=[];for(let i=0;i<8;i++){const v=panels[i];if(v){const link=sanitizeWebUrlOryon(v.link_url);const body=(v.title||v.description||isOwner)?`<div class="vignetteBody">${v.title?`<b>${esc(v.title)}</b>`:''}${v.description?`<span>${esc(v.description)}</span>`:''}${isOwner?`<button class="btn secondary" style="margin-top:6px;width:max-content" onclick="removeChannelVignette(${i})">Retirer</button>`:''}</div>`:'';cells.push(`<article class="vignetteCard"><div class="vignetteImageWrap">${link?`<a href="${esc(link)}" target="_blank" rel="noopener"><img src="${esc(v.image_url)}" alt=""></a>`:`<img src="${esc(v.image_url)}" alt="">`}</div>${body}</article>`)}else{cells.push(`<article class="vignetteCard vignetteEmpty"><div class="vignetteImageWrap">Emplacement ${i+1}<br>Image 400×600</div>${isOwner?'<div class="vignetteBody"><span>Libre pour une vignette.</span></div>':''}</article>`)}}return `<section id="channelAboutSection" class="aboutComposite"><div class="aboutMain"><div class="vignetteHead"><div><h2>À propos</h2><p class="vignetteHint">Panneaux cliquables façon Twitch. Titre, texte et lien sont optionnels.</p></div><div class="row"><div class="shareLine"><input value="${esc(buildChannelShareUrl(p.login||''))}" readonly><button class="btn secondary" onclick="copyCurrentChannelLink()">Copier</button></div>${isOwner?`<button class="btn secondary" onclick="openChannelVignettesEditor()">Éditer vignettes</button><input id="channelVignetteInput" type="file" accept="image/*" multiple class="hidden">`:''}</div></div><div class="vignetteGrid">${cells.join('')}</div></div>${oryonQuickLinksHtml(p,isOwner)}</section>`}
function oryonChannelBelowLiveHtml(p,tags,channelBadges,isOwner){const bio=esc(p.bio||"Cette chaîne n'a pas encore ajouté de bio.");return `<section class="channelBelowLive"><main class="channelBelowMain"><article id="channelBioSection" class="bioPremium"><h2>Bio</h2><p>${bio}</p></article>${oryonChannelPanelsHtml(p,isOwner)}</main></section>`}
function channelSubNav(btn,tab){$$('.channelSubNav button').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');const target=document.querySelector(tab==='about'?'#channelBioSection':'#channelPlayerTop');if(target)target.scrollIntoView({behavior:'smooth',block:'start'})}

function pulseSafeKeyFront(v){return String(v||'').toLowerCase().replace(/[^a-z0-9:_-]/g,'').slice(0,90)}
function pulseRead(key){try{return JSON.parse(localStorage.getItem('oryon_pulse_'+key)||'{"total":0,"recent":[],"moments":[]}')}catch(_){return {total:0,recent:[],moments:[]}}}
function pulseWrite(key,data){try{localStorage.setItem('oryon_pulse_'+key,JSON.stringify(data))}catch(_){}}
function pulseMetaFromElement(el){const iframe=el?.querySelector?.('iframe[src*="player.twitch.tv"]')||document.querySelector('iframe[src*="player.twitch.tv"]');let login='';try{const u=new URL(iframe?.src||'');login=u.searchParams.get('channel')||''}catch(_){}if(login)return {key:pulseSafeKeyFront('twitch:'+login),meta:{source:'twitch',login,name:login,title:'Twitch'}};const p=state.channelProfile||{};const q=state.zap?.items?.[state.zap?.index]||{};const l=p.login||q.user_login||q.login||q.host_login||q.room||state.watchRoom||'live';return {key:pulseSafeKeyFront((p.login?'oryon:':'live:')+l),meta:{source:p.login?'oryon':'live',login:l,name:p.display_name||q.user_name||q.display_name||l,game:q.game_name||q.category||'',title:q.title||p.bio||''}}}
function spawnPulseHeart(box,reaction='heart'){const layer=box.querySelector('.pulseLayer')||(()=>{const l=document.createElement('div');l.className='pulseLayer';box.appendChild(l);return l})();const span=document.createElement('span');span.className='pulseHeart';span.style.setProperty('--dx',((Math.random()*130)-90)+'px');span.textContent=reaction==='wow'?'😮':reaction==='fire'?'🔥':reaction==='laugh'?'😂':reaction==='here'?'👀':'❤️';layer.appendChild(span);setTimeout(()=>span.remove(),1300)}
async function sendPulseLive(reaction='heart',root=null){const box=root?.closest?.('.premiumPlayer,.player,.oryonMainPlayer,.hfLivePlayer,.twitchPlayer')||document.querySelector('#channel .premiumPlayer,#discover .premiumPlayer,#discover .player');if(!box)return;const {key,meta}=pulseMetaFromElement(box);const now=Date.now();const data=pulseRead(key);data.total=Number(data.total||0)+1;data.recent=(data.recent||[]).filter(x=>now-Number(x.t||0)<180000);data.recent.push({t:now,reaction});const hot30=data.recent.filter(x=>now-Number(x.t||0)<30000).length;data.moments=Array.isArray(data.moments)?data.moments:[];const last=data.moments[data.moments.length-1];if(hot30>=8&&(!last||now-Number(last.t||0)>45000))data.moments.push({t:now,count:hot30,label:'Moment Pulse'});pulseWrite(key,data);spawnPulseHeart(box,reaction);updatePulseDocks(key,data);api('/api/pulse/live',{method:'POST',body:JSON.stringify({key,reaction,meta})}).then(r=>{if(r?.pulse){updatePulseDocks(key,{...data,...r.pulse})}}).catch(()=>{})}
function updatePulseDocks(key,data){data=data||pulseRead(key);document.querySelectorAll(`.pulseDock[data-pulse-key="${CSS.escape(key)}"]`).forEach(d=>{const now=Date.now();const hot30=(data.recent||[]).filter(x=>now-Number(x.t||0)<30000).length;const pct=Math.min(100,Math.max(4,hot30*9));d.querySelector('.pulseMeter')?.style.setProperty('--pulse-width',pct+'%');const count=d.querySelector('[data-pulse-count]');if(count)count.textContent=String(data.total||0);const hot=d.querySelector('[data-pulse-hot]');if(hot)hot.textContent=hot30?`${hot30} réactions / 30s`:'silencieux mais présent';const moment=d.querySelector('.pulseMoment');if(moment)moment.hidden=!(data.moments||[]).length})}
function buildPulseDockFor(box){const {key}=pulseMetaFromElement(box);if(!box.querySelector('.pulseLayer')){const l=document.createElement('div');l.className='pulseLayer';box.style.position='relative';box.appendChild(l)}if(!box.querySelector('.pulseButton')){const b=document.createElement('button');b.className='pulseButton';b.type='button';b.textContent='❤️ Pulse';b.onclick=(e)=>{e.stopPropagation();sendPulseLive('heart',b)};box.appendChild(b)}if(box.nextElementSibling?.classList?.contains('pulseDock'))return;const dock=document.createElement('div');dock.className='pulseDock';dock.dataset.pulseKey=key;dock.innerHTML=`<div><strong>Pulse Live</strong><br><small><span data-pulse-count>0</span> réactions · <span data-pulse-hot>silencieux mais présent</span></small></div><div class="pulseMeter"><i></i></div><span class="pulseMoment" hidden>Moment chaud détecté</span><div class="pulseActions"><button onclick="sendPulseLive('heart',this)">❤️</button><button onclick="sendPulseLive('fire',this)">🔥</button><button onclick="sendPulseLive('wow',this)">😮</button><button onclick="sendPulseLive('laugh',this)">😂</button><button onclick="sendPulseLive('here',this)">👀</button></div>`;box.insertAdjacentElement('afterend',dock);updatePulseDocks(key);box.addEventListener('dblclick',()=>sendPulseLive('heart',box),{passive:true})}
function enhancePulseUI(){const boxes=[...document.querySelectorAll('#channel .premiumPlayer,#discover .premiumPlayer,#discover .player,#discover .oryonMainPlayer,#discover .hfLivePlayer')];document.querySelectorAll('#discover iframe[src*="player.twitch.tv"]').forEach(f=>{const p=f.closest('.premiumPlayer,.player,.twitchPlayer,.hfLivePlayer')||f.parentElement;if(p&&!boxes.includes(p))boxes.push(p)});boxes.filter(Boolean).forEach(buildPulseDockFor)}
const __oryonPulseRenderChannel=renderChannel;
renderChannel=async function(){await __oryonPulseRenderChannel.apply(this,arguments);setTimeout(()=>{enhancePulseUI();const input=$('#channelVignetteInput');if(input&&!input.__pulseBound){input.__pulseBound=true;input.addEventListener('change',e=>handleChannelVignettesUpload(e.target.files))}},60)}
const __oryonPulseRenderDiscover=renderDiscover;
renderDiscover=async function(){await __oryonPulseRenderDiscover.apply(this,arguments);document.querySelectorAll('#discover h1').forEach(h=>{if(/Choisis ton mood\.?/i.test(h.textContent||''))h.textContent='Swap ton mood.'});setTimeout(enhancePulseUI,80)}
if(typeof renderHome==='function'){const __oryonPulseRenderHome=renderHome;renderHome=async function(){await __oryonPulseRenderHome.apply(this,arguments);setTimeout(enhancePulseUI,80)}}
if(typeof logoutTwitch==='function'){const __oryonPulseLogoutTwitch=logoutTwitch;logoutTwitch=async function(){await api('/twitch_logout',{method:'POST'}).catch(()=>null);state.session.twitch=null;try{state.followedTwitch=[]}catch(_){};const ids=['followedWrap','followedWrapCompact','twResults','twitchPlayerArea'];ids.forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=''}) ;renderNav?.();renderUserMenu?.();if(state.view==='home')await renderHome?.();else if(state.view==='discover')await renderDiscover?.();else if(state.view==='settings')await renderSettings?.();toast('Twitch déconnecté')}}
function initSharedChannelRoute(){const m=location.pathname.match(/^\/c\/([^/?#]+)/i);if(m){state.watchRoom=decodeURIComponent(m[1]).toLowerCase();if(state.view!=='channel')setTimeout(()=>setView('channel'),80)}}
initSharedChannelRoute();document.addEventListener('DOMContentLoaded',()=>setTimeout(initSharedChannelRoute,50));

/* =========================================================
   ORYON EXPERIENCE PASS — AfterLive, DeckLurker, mobile live/chat sizing, soft entry
   ========================================================= */
(function installOryonExperiencePass(){
  const old=document.getElementById('oryonExperiencePassStyle');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonExperiencePassStyle';
  st.textContent=`
  .softEntryCard{margin:12px 0 0;border:1px solid rgba(148,163,184,.18);background:linear-gradient(135deg,rgba(34,211,238,.08),rgba(139,92,246,.08));border-radius:20px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .softEntryCard h3{margin:0;font-size:18px}.softEntryCard p{margin:4px 0 0;color:#b8c7de;font-size:13px}.softEntryTags{display:flex;gap:8px;flex-wrap:wrap}.softEntryTags span{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900}.softEntryActions{display:flex;gap:8px;flex-wrap:wrap}.softEntryActions .btn{min-height:36px;padding:0 12px}
  .deckLurkerWrap{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(8,13,26,.98));border-radius:26px;padding:18px;display:grid;gap:14px;margin-top:16px}.deckLurkerHead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.deckLurkerHead h2{margin:0;font-size:clamp(22px,1.7vw,32px)}.deckLurkerHead p{margin:4px 0 0;color:#9fb0c7}.deckStatus{display:flex;gap:8px;flex-wrap:wrap}.deckStatus button{min-height:36px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#fff;font-weight:900;padding:0 12px}.deckStatus button.active{background:linear-gradient(135deg,#22c55e,#22d3ee);color:#04111f}.deckActive{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.34fr);gap:14px;align-items:stretch}.deckActivePlayer{aspect-ratio:16/9;border:1px solid rgba(148,163,184,.18);border-radius:22px;overflow:hidden;background:#020617;min-height:220px}.deckActivePlayer iframe{width:100%;height:100%;border:0}.deckActiveInfo{border:1px solid rgba(148,163,184,.14);border-radius:22px;background:rgba(255,255,255,.035);padding:16px;display:grid;gap:10px;align-content:center}.deckActiveInfo h3{margin:0;font-size:24px}.deckActiveInfo p{margin:0;color:#b8c7de}.deckSlots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.deckSlot{border:1px solid rgba(148,163,184,.17);background:rgba(255,255,255,.035);border-radius:18px;min-height:106px;overflow:hidden;position:relative;text-align:left;color:#fff}.deckSlot.active{border-color:rgba(34,211,238,.65);box-shadow:0 0 0 1px rgba(34,211,238,.24),0 14px 40px rgba(34,211,238,.12)}.deckSlot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.65}.deckSlot:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(2,6,23,.88));z-index:1}.deckSlotBody{position:relative;z-index:2;padding:10px;display:grid;gap:6px;align-content:end;height:100%}.deckSlot b{font-size:14px;line-height:1.12}.deckSlot span{font-size:11px;color:#cbd5e1}.deckSlotActions{display:flex;gap:6px;flex-wrap:wrap}.deckSlotActions button{min-height:28px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:900;padding:0 8px}.deckEmpty{display:grid;place-items:center;text-align:center;color:#9fb0c7;border-style:dashed}.afterLivePanel{border:1px solid rgba(148,163,184,.18);background:radial-gradient(circle at 20% 0%,rgba(255,61,119,.12),transparent 30%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(7,13,25,.98));border-radius:26px;padding:20px;display:grid;gap:16px;margin-top:18px}.afterLiveTop{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.afterLiveTop h2{margin:0;font-size:clamp(24px,2vw,36px)}.afterLiveGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.afterStat{border:1px solid rgba(148,163,184,.15);background:rgba(255,255,255,.04);border-radius:18px;padding:14px}.afterStat span{display:block;color:#9fb0c7;font-size:12px}.afterStat b{font-size:28px}.momentList{display:grid;gap:8px}.momentItem{display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(148,163,184,.14);background:rgba(255,255,255,.035);border-radius:14px;padding:10px}.momentItem b{font-size:13px}.momentItem span{font-size:12px;color:#9fb0c7}.afterActions{display:flex;gap:10px;flex-wrap:wrap}.lurkMiniBadge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(34,211,238,.25);background:rgba(34,211,238,.08);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000;color:#dff7ff}
  @media(max-width:900px){.deckActive{grid-template-columns:1fr}.deckSlots{grid-template-columns:repeat(2,minmax(0,1fr))}.afterLiveGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:760px){
    body{overflow-x:hidden}.hfDiscover{padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))!important}.hfDiscoverHero,.hfMoodPanel,.hfPanel{margin-inline:10px!important}.hfMoodGrid{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory!important;gap:10px!important;padding-bottom:4px}.hfMoodCard{min-width:150px!important;min-height:92px!important;scroll-snap-align:start!important;padding:12px!important}.hfMoodCard i{font-size:22px!important}.hfMoodCard b{font-size:13px!important}.hfMoodCard span{font-size:10px!important;line-height:1.2!important}.hfAdvancedBody{grid-template-columns:1fr!important}.hfAdvancedBody input,.hfAdvancedBody select,.hfAdvancedBody button{min-height:46px!important}
    #discover .premiumPlayer,#discover .player,#discover .oryonMainPlayer,#discover .hfLivePlayer,#discover .twitchPlayer,#channel .premiumPlayer,#channel .oryonMainPlayer{width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:16/9!important;border-radius:18px!important;overflow:hidden!important}.premiumPlayer iframe,.player iframe,.oryonMainPlayer iframe,.hfLivePlayer iframe,.twitchPlayer iframe{width:100%!important;height:100%!important;min-height:0!important;display:block!important}#discover .chatPanel,#discover .twitchChat,#channel .chatPanel,#channel .nativeFixedChat{height:min(42vh,390px)!important;min-height:260px!important;max-height:430px!important;border-radius:18px!important}.channelLiveLayout{grid-template-columns:1fr!important;gap:12px!important}.pulseDock{padding:10px!important;border-radius:16px!important;gap:8px!important}.pulseMeter{min-width:90px!important}.pulseActions{width:100%;justify-content:space-between}.pulseActions button{flex:1;min-height:34px!important}.pulseButton{right:10px!important;bottom:10px!important;min-height:38px!important;padding:0 12px!important;font-size:12px!important}.softEntryCard{margin:10px 0!important;padding:12px!important}.softEntryActions{width:100%}.softEntryActions .btn{flex:1}.deckLurkerWrap{margin:12px 10px 0!important;padding:14px!important;border-radius:20px!important}.deckActivePlayer{min-height:0!important}.deckSlots{grid-template-columns:repeat(2,minmax(0,1fr));}.deckSlot{min-height:94px}.afterLiveGrid{grid-template-columns:1fr}.momentItem{display:grid}.mobileChatToggle{display:inline-flex!important}.chatCollapsedMobile #discover .chatPanel,.chatCollapsedMobile #discover .twitchChat,.chatCollapsedMobile #channel .chatPanel{display:none!important}
  }
  `;
  document.head.appendChild(st);
})();

function deckUserKey(){return 'oryon_decklurk_v2:'+String(state.session?.local?.login||state.session?.twitch?.login||'guest').toLowerCase()}
function loadDeckLurker(){const d=readJsonSafe(deckUserKey(),null); if(d&&Array.isArray(d.slots))return {active:Number.isInteger(d.active)?d.active:0,status:d.status||'lurk',slots:[...d.slots,...Array(8).fill(null)].slice(0,8)}; return {active:0,status:'lurk',slots:Array(8).fill(null)}}
function saveDeckLurker(d){writeJsonSafe(deckUserKey(),{active:Number(d.active||0),status:d.status||'lurk',slots:(d.slots||[]).slice(0,8)})}
function normalizeDeckMeta(meta){meta=meta||{};return {source:meta.source||meta.platform||'twitch',login:meta.login||meta.user_login||meta.host_login||meta.room||'',name:meta.name||meta.user_name||meta.display_name||meta.login||'Live',game:meta.game||meta.game_name||meta.category||'',title:meta.title||'',img:meta.img||meta.thumbnail_url||meta.image_url||'',viewers:Number(meta.viewers||meta.viewer_count||0),addedAt:Date.now()}}
function addLiveToMultiWatch(meta,preferredIndex){const d=loadDeckLurker();const m=normalizeDeckMeta(meta);if(!m.login)return toast('Live introuvable');let idx=Number.isInteger(preferredIndex)?preferredIndex:d.slots.findIndex(x=>!x);if(idx<0)idx=0;d.slots[idx]=m;d.active=idx;saveDeckLurker(d);renderMultiWatchDock();renderDeckLurkerPanels();toast('Ajouté au DeckLurker')}
function clearMultiWatchSlot(idx){const d=loadDeckLurker();d.slots[idx]=null;if(d.active===idx)d.active=Math.max(0,d.slots.findIndex(Boolean));if(d.active<0)d.active=0;saveDeckLurker(d);renderMultiWatchDock();renderDeckLurkerPanels()}
function setDeckActive(idx){const d=loadDeckLurker();if(!d.slots[idx])return;d.active=idx;saveDeckLurker(d);renderMultiWatchDock();renderDeckLurkerPanels()}
function setDeckStatus(s){const d=loadDeckLurker();d.status=s;saveDeckLurker(d);renderDeckLurkerPanels();toast(s==='lurk'?'Mode lurk assumé':'Mode regard actif')}
function deckTwitchIframe(slot,muted=true){if(!slot?.login)return '';return `https://player.twitch.tv/?channel=${encodeURIComponent(slot.login)}&parent=${encodeURIComponent(location.hostname)}&autoplay=false&muted=${muted?'true':'false'}`}
function deckSlotHtml(slot,idx,active){return slot?`<button class="deckSlot ${active?'active':''}" onclick="setDeckActive(${idx})"><img src="${esc(slot.img||'')}" alt=""><div class="deckSlotBody"><b>${esc(slot.name||slot.login)}</b><span>${esc(slot.game||slot.source)}${slot.viewers?` · ${slot.viewers} viewers`:''}</span><div class="deckSlotActions"><button onclick="event.stopPropagation();setDeckActive(${idx})">Switch</button><button onclick="event.stopPropagation();clearMultiWatchSlot(${idx})">Vider</button></div></div></button>`:`<div class="deckSlot deckEmpty"><div><b>Case ${idx+1}</b><br><span>Ajoute un live</span></div></div>`}
function deckPanelHtml(){const d=loadDeckLurker();const active=d.slots[d.active]||d.slots.find(Boolean);const activeIndex=active?d.slots.indexOf(active):-1;const count=d.slots.filter(Boolean).length;return `<section class="deckLurkerWrap" id="deckLurkerPanel"><div class="deckLurkerHead"><div><span class="lurkMiniBadge">👀 DeckLurker · ${count} live${count>1?'s':''}</span><h2>Ton salon de lurk</h2><p>Garde plusieurs lives, soutiens en silence et switch en un clic sans ouvrir dix onglets.</p></div><div class="deckStatus"><button class="${d.status==='watch'?'active':''}" onclick="setDeckStatus('watch')">Je regarde</button><button class="${d.status==='lurk'?'active':''}" onclick="setDeckStatus('lurk')">Je lurk</button><button class="${d.status==='work'?'active':''}" onclick="setDeckStatus('work')">Au calme</button></div></div>${active?`<div class="deckActive"><div class="deckActivePlayer"><iframe allowfullscreen src="${esc(deckTwitchIframe(active,true))}"></iframe></div><aside class="deckActiveInfo"><h3>${esc(active.name||active.login)}</h3><p>${esc(active.title||active.game||'Live gardé dans ton deck')}</p><div class="afterActions"><button class="btn" onclick="openTwitch('${esc(active.login)}')">Ouvrir grand</button><button class="btn secondary" onclick="clearMultiWatchSlot(${activeIndex})">Vider</button></div></aside></div>`:`<div class="deckActiveInfo"><h3>Aucun live dans ton deck</h3><p>Ajoute un live depuis Découvrir, Accès Twitch ou une page chaîne.</p></div>`}<div class="deckSlots">${d.slots.map((slot,i)=>deckSlotHtml(slot,i,i===activeIndex)).join('')}</div></section>`}
function renderMultiWatchDock(){const box=$('#multiWatchDock'); if(!box)return; box.className='deckMount'; box.innerHTML=deckPanelHtml()}
function renderDeckLurkerPanels(){document.querySelectorAll('[data-deck-lurker-slot]').forEach(el=>{el.innerHTML=deckPanelHtml()})}
function insertDeckLurker(where){if(!where||where.querySelector?.('[data-deck-lurker-slot]'))return;const mount=document.createElement('div');mount.dataset.deckLurkerSlot='1';mount.innerHTML=deckPanelHtml();where.appendChild(mount)}
function addCurrentLiveToDeck(){const p=state.channelProfile||{};const q=state.zap?.items?.[state.zap?.index]||{};const meta=normalizeDeckMeta({source:p.login?'oryon':(q.platform||'twitch'),login:p.login||q.user_login||q.login||q.host_login||q.room,name:p.display_name||q.user_name||q.display_name||q.login,game:q.game_name||q.category||p.tags?.[0]||'',title:q.title||p.bio||'',img:q.thumbnail_url||q.img||p.banner_url||p.offline_image_url||'',viewers:q.viewer_count||q.viewers||0});if(!meta.login)return toast('Aucun live actif à ajouter');addLiveToMultiWatch(meta)}

function softEntryHtml(){return `<div class="softEntryCard"><div><h3>Pourquoi entrer ici ?</h3><p>Chat lisible, réaction possible sans parler, ajout au DeckLurker en un clic.</p><div class="softEntryTags"><span>👀 lurk accepté</span><span>❤️ Pulse Live</span><span>💬 entrée douce</span></div></div><div class="softEntryActions"><button class="btn" onclick="addCurrentLiveToDeck()">Ajouter au Deck</button><button class="btn secondary mobileChatToggle" onclick="document.body.classList.toggle('chatCollapsedMobile')">Afficher / cacher chat</button></div></div>`}
function insertSoftEntry(){const player=document.querySelector('#channel .premiumPlayer,#discover .premiumPlayer,#discover .player,#discover .hfLivePlayer');if(!player||player.nextElementSibling?.classList?.contains('softEntryCard'))return;player.insertAdjacentHTML('afterend',softEntryHtml())}

function reactionEmoji(type){return type==='fire'?'🔥':type==='wow'?'😮':type==='laugh'?'😂':type==='here'?'👀':'❤️'}
async function afterLiveSummaryHtml(login){const key=pulseSafeKeyFront('oryon:'+login);const local=pulseRead(key);const server=await api('/api/afterlive/'+encodeURIComponent(login)).catch(()=>null);const s=server?.summary||{totalPulse:Number(local.total||0),moments:local.moments||[],hot30:0,hot120:0,topReaction:{type:'heart',count:0},score:Math.min(100,Number(local.total||0)*2),advice:['Lance un live puis laisse les viewers pulser les moments forts.']};const moments=(s.moments||[]).slice(-5).reverse();return `<section class="afterLivePanel"><div class="afterLiveTop"><div><span class="lurkMiniBadge">AfterLive</span><h2>Ce que ton live a produit</h2><p class="muted">Pulse, moments chauds et signaux silencieux réunis en résumé actionnable.</p></div><div class="afterActions"><button class="btn" onclick="setView('manager')">Préparer prochain live</button><button class="btn secondary" onclick="toast('Module clip prêt à connecter au moteur vidéo.')">Créer un clip</button></div></div><div class="afterLiveGrid"><div class="afterStat"><span>Pulse reçus</span><b>${Number(s.totalPulse||0)}</b></div><div class="afterStat"><span>Moments chauds</span><b>${moments.length}</b></div><div class="afterStat"><span>Réaction dominante</span><b>${reactionEmoji(s.topReaction?.type)}</b></div><div class="afterStat"><span>Score énergie</span><b>${Number(s.score||0)}%</b></div></div><div class="managerGrid"><div><h3>Moments Pulse</h3><div class="momentList">${moments.length?moments.map(m=>`<div class="momentItem"><div><b>${esc(m.label||'Moment Pulse')}</b><br><span>${m.t?new Date(m.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Moment récent'} · ${Number(m.count||0)} réactions</span></div><button class="btn secondary" onclick="toast('Moment marqué pour clip.')">Marquer</button></div>`).join(''):'<div class="momentItem"><span>Aucun moment chaud pour le moment. Ils apparaissent quand plusieurs réactions arrivent vite.</span></div>'}</div></div><div><h3>Conseils</h3>${(s.advice||[]).slice(0,4).map(a=>`<p>• ${esc(a)}</p>`).join('')}</div></div></section>`}
async function injectAfterLiveDashboard(){const root=$('#dashboard'); if(!root||!state.session.local)return; if(root.querySelector('.afterLivePanel'))return; const html=await afterLiveSummaryHtml(state.session.local.login); const head=root.querySelector('.pageHead'); if(head)head.insertAdjacentHTML('afterend',html)}

if(typeof renderDashboard==='function'){const __oryonAfterRenderDashboard=renderDashboard;renderDashboard=async function(){await __oryonAfterRenderDashboard.apply(this,arguments);await injectAfterLiveDashboard()}}
if(typeof renderDiscover==='function'){const __oryonAfterRenderDiscover=renderDiscover;renderDiscover=async function(){await __oryonAfterRenderDiscover.apply(this,arguments);setTimeout(()=>{insertSoftEntry();renderMultiWatchDock();const zr=$('#zapResult');if(zr)insertDeckLurker(zr.parentElement)},90)}}
if(typeof renderChannel==='function'){const __oryonAfterRenderChannel=renderChannel;renderChannel=async function(){await __oryonAfterRenderChannel.apply(this,arguments);setTimeout(()=>{insertSoftEntry();const page=$('#channel .creatorRefine')||$('#channel');insertDeckLurker(page)},90)}}
if(typeof renderHome==='function'){const __oryonAfterRenderHome=renderHome;renderHome=async function(){await __oryonAfterRenderHome.apply(this,arguments);setTimeout(()=>{const home=$('#home .owHomeFull')||$('#home');insertDeckLurker(home)},100)}}

// Mobile starts cleaner: chat is available but not allowed to eat the full screen.
if(matchMedia('(max-width: 760px)').matches){document.body.classList.add('chatCollapsedMobile')}

/* =========================================================
   ORYON MOBILE SANITY PASS — sane live/chat proportions + Pulse placement
   ========================================================= */
(function installOryonMobileSanityPass(){
  const old=document.getElementById('oryonMobileSanityPassStyle');
  if(old) old.remove();
  const st=document.createElement('style');
  st.id='oryonMobileSanityPassStyle';
  st.textContent=`
  /* Desktop/tablet: lecteur + chat doivent rester dans une vraie grille. */
  #discover .watchShell.twitchWatch,
  #discover .proPlayerGrid{
    display:grid!important;
    grid-template-columns:minmax(0,1fr) clamp(320px,27vw,410px)!important;
    gap:16px!important;
    align-items:stretch!important;
  }
  #discover .watchShell.twitchWatch>.player,
  #discover .proPlayerGrid>.player,
  #discover .premiumPlayer,
  #discover .player{
    min-width:0!important;
  }
  #discover .watchShell.twitchWatch>.player,
  #discover .proPlayerGrid>.player,
  #channel .channelMainPlayer .player,
  #channel .channelMainPlayer .premiumPlayer{
    aspect-ratio:16/9!important;
    height:auto!important;
    min-height:0!important;
    max-height:76vh!important;
    overflow:hidden!important;
    border-radius:24px!important;
    background:#020617!important;
  }
  #discover .watchShell.twitchWatch>.player iframe,
  #discover .proPlayerGrid>.player iframe,
  #channel .channelMainPlayer .player iframe,
  #channel .channelMainPlayer .premiumPlayer iframe{
    width:100%!important;
    height:100%!important;
    display:block!important;
    border:0!important;
  }
  #discover .watchShell.twitchWatch>.chatPanel,
  #discover .proPlayerGrid>.chatPanel{
    height:auto!important;
    min-height:0!important;
    max-height:none!important;
    overflow:hidden!important;
    border-radius:24px!important;
  }
  #discover .watchShell.twitchWatch>.chatPanel iframe,
  #discover .proPlayerGrid>.chatPanel iframe{
    width:100%!important;
    height:100%!important;
    min-height:0!important;
    border:0!important;
  }
  #channel .creatorRefine .channelLiveLayout{
    display:grid!important;
    grid-template-columns:minmax(0,1fr) clamp(320px,26vw,430px)!important;
    gap:18px!important;
    align-items:start!important;
  }
  #channel .creatorRefine .channelMainPlayer{
    display:block!important;
    min-width:0!important;
  }
  #channel .creatorRefine .channelMainPlayer>.player,
  #channel .creatorRefine .channelMainPlayer>.premiumPlayer{
    width:100%!important;
  }
  #channel .creatorRefine .channelLiveSidebar{
    min-width:0!important;
    display:block!important;
  }
  #channel .creatorRefine .channelLiveSidebar .chatPanel{
    width:100%!important;
    min-height:380px!important;
    height:clamp(380px,36vw,680px)!important;
    max-height:calc(100vh - 170px)!important;
    overflow:hidden!important;
    border-radius:24px!important;
  }
  #channel .creatorRefine .pulseDock,
  #discover .pulseDock{
    width:100%!important;
    max-width:100%!important;
    margin:10px 0 0!important;
    border-radius:18px!important;
    display:flex!important;
    align-items:center!important;
    justify-content:space-between!important;
    gap:10px!important;
  }
  #channel .creatorRefine .channelMainPlayer .pulseDock{
    position:static!important;
  }
  .oryonMobileLiveBar{display:none;}

  @media(max-width:760px){
    body{overflow-x:hidden!important;}
    .app,#discover,#channel{max-width:100vw!important;overflow-x:hidden!important;}

    /* Découvrir : le mood ne doit plus manger l’écran. */
    #discover .hfDiscoverHero,
    #discover .proHero{
      margin:10px 10px 12px!important;
      padding:16px!important;
      border-radius:22px!important;
    }
    #discover .hfDiscoverHero h1,
    #discover .proHero h1{
      font-size:clamp(30px,8vw,46px)!important;
      line-height:.95!important;
    }
    #discover .hfDiscoverHero p,
    #discover .proHero p{
      font-size:13px!important;
      line-height:1.35!important;
    }
    #discover .hfMoodPanel,
    #discover .proSearchPanel{
      margin:0 10px 12px!important;
      padding:12px!important;
      border-radius:22px!important;
    }
    #discover .hfMoodHead h2,
    #discover .proSearchPanel h2{
      font-size:22px!important;
      margin:0 0 10px!important;
    }
    #discover .hfMoodGrid,
    #discover .proMoodRow{
      display:flex!important;
      overflow-x:auto!important;
      overflow-y:hidden!important;
      gap:10px!important;
      scroll-snap-type:x proximity!important;
      padding-bottom:4px!important;
      -webkit-overflow-scrolling:touch!important;
    }
    #discover .hfMoodCard,
    #discover .proMoodBtn{
      flex:0 0 132px!important;
      min-width:132px!important;
      max-width:132px!important;
      min-height:88px!important;
      height:88px!important;
      padding:10px!important;
      border-radius:16px!important;
      scroll-snap-align:start!important;
    }
    #discover .hfMoodCard i,
    #discover .proMoodBtn i{font-size:20px!important;}
    #discover .hfMoodCard b,
    #discover .proMoodBtn b{font-size:12px!important;line-height:1.15!important;}
    #discover .hfMoodCard span,
    #discover .proMoodBtn span{font-size:9.5px!important;line-height:1.12!important;}
    #discover .hfAdvanced,
    #discover .proSearchLine{
      margin-top:10px!important;
    }
    #discover .hfAdvancedBody,
    #discover .proSearchLine{
      grid-template-columns:1fr 1fr!important;
      gap:8px!important;
    }
    #discover .hfAdvancedBody input,
    #discover .hfAdvancedBody select,
    #discover .hfAdvancedBody button,
    #discover .proSearchLine input,
    #discover .proSearchLine select,
    #discover .proSearchLine button{
      min-height:40px!important;
      font-size:13px!important;
    }
    #discover .hfAdvancedBody input,
    #discover .proSearchLine input{grid-column:1/-1!important;}

    /* Le live Twitch ne doit jamais devenir une tour verticale. */
    #discover #zapResult,
    #discover .proStage,
    #discover .proMain{
      margin:0 10px!important;
      width:auto!important;
      max-width:calc(100vw - 20px)!important;
      overflow:hidden!important;
    }
    #discover .watchShell.twitchWatch,
    #discover .proPlayerGrid{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:10px!important;
      width:100%!important;
      max-width:100%!important;
    }
    #discover .proPlayerHead,
    #discover .spotlightTop,
    #discover .spotlightHeadClean{
      display:none!important;
    }
    #discover .watchShell.twitchWatch>.player,
    #discover .proPlayerGrid>.player,
    #discover .premiumPlayer,
    #discover .player,
    #discover .twitchPlayer,
    #discover .hfLivePlayer{
      width:100%!important;
      height:clamp(190px,56.25vw,355px)!important;
      min-height:190px!important;
      max-height:355px!important;
      aspect-ratio:auto!important;
      border-radius:18px!important;
      overflow:hidden!important;
      background:#000!important;
    }
    #discover .watchShell.twitchWatch>.player iframe,
    #discover .proPlayerGrid>.player iframe,
    #discover .premiumPlayer iframe,
    #discover .player iframe,
    #discover iframe[src*="player.twitch.tv"]{
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      max-height:355px!important;
      display:block!important;
      border:0!important;
    }

    /* Le chat mobile devient un tiroir. Fermé par défaut, ouvert à la demande. */
    #discover .watchShell.twitchWatch>.chatPanel,
    #discover .proPlayerGrid>.chatPanel,
    #discover .twitchChat{
      display:none!important;
      height:0!important;
      min-height:0!important;
      max-height:0!important;
    }
    body.oryonMobileChatOpen #discover .watchShell.twitchWatch>.chatPanel,
    body.oryonMobileChatOpen #discover .proPlayerGrid>.chatPanel,
    body.oryonMobileChatOpen #discover .twitchChat{
      display:block!important;
      height:min(34vh,290px)!important;
      min-height:220px!important;
      max-height:290px!important;
      border-radius:18px!important;
      overflow:hidden!important;
    }
    body.oryonMobileChatOpen #discover .twitchChat iframe,
    body.oryonMobileChatOpen #discover iframe[src*="/chat"]{
      width:100%!important;
      height:100%!important;
      border:0!important;
    }
    .oryonMobileLiveBar{
      display:flex!important;
      gap:8px!important;
      margin:10px 0!important;
      position:sticky!important;
      top:8px!important;
      z-index:30!important;
    }
    .oryonMobileLiveBar button{
      flex:1!important;
      min-height:42px!important;
      border:1px solid rgba(255,255,255,.12)!important;
      background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04))!important;
      color:#fff!important;
      border-radius:14px!important;
      font-weight:1000!important;
      box-shadow:0 8px 24px rgba(0,0,0,.20)!important;
    }
    .oryonMobileLiveBar button.primary{
      background:linear-gradient(135deg,#a855f7,#ec4899)!important;
    }

    /* Pulse : overlay + barre compacte, pas un panneau géant. */
    #discover .pulseDock,
    #channel .pulseDock{
      padding:9px!important;
      border-radius:14px!important;
      gap:6px!important;
      margin:8px 0!important;
    }
    #discover .pulseDock strong,
    #channel .pulseDock strong{font-size:12px!important;}
    #discover .pulseDock small,
    #channel .pulseDock small{font-size:11px!important;}
    #discover .pulseMeter,
    #channel .pulseMeter{display:none!important;}
    #discover .pulseActions,
    #channel .pulseActions{width:auto!important;display:flex!important;gap:4px!important;}
    #discover .pulseActions button,
    #channel .pulseActions button{min-width:32px!important;min-height:32px!important;padding:0!important;}
    #discover .pulseButton,
    #channel .pulseButton{right:8px!important;bottom:8px!important;min-height:36px!important;padding:0 12px!important;font-size:12px!important;}

    /* Page chaîne mobile : lecteur propre, chat compact. */
    #channel .creatorRefine .channelLiveLayout{
      grid-template-columns:1fr!important;
      margin:10px!important;
      gap:10px!important;
    }
    #channel .creatorRefine .channelMainPlayer>.player,
    #channel .creatorRefine .channelMainPlayer>.premiumPlayer,
    #channel .creatorRefine .oryonMainPlayer{
      height:clamp(190px,56.25vw,355px)!important;
      min-height:190px!important;
      max-height:355px!important;
      aspect-ratio:auto!important;
      border-radius:18px!important;
    }
    #channel .creatorRefine .channelMainPlayer iframe,
    #channel .creatorRefine iframe[src*="player.twitch.tv"]{
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      max-height:355px!important;
    }
    #channel .creatorRefine .channelLiveSidebar .chatPanel,
    #channel .nativeFixedChat{
      height:min(34vh,300px)!important;
      min-height:230px!important;
      max-height:300px!important;
      border-radius:18px!important;
    }

    .softEntryCard{display:none!important;}
    .deckLurkerWrap{margin:12px 10px 0!important;}
  }
  `;
  document.head.appendChild(st);

  function isMobile(){return window.matchMedia && window.matchMedia('(max-width:760px)').matches;}
  function ensureMobileLiveBar(){
    if(!isMobile()) return;
    const host=document.querySelector('#discover .watchShell.twitchWatch, #discover .proPlayerGrid');
    if(!host || host.querySelector('.oryonMobileLiveBar')) return;
    const bar=document.createElement('div');
    bar.className='oryonMobileLiveBar';
    bar.innerHTML=`<button class="primary" type="button" onclick="addCurrentLiveToDeck?.()">+ Deck</button><button type="button" onclick="document.body.classList.toggle('oryonMobileChatOpen')">Chat</button><button type="button" onclick="zapNext?.()">Suivant</button>`;
    const player=host.querySelector('.player,.premiumPlayer') || host.firstElementChild;
    if(player) player.insertAdjacentElement('afterend',bar);
  }
  function closeMobileChatByDefault(){
    if(isMobile()) document.body.classList.remove('oryonMobileChatOpen');
  }
  function run(){
    closeMobileChatByDefault();
    ensureMobileLiveBar();
  }
  const wrapNames=['renderZap','renderDiscover','hfWatchCurrent','zapOpenCurrent','mountTwitchPlayer','renderChannel'];
  wrapNames.forEach(name=>{
    const fn=window[name];
    if(typeof fn==='function' && !fn.__oryonSaneWrapped){
      const wrapped=function(){
        const out=fn.apply(this,arguments);
        Promise.resolve(out).finally(()=>setTimeout(run,80));
        return out;
      };
      wrapped.__oryonSaneWrapped=true;
      window[name]=wrapped;
    }
  });
  document.addEventListener('DOMContentLoaded',()=>setTimeout(run,120));
  setTimeout(run,120);
})();
