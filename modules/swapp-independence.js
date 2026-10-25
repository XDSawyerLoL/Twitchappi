'use strict';
// SWAPP Independence v1: user-owned data export, never a follower directory.
// File is intentionally JSON and schema-versioned for independent reuse.
const {layout}=require('./swapp-news/site-shell');
const LOGIN=/^[a-z0-9_-]{2,40}$/;
const clipped=(value,max=400)=>String(value??'').slice(0,max);
const safeUrl=value=>{
 const s=clipped(value,2048).trim();
 if(/^\/(?!\/)[^\s<>]*$/.test(s))return s;
 if(/^https:\/\/[^\s<>@]+$/i.test(s))return s;
 return '';
};
const strings=(list,limit=80,max=80)=>[...new Set((Array.isArray(list)?list:[])
 .map(x=>clipped(x,max).trim()).filter(Boolean))].slice(0,limit);
const media=u=>safeUrl(u);
function buildArchive(user,{now=new Date()}={}){
 if(!user||!LOGIN.test(String(user.login||'')))throw Error('swapp_export_invalid_owner');
 const date=now instanceof Date&&!Number.isNaN(now.getTime())?now.toISOString():new Date().toISOString();
 const login=String(user.login);
 return {
  format:'swapp-independence',version:1,exported_at:date,
  description:'Données exportées par leur propriétaire. Pas de données personnelles des abonnés, de clés de stream ni de jetons.',
  account:{
   login,email:clipped(user.email,160),display_name:clipped(user.display_name||login,80),
   created_at:user.createdAt||null
  },
  channel:{
   public_url:'https://swapp.tv/'+login,
   is_public:user.channel_public!==false,
   description:clipped(user.bio,4000),
   language:clipped(user.language||'fr',16),
   content_rating:clipped(user.content_rating||'general',30),
   tags:strings(user.tags,40,60),
   avatar_url:media(user.avatar_url),
   banner_url:media(user.banner_url),
   offline_image_url:media(user.offline_image_url),
   links:(Array.isArray(user.channel_links)?user.channel_links:[]).slice(0,16).map(x=>({
    title:clipped(x?.title||x?.label,100),url:safeUrl(x?.url||x?.href)
   })).filter(x=>x.url),
   panels:(Array.isArray(user.channel_panels)?user.channel_panels:[]).slice(0,24).map(x=>({
    title:clipped(x?.title,160),text:clipped(x?.text||x?.description,3000),
    image_url:media(x?.image_url),url:safeUrl(x?.url||x?.link)
   })),
   vignettes:(Array.isArray(user.channel_vignettes)?user.channel_vignettes:[]).slice(0,24).map(x=>({
    title:clipped(x?.title,160),text:clipped(x?.text||x?.description,1000),
    image_url:media(x?.image_url),url:safeUrl(x?.url||x?.link)
   }))
  },
  community:{
   following:strings(user.following,500,40).filter(x=>LOGIN.test(x)),
   followers_count:Math.max(0,Math.floor(Number(user.followers_count)||0)),
   followers_exported:false,
   note:'Seuls les comptes suivis par le titulaire sont inclus. Les profils privés de ses abonnés ne sont jamais divulgués.'
  },
  notes:{
   media:'Les images externes et vidéos ne sont pas incluses en octets. Leurs liens publics peuvent expirer.',
   payments:'Aucune donnée bancaire ni souscription tierce n’est incluse.',
   third_party:'Les abonnés Twitch/Kick ne sont pas transférables depuis SWAPP.',
   portability:'Cet export ne supprime pas le compte. Il est destiné à être conservé ou réutilisé par son titulaire.'
  }
 };
}
function page(){
 const content=`<main class="swapp-independence" style="max-width:930px;margin:48px auto 110px;padding:0 24px;color:inherit">
 <header style="padding:40px 0 25px;border-bottom:1px solid #9ca3af44"><span style="letter-spacing:.2em;font-size:12px">SWAPP / INDÉPENDANCE</span><h1 style="font-size:clamp(36px,6vw,70px);line-height:1.05;margin:16px 0">Ta chaîne. Tes données. <em>Ta liberté.</em></h1><p style="font-size:17px;max-width:62ch;line-height:1.7">Tu peux récupérer les informations de ton profil et la liste des chaînes que tu suis sur SWAPP. Aucune obligation de rester sur une plateforme pour retrouver tes propres données.</p></header>
 <section aria-labelledby="swapp-independent-export" style="padding:28px 0"><h2 id="swapp-independent-export">Exporter mes données SWAPP</h2>
 <p>Un fichier JSON lisible contenant ton profil public, la personnalisation de ta chaîne, tes liens et les chaînes que tu suis. Aucune clé de diffusion, aucun mot de passe, aucun jeton d’accès et aucune donnée privée de tes abonnés.</p>
 <p><a href="/api/oryon/independence/export" download="swapp-independence.json" style="display:inline-block;background:var(--swapp-page-accent,#67dce8);color:#061013;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:6px">Télécharger mes données</a> <a href="/compte" style="margin-left:12px">Mon compte</a></p>
 <p style="font-size:13px;opacity:.72">Connexion SWAPP requise. L’export n’efface rien. Les images hébergées ailleurs ne sont pas copiées. Pour une demande RGPD couvrant d'autres données, utilise la page Contact.</p></section></main>`;
 return layout({title:'SWAPP Indépendance — Export de mes données',description:'Télécharger une copie portable de son profil et de ses abonnements SWAPP.',content,active:'compte'});
}
module.exports={buildArchive,page,safeUrl};
