'use strict';
const crypto=require('node:crypto');
const MAX_PANEL_IMAGE_BYTES=1100000;
const DDL=`CREATE TABLE IF NOT EXISTS swapp_channel_panel_images (
 owner_id VARCHAR(80) NOT NULL,
 image_hash CHAR(64) NOT NULL,
 mime VARCHAR(24) NOT NULL,
 image_data MEDIUMBLOB NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY (owner_id,image_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
function panelImagePayload(value){
 const raw=String(value||'');
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(raw);
 if(!match)throw Error('swapp_panel_image_format_invalid');
 const mime='image/'+match[1].toLowerCase();
 if(match[2].length>Math.ceil(MAX_PANEL_IMAGE_BYTES*4/3)+6)throw Error('swapp_panel_image_too_large');
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>MAX_PANEL_IMAGE_BYTES)throw Error('swapp_panel_image_too_large');
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
 if(!(mime==='image/jpeg'&&jpg||mime==='image/png'&&png||mime==='image/webp'&&webp))
  throw Error('swapp_panel_image_signature_invalid');
 return {mime,bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function panelMediaUrl(login,hash){
 if(!/^[a-z0-9_-]{3,40}$/.test(String(login||''))||!/^[0-9a-f]{64}$/.test(String(hash||'')))
  throw Error('swapp_panel_image_url_invalid');
 return '/api/oryon/panel-image/'+encodeURIComponent(login)+'/'+hash;
}
module.exports={DDL,MAX_PANEL_IMAGE_BYTES,panelImagePayload,panelMediaUrl};
