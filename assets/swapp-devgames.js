'use strict';
(()=> {
 const button=document.getElementById('dg-start-button');
 const host=document.getElementById('dg-game-window');
 const screen=document.getElementById('dg-start-screen');
 const status=document.getElementById('dg-load-state');
 if(!button||!host||!screen)return;
 let launched=false;
 button.addEventListener('click',()=>{
  if(launched)return;
  launched=true;
  button.disabled=true;
  status.textContent='Chargement de la cité…';
  const frame=document.createElement('iframe');
  frame.title='CIVITAS V40 — jeu de stratégie romain';
  frame.allow='fullscreen';
  frame.setAttribute('allowfullscreen','');
  frame.referrerPolicy='same-origin';
  frame.addEventListener('load',()=>{host.classList.add('dg-playing');status.textContent='';},{once:true});
  frame.addEventListener('error',()=>{status.textContent='Le chargement a échoué. Utilisez le lien « Ouvrir le jeu seul ».';button.disabled=false;launched=false;},{once:true});
  frame.src='/devgames/civitas/jeu?v=40';
  screen.replaceWith(frame);
 });
})();
