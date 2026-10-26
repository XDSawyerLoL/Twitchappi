'use strict';
/* Public product state for paid channel subscriptions. No fake payment flows.
 * A subscription may be reported available only after verified billing,
 * KYC/creator eligibility, prices including VAT and real cancellation exist.
 */
const LOGIN=/^[a-z0-9_-]{2,48}$/;
function subscriptionState(login){
 return {success:true,creator:login,available:false,checkout_enabled:false,
  monthly_price_eur:null,active_subscription:false,unit:'month',
  label:"S'abonner",message:"L'abonnement mensuel à cette chaîne est en préparation. Aucun paiement n'est disponible pour le moment.",
  public_stream_free:true};
}
function installChannelSubscriptionStatus({app}={}){
 if(!app||typeof app.get!=='function')throw Error('app_required');
 app.get('/api/swapp/channel-subscriptions/:login/status',(req,res)=>{
  res.set('Cache-Control','no-store');
  const login=String(req.params.login||'').toLowerCase();
  if(!LOGIN.test(login))return res.status(400).json({success:false,error:'Chaîne invalide.'});
  res.json(subscriptionState(login));
 });
}
module.exports={subscriptionState,installChannelSubscriptionStatus};
