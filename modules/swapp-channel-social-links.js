'use strict';
/* Public creator-defined Signal / Bluesky / Mastodon / Minds links.
 * Stored on the SWAPP account, not user localStorage or the viewer browser.
 * Reject non-HTTPS, credentials, invalid platforms, cross-brand phishing URLs.
 */
const PROVIDERS=Object.freeze(['signal','bluesky','mastodon','minds']);
function socialLink(value,provider){
 const raw=String(value||'').trim();
 if(!raw)return '';
 if(raw.length>500)throw Error('swapp_social_link_invalid');
 let parsed;
 try{parsed=new URL(raw)}catch(_){throw Error('swapp_social_link_invalid')}
 const hostname=parsed.hostname.toLowerCase();
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
  !hostname||!hostname.includes('.')||hostname.endsWith('.local')||
  hostname.endsWith('.internal')||hostname==='localhost'||
  /^\d+\.\d+\.\d+\.\d+$/.test(hostname))
  throw Error('swapp_social_link_invalid');
 const path=decodeURIComponent(parsed.pathname);
 switch(provider){
  case 'signal':
   if(!['signal.me','signal.group'].includes(hostname)||
      (!parsed.hash&&path==='/'))throw Error('swapp_social_link_invalid');
   break;
  case 'bluesky':
   if(hostname!=='bsky.app'||!/^\/profile\/[^/]+(?:\/)?$/i.test(path))
    throw Error('swapp_social_link_invalid');
   break;
  case 'minds':
   if(!['minds.com','www.minds.com'].includes(hostname)||
      !/^\/[a-z0-9_.-]+(?:\/)?$/i.test(path))
    throw Error('swapp_social_link_invalid');
   break;
  case 'mastodon':
   if(!/^\/(?:@[^/]+|users\/[^/]+)(?:\/)?$/i.test(path))
    throw Error('swapp_social_link_invalid');
   break;
  default:throw Error('swapp_social_link_invalid');
 }
 return parsed.href;
}
function normalizeChannelSocialLinks(value){
 const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return Object.fromEntries(PROVIDERS.map(provider=>[provider,socialLink(input[provider],provider)]));
}
module.exports={PROVIDERS,socialLink,normalizeChannelSocialLinks};
