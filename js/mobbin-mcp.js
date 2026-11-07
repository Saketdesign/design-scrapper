// Minimal OAuth + Streamable HTTP MCP client for Eagle's Node 16 / Chromium 107.
// Uses Mobbin's documented integration endpoints, never its private website APIs.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const MCP_URL = 'https://api.mobbin.com/mcp';
const RESOURCE_METADATA = 'https://api.mobbin.com/.well-known/oauth-protected-resource/mcp';
const PROTOCOL = '2025-03-26';
const READ_TOOLS = new Set(['search_screens', 'search_flows', 'search_sections', 'list_collections', 'get_collection_contents']);
const base64url = (value) => value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function loginRequired() {
  const error = new Error('Connect Mobbin MCP from this source’s actions menu, then run the source again.');
  error.code = 'MOBBIN_LOGIN_REQUIRED';
  return error;
}

function readRpc(text, id) {
  const candidates = [];
  try { candidates.push(JSON.parse(text)); } catch {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { candidates.push(JSON.parse(data)); } catch { /* Ignore keep-alives. */ }
    }
  }
  const message = candidates.find((value) => value && value.id === id);
  if (!message) throw new Error('Mobbin MCP returned an invalid response. Try connecting again.');
  if (message.error) throw new Error(`Mobbin MCP: ${String(message.error.message || 'request failed').slice(0, 300)}`);
  if (!Object.prototype.hasOwnProperty.call(message, 'result')) throw new Error('Mobbin MCP response is missing its result.');
  return message.result;
}

// Checks a request to the local OAuth callback. Returns { url } when it is the real callback,
// or { status, body } to answer with.
function checkCallback(request, redirectUri, state) {
  let url;
  try { url = new URL(request.url, redirectUri); } catch { return { status: 400 }; }
  if (request.method !== 'GET' || url.pathname !== '/mobbin/callback') return { status: 404 };
  if (request.headers.host !== new URL(redirectUri).host || url.searchParams.get('state') !== state) return { status: 400, body: 'Invalid authorization state.' };
  return { url };
}

function checkAuthorization(url, issuer) {
  if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('Mobbin connection was not authorized. Try connecting again.');
  if (url.searchParams.has('iss') && url.searchParams.get('iss') !== issuer) throw new Error('Mobbin authorization issuer did not match.');
}

function createMobbinMcp({ dataDir, fetch, openExternal, onChange = () => {}, now = () => Date.now() }) {
  const file = path.join(dataDir, 'mobbin-oauth.json');
  let credentials = null;
  try { credentials = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* Not connected. */ }
  let pending = null;
  let connectingPromise = null;
  let activeAttempt = null;
  let refreshing = null;
  let initializing = null;
  let sessionId = null;
  let initialized = false;
  let nextId = 0;
  let tools = null;

  function save(value) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
    credentials = value;
    onChange();
  }

  function clear() {
    credentials = null;
    initialized = false;
    sessionId = null;
    tools = null;
    try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    onChange();
  }

  async function send(url, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after'));
        throw new Error(`Mobbin MCP is rate limited.${wait > 0 ? ` Try again in ${wait} seconds.` : ' Try again later.'}`);
      }
      return { response, text };
    } catch (error) {
      if (/rate limited/.test(error.message)) throw error;
      throw new Error('Could not reach Mobbin MCP. Check your connection and try again.');
    } finally { clearTimeout(timeout); }
  }

  async function json(url, init = {}) {
    const { response, text } = await send(url, init);
    let value;
    try { value = JSON.parse(text); } catch { throw new Error('Mobbin authorization returned an invalid response.'); }
    if (!response.ok) {
      const error = new Error('Mobbin authorization failed. Connect Mobbin MCP again.');
      error.invalidGrant = value.error === 'invalid_grant';
      throw error;
    }
    return value;
  }

  async function discover() {
    const resource = await json(RESOURCE_METADATA);
    const issuer = resource.authorization_servers && resource.authorization_servers[0];
    // Only follow the HTTPS authorization server advertised by Mobbin itself.
    if (!issuer || new URL(issuer).protocol !== 'https:') throw new Error('Mobbin did not advertise a secure authorization server.');
    const url = new URL(issuer);
    const metadataUrl = `${url.origin}/.well-known/oauth-authorization-server${url.pathname.replace(/\/$/, '')}`;
    const metadata = await json(metadataUrl);
    if (metadata.issuer !== issuer || !['authorization_endpoint', 'token_endpoint', 'registration_endpoint'].every((key) => {
      try { return new URL(metadata[key]).protocol === 'https:' && new URL(metadata[key]).origin === url.origin; } catch { return false; }
    })) throw new Error('Mobbin authorization metadata could not be verified.');
    return metadata;
  }

  async function tokenRequest(endpoint, params) {
    const value = await json(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
    });
    if (!value.access_token || value.token_type && value.token_type.toLowerCase() !== 'bearer') throw new Error('Mobbin did not return an access token. Connect again.');
    return value;
  }

  async function accessToken(force = false) {
    if (!credentials || !credentials.accessToken) throw loginRequired();
    if (!force && credentials.expiresAt > now() + 60000) return credentials.accessToken;
    if (refreshing) return refreshing;
    if (!credentials.refreshToken) { clear(); throw loginRequired(); }
    const original = credentials;
    refreshing = (async () => {
      try {
        const value = await tokenRequest(original.tokenEndpoint, {
          grant_type: 'refresh_token', refresh_token: original.refreshToken, client_id: original.clientId, resource: MCP_URL,
        });
        if (credentials !== original) throw loginRequired();
        save({ ...original, accessToken: value.access_token, refreshToken: value.refresh_token || original.refreshToken,
          expiresAt: now() + (Number(value.expires_in) || 3600) * 1000 });
        return credentials.accessToken;
      } catch (error) {
        if (error.invalidGrant) { clear(); throw loginRequired(); }
        throw error;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  function rpcHeaders(token) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (initialized) headers['MCP-Protocol-Version'] = PROTOCOL;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    return headers;
  }

  // Throws for the statuses that mean the call cannot go on.
  function checkRpcStatus(response) {
    if (response.status === 403) throw new Error('Mobbin MCP access was denied. Check your subscription and reconnect.');
    if (response.status === 404 && sessionId) { initialized = false; sessionId = null; throw new Error('The Mobbin MCP session expired. Run the source again.'); }
    if (!response.ok) throw new Error(`Mobbin MCP responded ${response.status}. Try again later.`);
  }

  async function rpc(method, params, notification = false, retried = false) {
    const token = await accessToken();
    const id = notification ? undefined : ++nextId;
    const message = { jsonrpc: '2.0', ...(notification ? {} : { id }), method, ...(params == null ? {} : { params }) };
    const { response, text } = await send(MCP_URL, { method: 'POST', headers: rpcHeaders(token), body: JSON.stringify(message) });
    if (response.status === 401 && !retried) {
      await accessToken(true);
      return rpc(method, params, notification, true);
    }
    if (response.status === 401) { clear(); throw loginRequired(); }
    checkRpcStatus(response);
    if (response.headers.get('mcp-session-id')) sessionId = response.headers.get('mcp-session-id');
    return notification ? null : readRpc(text, id);
  }

  async function initialize() {
    if (initialized) return;
    if (initializing) return initializing;
    initializing = (async () => {
      const result = await rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'design-scrapper-eagle', version: '1.0.0' } });
      if (result.protocolVersion !== PROTOCOL) throw new Error('Mobbin MCP requires a different protocol version. Update the plugin.');
      initialized = true;
      try { await rpc('notifications/initialized', null, true); } catch (error) { initialized = false; throw error; }
    })();
    try { await initializing; } finally { initializing = null; }
  }

  async function listTools() {
    await initialize();
    if (tools) return tools;
    const all = [];
    let cursor;
    do {
      const result = await rpc('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(result.tools)) throw new Error('Mobbin MCP returned an invalid tools list.');
      all.push(...result.tools);
      cursor = result.nextCursor;
      if (all.length > 100) throw new Error('Mobbin MCP returned too many tools.');
    } while (cursor);
    tools = all;
    return tools;
  }

  async function callTool(name, args) {
    if (!READ_TOOLS.has(name)) throw new Error('Only Mobbin search and collection reads are supported.');
    if (!(await listTools()).some((tool) => tool.name === name)) throw new Error(`Mobbin MCP does not provide ${name}.`);
    const result = await rpc('tools/call', { name, arguments: args });
    if (result.isError) {
      const detail = (result.content || []).filter((item) => item.type === 'text').map((item) => item.text).join(' ');
      throw new Error(`Mobbin MCP: ${detail.slice(0, 400) || 'tool failed'}`);
    }
    return result;
  }

  function cancelSignIn() {
    if (activeAttempt) activeAttempt.cancelled = true;
    if (pending) pending.cancel();
  }

  async function authorize(attempt) {
    const metadata = await discover();
    if (attempt.cancelled) throw new Error('Mobbin connection was cancelled.');
    const state = base64url(crypto.randomBytes(32));
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    let finish;
    let redirectUri;
    let client;
    let exchanging = false;
    const server = http.createServer(async (request, response) => {
      response.setHeader('Connection', 'close');
      const checked = checkCallback(request, redirectUri, state);
      if (!checked.url || exchanging) { response.writeHead(checked.status || 409); response.end(checked.body); return; }
      const { url } = checked;
      exchanging = true;
      try {
        checkAuthorization(url, metadata.issuer);
        const value = await tokenRequest(metadata.token_endpoint, {
          grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri,
          client_id: client.client_id, code_verifier: verifier, resource: MCP_URL,
        });
        if (attempt.cancelled || activeAttempt !== attempt) throw new Error('Mobbin connection was cancelled.');
        save({ clientId: client.client_id, tokenEndpoint: metadata.token_endpoint, accessToken: value.access_token,
          refreshToken: value.refresh_token || null, expiresAt: now() + (Number(value.expires_in) || 3600) * 1000 });
        initialized = false; sessionId = null; tools = null;
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
        response.end('<!doctype html><title>Mobbin connected</title><h1>Mobbin connected</h1><p>Return to Design Scrapper in Eagle. You can close this tab.</p>');
        finish();
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        response.end('Mobbin could not connect. Return to Eagle and try again.');
        finish(error);
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    if (attempt.cancelled) { server.close(); throw new Error('Mobbin connection was cancelled.'); }
    redirectUri = `http://127.0.0.1:${server.address().port}/mobbin/callback`;
    const promise = new Promise((resolve, reject) => {
      let finished = false;
      const timeout = setTimeout(() => finish(new Error('Mobbin authorization timed out. Connect again.')), 5 * 60000);
      finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout); server.close(); pending = null;
        error ? reject(error) : resolve();
      };
    });
    pending = { promise, cancel: () => finish(new Error('Mobbin connection was cancelled.')) };
    try {
      client = await json(metadata.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Design Scrapper (Eagle)', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
      });
      if (!client.client_id) throw new Error('Mobbin did not register the plugin. Try again.');
      const url = new URL(metadata.authorization_endpoint);
      url.search = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri,
        state, code_challenge: challenge, code_challenge_method: 'S256', scope: 'openid offline_access', resource: MCP_URL }).toString();
      if (attempt.cancelled) throw new Error('Mobbin connection was cancelled.');
      await openExternal(url.toString());
    } catch (error) { finish(error); }
    return promise;
  }

  function signIn() {
    if (connectingPromise) return connectingPromise;
    const attempt = { cancelled: false };
    activeAttempt = attempt;
    connectingPromise = authorize(attempt).finally(() => {
      if (activeAttempt === attempt) { activeAttempt = null; connectingPromise = null; }
    });
    return connectingPromise;
  }

  return {
    get connected() { return Boolean(credentials && credentials.accessToken); },
    get connecting() { return Boolean(connectingPromise); },
    signIn, cancelSignIn, listTools, callTool,
    async checkLogin() { await listTools(); return true; },
    async signOut() { cancelSignIn(); clear(); },
  };
}

module.exports = { createMobbinMcp, readRpc, MCP_URL, RESOURCE_METADATA, PROTOCOL };
