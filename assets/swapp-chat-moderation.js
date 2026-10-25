/* Native SWAPP live chat moderation desk: independent from the player layout. */
(function(){
 'use strict';
 const root=document.getElementById('channel');if(!root)return;
 const $=(s,r=document)=>r.querySelector(s);
 const el=(tag,cls,label)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(label!==undefined)x.textContent=label;return x;};
 const valid=x=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(String(x||''));
 const room=()=>{
  let value='';
  try{if(typeof state!=='undefined')value=String(state.channelProfile?.login||state.lastChannelLogin||state.watchRoom||state.room||'').toLowerCase()}catch(_){}
  if(valid(value))return value;
  const match=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,40})\/?$/i);
  return match?match[1].toLowerCase():'';
 };
 const endpoint=name=>'/api/swapp/channel-moderation/'+encodeURIComponent(name);
 async function request(name,payload){
  const r=await fetch(endpoint(name),{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.success===false)throw Error(data.error||'Modération indisponible.');
  return data;
 }
 let current='',role='viewer',snapshot=null,launch=null,dialog=null,busy=false;
 const sockets=new WeakSet();
 function wireSocket(){
  let socket=null;try{socket=typeof state!=='undefined'?state.socket:null}catch(_){}
  if(!socket||sockets.has(socket))return;
  sockets.add(socket);
  socket.on('native:chat:deleted',data=>{
   if(data?.room!==room())return;
   const id=String(data.id||'');
   const log=$('#nativeChatLog');
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!log)return;
   const node=Array.from(log.querySelectorAll('[data-swapp-message-id]')).find(x=>x.dataset.swappMessageId===id);
   if(node)node.remove();else socket.emit('native:chat:history',{room:data.room});
   if(dialog?.open)void refresh();
  });
  socket.on('native:moderation:updated',data=>{if(dialog?.open&&data?.room===current)void refresh()});
 }
 function wireMessages(){
  if(typeof window.msgHtml!=='function'||window.msgHtml.__swappModerated)return;
  const orig=window.msgHtml;
  const replacement=function(message){
   const markup=orig.apply(this,arguments),id=String(message?.id||'');
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return markup;
   return markup.replace(/class="msg"/,'class="msg" data-swapp-message-id="'+id+'"');
  };
  replacement.__swappModerated=true;window.msgHtml=replacement;
  try{if(typeof state!=='undefined'&&state.socket&&room())state.socket.emit('native:chat:history',{room:room()})}catch(_){}
 }
 function report(message,bad=false){
  const line=dialog&&$('.swapp-mod-status',dialog);
  if(line){line.textContent=message||'';line.dataset.error=bad?'1':'0';}
 }
 function buildDialog(){
  if(dialog)return;
  dialog=el('dialog','swapp-mod-dialog');
  dialog.setAttribute('aria-label','Modération du tchat SWAPP');
  dialog.innerHTML=[
   '<header class="swapp-mod-top"><div><b>Modération du tchat</b><small>Chaîne SWAPP</small></div><button type="button" data-close aria-label="Fermer">×</button></header>',
   '<p class="swapp-mod-status" role="status" aria-live="polite"></p><div class="swapp-mod-scroll">',
   '<section><h3>Sanctionner un compte</h3><div class="swapp-mod-row"><input name="target" placeholder="Identifiant SWAPP" maxlength="40" aria-label="Compte à modérer"><select name="minutes" aria-label="Durée"><option value="1">1 min</option><option value="5">5 min</option><option value="10" selected>10 min</option><option value="60">1 h</option><option value="1440">24 h</option></select></div>',
   '<div class="swapp-mod-buttons"><button data-action="timeout">Exclure temporairement</button><button data-action="mute">Rendre muet</button><button data-action="ban">Bannir</button><button data-action="untimeout">Fin exclusion</button><button data-action="unmute">Réactiver</button><button data-action="unban">Débannir</button></div></section>',
   '<section data-owner><h3>Modérateurs</h3><div class="swapp-mod-row"><input name="moderator" placeholder="Compte SWAPP" maxlength="40" aria-label="Compte modérateur"><button data-action="add_mod">Ajouter</button><button data-action="remove_mod">Retirer</button></div></section>',
   '<section data-owner><h3>Protection automatique</h3><label>Mode lent <select name="slow"><option value="0">Off</option><option value="3">3 s</option><option value="5">5 s</option><option value="10">10 s</option><option value="20">20 s</option><option value="30">30 s</option></select></label><button data-action="slow">Enregistrer</button>',
   '<label class="swapp-mod-block">Mots interdits (séparés par des virgules)<textarea name="words" maxlength="5000" rows="2"></textarea></label><button data-action="words">Enregistrer les mots</button></section>',
   '<section><h3>Sanctions en cours</h3><div class="swapp-mod-sanctions"></div></section>',
   '<section><h3>Derniers messages</h3><div class="swapp-mod-messages"></div></section>',
   '<section><h3>Journal des actions</h3><div class="swapp-mod-audit"></div></section></div>'
  ].join('');
  document.body.appendChild(dialog);
  $('[data-close]',dialog).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.addEventListener('click',async e=>{
   const b=e.target.closest('[data-action]');if(!b||busy)return;
   const action=b.dataset.action, payload={action};
   if(['add_mod','remove_mod'].includes(action))payload.target=$('[name="moderator"]',dialog).value.trim().toLowerCase();
   else if(['ban','unban','mute','unmute','timeout','untimeout'].includes(action))payload.target=$('[name="target"]',dialog).value.trim().toLowerCase();
   if(action==='timeout')payload.minutes=Number($('[name="minutes"]',dialog).value);
   if(action==='slow')payload.seconds=Number($('[name="slow"]',dialog).value);
   if(action==='words')payload.words=$('[name="words"]',dialog).value;
   if(action==='delete')payload.id=b.dataset.id;
   busy=true;report('Application…');
   try{snapshot=await request(current,payload);render(false);report('Action appliquée.')}
   catch(error){report(error.message,true)}
   finally{busy=false}
  });
 }
 function render(reset=true){
  if(!snapshot||!dialog)return;
  const data=snapshot.state||{};
  dialog.querySelectorAll('[data-owner]').forEach(n=>n.hidden=snapshot.role!=='owner');
  if(reset){
   $('[name="words"]',dialog).value=(data.blocked_words||[]).join(', ');
   $('[name="slow"]',dialog).value=String(data.slow_seconds||0);
  }
  const sanc=$('.swapp-mod-sanctions',dialog);sanc.replaceChildren();
  for(const [label,items] of [['Banni',data.banned||[]],['Muet',data.muted||[]],['Modérateur',data.moderators||[]]]){
   items.forEach(name=>sanc.appendChild(el('span','swapp-mod-pill',label+' : '+name)));
  }
  for(const [name,until] of Object.entries(data.timeouts||{})){
   if(Number(until)>Date.now())sanc.appendChild(el('span','swapp-mod-pill','Exclu : '+name));
  }
  if(!sanc.childElementCount)sanc.appendChild(el('p','swapp-mod-empty','Aucune sanction active.'));
  const msgs=$('.swapp-mod-messages',dialog);msgs.replaceChildren();
  for(const m of snapshot.messages||[]){
   const row=el('div','swapp-mod-message'),body=el('div','swapp-mod-message-text');
   body.append(el('b','',m.user_display||m.user||'Utilisateur'),el('span','',m.text||(m.gif?'[GIF]':'[Emote]')));
   const remove=el('button','','Supprimer');remove.type='button';
   remove.dataset.action='delete';remove.dataset.id=m.id;
   remove.setAttribute('aria-label','Supprimer le message de '+(m.user_display||m.user||'Utilisateur'));
   const select=el('button','swapp-mod-select','Sanctionner');
   select.type='button';select.setAttribute('aria-label','Sanctionner '+(m.user_display||m.user||'Utilisateur'));
   select.addEventListener('click',()=>{
    const field=$('[name="target"]',dialog);
    field.value=String(m.user||'').toLowerCase();
    field.focus();field.scrollIntoView({block:'center',behavior:'smooth'});
   });
   const controls=el('div','swapp-mod-message-controls');controls.append(select,remove);
   row.append(body,controls);msgs.appendChild(row);
  }
  if(!msgs.childElementCount)msgs.appendChild(el('p','swapp-mod-empty','Pas de messages récents.'));
  const audit=$('.swapp-mod-audit',dialog);audit.replaceChildren();
  for(const item of data.audit||[]){
   audit.appendChild(el('p','',new Date(item.ts).toLocaleString('fr-FR')+' · '+item.by+' · '+item.action+(item.target?' · '+item.target:'')));
  }
 }
 async function refresh(){
  if(!dialog?.open||!current)return;
  try{const next=await request(current);if(next.role==='viewer'){dialog.close();return}snapshot=next;render(false)}
  catch(e){report(e.message,true)}
 }
 async function openDesk(){
  current=room();if(!current)return;
  buildDialog();dialog.showModal();report('Chargement…');
  try{snapshot=await request(current);if(snapshot.role==='viewer'){dialog.close();return}render();report('')}
  catch(e){report(e.message,true)}
 }
 async function scan(){
  wireMessages();wireSocket();
  if(!root.classList.contains('active'))return;
  const pane=root.querySelector('.nativeFixedChat[data-chat="oryon"]');
  const name=room();if(!pane||!name)return;
  if(current!==name){current=name;role='viewer';snapshot=null;if(dialog?.open)dialog.close()}
  if(launch?.isConnected&&launch.dataset.room===name)return;
  launch?.remove();launch=null;
  try{
   const response=await request(name);
   if(room()!==name||!pane.isConnected)return;
   role=response.role;
   if(role==='viewer')return;
   const target=pane.querySelector('.chatHeader')||pane;
   launch=el('button','swapp-mod-open','Modération');launch.type='button';launch.dataset.room=name;
   launch.addEventListener('click',openDesk);target.appendChild(launch);
  }catch(_){}
 }
 let timer=null;
 const schedule=()=>{if(timer)return;timer=setTimeout(()=>{timer=null;void scan()},350)};
 new MutationObserver(records=>{
  if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&
   (n.matches?.('.creatorRefine,.nativeFixedChat')||n.querySelector?.('.nativeFixedChat')))))schedule();
 }).observe(root,{childList:true,subtree:true});
 window.addEventListener('popstate',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 schedule();
})();
