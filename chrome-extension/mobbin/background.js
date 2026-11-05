importScripts('page-data.js');
const ENDPOINTS = new Set(['/api/search-bar/fetch-searchable-apps', '/api/screen/fetch-screen-info', '/api/app/fetch-app-versions-screens', '/app-version-page', '/api/discover/fetch-discover-page-animations']);
const validKeyset = (k) => k === undefined || k && typeof k === 'object' && Object.keys(k).every((key) => ['lastPublishedAt', 'lastCreatedAt', 'lastAnimationId'].includes(key))
  && Object.values(k).every((value) => value === null || typeof value === 'string' && value.length <= 64);
let running = false;
let generation = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bridgeFetch(config, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    return await fetch(`${config.base}${path}`, { ...options, signal: controller.signal, headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' } });
  } finally { clearTimeout(timer); }
}

async function perform(job) {
  if (!ENDPOINTS.has(job.endpoint)) return { failure: 'The Chrome bridge rejected an unsupported request.' };
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (job.endpoint.includes('fetch-screen-info') && !uuid.test(job.body?.screenId || '')
    || job.endpoint.includes('fetch-app-versions-screens') && !uuid.test(job.body?.appId || '')
    || job.endpoint.includes('fetch-searchable-apps') && job.body?.platform !== 'ios'
    || job.endpoint.includes('fetch-discover-page-animations') && (job.body?.platform !== 'ios' || !validKeyset(job.body?.keysetPagination))
    || job.endpoint === '/app-version-page' && (!uuid.test(job.body?.appId || '') || !uuid.test(job.body?.versionId || '') || !/^[a-z0-9-]{1,120}$/.test(job.body?.slug || ''))) return { failure: 'The Chrome bridge rejected invalid request parameters.' };
  try {
    let tabs = await chrome.tabs.query({ url: 'https://mobbin.com/*' });
    let tab = tabs.find((t) => t.status === 'complete' && !t.incognito) || tabs.find((t) => !t.incognito);
    if (!tab) {
      tab = await chrome.tabs.create({ url: 'https://mobbin.com/discover/apps/ios/latest', active: false });
      for (let i = 0; i < 40; i++) { if ((await chrome.tabs.get(tab.id)).status === 'complete') break; await pause(500); }
    }
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async (endpoint, body) => {
      if (location.origin !== 'https://mobbin.com') return { failure: 'Open your signed-in Mobbin page in Chrome, then try again.' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const page = endpoint === '/app-version-page';
        const target = page ? `/apps/${body.slug}-ios-${body.appId}/${body.versionId}/screens` : endpoint;
        const response = await fetch(target, { method: page ? 'GET' : 'POST', credentials: 'same-origin', body: page ? undefined : JSON.stringify(body), signal: controller.signal });
        if (!response.ok) return { failure: response.status === 429 ? 'Mobbin is rate limiting downloads. Try again later to resume the same app.' : `Mobbin website request failed (${response.status}).` };
        return page ? { html: await response.text() } : { data: await response.json() };
      } catch { return { failure: 'Could not reach Mobbin in Chrome. Try again to resume the same app.' }; }
      finally { clearTimeout(timer); }
    }, args: [job.endpoint, job.body] });
    const result = results[0]?.result;
    if (result && typeof result.html === 'string') return { data: { value: extractMobbinAppPage(result.html) } };
    return result || { failure: 'Chrome did not return a Mobbin response.' };
  } catch { return { failure: 'Could not read Mobbin in Chrome. Keep the Mobbin tab open and try again.' }; }
}

async function poll() {
  if (running) return;
  running = true;
  const ownGeneration = generation;
  try {
    while (ownGeneration === generation) {
      const { config } = await chrome.storage.local.get('config');
      if (!config) return;
      try {
        const response = await bridgeFetch(config, '/v1/poll');
        if (!response.ok) return;
        const job = await response.json();
        if (job) {
          const result = await perform(job);
          const saved = await bridgeFetch(config, '/v1/result', { method: 'POST', body: JSON.stringify({ id: job.id, result }) });
          if (!saved.ok && saved.status !== 410) return;
        }
      } catch { return; } // The alarm reconnects when Eagle starts again.
    }
  } finally { running = false; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'pair' || !sender.tab || !/^http:\/\/127\.0\.0\.1:\d+\/connect(?:#|$)/.test(sender.url || '')) return;
  const config = message.config;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config?.base || '') || !/^[a-f0-9]{64}$/.test(config?.token || '')) return;
  (async () => {
    const response = await bridgeFetch(config, '/v1/status');
    const status = await response.json();
    if (!response.ok || status.name !== 'design-scrapper-mobbin' || status.version !== 1) throw new Error('Invalid bridge');
    await chrome.storage.local.set({ config });
    generation++;
    respond({ ok: true });
    if (!running) poll();
    else setTimeout(poll, 26000);
  })().catch(() => respond({ ok: false }));
  return true;
});
chrome.alarms.create('mobbin-bridge', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => poll());
chrome.runtime.onStartup.addListener(() => poll());
chrome.runtime.onInstalled.addListener(() => poll());
chrome.action.onClicked.addListener(() => poll());
poll();
