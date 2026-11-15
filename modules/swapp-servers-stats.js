'use strict';
/* Evidence: only persisted SWAPP actions. No inferred clicks, votes, rating, or player count. */
const safeCount=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
async function getProfileEvidence(sql,{id,game,votesMonth}){
 const firstMonth=new Date().toISOString().slice(0,7)+'-01';
 const [voteDays,clickDays,clickTotals,reviewTotals,reviewRows,ranking]=await Promise.all([
  sql.execute('SELECT DATE_FORMAT(voted_at,"%Y-%m-%d") AS day,COUNT(*) AS n FROM swapp_game_server_vote_events WHERE server_id=? AND voted_at>=UTC_TIMESTAMP()-INTERVAL 370 DAY GROUP BY day ORDER BY day',[id]),
  sql.execute('SELECT DATE_FORMAT(clicked_at,"%Y-%m-%d") AS day,COUNT(*) AS n FROM swapp_game_server_click_events WHERE server_id=? AND clicked_at>=UTC_TIMESTAMP()-INTERVAL 370 DAY GROUP BY day ORDER BY day',[id]),
  sql.execute('SELECT COUNT(*) AS allClicks,SUM(CASE WHEN clicked_at>=? THEN 1 ELSE 0 END) AS monthClicks FROM swapp_game_server_click_events WHERE server_id=?',[firstMonth,id]),
  sql.execute('SELECT COUNT(*) AS count,AVG(staff) AS staff,AVG(atmosphere) AS atmosphere,AVG(availability) AS availability FROM swapp_game_server_reviews WHERE server_id=? AND status="published"',[id]),
  sql.execute('SELECT staff,atmosphere,availability,comment,created_at AS createdAt FROM swapp_game_server_reviews WHERE server_id=? AND status="published" ORDER BY created_at DESC LIMIT 20',[id]),
  sql.execute('SELECT s.id,COUNT(v.id) AS votes FROM swapp_game_servers s LEFT JOIN swapp_game_server_vote_events v ON v.server_id=s.id AND v.voted_at>=? WHERE s.game=? AND s.status="published" GROUP BY s.id ORDER BY votes DESC,s.created_at ASC LIMIT 1000',[firstMonth,game])
 ]);
 const [allVoteRows]=await sql.execute('SELECT COUNT(*) AS n FROM swapp_game_server_vote_events WHERE server_id=?',[id]);
 const idx=ranking[0].findIndex(row=>row.id===id);
 return {
  rank:idx<0?null:idx+1,
  stats:{
   allVotes:safeCount(allVoteRows[0]?.n),allClicks:safeCount(clickTotals[0][0]?.allClicks),
   monthVotes:safeCount(votesMonth),monthClicks:safeCount(clickTotals[0][0]?.monthClicks),
   history:{
    votes:voteDays[0].map(x=>({day:String(x.day),count:safeCount(x.n)})),
    clicks:clickDays[0].map(x=>({day:String(x.day),count:safeCount(x.n)}))
   }
  },
  reviews:reviewRows[0],
  reviewSummary:{
   count:safeCount(reviewTotals[0][0]?.count),
   staff:reviewTotals[0][0]?.staff===null?null:Number(reviewTotals[0][0]?.staff),
   atmosphere:reviewTotals[0][0]?.atmosphere===null?null:Number(reviewTotals[0][0]?.atmosphere),
   availability:reviewTotals[0][0]?.availability===null?null:Number(reviewTotals[0][0]?.availability)
  }
 };
}
module.exports={getProfileEvidence};
