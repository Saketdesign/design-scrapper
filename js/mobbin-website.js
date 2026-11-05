// A local Chrome extension performs these read-only requests in the user's Mobbin
// tab. Eagle never reads browser cookies, passwords, or the website's auth tokens.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ENDPOINTS = new Set([
  '/api/search-bar/fetch-searchable-apps',
  '/api/screen/fetch-screen-info',
  '/api/app/fetch-app-versions-screens',
  '/app-version-page',
  '/api/discover/fetch-discover-page-animations',
]);

function createMobbinWebsite({ dataDir, openChrome, onChange = () => {}, now = Date.now, requestTimeout = 90000, pollTimeout = 20000 }) {
  const configPath = path.join(dataDir, 'mobbin-chrome.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* First connection. */ }
  if (!config || !/^[a-f0-9]{64}$/.test(config.token || '')) config = { token: crypto.randomBytes(32).toString('hex'), port: 0 };
  const queue = [];
  const jobs = new Map();
  let waiter;
  let server;
  let starting;
  let lastPoll = 0;
  let closed = false;

  function respond(response, status, value) {
    if (!response.writableEnded) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
  }
  function dispatch() {
    if (!waiter || !queue.length) return;
    const response = waiter;
    waiter = null;
    clearTimeout(response.pollTimer);
    const job = queue.shift();
    respond(response, 200, { id: job.id, endpoint: job.endpoint, body: job.body });
  }
  async function handle(request, response) {
    const origin = request.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return respond(response, 403, {});
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      return respond(response, 200, {});
    }
    if (request.url === '/connect' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
      return response.end('<!doctype html><meta charset="utf-8"><title>Connect Design Scrapper</title><h1>Connect Design Scrapper</h1><p id="bridge-status">The Design Scrapper Mobbin Chrome bridge must be installed. Once connected, return to Eagle and choose Check connection.</p>');
    }
    const expected = `Bearer ${config.token}`;
    const supplied = request.headers.authorization || '';
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return respond(response, 401, {});
    if (request.url === '/v1/status' && request.method === 'GET') return respond(response, 200, { name: 'design-scrapper-mobbin', version: 1 });
    if (request.url === '/v1/poll' && request.method === 'GET') {
      if (waiter) { clearTimeout(waiter.pollTimer); respond(waiter, 200, null); }
      lastPoll = now();
      onChange();
      waiter = response;
      response.pollTimer = setTimeout(() => { if (waiter === response) waiter = null; respond(response, 200, null); }, pollTimeout);
      response.on('close', () => { clearTimeout(response.pollTimer); if (waiter === response) waiter = null; });
      dispatch();
      return;
    }
    if (request.url === '/v1/result' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 32 * 1024 * 1024) return respond(response, 413, {});
      }
      let result;
      try { result = JSON.parse(body); } catch { return respond(response, 400, {}); }
      const job = jobs.get(result.id);
      if (!job) return respond(response, 410, {});
      jobs.delete(job.id);
      clearTimeout(job.timer);
      job.resolve(result.result);
      return respond(response, 200, {});
    }
    respond(response, 404, {});
  }

  function start() {
    if (closed) return Promise.reject(new Error('The Mobbin Chrome connection has closed. Reload the plugin.'));
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      server = http.createServer((request, response) => handle(request, response).catch(() => respond(response, 500, {})));
      server.on('error', () => { starting = null; reject(new Error('Could not start the local Mobbin Chrome bridge. Reload the plugin and try again.')); });
      server.listen(config.port || 0, '127.0.0.1', () => {
        config.port = server.address().port;
        try {
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
          fs.chmodSync(configPath, 0o600);
          resolve();
        } catch { server.close(); reject(new Error('Could not save the local Chrome connection.')); }
      });
    });
    return starting;
  }

  async function request(endpoint, body) {
    if (!ENDPOINTS.has(endpoint)) throw new Error('Unsupported Mobbin website request.');
    await start();
    if (!lastPoll || now() - lastPoll > 65000) throw new Error('Connect the Mobbin Chrome bridge from Connect Mobbin. Keep Chrome open with your signed-in Mobbin session.');
    const result = await new Promise((resolve, reject) => {
      const id = crypto.randomBytes(16).toString('hex');
      const job = { id, endpoint, body, resolve, reject };
      job.timer = setTimeout(() => {
        jobs.delete(id);
        const index = queue.indexOf(job);
        if (index !== -1) queue.splice(index, 1);
        reject(new Error('Chrome did not finish the Mobbin request. Keep Chrome open and run again to resume the same app.'));
      }, requestTimeout);
      jobs.set(id, job);
      queue.push(job);
      dispatch();
    });
    if (!result || result.failure) throw new Error(result && result.failure || 'Chrome returned an unexpected Mobbin response.');
    const data = result.data;
    if (data && data.error) {
      if (data.error.message === 'unauthenticated') throw new Error('Mobbin is signed out in Chrome. Sign in to Mobbin in your normal Chrome profile, then run again.');
      if (data.error.message === 'concurrent deny') throw new Error('Mobbin is in use in another session. Close that session and retry the same app.');
      throw new Error('Mobbin could not provide the app export. Check your subscription in Chrome and retry the same app.');
    }
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'value')) throw new Error('Mobbin website returned an unexpected response. The selected app has been kept for retry.');
    return data.value;
  }

  return {
    get connected() { return lastPoll > 0 && now() - lastPoll < 65000; },
    start,
    connect: async () => { await start(); await openChrome(`http://127.0.0.1:${config.port}/connect#${config.token}`); },
    checkLogin: () => request('/api/search-bar/fetch-searchable-apps', { platform: 'ios' }),
    request,
    close: () => {
      closed = true;
      if (waiter) { clearTimeout(waiter.pollTimer); respond(waiter, 200, null); waiter = null; }
      for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error('Mobbin connection closed. Run again to resume the same app.')); }
      jobs.clear(); queue.length = 0;
      if (server) server.close();
    },
  };
}

module.exports = { createMobbinWebsite };
