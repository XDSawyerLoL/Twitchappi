'use strict';
/**
 * SWAPP creator subscriptions and community gift packs.
 * MySQL ledger + Stripe Connect only. Off until pricing, creator KYC and legal
 * settings are explicitly configured. Never accepts a price from the browser.
 * No claims are granted from a Checkout redirect.
 */
const crypto = require('node:crypto');
const LOGIN = /^[a-z0-9_-]{2,48}$/;
const GIFT_PRESETS = [1, 5, 10, 20, 50, 100];
const DISCOUNT_DEFAULTS = Object.freeze({1:0,5:5,10:10,20:15,50:20,100:25});
const HOUR = 3600000;
const DAY = 24 * HOUR;
const noStore = res => res.set('Cache-Control','private, no-store');
function loginOf(v){const s=String(v||'').trim().toLowerCase();return LOGIN.test(s)?s:''}
function originAllowed(req){
  const raw=String(req.get('origin')||'');
  try{const u=new URL(raw);return u.protocol==='https:'&&
    ['swapp.tv','www.swapp.tv'].includes(u.hostname)&&u.host===req.get('host')}
  catch{return false}
}
function amount(v){const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:0}
function percent(v){const n=Number(v);return Number.isInteger(n)&&n>=0&&n<=60?n:null}
function count(v){
  const n=Number(v);
  return Number.isSafeInteger(n)&&n>=1&&n<=100?n:null;
}
function priceFor(quantity,unitCents,discounts=DISCOUNT_DEFAULTS){
  const n=count(quantity),base=amount(unitCents);
  if(!n||!base)throw Error('invalid_gift_price');
  const tier=GIFT_PRESETS.filter(p=>p<=n).pop()||1;
  const discount=percent(discounts[tier])??0;
  const unit=Math.max(1,Math.round(base*(100-discount)/100));
  return {quantity:n,unitCents:unit,totalCents:unit*n,savingsCents:(base-unit)*n,discountPercent:discount};
}
function membershipActive(row,at=Date.now()){
  return !!row&&['active','cancel_pending'].includes(row.status)&&Number(row.expires_at)>at;
}
function periodEnd(subscription){
  const seconds=Number(subscription?.items?.data?.[0]?.current_period_end||
    subscription?.current_period_end||0);
  return Number.isSafeInteger(seconds)&&seconds>0?seconds*1000:0;
}
function createCreatorSubscriptions({
  env=process.env, stripeClient=null, poolFactory=null,
  users=()=>[], now=()=>Date.now(), logger=console
}={}){
  const key=String(env.STRIPE_SECRET_KEY||'').trim();
  const priceCents=amount(env.SWAPP_SUBS_PRICE_CENTS);
  const feePercent=percent(env.SWAPP_SUBS_PLATFORM_PERCENT);
  const legalOk=env.SWAPP_SUBS_LEGAL_APPROVED==='1';
  const liveKey=key.startsWith('sk_live_');
  const testKey=key.startsWith('sk_test_');
  const allowed=new Set(String(env.SWAPP_SUBS_ALLOWED_CREATORS||'').split(',')
    .map(loginOf).filter(Boolean));
  const enabled=env.SWAPP_SUBS_ENABLED==='1'&&legalOk&&
    (testKey||(liveKey&&env.SWAPP_SUBS_LIVE_APPROVED==='1'))&&
    priceCents>=100&&priceCents<=100000&&feePercent!==null&&
    Boolean(env.SWAPP_MYSQL_URL);
  const stripe=stripeClient||(key?require('stripe')(key):null);
  let pool=null,connecting=null;
  async function db(){
    if(!env.SWAPP_MYSQL_URL)throw Error('subscriptions_mysql_missing');
    if(pool)return pool;
    if(connecting)return connecting;
    connecting=(async()=>{
      const p=poolFactory?await poolFactory():require('mysql2/promise').createPool({
        uri:env.SWAPP_MYSQL_URL,connectionLimit:4,waitForConnections:true,
        queueLimit:50,connectTimeout:5000,enableKeepAlive:true
      });
      try{
        await p.query('CREATE TABLE IF NOT EXISTS swapp_subs_creators ('+
          'creator_login VARCHAR(48) PRIMARY KEY, stripe_account_id VARCHAR(100) NOT NULL,'+
          'charges_enabled TINYINT(1) NOT NULL DEFAULT 0, payouts_enabled TINYINT(1) NOT NULL DEFAULT 0,'+
          'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'+
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        await p.query('CREATE TABLE IF NOT EXISTS swapp_subs_members ('+
          'viewer_id VARCHAR(80) NOT NULL,creator_login VARCHAR(48) NOT NULL,'+
          'status VARCHAR(24) NOT NULL, kind VARCHAR(16) NOT NULL,'+
          'stripe_subscription_id VARCHAR(255) NULL,stripe_customer_id VARCHAR(255) NULL,'+
          'expires_at BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,'+
          'PRIMARY KEY(viewer_id,creator_login),UNIQUE KEY uniq_subscription(stripe_subscription_id),'+
          'INDEX idx_swapp_sub_creator (creator_login,status,expires_at)'+
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        await p.query('CREATE TABLE IF NOT EXISTS swapp_subs_gift_orders ('+
          'session_id VARCHAR(255) PRIMARY KEY,creator_login VARCHAR(48) NOT NULL,'+
          'buyer_id VARCHAR(80) NOT NULL, quantity SMALLINT NOT NULL, allocated SMALLINT NOT NULL DEFAULT 0,'+
          'total_cents INT NOT NULL,status VARCHAR(24) NOT NULL, expires_at BIGINT NOT NULL,'+
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_swapp_gifts_claim(creator_login,status,expires_at)'+
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        await p.query('CREATE TABLE IF NOT EXISTS swapp_subs_gift_allocations ('+
          'session_id VARCHAR(255) NOT NULL,recipient_id VARCHAR(80) NOT NULL,'+
          'assigned_at BIGINT NOT NULL,PRIMARY KEY(session_id,recipient_id)'+
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        await p.query('CREATE TABLE IF NOT EXISTS swapp_subs_events ('+
          'event_id VARCHAR(255) PRIMARY KEY,received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'+
          ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        pool=p;return p;
      }catch(e){await p.end?.().catch(()=>{});throw e}
    })().finally(()=>{connecting=null});
    return connecting;
  }
  function identity(req){
    const u=req.session?.oryonUser;
    return u?.id?{id:String(u.id).slice(0,80),login:loginOf(u.login)}:null;
  }
  function people(){
    const result=users();
    return Array.isArray(result)?result:[];
  }
  function existsCreator(login){return people().some(u=>loginOf(u.login)===login)}
  async function creatorAccount(login){
    const [rows]=await (await db()).execute(
      'SELECT stripe_account_id,charges_enabled,payouts_enabled FROM swapp_subs_creators WHERE creator_login=?',[login]);
    return rows[0]||null;
  }
  async function member(viewerId,login){
    const [rows]=await (await db()).execute(
      'SELECT status,kind,expires_at,stripe_subscription_id FROM swapp_subs_members WHERE viewer_id=? AND creator_login=?',
      [viewerId,login]);
    const found=rows[0];
    return found?{active:membershipActive(found,now()),status:found.status,
      kind:found.kind,expiresAt:Number(found.expires_at)||0,cancelPending:found.status==='cancel_pending'}:
      {active:false,status:'none',kind:null,expiresAt:0,cancelPending:false};
  }
  async function pendingGifts(login){
    const [r]=await (await db()).execute(
      'SELECT COALESCE(SUM(quantity-allocated),0) AS available FROM swapp_subs_gift_orders '+
      'WHERE creator_login=? AND status=? AND expires_at>?',[login,'paid',now()]);
    return Math.max(0,Number(r[0]?.available||0));
  }
  async function onConfig(req,res){
    noStore(res);
    const creator=loginOf(req.query.creator);
    if(!creator||!existsCreator(creator))return res.status(404).json({success:false,error:'Chaîne introuvable.'});
    const viewer=identity(req);
    const configured=enabled&&allowed.has(creator);
    let connected=false,viewerMember={active:false,status:'none'},giftsAvailable=0;
    if(configured){
      try{
        const acc=await creatorAccount(creator);
        connected=!!(acc?.charges_enabled&&acc?.payouts_enabled);
        [viewerMember,giftsAvailable]=await Promise.all([
          viewer?member(viewer.id,creator):Promise.resolve(viewerMember),
          pendingGifts(creator)
        ]);
      }catch(e){return res.status(503).json({success:false,error:'Abonnements temporairement indisponibles.'})}
    }
    const visiblePrice=priceCents||499; // Demo preview only; checkout never uses this fallback.
    return res.json({success:true,creator,available:configured&&connected,configured,
      preview:!configured||!connected,priceCents:visiblePrice,currency:'EUR',
      giftsAvailable,authenticated:!!viewer,member:viewerMember,
      giftPacks:GIFT_PRESETS.map(q=>priceFor(q,visiblePrice)),
      maxGiftCount:100,creatorSetup:viewer?.login===creator&&allowed.has(creator)});
  }
  async function ownCreator(req,res){
    const id=identity(req),login=loginOf(req.body?.creator||req.query.creator);
    if(!id||!login||id.login!==login||!existsCreator(login))
      {res.status(403).json({success:false,error:'Cette chaîne ne t’appartient pas.'});return null}
    if(!allowed.has(login)||!enabled)
      {res.status(503).json({success:false,error:'Monétisation pas encore activée pour cette chaîne.'});return null}
    return login;
  }
  async function onboard(req,res){
    noStore(res);
    const creator=await ownCreator(req,res);if(!creator)return;
    try{
      let account=await creatorAccount(creator);
      if(!account){
        const s=await stripe.accounts.create({
          type:'express',country:'FR',
          capabilities:{transfers:{requested:true}},
          metadata:{swapp_creator_login:creator}
        });
        await (await db()).execute(
          'INSERT INTO swapp_subs_creators(creator_login,stripe_account_id) VALUES(?,?)',
          [creator,s.id]);
        account={stripe_account_id:s.id};
      }
      const url='https://swapp.tv/'+encodeURIComponent(creator);
      const link=await stripe.accountLinks.create({account:account.stripe_account_id,
        refresh_url:url+'?subscription_setup=retry',
        return_url:url+'?subscription_setup=return',type:'account_onboarding'});
      return res.json({success:true,url:link.url});
    }catch(e){logger.warn?.('[SWAPP SUBS] onboarding unavailable',e.code||e.name);
      return res.status(503).json({success:false,error:'Activation du compte de paiement indisponible.'})}
  }
  async function refreshCreator(req,res){
    noStore(res);
    const creator=await ownCreator(req,res);if(!creator)return;
    try{
      const acc=await creatorAccount(creator);
      if(!acc)return res.json({success:true,connected:false});
      const actual=await stripe.accounts.retrieve(acc.stripe_account_id);
      const charges=actual.charges_enabled===true,payouts=actual.payouts_enabled===true;
      await (await db()).execute('UPDATE swapp_subs_creators SET charges_enabled=?,payouts_enabled=? WHERE creator_login=?',
        [charges?1:0,payouts?1:0,creator]);
      return res.json({success:true,connected:charges&&payouts,chargesEnabled:charges,payoutsEnabled:payouts});
    }catch{return res.status(503).json({success:false,error:'Vérification Stripe indisponible.'})}
  }
  async function checkout(req,res){
    noStore(res);
    if(!originAllowed(req))return res.status(403).json({success:false,error:'Origine non autorisée.'});
    const viewer=identity(req);
    if(!viewer)return res.status(401).json({success:false,error:'Connexion SWAPP requise.'});
    const creator=loginOf(req.body?.creator),kind=req.body?.kind;
    if(!enabled||!stripe||!allowed.has(creator))
      return res.status(503).json({success:false,error:'Paiement indisponible pour cette chaîne.'});
    if(!existsCreator(creator))return res.status(404).json({success:false,error:'Chaîne introuvable.'});
    if(viewer.login===creator)return res.status(400).json({success:false,error:'Tu ne peux pas t’abonner à ta propre chaîne.'});
    const qty=kind==='gift'?count(req.body?.quantity):kind==='self'?1:null;
    if(!qty)return res.status(400).json({success:false,error:'Quantité invalide (1 à 100).'});
    const nonce=String(req.body?.nonce||'');
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(nonce))
      return res.status(400).json({success:false,error:'Identifiant de demande invalide.'});
    try{
      const account=await creatorAccount(creator);
      if(!account||!account.charges_enabled||!account.payouts_enabled)
        return res.status(503).json({success:false,error:'Ce créateur n’a pas encore activé les paiements.'});
      if(kind==='self'&&(await member(viewer.id,creator)).active)
        return res.status(409).json({success:false,error:'Tu soutiens déjà cette chaîne.'});
      const pricing=priceFor(qty,priceCents);
      const metadata={swapp_kind:kind,swapp_viewer_id:viewer.id,
        swapp_creator_login:creator,swapp_quantity:String(qty),
        swapp_total_cents:String(pricing.totalCents)};
      const url='https://swapp.tv/'+encodeURIComponent(creator);
      const shared={
        mode:kind==='gift'?'payment':'subscription',
        line_items:[{price_data:{currency:'eur',unit_amount:pricing.unitCents,
          product_data:{name:kind==='gift'?'SWAPP · '+qty+' abonnement(s) cadeau · '+creator:
            'SWAPP · Abonnement mensuel · '+creator},
          ...(kind==='self'?{recurring:{interval:'month'}}:{})},quantity:qty}],
        client_reference_id:viewer.id,metadata,
        success_url:url+'?support=return',cancel_url:url+'?support=cancelled',
        locale:'fr'
      };
      if(kind==='self'){
        shared.subscription_data={
          metadata,application_fee_percent:feePercent,
          transfer_data:{destination:account.stripe_account_id}
        };
      }else{
        shared.payment_intent_data={
          metadata,application_fee_amount:Math.round(pricing.totalCents*feePercent/100),
          transfer_data:{destination:account.stripe_account_id}
        };
      }
      const idempotencyKey=crypto.createHash('sha256').update(
        viewer.id+'|'+creator+'|'+kind+'|'+qty+'|'+nonce).digest('hex');
      const session=await stripe.checkout.sessions.create(shared,{idempotencyKey});
      if(!/^https:\/\/checkout\.stripe\.com\//.test(session.url||''))
        throw Error('unexpected_checkout_url');
      return res.json({success:true,url:session.url});
    }catch(e){logger.warn?.('[SWAPP SUBS] checkout unavailable',e.code||e.name);
      return res.status(503).json({success:false,error:'Impossible de préparer le paiement.'})}
  }
  async function writeMember(conn,{viewer,creator,status,kind,subscriptionId=null,customerId=null,expiresAt}){
    await conn.execute('INSERT INTO swapp_subs_members'+
      '(viewer_id,creator_login,status,kind,stripe_subscription_id,stripe_customer_id,expires_at)'+
      ' VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),'+
      'kind=VALUES(kind),stripe_subscription_id=VALUES(stripe_subscription_id),'+
      'stripe_customer_id=VALUES(stripe_customer_id),expires_at=VALUES(expires_at)',
      [viewer,creator,status,kind,subscriptionId,customerId,expiresAt]);
  }
  async function assignGifts(conn,{sessionId,creator,buyer,quantity,totalCents}){
    const [insert]=await conn.execute(
      'INSERT IGNORE INTO swapp_subs_gift_orders'+
      '(session_id,creator_login,buyer_id,quantity,allocated,total_cents,status,expires_at)'+
      ' VALUES(?,?,?,?,?,?,?,?)',
      [sessionId,creator,buyer,quantity,0,totalCents,'paid',now()+90*DAY]);
    if(insert.affectedRows!==1)return;
    const candidates=people().filter(u=>String(u.id)!==buyer&&
      loginOf(u.login)!==creator&&Array.isArray(u.following)&&u.following.includes(creator))
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    let allocated=0;
    for(const u of candidates){
      if(allocated>=quantity)break;
      const viewer=String(u.id||'').slice(0,80);
      if(!viewer)continue;
      const [rows]=await conn.execute(
        'SELECT status,expires_at FROM swapp_subs_members WHERE viewer_id=? AND creator_login=? FOR UPDATE',
        [viewer,creator]);
      if(membershipActive(rows[0],now()))continue;
      await writeMember(conn,{viewer,creator,status:'active',kind:'gift',expiresAt:now()+30*DAY});
      await conn.execute('INSERT IGNORE INTO swapp_subs_gift_allocations(session_id,recipient_id,assigned_at) VALUES(?,?,?)',
        [sessionId,viewer,now()]);
      allocated++;
    }
    if(allocated)await conn.execute('UPDATE swapp_subs_gift_orders SET allocated=? WHERE session_id=?',
      [allocated,sessionId]);
  }
  async function subscriptionPaid(conn,subscription){
    const md=subscription?.metadata||{};
    const viewer=String(md.swapp_viewer_id||'').slice(0,80),creator=loginOf(md.swapp_creator_login);
    if(!viewer||!creator||!allowed.has(creator)||!/^sub_/.test(String(subscription.id||'')))return;
    const expiresAt=periodEnd(subscription);
    if(!expiresAt||!['active','trialing'].includes(subscription.status))return;
    await writeMember(conn,{viewer,creator,
      status:subscription.cancel_at_period_end?'cancel_pending':'active',
      kind:'self',subscriptionId:subscription.id,customerId:String(subscription.customer||''),
      expiresAt});
  }
  async function processStripeEvent(event){
    const p=await db(),conn=await p.getConnection();
    try{
      await conn.beginTransaction();
      const [saved]=await conn.execute('INSERT IGNORE INTO swapp_subs_events(event_id) VALUES(?)',[event.id]);
      if(saved.affectedRows!==1){await conn.rollback();return {duplicate:true}}
      const obj=event.data?.object||{};
      if(event.type==='checkout.session.completed' && obj.payment_status==='paid' &&
        obj.metadata?.swapp_creator_login){
        const md=obj.metadata,creator=loginOf(md.swapp_creator_login),
          viewer=String(md.swapp_viewer_id||'').slice(0,80),
          quantity=count(md.swapp_quantity);
        if(creator&&viewer&&quantity&&allowed.has(creator)&&obj.id &&
          obj.client_reference_id===viewer){
          if(md.swapp_kind==='gift'&&obj.mode==='payment'){
            const total=amount(obj.amount_total);
            if(total===amount(md.swapp_total_cents)&&total>0)
              await assignGifts(conn,{sessionId:obj.id,creator,buyer:viewer,quantity,totalCents:total});
          }else if(md.swapp_kind==='self'&&obj.mode==='subscription'&&obj.subscription){
            const subscription=await stripe.subscriptions.retrieve(obj.subscription);
            await subscriptionPaid(conn,subscription);
          }
        }
      }
      if(event.type==='invoice.paid'){
        // Recurrent renewals: Stripe remains authoritative for end of paid period.
        const id=typeof obj.subscription==='string'?obj.subscription:
          obj.parent?.subscription_details?.subscription;
        if(typeof id==='string'&&id.startsWith('sub_')){
          const s=await stripe.subscriptions.retrieve(id);
          await subscriptionPaid(conn,s);
        }
      }
      if(['customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
        const id=String(obj.id||''),md=obj.metadata||{};
        const viewer=String(md.swapp_viewer_id||'').slice(0,80),creator=loginOf(md.swapp_creator_login);
        if(id.startsWith('sub_')&&viewer&&creator){
          const status=event.type==='customer.subscription.deleted'?'canceled':
            obj.status==='active'?(obj.cancel_at_period_end?'cancel_pending':'active'):
            obj.status==='past_due'?'past_due':'canceled';
          const expiresAt=periodEnd(obj);
          // Never grant membership from a subscription.updated before its paid checkout.
          await conn.execute('UPDATE swapp_subs_members SET status=?,expires_at=IF(? > 0,?,expires_at)'+
            ' WHERE viewer_id=? AND creator_login=? AND stripe_subscription_id=?',
            [status,expiresAt,expiresAt,viewer,creator,id]);
        }
      }
      if(event.type==='invoice.payment_failed'){
        const id=typeof obj.subscription==='string'?obj.subscription:
          obj.parent?.subscription_details?.subscription;
        if(id&&String(id).startsWith('sub_'))
          await conn.execute('UPDATE swapp_subs_members SET status=? WHERE stripe_subscription_id=?',
            ['past_due',id]);
      }
      await conn.commit();return {processed:true};
    }catch(e){await conn.rollback().catch(()=>{});throw e}
    finally{conn.release()}
  }
  async function webhook(req,res){
    if(!enabled||!stripe||!env.SWAPP_SUBS_STRIPE_WEBHOOK_SECRET)
      return res.status(503).json({error:'subscriptions_webhook_disabled'});
    let event;
    try{event=stripe.webhooks.constructEvent(req.rawBody,
      req.get('stripe-signature'),env.SWAPP_SUBS_STRIPE_WEBHOOK_SECRET)}
    catch{return res.status(400).json({error:'invalid_signature'})}
    try{await processStripeEvent(event);return res.json({received:true})}
    catch(e){logger.error?.('[SWAPP SUBS] webhook persist failed',e.code||e.name);
      return res.status(503).json({error:'temporary_processing_failure'})}
  }
  async function claim(req,res){
    noStore(res);
    if(!originAllowed(req))return res.status(403).json({success:false,error:'Origine non autorisée.'});
    const viewer=identity(req),creator=loginOf(req.body?.creator);
    if(!viewer)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
    if(!creator||!enabled||!allowed.has(creator))
      return res.status(503).json({success:false,error:'Cadeaux non disponibles.'});
    const u=people().find(u=>String(u.id)===viewer.id);
    if(!u||!Array.isArray(u.following)||!u.following.includes(creator))
      return res.status(403).json({success:false,error:'Suis cette chaîne pour recevoir un cadeau.'});
    const p=await db(),conn=await p.getConnection();
    try{
      await conn.beginTransaction();
      const [existing]=await conn.execute(
        'SELECT status,expires_at FROM swapp_subs_members WHERE viewer_id=? AND creator_login=? FOR UPDATE',
        [viewer.id,creator]);
      if(membershipActive(existing[0],now())){
        await conn.rollback();return res.status(409).json({success:false,error:'Abonnement déjà actif.'});
      }
      const [batch]=await conn.execute(
        'SELECT session_id,quantity,allocated FROM swapp_subs_gift_orders '+
        'WHERE creator_login=? AND status=? AND expires_at>? AND allocated<quantity '+
        'ORDER BY created_at ASC LIMIT 1 FOR UPDATE',[creator,'paid',now()]);
      if(!batch.length){
        await conn.rollback();return res.status(404).json({success:false,error:'Aucun cadeau disponible pour le moment.'});
      }
      await writeMember(conn,{viewer:viewer.id,creator,status:'active',kind:'gift',expiresAt:now()+30*DAY});
      await conn.execute('INSERT INTO swapp_subs_gift_allocations(session_id,recipient_id,assigned_at) VALUES(?,?,?)',
        [batch[0].session_id,viewer.id,now()]);
      await conn.execute('UPDATE swapp_subs_gift_orders SET allocated=allocated+1 WHERE session_id=?',
        [batch[0].session_id]);
      await conn.commit();return res.json({success:true,claimed:true});
    }catch(e){await conn.rollback().catch(()=>{});return res.status(503).json({success:false,error:'Cadeau temporairement indisponible.'})}
    finally{conn.release()}
  }
  async function cancel(req,res){
    noStore(res);
    if(!originAllowed(req))return res.status(403).json({success:false,error:'Origine non autorisée.'});
    const viewer=identity(req),creator=loginOf(req.body?.creator);
    if(!viewer)return res.status(401).json({success:false,error:'Connexion SWAPP requise.'});
    try{
      const [rows]=await (await db()).execute(
        'SELECT stripe_subscription_id,status FROM swapp_subs_members WHERE viewer_id=? AND creator_login=? AND kind=?',
        [viewer.id,creator,'self']);
      const s=rows[0]?.stripe_subscription_id;
      if(!s)return res.status(404).json({success:false,error:'Aucun abonnement mensuel à résilier.'});
      const result=await stripe.subscriptions.update(s,{cancel_at_period_end:true});
      // The signed webhook will update the entitlement; do not claim success from a redirect.
      return res.json({success:true,cancelAtPeriodEnd:result.cancel_at_period_end===true});
    }catch{return res.status(503).json({success:false,error:'Impossible de programmer la résiliation.'})}
  }
  async function dashboard(req,res){
    noStore(res);
    const creator=await ownCreator(req,res);if(!creator)return;
    try{
      const [members]=await (await db()).execute(
        'SELECT COUNT(*) AS total,SUM(kind=?) AS gifted FROM swapp_subs_members '+
        'WHERE creator_login=? AND status IN (?,?) AND expires_at>?',
        ['gift',creator,'active','cancel_pending',now()]);
      const [gifts]=await (await db()).execute(
        'SELECT COALESCE(SUM(quantity),0) AS purchased,COALESCE(SUM(allocated),0) AS assigned '+
        'FROM swapp_subs_gift_orders WHERE creator_login=? AND status=?',[creator,'paid']);
      return res.json({success:true,creator,activeMembers:Number(members[0]?.total||0),
        giftedMembers:Number(members[0]?.gifted||0),
        giftsPurchased:Number(gifts[0]?.purchased||0),giftsAssigned:Number(gifts[0]?.assigned||0)});
    }catch{return res.status(503).json({success:false,error:'Statistiques indisponibles.'})}
  }
  function register(app,limit=(req,res,next)=>next()){
    app.get('/api/swapp/subscriptions/config',onConfig);
    app.post('/api/swapp/subscriptions/checkout',limit,checkout);
    app.post('/api/swapp/subscriptions/claim',limit,claim);
    app.post('/api/swapp/subscriptions/cancel',limit,cancel);
    app.post('/api/swapp/subscriptions/creator/onboard',limit,(req,res)=>{if(!originAllowed(req))return res.status(403).json({success:false,error:'Origine non autorisée.'});return onboard(req,res)});
    app.post('/api/swapp/subscriptions/creator/refresh',limit,(req,res)=>{if(!originAllowed(req))return res.status(403).json({success:false,error:'Origine non autorisée.'});return refreshCreator(req,res)});
    app.get('/api/swapp/subscriptions/creator/dashboard',dashboard);
    app.post('/api/swapp/subscriptions/stripe-webhook',webhook);
  }
  return {register,enabled:()=>enabled,processStripeEvent};
}
module.exports={createCreatorSubscriptions,priceFor,membershipActive,periodEnd,DISCOUNT_DEFAULTS,GIFT_PRESETS,originAllowed};
