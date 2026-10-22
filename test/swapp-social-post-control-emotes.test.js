'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const source=read('assets/swapp-social-native/render.js');
const buildRenderer=new Function('state','dom','esc','icon','initials','timeAgo','setStatus',
  source.replace(/^import [^\n]+\n/,'').replace(/export function /g,'function ')+'\nreturn {renderPost};');
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const post=(id='p_abcd1234',body='Bonsoir',own=true)=>({
 id,body,author:{id:'u_self',handle:'gamer',displayName:'Gamer'},createdAt:'2026-10-22T12:00:00Z',
 viewer:{canDelete:own,liked:false,reposted:false,bookmarked:false},
 counts:{reposts:2,likes:1,replies:0}
});
const render=(item,user={id:'u_self'})=>buildRenderer(
 {user},null,escapeHtml,name=>'<svg data-icon="'+name+'"></svg>',()=> 'G',()=> '1 min',()=>{}
).renderPost(item);

test('only the post owner sees the delete control',()=>{
 const owner=render(post()),stranger=render({...post(),viewer:{canDelete:false}},{id:'u_else'});
 assert.match(owner,/data-action="delete"/);
 assert.match(owner,/aria-label="Supprimer ma publication"/);
 assert.doesNotMatch(stranger,/data-action="delete"/);
});
test('relay can be reversed and has the right accessible label',()=>{
 const on=render({...post(),viewer:{reposted:true,canDelete:false}},{id:'u_else'});
 const off=render({...post(),viewer:{reposted:false,canDelete:false}},{id:'u_else'});
 assert.match(on,/aria-label="Annuler mon relais"/);
 assert.match(on,/Annuler relais/);
 assert.match(off,/aria-label="Relayer"/);
 assert.match(off,/Relayer<\/span>/);
});
test('an SWAPP article shared as a post appears once, not as duplicate body and preview',()=>{
 const item={...post(),'body':'Nouvelle bande-annonce SWAPP',linkUrl:'https://swapp.tv/actus/nouvelle-bande-annonce',linkTitle:'Nouvelle bande-annonce SWAPP',imageUrl:'https://images.example.net/swapp.jpg'};
 const html=render(item);
 assert.match(html,/pulse-post-relayed/);
 assert.match(html,/ARTICLE SWAPP/);
 assert.match(html,/pulse-rich-link-preview/);
 assert.equal((html.match(/Nouvelle bande-annonce SWAPP/g)||[]).length,1);
 assert.doesNotMatch(html,/<p class="pulse-post-body">/);
});
test('quoted posts retain the original author, text and image safely',()=>{
 const item={...post(),quote:{author:{handle:'player',displayName:'Player'},body:'Salut <script>x</script>',imageUrl:'https://images.example.net/cap.jpg'}};
 const html=render(item);
 assert.match(html,/pulse-quoted-original/);
 assert.match(html,/@player/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
test('backend owner check and proxy accept only whitelisted DELETE posts route',()=>{
 const backend=read('modules/swapp-social-native/pulse.mjs');
 const proxy=require('../modules/swapp-social-native-proxy');
 assert.equal(proxy.permitted('DELETE','/posts/p_abcdef1234'),true);
 assert.equal(proxy.permitted('DELETE','/users/anyuser'),false);
 assert.equal(proxy.permitted('DELETE','/posts/p_abcdef1234/repost'),false);
 assert.match(backend,/if\(post.authorId!==user.id\)return\{error:'forbidden'\}/);
 assert.match(backend,/canDelete:Boolean\(viewerId&&post.authorId===viewerId\)/);
 assert.match(backend,/delete store.reposts\[post.id\]/);
 assert.match(backend,/out.error==='forbidden'\?403/);
});
test('actions require logged in account, server-confirmed DELETE and undo-repost',()=>{
 const app=read('assets/swapp-social-native/app.js');
 assert.match(app,/if\(!requireAuth\(\)\)return;\s*const key=String\(postId\)\+':delete'/);
 assert.match(app,/method:'DELETE',body:'\{\}'/);
 assert.match(app,/if\(!result\?\.ok\)throw Error/);
 assert.match(app,/data\.action==='delete'/);
 assert.match(app,/typeof result\?\.active==='boolean'\?result.active:!previous/);
 assert.match(app,/const body=title.slice\(0,420\)/);
});
test('emoji picker is available in one compact composer and DMs with length limits',()=>{
 const markup=read('assets/swapp-social-native/social-body.html');
 const views=read('assets/swapp-social-native/views.js');
 const emotes=read('assets/swapp-social-native/emotes.js');
 new Function(emotes.replace('export function setupSocialEmotes','function setupSocialEmotes'));
 assert.match(markup,/data-emoji-toggle/);
 assert.match(views,/data-emoji-toggle/);
 assert.match(emotes,/setRangeText\(emoji,start,end,'end'\)/);
 assert.match(emotes,/nextLength>input.maxLength/);
 assert.match(emotes,/event.key==='Escape'/);
 assert.match(emotes,/group.title/);
});
test('new JS and CSS asset versions are linked by SWAPP /social',()=>{
 const hubs=read('modules/swapp-hubs.js');
 const app=read('assets/swapp-social-native/app.js');
 const views=read('assets/swapp-social-native/views.js');
 const css=read('assets/swapp-social-native/social-swapp.css');
 assert.match(hubs,/app\.js\?v=20261022-social-control-emotes-v1/);
 assert.match(hubs,/social-swapp\.css\?v=20261022-social-control-emotes-v1/);
 assert.match(app,/views\.js\?v=20261022-social-posts-v2/);
 assert.match(views,/render\.js\?v=20261022-social-posts-v2/);
 assert.match(app,/emotes\.js\?v=20261022-social-emotes-v1/);
 assert.match(css,/pulse-post-relayed \.pulse-rich-link-preview/);
 assert.match(css,/pulse-emoji-picker/);
 assert.match(css,/@media\(max-width:570px\)/);
});
