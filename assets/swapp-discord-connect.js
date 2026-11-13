(()=>{'use strict';
 const el=id=>document.getElementById(id),status=el('sdc-status');
 const msg=(text)=>{status.textContent=text};
 const btnAccount=el('sdc-connect'),btnAdd=el('sdc-add'),btnRemove=el('sdc-unlink');
 const identity=el('sdc-identity'),servers=el('sdc-servers');
 const query=new URLSearchParams(location.search);
 const oauthError=query.has('error')?'Discord n’a pas pu être lié : '+String(query.get('error')).slice(0,70):'';
 const oauthSuccess=query.has('connected')?'Autorisation Discord enregistrée. ':'';
 if(oauthError)msg(oauthError);
 else if(oauthSuccess)msg(oauthSuccess);
 function node(tag,cls,label){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(label!==undefined)e.textContent=label;
  return e;
 }
 async function action(method,url,payload={}){
  const res=await fetch(url,{method,credentials:'same-origin',
   headers:{'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify(payload)});
  if(!res.ok)throw Error('Erreur '+res.status);
  return res.json();
 }
 async function refresh(){
  const result=await fetch('/api/swapp/discord/status',{credentials:'same-origin',cache:'no-store'});
  if(result.status===401){msg('Connecte-toi d’abord à ton compte SWAPP.');btnAccount.hidden=true;btnAdd.hidden=true;return}
  if(result.status===503){msg('Discord Connect nécessite la configuration sécurisée du serveur et MySQL Hostinger.');btnAccount.hidden=true;btnAdd.hidden=true;return}
  if(!result.ok)throw Error('État Discord indisponible');
  const state=await result.json();
  identity.replaceChildren();servers.replaceChildren();
  btnAccount.hidden=state.connected;btnRemove.hidden=!state.connected;
  btnAdd.hidden=!state.connected;
  if(!state.connected){
   identity.append(node('p','','Aucun compte Discord lié. Le compte SWAPP reste autonome.'));
   msg('Associe ton compte Discord, puis autorise tes serveurs un par un.');
   return;
  }
  const box=node('div','sdc-account'),text=node('strong','',state.discord.username);
  if(state.discord.avatar){const img=node('img');img.src=state.discord.avatar;img.alt='Avatar Discord';box.append(img)}
  box.append(text);identity.append(box);
  if(!state.communities.length)servers.append(node('p','','Aucun serveur autorisé. Choisis un salon depuis Discord pour recevoir les annonces.'));
  state.communities.forEach(guild=>{
   const item=node('div','sdc-guild'),details=node('div');
   details.append(node('strong','',guild.name),node('small','','Salon Discord : '+guild.channel_id));
   const controls=node('div','sdc-guild-controls');
   const toggle=(label,checked)=>{
    const wrapper=node('label'),input=node('input');input.type='checkbox';input.checked=checked;
    wrapper.append(input,node('span','',label));return {wrapper,input};
   };
   const announcement=toggle('Annonces live',guild.announcements);
   const listed=toggle('Afficher sur SWAPP',guild.public);
   const remove=node('button','','Retirer');remove.type='button';
   async function update(){
    try{
     msg('Mise à jour…');
     await action('POST','/api/swapp/discord/community/'+guild.guild_id,{
      announcements:announcement.input.checked,public:listed.input.checked
     });
     msg('Préférences enregistrées.');
    }catch(err){msg('Enregistrement impossible : '+err.message);void refresh()}
   }
   announcement.input.addEventListener('change',update);
   listed.input.addEventListener('change',update);
   remove.addEventListener('click',async()=>{
    if(!confirm('Retirer ce serveur de SWAPP et arrêter ses annonces ?'))return;
    try{await action('DELETE','/api/swapp/discord/community/'+guild.guild_id);await refresh()}
    catch(err){msg('Suppression impossible : '+err.message)}
   });
   controls.append(announcement.wrapper,listed.wrapper,remove);
   item.append(details,controls);servers.append(item);
  });
  msg(oauthError||oauthSuccess+state.communities.length+' serveur(s) connecté(s). Les annonces nécessitent un flux SWAPP réellement en direct.');
 }
 btnRemove.addEventListener('click',async()=>{
  if(!confirm('Déconnecter Discord et supprimer tous les serveurs liés à SWAPP ?'))return;
  try{await action('DELETE','/api/swapp/discord/account');await refresh()}
  catch(err){msg('Impossible de déconnecter : '+err.message)}
 });
 void refresh().catch(err=>msg('Connexion Discord indisponible : '+err.message));
})();