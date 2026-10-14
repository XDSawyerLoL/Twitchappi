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
    if(!fromSession && !fromKey)return res.status(403).json({error:'editor_forbidden'});
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