'use strict';
const crypto = require('node:crypto');
function secureEqual(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length>0 && x.length===y.length && crypto.timingSafeEqual(x,y);
}
function makeNewsEditorGuard({isSessionAdmin,adminKey='',isProduction=true,allowedOrigins=['https://swapp.tv','https://www.swapp.tv']}={}){
  if(typeof isSessionAdmin!=='function')throw new TypeError('Session admin validator required');
  const allow=new Set(allowedOrigins.filter(Boolean));
  return function requireEditor(req,res,next){
    const headers=req.headers||{};
    const fromSession=Boolean(isSessionAdmin(req));
    const fromKey=adminKey.length>=24 && secureEqual(headers['x-swapp-admin-key'],adminKey);
    if(!fromSession && !fromKey){
      // A direct browser visit must explain the missing role, not dump JSON.
      if(String(req.method||'GET').toUpperCase()==='GET' && req.path==='/actus/studio'){
        const connected=Boolean(req.session?.oryonUser?.login);
        return res.status(403).type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accès rédaction · SWAPP</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 0 0,#20415c,#0d111c 70%);color:white;font:16px/1.55 system-ui}.panel{width:min(580px,calc(100% - 40px));padding:35px;border:1px solid #526079;border-radius:24px;background:#182135}h1{font-size:clamp(28px,5vw,46px);line-height:1.15}p{color:#b8c8da}a{display:inline-flex;margin:8px 8px 0 0;padding:12px 16px;border-radius:12px;color:white;text-decoration:none;background:#b44cda;font-weight:800}a.secondary{background:#293952}</style></head><body><main class="panel"><strong>SWAPP · Rédaction</strong><h1>Accès réservé à la rédaction.</h1><p>${connected?'Ton compte SWAPP est connecté, mais il ne dispose pas encore du rôle administrateur. Le compte doit être autorisé dans ORYON_ADMIN_LOGINS et son identifiant interne doit correspondre à ORYON_ADMIN_USER_IDS sur l’hébergement SWAPP.':'Connecte-toi d’abord à ton compte SWAPP. Si tu es administrateur, retourne ensuite dans la rédaction.'}</p><a href="/compte">Mon compte SWAPP</a><a class="secondary" href="/actus">Retour aux actualités</a></main></body></html>`);
      }
      return res.status(403).json({error:'editor_forbidden'});
    }
    const method=String(req.method||'GET').toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method) && headers['x-swapp-editor']!=='1'){
      return res.status(403).json({error:'editor_csrf_header_required'});
    }
    const origin=headers.origin;
    if(origin && !allow.has(origin) && (isProduction || !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin))){
      return res.status(403).json({error:'editor_origin_forbidden'});
    }
    return next();
  };
}
module.exports={makeNewsEditorGuard,secureEqual};