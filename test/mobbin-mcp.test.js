const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createMobbinMcp, readRpc, MCP_URL, RESOURCE_METADATA, PROTOCOL } = require('../js/mobbin-mcp');

const NOW = Date.parse('2026-11-05');
const ISSUER = 'https://auth.test/auth/v1';
const metadata = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, registration_endpoint: `${ISSUER}/register` };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const AUTH_REPLIES = {
  [RESOURCE_METADATA]: () => json({ authorization_servers: [ISSUER] }),
  'https://auth.test/.well-known/oauth-authorization-server/auth/v1': () => json(metadata),
  [metadata.registration_endpoint]: () => json({ client_id: 'new-client' }),
  [metadata.token_endpoint]: () => json({ access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'Bearer', expires_in: 3600 }),
};

function mcpResult(method) {
  if (method === 'initialize') return { protocolVersion: PROTOCOL, capabilities: {} };
  if (method === 'tools/list') return { tools: [{ name: 'search_screens' }, { name: 'list_collections' }] };
  return { structuredContent: { screens: [] }, content: [] };
}

function setup(t, handler, { expired = false, connected = true, openExternal } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-mcp-'));
  const file = path.join(dataDir, 'mobbin-oauth.json');
  if (connected) fs.writeFileSync(file, JSON.stringify({ clientId: 'client', tokenEndpoint: metadata.token_endpoint,
    accessToken: 'old-access', refreshToken: 'refresh', expiresAt: NOW + (expired ? -1000 : 3600000) }));
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (handler) {
      const result = await handler(url, init, calls);
      if (result) return result;
    }
    const known = AUTH_REPLIES[url];
    if (known) return known();
    assert.equal(url, MCP_URL);
    const body = JSON.parse(init.body);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return json({ jsonrpc: '2.0', id: body.id, result: mcpResult(body.method) }, 200, { 'mcp-session-id': 'test-session' });
  };
  const client = createMobbinMcp({ dataDir, fetch, now: () => NOW, openExternal: openExternal || (async () => {}) });
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { client, calls, dataDir, file };
}

test('MCP decodes JSON and SSE replies by request ID and rejects protocol errors', () => {
  assert.deepEqual(readRpc('{"id":2,"result":{"ok":true}}', 2), { ok: true });
  assert.deepEqual(readRpc('event: message\ndata: {"id":1,"result":{}}\n\nevent: message\ndata: {"id":2,"result":{"ok":true}}\n\n', 2), { ok: true });
  assert.throws(() => readRpc('{"id":9,"result":{}}', 2), /invalid response/);
  assert.throws(() => readRpc('{"id":2,"error":{"message":"bad argument"}}', 2), /bad argument/);
});

test('MCP initializes once, sends session/protocol headers, and restricts calls to read tools', async (t) => {
  const { client, calls } = setup(t);
  await Promise.all([client.checkLogin(), client.checkLogin()]);
  await client.callTool('search_screens', { query: 'app screen', platform: 'ios' });
  const rpc = calls.filter((c) => c.url === MCP_URL).map((c) => ({ ...c, body: JSON.parse(c.init.body) }));
  assert.equal(rpc.filter((c) => c.body.method === 'initialize').length, 1);
  const initialized = rpc.find((c) => c.body.method === 'notifications/initialized');
  assert.ok(!Object.prototype.hasOwnProperty.call(initialized.body, 'id'));
  const tool = rpc.find((c) => c.body.method === 'tools/call');
  assert.equal(tool.init.headers['Mcp-Session-Id'], 'test-session');
  assert.equal(tool.init.headers['MCP-Protocol-Version'], PROTOCOL);
  assert.equal(tool.body.params.arguments.platform, 'ios');
  const count = calls.length;
  await assert.rejects(client.callTool('save_content', {}), /Only Mobbin search and collection reads/);
  assert.equal(calls.length, count, 'rejects writes before contacting Mobbin');
});

test('expired OAuth tokens refresh once across concurrent requests and save with owner-only permissions', async (t) => {
  const { client, calls, file } = setup(t, null, { expired: true });
  await Promise.all([client.checkLogin(), client.checkLogin()]);
  assert.equal(calls.filter((c) => c.url === metadata.token_endpoint).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).refreshToken, 'new-refresh');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(calls.filter((c) => c.url === MCP_URL).every((c) => c.init.headers.Authorization === 'Bearer new-access'));
});

test('an HTTP 401 refreshes authorization and retries once', async (t) => {
  let rejected = false;
  const { client, calls } = setup(t, (url, init) => {
    if (url === MCP_URL && !rejected) { rejected = true; return json({ error: 'unauthorized' }, 401); }
  });
  await client.checkLogin();
  assert.equal(calls.filter((c) => c.url === metadata.token_endpoint).length, 1);
  assert.equal(client.connected, true);
});

test('an invalid refresh token clears authorization without exposing token response details', async (t) => {
  const { client, file } = setup(t, (url) => url === metadata.token_endpoint
    ? json({ error: 'invalid_grant', error_description: 'secret-value' }, 400) : null, { expired: true });
  await assert.rejects(client.checkLogin(), (error) => error.code === 'MOBBIN_LOGIN_REQUIRED' && !error.message.includes('secret-value'));
  assert.equal(client.connected, false);
  assert.equal(fs.existsSync(file), false);
});

test('MCP reports rate limits and tool errors without silently returning empty searches', async (t) => {
  const rate = setup(t, (url) => url === MCP_URL ? json({}, 429, { 'Retry-After': '12' }) : null);
  await assert.rejects(rate.client.checkLogin(), /Try again in 12 seconds/);
  const tool = setup(t, (url, init) => {
    if (url === MCP_URL) {
      const body = JSON.parse(init.body);
      if (body.method === 'tools/call') return json({ id: body.id, result: { isError: true, content: [{ type: 'text', text: 'query failed' }] } });
    }
  });
  await assert.rejects(tool.client.callTool('search_screens', {}), /query failed/);
});

test('OAuth registers an app, validates state, uses PKCE, and stores a refreshable connection', async (t) => {
  let options;
  let tokenParams;
  let authorizeUrl;
  const { client, file } = setup(t, (url, init) => {
    if (url === metadata.registration_endpoint) options = JSON.parse(init.body);
    if (url === metadata.token_endpoint) tokenParams = new URLSearchParams(init.body);
  }, { connected: false, openExternal: async (raw) => {
    authorizeUrl = new URL(raw);
    assert.equal(authorizeUrl.searchParams.get('scope'), 'openid offline_access');
    const callback = new URL(authorizeUrl.searchParams.get('redirect_uri'));
    assert.equal(callback.hostname, '127.0.0.1');
    callback.search = new URLSearchParams({ state: 'wrong-state', code: 'test-code' });
    assert.equal((await global.fetch(callback)).status, 400);
    callback.search = new URLSearchParams({ state: authorizeUrl.searchParams.get('state'), code: 'test-code', iss: ISSUER });
    const response = await global.fetch(callback);
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes('test-code'));
  } });
  await client.signIn();
  assert.equal(options.client_name, 'Design Scrapper (Eagle)');
  assert.equal(options.token_endpoint_auth_method, 'none');
  assert.deepEqual(options.redirect_uris, [authorizeUrl.searchParams.get('redirect_uri')]);
  const challenge = crypto.createHash('sha256').update(tokenParams.get('code_verifier')).digest('base64url');
  assert.equal(challenge, authorizeUrl.searchParams.get('code_challenge'));
  assert.equal(tokenParams.get('resource'), MCP_URL);
  assert.equal(client.connected, true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  await client.checkLogin();
});

test('OAuth can be cancelled during discovery without opening a browser or saving credentials', async (t) => {
  let release;
  let opened = false;
  const { client, file } = setup(t, async (url) => {
    if (url === RESOURCE_METADATA) {
      await new Promise((resolve) => { release = resolve; });
      return json({ authorization_servers: [ISSUER] });
    }
  }, { connected: false, openExternal: async () => { opened = true; } });
  const connecting = client.signIn();
  const rejected = assert.rejects(connecting, /cancelled/);
  assert.equal(client.connecting, true);
  assert.equal(client.signIn(), connecting, 'repeated presses reuse the connection attempt');
  client.cancelSignIn();
  release();
  await rejected;
  assert.equal(opened, false);
  assert.equal(fs.existsSync(file), false);
  assert.equal(client.connecting, false);
});

test('disconnect removes only the plugin OAuth file and immediately requires reconnection', async (t) => {
  const { client, file, dataDir } = setup(t);
  fs.writeFileSync(path.join(dataDir, 'state.json'), '{"sources":[]}');
  await client.signOut();
  assert.equal(client.connected, false);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'state.json')), true);
  await assert.rejects(client.checkLogin(), /Connect Mobbin MCP/);
});
