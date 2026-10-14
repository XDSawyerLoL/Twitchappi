'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {layout}=require('../modules/swapp-news/site-shell');
const {renderTwitchWatch}=require('../modules/swapp-news/watch');

function navFixture(){
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.props={};this.textContent='';this.className='';this.href='';}
    appendChild(node){this.children.push(node);return node;}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(k,v){this.props[k]=v;}
    addEventListener(k,cb){this.handlers[k]=cb;}
  }
  const window={};
  const document={readyState:'loading',addEventListener:()=>{},createElement:tag=>new Element(tag)};
  const code=fs.readFileSync(path.join(__dirname,'../assets/swapp-navigation.js'),'utf8');
  vm.runInNewContext(code,{window,document},{timeout:1200});
  return {api:window.SWAPPNavigation,Element};
}
test('un seul modèle de navigation partagé entre accueil, articles et mobile',()=>{
  const {api,Element}=navFixture();
  const desktop=new Element('nav'),mobile=new Element('nav');
  api.render(desktop,mobile,{active:'actus'});
  const names=desktop.children[0].children.map(x=>x.textContent);
  assert.deepEqual(names,['Accueil','Découvrir','Catégories','Équipes','ACTUS']);
  assert.deepEqual(mobile.children.map(x=>x.textContent),names);
  assert.equal(desktop.children[0].children.at(-1).props['aria-current'],'page');
  assert.equal(desktop.children[0].children.at(0).href,'/');
  assert.equal(desktop.children[0].children.at(-1).href,'/actus');
});
test('l’accueil navigue sans rechargement pour les sections SPA et ouvre ACTUS avec un lien normal',()=>{
  const {api,Element}=navFixture();const target=new Element('nav'),mobile=new Element('nav');
  const navigated=[];api.render(target,mobile,{active:'home',navigate:id=>navigated.push(id)});
  const nav=target.children[0].children;
  let blocked=false;
  nav[1].handlers.click({button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false,
    preventDefault(){blocked=true;}});
  assert.equal(blocked,true);assert.deepEqual(navigated,['discover']);
  assert.equal(nav[4].handlers.click,undefined);
});
test('le même en-tête et la même zone Compte sont présents dans ACTUS et le lecteur live',()=>{
  const actus=layout({title:'Actualités',content:'<main>Test</main>'});
  const live=renderTwitchWatch('streamer_2026',{game:'Valorant'});
  for(const html of [actus,live]){
    assert.match(html,/class="top swappSiteHeader"/);
    assert.match(html,/id="nav" class="mainNav"/);
    assert.match(html,/id="userBtn" class="userBtn"/);
    assert.match(html,/id="mobileNav" class="mobileNav swappGlobalMobileNav"/);
    assert.match(html,/swapp-navigation\.css/);
    assert.match(html,/swapp-navigation\.js/);
  }
  assert.match(actus,/data-swapp-active="actus"/);
  assert.match(live,/data-swapp-active="discover"/);
});
test('l’accueil utilise le même composant et ne charge pas de deuxième barre',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../index_script.js'),'utf8');
  assert.match(html,/class="top swappSiteHeader"/);
  assert.match(html,/id="nav" class="mainNav"/);
  assert.match(html,/swapp-navigation\.css/);
  assert.match(html,/swapp-navigation\.js/);
  assert.match(app,/SWAPPNavigation\.render/);
  assert.doesNotMatch(html,/swappNewsLink/);
});
test('le code commun refuse toute erreur de syntaxe, sans dépendance tierce',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../assets/swapp-navigation.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(s));
});
