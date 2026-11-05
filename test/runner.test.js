const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../js/store');
const { runSource, planSource, importPlan, isDue, sinceFor } = require('../js/runner');

const NOW = Date.parse('2026-10-18T00:00:00Z');
const HOUR = 3600e3;

function vibrantHtml(items) {
  const body = items
    .map((it, i) => `$R[${i + 10}]={shortId:"${it.id}",path:"/feed/${it.id}",name:"${it.name}",websiteUrl:"https://x.com/a/status/${it.x}",publishedAt:"${new Date(it.at).toISOString()}",images:[],videos:[{url:"https://cdn.test/${it.id}.mp4",width:1440,height:1080,renditions:[]}],categories:[{slug:"interface"}],tags:[{name:"Minimal"}],creator:{name:"Ana",handle:"ana"}}`)
    .join(',');
  return `<script class="$tsr">$R[0]={items:$R[1]=[${body}]}</script>`;
}

function setup(pages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-'));
  const store = createStore(dir);
  const added = [];
  const eagleItem = {
    count: async ({ url }) => added.filter((a) => a.opts.website === url).length,
    addFromPath: async (file, opts) => {
      assert.ok(fs.existsSync(file));
      added.push({ file, opts });
      return `item${added.length}`;
    },
  };
  const fetch = async (url) => {
    if (url.startsWith('https://cdn.test/')) {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } });
    }
    return new Response(pages[new URL(url).hostname], { headers: { 'content-type': 'text/html' } });
  };
  const ctx = { store, libraryPath: '/lib/A', eagleItem, fetch, tmpDir: path.join(dir, 'tmp'), now: NOW };
  return { store, added, ctx, dir };
}

test('imports only fresh posts, with metadata, and never twice', async () => {
  const html = vibrantHtml([
    { id: 'new1', name: 'Card', x: '111', at: NOW - 2 * HOUR },
    { id: 'old1', name: 'Old', x: '222', at: NOW - 72 * HOUR },
  ]);
  const { store, added, ctx, dir } = setup({ 'vibrant.design': html });
  const source = store.data.sources.find((s) => s.url.includes('vibrant'));

  const first = await runSource(source, ctx);
  assert.strictEqual(first.imported, 1);
  assert.deepStrictEqual(added[0].opts.tags, ['vibrant.design', '@ana', 'Minimal']);
  assert.strictEqual(added[0].opts.website, 'https://x.com/a/status/111');
  assert.deepStrictEqual(added[0].opts.folders, []);
  assert.match(added[0].opts.annotation, /By Ana \(@ana\)/);
  assert.ok(!fs.existsSync(added[0].file), 'temp file is cleaned up');

  // Simulate the user deleting the item in Eagle: the seen list still blocks it.
  added.length = 0;
  const again = await runSource(source, { ...ctx, now: NOW + 25 * HOUR });
  assert.strictEqual(again.imported, 0);
  assert.ok(createStore(dir).library('/lib/A').status[source.id].lastSuccessAt, 'state persisted');
});

test('the same X post found on another source is skipped', async () => {
  const html = vibrantHtml([{ id: 'v1', name: 'Card', x: '999', at: NOW - HOUR }]);
  const { store, added, ctx } = setup({ 'vibrant.design': html, 'other.vibrant.design': html.replace('v1', 'v2') });
  const a = store.data.sources.find((s) => s.url.includes('vibrant'));
  const b = store.addSource('https://other.vibrant.design/');
  await runSource(a, ctx);
  const res = await runSource(b, ctx);
  assert.strictEqual(res.imported, 0);
  assert.strictEqual(added.length, 1);
});

test('separate libraries keep separate seen lists', async () => {
  const html = vibrantHtml([{ id: 'v1', name: 'Card', x: '5', at: NOW - HOUR }]);
  const { store, added, ctx } = setup({ 'vibrant.design': html });
  const source = store.data.sources.find((s) => s.url.includes('vibrant'));
  await runSource(source, ctx);
  added.length = 0;
  const res = await runSource(source, { ...ctx, libraryPath: '/lib/B' });
  assert.strictEqual(res.imported, 1);
});

test('an empty page flags the source instead of silently succeeding', async () => {
  const { store, ctx } = setup({ 'vibrant.design': '<html></html>' });
  const source = store.data.sources.find((s) => s.url.includes('vibrant'));
  const res = await runSource(source, ctx);
  assert.match(res.error, /layout may have changed/);
  const status = store.library('/lib/A').status[source.id];
  assert.ok(!status.lastSuccessAt && status.lastError);
});

test('bestdesignsonx: an empty date range succeeds and clears a previous error', async () => {
  const { store, added, ctx } = setup({});
  const source = store.data.sources.find((s) => s.url.includes('bestdesignsonx'));
  const lib = store.library(ctx.libraryPath);
  lib.status[source.id] = { lastSuccessAt: NOW - HOUR, lastError: 'The site returned no designs. Its layout may have changed.' };
  const calls = [];
  ctx.fetch = async (url) => {
    calls.push(url);
    if (url.includes('.supabase.co/rest/v1/')) return new Response('[]');
    if (url.endsWith('.js')) return new Response(fs.readFileSync(`${__dirname}/fixtures/bestdesignsonx-bundle.txt`, 'utf8'));
    return new Response('<script src="/assets/index-test.js"></script>');
  };

  const result = await runSource(source, ctx);
  assert.strictEqual(result.error, null);
  assert.strictEqual(result.imported, 0);
  assert.strictEqual(added.length, 0);
  assert.strictEqual(lib.status[source.id].lastSuccessAt, NOW);
  assert.strictEqual(lib.status[source.id].lastError, null);
  const query = new URL(calls.find((url) => url.includes('/rest/v1/')));
  assert.strictEqual(query.searchParams.get('published_at'), `gte.${new Date(sinceFor({ lastSuccessAt: NOW - HOUR }, NOW)).toISOString()}`);
});

test('bestdesignsonx: failed and malformed API responses still flag the source', async () => {
  const { store, ctx } = setup({});
  const source = store.data.sources.find((s) => s.url.includes('bestdesignsonx'));
  for (const [body, status, message] of [
    ['unavailable', 503, /responded 503/],
    ['{}', 200, /invalid response/],
  ]) {
    ctx.fetch = async (url) => {
      if (url.includes('.supabase.co/rest/v1/')) return new Response(body, { status });
      if (url.endsWith('.js')) return new Response(fs.readFileSync(`${__dirname}/fixtures/bestdesignsonx-bundle.txt`, 'utf8'));
      return new Response('<script src="/assets/index-test.js"></script>');
    };
    const result = await runSource(source, ctx);
    assert.match(result.error, message);
    assert.ok(!store.library(ctx.libraryPath).status[source.id].lastSuccessAt);
  }
});

test('"last X days" reaches past the normal window, imports oldest first, and can be stopped', async () => {
  const html = vibrantHtml([
    { id: 'd1', name: 'One day', x: '1', at: NOW - 1 * 24 * HOUR },
    { id: 'd5', name: 'Five days', x: '5', at: NOW - 5 * 24 * HOUR },
    { id: 'd9', name: 'Nine days', x: '9', at: NOW - 9 * 24 * HOUR },
  ]);
  const { store, added, ctx } = setup({ 'vibrant.design': html });
  const source = store.data.sources.find((s) => s.url.includes('vibrant'));

  const plan = await planSource(source, { ...ctx, days: 7 });
  assert.deepStrictEqual(plan.items.map((i) => i.id), ['d5', 'd1']);
  assert.strictEqual(plan.files, 2);

  let calls = 0;
  const res = await importPlan(plan, { ...ctx, shouldStop: () => calls++ >= 1 });
  assert.strictEqual(res.stopped, true);
  assert.deepStrictEqual(added.map((a) => a.opts.name), ['Five days']);
  assert.ok(!store.library('/lib/A').status[source.id].lastSuccessAt, 'a stopped run does not count as a full run');

  const rest = await runSource(source, { ...ctx, days: 7 });
  assert.strictEqual(rest.imported, 1, 'continues where it stopped');
});

test('schedule: daily runs, hourly retries after failure, bounded lookback', () => {
  assert.strictEqual(isDue(undefined, NOW), true);
  assert.strictEqual(isDue({ lastSuccessAt: NOW - 2 * HOUR, lastAttemptAt: NOW - 2 * HOUR }, NOW), false);
  assert.strictEqual(isDue({ lastSuccessAt: NOW - 24 * HOUR, lastAttemptAt: NOW - 24 * HOUR }, NOW), true);
  assert.strictEqual(isDue({ lastSuccessAt: NOW - 30 * HOUR, lastAttemptAt: NOW - 10 * 60e3 }, NOW), false);
  assert.strictEqual(sinceFor(undefined, NOW), NOW - 24 * HOUR);
  assert.strictEqual(sinceFor({ lastSuccessAt: NOW - HOUR }, NOW, 'all'), 0);
  assert.strictEqual(sinceFor(undefined, NOW, 30), NOW - 30 * 24 * HOUR);
  assert.strictEqual(sinceFor({ lastSuccessAt: NOW - 24 * HOUR }, NOW), NOW - 30 * HOUR);
  assert.strictEqual(sinceFor({ lastSuccessAt: NOW - 60 * 24 * HOUR }, NOW), NOW - 14 * 24 * HOUR);
});

test('Mobbin MCP receives imported IDs and does not re-plan known screens', async () => {
  const { store, ctx, dir } = setup({});
  try {
    const source = store.addSource('https://mobbin.com/discover/apps/ios/latest');
    const fixture = JSON.parse(fs.readFileSync(`${__dirname}/fixtures/mobbin-mcp-screens.json`, 'utf8'));
    const known = fixture.structuredContent.screens[0].id;
    store.library(ctx.libraryPath).seen[`mobbin:${known}`] = NOW;
    const calls = [];
    const plan = await planSource(source, { ...ctx, mobbinWebsite: require('./helpers/mobbin').websiteFor(fixture.structuredContent.screens), mobbin: { callTool: async (name, args) => {
      calls.push({ name, args });
      return { structuredContent: { screens: fixture.structuredContent.screens.filter((screen) => screen.id !== known) } };
    } } });
    assert.strictEqual(calls[0].name, 'search_screens');
    assert.deepStrictEqual(calls[0].args.exclude_screen_ids, [known]);
    assert.strictEqual(plan.items.length, 1);
    assert.notStrictEqual(plan.items[0].id, known);
    assert.strictEqual(plan.images, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
