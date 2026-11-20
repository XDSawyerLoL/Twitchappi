'use strict';
// Public, read-only editorial radar. Uses the existing Live Trends MySQL pool.
// SQL returns metadata only; drafts and unpublished articles are excluded.
const {createEditorialRadarService} = require('./editorial-radar');
const READ_PUBLISHED = "SELECT document_id AS slug, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.game')) AS game, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.title')) AS title, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.category')) AS category, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.contentType')) AS contentType, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.publishedAt')) AS publishedAt, " +
  "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.status')) AS status " +
  "FROM swapp_news_documents WHERE collection_name=? " +
  "AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.status'))='published' " +
  "ORDER BY updated_at DESC LIMIT 200";
function registerEditorialRadar(app,{getTrends,getPool,limiter,now=Date.now}={}) {
 if (!app || typeof app.get !== 'function' || typeof getTrends !== 'function' ||
     typeof getPool !== 'function' || typeof limiter !== 'function') throw new TypeError('Invalid radar route');
 const radar = createEditorialRadarService({
  now, getTrends,
  loadPublished: async()=>{
   const pool=getPool();
   if (!pool || typeof pool.execute !== 'function') throw new Error('no_read_pool');
   const [rows]=await pool.execute(READ_PUBLISHED,['swapp_news_articles']);
   if (!Array.isArray(rows) || rows.length>200) throw new Error('invalid_catalogue_result');
   return rows.filter(x=>x && x.status==='published').map(x=>({
    slug:x.slug,status:'published',game:x.game,title:x.title,category:x.category,
    contentType:x.contentType,publishedAt:x.publishedAt
   }));
  }
 });
 app.get('/api/swapp/autonomy/editorial-opportunities',limiter,async(_req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  if (!getPool()) return res.status(503).json({
   success:false,state:'disabled',reason:'live-trends-not-enabled',opportunities:[]
  });
  const result=await radar.report();
  return res.status(result.state==='unavailable'?503:200).json({success:result.state!=='unavailable',...result});
 });
 return radar;
}
module.exports={registerEditorialRadar,READ_PUBLISHED};