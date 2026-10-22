/* SWAPP SOCIAL emotes: one compact native Unicode picker for posts and DMs.
 * No third-party emoji SDK, tracking, uploads or extra authentication.
 */
const GROUPS=[
 {title:'Réactions',items:[['😀','Sourire'],['😂','Mort de rire'],['🥹','Ému'],['😍','Adore'],['😎','Stylé'],['🥳','Fête'],['🤯','Incroyable'],['💜','Cœur violet'],['🔥','Feu'],['✨','Éclat']]},
 {title:'Gaming',items:[['🎮','Manette'],['👾','Alien'],['⚔️','Épées'],['🛡️','Bouclier'],['🏆','Trophée'],['🎯','Dans le mille'],['💀','Tête de mort'],['🚀','Fusée'],['🎲','Dé'],['👑','Couronne']]},
 {title:'Communauté',items:[['👀','Je regarde'],['🤝','Partenaires'],['👏','Bravo'],['🙌','Bien joué'],['💪','Force'],['🫶','Soutien'],['❤️','Cœur'],['😈','Diable'],['🌈','Arc-en-ciel'],['💬','Discussion']]}
];

export function setupSocialEmotes({requireAuth,dom}){
 let current=null;
 const buttons=()=>document.querySelectorAll('[data-emoji-toggle]');
 function close(){
  document.querySelectorAll('.pulse-emoji-picker').forEach(p=>p.remove());
  buttons().forEach(b=>b.setAttribute('aria-expanded','false'));
  current=null;
 }
 function inputFor(button){
  const conversation=button.closest('.pulse-message-form');
  return conversation?.querySelector('[name="body"]')||dom.textarea;
 }
 function addEmoji(input,emoji){
  if(!input||input.disabled)return false;
  const start=Number.isInteger(input.selectionStart)?input.selectionStart:input.value.length;
  const end=Number.isInteger(input.selectionEnd)?input.selectionEnd:input.value.length;
  const nextLength=input.value.length-(end-start)+emoji.length;
  if(input.maxLength>=0&&nextLength>input.maxLength)return false;
  input.setRangeText(emoji,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
  return true;
 }
 function open(button){
  if(current===button){close();return}
  const target=inputFor(button);
  if(!target)return;
  // Posts have a single SWAPP session. The picker cannot bypass login.
  if(target===dom.textarea&&typeof requireAuth==='function'&&!requireAuth())return;
  close();
  current=button;
  button.setAttribute('aria-expanded','true');
  const panel=document.createElement('div');
  panel.className='pulse-emoji-picker';
  panel.setAttribute('role','group');
  panel.setAttribute('aria-label','Emotes SWAPP');
  for(const group of GROUPS){
   const section=document.createElement('section');
   const heading=document.createElement('strong');
   heading.className='pulse-emoji-category';
   heading.textContent=group.title;
   const grid=document.createElement('div');
   grid.className='pulse-emoji-grid';
   for(const [emoji,label] of group.items){
    const action=document.createElement('button');
    action.type='button';action.className='pulse-emoji-choice';
    action.dataset.swappEmoji=emoji;
    action.textContent=emoji;action.title=label;
    action.setAttribute('aria-label',label);
    grid.append(action);
   }
   section.append(heading,grid);panel.append(section);
  }
  const root=button.closest('.pulse-toolset, .pulse-message-form')||button.parentElement;
  root.style.position='relative';
  button.after(panel);
 }
 document.addEventListener('click',event=>{
  const chosen=event.target.closest?.('[data-swapp-emoji]');
  if(chosen){
   const input=current&&inputFor(current);
   if(input)addEmoji(input,chosen.dataset.swappEmoji);
   close();return;
  }
  const trigger=event.target.closest?.('[data-emoji-toggle]');
  if(trigger){event.preventDefault();open(trigger);return}
  if(current&&!event.target.closest?.('.pulse-emoji-picker'))close();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&current){event.preventDefault();const trigger=current;close();trigger.focus()}
 });
 return {close};
}
