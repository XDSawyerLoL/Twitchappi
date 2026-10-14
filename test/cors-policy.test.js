'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {safeOrigin, createCorsPolicy} = require('../lib/cors-policy');

test('normalise uniquement les URL HTTP(S)', () => {
  assert.equal(safeOrigin('https://swapp.tv/accueil'), 'https://swapp.tv');
  assert.equal(safeOrigin('javascript:alert(1)'), null);
});
test('autorise www et sans www quand le domaine canonique est configuré', () => {
  for (const configured of ['https://swapp.tv', 'https://www.swapp.tv']) {
    const policy = createCorsPolicy({env: {APP_BASE_URL: configured}, isProd: true});
    assert.equal(policy.isOriginAllowed('https://swapp.tv'), true);
    assert.equal(policy.isOriginAllowed('https://www.swapp.tv'), true);
  }
});
test('respecte les origines personnalisées et refuse les sous-domaines arbitraires', () => {
  const p = createCorsPolicy({env: {CORS_ORIGINS: 'https://swapp.tv,https://partner.example'}, isProd: true});
  assert.equal(p.isOriginAllowed('https://partner.example'), true);
  assert.equal(p.isOriginAllowed('https://bad.swapp.tv'), false);
  assert.equal(p.isOriginAllowed('http://swapp.tv'), false);
});
test('sans configuration, la production ne permet aucune origine navigateur', () => {
  const p = createCorsPolicy({env: {}, isProd: true});
  assert.deepEqual(p.allowedOrigins, []);
  assert.equal(p.isOriginAllowed('https://swapp.tv'), false);
  assert.equal(p.isOriginAllowed(undefined), true);
});
test('en développement seuls les loopbacks sont supplémentaires', () => {
  const p = createCorsPolicy({env: {}, isProd: false});
  assert.equal(p.isOriginAllowed('http://localhost:9999'), true);
  assert.equal(p.isOriginAllowed('http://127.0.0.1:3000'), true);
  assert.equal(p.isOriginAllowed('http://evil.localhost.attacker.com'), false);
});
test('la politique renvoie une erreur 403 et non 500 pour origine refusée', () => {
  const p = createCorsPolicy({env: {APP_BASE_URL: 'https://swapp.tv'}, isProd: true});
  p.corsOriginHandler('https://attacker.example', error => {
    assert.equal(error.code, 'CORS_ORIGIN_DENIED');
    assert.equal(error.status, 403);
  });
  p.corsOriginHandler('https://www.swapp.tv', (error, allowed) => {
    assert.equal(error, null);
    assert.equal(allowed, true);
  });
});
test('rejette les chaînes Origin malformées', () => {
  const p = createCorsPolicy({env: {APP_BASE_URL: 'https://swapp.tv'}, isProd: true});
  assert.equal(p.isOriginAllowed('https://swapp.tv/hijacked'), false);
  assert.equal(p.isOriginAllowed('null'), false);
});
