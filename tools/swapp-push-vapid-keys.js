'use strict';
/* Run locally: node tools/swapp-push-vapid-keys.js
 * Generates a fresh key pair with built-in crypto, no paid service/network.
 * Put these values in private Hostinger environment variables, NEVER git.
 */
const crypto=require('node:crypto');
const key=crypto.createECDH('prime256v1');key.generateKeys();
process.stdout.write('SWAPP_PUSH_VAPID_PUBLIC_KEY='+key.getPublicKey().toString('base64url')+'\n');
process.stdout.write('SWAPP_PUSH_VAPID_PRIVATE_KEY='+key.getPrivateKey().toString('base64url')+'\n');
process.stdout.write('SWAPP_PUSH_VAPID_SUBJECT=mailto:contact@swapp.tv\n');
process.stdout.write('SWAPP_PUSH_ENABLED=1\n');
// SWAPP_ACCOUNT_STORE=mysql and SWAPP_MYSQL_URL are separate prerequisites.
