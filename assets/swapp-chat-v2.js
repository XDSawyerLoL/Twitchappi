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
   nativeGif?.classList.add('hidden');
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
  gif.addEventListener('click',()=>{
   close();
   const native=panel.querySelector('#gifGrid');
   if(native)gif.setAttribute('aria-expanded',String(!native.classList.contains('hidden')));
  });
  // Keep existing toggleGifs(), its native images and native sendChat() handlers.
  panel.querySelector('#gifGrid')?.addEventListener('click',event=>{
   if(event.target.closest('img')){
    panel.querySelector('#gifGrid')?.classList.add('hidden');
    gif.setAttribute('aria-expanded','false');
   }
  });
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
 });
 schedule();
})();
