const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJob, requestSpec, interpret, validKeyset, trustedPairing } = require('../chrome-extension/mobbin/validate');

const ID = '0123abcd-0123-4abc-8abc-0123456789ab';
const BASE = 'http://127.0.0.1:5000';
const TOKEN = 'a'.repeat(64);

test('only known endpoints with valid parameters run', () => {
  assert.match(validateJob({ endpoint: '/other', body: {} }), /unsupported/);
  assert.equal(validateJob({ endpoint: '/api/search-bar/fetch-searchable-apps', body: { platform: 'ios' } }), null);
  assert.match(validateJob({ endpoint: '/api/search-bar/fetch-searchable-apps', body: { platform: 'web' } }), /invalid/);
  assert.equal(validateJob({ endpoint: '/api/screen/fetch-screen-info', body: { screenId: ID } }), null);
  assert.match(validateJob({ endpoint: '/api/screen/fetch-screen-info' }), /invalid/);
  assert.equal(validateJob({ endpoint: '/api/app/fetch-app-versions-screens', body: { appId: ID } }), null);
  assert.match(validateJob({ endpoint: '/api/app/fetch-app-versions-screens', body: { appId: 'x' } }), /invalid/);
  const page = { appId: ID, versionId: ID, slug: 'my-app' };
  assert.equal(validateJob({ endpoint: '/app-version-page', body: page }), null);
  assert.match(validateJob({ endpoint: '/app-version-page', body: { ...page, slug: '../x' } }), /invalid/);
  assert.match(validateJob({ endpoint: '/app-version-page', body: { ...page, slug: '' } }), /invalid/);
});

test('animations feed accepts only the known keyset fields', () => {
  const job = (keysetPagination) => validateJob({ endpoint: '/api/discover/fetch-discover-page-animations', body: { platform: 'ios', keysetPagination } });
  assert.equal(job(undefined), null);
  assert.equal(job({ lastPublishedAt: 'a', lastCreatedAt: null, lastAnimationId: 'b' }), null);
  assert.match(job({ other: 'a' }), /invalid/);
  assert.match(job({ lastPublishedAt: 'x'.repeat(65) }), /invalid/);
  assert.match(job({ lastPublishedAt: 3 }), /invalid/);
  assert.match(job(null), /invalid/);
  assert.equal(validKeyset('text'), false);
});

test('request specs', () => {
  assert.deepEqual(requestSpec('/app-version-page', { slug: 's', appId: 'a', versionId: 'v' }), { target: '/apps/s-ios-a/v/screens', init: { method: 'GET' } });
  assert.deepEqual(requestSpec('/api/x', { a: 1 }), { target: '/api/x', init: { method: 'POST', body: '{"a":1}' } });
});

test('page replies become bridge replies', () => {
  const extract = (html) => ({ html });
  assert.match(interpret(undefined, '/x', extract).failure, /did not return/);
  assert.deepEqual(interpret({ failure: 'no' }, '/x', extract), { failure: 'no' });
  assert.match(interpret({ ok: false, status: 429 }, '/x', extract).failure, /rate limiting/);
  assert.equal(interpret({ ok: false, status: 500 }, '/x', extract).failure, 'Mobbin website request failed (500).');
  assert.deepEqual(interpret({ ok: true, text: '<p>' }, '/app-version-page', extract), { data: { value: { html: '<p>' } } });
  assert.deepEqual(interpret({ ok: true, text: '{"a":1}' }, '/x', extract), { data: { a: 1 } });
  assert.match(interpret({ ok: true, text: 'nope' }, '/x', extract).failure, /Could not reach/);
});

test('pairing messages must come from the local connect page', () => {
  const message = { type: 'pair', config: { base: BASE, token: TOKEN } };
  const sender = { tab: {}, url: `${BASE}/connect#${TOKEN}` };
  assert.equal(trustedPairing(message, sender), true);
  assert.equal(trustedPairing({ ...message, type: 'x' }, sender), false);
  assert.equal(trustedPairing(message, { url: sender.url }), false);
  assert.equal(trustedPairing(message, { tab: {}, url: 'https://evil.test/connect' }), false);
  assert.equal(trustedPairing({ type: 'pair' }, sender), false);
  assert.equal(trustedPairing({ type: 'pair', config: { base: 'http://evil.test', token: TOKEN } }, sender), false);
  assert.equal(trustedPairing({ type: 'pair', config: { base: BASE, token: 'short' } }, sender), false);
});
