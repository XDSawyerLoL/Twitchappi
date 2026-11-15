'use strict';
/* SWAPP SERVEUR + native profile interactions. No third-party widget or tracker. */
(()=>{
 const root=document.querySelector('.ss-pro');if(!root)return;
 const id=String(root.dataset.ssServerId||'');
 if(!/^[a-f0-9]{32}$/.test(id))return;
 const feedback=document.getElementById('ss-detail-feedback');
 const say=message=>{if(feedback)feedback.textContent=String(message||'')};
 const buttons=[...root.querySelectorAll('[data-ss-vote-id]')];
 for(const button of buttons)button.addEventListener('click',async()=>{
  buttons.forEach(b=>b.disabled=true);
  try{
   const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(id)+'/vote',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});
   const result=await response.json();
   if(!response.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à SWAPP pour voter.',vote_deja_effectue:'Vote déjà enregistré : tu pourras recommencer dans deux heures.',vote_daily_limit:'Tu as atteint 3 votes sur 24 heures pour cette communauté.',origine_invalide:'Session expirée : recharge la page.'})[result.error]||'Le vote ne peut pas être enregistré.');
   say('Vote enregistré pour cette communauté.');
   const element=root.querySelector('[data-ss-profile-votes]');
   if(element&&/^\d[\d\s\u202f]*$/.test(element.textContent)){
    const amount=Number(element.textContent.replace(/[^0-9]/g,''));
    if(Number.isSafeInteger(amount))element.textContent=(amount+1).toLocaleString('fr-FR');
   }
  }catch(error){say(error.message)}finally{buttons.forEach(b=>b.disabled=false)}
 });
 for(const link of root.querySelectorAll('[data-ss-outbound-id]'))link.addEventListener('click',event=>{
  if(event.button!==0||event.defaultPrevented)return;
  fetch('/api/swapp/serveurs/'+encodeURIComponent(id)+'/visit',{method:'POST',credentials:'same-origin',keepalive:true,headers:{Accept:'application/json'}}).catch(()=>{});
 });
 for(const button of root.querySelectorAll('[data-ss-copy]'))button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(button.dataset.ssCopy);say('Adresse copiée.')}catch{say('La copie est indisponible sur ce navigateur.')}
 });
 root.querySelector('[data-ss-share]')?.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(location.href);say('Lien SWAPP copié.')}catch{say('La copie du lien est indisponible.')}
 });
 const review=root.querySelector('#ss-review-form'),reviewStatus=root.querySelector('#ss-review-status');
 if(review)review.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=review.querySelector('[type="submit"]');submit.disabled=true;
  const body=Object.fromEntries(new FormData(review).entries());
  try{
   const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(id)+'/reviews',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
   const data=await response.json();
   if(!response.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à SWAPP pour déposer un avis.',avis_deja_depose:'Tu as déjà déposé un avis pour ce serveur.',avis_invalide:'Vérifie tes notes et ta description (40 à 1 200 caractères).'})[data.error]||'Impossible d’enregistrer cet avis.');
   review.reset();reviewStatus.textContent='Avis reçu : il sera visible après validation.';say('Ton avis a été transmis à la modération SWAPP.');
  }catch(error){reviewStatus.textContent=error.message}finally{submit.disabled=false}
 });
 const tabs=[...root.querySelectorAll('.ss-pro-tabs a')];
 for(const link of tabs)link.addEventListener('click',()=>{
  tabs.forEach(tab=>tab.removeAttribute('aria-current'));link.setAttribute('aria-current','true');
 });
 const holder=root.querySelector('#ss-profile-chart-data'),chart=root.querySelector('#ss-profile-chart');
 let data=null;
 try{data=holder?JSON.parse(holder.textContent):null}catch{data=null}
 const pad=n=>String(n).padStart(2,'0');
 const utcDay=date=>date.getUTCFullYear()+'-'+pad(date.getUTCMonth()+1)+'-'+pad(date.getUTCDate());
 const monday=date=>{const d=new Date(date.getTime());d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d};
 function buckets(period){
  const today=new Date(),todayUTC=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  const rows=[],index=new Map();
  if(period==='daily'){
   for(let i=6;i>=0;i--){const date=new Date(todayUTC);date.setUTCDate(date.getUTCDate()-i);const key=utcDay(date);index.set(key,rows.length);rows.push({key,label:pad(date.getUTCDate())+'/'+pad(date.getUTCMonth()+1),votes:0,clicks:0})}
  }else if(period==='weekly'){
   const begin=monday(todayUTC);
   for(let i=7;i>=0;i--){const date=new Date(begin);date.setUTCDate(date.getUTCDate()-i*7);const key=utcDay(date);index.set(key,rows.length);rows.push({key,label:pad(date.getUTCDate())+'/'+pad(date.getUTCMonth()+1),votes:0,clicks:0})}
  }else{
   for(let i=11;i>=0;i--){const d=new Date(Date.UTC(todayUTC.getUTCFullYear(),todayUTC.getUTCMonth()-i,1));const key=utcDay(d).slice(0,7);index.set(key,rows.length);rows.push({key,label:new Intl.DateTimeFormat('fr-FR',{month:'short',timeZone:'UTC'}).format(d),votes:0,clicks:0})}
  }
  for(const [kind,field] of [['votes','votes'],['clicks','clicks']]){
   for(const item of (Array.isArray(data?.history?.[kind])?data.history[kind]:[])){
    const date=new Date(String(item.day||'')+'T00:00:00Z');
    if(!Number.isFinite(date.getTime()))continue;
    const key=period==='daily'?utcDay(date):period==='weekly'?utcDay(monday(date)):utcDay(date).slice(0,7);
    const i=index.get(key),value=Number(item.count);
    if(i!==undefined&&Number.isFinite(value)&&value>0)rows[i][field]+=value;
   }
  }
  return rows;
 }
 function renderChart(period='monthly'){
  if(!chart)return;
  if(!data){chart.textContent='Les statistiques ne sont pas disponibles pour le moment.';return}
  const rows=buckets(period),max=Math.max(0,...rows.flatMap(x=>[x.votes,x.clicks]));
  chart.replaceChildren();
  if(max===0){const p=document.createElement('p');p.className='ss-pro-chart-empty';p.textContent='Aucun vote ni aucun clic enregistré sur cette période.';chart.append(p);return}
  for(const row of rows){
   const col=document.createElement('div');col.className='ss-pro-chart-col';col.title=row.label+' : '+row.votes+' votes et '+row.clicks+' clics';
   const total=document.createElement('strong');total.textContent=String(row.votes+row.clicks);
   const bars=document.createElement('div');bars.className='ss-pro-bars';
   for(const value of [row.votes,row.clicks]){
    const bar=document.createElement('span');bar.style.height=value?Math.max(2,Math.round(value/max*100))+'%':'0';bars.append(bar);
   }
   const label=document.createElement('small');label.textContent=row.label;
   col.append(total,bars,label);chart.append(col);
  }
  chart.setAttribute('aria-label',rows.map(r=>r.label+' : '+r.votes+' votes, '+r.clicks+' clics').join(' ; '));
 }
 for(const button of root.querySelectorAll('[data-ss-period]'))button.addEventListener('click',()=>{
  root.querySelectorAll('[data-ss-period]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  renderChart(button.dataset.ssPeriod);
 });
 renderChart('monthly');
 for(const img of root.querySelectorAll('.ss-pro-backdrop img,.ss-pro-art img,.ss-pro-owner-banner img'))img.addEventListener('error',()=>img.remove());
})();
