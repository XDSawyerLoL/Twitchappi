/* SWAPP route motion: one SPA handoff, no duplicated navigation or timers.
 * Observe the existing .view.active contract rather than wrapping setView().
 * This intentionally leaves the auth, OAuth, history and article routers intact.
 */
(()=>{
  'use strict';
  if(window.__SWAPP_ROUTE_MOTION__)return;
  const app=document.querySelector('main.app');
  if(!app||typeof MutationObserver!=='function')return;
  const pages=Array.from(app.children).filter(node=>node.classList?.contains('view'));
  if(!pages.length)return;
  window.__SWAPP_ROUTE_MOTION__=true;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let previous=pages.find(node=>node.classList.contains('active'))||null;
  let ready=false;
  let historicalNavigation=false;
  let arrival=null;
  const active=()=>pages.find(node=>node.classList.contains('active'))||null;
  const motionEnabled=()=>!reduce?.matches;

  // Do not animate startup, OAuth returning to /compte or route-bootstrap repairs.
  const arm=()=>{
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        previous=active();
        ready=true;
      });
    });
  };
  if(document.readyState==='complete')arm();
  else window.addEventListener('load',arm,{once:true});

  // Preserve browser-managed scroll restoration when going Back / Forward.
  window.addEventListener('popstate',()=>{
    historicalNavigation=true;
    requestAnimationFrame(()=>{historicalNavigation=false;});
  });
  window.addEventListener('hashchange',()=>{
    historicalNavigation=true;
    requestAnimationFrame(()=>{historicalNavigation=false;});
  });

  function switched(){
    const page=active();
    if(!page||page===previous)return;
    const old=previous;
    previous=page;
    if(arrival&&arrival!==page)arrival.classList.remove('swapp-route-enter');
    arrival=null;
    if(!old||!ready)return;

    // Switching to another category should never keep the old page's scroll.
    // A history traversal is left to the browser, and an anchored URL owns its target.
    if(!historicalNavigation&&!location.hash){
      try{window.scrollTo({left:0,top:0,behavior:'instant'});}
      catch(_){window.scrollTo(0,0);}
    }
    if(!motionEnabled())return;
    page.classList.add('swapp-route-enter');
    arrival=page;
  }
  const observer=new MutationObserver(switched);
  pages.forEach(page=>observer.observe(page,{attributes:true,attributeFilter:['class']}));
  // Remove the animation class once it completes; nested iframes/videos
  // must never be reset or remounted just for the route transition.
  app.addEventListener('animationend',event=>{
    if(event.animationName!=='swapp-route-reveal')return;
    const page=event.target;
    if(!pages.includes(page))return;
    page.classList.remove('swapp-route-enter');
    if(arrival===page)arrival=null;
  });
})();