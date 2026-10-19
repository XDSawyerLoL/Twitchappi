'use strict';
/*
 * Server-side exact-game room matching shared by MySQL and legacy fallback.
 * Never fuzzy-match a sequel, a remaster, or a room containing the query
 * only in its description/name. No user identifiers or telemetry.
 */
const {equivalent,searchNames}=require('./swapp-news/game-identity');
const MAX_NAME=65;
function gameFromQuery(value){
 if(typeof value!=='string')return '';
 const game=value.trim();
 return game.length>=2&&game.length<=MAX_NAME?game:'';
}
function gameRoomQuery(value){
 const game=gameFromQuery(value);
 if(!game)return {game:'',clause:'',args:[]};
 const names=[...new Set(searchNames(game).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,16);
 return {game,clause:' AND LOWER(TRIM(r.game)) IN ('+names.map(()=>'LOWER(?)').join(',')+')',args:names};
}
function visibleGameRooms(rows,game){
 const safe=Array.isArray(rows)?rows:[];
 return game?safe.filter(row=>row&&equivalent(game,row.game)):safe;
}
module.exports={gameFromQuery,gameRoomQuery,visibleGameRooms};
