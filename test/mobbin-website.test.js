const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createMobbinWebsite } = require('../js/mobbin-website');

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-chrome-'));
  let polled;
  const ready = new Promise((resolve) => { polled = resolve; });
  const client = createMobbinWebsite({ dataDir: dir, openChrome: async () => {}, onChange: () => polled(), pollTimeout: 1000, requestTimeout: 2000 });
  await client.start();
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'mobbin-chrome.json')));
  const base = `http://127.0.0.1:${config.port}`;
  const headers = { Authorization: `Bearer ${config.token}`, Connection: 'close' };
  t.after(() => { client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { client, config, base, headers, ready, dir };
}

test('Chrome bridge requires its pairing secret and rejects website origins', async (t) => {
  const { base, headers, client, dir } = await setup(t);
  assert.equal((await fetch(`${base}/v1/poll`)).status, 401);
  assert.equal((await fetch(`${base}/v1/status`, { headers: { ...headers, Origin: 'https://mobbin.com' } })).status, 403);
  assert.equal((await fetch(`${base}/v1/status`, { headers })).status, 200);
  assert.equal(fs.statSync(path.join(dir, 'mobbin-chrome.json')).mode & 0o777, 0o600);
  await assert.rejects(client.request('/api/auth/delete-account', {}), /Unsupported/);
  await assert.rejects(client.checkLogin(), /Connect the Mobbin Chrome bridge/);
});

test('Chrome bridge delivers a read job and returns its authenticated website data', async (t) => {
  const { client, base, headers, ready } = await setup(t);
  const poll = fetch(`${base}/v1/poll`, { headers });
  await ready;
  const result = client.checkLogin();
  const job = await (await poll).json();
  assert.equal(job.endpoint, '/api/search-bar/fetch-searchable-apps');
  assert.deepEqual(job.body, { platform: 'ios' });
  await fetch(`${base}/v1/result`, { method: 'POST', headers, body: JSON.stringify({ id: job.id, result: { data: { value: [{ appName: 'Alpha' }] } } }) });
  assert.deepEqual(await result, [{ appName: 'Alpha' }]);
  assert.equal(client.connected, true);
});

test('Chrome bridge maps an expired website login without exposing auth data', async (t) => {
  const { client, base, headers, ready } = await setup(t);
  const poll = fetch(`${base}/v1/poll`, { headers });
  await ready;
  const result = client.checkLogin();
  const rejected = assert.rejects(result, /signed out in Chrome/);
  const job = await (await poll).json();
  await fetch(`${base}/v1/result`, { method: 'POST', headers, body: JSON.stringify({ id: job.id, result: { data: { error: { message: 'unauthenticated', secret: 'must not appear' } } } }) });
  await rejected;
});

test('Chrome extension reuses a Mobbin tab with session credentials and rejects other endpoints', async () => {
  const calls = [];
  const noop = { addListener() {} };
  const context = vm.createContext({
    setTimeout, clearTimeout, AbortController, location: { origin: 'https://mobbin.com' },
    importScripts: (...files) => files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-extension/mobbin', file), 'utf8'), context)),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, text: async () => JSON.stringify({ value: { app: 'Alpha' } }) }; },
    chrome: {
      storage: { local: { get: async () => ({}) } },
      runtime: { onMessage: noop, onStartup: noop, onInstalled: noop },
      alarms: { create() {}, onAlarm: noop }, action: { onClicked: noop },
      tabs: { query: async () => [{ id: 9, status: 'complete' }], create: async () => { throw new Error('Should reuse existing tab'); } },
      scripting: { executeScript: async ({ target, func, args }) => { assert.equal(target.tabId, 9); return [{ result: await func(...args) }]; } },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-extension/mobbin/background.js'), 'utf8') + '\nthis.performJob = perform;', context);
  const rejected = await context.performJob({ endpoint: '/api/auth/logout', body: {} });
  assert.match(rejected.failure, /unsupported/);
  const data = await context.performJob({ endpoint: '/api/screen/fetch-screen-info', body: { screenId: '00000000-0000-4000-8000-000000000001' } });
  assert.equal(data.data.value.app, 'Alpha');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].url, '/api/screen/fetch-screen-info');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../chrome-extension/mobbin/manifest.json')));
  assert.deepEqual(manifest.host_permissions, ['https://mobbin.com/*', 'http://127.0.0.1/*']);
  assert.ok(!manifest.permissions.includes('cookies'));
});

test('Chrome pairing accepts only the exact loopback tab origin and connect path', () => {
  const { trustedPairing } = require('../chrome-extension/mobbin/validate');
  const config = { base: 'http://127.0.0.1:34567', token: 'a'.repeat(64) };
  const message = { type: 'pair', config };
  assert.equal(trustedPairing(message, { tab: { id: 1 }, url: config.base + '/connect' }), true);
  assert.equal(trustedPairing(message, { tab: { id: 1 }, url: 'http://127.0.0.1:34568/connect' }), false);
  assert.equal(trustedPairing(message, { tab: { id: 1 }, url: config.base + '/connect-evil' }), false);
  assert.equal(trustedPairing(message, { tab: { id: 1 }, url: config.base + '/connect?other=1' }), false);
  assert.equal(trustedPairing(message, { url: config.base + '/connect' }), false);
});

test('counterfeit local server cannot silently pair even with a forged status response', async () => {
  const handlers = {};
  const local = {};
  const session = {};
  const requests = [];
  const noop = { addListener() {} };
  const context = vm.createContext({
    setTimeout, clearTimeout, AbortController, URL,
    importScripts: (...files) => files.forEach((file) =>
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-extension/mobbin', file), 'utf8'), context)),
    fetch: async (url) => {
      requests.push(url);
      return url.endsWith('/v1/status')
        ? { ok: true, json: async () => ({ name: 'design-scrapper-mobbin', version: 1 }) }
        : { ok: false };
    },
    chrome: {
      runtime: { id: 'extension-test', getURL: (p) => `chrome-extension://extension-test/${p}`,
        onMessage: { addListener: (fn) => { handlers.onMessage = fn; } },
        onStartup: noop, onInstalled: noop },
      storage: {
        local: { get: async () => ({ config: local.config }), set: async (value) => Object.assign(local, value) },
        session: { get: async () => ({ pendingPair: session.pendingPair }),
          set: async (value) => Object.assign(session, value), remove: async (key) => { delete session[key]; } },
      },
      alarms: { create() {}, onAlarm: noop }, action: { onClicked: noop },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../chrome-extension/mobbin/background.js'), 'utf8'), context);
  const send = (message, sender) => new Promise((resolve) => {
    if (handlers.onMessage(message, sender, resolve) !== true) resolve(null);
  });
  const config = { base: 'http://127.0.0.1:34567', token: 'b'.repeat(64) };
  const page = { tab: { id: 5 }, url: config.base + '/connect' };
  assert.equal((await send({ type: 'pair', config }, page)).pending, true);
  assert.equal(local.config, undefined);
  assert.equal(requests.length, 0);
  assert.equal(await send({ type: 'approve-pair' }, page), null);
  assert.equal(local.config, undefined);
  const popup = { url: 'chrome-extension://extension-test/popup.html' };
  assert.equal((await send({ type: 'pairing-status' }, popup)).base, config.base);
  assert.equal((await send({ type: 'approve-pair' }, popup)).ok, true);
  assert.equal(local.config.base, config.base);
  assert.equal(requests[0], config.base + '/v1/status');
});

test('Chrome bridge preserves a UTF-8 character split between HTTP chunks', async (t) => {
  const http = require('node:http');
  const { client, base, headers, ready } = await setup(t);
  const polling = fetch(`${base}/v1/poll`, { headers });
  await ready;
  const result = client.checkLogin();
  const job = await (await polling).json();
  const payload = Buffer.from(JSON.stringify({ id: job.id, result: { data: { value: 'Café' } } }));
  const split = payload.indexOf(Buffer.from('é')) + 1;
  assert.ok(split > 0);
  await new Promise((resolve, reject) => {
    const request = http.request(base + '/v1/result', { method: 'POST', headers }, (response) => {
      response.resume(); response.on('end', resolve);
    });
    request.on('error', reject);
    request.write(payload.subarray(0, split));
    setTimeout(() => request.end(payload.subarray(split)), 15);
  });
  assert.equal(await result, 'Café');
});
