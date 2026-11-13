'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../assets/swapp-actus-app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-actus-app.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function preferenceApi(window){
 const first=js.indexOf("const ACTUS_CARD_SIZES=");
 const last=js.indexOf("// Editorial taxonomy:",first);
 assert.ok(first>=0&&last>first);
 const code=js.slice(first,last);
 return new Function('window',code+';return {savedActusCardSize,rememberActusCardSize,actusCardSize};')(window);
}

test('card size is normal by default, persisted and invalid values are ignored',()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const api=preferenceApi({localStorage:storage});
 assert.equal(api.savedActusCardSize(),'normal');
 for(const mode of ['compact','normal','grand']){
  api.rememberActusCardSize(mode);
  assert.equal(api.savedActusCardSize(),mode);
 }
 values.set('swapp:actus:card-size','enorme');
 assert.equal(api.savedActusCardSize(),'normal');
 const denied=preferenceApi({localStorage:{getItem(){throw Error('storage denied')},setItem(){throw Error('storage denied')}}});
 assert.equal(denied.savedActusCardSize(),'normal');
 assert.doesNotThrow(()=>denied.rememberActusCardSize('grand'));
});

function fakeEl(tag,cls,text){
 return {tag,cls,text,dataset:{},children:[],attributes:{},
  setAttribute(key,val){this.attributes[key]=val},
  replaceChildren(...items){this.children=[...items]},
  append(...items){this.children.push(...items)}
 };
}

test('three accessible size buttons resize the grid and FLASH without new API requests',()=>{
 const from=js.indexOf('const drawCardSizes=()=>{');
 const end=js.indexOf('\nlayoutTools.append(count,sizeLabel,sizeControl);',from);
 assert.ok(from>=0&&end>from);
 const code=js.slice(from,end);
 const control=fakeEl('div','swapp-actus-card-size'),feed={dataset:{cardSize:'normal'}};
 const flashCards={dataset:{cardSize:'normal'}};
 let remembered='';
 const result=new Function('el','sizeControl','feed','flashCards','rememberActusCardSize',
  'let activeCardSize="normal";\n'+code+';return {sizeControl,feed,flashCards};')(
   fakeEl,control,feed,flashCards,value=>{remembered=value});
 const labels=()=>result.sizeControl.children.map(b=>b.text);
 assert.deepEqual(labels(),['Compact','Normal','Grand']);
 assert.deepEqual(result.sizeControl.children.map(b=>b.attributes['aria-pressed']),['false','true','false']);
 result.sizeControl.children[0].onclick();
 assert.equal(feed.dataset.cardSize,'compact');
 assert.equal(flashCards.dataset.cardSize,'compact');
 assert.equal(remembered,'compact');
 assert.deepEqual(labels(),['Compact','Normal','Grand']);
 assert.equal(result.sizeControl.children[0].attributes['aria-pressed'],'true');
 result.sizeControl.children[2].onclick();
 assert.equal(feed.dataset.cardSize,'grand');
 assert.equal(flashCards.dataset.cardSize,'grand');
 assert.equal(remembered,'grand');
 assert.equal(result.sizeControl.children[2].attributes['aria-pressed'],'true');
});

test('responsive modes are scoped to listing cards and keep the article reader intact',()=>{
 assert.match(css,/\.swapp-actus-grid\[data-card-size="compact"\]/);
 assert.match(css,/\.swapp-actus-grid\[data-card-size="grand"\]/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/@media\(max-width:630px\)/);
 assert.match(css,/orientation:portrait/);
 assert.doesNotMatch(css,/\.swapp-actus-article\[data-card-size=/);
 assert.match(js,/layoutTools\.append\(count,sizeLabel,sizeControl\)/);
 assert.match(html,/swapp-actus-app\.js\?v=20261113-card-density-v1/);
 assert.match(html,/swapp-actus-app\.css\?v=20261113-card-density-v1/);
});
