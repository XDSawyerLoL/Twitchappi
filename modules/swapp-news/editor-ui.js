'use strict';
const {layout}=require('./site-shell');

const EDITOR_CSS=`
/* SWAPP Studio: progressive disclosure instead of a wall of controls. */
.editor-advanced{margin:16px 0;border:1px solid #ffffff22;border-radius:17px;background:#101a29;overflow:hidden}
.editor-advanced>summary{list-style:none;cursor:pointer;padding:19px 22px;font-size:15px;font-weight:800;color:#e7edf8;display:flex;align-items:center;justify-content:space-between;gap:16px}
.editor-advanced>summary::-webkit-details-marker{display:none}
.editor-advanced>summary::after{content:'+';font-size:23px;color:#bdcce4;font-weight:400}
.editor-advanced[open]>summary::after{content:'−'}
.editor-advanced[open]>summary{border-bottom:1px solid #ffffff22}
.editor-advanced-body,.editor-seo>.editor-metadata{padding:17px 22px 20px}
.editor-seo>.editor-metadata{margin:0;border:0}
.editor-illustrations,.editor-commerce{padding:0;margin:15px 0}
.editor-advanced h3{font-size:18px;margin:0 0 12px}
.editor-publishing{border-color:#8d66ad5c;margin-top:22px}
.editor-publishing h3{font-size:21px;margin:0 0 7px}
.editor-publishing .editor-actions{align-items:center;margin-top:15px}
.editor-publishing #ed-publish{padding:13px 21px}
.editor-video-primary{border-left:3px solid #b66ad2;padding-left:15px;margin:19px 0 23px}
.editor-video-primary h3{font-size:17px;margin:0 0 7px}
.editor-video-primary>.editor-note{margin-top:5px}
.editor-sources-primary{margin:19px 0}
.editor-video-primary[hidden],.editor-sources-primary[hidden]{display:none!important}
@media(max-width:760px){.editor-advanced>summary{padding:16px}.editor-advanced-body,.editor-seo>.editor-metadata{padding:15px}.editor-publishing .editor-actions button{flex:1 1 180px}}

.editor-metadata{margin:23px 0;padding:19px 0;border-top:1px solid #ffffff20;border-bottom:1px solid #ffffff15}.editor-metadata h3{font-size:20px;letter-spacing:-.035em;margin:0 0 10px}.editor-metadata #ed-detection:not(:empty){margin:12px 0;color:#b4e6ce}.editor-metadata .editor-two{margin-top:5px}
.editor-shell{width:min(1510px,calc(100% - 44px));margin:34px auto 70px;display:grid;grid-template-columns:245px minmax(0,1fr);gap:23px}.editor-side{align-self:start;position:sticky;top:102px;display:grid;gap:7px;padding:18px;background:#121b2cee;border:1px solid #36435f;border-radius:22px}.editor-side a{font-size:13px;color:#9fb4ca;margin-bottom:19px}.editor-side button{display:block;border:0;text-align:left;color:#d3dcea;background:transparent;padding:14px 15px;border-radius:12px;font-weight:800;cursor:pointer}.editor-side button.active,.editor-side button:hover{background:#db62ed2a;color:#fff}.editor-content{min-width:0}.editor-heading{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap}.editor-heading h1{font-size:clamp(32px,4vw,49px);line-height:1.1;letter-spacing:-.06em;margin:4px 0}.editor-heading p{color:#a5b4ca;margin:0}.panel{background:#121b2a;border:1px solid #35415c;border-radius:22px;padding:25px;margin-bottom:20px}.panel h2{margin:0 0 9px;font-size:24px;letter-spacing:-.04em}.editor-actions{display:flex;gap:9px;flex-wrap:wrap}.editor-button{border:1px solid #ffffff26;border-radius:11px;background:#25324a;color:#fff;padding:11px 15px;font-weight:800;cursor:pointer}.editor-button.primary{border:0;background:linear-gradient(110deg,#d556ef,#ad48de)}.editor-button.neutral{background:#17243a}.editor-button.warning{background:#4a2b42;border-color:#9d5276}.editor-button:disabled{opacity:.35;cursor:not-allowed}.editor-view{display:none}.editor-view.active{display:block}.field{display:block;margin:15px 0;font-size:13px;font-weight:800;color:#e3e8f7}.field span{display:block;margin-bottom:6px}.field input,.field textarea,.field select,.editor-search{width:100%;border-radius:12px;background:#0e1727;border:1px solid #475470;color:#fff;padding:13px 15px;outline:none}.field input:focus,.field textarea:focus,.field select:focus{border-color:#65d8e4}.field textarea{min-height:95px;resize:vertical}.field textarea.long{min-height:340px;line-height:1.7}.editor-two{display:grid;grid-template-columns:1fr 1fr;gap:15px}.editor-article-table{width:100%;border-collapse:collapse}.editor-article-table td,.editor-article-table th{border-bottom:1px solid #364057;padding:13px 10px;text-align:left;font-size:13px}.editor-article-table th{color:#9aa9bb}.editor-article-table button{border:0;background:none;color:#9be7ef;text-align:left;cursor:pointer;font-weight:800;font-size:14px;padding:0}.editor-article-table small{display:block;color:#9eafc5;font-size:11px;margin-top:4px}.status-chip{display:inline-block;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;background:#42506b;color:#dbe6fb}.status-chip.published{background:#194f49;color:#92f1d1}.status-chip.draft{background:#583b68;color:#f5c4ff}.editor-note{color:#aabacf;font-size:13px}.editor-feedback{position:sticky;top:75px;z-index:12;background:#152843;color:#b8ecf4;border:1px solid #38628a;border-radius:12px;padding:12px 15px;margin-bottom:18px;display:none}.editor-feedback.error{border-color:#aa5b75;color:#ffd0dd;background:#3d2235}.image-preview{width:100%;height:190px;border:1px dashed #66789a;border-radius:14px;object-fit:cover;background:#1e2940;display:none}.editor-import-card{display:flex;gap:12px;align-items:flex-start;border:1px solid #36455f;border-radius:14px;padding:14px;margin:10px 0;background:#152138}.editor-import-card input{margin-top:6px;accent-color:#d45beb}.editor-import-card div{min-width:0;flex:1}.editor-import-card b{display:block;overflow-wrap:anywhere}.editor-import-card small{color:#9eadc5}.editor-import-card button{white-space:nowrap}.editor-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.metric{background:#152238;border:1px solid #36455f;border-radius:14px;padding:18px}.metric strong{display:block;font-size:28px}.metric span{font-size:12px;color:#acbcd0}
.editor-media-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0 20px;font-size:13px;color:#adbcd0}
.editor-media-controls select{background:#152138;color:#f3f5fc;border:1px solid #53617c;border-radius:10px;padding:9px}
.editor-media-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.editor-media-card{min-width:0;border-radius:15px;overflow:hidden;border:1px solid #ffffff25;background:#101c2b}
.editor-media-cover{display:grid;place-items:center;width:100%;aspect-ratio:16/9;background:#1d2741;border:0;padding:0;color:#bdc7dd;cursor:pointer}
.editor-media-cover img{width:100%;height:100%;object-fit:cover}
.editor-media-copy{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:15px}
.editor-media-copy small{font-size:11px;color:#a9add5}
.editor-media-copy strong{font-size:15px;color:#f9f9ff;line-height:1.4;overflow-wrap:anywhere}
.editor-media-copy p{font-size:12px;color:#a6b3c7;margin:0}
.editor-media-copy a{color:#decaff;font-size:12px;text-decoration:none;margin-top:2px}
@media(max-width:1150px){.editor-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.editor-media-grid{grid-template-columns:1fr}}
#ed-preview{white-space:pre-wrap;overflow-wrap:anywhere;background:#0c1422;padding:19px;border-radius:14px;min-height:120px;color:#dce8f7}@media(max-width:850px){.editor-shell{grid-template-columns:1fr}.editor-side{position:static;display:flex;flex-wrap:wrap}.editor-side a{display:none}.editor-two,.editor-metrics{grid-template-columns:1fr}.editor-shell{width:calc(100% - 24px);margin-top:15px}.panel{padding:17px}.editor-article-table td:nth-child(2),.editor-article-table th:nth-child(2){display:none}}
`;

const js=`(()=>{
'use strict';
const $=id=>document.getElementById(id);
const state={articles:[],imported:[],failures:[],legacyPending:[],selected:null};
const fields=['contentType','title','summary','body','category','game','games','tags','seoTitle','seoDescription','author','image','credit','rights','legacy','date'];
const status=value=>value==='published'?'En ligne':'Brouillon';
const notify=(message,error)=>{const el=$('ed-feedback');el.textContent=message;el.className='editor-feedback'+(error?' error':'');el.style.display='block';el.scrollIntoView({block:'nearest',behavior:'smooth'});};
async function call(url,method='GET',body){
 const opts={method,credentials:'same-origin',headers:{'X-SWAPP-Editor':'1'}};
 if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
 const response=await fetch(url,opts);let data;
 try{data=await response.json();}catch(_){throw Error('Réponse serveur non interprétable ('+response.status+')');}
 if(!response.ok)throw Error(data.error||'Erreur HTTP '+response.status);
 return data;
}
function view(name){document.querySelectorAll('.editor-view').forEach(x=>x.classList.toggle('active',x.dataset.view===name));document.querySelectorAll('[data-go]').forEach(x=>{x.classList.toggle('active',x.dataset.go===name);});if(name==='import')refreshLegacy().catch(e=>notify(e.message,true));}
function text(id,value=''){$(id).value=String(value??'');}
function articleData(){return {contentType:$('contentType').value,title:$('title').value,summary:$('summary').value,body:$('body').value,category:$('category').value,game:$('game').value,games:$('games').value.split(',').map(x=>x.trim()).filter(Boolean),tags:$('tags').value.split(',').map(x=>x.trim()).filter(Boolean),seo:{title:$('seoTitle').value,description:$('seoDescription').value},author:$('author').value,legacyUrl:$('legacy').value.trim()||null,originalPublishedAt:$('date').value||null,sources:$('sources').value.split('\\n').map(u=>u.trim()).filter(Boolean).map(url=>({url,label:'Source'})),image:$('image').value.trim()?{url:$('image').value.trim(),credit:$('credit').value,rights:$('rights').value}:null,trailerUrl:$('trailerUrl').value.trim()||null,commercialLinks:[1,2].map(i=>({title:$('affTitle'+i).value.trim(),merchant:$('affMerchant'+i).value.trim(),url:$('affUrl'+i).value.trim(),kind:$('affKind'+i).value})).filter(x=>x.title||x.merchant||x.url)};}
function setEditor(a){
 state.selected=a?.slug||null;const image=a?.image||{};
 for(const [id,v] of Object.entries({contentType:a?.contentType||'article',title:a?.title,summary:a?.summary,body:a?.body,category:a?.category||'Actualités JV',game:a?.game,games:a?.games?.join(', '),tags:a?.tags?.join(', '),seoTitle:a?.seo?.title,seoDescription:a?.seo?.description,author:a?.author||'Rédaction SWAPP',sources:(a?.sources||[]).map(x=>x.url).join('\\n'),image:image.url,credit:image.credit,rights:image.rights,legacy:a?.legacyUrl,date:a?.originalPublishedAt?.slice(0,10),trailerUrl:a?.trailerUrl,affTitle1:a?.commercialLinks?.[0]?.title,affUrl1:a?.commercialLinks?.[0]?.url,affMerchant1:a?.commercialLinks?.[0]?.merchant,affKind1:a?.commercialLinks?.[0]?.kind||'affiliate',affTitle2:a?.commercialLinks?.[1]?.title,affUrl2:a?.commercialLinks?.[1]?.url,affMerchant2:a?.commercialLinks?.[1]?.merchant,affKind2:a?.commercialLinks?.[1]?.kind||'affiliate'}))text(id,v);
 $('edit-head').textContent=a?'Modifier : '+a.title:'Nouvelle publication';
 $('edit-status').textContent=a?status(a.status):'Non enregistré';
 $('ed-create').disabled=!!a?.slug;
 $('ed-save').disabled=!a?.slug;
 $('ed-publish').disabled=a?.status==='published';
 $('ed-publish').textContent=a?.status==='published'?'Déjà en ligne':'Publier sur SWAPP';
 $('ed-publish-hint').textContent=a?.status==='published'
  ?'Cette publication est en ligne. Modifie-la puis clique sur Enregistrer les modifications.'
  :a?.slug?'Brouillon prêt : Publier vérifie et enregistre tes dernières modifications.'
   :'Tu peux publier directement : SWAPP crée automatiquement le brouillon avant publication.';
 $('ed-unpublish').disabled=!a||a.status!=='published';
 $('ed-view').style.display=a?.status==='published'?'inline-flex':'none';
 $('ed-view').href=a?'/actus/'+encodeURIComponent(a.slug):'#';
 $('ed-view').dataset.editorSlug=a?.slug||'new';
 previewImage();view('edit');
 window.dispatchEvent(new CustomEvent('swapp:studio:loaded',{detail:{slug:a?.slug||'new',status:a?.status||'new'}}));
}
function previewImage(){let val=$('image').value.trim(),el=$('image-preview');if(/^https?:\\/\\//i.test(val)){el.src=val;el.style.display='block';}else{el.style.display='none';el.removeAttribute('src');}}
function populateList(){const list=$('ed-list');list.replaceChildren();const q=$('ed-search').value.toLocaleLowerCase('fr');const shown=state.articles.filter(a=>(a.title+' '+(a.game||'')).toLocaleLowerCase('fr').includes(q));
 for(const a of shown){const tr=document.createElement('tr'),title=document.createElement('td'),button=document.createElement('button'),info=document.createElement('small'),s=document.createElement('td'),date=document.createElement('td'),chip=document.createElement('span');button.textContent=a.title;button.addEventListener('click',()=>setEditor(a));info.textContent=(a.game||a.category||'')+' · '+a.slug;title.append(button,info);chip.className='status-chip '+a.status;chip.textContent=status(a.status);s.appendChild(chip);date.textContent=(a.updatedAt||'').slice(0,10);tr.append(title,s,date);list.append(tr);}
 if(!shown.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='Aucun article. Crée ta première publication.';tr.append(td);list.append(tr);}
 populateMedia();
 $('ed-count').textContent=String(state.articles.length);$('ed-published').textContent=String(state.articles.filter(x=>x.status==='published').length);$('ed-drafts').textContent=String(state.articles.filter(x=>x.status!=='published').length);
}
async function prepareStudioSmokeVideo(){
 // This pre-fills the Studio only. Never creates content or publishes without
 // an explicitly authorized editor clicking Create and then Publish.
 setEditor(null);
 const sample={
  contentType:'trailer',
  title:'CODE VEIN II — bande-annonce officielle (vérification SWAPP)',
  summary:'Bande-annonce Story Trailer de CODE VEIN II — source Bandai Namco Entertainment.',
  body:'Vérification de la lecture vidéo dans SWAPP avec la bande-annonce officielle Story Trailer de CODE VEIN II, publiée par Bandai Namco Entertainment. Cette publication sert à valider le lecteur et le parcours éditorial.',
  category:'Actualités JV',
  game:'CODE VEIN II',
  games:'CODE VEIN II',
  tags:'code vein ii, bande-annonce, jeu vidéo, gaming',
  seoTitle:'CODE VEIN II : bande-annonce officielle',
  seoDescription:'Regarder la bande-annonce Story Trailer de CODE VEIN II sur SWAPP.',
  author:'Sansahd',
  sources:'https://www.youtube.com/watch?v=Z9SaRLSibak',
  trailerUrl:'https://www.youtube.com/watch?v=Z9SaRLSibak'
 };
 for(const [id,value] of Object.entries(sample))if($(id))$(id).value=value;
 $('title').dispatchEvent(new Event('input',{bubbles:true}));
 view('edit');
 notify('Vidéo de vérification préparée, sans publication. Contrôle le contenu avant de créer le brouillon.');
}
function editorVideoId(raw){
 try{
  const url=new URL(String(raw||''));
  if(url.protocol!=='https:')return null;
  const host=url.hostname.toLowerCase();
  let value='';
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
   if(url.pathname==='/watch')value=url.searchParams.get('v')||'';
   else if(url.pathname.startsWith('/embed/')||url.pathname.startsWith('/shorts/'))value=url.pathname.split('/')[2];
  }else if(host==='youtu.be')value=url.pathname.slice(1);
  return /^[A-Za-z0-9_-]{11}$/.test(value)?value:null;
 }catch{return null}
}
function populateMedia(){
 const grid=$('ed-media-grid');
 if(!grid)return;
 grid.replaceChildren();
 const mode=$('ed-media-status').value;
 const videos=state.articles.filter(item=>
  ['video','trailer'].includes(item.contentType)&&
  (mode==='all'||item.status===mode));
 $('ed-media-count').textContent=videos.length+' vidéo(s)';
 for(const item of videos){
  const card=document.createElement('article');card.className='editor-media-card';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='editor-media-cover';
  const id=editorVideoId(item.trailerUrl);
  let src=item.image?.url;
  if(!src&&id)src='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
  if(typeof src==='string'&&src.startsWith('https://')){
   const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';
   img.referrerPolicy='no-referrer';trigger.append(img);
  }else{const placeholder=document.createElement('span');placeholder.textContent='Vidéo SWAPP';trigger.append(placeholder)}
  trigger.addEventListener('click',()=>setEditor(item));
  const copy=document.createElement('div');copy.className='editor-media-copy';
  const label=document.createElement('small');
  label.textContent=(item.contentType==='trailer'?'Bande-annonce':'Vidéo')+' · '+status(item.status);
  const heading=document.createElement('strong');heading.textContent=item.title;
  const game=document.createElement('p');game.textContent=item.game||'Aucun jeu associé';
  const edit=document.createElement('button');edit.type='button';edit.className='editor-button neutral';
  edit.textContent='Modifier';edit.addEventListener('click',()=>setEditor(item));
  copy.append(label,heading,game,edit);
  if(item.status==='published'){
   const watch=document.createElement('a');watch.href='/actus/'+encodeURIComponent(item.slug);
   watch.textContent='Voir en ligne ↗';watch.target='_blank';watch.rel='noopener noreferrer';
   copy.append(watch);
  }
  card.append(trigger,copy);grid.append(card);
 }
 if(!videos.length){
  const info=document.createElement('p');info.className='editor-note';
  info.textContent='Aucune vidéo dans cette sélection. Crée un brouillon vidéo dans le Studio.';
  grid.append(info);
 }
}

async function refresh(){const data=await call('/api/editor/actus');state.articles=data.articles||[];populateList();}
async function refreshLegacy(){
 const results=$('ed-legacy-results');
 if(!results)return;
 results.textContent='Vérification des archives éditoriales…';
 const data=await call('/api/editor/actus/legacy-status');
 state.legacyPending=data.pending||[];
 const summary=$('ed-legacy-progress');
 summary.textContent=data.native+' repris, dont '+(data.nativePublished||0)+' publiés dans SWAPP / '+data.verified+' textes vérifiés · '+data.known+' publications publiques connues · '+(data.unavailable?.length||0)+' indisponibles';
 results.replaceChildren();
 if(!state.legacyPending.length){
  const note=document.createElement('p');note.className='editor-note';
  note.textContent='Aucun texte public vérifié en attente de copie. La fermeture reste conditionnée à la publication des brouillons, à la vérification des médias et à un inventaire complet du compte d’origine.';
  results.append(note);return;
 }
 for(const item of state.legacyPending){
  const row=document.createElement('div');row.className='editor-import-card';
  const info=document.createElement('div'),name=document.createElement('b'),note=document.createElement('small');
  name.textContent=item.title;note.textContent='À enregistrer dans SWAPP · '+(item.publishedAt||'');
  info.append(name,note);
  const button=document.createElement('button');button.type='button';button.className='editor-button neutral';
  button.textContent='Rendre modifiable';
  button.onclick=()=>action(async()=>{
   if(!confirm('Copier ce texte vérifié dans SWAPP comme brouillon éditable ? La publication actuelle restera visible.'))return;
   button.disabled=true;
   try{
    const result=await call('/api/editor/actus/adopt','POST',{slug:item.slug});
    await refresh();
    await refreshLegacy();
    const created=state.articles.find(x=>x.slug===result.slug);
    if(created)setEditor(created);
    notify('Copie SWAPP créée : relis les sources et les droits du visuel, puis publie la version définitive.');
   }finally{button.disabled=false}
  });
  row.append(info,button);results.append(row);
 }
}

async function action(fn){try{await fn();}catch(error){notify(error.message,true);}}
async function saveNew(){await action(async()=>{let r=await call('/api/editor/actus','POST',articleData());notify('Brouillon créé. Il apparaît désormais dans tes articles.');await refresh();const a=state.articles.find(x=>x.slug===r.slug);setEditor(a||{...articleData(),slug:r.slug,status:'draft'});window.dispatchEvent(new CustomEvent('swapp:studio:saved',{detail:{slug:r.slug,fromNew:true}}));});}
async function saveCurrent(){if(!state.selected)return;await action(async()=>{const r=await call('/api/editor/actus/'+encodeURIComponent(state.selected),'PATCH',articleData());await refresh();let a=state.articles.find(x=>x.slug===state.selected);setEditor(a);window.dispatchEvent(new CustomEvent('swapp:studio:saved',{detail:{slug:state.selected}}));notify('Modifications enregistrées (révision '+r.revision+').');});}
async function publish(){
 if(state.articles.some(a=>a.slug===state.selected&&a.status==='published')){
  notify('Cette publication est déjà en ligne : utilise Enregistrer pour la modifier.',true);return;
 }
 await action(async()=>{
  const draft=articleData();
  // Exact same validation as the server publish transaction, with no writes.
  await call('/api/editor/actus/validate','POST',draft);
  if(!confirm('Publier cette publication sur SWAPP ? Elle sera immédiatement visible par tous.'))return;
  // One-click first publication: create a draft before committing to public.
  let slug=state.selected,created=false;
  if(!slug){
   const result=await call('/api/editor/actus','POST',draft);
   slug=result.slug;
   state.selected=slug;created=true;
  }else{
   await call('/api/editor/actus/'+encodeURIComponent(slug),'PATCH',draft);
  }
  // A failed publication keeps the saved draft; retry does not recreate it.
  await call('/api/editor/actus/'+encodeURIComponent(slug)+'/publish','POST',{});
  await refresh();
  const updated=state.articles.find(x=>x.slug===slug);
  if(updated)setEditor(updated);
  window.dispatchEvent(new CustomEvent('swapp:studio:saved',{detail:{slug,fromNew:created}}));
  notify('Publication en ligne : /actus/'+slug);
 });
}
async function unpublish(){if(!state.selected||!confirm('Retirer cet article du site public et le remettre en brouillon ?'))return;await action(async()=>{let slug=state.selected;await call('/api/editor/actus/'+encodeURIComponent(slug)+'/unpublish','POST',{});await refresh();setEditor(state.articles.find(x=>x.slug===slug));notify('Article retiré du site public, conservé en brouillon.');});}
function showScan(){const area=$('scan-items');area.replaceChildren();for(const a of state.imported){const row=document.createElement('div'),box=document.createElement('input'),desc=document.createElement('div'),title=document.createElement('b'),small=document.createElement('small'),review=document.createElement('button');row.className='editor-import-card';box.type='checkbox';box.checked=true;box.dataset.slug=a.title;title.textContent=a.title;small.textContent=(a.legacyUrl||'')+' · '+a.body.length+' caractères';desc.append(title,small);review.type='button';review.className='editor-button neutral';review.textContent='Relire';review.addEventListener('click',()=>setEditor({...a,status:'draft'}));row.append(box,desc,review);area.append(row);} $('scan-result').textContent=state.imported.length+' publication(s) récupérée(s) · '+state.failures.length+' échec(s). Les textes doivent être relus avant validation.';$('ed-import').disabled=!state.imported.length;}
async function scan(){await action(async()=>{const btn=$('ed-scan');btn.disabled=true;state.imported=[];state.failures=[];try{let offset=0;for(let i=0;i<100;i++){let batch=await call('/api/editor/actus/scan-public','POST',{offset,limit:2});state.imported.push(...(batch.articles||[]));state.failures.push(...(batch.failures||[]));$('scan-result').textContent='Recherche : '+batch.nextOffset+'/'+batch.total+' pages vérifiées';if(batch.done)break;if(batch.nextOffset<=offset)throw Error('Le scan ne progresse plus');offset=batch.nextOffset;}showScan();}finally{btn.disabled=false;}});}
async function importSelected(){await action(async()=>{const checked=[...document.querySelectorAll('#scan-items input:checked')];const selected=checked.map(x=>state.imported.find(a=>a.title===x.dataset.slug)).filter(Boolean).map(a=>({...a,author:/just\\s*player/i.test(a.author||'')?'Rédaction SWAPP':(a.author||'Rédaction SWAPP'),category:/just\\s*player/i.test(a.category||'')?'Actualités JV':(a.category||'Actualités JV')}));if(!selected.length)throw Error('Sélectionne au moins un article');if(!confirm('Importer '+selected.length+' publication(s) historiques comme BROUILLONS SWAPP ? Tu pourras les relire et les publier séparément.'))return;const batches=[];for(let i=0;i<selected.length;i+=20)batches.push(selected.slice(i,i+20));let created=0,skipped=0,failed=0;for(const batch of batches){await call('/api/editor/actus/import','POST',{articles:batch,dryRun:true,publish:false});const r=await call('/api/editor/actus/import','POST',{articles:batch,dryRun:false,publish:false});for(const x of r.results||[]){if(x.status==='draft')created++;else if(x.status==='skipped_existing')skipped++;else failed++;}}await refresh();view('list');notify(created+' brouillon(s) importé(s), '+skipped+' doublon(s), '+failed+' échec(s). Aucun article publié automatiquement.',failed>0);});}
function init(){document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>{const v=el.dataset.go;if(v==='edit')setEditor(null);else view(v);}));$('ed-search').addEventListener('input',populateList);$('ed-media-status').addEventListener('change',populateMedia);$('ed-media-new').addEventListener('click',()=>{setEditor(null);$('contentType').value='video';$('contentType').dispatchEvent(new Event('change',{bubbles:true}));});$('ed-media-smoketest').addEventListener('click',prepareStudioSmokeVideo);$('ed-new').addEventListener('click',()=>setEditor(null));$('ed-create').addEventListener('click',saveNew);$('ed-save').addEventListener('click',saveCurrent);$('ed-publish').addEventListener('click',publish);$('ed-unpublish').addEventListener('click',unpublish);$('image').addEventListener('input',previewImage);$('ed-preview-button').addEventListener('click',()=>{const a=articleData();$('ed-preview').textContent=a.title+'\\n\\n'+a.summary+'\\n\\n'+a.body;});$('ed-scan').addEventListener('click',scan);$('ed-import').addEventListener('click',importSelected);refresh().catch(e=>notify('Connexion à la rédaction impossible : '+e.message,true));}

// Conservative local game extraction: no third-party service receives draft text.
$('ed-detect-games').addEventListener('click',async()=>{
 try{
  const result=await call('/api/editor/actus/suggest','POST',{
   title:$('title').value,summary:$('summary').value,body:$('body').value,
   game:$('game').value,tags:$('tags').value.split(',').filter(Boolean)
  });
  const suggestion=result.suggestion||{};
  $('ed-detection').textContent=suggestion.games?.length
   ?'Jeux reconnus : '+suggestion.games.join(' · ')
   :'Aucun jeu reconnu avec suffisamment de certitude. Indique-le manuellement.';
  if(!$('game').value&&suggestion.primaryGame)$('game').value=suggestion.primaryGame;
  const existing=$('games').value.split(',').map(x=>x.trim()).filter(Boolean);
  $('games').value=[...new Set([...existing,...(suggestion.games||[])])].join(', ');
  const tags=$('tags').value.split(',').map(x=>x.trim()).filter(Boolean);
  $('tags').value=[...new Set([...tags,...(suggestion.tags||[])])].slice(0,12).join(', ');
  if(!$('seoTitle').value)$('seoTitle').value=$('title').value.slice(0,70);
  if(!$('seoDescription').value)$('seoDescription').value=$('summary').value.slice(0,160);
 }catch(error){notify('Détection indisponible : '+error.message,true)}
});

document.addEventListener('DOMContentLoaded',init);
})();`;

function renderStudio(){
const content=`<main class="editor-shell"><aside class="editor-side"><a href="/actus">← Retour au magazine</a><button class="active" data-go="list">▤ Toutes les publications</button><button data-go="edit">＋ Nouvelle publication</button><button data-go="media">▶ Médiathèque</button><button data-go="insights">★ Retours lecteurs</button><button data-go="import">⇩ Finaliser la reprise</button><a class="editor-shop-link" href="/boutique/admin">◈ Gestion Boutique · Produits</a></aside><div class="editor-content"><div class="editor-heading"><div><span class="eyebrow">SWAPP · Administration</span><h1>SWAPP Studio.</h1><p>Écris, ajoute une vidéo et publie. Les autres réglages restent disponibles si tu en as besoin.</p></div><div class="editor-heading-links"><button type="button" id="ed-studio-diagnose" class="editor-button neutral">Tester les services SWAPP</button><a class="button-link" href="/actus" target="_blank" rel="noopener noreferrer">Voir le magazine ↗</a></div></div><div id="ed-feedback" class="editor-feedback" role="status" aria-live="polite"></div><div id="ed-studio-diagnostics" class="editor-studio-diagnostics" hidden role="status" aria-live="polite"></div>
<section class="editor-view active" data-view="list"><div class="editor-metrics"><div class="metric"><strong id="ed-count">—</strong><span>Publications</span></div><div class="metric"><strong id="ed-published">—</strong><span>En ligne</span></div><div class="metric"><strong id="ed-drafts">—</strong><span>Brouillons</span></div></div><div class="panel"><div class="section-title"><div><h2>Toutes les publications</h2><p>Choisis un article pour le modifier, y compris après publication.</p></div><button id="ed-new" class="editor-button primary">+ Nouvelle publication</button></div><input id="ed-search" class="editor-search" type="search" placeholder="Rechercher par titre ou jeu…" aria-label="Rechercher dans les articles"><table class="editor-article-table"><thead><tr><th>Publication</th><th>État</th><th>Modifié</th></tr></thead><tbody id="ed-list"></tbody></table></div></section>
<section class="editor-view" data-view="insights"><div class="panel"><div class="section-title"><div><h2>Retours des lecteurs</h2><p>Comprendre quels articles plaisent et pourquoi, sans identifier les lecteurs.</p></div><button id="ed-insight-refresh" type="button" class="editor-button neutral">Actualiser</button></div><div class="swapp-insight-metrics"><div class="swapp-insight-metric"><strong id="ed-insight-votes">—</strong><span>Votes reçus</span></div><div class="swapp-insight-metric"><strong id="ed-insight-articles">—</strong><span>Articles notés / articles publiés</span></div><div class="swapp-insight-metric"><strong id="ed-insight-average">—</strong><span>Moyenne pondérée des notes</span></div></div><h3>Qualités les plus citées</h3><div class="swapp-insight-reasons" id="ed-insight-reasons"></div><p id="ed-insight-status" role="status" aria-live="polite">Ouvre cet onglet pour charger les retours.</p><div class="swapp-insight-scroll"><table class="swapp-insight-table"><thead><tr><th>Article</th><th>Votes</th><th>Moyenne</th><th>Qualité dominante</th></tr></thead><tbody id="ed-insight-table"></tbody></table></div><p class="editor-note">Uniquement les articles publiés dans SWAPP Studio. Pas de noms, d’identifiants ou de suivi individuel ; les publications JustPlayer non migrées ne figurent pas encore dans cette analyse.</p></div></section>\n<section class="editor-view" data-view="media"><div class="panel"><div class="section-title">
<div><h2>Bibliothèque vidéo</h2><p>Retrouve tes vidéos et trailers SWAPP, leurs miniatures et leur statut. Clique pour reprendre l'édition.</p></div>
<button class="editor-button primary" id="ed-media-new" type="button">+ Nouvelle vidéo</button><button class="editor-button neutral" id="ed-media-smoketest" type="button">Préparer la vidéo de vérification</button></div>
<div class="editor-media-controls"><label for="ed-media-status">Afficher</label>
<select id="ed-media-status"><option value="all">Toutes les vidéos</option><option value="published">Publiées</option><option value="draft">Brouillons</option></select>
<span id="ed-media-count" role="status"></span></div>
<div id="ed-media-grid" class="editor-media-grid"><p class="editor-note">Chargement des vidéos enregistrées…</p></div>
<p class="editor-note">Les fichiers MP4 ne sont pas encore hébergés par SWAPP. Cette bibliothèque gère les vidéos intégrées par URL officielle, sans simuler un téléversement.</p></div></section>
<section class="editor-view" data-view="edit"><div class="panel"><div class="editor-heading"><div><h2 id="edit-head">Nouvelle publication</h2><span class="status-chip" id="edit-status">Non enregistré</span></div><div class="editor-actions"><a id="ed-view" class="editor-button neutral" href="#" target="_blank" rel="noopener noreferrer" style="display:none">Voir l’article ↗</a></div></div><label class="field"><span>Type de publication</span><select id="contentType"><option value="article">Article</option><option value="post">Post</option><option value="trailer">Trailer / bande-annonce</option><option value="video">Vidéo</option></select></label><label class="field"><span>Titre de la publication</span><input id="title" maxlength="180" placeholder="Un titre qui donne envie de lire"></label><label class="field"><span>Résumé (facultatif)</span><textarea id="summary" maxlength="420" rows="2" placeholder="L’essentiel en quelques phrases"></textarea></label><div class="editor-video-primary" id="ed-video-field"><h3>Bande-annonce vidéo</h3><p class="editor-note">Ajoute une URL YouTube officielle ou d’une vidéo que tu es autorisé à diffuser. Le lien est obligatoire pour publier une vidéo ou un trailer. La vidéo ne se charge qu’au clic du visiteur.</p><label class="field"><span>URL de la vidéo / du trailer YouTube</span><input type="url" id="trailerUrl" placeholder="https://www.youtube.com/watch?v=…"></label></div><label class="field"><span>Jeu ou sujet</span><input id="game" placeholder="Ex. 007 First Light"></label><details class="editor-advanced editor-seo"><summary>Référencement SEO et détection des jeux (facultatif)</summary><div class="editor-metadata"><label class="field"><span>Rubrique</span><select id="category"><option>Actualités JV</option><option>Analyse</option><option>Tests</option><option>Guides</option><option>Esport</option><option>Streaming</option><option>Culture</option></select></label><h3>Jeux et référencement</h3><p class="editor-note">Détection locale à partir du titre et du texte : suggestions contrôlables avant publication, sans transmettre tes brouillons à un prestataire externe.</p><div class="editor-actions"><button type="button" class="editor-button neutral" id="ed-detect-games">Détecter les jeux et suggérer des tags</button></div><p class="editor-note" id="ed-detection" role="status" aria-live="polite"></p><div class="editor-two"><label class="field"><span>Jeux associés (séparés par une virgule)</span><input id="games" placeholder="BioShock, GTA VI"></label><label class="field"><span>Tags SEO (12 maximum)</span><input id="tags" placeholder="jeu vidéo, trailer, actualités"></label></div><label class="field"><span>Titre SEO (70 caractères)</span><input id="seoTitle" maxlength="70" placeholder="Titre dans Google"></label><label class="field"><span>Méta-description (160 caractères)</span><textarea id="seoDescription" maxlength="160" rows="2"></textarea></label></div></details><label class="field"><span>Contenu / description</span><textarea class="long" id="body" placeholder="Rédige ton article…\n\n## Intertitre\n\nUn paragraphe développé.\n\n- Un point important\n- Un autre point"></textarea></label><p class="editor-note">Mise en forme : ## sous-titre, **gras**, *italique*, - liste, &gt; citation. Le HTML brut est neutralisé pour protéger le site.</p><div class="editor-sources-primary" id="ed-source-field"><label class="field"><span>Sources fiables (une URL par ligne)</span><textarea id="sources" rows="3" placeholder="https://…"></textarea></label><p class="editor-note">Ajoute au moins une source fiable pour publier un article ou un post.</p></div><div class="editor-actions"><button class="editor-button neutral" id="ed-preview-button">Prévisualisation complète</button><button type="button" class="editor-button neutral" id="ed-studio-check">Vérifier avant publication</button><span id="ed-studio-check-status" role="status" aria-live="polite"></span></div><div id="ed-preview" aria-label="Aperçu de l’article"></div><div class="editor-studio-live" id="ed-studio-live" aria-live="off"><div class="editor-studio-seo"><span>APERÇU SUR LES MOTEURS DE RECHERCHE</span><strong id="ed-live-title">Titre de publication</strong><p id="ed-live-description">La méta-description apparaîtra ici.</p><small id="ed-live-lengths"></small></div><div id="ed-live-video" class="editor-studio-video"></div></div><div class="editor-studio-recovery"><span id="ed-studio-draft-state" aria-live="polite">Saisie locale non conservée.</span><button type="button" id="ed-studio-recover" class="editor-button neutral" hidden>Restaurer la saisie</button></div></div>
<details class="panel editor-advanced editor-illustrations"><summary>Illustration, auteur et options avancées</summary><div class="editor-advanced-body"><h3>Illustration et informations complémentaires</h3><p class="editor-note">Ajoute l’URL d’une image que tu possèdes ou peux publier, puis précise son crédit et ses droits.</p><label class="field"><span>URL de l’image principale</span><input id="image" type="url" placeholder="https://…"></label><img id="image-preview" class="image-preview" alt="Prévisualisation de la couverture"><div class="editor-two"><label class="field"><span>Crédit de l’image</span><input id="credit" placeholder="© Éditeur / studio"></label><label class="field"><span>Droits / licence</span><input id="rights" placeholder="Utilisation autorisée"></label></div><div class="editor-two"><label class="field"><span>Signature</span><input id="author" value="Rédaction SWAPP"></label><label class="field"><span>Date d’origine (optionnelle)</span><input id="date" type="date"></label></div><label class="field"><span>Ancienne URL JustPlayer (interne à la migration, optionnelle)</span><input id="legacy" type="url" placeholder="https://justplayer.fr/supporters/posts/…"></label></div></details><details class="panel editor-advanced editor-commerce"><summary>Affiliation et partenariats (facultatif)</summary><div class="editor-advanced-body"><h3>Liens commerciaux facultatifs</h3><p class="editor-note">Deux maximum par article. Signale l'annonceur réel et le caractère rémunéré. Aucun ajout automatique ni produit inventé.</p>
<div class="editor-two"><label class="field"><span>Offre 1 · Titre</span><input id="affTitle1" maxlength="100" placeholder="Voir le jeu chez un partenaire"></label><label class="field"><span>Offre 1 · Marchand / annonceur</span><input id="affMerchant1" maxlength="70" placeholder="Nom du marchand"></label></div><div class="editor-two"><label class="field"><span>Offre 1 · URL HTTPS</span><input id="affUrl1" type="url" placeholder="https://…"></label><label class="field"><span>Nature du lien 1</span><select id="affKind1"><option value="affiliate">Affiliation · commission</option><option value="sponsored">Publicité / partenariat rémunéré</option></select></label></div>
<div class="editor-two"><label class="field"><span>Offre 2 · Titre</span><input id="affTitle2" maxlength="100"></label><label class="field"><span>Offre 2 · Marchand / annonceur</span><input id="affMerchant2" maxlength="70"></label></div><div class="editor-two"><label class="field"><span>Offre 2 · URL HTTPS</span><input id="affUrl2" type="url" placeholder="https://…"></label><label class="field"><span>Nature du lien 2</span><select id="affKind2"><option value="affiliate">Affiliation · commission</option><option value="sponsored">Publicité / partenariat rémunéré</option></select></label></div></div></details><div class="panel editor-publishing"><h3>Prêt à publier ?</h3><p class="editor-note">Remplis le titre et le contenu ; ajoute une URL YouTube pour une vidéo. Tu peux enregistrer un brouillon ou publier directement.</p><div class="editor-actions"><button class="editor-button neutral" id="ed-create">Enregistrer le brouillon</button><button class="editor-button" id="ed-save" disabled>Enregistrer les modifications</button><button class="editor-button primary" id="ed-publish">Publier sur SWAPP</button><button class="editor-button warning" id="ed-unpublish" disabled>Retirer de la publication</button></div><p class="editor-note" id="ed-publish-hint" role="status">Tu peux publier directement : SWAPP crée automatiquement le brouillon avant publication.</p><p class="editor-note">La diffusion sur les réseaux sociaux reste désactivée jusqu’à la connexion des comptes.</p></div></section>
<section class="editor-view" data-view="import"><div class="panel"><span class="eyebrow">SWAPP · Reprise éditoriale</span><h2>Finaliser les articles historiques</h2><p class="subtext">Tous les articles doivent être sauvegardés dans la rédaction SWAPP avant de désactiver l’ancienne plateforme. Les textes vérifiés ci-dessous sont actuellement visibles, mais encore dépendants de leur source. Reprends-les en brouillons éditables, vérifie leurs droits et publie-les.</p><p id="ed-legacy-progress" class="editor-note">Vérification à lancer…</p><div id="ed-legacy-results" aria-live="polite"></div><details class="editor-advanced"><summary>Récupération manuelle des articles manquants</summary><div class="editor-advanced-body"><div class="editor-actions"><button id="ed-scan" class="editor-button primary">Analyser JustPlayer</button><button id="ed-import" class="editor-button" disabled>Importer la sélection en brouillons</button></div><p class="editor-note" id="scan-result">Aucun scan lancé. Les articles incomplets ou privés ne sont pas inventés.</p><div id="scan-items"></div></div></details></div></section>
</div></main>`;
return layout({title:'Espace rédaction',description:'Administration des articles du magazine SWAPP',content,extraCss:EDITOR_CSS,scripts:'<script src="/actus/studio.js" defer></script><script src="/assets/swapp-studio-insights.js?v=20261016-insights-1" defer></script><link rel="stylesheet" href="/assets/swapp-studio-insights.css?v=20261016-insights-1"><script defer src="/assets/swapp-editor-enhance.js?v=20261015-studio-3"></script><link rel="stylesheet" href="/assets/swapp-editor-enhance.css?v=20261015-studio-2">'});
}
module.exports={js,renderStudio};