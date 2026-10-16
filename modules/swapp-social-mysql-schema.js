'use strict';
// Keep the SQL schema in one place and apply the existing idempotent migration.
const fs=require('node:fs');
const path=require('node:path');
async function ensureSocialMysqlSchema(pool){
 const filename=path.join(__dirname,'..','migrations','mysql','002_swapp_social_interactions.sql');
 const script=fs.readFileSync(filename,'utf8').replace(/^\\s*--.*$/gm,'');
 const statements=script.split(';').map(sql=>sql.trim()).filter(Boolean);
 if(statements.length!==5||statements.some(sql=>!/^CREATE TABLE IF NOT EXISTS swapp_social_/i.test(sql)))
  throw new Error('social_schema_invalid');
 for(const sql of statements)await pool.query(sql);
 for(const table of ['swapp_social_matches','swapp_social_polls','swapp_social_votes','swapp_social_rooms','swapp_social_room_messages'])
  await pool.query('SELECT id FROM '+table+' LIMIT 0');
}
module.exports={ensureSocialMysqlSchema};
