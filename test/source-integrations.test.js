const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { discoverSupabaseConfig } = require('../js/adapters/util');
const bdx = require('../js/adapters/bestdesignsonx');
const spotted = require('../js/adapters/spottedinprod');
const mobbin = require('../js/adapters/mobbin');
const { adapterFor } = require('../js/adapters');

test('dedicated routing prevents marketing assets from being imported as designs', async () => {
  assert.equal(adapterFor('https://www.mobbin.com/').id, 'mobbin');
  assert.equal(adapterFor('https://cosmos.so/').id, 'cosmos');
  assert.equal(adapterFor('https://www.spottedinprod.com/clips').id, 'spottedinprod');
  await assert.rejects(adapterFor('https://cosmos.so').fetchItems(), /not supported yet/);
  await assert.rejects(mobbin.fetchItems('https://mobbin.com', {}), /Connect Mobbin MCP/);
});

test('Supabase discovery follows SvelteKit modules without fetching third-party scripts or looping', async () => {
  const pages = {
    'https://site.test/': '<script src="https://sponsor.test/a.js"></script><script>import("/_app/entry/app.js")</script>',
    'https://site.test/_app/entry/app.js': 'const nodes=["/_app/nodes/2.js"]; import "../chunks/runtime.js";',
    'https://site.test/_app/nodes/2.js': 'import {x} from "../chunks/data.js";',
    'https://site.test/_app/chunks/runtime.js': 'import "../entry/app.js";',
    'https://site.test/_app/chunks/data.js': 'client("https://public.supabase.co","eyJfake.test.key")',
  };
  const calls = [];
  const config = await discoverSupabaseConfig(async (url) => {
    calls.push(url);
    assert.ok(pages[url], url);
    return new Response(pages[url]);
  }, 'https://site.test');
  assert.deepEqual(config, { url: 'https://public.supabase.co', key: 'eyJfake.test.key' });
  assert.equal(calls.length, new Set(calls).size);
  assert.ok(calls.every((u) => new URL(u).origin === 'https://site.test'));
});

test('Best Designs on X queries its new table with the bdox schema', async () => {
  const calls = [];
  await bdx.fetchItems('https://bestdesignsonx.com/', { since: 0, fetch: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/')) return new Response('<script src="/app.js"></script>');
    if (url.endsWith('/app.js')) return new Response('client("https://public.supabase.co","eyJfake.test.key")');
    return new Response('[]');
  } });
  const call = calls.find((c) => c.url.includes('/rest/v1/'));
  assert.equal(new URL(call.url).pathname, '/rest/v1/bdox_designs');
  assert.equal(call.init.headers['Accept-Profile'], 'bdox');
});

test('Spotted in Prod reads actual community and editorial clips from a live page fixture', () => {
  const items = spotted.parse(fs.readFileSync(`${__dirname}/fixtures/spottedinprod.html`, 'utf8'));
  assert.equal(items.length, 20);
  assert.equal(new Set(items.map((i) => i.id)).size, 20);
  assert.ok(items.some((i) => i.id.startsWith('community-')));
  assert.ok(items.some((i) => /^\d+$/.test(i.id)));
  assert.ok(items.every((i) => i.media.length && i.media.every((m) => m.type === 'video' && m.url.endsWith('.mp4'))));
  assert.ok(items.every((i) => i.pageUrl.includes('/clips/') && i.publishedAt));
});

test('Spotted in Prod skips locked clips and reads flight chunks without executing scripts', () => {
  const data = JSON.stringify({ sourceType: 'editorial', post: { id: 9, isLocked: true, videoName: 'locked.mp4' } });
  const html = `<script>throw new Error('never execute');self.__next_f.push([1,${JSON.stringify(data.slice(0, 30))}]);self.__next_f.push([1,${JSON.stringify(data.slice(30))}]);</script>`;
  assert.deepEqual(spotted.parse(html), []);
});

const fixture = JSON.parse(fs.readFileSync(`${__dirname}/fixtures/mobbin-mcp-screens.json`, 'utf8'));
const { websiteFor } = require('./helpers/mobbin');

test('Mobbin selects one iOS app and keeps only its full-resolution screens', async () => {
  const calls = [];
  const mcp = { callTool: async (name, args) => { calls.push({ name, args }); return fixture; } };
  const known = fixture.structuredContent.screens[1].id;
  const items = await mobbin.fetchItems('https://mobbin.com', { mobbin: mcp, mobbinWebsite: websiteFor(fixture.structuredContent.screens), knownIds: [known, 'not-a-uuid'], isKnown: (id) => id === known });
  assert.deepEqual(calls.map((c) => c.args.platform), ['ios']);
  assert.ok(calls.every((c) => c.name === 'search_screens' && c.args.mode === 'standard' && c.args.output_destination === 'reference_library'));
  assert.deepEqual(calls[0].args.exclude_screen_ids, [known]);
  assert.equal(items.length, 1);
  assert.equal(items[0].creator.name, 'CapCut');
  assert.equal(items[0].media[0].url, fixture.structuredContent.screens[0].image_url);
  assert.equal(items[0].pageUrl, `https://mobbin.com/screens/${items[0].id}`);
  assert.equal(items[0].publishedAt, null);
});

test('Mobbin preserves a custom discovery query without limiting the app export', async () => {
  const calls = [];
  await mobbin.fetchItems('https://mobbin.com/discover/apps/ios/latest?query=checkout%20screen&limit=5', {
    mobbin: { callTool: async (name, args) => { calls.push(args); return fixture; } },
    mobbinWebsite: websiteFor(fixture.structuredContent.screens),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, 'checkout screen');
  assert.match(mobbin.scopeFor('https://mobbin.com/discover/apps/ios/latest'), /Full iOS app daily/);
  assert.equal(mobbin.scopeFor('https://mobbin.com/discover/apps/ios/animations'), 'iOS animations');
  assert.throws(() => mobbin.searchOptions('https://mobbin.com/discover/apps/web/latest'), /one iOS app/);
  assert.deepEqual(mobbin.searchOptions('https://mobbin.com/?limit=100'), { query: 'app interface screen' });
});

test('Mobbin reads JSON text fallback but never imports low-resolution image content blocks', () => {
  const screens = fixture.structuredContent.screens;
  const result = { content: [{ type: 'image', data: 'preview-only' }, { type: 'text', text: JSON.stringify({ screens }) }] };
  assert.equal(mobbin.parse(result, 'UI screens').length, 2);
  assert.throws(() => mobbin.parse({ content: [{ type: 'image', data: 'preview-only' }] }, 'UI screens'), /unexpected screen-search/);
  assert.throws(() => mobbin.parse({ structuredContent: { screens: [{ id: screens[0].id, image_url: 'file:///private/x.png' }] } }, 'UI'), /valid ID or full-resolution/);
});
