/* SWAPP Lecture — opt-in distraction-free reading and honest French voice playback.
   No direct fetch, microphone or tracking. Browser online voices may send article text to their provider. */
(()=>{'use strict';
 if(window.__swappReaderStudio)return;
 window.__swappReaderStudio=true;
 const api=window.speechSynthesis;
 const speechReady=!!(api&&typeof window.SpeechSynthesisUtterance==='function');
 const themes=['nuit','papier','sepia'];
 const fonts=['sans','serif'];
 const store='swapp-reading-comfort-v1';
 let preferences={theme:'nuit',font:'sans'};
 try{const saved=JSON.parse(sessionStorage.getItem(store)||'{}');
  if(themes.includes(saved.theme))preferences.theme=saved.theme;
  if(fonts.includes(saved.font))preferences.font=saved.font;
 }catch(_){}
 let root=null,content=null,studio=null,panel=null,toolbar=null;
 let voices=[],parts=[],index=0,playing=false,paused=false,serial=0,currentMarked=null;
 const one=(scope,selector)=>scope?.querySelector(selector);
 const escapeValue=value=>String(value||'').replace(/\s+/g,' ').trim();
 const onArticle=()=>{
  const native=one(document,'body.swapp-editorial-route main.article-wrap > .swapp-article-reading');
  if(native)return native;
  const active=one(document,'#actus.view.active .swapp-actus-native.swapp-actus-reading .swapp-article-reading');
  return active&&active.getClientRects().length?active:null;
 };
 const qs=selector=>one(studio,selector);
 function save(){try{sessionStorage.setItem(store,JSON.stringify(preferences))}catch(_){}}
 function quality(voice){
  const name=String(voice.name||'')+' '+String(voice.voiceURI||'');
  return /natural|neural|premium|enhanced|online/i.test(name);
 }
 function sortedFrench(){
  return speechReady?api.getVoices().filter(v=>/^fr(?:-|_)/i.test(v.lang||''))
   .sort((a,b)=>Number(quality(b))-Number(quality(a))||Number(b.lang==='fr-FR')-Number(a.lang==='fr-FR')||a.name.localeCompare(b.name)): [];
 }
 function status(message){const el=qs('[data-reader-audio-status]');if(el)el.textContent=message}
 function updateVoices(){
  if(!studio)return;
  const field=qs('[data-reader-voice]'),prior=field.value;
  voices=sortedFrench();
  field.replaceChildren();
  voices.forEach((voice,i)=>{
   const opt=document.createElement('option');opt.value=String(i);
   opt.textContent=voice.name+' ('+voice.lang+')'+(quality(voice)?' · voix naturelle indiquée':'');
   field.append(opt);
  });
  if(voices.length)field.value=voices[Number(prior)]?prior:String(Math.max(0,voices.findIndex(quality)));
  const start=qs('[data-reader-play]');
  start.disabled=!voices.length;
  if(!speechReady)status('Lecture vocale non prise en charge ici.');
  else if(!voices.length)status('Aucune voix française détectée sur cet appareil.');
  else if(voices.some(quality))status('Une voix annoncée comme naturelle est disponible. Sa qualité dépend du navigateur.');
  else status('Voix française du système disponible : rendu variable. La voix Mairy naturelle n’est pas encore connectée.');
 }
 function highlight(node){
  if(currentMarked)currentMarked.classList.remove('swapp-narration-current');
  currentMarked=node||null;
  if(currentMarked){
   currentMarked.classList.add('swapp-narration-current');
   const bounds=currentMarked.getBoundingClientRect();
   if(bounds.top<95||bounds.bottom>window.innerHeight-100)
    currentMarked.scrollIntoView({block:'center',behavior:'auto'});
  }
 }
 function clearAudio(){
  serial++;playing=false;paused=false;index=0;parts=[];highlight(null);
  if(speechReady)api.cancel();
  if(studio){
   qs('[data-reader-play]').textContent='Écouter l’article';
   qs('[data-reader-stop]').disabled=true;
   qs('[data-reader-prev]').disabled=true;
   qs('[data-reader-next]').disabled=true;
   qs('[data-reader-audio-count]').textContent='';
  }
 }
 function fragments(){
  if(!content)return [];
  const chunks=[];
  const blocks=[...content.querySelectorAll('h2,h3,p,li,blockquote')];
  for(const element of blocks){
   if(element.closest('aside,nav,footer,button,[aria-hidden="true"]'))continue;
   const text=escapeValue(element.textContent);
   if(!text)continue;
   // Keep natural phrase endings; short utterances avoid long Chrome/Safari
   // synthesis stalls while preserving punctuation and paragraph sequence.
   const sentences=text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)||[text];
   let group='';
   for(const sentence of sentences){
    const words=escapeValue(sentence).split(' ');
    for(const word of words){
     if(!word)continue;
     if((group+' '+word).trim().length>240&&group){
      chunks.push({text:group.trim(),element});group='';
     }
     group+=(group?' ':'')+word;
    }
   }
   if(group.trim())chunks.push({text:group.trim(),element});
  }
  return chunks;
 }
 function refreshButtons(){
  if(!studio)return;
  qs('[data-reader-play]').textContent=playing?(paused?'Reprendre':'Pause'):'Écouter l’article';
  qs('[data-reader-stop]').disabled=!playing;
  qs('[data-reader-prev]').disabled=!playing;
  qs('[data-reader-next]').disabled=!playing;
  qs('[data-reader-audio-count]').textContent=playing?String(index+1)+' / '+parts.length:'';
 }
 function say(sequence){
  if(!playing||paused||sequence!==serial||!parts[index])return;
  const chosen=voices[Number(qs('[data-reader-voice]').value)];
  if(!chosen){clearAudio();status('La voix française sélectionnée est indisponible.');return;}
  if(chosen.localService===false&&!qs('[data-reader-online-consent]').checked){
   clearAudio();status('Cette voix peut traiter le texte via un service en ligne du navigateur. Ton accord explicite est nécessaire.');return;
  }
  const part=parts[index];
  highlight(part.element);
  const utterance=new window.SpeechSynthesisUtterance(part.text);
  utterance.voice=chosen;utterance.lang=chosen.lang||'fr-FR';
  utterance.rate=Number(qs('[data-reader-speed]').value)||1;
  utterance.pitch=1;utterance.volume=1;
  utterance.onend=()=>{
   if(sequence!==serial||!playing)return;
   index++;
   if(index>=parts.length){clearAudio();status('Lecture terminée.');return;}
   refreshButtons();say(sequence);
  };
  utterance.onerror=event=>{
   if(sequence!==serial||!playing||event.error==='canceled'||event.error==='interrupted')return;
   clearAudio();status('La lecture a été interrompue par le navigateur. Tu peux réessayer.');
  };
  refreshButtons();
  try{api.speak(utterance)}catch(_){clearAudio();status('Lecture vocale indisponible sur cet appareil.')}
 }
 function play(){
  if(!speechReady||!voices.length)return;
  if(playing){
   if(paused){paused=false;api.resume();}
   else{paused=true;api.pause();}
   refreshButtons();return;
  }
  parts=fragments();
  if(!parts.length){status('Cet article ne contient pas de texte à lire.');return;}
  serial++;playing=true;paused=false;index=0;
  status('Lecture française. La fluidité dépend de la voix installée.');
  say(serial);
 }
 function jump(offset){
  if(!playing)return;
  const target=Math.max(0,Math.min(parts.length-1,index+offset));
  serial++;api.cancel();index=target;paused=false;playing=true;say(serial);
 }
 function setFocus(next){
  const active=!!next;
  document.documentElement.classList.toggle('swapp-reader-focus',active);
  toolbar?.querySelector('[data-reader-focus]')?.setAttribute('aria-pressed',String(active));
  const btn=qs('[data-reader-focus]');
  if(btn)btn.textContent=active?'Quitter la liseuse':'Mode liseuse';
 }
 function applyPreferences(){
  document.documentElement.dataset.swappReaderTheme=preferences.theme;
  document.documentElement.dataset.swappReaderFont=preferences.font;
  if(studio){
   qs('[data-reader-theme]').value=preferences.theme;
   qs('[data-reader-font]').value=preferences.font;
  }
 }
 function build(){
  studio=document.createElement('section');
  studio.className='swapp-reader-studio';
  studio.setAttribute('aria-label','Lecture SWAPP');
  studio.innerHTML='<div class="swapp-reader-studio-primary">'+
   '<strong>SWAPP <span>LECTURE</span></strong>'+
   '<div class="swapp-reader-studio-actions">'+
   '<button type="button" data-reader-focus aria-pressed="false">Mode liseuse</button>'+
   '<button type="button" data-reader-audio-toggle aria-expanded="false">Écouter</button></div></div>'+
   '<div class="swapp-reader-studio-options">'+
   '<label>Ambiance<select data-reader-theme><option value="nuit">Nuit</option><option value="papier">Papier</option><option value="sepia">Sépia</option></select></label>'+
   '<label>Police<select data-reader-font><option value="sans">Sans serif</option><option value="serif">Livre</option></select></label>'+
   '<div class="swapp-reader-studio-sizes" aria-label="Taille du texte">'+
   '<button type="button" data-reader-smaller aria-label="Réduire le texte">A−</button>'+
   '<button type="button" data-reader-larger aria-label="Agrandir le texte">A+</button></div></div>'+
   '<div class="swapp-reader-audio" data-reader-panel hidden>'+
   '<div class="swapp-reader-audio-toolbar">'+
   '<button type="button" data-reader-prev disabled aria-label="Revenir au passage précédent">◀◀</button>'+
   '<button type="button" data-reader-play>Écouter l’article</button>'+
   '<button type="button" data-reader-next disabled aria-label="Passage suivant">▶▶</button>'+
   '<button type="button" data-reader-stop disabled>Arrêter</button>'+
   '<span data-reader-audio-count aria-live="off"></span></div>'+
   '<div class="swapp-reader-audio-settings">'+
   '<label>Voix française<select data-reader-voice aria-label="Choisir une voix française"></select></label>'+
   '<label>Vitesse<select data-reader-speed><option value="0.85">0,85×</option><option value="1" selected>1×</option><option value="1.1">1,1×</option><option value="1.2">1,2×</option></select></label></div>'+ 
   '<label class="swapp-reader-online-privacy"><input type="checkbox" data-reader-online-consent> Autoriser une voix en ligne si le navigateur en utilise une (le texte peut être transmis au fournisseur de la voix).</label>'+ 
   '<p data-reader-audio-status role="status">Vérification des voix installées…</p>'+
   '</div>';
  root.prepend(studio);
  toolbar=studio;
  panel=qs('[data-reader-panel]');
  qs('[data-reader-focus]').addEventListener('click',()=>setFocus(!document.documentElement.classList.contains('swapp-reader-focus')));
  qs('[data-reader-audio-toggle]').addEventListener('click',()=>{
   panel.hidden=!panel.hidden;
   qs('[data-reader-audio-toggle]').setAttribute('aria-expanded',String(!panel.hidden));
   if(!panel.hidden)updateVoices();
  });
  qs('[data-reader-theme]').addEventListener('change',event=>{
   if(themes.includes(event.target.value)){preferences.theme=event.target.value;save();applyPreferences()}
  });
  qs('[data-reader-font]').addEventListener('change',event=>{
   if(fonts.includes(event.target.value)){preferences.font=event.target.value;save();applyPreferences()}
  });
  for(const [selector,offset] of [['[data-reader-smaller]',0],['[data-reader-larger]',1]]){
   qs(selector).addEventListener('click',()=>{
    const buttons=[...root.querySelectorAll('.swapp-reader-type-tools button')];
    if(buttons[offset])buttons[offset].click();
   });
  }
  qs('[data-reader-play]').addEventListener('click',play);
  qs('[data-reader-stop]').addEventListener('click',()=>{clearAudio();status('Lecture arrêtée.')});
  qs('[data-reader-prev]').addEventListener('click',()=>jump(-1));
  qs('[data-reader-next]').addEventListener('click',()=>jump(1));
  qs('[data-reader-voice]').addEventListener('change',()=>{if(playing){clearAudio();status('Voix modifiée. Relance la lecture.')}});
  qs('[data-reader-online-consent]').addEventListener('change',()=>{if(playing){clearAudio();status('Consentement vocal modifié. Relance la lecture.')}});
  qs('[data-reader-speed]').addEventListener('change',()=>{if(playing)jump(0)});
  applyPreferences();updateVoices();
 }
 function sync(){
  const reading=onArticle();
  const text=one(reading,'#article-content');
  if(reading===root&&text===content&&studio?.isConnected)return;
  if(root||studio){clearAudio();setFocus(false);}
  root=reading;content=text;studio=null;panel=null;toolbar=null;
  if(root&&content)build();
 }
 const observer=new MutationObserver(sync);
 function boot(){
  sync();
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pageshow',sync);
  window.addEventListener('popstate',sync);
  window.addEventListener('pagehide',clearAudio);
  if(speechReady){
   if(typeof api.addEventListener==='function')api.addEventListener('voiceschanged',updateVoices);
   else api.onvoiceschanged=updateVoices;
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();