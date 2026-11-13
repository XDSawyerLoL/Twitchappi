/* SWAPP account integrations: manage Discord from /compte, never the global header. */
(()=>{'use strict';
 const root=document.getElementById('settings');
 if(!root)return;
 let scheduled=false;
 function paint(){
  scheduled=false;
  // Authentication and account tabs are owned by the original SWAPP renderer.
  // Never add the link to the anonymous login form.
  const overview=root.querySelector('[data-account-panel="overview"]');
  if(!overview||root.querySelector('#swapp-account-discord'))return;
  const section=document.createElement('section');
  section.id='swapp-account-discord';
  section.className='swapp-acct-discord-integration';
  section.setAttribute('aria-labelledby','swapp-account-discord-title');
  const heading=document.createElement('h3');
  heading.id='swapp-account-discord-title';heading.textContent='Discord';
  const summary=document.createElement('p');
  summary.textContent='Connecte ton compte Discord, choisis tes serveurs et les salons qui annonceront tes directs SWAPP.';
  const action=document.createElement('a');
  action.href='/discord';action.className='swapp-acct-discord-link';
  action.textContent='Gérer Discord Connect';
  action.setAttribute('aria-label','Lier ou déconnecter Discord et gérer les annonces de live');
  section.append(heading,summary,action);
  overview.append(section);
 }
 const queue=()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(paint);
 };
 const observer=new MutationObserver(queue);
 observer.observe(root,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
 else queue();
})();