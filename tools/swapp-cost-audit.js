'use strict';
// One-shot local Hostinger cost-risk inspection. NO network calls, scheduling,
// secret values or account-level billing guesses.
try{require('dotenv').config()}catch(_){}
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const configured=name=>typeof process.env[name]==='string'&&process.env[name].trim().length>0;
const code=fs.readFileSync(path.join(root,'server.js'),'utf8');
const protectedGemini=/const SWAPP_PAID_AI_ENABLED = false;/.test(code)
 &&/const GEMINI_API_KEY = SWAPP_PAID_AI_ENABLED \? process\.env\.GEMINI_API_KEY : null;/.test(code);
const results={
  execution:'local-only',
  networkRequests:0,
  recurringJobsCreated:0,
  secretsPrinted:false,
  paidGeminiRequestsBlockedByCurrentCode:protectedGemini,
  geminiKeyStillConfigured:configured('GEMINI_API_KEY'),
  possibleBillableServices:{
   firestoreOrGoogleCloud:configured('GOOGLE_APPLICATION_CREDENTIALS')||configured('FIREBASE_SERVICE_ACCOUNT')||configured('FIREBASE_PRIVATE_KEY'),
   cloudStorage:code.includes('@google-cloud/storage'),
   resend:configured('RESEND_API_KEY'),
   sendgrid:configured('SENDGRID_API_KEY'),
   stripePayments:configured('STRIPE_SECRET_KEY'),
   socialRenderUpstream:code.includes('swapp-social-native-proxy')
  },
  notes:[
   'This report is NOT a billing statement and cannot tell what Google, GitHub, Render or Hostinger charged.',
   'The Google AI API key should be revoked if not used by any other project.',
   'Firestore, Google Cloud Storage, payment/email providers and Render may have independent charges.',
   'Removing the SWAPP workflow does not cancel other repositories workflows or historical charges.'
  ]
};
process.stdout.write(JSON.stringify(results,null,2)+'\n');
if(!protectedGemini){process.exitCode=1}
