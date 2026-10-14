'use strict';
const {escapeHtml} = require('./article-core');
const js = `(()=>{
 'use strict';
 const byId=id=>document.getElementById(id);
 const feedback=byId('feedback');
 function report(message,ok){feedback.textContent=message;feedback.style.color=ok?'#b5f0d3':'#ffb4bd';}
 function readArticle(){
   const sources=byId('sources').value.split('\\n').map(s=>s.trim()).filter(Boolean).map(url=>({url,label:'Source'}));
   const imageUrl=byId('image').value.trim();
   return {title:byId('title').value,summary:byId('summary').value,body:byId('body').value,
      category:byId('category').value,author:byId('author').value,
      game:byId('game').value,legacyUrl:byId('legacy').value.trim()||null,
      originalPublishedAt:byId('date').value||null,sources,
      image:imageUrl?{url:imageUrl,credit:byId('credit').value,rights:byId('rights').value}:null};
 }
 async function request(path,method,body){
   const res=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-SWAPP-Editor':'1'},body:JSON.stringify(body)});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Requête échouée');return data;
 }
 byId('create').addEventListener('click',async()=>{
   try{const result=await request('/api/editor/actus','POST',readArticle());byId('slug').value=result.slug;report('Brouillon enregistré : '+result.slug,true);}
   catch(e){report(e.message,false);}
 });
 byId('save').addEventListener('click',async()=>{
   const slug=byId('slug').value.trim();if(!slug)return report('Enregistre d’abord un brouillon.',false);
   try{await request('/api/editor/actus/'+encodeURIComponent(slug),'PATCH',readArticle());report('Brouillon mis à jour.',true);}
   catch(e){report(e.message,false);}
 });
 byId('publish').addEventListener('click',async()=>{
   const slug=byId('slug').value.trim();if(!slug)return report('Enregistre d’abord un brouillon.',false);
   if(!confirm('Publier cet article sur SWAPP ? Aucun réseau social externe ne sera contacté.'))return;
   try{const r=await request('/api/editor/actus/'+encodeURIComponent(slug)+'/publish','POST',{});report('Article publié sur SWAPP : /actus/'+r.slug,true);}
   catch(e){report(e.message,false);}
 });
 byId('scanPublic').addEventListener('click',async()=>{
   const btn=byId('scanPublic');btn.disabled=true;
   byId('importReal').disabled=true;
   const articles=[],failures=[];
   try{
     let offset=0,total=0;
     for(let attempt=0;attempt<100;attempt++){
       const r=await request('/api/editor/actus/scan-public','POST',{offset,limit:2});
       total=r.total;
       articles.push(...(r.articles||[]));
       failures.push(...(r.failures||[]));
       report('Lecture JustPlayer : '+r.nextOffset+'/'+total+' pages vérifiées…',true);
       if(r.done)break;
       if(r.nextOffset<=offset)throw new Error('La lecture ne progresse plus.');
       offset=r.nextOffset;
     }
     if(articles.length){byId('importJson').value=JSON.stringify({articles},null,2);}
     report('Scan terminé : '+articles.length+' texte(s) récupéré(s), '+failures.length+' échec(s). Relis les articles ci-dessous, puis clique sur Vérifier l’import.',articles.length>0);
   }catch(e){report('Scan interrompu : '+e.message+' ('+articles.length+' texte(s) récupéré(s))',false);
     if(articles.length)byId('importJson').value=JSON.stringify({articles},null,2);
   }finally{btn.disabled=false;}
 });
 byId('validateImport').addEventListener('click',async()=>{
   try{const payload=JSON.parse(byId('importJson').value);const articles=Array.isArray(payload)?payload:payload.articles;
   const r=await request('/api/editor/actus/import','POST',{articles,dryRun:true,publish:false});
   report('Simulation réussie : '+r.articles.length+' article(s) prêts. Aucun import effectué.',true);
   byId('importReal').disabled=false;}
   catch(e){report(e.message,false);byId('importReal').disabled=true;}
 });
 byId('importJson').addEventListener('input',()=>{byId('importReal').disabled=true;});
 byId('importReal').addEventListener('click',async()=>{
   if(!confirm('Importer les articles JustPlayer en BROUILLONS sans publier ?'))return;
   try{const payload=JSON.parse(byId('importJson').value);const articles=Array.isArray(payload)?payload:payload.articles;
   const r=await request('/api/editor/actus/import','POST',{articles,dryRun:false,publish:false});
   report('Import terminé : '+r.results.map(x=>x.slug+' ('+x.status+')').join(', '),true);byId('importReal').disabled=true;}
   catch(e){report(e.message,false);}
 });
})();`;
function renderStudio(){
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rédaction · SWAPP</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#090c15;color:#f2f2fc;font:16px/1.55 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:36px 20px}a{color:#c4b5fd}h1{letter-spacing:-.05em;font-size:clamp(32px,5vw,50px)}label{display:block;font-weight:700;margin:15px 0 4px}input,textarea{display:block;width:100%;padding:12px;background:#141c2b;border:1px solid #3a4158;color:white;border-radius:10px;font:inherit}textarea{min-height:100px;resize:vertical}#body{min-height:300px}button{background:#7655d3;color:white;border:0;border-radius:11px;padding:13px 18px;font:inherit;font-weight:700;margin:10px 10px 10px 0;cursor:pointer}button[disabled]{opacity:.4;cursor:not-allowed}.columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{border:1px solid #303748;background:#101723;padding:24px;border-radius:18px;margin:22px 0}.hint{color:#b6bfd0}.feedback{padding:15px;background:#1b2332;border-radius:12px;min-height:30px;position:sticky;top:5px}@media(max-width:750px){.columns{grid-template-columns:1fr}main{padding:18px}}
  </style><script src="/actus/studio.js" defer></script></head><body><main><a href="/actus">← Actualités publiques</a><h1>SWAPP · Rédaction</h1><p class="hint">Éditeur pour les comptes administrateurs. La publication sociale est en pause tant que les connecteurs ne sont pas activés.</p><div id="feedback" class="feedback" role="status" aria-live="polite">Prêt.</div>
  <section class="panel"><h2>Rédiger un article</h2><label for="slug">Identifiant (rempli automatiquement après enregistrement)</label><input id="slug" readonly><label for="title">Titre</label><input id="title" maxlength="180" required><label for="summary">Chapô</label><textarea id="summary" maxlength="420"></textarea><label for="body">Article complet (texte, paragraphes séparés par une ligne vide)</label><textarea id="body"></textarea><div class="columns"><div><label for="category">Rubrique</label><input id="category" value="Actualités JV"><label for="game">Jeu concerné</label><input id="game"></div><div><label for="author">Signature</label><input id="author" value="JustPlayer / SWAPP"><label for="sources">Sources : une URL par ligne</label><textarea id="sources"></textarea></div></div><div class="columns"><div><label for="image">URL illustration</label><input id="image"><label for="credit">Crédit visuel</label><input id="credit"></div><div><label for="rights">Licence / autorisation image</label><input id="rights"><label for="legacy">Ancienne URL JustPlayer (facultatif)</label><input id="legacy"></div></div><label for="date">Date d'origine (facultatif)</label><input id="date" type="date"><div><button id="create">Créer le brouillon</button><button id="save">Enregistrer les modifications</button><button id="publish">Publier sur SWAPP</button></div></section>
  <section class="panel"><h2>Migration JustPlayer</h2><p class="hint">Sans export Fourthwall : scanner les pages publiques puis relire les textes récupérés. Les imports sont d'abord simulés puis enregistrés comme brouillons, sans diffusion automatique.</p><button id="scanPublic">Récupérer mes articles JustPlayer</button><label for="importJson">Export des articles (JSON)</label><textarea id="importJson" placeholder='[{"title":"...","body":"...","legacyUrl":"https://justplayer.fr/supporters/posts/12345","sources":[{"url":"https://..."}]}]'></textarea><button id="validateImport">Vérifier l'import</button><button id="importReal" disabled>Importer en brouillons</button></section></main></body></html>`;
}
module.exports={js,renderStudio};