/* SWAPP Web Push service worker: opt-in notifications only, no tracking,
 * interception of live video, caching or cross-origin fetches. */
'use strict';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('push',event=>{
 if(!event.data)return;
 let data;
 try{data=event.data.json()}catch{return}
 if(!data||typeof data!=='object')return;
 let url;
 try{
  url=new URL(String(data.url||'/'),self.location.origin);
  if(url.origin!==self.location.origin)return;
 }catch{return}
 const title=String(data.title||'SWAPP Live').slice(0,100);
 event.waitUntil(self.registration.showNotification(title,{
  body:String(data.body||'Un streamer suivi est en direct.').slice(0,160),
  icon:'/favicon.ico',badge:'/favicon.ico',
  tag:String(data.tag||'swapp-live').slice(0,80),
  data:{url:url.href}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=event.notification.data?.url;
 if(!url)return;
 event.waitUntil((async()=>{
  const target=new URL(url,self.location.origin);
  if(target.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===target.origin){
    await client.focus();
    if('navigate' in client)await client.navigate(target.href);
    return;
   }
  }
  await self.clients.openWindow(target.href);
 })());
});
