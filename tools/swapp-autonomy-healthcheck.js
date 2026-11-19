'use strict';
// Read-only, bounded, on-demand production health checks. No scheduler or secret.
const DEFAULT_ENDPOINTS = Object.freeze([
  {name:'release',path:'/api/release'},
  {name:'news',path:'/api/actus'},
  {name:'news-storage',path:'/api/actus/storage-status'},
  {name:'news-releases',path:'/api/actus/release-status'},
  {name:'guides',path:'/guides'}
]);
function classify(status) {
  if(status===200)return 'ok';
  if(status===403||status===429)return 'restricted';
  if(status===404)return 'missing';
  if(status>=500)return 'unavailable';
  return 'unexpected';
}
async function probe({baseUrl='https://swapp.tv',fetchImpl=globalThis.fetch,endpoints=DEFAULT_ENDPOINTS,timeoutMs=4500}={}) {
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl required');
  const root=new URL(baseUrl);
  if(!['https:','http:'].includes(root.protocol))throw new TypeError('Invalid origin');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)throw new RangeError('Invalid timeout');
  const results=[];
  for(const endpoint of endpoints) {
    if(!/^\/[a-z0-9/_-]+$/i.test(endpoint.path))throw new TypeError('Invalid endpoint path');
    const started=Date.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetchImpl(new URL(endpoint.path,root),{
        method:'GET',signal:controller.signal,redirect:'manual',
        headers:{accept:'application/json, text/html;q=0.8'}
      });
      results.push({name:endpoint.name,path:endpoint.path,status:response.status,
        state:classify(response.status),latencyMs:Date.now()-started});
    }catch(error) {
      results.push({name:endpoint.name,path:endpoint.path,status:null,
        state:error?.name==='AbortError'?'timeout':'network-error',latencyMs:Date.now()-started});
    }finally {clearTimeout(timer);}
  }
  return {checkedAt:new Date().toISOString(),origin:root.origin,results,
    healthy:results.every(result=>result.state==='ok')};
}
module.exports={probe,classify,DEFAULT_ENDPOINTS};
if(require.main===module) {
  probe({baseUrl:process.env.SWAPP_HEALTH_ORIGIN||'https://swapp.tv'})
    .then(report=>{process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.healthy?0:1;})
    .catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=2;});
}
