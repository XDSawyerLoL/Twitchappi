import { dom, esc, icon, initials, timeAgo, setStatus } from './core.js';

function secureMediaUrl(value){
  try{
    const u=new URL(String(value||''));
    return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password?u.href:'';
  }catch{return ''}
}
export function renderPost(post){
  if(!post||typeof post!=='object')return '';
  const user=post.author||{};
  const liked=post.viewer?.liked;
  const reposted=post.viewer?.reposted;
  const bookmarked=post.viewer?.bookmarked;
  let quote='';
  let media='';
  const imageUrl=secureMediaUrl(post.mediaUrl||post.imageUrl||'');
  const linkUrl=secureMediaUrl(post.linkUrl||'');
  const linkTitle=post.linkTitle||'';
  let hostname='';
  try{hostname=new URL(linkUrl).hostname.replace(/^www\./,'')}catch{}
  const localNews=hostname==='swapp.tv';
  const linkLabel=localNews?'ARTICLE SWAPP':'LIEN PARTAGÉ';
  const previewText='<div class="pulse-rich-details"><small class="pulse-rich-kicker">'+linkLabel+'</small>'+
    '<strong>'+esc(linkTitle||'Découvrir cet article')+'</strong>'+
    '<span class="pulse-rich-host">'+esc(hostname||'Voir le lien')+'</span></div>';
  if(imageUrl){
    const image='<img src="'+esc(imageUrl)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
    media=linkUrl
      ? '<a class="pulse-rich-card pulse-rich-link-preview" href="'+esc(linkUrl)+'" target="_blank" rel="noopener noreferrer">'+image+previewText+'</a>'
      : '<div class="pulse-rich-card pulse-rich-media">'+image+(post.mediaType==='gif'?'<div><strong>GIF</strong></div>':'')+'</div>';
  }else if(linkUrl){
    media='<a class="pulse-rich-card pulse-rich-link-preview pulse-rich-text-preview" href="'+esc(linkUrl)+'" target="_blank" rel="noopener noreferrer">'+previewText+'</a>';
  }

  if(post.quote){
    quote='<div class="pulse-post-link"><div><small>@'+esc(post.quote.author?.handle||'membre')+'</small><strong>'+esc(post.quote.body||'')+'</strong></div></div>';
  }

  return '<article class="pulse-post" data-id="'+esc(post.id)+'">'+
    '<div class="pulse-avatar">'+esc(initials(user))+'</div>'+
    '<div class="pulse-post-main">'+
      '<div class="pulse-post-head"><button data-profile="'+esc(user.handle)+'">'+esc(user.displayName||user.handle)+'</button>'+(user.verified?'<span class="pulse-badge" title="Compte vérifié">'+icon('pi-verified')+'</span>':'')+'<span>@'+esc(user.handle)+' · '+esc(timeAgo(post.createdAt))+'</span></div>'+
      (linkTitle && String(post.body||'').trim().replace(/\s*Source\s*:\s*SWAPP\s*$/i,'').trim()===String(linkTitle).trim() ? '' : '<p>'+esc(post.body)+'</p>')+media+quote+
      '<div class="pulse-actions">'+
        '<button class="pulse-action" data-action="reply" aria-label="Répondre" title="Répondre">'+icon('pi-reply')+'<span class="pulse-action-name">Répondre</span><span class="pulse-action-count">'+Number(post.counts?.replies||0)+'</span></button>'+
        '<button class="pulse-action '+(reposted?'active':'')+'" data-action="repost" aria-label="Reposter" aria-pressed="'+String(Boolean(reposted))+'" title="Relayer cette publication">'+icon('pi-relay')+'<span class="pulse-action-name">Relayer</span><span class="pulse-action-count">'+Number(post.counts?.reposts||0)+'</span></button>'+
        '<button class="pulse-action '+(liked?'liked':'')+'" data-action="like" aria-label="J’aime" aria-pressed="'+String(Boolean(liked))+'" title="Aimer cette publication">'+icon('pi-pulse','pi-pulse')+'<span class="pulse-action-name">J’aime</span><span class="pulse-action-count">'+Number(post.counts?.likes||0)+'</span></button>'+
        '<button class="pulse-action '+(bookmarked?'active':'')+'" data-action="bookmark" aria-label="Enregistrer" aria-pressed="'+String(Boolean(bookmarked))+'" title="Enregistrer">'+icon('pi-bookmark')+'</button>'+
        '<button class="pulse-action" data-action="share" aria-label="Partager" title="Partager">'+icon('pi-share')+'</button>'+
        '<button class="pulse-action danger" data-action="report" aria-label="Signaler" title="Signaler">'+icon('pi-report')+'</button>'+
      '</div>'+
    '</div>'+
  '</article>';
}

export function renderPosts(posts,emptyText='Aucune publication pour le moment.'){
  const valid=Array.isArray(posts)?posts.filter(post=>post&&typeof post==='object'&&post.id):[];
  if(!valid.length){
    setStatus('Rien ici pour le moment',emptyText);
    return;
  }
  dom.feed.innerHTML=valid.map(renderPost).join('');
}

export function notificationLabel(type){
  return {
    like:'a envoyé un SOCIAL à ta publication.',
    repost:'a relayé ta publication.',
    reply:'a répondu à ta publication.',
    quote:'a cité ta publication.',
    follow:'s’est abonné à ton profil.',
    message:'t’a envoyé un message.'
  }[type]||'a interagi avec toi.';
}
