importScripts('page-data.js', 'validate.js');
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

// Runs inside the Mobbin tab, so it must not use anything from this file. Returns the raw response
// text; validate.js turns it into the bridge's reply.
async function pageFetch(request, timeoutMs) {
  if (location.origin !== 'https://mobbin.com') return { failure: 'Open your signed-in Mobbin page in Chrome, then try again.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.target, { ...request.init, credentials: 'same-origin', signal: controller.signal });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch { return { failure: 'Could not reach Mobbin in Chrome. Try again to resume the same app.' }; } finally { clearTimeout(timer); }
}

async function openMobbinTab() {
  const tab = await chrome.tabs.create({ url: 'https://mobbin.com/discover/apps/ios/latest', active: false });
  for (let i = 0; i < 40; i++) {
    if ((await chrome.tabs.get(tab.id)).status === 'complete') break;
    await pause(500);
  }
  return tab;
}

async function mobbinTab() {
  const tabs = await chrome.tabs.query({ url: 'https://mobbin.com/*' });
  return tabs.find((t) => t.status === 'complete' && !t.incognito) || tabs.find((t) => !t.incognito) || openMobbinTab();
}

async function perform(job) {
  const invalid = bridgeValidate.validateJob(job);
  if (invalid) return { failure: invalid };
  try {
    const tab = await mobbinTab();
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageFetch, args: [bridgeValidate.requestSpec(job.endpoint, job.body), 30000] });
    return bridgeValidate.interpret(injection && injection.result, job.endpoint, extractMobbinAppPage);
  } catch { return { failure: 'Could not read Mobbin in Chrome. Keep the Mobbin tab open and try again.' }; }
}

async function pollJob(config) {
  const response = await bridgeFetch(config, '/v1/poll');
  if (!response.ok) return false;
  const job = await response.json();
  return job ? runJob(config, job) : true;
}

// One round of long polling. False means stop: not paired, Eagle is gone, or the bridge refused us.
async function pollOnce() {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return false;
  try {
    return await pollJob(config);
  } catch { return false; } // The alarm reconnects when Eagle starts again.
}

async function runJob(config, job) {
  const result = await perform(job);
  const saved = await bridgeFetch(config, '/v1/result', { method: 'POST', body: JSON.stringify({ id: job.id, result }) });
  return saved.ok || saved.status === 410;
}

async function poll() {
  if (running) return;
  running = true;
  const ownGeneration = generation;
  try {
    while (ownGeneration === generation) {
      if (!(await pollOnce())) return;
    }
  } finally { running = false; }
}

async function pair(config) {
  const response = await bridgeFetch(config, '/v1/status');
  const status = await response.json();
  if (!response.ok || status.name !== 'design-scrapper-mobbin' || status.version !== 1) throw new Error('Invalid bridge');
  await chrome.storage.local.set({ config });
  generation++;
}

function restartPoll() {
  if (!running) poll();
  else setTimeout(poll, 26000);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!bridgeValidate.trustedPairing(message, sender)) return;
  pair(message.config).then(() => { respond({ ok: true }); restartPoll(); }, () => respond({ ok: false }));
  return true;
});
chrome.alarms.create('mobbin-bridge', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => poll());
chrome.runtime.onStartup.addListener(() => poll());
chrome.runtime.onInstalled.addListener(() => poll());
chrome.action.onClicked.addListener(() => poll());
poll();
