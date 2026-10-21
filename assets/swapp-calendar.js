(()=>{'use strict';
const $=id=>document.getElementById(id);if(!$('swapp-calendar'))return;
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
const fetchJson=async path=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('request_failed');return r.json()};
const key=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const gameName=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
let month=new Date(),selected=new Date(),events=[],filter='',coverage='';
month=new Date(month.getFullYear(),month.getMonth(),1);
function dayEvents(date){return events.filter(e=>key(new Date(e.start))===key(date)&&(!filter||e.game===filter))}
function details(){
 $('scal-selected-label').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(selected);
 const host=$('scal-day-events');host.replaceChildren();const rows=dayEvents(selected);
 if(!rows.length){host.append(el('p','Aucun rendez-vous confirmé ce jour.'));return}
 for(const item of rows){const card=el('article',undefined,'scal-event');const time=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.start));
 card.append(el('span',time+' · SPOTLIGHT','scal-event-time'),el('strong',item.game),el('p','Créateur : '+item.creator));
 const a=el('a','Découvrir les directs ↗');a.href='/tv';card.append(a);host.append(card)}
}
function render(){
 $('scal-month-label').textContent=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(month).toUpperCase();
 const first=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(),grid=$('scal-grid');grid.replaceChildren();
 for(let i=0;i<first;i++){const spacer=el('div',undefined,'scal-day empty');spacer.setAttribute('aria-hidden','true');grid.append(spacer)}
 for(let n=1;n<=days;n++){
  const date=new Date(month.getFullYear(),month.getMonth(),n),items=dayEvents(date),button=el('button',undefined,'scal-day');
  button.type='button';button.setAttribute('role','gridcell');button.setAttribute('aria-label',new Intl.DateTimeFormat('fr-FR',{dateStyle:'full'}).format(date)+(items.length?' · '+items.length+' rendez-vous':''));
  if(key(date)===key(new Date()))button.classList.add('today');if(key(date)===key(selected))button.classList.add('chosen');
  button.append(el('span',String(n),'scal-number'));
  for(const item of items.slice(0,2)){const chip=el('span',item.game,'scal-chip');button.append(chip)}
  if(items.length>2)button.append(el('small','+'+(items.length-2)+' autres'));
  button.addEventListener('click',()=>{selected=date;render()});grid.append(button)
 }
 details();
}
async function init(){
 const today=new Date();selected=today;
 try{
  const data=await fetchJson('/api/actus');const games=[...new Set((Array.isArray(data.articles)?data.articles:[]).filter(a=>a?.slug&&a.status!=='draft').map(gameName).filter(v=>v.length>1))].slice(0,12);
  const select=$('scal-game');for(const game of games){const option=el('option',game);option.value=game;select.append(option)}
  if(!games.length){$('scal-status').textContent='Aucun jeu éditorial disponible actuellement.';render();return}
  const health=await fetchJson('/api/creator/spotlight/status').catch(()=>null);
  if(!health){$('scal-status').textContent='Service de programmation momentanément inaccessible.';render();return}
  if(!health.enabled){$('scal-status').textContent='Réservations Spotlight non activées ou indisponibles. Aucun créneau ne peut être confirmé actuellement.';render();return}
  let success=0,unavailable=0;
  const results=await Promise.all(games.map(async game=>{try{const d=await fetchJson('/api/creator/spotlight?game='+encodeURIComponent(game));if(!d.success||!Array.isArray(d.items))throw Error('missing_items');success++;return d.items.map(x=>({id:x.id,game,creator:x.creator_login||x.twitch_login||'Créateur',start:x.start_at,end:x.end_at,status:x.status}))}catch{unavailable++;return []}}));
  const seen=new Set();events=results.flat().filter(x=>{const k=String(x.id)+':'+x.game;if(x.status!=='reserved'||!Number.isFinite(Date.parse(x.start))||Date.parse(x.end)<=Date.now()||seen.has(k))return false;seen.add(k);return true});
  coverage=unavailable?'Couverture partielle : certains rendez-vous ne sont pas disponibles.':success?'Rendez-vous Spotlight confirmés · '+events.length+' à venir.':'Aucun agenda Spotlight disponible actuellement.';
  $('scal-status').textContent=coverage;
 }catch{$('scal-status').textContent='Les données des jeux sont momentanément indisponibles.'}
 render();
}
$('scal-prev').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);render()});
$('scal-next').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);render()});
$('scal-today').addEventListener('click',()=>{selected=new Date();month=new Date(selected.getFullYear(),selected.getMonth(),1);render()});
$('scal-game').addEventListener('change',x=>{filter=x.target.value;render()});
init();
})();
