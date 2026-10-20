'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  COOKIE_NAME,LINK_TTL_MS,
  issueCreatorTwitchLinkProof,verifyCreatorTwitchLinkProof,findExistingTwitchOwner
}=require('../lib/creator-twitch-link');
const state='a'.repeat(64), secret='some-random-stable-secret';
const now=1792499400000;
const pathInRepo=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Creator Twitch linking is bound to a real SWAPP account and OAuth state',()=>{
  const cookieValue=issueCreatorTwitchLinkProof({state,userId:'swapp_user_123',secret,now});
  assert.equal(COOKIE_NAME,'swapp.creator.twitch.link');
  assert.equal(verifyCreatorTwitchLinkProof({state,cookieValue,secret,now:now+1000}),'swapp_user_123');
  assert.equal(verifyCreatorTwitchLinkProof({state:'b'.repeat(64),cookieValue,secret,now}),null);
  assert.equal(verifyCreatorTwitchLinkProof({state,cookieValue,secret:'different',now}),null);
  assert.equal(verifyCreatorTwitchLinkProof({state,cookieValue:cookieValue.slice(0,-1)+'f',secret,now}),null);
  assert.equal(verifyCreatorTwitchLinkProof({state,cookieValue,secret,now:now+LINK_TTL_MS+1}),null);
  assert.equal(verifyCreatorTwitchLinkProof({state,cookieValue,secret,now:now-31000}),null);
});
test('the same Twitch account cannot be owned by two SWAPP accounts',()=>{
  const users=[
    {id:'one',twitch_link:{id:'123456'}},
    {id:'two',twitch_link:{id:'234567'}},
    {id:'three'}
  ];
  assert.equal(findExistingTwitchOwner(users,'123456','two')?.id,'one');
  assert.equal(findExistingTwitchOwner(users,'123456','one'),null);
  assert.equal(findExistingTwitchOwner(users,'unknown','two'),null);
});
test('Creator controls reside in dashboard and use authenticated SWAPP APIs',()=>{
  const client=pathInRepo('assets/swapp-creator-twitch-link.js');
  const html=pathInRepo('index.html');
  const server=pathInRepo('server.js');
  assert.match(client,/getElementById\(DASHBOARD_ID\)/);
  assert.match(client,/api\/creator\/twitch\/status/);
  assert.match(client,/api\/creator\/twitch\/unlink/);
  assert.match(client,/mode=link/);
  assert.match(html,/swapp-creator-twitch-link\.js/);
  assert.match(server,/app\.get\('\/api\/creator\/twitch\/status'/);
  assert.match(server,/app\.post\('\/api\/creator\/twitch\/unlink'/);
  assert.match(server,/findExistingTwitchOwner\(users\.users,user\.id,creatorLinkOwnerId\)/);
  assert.match(server,/if\(creatorLinkOwnerId\)/);
});
test('OAuth returns to the real SWAPP dashboard deep link',()=>{
  const bootstrap=pathInRepo('assets/swapp-route-bootstrap.js');
  const html=pathInRepo('index.html');
  assert.match(bootstrap,/'\/dashboard':'dashboard'/);
  assert.match(html,/'\/dashboard':'dashboard'/);
  assert.match(html,/id="dashboard"/);
});
