'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {publicLegalDetails,legalSupplement}=require('../modules/swapp-news/legal-pages');
test('publisher metadata requires real configured details, not fabricated defaults',()=>{
 const empty=publicLegalDetails({});
 assert.deepEqual(empty,{publisher:'',address:'',registration:'',hosting:'',contact:'',privacy:''});
 const values=publicLegalDetails({
  SWAPP_LEGAL_PUBLISHER_NAME:'Éditeur confirmé',
  SWAPP_LEGAL_PUBLISHER_ADDRESS:'Adresse confirmée',
  SWAPP_LEGAL_CONTACT_EMAIL:'contact@example.org',
  SWAPP_LEGAL_PRIVACY_EMAIL:'privacy@example.org',
  SWAPP_LEGAL_HOST_DETAILS:'Hébergeur et coordonnées vérifiés'
 });
 assert.equal(values.contact,'contact@example.org');
 assert.equal(values.privacy,'privacy@example.org');
 assert.match(legalSupplement('/contact',values),/mailto:contact@example.org/);
 assert.match(legalSupplement('/confidentialite',values),/mailto:privacy@example.org/);
 assert.match(legalSupplement('/mentions-legales',values),/Éditeur confirmé/);
 assert.doesNotMatch(legalSupplement('/contact',empty),/mailto:/);
});
test('publisher metadata does not allow mailto injection or HTML injection',()=>{
 const v=publicLegalDetails({SWAPP_LEGAL_PUBLISHER_NAME:'<script>alert(1)</script>',SWAPP_LEGAL_CONTACT_EMAIL:'evil@example.org\\nBcc:hijack@example.org'});
 assert.equal(v.contact,'');
 assert.doesNotMatch(legalSupplement('/mentions-legales',v),/<script>/);
 assert.match(legalSupplement('/mentions-legales',v),/&lt;script&gt;/);
});
test('CMP settings button is conditional on the real Google CMP and TCF GDPR signal',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../assets/swapp-footer.js'),'utf8');
 assert.match(src,/CONSENT_API_READY/);
 assert.match(src,/showRevocationMessage/);
 assert.match(src,/data?.gdprApplies!==true/);
 assert.match(src,/typeof window\.__tcfapi!=='function'/);
 assert.doesNotMatch(src,/localStorage\.setItem\(['"]consent/);
});
