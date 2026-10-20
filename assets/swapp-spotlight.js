/* SWAPP SPOTLIGHT — real game appointments, not invented livestreams. */
(()=>{'use strict';
  const API='/api/creator/spotlight';
  const q=(sel,root=document)=>root.querySelector(sel);
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
  const link=(href,label,cls='')=>{const a=el('a',cls,label);a.href=href;return a};
  const btn=(label,handler,cls='')=>{const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b};
  const timeLabel=iso=>{
    const n=Date.parse(iso);
    return Number.isFinite(n)?new Date(n).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'Date indisponible';
  };
  const localDate=(d)=>{const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};
  let enabled=null;
  async function data(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...options.headers},...options});
    const json=await response.json().catch(()=>({}));
    if(!response.ok||json.success===false){
      const e=Error(json.error||'spotlight_unavailable');
      e.status=response.status;throw e;
    }
    return json;
  }
  const action=(url,method,body)=>data(url,{method,headers:{'Content-Type':'application/json','X-SWAPP-SPOTLIGHT-ACTION':'creator'},body:JSON.stringify(body||{})});
  function explain(error){
    const code=String(error?.message||'');
    const errors={
      swapp_account_required:'Connecte-toi à ton compte SWAPP.',
      verified_twitch_link_required:'Lie d’abord ta chaîne Twitch dans ton tableau de bord.',
      game_not_found_on_twitch:'Jeu non reconnu exactement sur Twitch. Utilise son nom officiel.',
      spotlight_game_not_covered:'SWAPP ne possède pas encore d’article publié sur ce jeu. Réservation impossible.',
      spotlight_articles_unavailable:'Les articles SWAPP sont temporairement indisponibles : impossible de réserver.',
      slot_already_reserved:'Ce créneau est déjà réservé pour ce jeu.',
      spotlight_max_upcoming_reached:'Trois réservations futures maximum par créateur.',
      slot_must_start_on_half_hour:'Choisis un horaire à 00 ou 30 minutes.',
      slot_outside_booking_window:'Le créneau doit être compris entre une heure et 45 jours dans le futur.',
      spotlight_reservation_not_found:'Ce créneau n’est plus modifiable.',
      spotlight_not_enabled:'Les réservations Spotlight ne sont pas encore activées.',
      spotlight_temporarily_unavailable:'Le service Spotlight ne répond pas actuellement.'
    };
    return errors[code]||'Action impossible pour le moment. Vérifie la connexion et réessaie.';
  }
  async function isOn(){
    if(enabled!==null)return enabled;
    try{enabled=Boolean((await data(API+'/status')).enabled)}catch(_){enabled=false}
    return enabled;
  }
  function renderPublicCard(host,row){
    const item=el('div','swapp-spotlight-slot');
    const details=el('div','swapp-spotlight-slot-info');
    details.append(el('span','swapp-spotlight-slot-time',timeLabel(row.start_at)));
    const name=row.creator_login||row.twitch_login;
    details.append(el('strong','',name));
    if(row.live?.state==='live_verified'){
      details.append(el('small','','EN DIRECT · Jeu vérifié · '+Number(row.live.viewers||0)+' spectateurs au contrôle'));
      const watch=link('/live/twitch/'+encodeURIComponent(row.twitch_login),'Regarder le direct →','swapp-spotlight-cta');
      item.append(details,watch);
      const frame=el('iframe','swapp-spotlight-player');
      frame.title='Direct Twitch de '+name;
      frame.loading='lazy';frame.allowFullscreen=true;
      frame.src='https://player.twitch.tv/?channel='+encodeURIComponent(row.twitch_login)+'&parent='+encodeURIComponent(location.hostname)+'&autoplay=false';
      host.append(item,frame);return;
    }
    const status=row.live?.state==='wrong_game'?'Jeu différent — aucune mise en avant active':
      row.live?.state==='offline'?'Non confirmé en direct':
      row.live?.state==='verification_unavailable'?'Contrôle Twitch indisponible':
      row.live?.state==='finished'?'Créneau terminé':'Créneau réservé · en attente du direct';
    details.append(el('small','',status));
    item.append(details);host.append(item);
  }
  async function renderPublic(section){
    if(section.dataset.spotlightLoaded==='1')return;
    section.dataset.spotlightLoaded='1';
    const game=String(section.getAttribute('data-spotlight-game')||'').trim();
    if(!game){section.hidden=true;return}
    if(!(await isOn())){section.hidden=true;return}
    section.replaceChildren();
    const head=el('div','swapp-spotlight-head');
    head.append(el('div','swapp-spotlight-heading','SWAPP / SPOTLIGHT'));
    head.append(el('h2','','Les prochains créateurs à l’honneur'));
    const book=link('/dashboard?game='+encodeURIComponent(game)+'#spotlight','Réserver mon créneau →','swapp-spotlight-cta');
    head.append(book);section.append(head);
    const list=el('div','swapp-spotlight-list');section.append(list);
    list.append(el('p','swapp-spotlight-note','Recherche des créneaux confirmés…'));
    try{
      const result=await data(API+'?game='+encodeURIComponent(game));
      if(!section.isConnected)return;
      list.replaceChildren();
      if(!result.items?.length){
        list.append(el('p','swapp-spotlight-note','Aucun créneau réservé pour ce jeu. Les créateurs peuvent proposer le leur.'));
      }else result.items.slice(0,6).forEach(item=>renderPublicCard(list,item));
    }catch(_){list.replaceChildren(el('p','swapp-spotlight-note','Agenda momentanément indisponible.'))}
  }
  async function renderMine(section,status){
    const list=q('[data-spotlight-mine]',section);if(!list)return;
    list.replaceChildren(el('p','swapp-spotlight-note','Chargement de tes créneaux…'));
    try{
      const result=await data(API+'/mine');
      if(!section.isConnected)return;
      list.replaceChildren();
      if(!result.items?.length){list.append(el('p','swapp-spotlight-note','Tu n’as aucune réservation à venir.'));return}
      result.items.forEach(item=>{
        const row=el('div','swapp-spotlight-slot');
        const info=el('div','swapp-spotlight-slot-info');
        info.append(el('strong','',item.game),el('small','',timeLabel(item.start_at)));
        const actions=el('div','swapp-spotlight-actions');
        actions.append(btn('Modifier',()=>{
          if(q('.swapp-spotlight-edit',row))return;
          const editor=el('form','swapp-spotlight-edit');
          const dateLabel=el('label','','Nouvel horaire');
          const date=el('input');date.type='datetime-local';date.required=true;date.step='1800';
          date.value=localDate(new Date(item.start_at));
          date.min=localDate(new Date(Date.now()+3600000));
          dateLabel.append(date);
          const save=el('button','swapp-spotlight-cta','Enregistrer');save.type='submit';
          const close=btn('Fermer',()=>editor.remove());
          editor.append(dateLabel,save,close);
          editor.addEventListener('submit',async event=>{
            event.preventDefault();
            save.disabled=true;
            try{
              const utc=new Date(date.value).toISOString();
              await action(API+'/reservations/'+item.id,'PATCH',{start_at:utc});
              status.textContent='Créneau modifié.';renderMine(section,status);
            }catch(e){status.textContent=explain(e);save.disabled=false}
          });
          row.after(editor);date.focus();
        }));
        actions.append(btn('Annuler',async()=>{
          if(!window.confirm('Annuler ce Spotlight ?'))return;
          try{await action(API+'/reservations/'+item.id,'DELETE');status.textContent='Réservation annulée.';renderMine(section,status)}
          catch(e){status.textContent=explain(e)}
        }));
        row.append(info,actions);list.append(row);
      });
    }catch(e){list.replaceChildren(el('p','swapp-spotlight-note',explain(e)))}
  }
  async function mountDashboard(dashboard){
    if(!dashboard.classList.contains('active')||!dashboard.firstElementChild||q('[data-spotlight-dashboard]',dashboard))return;
    const main=q('.swapp-creator-main',dashboard)||dashboard;
    const section=el('section','swapp-spotlight-dashboard');
    section.id='spotlight';section.setAttribute('data-spotlight-dashboard','');
    section.append(el('span','swapp-spotlight-heading','SWAPP CREATOR / SPOTLIGHT'));
    section.append(el('h2','','Réserver ma visibilité'));
    section.append(el('p','swapp-spotlight-note','Choisis un jeu Twitch officiel et un créneau de 30 minutes. Ton direct sera mis en avant seulement si SWAPP vérifie que tu diffuses réellement ce jeu.'));
    const status=el('p','swapp-spotlight-status');status.setAttribute('role','status');
    const form=el('form','swapp-spotlight-form');
    const gameField=el('label','','Jeu vidéo');
    const game=el('input');game.required=true;game.maxLength=100;game.placeholder='Nom exact du jeu sur Twitch';game.autocomplete='off';game.setAttribute('aria-label','Jeu vidéo');
    const fromUrl=new URLSearchParams(location.search).get('game');if(fromUrl)game.value=fromUrl.slice(0,100);
    gameField.append(game);
    const suggestions=el('datalist');suggestions.id='swapp-spotlight-games';game.setAttribute('list',suggestions.id);
    void data('/api/actus').then(res=>{
      const games=[...new Set((Array.isArray(res.articles)?res.articles:[])
        .map(article=>String(article.game||'').trim()).filter(Boolean))].slice(0,250).sort((a,b)=>a.localeCompare(b,'fr'));
      games.forEach(name=>{const option=el('option');option.value=name;suggestions.append(option)});
    }).catch(()=>{});
    const dateField=el('label','','Début du créneau');
    const start=el('input');start.type='datetime-local';start.required=true;start.step='1800';
    const next=new Date(Date.now()+2*3600000);next.setMinutes(next.getMinutes()<30?30:0,0,0);if(next.getMinutes()===0&&Date.now()+3600000>next.getTime())next.setHours(next.getHours()+1);
    start.value=localDate(next);start.min=localDate(new Date(Date.now()+3600000));
    dateField.append(start);
    const submit=el('button','swapp-spotlight-cta','Réserver un Spotlight');submit.type='submit';
    form.append(gameField,suggestions,dateField,submit);
    form.addEventListener('submit',async e=>{
      e.preventDefault();submit.disabled=true;status.textContent='Vérification du jeu et du créneau…';
      try{
        const d=new Date(start.value);
        if(!Number.isFinite(d.getTime()))throw Error('slot_outside_booking_window');
        const result=await action(API+'/reservations','POST',{game:game.value.trim(),start_at:d.toISOString()});
        status.textContent='Créneau confirmé : '+timeLabel(result.item?.start_at)+'.';
        renderMine(section,status);
      }catch(e){status.textContent=explain(e)}finally{submit.disabled=false}
    });
    const mineTitle=el('h3','','Mes prochains créneaux');
    const mine=el('div','swapp-spotlight-mine');mine.setAttribute('data-spotlight-mine','');
    section.append(form,status,mineTitle,mine);
    main.append(section);
    if(!(await isOn())){form.hidden=true;mineTitle.hidden=true;mine.hidden=true;
      status.textContent='Spotlight est installé mais pas encore activé sur ce serveur.';return}
    renderMine(section,status);
  }
  function mount(){
    document.querySelectorAll('[data-spotlight-game]').forEach(section=>{void renderPublic(section)});
    const dashboard=q('#dashboard');
    if(dashboard)void mountDashboard(dashboard);
  }
  function init(){
    let queued=false;
    const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
    const target=q('#dashboard');
    if(target)new MutationObserver(schedule).observe(target,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
    const actus=q('#actus');if(actus)new MutationObserver(schedule).observe(actus,{childList:true,subtree:true});
    window.addEventListener('popstate',schedule);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
