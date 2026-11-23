#!/usr/bin/env node
'use strict';
// Explicit, reviewable remediation. Run locally with npm registry access.
// Does not change package-lock until npm can resolve and verify packages.
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'../package.json');
const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
const direct={
  'nodemailer':'^10.1.4',
  'body-parser':'^1.20.6'
};
const overrides={
  'proxy-addr':'2.0.8',
  'websocket-driver':'0.7.5',
  '@grpc/grpc-js':'1.14.5',
  '@fastify/busboy':'3.2.2',
  'node-forge':'1.4.1',
  'qs':'6.16.1',
  'protobufjs':'7.6.5',
  'ws':'8.21.0',
  'fast-xml-builder':'1.1.7',
  'engine.io':'6.6.10',
  'socket.io-parser':'4.2.7',
  'form-data':'2.5.6'
};
// uuid 11 is a major upgrade; verify transitive parents before overriding.
// Never run npm audit fix --force or blindly override incompatible majors.
for(const [name,version] of Object.entries(direct)){
 if(!pkg.dependencies?.[name])throw new Error('Expected direct dependency missing: '+name);
 pkg.dependencies[name]=version;
}
pkg.overrides={...(pkg.overrides||{}),...overrides};
pkg.scripts={...pkg.scripts,'security:verify':'npm audit --omit=dev && npm run check && npm test'};
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n');
console.log('Prepared package.json. NEXT: npm install --package-lock-only --ignore-scripts');
console.log('Then: npm ci && npm run security:verify');
console.log('Review npm audit findings, dependency compatibility and the resulting lockfile before merging.');
