'use strict';
/* Read-only evidence from published SWAPP actions; failures never fabricate figures. */
const safeCount=n=>n===null||n===undefined||!Number.isSafeInteger(Number(n))||Number(n)<0?null:Number(n);
async function getProfileEvidence(sql,{id,game,votesMonth}){
 const firstMonth=new Date().toISOString().slice(0,7)+'-01';
 const jobs=[
  ['voteDays','SELECT DATE_FORMAT(voted_at,"%Y-%m-%d") AS day,COUNT(*) AS n FROM swapp_game_server_vote_events WHERE server_id=? AND voted_at>=UTC_TIMESTAMP()-INTERVAL 370 DAY GROUP BY day ORDER BY day',[id]],
  ['clickDays','SELECT DATE_FORMAT(clicked_at,"%Y-%m-%d") AS day,COUNT(*) AS n FROM swapp_game_server_click_events WHERE server_id=? AND clicked_at>=UTC_TIMESTAMP()-INTERVAL 370 DAY GROUP BY day ORDER BY day',[id]],
  ['clickTotals','SELECT COUNT(*) AS allClicks,SUM(CASE WHEN clicked_at>=? THEN 1 ELSE 0 END) AS monthClicks FROM swapp_game_server_click_events WHERE server_id=?',[firstMonth,id]],
  ['reviewTotals','SELECT COUNT(*) AS count,AVG(staff) AS staff,AVG(atmosphere) AS atmosphere,AVG(availability) AS availability FROM swapp_game_server_reviews WHERE server_id=? AND status="published"',[id]],
  ['reviewRows','SELECT staff,atmosphere,availability,comment,created_at AS createdAt FROM swapp_game_server_reviews WHERE server_id=? AND status="published" ORDER BY created_at DESC LIMIT 20',[id]],
  ['ranking','SELECT s.id,(SELECT COUNT(*) FROM swapp_game_server_vote_events v WHERE v.server_id=s.id AND v.voted_at>=?) AS votes FROM swapp_game_servers s WHERE s.game=? AND s.status="published" ORDER BY votes DESC,s.created_at ASC LIMIT 1000',[firstMonth,game]],
  ['allVotes','SELECT COUNT(*) AS n FROM swapp_game_server_vote_events WHERE server_id=?',[id]]
 ];
 const settled=await Promise.allSettled(jobs.map(([,query,args])=>sql.execute(query,args)));
 const data={};
 settled.forEach((r,i)=>{
  if(r.status==='fulfilled')data[jobs[i][0]]=Array.isArray(r.value?.[0])?r.value[0]:[];
  else{
   data[jobs[i][0]]=null;
   console.warn('[SWAPP SERVEURS] Statistiques fiche',jobs[i][0],String(r.reason?.code||r.reason?.message||'unknown').slice(0,60));
  }
 });
 const rankRows=data.ranking;
 const idx=rankRows?rankRows.findIndex(r=>r.id===id):-1;
 const reviewTotal=data.reviewTotals?.[0];
 const hasReviews=!!reviewTotal;
 const clicks=data.clickTotals?.[0];
 return {
  rank:idx<0?null:idx+1,
  stats:{
   allVotes:data.allVotes?safeCount(data.allVotes[0]?.n):null,
   allClicks:clicks?safeCount(clicks.allClicks):null,
   monthVotes:safeCount(votesMonth),
   monthClicks:clicks?safeCount(clicks.monthClicks):null,
   history:{
    votes:data.voteDays?.map(x=>({day:String(x.day),count:safeCount(x.n)||0}))||[],
    clicks:data.clickDays?.map(x=>({day:String(x.day),count:safeCount(x.n)||0}))||[]
   },
   historyAvailable:!!data.voteDays&&!!data.clickDays
  },
  reviews:data.reviewRows||[],
  reviewSummary:hasReviews?{
   count:safeCount(reviewTotal.count),
   staff:reviewTotal.staff==null?null:Number(reviewTotal.staff),
   atmosphere:reviewTotal.atmosphere==null?null:Number(reviewTotal.atmosphere),
   availability:reviewTotal.availability==null?null:Number(reviewTotal.availability)
  }:null
 };
}
module.exports={getProfileEvidence};
