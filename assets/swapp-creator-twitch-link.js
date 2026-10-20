/* SWAPP Creator — Twitch is a linked service of a SWAPP account, never a second sign-in. */
(()=>{'use strict';
  const DASHBOARD_ID='dashboard';
  const STATUS_URL='/api/creator/twitch/status';
  const LINK_URL='/twitch_auth_start?mode=link&returnTo=%2Fdashboard';
  const UNLINK_URL='/api/creator/twitch/unlink';
  const pending=new WeakSet();
  const element=(tag,className,text)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  const button=(text,handler,kind)=>{
    const el=element('button','swapp-creator-link-btn'+(kind?' '+kind:''),text);
    el.type='button';el.addEventListener('click',handler);return el;
  };
  const link=(href,text)=>{
    const el=element('a','swapp-creator-link-btn',text);
    el.href=href;return el;
  };
  const message=(root,text)=>{
    root.replaceChildren(element('p','swapp-creator-link-note',text));
  };
  async function loadStatus(section){
    if(pending.has(section)||!section.isConnected)return;
    const display=section.querySelector('[data-creator-twitch-state]');
    const actions=section.querySelector('[data-creator-twitch-actions]');
    if(!display||!actions)return;
    pending.add(section);
    actions.replaceChildren();message(display,'Vérification de la connexion…');
    try{
      const response=await fetch(STATUS_URL,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
      const data=await response.json().catch(()=>({success:false}));
      if(!section.isConnected)return;
      actions.replaceChildren();
      if(response.status===401){
        message(display,'Connecte-toi à ton compte SWAPP pour associer ta chaîne Twitch.');
        actions.append(link('/compte','Ouvrir mon compte SWAPP'));
        return;
      }
      if(!response.ok||!data.success)throw Error('État Twitch indisponible. Réessaie plus tard.');
      if(!data.linked){
        message(display,'Aucune chaîne Twitch associée. Ton compte SWAPP reste ton identité principale.');
        actions.append(link(LINK_URL,'Lier mon compte Twitch'));
        return;
      }
      const tw=data.twitch||{};
      const wrap=element('div','swapp-creator-link-current');
      if(tw.profile_image_url){
        try{
          const url=new URL(tw.profile_image_url);
          if(url.protocol==='https:'){
            const img=element('img','swapp-creator-link-avatar');
            img.src=url.href;img.alt='';img.loading='lazy';wrap.append(img);
          }
        }catch(_){}
      }
      const copy=element('div','swapp-creator-link-copy');
      copy.append(element('strong','',tw.display_name||tw.login||'Twitch associé'));
      copy.append(element('span','', '@'+(tw.login||'chaîne')+' · '+(tw.authorization_valid?'Compte associé':'Autorisation à renouveler')));
      wrap.append(copy);
      display.replaceChildren(wrap);
      actions.append(link(LINK_URL,tw.authorization_valid?'Changer de chaîne':'Renouveler Twitch'));
      actions.append(button('Délier Twitch',()=>unlink(section),'is-danger'));
    }catch(_){
      message(display,'Impossible de vérifier la liaison Twitch pour le moment.');
      actions.replaceChildren(button('Réessayer',()=>loadStatus(section)));
    }finally{pending.delete(section);}
  }
  async function unlink(section){
    if(pending.has(section)||!window.confirm('Délier Twitch de ce compte SWAPP ? Ton compte SWAPP reste actif.'))return;
    const actions=section.querySelector('[data-creator-twitch-actions]');
    const display=section.querySelector('[data-creator-twitch-state]');
    if(!actions||!display)return;
    pending.add(section);actions.replaceChildren();message(display,'Déliaison en cours…');
    try{
      const r=await fetch(UNLINK_URL,{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Accept':'application/json','Content-Type':'application/json','X-SWAPP-CREATOR-ACTION':'unlink'},body:'{}'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.success)throw Error('Impossible de délier Twitch.');
      message(display,'Twitch a été délié de ton compte SWAPP.');
      actions.append(link(LINK_URL,'Lier une chaîne Twitch'));
    }catch(_){
      message(display,'Déliaison impossible. Aucun changement confirmé.');
      actions.append(button('Vérifier la liaison',()=>loadStatus(section)));
    }finally{pending.delete(section);}
  }
  function mount(){
    const dashboard=document.getElementById(DASHBOARD_ID);
    if(!dashboard||!dashboard.classList.contains('active')||!dashboard.firstElementChild||
      dashboard.querySelector('[data-creator-twitch-link]'))return;
    const section=element('section','swapp-creator-twitch-link');
    section.setAttribute('data-creator-twitch-link','');
    section.setAttribute('aria-labelledby','swapp-creator-twitch-heading');
    const head=element('div','swapp-creator-link-heading');
    const text=element('div');
    text.append(element('span','swapp-creator-link-eyebrow','SWAPP CREATOR · COMPTES ASSOCIÉS'));
    const h=element('h2','', 'Twitch');h.id='swapp-creator-twitch-heading';text.append(h);
    text.append(element('p','', 'Associe ta chaîne Twitch à ton compte SWAPP pour participer aux futurs créneaux Spotlight.'));
    head.append(text);section.append(head);
    const content=element('div','swapp-creator-link-body');
    const state=element('div','');state.setAttribute('data-creator-twitch-state','');state.setAttribute('aria-live','polite');
    const actions=element('div','swapp-creator-link-actions');actions.setAttribute('data-creator-twitch-actions','');
    content.append(state,actions);section.append(content);
    const main=dashboard.querySelector('.swapp-creator-main')||dashboard;
    const title=main.querySelector('.pageHead,.swapp-dashboard-header,.swapp-workspace-header');
    if(title&&title.parentElement===main)title.insertAdjacentElement('afterend',section);
    else main.prepend(section);
    loadStatus(section);
  }
  function routeExistingAccountConnection(){
    const root=document.getElementById('settings');
    if(!root)return;
    for(const row of root.querySelectorAll('.swapp-acct-connection-row')){
      if(row.dataset.creatorTwitchRouted==='1'||row.querySelector('b')?.textContent?.trim()!=='Twitch')continue;
      row.dataset.creatorTwitchRouted='1';
      const oldButton=row.querySelector('button');
      if(oldButton){
        const manage=element('a','btn secondary','Gérer Twitch');
        manage.href='/dashboard';
        oldButton.replaceWith(manage);
      }
      const hint=row.querySelector('small');
      if(hint)hint.textContent='Liaison et déliaison depuis le tableau de bord SWAPP Creator.';
    }
  }
  function init(){
    const dashboard=document.getElementById(DASHBOARD_ID);
    if(!dashboard)return;
    const schedule=()=>{if(!window.requestAnimationFrame)return mount();window.requestAnimationFrame(mount);};
    const observer=new MutationObserver(schedule);
    observer.observe(dashboard,{attributes:true,attributeFilter:['class'],childList:true});
    document.addEventListener('click',event=>{
      const a=event.target?.closest?.('a[href="/dashboard"],button[data-view="dashboard"]');
      if(a) schedule();
    });
    window.addEventListener('popstate',schedule);
    const settings=document.getElementById('settings');
    if(settings){
      const settingsObserver=new MutationObserver(routeExistingAccountConnection);
      settingsObserver.observe(settings,{childList:true,subtree:true});
      routeExistingAccountConnection();
    }
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
