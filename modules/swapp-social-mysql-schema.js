'use strict';
// Idempotent schema bootstrap. These migrations never delete existing data.
const fs=require('node:fs');
const path=require('node:path');
const migrations=[
 {file:'002_swapp_social_interactions.sql',count:5},
 {file:'003_swapp_social_passports.sql',count:1},
 {file:'004_swapp_social_voice_notes.sql',count:1},
 {file:'005_swapp_social_audio_blocks.sql',count:1},
 {file:'006_swapp_social_game_library.sql',count:1},
 {file:'007_swapp_wishlist_rewards.sql',count:3},
 {file:'008_swapp_personal_channels.sql',count:2}
];
async function ensureSocialMysqlSchema(pool){
 for(const migration of migrations){
  const filename=path.join(__dirname,'..','migrations','mysql',migration.file);
  const script=fs.readFileSync(filename,'utf8').split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
  const statements=script.split(';').map(sql=>sql.trim()).filter(Boolean);
  if(statements.length!==migration.count||statements.some(sql=>!/^CREATE TABLE IF NOT EXISTS swapp_social_/i.test(sql)))
   throw new Error('social_schema_invalid');
  for(const sql of statements)await pool.query(sql);
 }
 for(const table of ['swapp_social_matches','swapp_social_polls','swapp_social_votes','swapp_social_rooms','swapp_social_room_messages','swapp_social_passports','swapp_social_voice_notes','swapp_social_audio_blocks','swapp_social_game_follows','swapp_social_game_wishlist','swapp_social_reward_accounts','swapp_social_reward_ledger','swapp_social_private_rooms','swapp_social_private_members'])
  await pool.query('SELECT 1 FROM '+table+' LIMIT 0');
}
module.exports={ensureSocialMysqlSchema};
