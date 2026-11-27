const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../assets/swapp-route-bootstrap.js'), 'utf8');

function boot(pathname, directActus = false) {
  const listeners = {}, timers = [], calls = [];
  const makeNode = () => {
    const classes = new Set();
    return {classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},querySelector:()=>null};
  };
  const nodes = {home:makeNode(),actus:makeNode(),settings:makeNode()};
  const location = {pathname,search:'',hash:''};
  const window = {__SWAPP_DIRECT_ACTUS_ENTRY__:directActus,
    addEventListener:(event,fn)=>{listeners[event]=fn},
    setView:async view=>{calls.push(view);location.pathname=view==='actus'?'/actus':view==='settings'?'/compte':'/';nodes[view].classList.add('active');}
  };
  const document = {getElementById:id=>nodes[id],addEventListener:(event,fn)=>{listeners[event]=fn}};
  vm.runInNewContext(script,{window,document,location,history:{replaceState:(_state,_title,url)=>{location.pathname=url}},setTimeout:fn=>timers.push(fn),console});
  return {calls,location,listeners,run:async()=>{for(const fn of timers)await fn()}};
}

test('a late bootstrap restores the originally requested magazine after a root rewrite',async()=>{
  const page=boot('/',true);await page.run();assert.equal(page.location.pathname,'/actus');assert.deepEqual(page.calls,['actus']);
});
test('a genuine home entry is left alone',async()=>{
  const page=boot('/',false);await page.run();assert.equal(page.location.pathname,'/');assert.deepEqual(page.calls,[]);
});
test('an explicit navigation away prevents restoration',async()=>{
  const page=boot('/actus',true);page.listeners.click({target:{closest:()=>({})}});page.location.pathname='/compte';await page.run();assert.equal(page.location.pathname,'/compte');assert.deepEqual(page.calls,[]);
});
test('the original direct magazine route still renders once',async()=>{
  const page=boot('/actus',false);await page.run();assert.equal(page.location.pathname,'/actus');assert.deepEqual(page.calls,['actus']);
});
