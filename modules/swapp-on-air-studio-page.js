'use strict';
const {layout}=require('./swapp-news/site-shell');
function page(){
 const content='<main class="oas"><a class="oas-back" href="/on-air">← ON AIR</a>'+
 '<header class="oas-head"><span>SWAPP / STUDIO PODCAST</span><h1>Publier un épisode</h1>'+
 '<p>Un MP3, les sources vérifiées, et une validation éditoriale. Sans application supplémentaire ni API payante.</p></header>'+
 '<form id="oas-form" class="oas-form">'+
 '<div class="oas-field"><label for="oas-file">Enregistrement MP3 final</label>'+
 '<input id="oas-file" type="file" accept=".mp3,audio/mpeg" required>'+
 '<small>MP3 de 30 Ko à 24 Mo. Écoute ton enregistrement avant publication.</small>'+
 '<audio id="oas-preview" controls preload="none" hidden aria-label="Préécoute du podcast"></audio></div>'+
 '<div class="oas-field"><label for="oas-title">Titre</label>'+
 '<input id="oas-title" name="title" autocomplete="off" maxlength="180" minlength="12" required placeholder="SWAPP ON AIR — Le dossier du jour"></div>'+
 '<div class="oas-field"><label for="oas-description">Présentation</label>'+
 '<textarea id="oas-description" rows="3" maxlength="700" minlength="30" required placeholder="Le sujet de l’épisode, ce qu’il apporte aux joueurs et les points abordés."></textarea></div>'+
 '<details class="oas-advanced"><summary>Références et URL de l’épisode</summary>'+
 '<div class="oas-field"><label for="oas-sources">Sources officielles — une par ligne</label>'+
 '<textarea id="oas-sources" rows="3" required placeholder="Nom de la source | https://site-officiel.fr/annonce"></textarea>'+
 '<small>Obligatoire : des liens HTTPS réels, pas des exemples fictifs.</small></div>'+
 '<div class="oas-field"><label for="oas-articles">Articles SWAPP liés (facultatif)</label>'+
 '<textarea id="oas-articles" rows="2" placeholder="/actus/titre-de-l-article"></textarea></div>'+
 '<div class="oas-field"><label for="oas-slug">Adresse de l’épisode</label>'+
 '<input id="oas-slug" maxlength="85" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="swapp-on-air-mon-episode" required>'+
 '<small>Générée automatiquement depuis le titre, modifiable si nécessaire.</small></div></details>'+
 '<fieldset class="oas-approval"><legend>Validation avant publication</legend>'+
 '<label><input type="checkbox" id="oas-listened" required> J’ai écouté le fichier complet et approuvé les voix.</label>'+
 '<label><input type="checkbox" id="oas-facts" required> Les informations et sources ont été vérifiées.</label>'+
 '<label><input type="checkbox" id="oas-rights" required> Je confirme disposer des droits sur l’audio.</label></fieldset>'+
 '<div class="oas-bottom"><button type="submit" id="oas-publish">Publier sur SWAPP ON AIR</button>'+
 '<p id="oas-status" role="status" aria-live="polite">Aucun fichier envoyé.</p></div>'+
 '</form></main>';
 return layout({title:'SWAPP ON AIR — Studio de publication',description:'Publication sécurisée de véritables podcasts audio SWAPP',
  content,active:'actus',scripts:'<link rel="stylesheet" href="/assets/swapp-on-air-studio.css?v=20261105-v2">'+
   '<script defer src="/assets/swapp-on-air-studio.js?v=20261105-v2"></script>'});
}
module.exports={page};
