'use strict';
// 24-hour creator stories, metadata and links only. No native video hosting.
const crypto=require('node:crypto');
const {normalizeStory,MAX_STORIES}=require('../lib/swapp-creator-stories');
const LOGIN=/^[a-z0-9_-]{2,48}$/;
function createCreatorStoryStore({uri=process.env.SWAPP_MYSQL_URL||process.env.SWAPP_ACCOUNT_MYSQL_URL,mysqlFactory}={}){
 if(!uri||!/^mysql:\/\//.test(uri))throw Error('creator_story_mysql_not_configured');
 let initializing;
 async function ready(){
  if(!initializing)initializing=(async()=>{
   const driver=mysqlFactory||require('mysql2/promise');
   const pool=driver.createPool({uri,connectionLimit:2,waitForConnections:true,queueLimit:30,connectTimeout:5000,timezone:'Z'});
   try{
    await pool.query('CREATE TABLE IF NOT EXISTS swapp_creator_story_lock ('+
     'creator_login VARCHAR(48) NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await pool.query('CREATE TABLE IF NOT EXISTS swapp_creator_stories ('+
     'id CHAR(24) NOT NULL PRIMARY KEY,creator_login VARCHAR(48) NOT NULL,'+
     'title VARCHAR(90) NOT NULL,caption VARCHAR(300) NOT NULL,'+
     'theme VARCHAR(12) NOT NULL,video_url VARCHAR(320) NOT NULL,'+
     'created_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NOT NULL,'+
     'KEY story_active (creator_login,expires_at,created_at)) '+
     'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    return pool;
   }catch(error){await pool.end().catch(()=>{});throw error}
  })().catch(error=>{initializing=null;throw error});
  return initializing;
 }
 const login=value=>{
  const name=String(value||'').toLowerCase();
  if(!LOGIN.test(name))throw Error('invalid_creator_login');
  return name;
 };
 const select='SELECT id,title,caption,theme,video_url AS videoUrl,'+
  "DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,"+
  "DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expiresAt "+
  'FROM swapp_creator_stories WHERE creator_login=? AND expires_at>UTC_TIMESTAMP(3) '+
  'ORDER BY created_at DESC,id DESC LIMIT '+MAX_STORIES;
 async function list(creator){
  const name=login(creator),pool=await ready();
  const [rows]=await pool.execute(select,[name]);
  return rows;
 }
 async function publish(creator,input){
  const name=login(creator),story=normalizeStory(input),pool=await ready(),conn=await pool.getConnection();
  const id=crypto.randomBytes(12).toString('hex');
  try{
   await conn.beginTransaction();
   // Serialize concurrent submissions for the same creator even when no
   // active stories exist. Never lock all creators under one global row.
   await conn.execute('INSERT IGNORE INTO swapp_creator_story_lock (creator_login) VALUES (?)',[name]);
   await conn.execute('SELECT creator_login FROM swapp_creator_story_lock WHERE creator_login=? FOR UPDATE',[name]);
   const [rows]=await conn.execute('SELECT COUNT(*) AS total FROM swapp_creator_stories WHERE creator_login=? AND expires_at>UTC_TIMESTAMP(3)',[name]);
   if(Number(rows[0]?.total||0)>=MAX_STORIES)throw Error('story_limit_reached');
   await conn.execute('INSERT INTO swapp_creator_stories (id,creator_login,title,caption,theme,video_url,created_at,expires_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY))',
    [id,name,story.title,story.caption,story.theme,story.videoUrl]);
   // Bounded, no cron required. Old stories are invisible immediately after expiry.
   await conn.execute('DELETE FROM swapp_creator_stories WHERE expires_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) LIMIT 100');
   await conn.commit();
  }catch(error){await conn.rollback().catch(()=>{});throw error}
  finally{conn.release()}
  return {id,...story};
 }
 async function remove(creator,storyId){
  const name=login(creator),id=String(storyId||'');
  if(!/^[a-f0-9]{24}$/.test(id))return false;
  const pool=await ready();
  const [result]=await pool.execute('DELETE FROM swapp_creator_stories WHERE creator_login=? AND id=?',[name,id]);
  return result.affectedRows===1;
 }
 return {list,publish,remove};
}
module.exports={createCreatorStoryStore};
