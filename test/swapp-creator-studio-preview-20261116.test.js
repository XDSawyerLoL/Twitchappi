'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../assets/swapp-creator-external-videos.js'),'utf8');
const start=src.indexOf('function videoEmbed(v){'),end=src.indexOf('\nfunction card(v){',start);
test('Creator Studio previews supported links without automatically loading external media',()=>{
 assert.ok(start>=0&&end>start);
 const embed=new Function(src.slice(start,end)+';return videoEmbed;')();
 const id='aBcD12ef_G-';
 for(const url of ['https://youtu.be/'+id,'https://www.youtube.com/watch?v='+id,'https://www.youtube.com/shorts/'+id,'https://m.youtube.com/live/'+id])
  assert.equal(embed({url}),'https://www.youtube-nocookie.com/embed/'+id);
 assert.equal(embed({url:'https://odysee.com/@creator:abc123/movie:deadbeef'}),'https://odysee.com/$/embed/@creator:abc123/movie:deadbeef');
 for(const url of ['http://youtu.be/'+id,'https://youtu.be/'+id+'#bad','https://evil.example/watch?v='+id,'https://youtube.com.evil.test/watch?v='+id])assert.equal(embed({url}),'');
 assert.match(src,/Aperçu avant publication/);
 assert.match(src,/Creator Studio · Organiser mes vidéos/);
});
test('all creator workspaces share the same dark surface',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-creator-workspace.css'),'utf8');
 assert.match(css,/#settings\.view\.active,#dashboard\.view\.active,#manager\.view\.active,#studio\.view\.active/);
 assert.match(css,/--swapp-workspace-panel:#101215/);
 assert.doesNotMatch(css,/background:#141f2c!important/);
});

test('safe YouTube artwork and inline title editing have no autoplay',()=>{
 const a=src.indexOf('function videoEmbed(v){'),b=src.indexOf('\nfunction card(v){',a);
 assert.ok(a>=0&&b>a);
 const helpers=new Function('URL',src.slice(a,b)+';return {videoThumbnail,sourceName};')(URL);
 const id='aBcD12ef_G-';
 assert.equal(helpers.videoThumbnail({url:'https://youtu.be/'+id}),'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg');
 assert.equal(helpers.videoThumbnail({url:'https://youtube.com.evil.test/watch?v='+id}),'');
 assert.equal(helpers.videoThumbnail({url:'https://odysee.com/@user:abcd/video:1234'}),'');
 assert.equal(helpers.sourceName({url:'https://odysee.com/@user:abcd/video:1234'}),'Odysee');
 assert.match(src,/image\.loading='lazy'/);
 assert.match(src,/image\.referrerPolicy='no-referrer'/);
 assert.match(src,/Titre de la vidéo/);
 assert.match(src,/input\.addEventListener\('input'/);
 assert.ok(src.indexOf('stage.append(image)')<src.indexOf("play.addEventListener('click'"));
});
