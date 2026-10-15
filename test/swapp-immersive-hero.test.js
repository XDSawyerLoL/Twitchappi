'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const base={slug:'spider-man-article-test',title:'Spider-Man et le futur du jeu vidéo',
 category:'Analyse',game:'Marvel’s Spider-Man',summary:'Une immersion dans un univers passionnant.',
 body:'Premier paragraphe de démonstration. Ceci est un article complet.',
 publishedAt:'2026-10-15T18:00:00Z',author:'Rédaction SWAPP'};

test('SPA and direct article routes load the exact same immersive stylesheet',()=>{
 assert.match(read('index.html'),/swapp-article-immersive\.css\?v=20261015-immersive-1/);
 assert.match(read('modules/swapp-news/site-shell.js'),/swapp-article-immersive\.css\?v=20261015-immersive-1/);
});

test('SPA uses the article image as a decorative hero, with a fallback and no duplicate cover',()=>{
 const spa=read('assets/swapp-actus-app.js');
 assert.match(spa,/swapp-reader-hero swapp-immersive-hero/);
 assert.match(spa,/const heroImage=url\(a\.image\?\.url\|\|a\.imageUrl\)/);
 assert.match(spa,/image\.fetchPriority='high'/);
 assert.match(spa,/image\.onerror=/);
 assert.match(spa,/swapp-immersive-credit/);
 assert.doesNotMatch(spa,/const figure=el\('figure','swapp-reader-hero-figure'\)/);
});

test('native article renders one image inside the hero with a preserved reading body',()=>{
 const html=renderNewsStory({...base,image:{url:'https://cdn.example.test/covers/spider.jpg',credit:'© Éditeur'}});
 assert.match(html,/class="swapp-native-immersive-hero swapp-immersive-hero has-cover"/);
 assert.match(html,/class="swapp-immersive-bg" aria-hidden="true"/);
 assert.match(html,/src="https:\/\/cdn\.example\.test\/covers\/spider\.jpg"/);
 assert.match(html,/fetchpriority="high"/);
 assert.match(html,/class="article-title">Spider-Man/);
 assert.match(html,/class="article-body"/);
 assert.match(html,/class="swapp-immersive-credit">© Éditeur/);
 assert.doesNotMatch(html,/class="cover-img"/);
 assert.match(html,/data-swapp-live-shelf/);
 assert.match(html,/<meta property="og:image"/);
});

test('articles with no valid HTTPS cover still render a readable gradient hero',()=>{
 for(const value of [undefined,'javascript:alert(1)','http://cdn.example.test/image.jpg']){
  const html=renderNewsStory({...base,image:value?{url:value}:undefined});
  assert.match(html,/class="swapp-native-immersive-hero swapp-immersive-hero"/);
  assert.doesNotMatch(html,/class="swapp-immersive-bg"/);
  assert.match(html,/class="article-title"/);
  assert.match(html,/class="article-body"/);
 }
});

test('article fields remain escaped in the hero and existing article context is preserved',()=>{
 const html=renderNewsStory({...base,title:'Le héros <script>alert(1)</script>',summary:'Découvrez <img src=x>',
 image:{url:'https://cdn.example.test/image.jpg?x=1&y=2',credit:'Image <b>test</b>'}});
 assert.doesNotMatch(html,/<h1 class="article-title">[^<]*<script>/);
 assert.match(html,/Le héros &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/Découvrez &lt;img src=x&gt;/);
 assert.match(html,/x=1&amp;y=2/);
 assert.match(html,/Image &lt;b&gt;test&lt;\/b&gt;/);
});

test('CSS scopes immersion to article hero, with mobile and accessibility support',()=>{
 const css=read('assets/swapp-article-immersive.css');
 assert.match(css,/\.swapp-immersive-hero/);
 assert.match(css,/\.swapp-immersive-content/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/prefers-contrast:more/);
 assert.match(css,/linear-gradient/);
 assert.doesNotMatch(css,/@keyframes/);
});
