/* SWAPP Chat — stable live chat enhancements. No native chat node reparenting. */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const emojiSets=[
  ['Sourires','😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😐 😴 😭 😢 😡 🤯 🥹 🤗 😬 🥺 😇 😜 😱'],
  ['Réactions','👍 👎 👏 🙌 🤝 🫶 👋 🤘 ✌️ 🤟 💪 🙏 👀 💀 🤡 🔥 ✨ 💯 🎉 🚀 ✅ ❌ 💬'],
  ['Cœurs','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💗 💘 💞 💓 💕 💔 💝 💟'],
  ['Gaming','🎮 🕹️ 👾 🏆 ⚔️ 🛡️ 💥 🎯 🧠 🐸 🐱 🍿 💤 ☕ ⚡ 🌈 🌙 🪄 💎 🏅']
 ];
 const accents=['#bda4ff','#f6a5b3','#69d3ca','#f9bb7e','#9dbffa','#b8abf9'];
 const node=(tag,cls,content)=>{
  const element=document.createElement(tag);
  element.className=cls||'';
  if(content!==undefined)element.textContent=content;
  return element;
 };
 function decorateMessage(el){
  if(el.dataset.swappChatStyle==='stable')return;
  el.dataset.swappChatStyle='stable';
  el.classList.add('swapp-chat-fresh-message');
  const name=(el.querySelector('.chatNameLine b')||el.querySelector('b'))?.textContent?.trim()||'S';
  let h=0;
  for(const ch of name)h=(h*31+ch.codePointAt(0))>>>0;
  el.style.setProperty('--swapp-chat-author-color',accents[h%accents.length]);
  el.setAttribute('data-swapp-avatar',Array.from(name)[0]?.toLocaleUpperCase('fr-FR')||'S');
  // Crucial: DO NOT move any native author, badge, message, image or socket DOM.
 }
 function insert(input,emoji){
  const old=String(input.value||'');
  const a=typeof input.selectionStart==='number'?input.selectionStart:old.length;
  const b=typeof input.selectionEnd==='number'?input.selectionEnd:a;
  const before=old.slice(0,a),after=old.slice(b);
  const fragment=(before&&!/\s$/.test(before)?' ':'')+emoji+(after&&!/^\s/.test(after)?' ':'');
  if(input.setRangeText)input.setRangeText(fragment,a,b,'end');
  else input.value=before+fragment+after;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
 }

 // Existing SWAPP/GIPHY API only. Never adds a provider, key, or paid service.
 const synonyms=[
  [/^(fache|fachee|en colere|colere|rage|furieux|enerve|enervee|grrr)$/,'angry'],
  [/^(rire|rigoler|mort de rire|mdr|ptdr|lol|trop drole|haha)$/,'laughing'],
  [/^(bravo|gg|bien joue|felicitations|applaudir)$/,'applause'],
  [/^(triste|pleure|pleurer|chagrin|deprime)$/,'crying'],
  [/^(amour|bisou|bisous|je t aime|coeur)$/,'love'],
  [/^(surpris|surprise|choque|wtf|quoi)$/,'shocked'],
  [/^(merci)$/,'thank you'],
  [/^(salut|bonjour|coucou)$/,'hello'],
  [/^(danse|danser)$/,'dancing'],
  [/^(honte|genant|gene)$/,'facepalm']
 ];
 function gifQuery(text){
  const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,75);
  return synonyms.find(pair=>pair[0].test(value))?.[1]||value;
 }
 function initGifSearch(panel,trigger,hideEmoji){
  const tray=panel.querySelector('#gifGrid');
  if(!tray)return;
  trigger.removeAttribute('onclick');
  tray.dataset.swappGifSearch='v1';
  const top=node('div','swapp-chat-gif-searchbar');
  const input=node('input','swapp-chat-gif-search');
  input.type='search';input.autocomplete='off';input.maxLength=75;
  input.placeholder='Rechercher : fâché, rire, bravo…';
  input.setAttribute('aria-label','Chercher des GIF par émotion ou mot-clé');
  const close=node('button','swapp-chat-gif-close','×');
  close.type='button';close.setAttribute('aria-label','Fermer les GIF');
  top.append(input,close);
  const suggestions=node('div','swapp-chat-gif-ideas');
  const status=node('p','swapp-chat-gif-status','');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const gallery=node('div','swapp-chat-gif-results');
  const content=node('div','swapp-chat-gif-layout');
  content.append(top,suggestions,status,gallery);
  tray.replaceChildren(content);
  let timer=null,abort=null,sequence=0,last='';
  const cache=new Map();
  function hide(){
   tray.classList.add('hidden');
   trigger.setAttribute('aria-expanded','false');
   clearTimeout(timer);abort?.abort();abort=null;sequence++;
  }
  function showResults(gifs,query,unavailable){
   gallery.replaceChildren();
   if(unavailable&&query){
    status.textContent='Recherche indisponible : catalogue GIF non configuré sur SWAPP.';
    return;
   }
   if(!gifs.length){
    status.textContent=query?'Aucun GIF trouvé. Essaie un autre mot.':'Aucun GIF disponible.';
    return;
   }
   status.textContent=query?gifs.length+' résultats pour « '+query+' »':'GIF populaires';
   for(const item of gifs.slice(0,24)){
    const url=String(item?.url||'');
    const preview=String(item?.preview||url);
    if(!/^https:\/\//i.test(url)||!/^https:\/\//i.test(preview))continue;
    const tile=node('button','swapp-chat-gif-item');
    tile.type='button';tile.title=String(item?.title||'GIF').slice(0,100);
    tile.setAttribute('aria-label','Choisir '+tile.title);
    const image=node('img','');
    image.loading='lazy';image.decoding='async';image.alt=tile.title;
    image.referrerPolicy='no-referrer';image.src=preview;
    tile.appendChild(image);
    tile.addEventListener('click',()=>{
     state.selectedGif=url;
     trigger.textContent='✓GIF';
     trigger.title='GIF choisi · cliquer sur Envoyer pour le publier';
     trigger.classList.add('swapp-chat-gif-selected');
     hide();
    });
    gallery.appendChild(tile);
   }
  }
  async function search(term){
   const original=String(term||'').trim().slice(0,75);
   const query=gifQuery(original);
   last=original;
   const seq=++sequence;
   abort?.abort();
   abort=typeof AbortController==='function'?new AbortController():null;
   if(query.length===1){
    gallery.replaceChildren();status.textContent='Écris au moins 2 lettres.';return;
   }
   const url=query?'/api/gifs/search?q='+encodeURIComponent(query)+'&limit=24':
    '/api/gifs/trending?limit=18';
   status.textContent='Recherche de GIF…';gallery.replaceChildren();
   const hit=cache.get(url);
   if(hit&&Date.now()-hit.time<120000){
    showResults(hit.gifs,original,hit.fallback);return;
   }
   try{
    const response=await fetch(url,{cache:'no-store',signal:abort?.signal});
    if(!response.ok)throw Error('GIF HTTP '+response.status);
    const data=await response.json();
    if(seq!==sequence||tray.classList.contains('hidden'))return;
    const gifs=Array.isArray(data?.gifs)?data.gifs:[];
    const fallback=data?.fallback===true||data?.available===false;
    if(cache.size>35)cache.clear();
    cache.set(url,{gifs,fallback,time:Date.now()});
    showResults(gifs,original,fallback);
   }catch(e){
    if(seq!==sequence||e?.name==='AbortError')return;
    gallery.replaceChildren();
    status.textContent='Recherche momentanément indisponible. Réessaie.';
   }
  }
  for(const [label,term] of [
   ['Fâché','fâché'],['MDR','mdr'],['Bravo','bravo'],
   ['Triste','triste'],['Amour','amour'],['Surpris','surpris']
  ]){
   const idea=node('button','swapp-chat-gif-idea',label);
   idea.type='button';
   idea.addEventListener('click',()=>{
    input.value=term;clearTimeout(timer);void search(term);
   });
   suggestions.appendChild(idea);
  }
  input.addEventListener('input',()=>{
   clearTimeout(timer);abort?.abort();sequence++;
   const value=input.value.trim();
   if(value.length===1){
    gallery.replaceChildren();status.textContent='Écris au moins 2 lettres.';
    return;
   }
   timer=setTimeout(()=>void search(value),320);
  });
  input.addEventListener('keydown',event=>{
   if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);void search(input.value)}
   if(event.key==='Escape'){event.preventDefault();hide();trigger.focus()}
  });
  close.addEventListener('click',()=>{hide();trigger.focus()});
  trigger.addEventListener('click',()=>{
   hideEmoji();
   if(!tray.classList.contains('hidden')){hide();return}
   tray.classList.remove('hidden');trigger.setAttribute('aria-expanded','true');
   input.value=last;void search(last);input.focus();
  });
  // Native sendChat remains in charge of permissions and sending the URL.
  const send=panel.querySelector('.chatForm button[onclick*="sendChat"]');
  send?.addEventListener('click',()=>setTimeout(()=>{
   if(!state.selectedGif){
    trigger.textContent='GIF';trigger.title='Rechercher un GIF';
    trigger.classList.remove('swapp-chat-gif-selected');
   }
  },0));
  tray._swappClose=hide;
 }
 function enhance(panel){
  if(panel.dataset.swappChatUi==='stable')return;
  const form=panel.querySelector('.chatForm');
  const input=form?.querySelector('#chatInput');
  const emoji=form?.querySelector('button[onclick*="toggleEmotes"]');
  let gif=form?.querySelector('button[onclick*="toggleGifs"]');
  const send=form?.querySelector('button[onclick*="sendChat"]');
  if(!form||!input||!emoji||!send)return;
  // Some older channel templates omit the GIF button entirely, causing the
  // whole enhancement to silently abort. Supply just that missing control.
  if(!gif && panel.querySelector('#gifGrid')){
   gif=node('button','btn secondary','GIF');
   gif.type='button';
   gif.setAttribute('onclick','toggleGifs()');
   form.insertBefore(gif,send);
  }
  if(!gif)return;
  panel.dataset.swappChatUi='stable';
  form.classList.add('swapp-chat-stable-composer');
  input.placeholder='Écris dans le chat…';
  emoji.removeAttribute('onclick'); // Own the emoji button; preserve native emote shelf in-place.
  emoji.classList.add('swapp-chat-emoji-trigger');
  emoji.textContent='😊';
  emoji.title='Emojis et emotes de chaîne';
  emoji.setAttribute('aria-label','Emojis et emotes de chaîne');
  emoji.setAttribute('aria-expanded','false');
  gif.classList.add('swapp-chat-gif-trigger');
  gif.textContent='GIF';
  gif.title='GIF';
  gif.setAttribute('aria-label','Choisir un GIF');
  gif.setAttribute('aria-expanded','false');
  send.classList.add('swapp-chat-send-trigger');
  send.textContent='➤';
  send.title='Envoyer';
  send.setAttribute('aria-label','Envoyer le message');
  // Absolutely positioned within the EXISTING composer; does not add any row
  // to the panel's player-height-matched grid.
  const picker=node('div','swapp-chat-stable-picker');
  picker.hidden=true;
  picker.setAttribute('aria-label','Choisir un emoji ou une emote');
  const head=node('div','swapp-chat-picker-head');
  const title=node('strong','','Réactions');
  const dismiss=node('button','swapp-chat-picker-dismiss','×');
  dismiss.type='button';dismiss.setAttribute('aria-label','Fermer');
  head.append(title,dismiss);
  const tabs=node('div','swapp-chat-picker-tabs');
  const grid=node('div','swapp-chat-picker-grid');
  const tabButtons=[];
  let group=0;
  for(let i=0;i<emojiSets.length;i++){
   const tab=node('button','swapp-chat-picker-tab',emojiSets[i][0]);
   tab.type='button';tab.setAttribute('aria-pressed',String(i===0));
   tab.addEventListener('click',()=>show(i));
   tabs.appendChild(tab);tabButtons.push(tab);
  }
  const channelTab=node('button','swapp-chat-picker-tab','Chaîne');
  channelTab.type='button';channelTab.setAttribute('aria-pressed','false');
  channelTab.addEventListener('click',()=>{
   for(const button of tabButtons)button.setAttribute('aria-pressed','false');
   channelTab.setAttribute('aria-pressed','true');
   grid.classList.add('swapp-chat-channel-emotes');
   try{if(typeof window.renderEmoteShelf==='function')window.renderEmoteShelf()}catch(_){}
   const original=panel.querySelector('#customEmoteShelf');
   // Copy already escaped native emotes, including their original selectCustomEmote
   // onclick handlers; never MOVE original shelf or change grid children.
   grid.innerHTML=original?.innerHTML||'<span class="small">Aucune emote de chaîne.</span>';
  });
  tabs.appendChild(channelTab);
  picker.append(head,tabs,grid);
  form.appendChild(picker);
  const close=()=>{
   picker.hidden=true;emoji.setAttribute('aria-expanded','false');
  };
  function show(i){
   group=i;grid.classList.remove('swapp-chat-channel-emotes');
   channelTab.setAttribute('aria-pressed','false');
   for(let n=0;n<tabButtons.length;n++)
    tabButtons[n].setAttribute('aria-pressed',String(n===i));
   grid.replaceChildren();
   for(const value of emojiSets[i][1].split(' ')){
    const button=node('button','swapp-chat-picker-choice',value);
    button.type='button';button.title=value;button.setAttribute('aria-label','Insérer '+value);
    button.addEventListener('click',()=>insert(input,value));
    grid.appendChild(button);
   }
  }
  show(0);
  emoji.addEventListener('click',()=>{
   if(!picker.hidden){close();return}
   picker.hidden=false;emoji.setAttribute('aria-expanded','true');
   const nativeGif=panel.querySelector('#gifGrid');
   if(nativeGif?._swappClose)nativeGif._swappClose();
   else nativeGif?.classList.add('hidden');
   gif.setAttribute('aria-expanded','false');
   show(group);
  });
  dismiss.addEventListener('click',()=>{close();emoji.focus()});
  picker.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.stopPropagation();close();emoji.focus()}
  });
  picker.addEventListener('click',event=>{
   if(event.target.closest('.emoteBtn:not(.locked)'))close();
  });
  initGifSearch(panel,gif,close);
  // Document-level Escape, no extra observer and no chat node relocation.
  picker._swappClose=close;
 }
 function scan(){
  root.querySelectorAll('.nativeFixedChat[data-chat="oryon"]').forEach(enhance);
  root.querySelectorAll('.nativeFixedChat[data-chat="oryon"] .chatLog .msg:not([data-swapp-chat-style])').forEach(decorateMessage);
 }
 let scheduled=false;
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan()});
 }
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const picker of root.querySelectorAll('.swapp-chat-stable-picker'))
   picker._swappClose?.();
  for(const tray of root.querySelectorAll('.gifGrid[data-swapp-gif-search="v1"]'))
   tray._swappClose?.();
 });
 schedule();
})();
