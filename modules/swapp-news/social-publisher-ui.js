'use strict';
const {layout}=require('./site-shell');
const css=[
'.socialpub{max-width:1120px;margin:36px auto 110px;padding:0 22px}',
'.socialpub h1{margin:6px 0 12px;font-size:clamp(30px,5vw,54px);line-height:1.1}',
'.socialpub .lede{max-width:860px;color:#aebbd0}',
'.socialpub .warning{margin:22px 0;padding:16px 20px;background:#30261c;border:1px solid #b27c40;border-radius:15px;color:#ffdfbd}',
'.socialpub .toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:26px 0}',
'.socialpub button{padding:11px 16px;border-radius:11px;background:#283652;border:1px solid #536480;color:white;font-weight:700;cursor:pointer}',
'.socialpub button.primary{background:#6b47c9;border-color:#916df7}',
'.socialpub .item{margin:12px 0;background:#141d30;border:1px solid #36445e;border-radius:19px;padding:19px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}',
'.socialpub .title{font-weight:750;font-size:18px}.socialpub .meta{font-size:13px;color:#b7c3d8;margin:5px 0 12px}',
'.socialpub dialog{width:min(720px,calc(100% - 28px));background:#111a2a;border:1px solid #647693;border-radius:18px;color:#fff;padding:26px;box-shadow:0 14px 65px #000b}',
'.socialpub dialog::backdrop{background:#000b}',
'.socialpub label{display:block;margin:12px 0 6px;color:#c8d5ec}',
'.socialpub input{width:100%;background:#0a1221;color:white;border:1px solid #526480;padding:13px;border-radius:9px}',
'.socialpub .preview{white-space:pre-wrap;padding:13px;border-radius:12px;background:#091224;border:1px solid #30415f;color:#fff;margin:10px 0}',
'.socialpub .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}',
'@media(max-width:730px){.socialpub .item{display:block}}'
].join('\n');
function renderSocialPublisher(){
 const content=[
 '<main class="socialpub"><a href="/actus/studio">← Retour à SWAPP Studio</a>',
 '<p class="eyebrow">SWAPP · Administration</p><h1>Social Publisher.</h1>',
 '<p class="lede">Les nouveaux articles publiés sont automatiquement préparés pour <a href="https://x.com/swappstreaming" rel="noopener noreferrer" target="_blank">𝕏 @swappstreaming</a>, sans intermédiaire payant.</p>',
 '<div class="warning"><strong>Publication sur X : validation manuelle obligatoire.</strong> Le formulaire prérempli est gratuit. Vérifie que tu es connecté au compte @swappstreaming, puis clique sur « Publier » sur X. Aucun message n’est envoyé à ton insu.</div>',
 '<div class="toolbar"><p id="sp-status" role="status">Chargement des publications…</p><button id="sp-refresh" type="button">Actualiser</button></div>',
 '<section id="sp-list" aria-label="Publications préparées"></section>',
 '<dialog id="sp-dialog" aria-label="Préparer une publication X">',
 '<h2 id="sp-heading">Publication X</h2><p class="lede">Relis le texte, puis publie depuis ton compte X.</p>',
 '<p class="preview" id="sp-preview"></p><p id="sp-result" role="status"></p>',
 '<div class="actions"><button type="button" class="primary" id="sp-open">Ouvrir la publication sur X</button><button type="button" id="sp-copy">Copier le texte</button></div>',
 '<label for="sp-url">Après publication, colle ici le lien du post X (facultatif)</label>',
 '<input id="sp-url" type="url" maxlength="250" placeholder="https://x.com/swappstreaming/status/…">',
 '<div class="actions"><button type="button" id="sp-confirm">Enregistrer ce lien</button><button type="button" id="sp-close">Fermer</button></div>',
 '<p class="lede" style="font-size:12px">Ce lien est renseigné par l’éditeur, sans vérification automatique de sa publication sur X.</p>',
 '</dialog></main>'
 ].join('');
 return layout({title:'SWAPP Social Publisher',description:'Préparer les nouveaux articles pour X',content,extraCss:css,scripts:'<script src="/assets/swapp-social-publisher.js" defer></script>'});
}
module.exports={renderSocialPublisher};
