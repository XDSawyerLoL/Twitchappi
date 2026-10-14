'use strict';
const {contentToPlainText}=require('./justplayer-import-core');

const RICH_HINT=/(?:prose|rich.?text|post.?content|post.?body|article.?content|article.?body|tiptap|editor.?content|post.?rich|content.?body|markdown)/i;
function containerBlock(html, start, tag) {
 const first=html.indexOf('>',start);if(first<0)return '';
 const tokens=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');
 tokens.lastIndex=first+1;let depth=1,entry;
 while((entry=tokens.exec(html))){
   if(/^<\//.test(entry[0])){if(--depth===0)return html.slice(first+1,entry.index);}
   else if(!/\/>$/.test(entry[0]))depth++;
 }
 return '';
}
function cleanHtml(html){
 return String(html||'')
 .replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
 .replace(/<!--[\s\S]*?-->/g,'');
}
function extractRichPostBlock(html){
 const markup=cleanHtml(html);
 const candidates=[];
 const opening=/<(article|div|section|main)\b([^>]*)>/gi;let found,count=0;
 while((found=opening.exec(markup))){
   if(++count>12500)break;
   const tag=found[1].toLowerCase(),attrs=found[2]||'';
   if(tag!=='article'&&!(RICH_HINT.test(attrs)))continue;
   const block=containerBlock(markup,found.index,tag);
   if(block.length<200||block.length>500000)continue;
   const text=contentToPlainText(block);
   const words=text.split(/\s+/).filter(Boolean).length;
   const paragraphs=(block.match(/<(p|h[2-5]|li)\b/gi)||[]).length;
   if(text.length<220||words<42||paragraphs<3)continue;
   const hasPaywall=/^(?:login|join now|subscribe to unlock|unlock exclusive content)/i.test(text);
   if(hasPaywall)continue;
   // Prefer substantive article prose over the site shell, comments and related links.
   const score=Math.min(words,1500)+Math.min(paragraphs*18,400)+(tag==='article'?60:0);
   candidates.push({body:block,score,words});
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0]?.body||'';
}
module.exports={extractRichPostBlock};
