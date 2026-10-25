/* SWAPP Chat V2 — lightweight native emoji picker and message presentation; leaves socket, chat and GIF endpoints untouched. */
(function swappChatV2(){
 'use strict';
 const channel=document.getElementById('channel');
 if(!channel)return;
 const groups=[
  ['Sourires','😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😐 😴 😭 😢 😡 🤯 🥹 🤗 😬 🥺 😇 😜 😱'.split(' ')],
  ['Réactions','👍 👎 👏 🙌 🤝 🫶 👋 🤘 ✌️ 🤟 💪 🙏 👀 💀 🤡 🔥 ✨ 💯 🎉 🚀 ✅ ❌ 💬'.split(' ')],
  ['Cœurs','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💗 💘 💞 💓 💕 💔 💝 💟'.split(' ')],
  ['Gaming','🎮 🕹️ 👾 🏆 ⚔️ 🛡️ 💥 🎯 🧠 🐸 🐱 🍿 💤 ☕ ⚡ 🌈 🌙 🪄 💎 🏅'.split(' ')]
 ];
 const colors=['#ac8bfa','#ff88b4','#69d3ca','#f6ae72','#88b6ff','#bda4ff'];
 const create=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const closeState=new WeakMap();
 function modifyMessage(message){
  if(message.dataset.swappChatMessage==='v2')return;
  message.dataset.swappChatMessage='v2';
  message.classList.add('swapp-chat-message');
  const author=message.querySelector('.chatNameLine b')||message.querySelector('b');
  const name=(author?.textContent||'S').trim();
  let hash=0;
  for(const c of name)hash=((hash*33)+c.codePointAt(0))>>>0;
  const color=colors[hash%colors.length];
  message.style.setProperty('--swapp-message-accent',color);
  const avatar=create('span','swapp-chat-avatar',Array.from(name).slice(0,1).join('').toLocaleUpperCase('fr-FR'));
  avatar.setAttribute('aria-hidden','true');
  const body=create('div','swapp-chat-message-body');
  // Move existing author, badges, timestamp, message and images without
  // rewriting, escaping or replacing user-supplied content.
  for(const child of Array.from(message.childNodes))body.appendChild(child);
  message.append(avatar,body);
 }
 function appendEmoji(input,emoji){
  const value=String(input.value||'');
  const start=typeof input.selectionStart==='number'?input.selectionStart:value.length;
  const end=typeof input.selectionEnd==='number'?input.selectionEnd:start;
  if(typeof input.setRangeText==='function')input.setRangeText(emoji,start,end,'end');
  else input.value=value.slice(0,start)+emoji+value.slice(end);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
 }
 function enhance(panel){
  if(panel.dataset.swappChatUi==='v2')return;
  const form=panel.querySelector('.chatForm');
  const input=form?.querySelector('#chatInput');
  const emojiButton=form?.querySelector('button[onclick*="toggleEmotes"]');
  const gifButton=form?.querySelector('button[onclick*="toggleGifs"]');
  const sendButton=form?.querySelector('button[onclick*="sendChat"]');
  if(!form||!input||!emojiButton||!gifButton||!sendButton)return;
  panel.dataset.swappChatUi='v2';
  form.classList.add('swapp-chat-composer');
  input.placeholder='Écris dans le chat…';
  input.setAttribute('aria-label','Ton message sur le live SWAPP');
  emojiButton.removeAttribute('onclick');
  emojiButton.classList.add('swapp-chat-emoji-button');
  emojiButton.textContent='😊';
  emojiButton.title='Emojis et emotes de chaîne';
  emojiButton.setAttribute('aria-label','Ouvrir les emojis et emotes de chaîne');
  emojiButton.setAttribute('aria-expanded','false');
  gifButton.classList.add('swapp-chat-gif-button');
  gifButton.textContent='GIF';
  gifButton.title='Choisir un GIF';
  gifButton.setAttribute('aria-label','Choisir un GIF');
  gifButton.setAttribute('aria-expanded','false');
  sendButton.classList.add('swapp-chat-send-button');
  sendButton.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>';
  sendButton.title='Envoyer le message';
  sendButton.setAttribute('aria-label','Envoyer le message');
  const picker=create('section','swapp-chat-emoji-picker');
  picker.hidden=true;
  picker.setAttribute('aria-label','Choisir un emoji ou une emote de chaîne');
  const header=create('div','swapp-chat-emoji-header');
  header.appendChild(create('strong','','Exprime-toi'));
  const dismiss=create('button','swapp-chat-picker-close','×');
  dismiss.type='button';dismiss.setAttribute('aria-label','Fermer les emojis');
  header.appendChild(dismiss);
  const tabs=create('div','swapp-chat-emoji-tabs');
  const content=create('div','swapp-chat-emoji-grid');
  const bottom=create('div','swapp-chat-category-bar');
  const channelTab=create('button','swapp-chat-channel-tab','✦ Chaîne');
  channelTab.type='button';channelTab.setAttribute('aria-pressed','false');
  const groupButtons=[];
  let selected=0,tab='standard';
  for(let i=0;i<groups.length;i++){
   const button=create('button','swapp-chat-category-tab',groups[i][0]);
   button.type='button';
   button.setAttribute('aria-pressed',String(i===0));
   button.addEventListener('click',()=>showGroup(i));
   bottom.appendChild(button);
   groupButtons.push(button);
  }
  tabs.append(bottom,channelTab);
  picker.append(header,tabs,content);
  panel.appendChild(picker);
  const custom=panel.querySelector('#customEmoteShelf');
  if(custom){
   picker.appendChild(custom);
   custom.classList.add('swapp-chat-custom-emotes');
   custom.classList.add('hidden');
  }
  const gifGrid=panel.querySelector('#gifGrid');
  if(gifGrid)gifGrid.classList.add('swapp-chat-gif-tray');
  const showGroup=i=>{
   selected=i;tab='standard';
   content.hidden=false;
   for(const button of groupButtons)button.setAttribute('aria-pressed',String(button===groupButtons[i]));
   channelTab.setAttribute('aria-pressed','false');
   if(custom)custom.classList.add('hidden');
   content.replaceChildren();
   for(const emoji of groups[i][1]){
    const b=create('button','swapp-chat-emoji-choice',emoji);
    b.type='button';b.title=emoji;b.setAttribute('aria-label','Insérer '+emoji);
    b.addEventListener('click',()=>appendEmoji(input,emoji));
    content.appendChild(b);
   }
  };
  showGroup(0);
  channelTab.addEventListener('click',()=>{
   tab='channel';
   content.hidden=true;channelTab.setAttribute('aria-pressed','true');
   for(const b of groupButtons)b.setAttribute('aria-pressed','false');
   if(custom){
    custom.classList.remove('hidden');
    if(typeof window.renderEmoteShelf==='function')window.renderEmoteShelf();
   }
  });
  const close=()=>{
   picker.hidden=true;emojiButton.setAttribute('aria-expanded','false');
   if(custom)custom.classList.add('hidden');
  };
  const open=()=>{
   picker.hidden=false;emojiButton.setAttribute('aria-expanded','true');
   if(gifGrid){gifGrid.classList.add('hidden');gifButton.setAttribute('aria-expanded','false')}
   if(tab==='channel')channelTab.click();
   else showGroup(selected);
  };
  emojiButton.addEventListener('click',()=>picker.hidden?open():close());
  dismiss.addEventListener('click',()=>{close();emojiButton.focus()});
  picker.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.stopPropagation();close();emojiButton.focus()}
  });
  if(custom)custom.addEventListener('click',event=>{
   if(event.target.closest('.emoteBtn:not(.locked)'))close();
  });
  gifButton.addEventListener('click',()=>{
   close();
   if(gifGrid)gifButton.setAttribute('aria-expanded',String(!gifGrid.classList.contains('hidden')));
  });
  if(gifGrid)gifGrid.addEventListener('click',event=>{
   if(event.target.closest('img')){
    gifGrid.classList.add('hidden');gifButton.setAttribute('aria-expanded','false');
   }
  });
  const handleOutside=event=>{
   if(!panel.isConnected){document.removeEventListener('pointerdown',handleOutside);return}
   if(!picker.hidden&&!picker.contains(event.target)&&!emojiButton.contains(event.target))close();
  };
  document.addEventListener('pointerdown',handleOutside);
  closeState.set(panel,close);
 }
 function scan(){
  channel.querySelectorAll('.nativeFixedChat[data-chat="oryon"]').forEach(enhance);
  channel.querySelectorAll('.nativeFixedChat[data-chat="oryon"] .chatLog .msg:not([data-swapp-chat-message])').forEach(modifyMessage);
 }
 let pending=false;
 function queue(){
  if(pending)return;
  pending=true;requestAnimationFrame(()=>{pending=false;scan()});
 }
 new MutationObserver(queue).observe(channel,{childList:true,subtree:true});
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const panel of channel.querySelectorAll('.nativeFixedChat[data-swapp-chat-ui="v2"]'))
   closeState.get(panel)?.();
 });
 queue();
})();
