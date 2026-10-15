'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const base={slug:'spider-man-article-test',title:'Spider-Man et le futur du jeu vidéo',
 category:'Analyse',game:'Marvel’s Spider-Man',summary:'Une immersion dans un univers passionnant.',
 body:'Premier paragraphe de démonstration. Ceci est un article complet.',
 publishedAt:'2026-10-15T18:00:00Z',author:'Rédaction SWAPP'};

test('SPA and direct article routes share the ratio-preserving article background stylesheet',()=>{
 assert.match(read('index.html'),/swapp-article-immersive\.css\?v=20261015-soft-edge-6/);
 assert.match(read('modules/swapp-news/site-shell.js'),/swapp-article-immersive\.css\?v=20261015-soft-edge-6/);
});

test('SPA uses article image as a page scene, not a banner',()=>{
 const spa=read('assets/swapp-actus-app.js');
 assert.match(spa,/const scene=el\('div','swapp-article-scene'\)/);
 assert.match(spa,/node\.prepend\(scene\)/);
 assert.match(spa,/sceneImage\.fetchPriority='high'/);
 assert.match(spa,/sceneImage\.onerror=/);
 assert.match(spa,/heroCopy\.append\(controls\)/);
 assert.doesNotMatch(spa,/const figure=el\('figure','swapp-reader-hero-figure'\)/);
 assert.doesNotMatch(spa,/const backdrop=el\('div','swapp-immersive-bg'\)/);
});

test('native route puts one image in the global scene and keeps content, SEO and lives',()=>{
 const html=renderNewsStory({...base,image:{url:'https://cdn.example.test/covers/spider.jpg',credit:'© Éditeur'}});
 assert.match(html,/class="swapp-article-scene has-art" aria-hidden="true"/);
 assert.match(html,/src="https:\/\/cdn\.example\.test\/covers\/spider\.jpg"/);
 assert.match(html,/class="swapp-native-immersive-hero swapp-immersive-hero"/);
 assert.match(html,/id="article-content" class="article-body"/);
 assert.match(html,/class="swapp-immersive-credit">© Éditeur/);
 assert.match(html,/href="#article-content"/);
 assert.match(html,/href="#swapp-article-lives"/);
 assert.match(html,/id="swapp-article-lives"/);
 assert.match(html,/data-swapp-live-shelf/);
 assert.match(html,/<meta property="og:image"/);
 assert.equal((html.match(/src="https:\/\/cdn\.example\.test\/covers\/spider\.jpg"/g)||[]).length,1);
 assert.doesNotMatch(html,/swapp-immersive-bg/);
});

test('no valid HTTPS image still produces a readable gradient scene',()=>{
 for(const value of [undefined,'javascript:alert(1)','http://cdn.example.test/image.jpg']){
  const html=renderNewsStory({...base,image:value?{url:value}:undefined});
  assert.match(html,/class="swapp-article-scene" aria-hidden="true"/);
  assert.doesNotMatch(html,/class="swapp-article-scene has-art"/);
  assert.match(html,/class="article-title"/);
  assert.match(html,/class="article-body"/);
 }
});

test('headline, summary and image credit are escaped',()=>{
 const html=renderNewsStory({...base,title:'Le héros <script>alert(1)</script>',summary:'Découvrez <img src=x>',
 image:{url:'https://cdn.example.test/image.jpg?x=1&y=2',credit:'Image <b>test</b>'}});
 assert.match(html,/Le héros &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/Découvrez &lt;img src=x&gt;/);
 assert.match(html,/x=1&amp;y=2/);
 assert.match(html,/Image &lt;b&gt;test&lt;\/b&gt;/);
});

test('artwork is confined to the intro, preserving image aspect ratio and avoiding fog',()=>{
 const css=read('assets/swapp-article-immersive.css');
 assert.match(css,/\.swapp-article-scene\{/);
 assert.match(css,/position:absolute;z-index:0/);
 assert.match(css,/height:clamp\(390px,35vw,570px\)/);
 assert.match(css,/height:100%;width:auto;max-width:none/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/mask-image:linear-gradient/);
 assert.doesNotMatch(css,/position:fixed;inset:0/);
 assert.doesNotMatch(css,/object-fit:cover/);
 assert.match(css,/\.swapp-article-scene::after\{display:none/);
 assert.match(css,/#0b111b 0%/);
});

test('reading content and TOC are structurally grouped, not layered over the image',()=>{
 const spa=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-article-immersive.css');
 assert.match(spa,/const reading=el\('div','swapp-article-reading'\)/);
 assert.match(spa,/reading\.append\(toc\)/);
 assert.match(spa,/reading\.append\(body\);article\.append\(reading\)/);
 assert.match(css,/\.swapp-article-reading:has\(\.swapp-reader-toc\)/);
 assert.match(css,/position:sticky;top:92px/);
 assert.match(css,/background:none!important;background-image:none!important/);
 assert.match(css,/border:0!important;border-radius:0!important;box-shadow:none!important/);
 assert.match(css,/max-width:830px!important/);
 assert.match(css,/@media\(max-width:880px\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/prefers-contrast:more/);
 assert.doesNotMatch(css,/@keyframes/);
});


test('left edge of article image dissolves smoothly into the site background without cropping',()=>{
 const css=read('assets/swapp-article-immersive.css');
 const image=css.match(/\.swapp-article-scene img\{([\s\S]*?)\}/)?.[1]||'';
 const overlay=css.match(/\.swapp-article-scene::before\{([\s\S]*?)\}/)?.[1]||'';
 assert.match(image,/width:auto;max-width:none/);
 assert.match(image,/object-fit:contain/);
 assert.match(image,/-webkit-mask-image:linear-gradient\(90deg/);
 assert.match(image,/mask-image:linear-gradient\(90deg/);
 assert.match(image,/transparent 0%,rgba\(0,0,0,\.18\) 10%/);
 assert.match(image,/#000 42%,#000 100%/);
 assert.match(overlay,/rgba\(11,17,27,\.72\) 40%/);
 assert.match(overlay,/transparent 100%/);
 assert.match(css,/-webkit-mask-image:none;mask-image:none/);
 assert.match(css, /@media\(max-width:700px\)/);
});
