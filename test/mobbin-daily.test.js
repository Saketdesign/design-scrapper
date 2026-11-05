const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createStore } = require('../js/store');
const { planSource, importPlan, runSource } = require('../js/runner');
const mobbin = require('../js/adapters/mobbin');
const { websiteFor } = require('./helpers/mobbin');

const NOW = new Date(2026, 10, 5, 12).getTime();
const DAY = 86400e3;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const screen = (n, app, platform = 'ios') => ({ id: id(n), app_name: app, platform, image_url: `https://media.test/${n}.webp` });

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-daily-'));
  const store = createStore(dir);
  const source = store.addSource('https://mobbin.com/discover/apps/ios/latest');
  const a = [screen(1, 'Alpha'), screen(2, 'Alpha')];
  const b = [screen(3, 'Beta'), screen(4, 'Beta')];
  const calls = [];
  const added = [];
  let broken = null;
  const ctx = {
    store, libraryPath: '/library', tmpDir: path.join(dir, 'tmp'), now: NOW,
    mobbin: { callTool: async (name, args) => {
      calls.push({ name, args });
      const list = args.query === 'Alpha app screen' ? [...a, screen(5, 'Other app'), screen(6, 'Alpha', 'web')]
        : args.query === 'Beta app screen' ? b : [a[0], b[0]];
      return { structuredContent: { screens: list.filter((s) => !args.exclude_screen_ids.includes(s.id)) } };
    } },
    mobbinWebsite: websiteFor([...a, ...b]),
    fetch: async (url) => new Response(new Uint8Array([1, 2]), { status: url === broken ? 503 : 200, headers: { 'Content-Type': 'image/webp' } }),
    eagleItem: { count: async () => 0, addFromPath: async (_file, options) => { added.push(options); return `item-${added.length}`; } },
  };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store, source, a, b, calls, added, ctx, fail: (url) => { broken = url; } };
}

test('the animations feed imports new videos only, paging back to the run window', async (t) => {
  const { store, ctx, calls, added } = setup(t);
  const source = store.addSource('https://mobbin.com/discover/apps/ios/animations');
  const record = (n, hoursAgo, video = true) => ({
    id: id(100 + n), appId: id(900), appVersionId: id(901), appName: 'Gamma', platform: 'ios',
    publishedAt: new Date(NOW - hoursAgo * 3600e3).toISOString(), createdAt: new Date(NOW - hoursAgo * 3600e3).toISOString(),
    animationCdnVideoSources: video ? { source: { url: `https://media.test/a${n}.mp4`, type: 'video/mp4' } } : null,
  });
  const pages = [[record(1, 1), record(2, 2, false)], [record(3, 5), record(4, 80)], [record(5, 90)]];
  const requests = [];
  ctx.mobbinWebsite = { request: async (endpoint, body) => {
    requests.push(body);
    assert.equal(endpoint, '/api/discover/fetch-discover-page-animations');
    const cursor = body.keysetPagination && body.keysetPagination.lastAnimationId;
    return { data: pages[cursor ? pages.findIndex((p) => p[p.length - 1].id === cursor) + 1 : 0], pageSize: 2 };
  } };
  const first = await runSource(source, ctx);
  assert.equal(first.imported, 2, 'the two videos from the last two days');
  assert.deepEqual(added.map((item) => item.name), ['Gamma - Animation 00000000', 'Gamma - Animation 00000000']);
  assert.ok(added.every((item) => item.tags.includes('Animation') && item.website.includes(`-ios-${id(900)}/${id(901)}/screens`)));
  assert.equal(requests.length, 2, 'stops once a page reaches past the window');
  assert.equal(requests[1].keysetPagination.lastAnimationId, id(102));
  assert.equal(calls.length, 0, 'the feed does not use MCP');
  assert.equal(store.library(ctx.libraryPath).mobbinDaily.current, undefined, 'does not select a daily app');
  requests.length = 0;
  const again = await runSource(source, { ...ctx, now: NOW + 1000 });
  assert.equal(again.imported, 0);
});

test('one completed iOS app per local day, including manual runs and date ranges', async (t) => {
  const { store, source, calls, added, ctx } = setup(t);
  const first = await runSource(source, ctx);
  assert.equal(first.imported, 2);
  assert.ok(added.every((item) => item.name.startsWith('Alpha -')));
  assert.ok(added.every((item) => item.tags.includes('Alpha') && item.tags.includes('ios')));
  const daily = store.library(ctx.libraryPath).mobbinDaily;
  assert.equal(daily.current.name, 'Alpha');
  assert.equal(daily.current.completedDay, mobbin.dayOf(NOW));
  assert.ok(daily.completedApps['ios:alpha']);
  const count = calls.length;
  for (const days of [null, 30, 'all']) {
    const again = await runSource(source, { ...ctx, now: NOW + 1000, days });
    assert.equal(again.imported, 0);
  }
  assert.equal(calls.length, count, 'today’s completed app needs no further MCP calls');
  const next = await runSource(source, { ...ctx, now: NOW + DAY });
  assert.equal(next.imported, 2);
  assert.equal(daily.current.name, 'Beta');
  assert.ok(added.slice(2).every((item) => item.name.startsWith('Beta -')));
});

test('failed downloads retain the selected app across restart and finish before selecting another', async (t) => {
  const { dir, source, store, calls, added, ctx, fail } = setup(t);
  fail('https://media.test/2.webp');
  const first = await runSource(source, ctx);
  assert.equal(first.imported, 1);
  assert.match(first.error, /resume the same app/);
  assert.equal(store.library(ctx.libraryPath).mobbinDaily.current.name, 'Alpha');
  assert.ok(!store.library(ctx.libraryPath).mobbinDaily.current.completedAt);
  assert.ok(!store.library(ctx.libraryPath).status[source.id].lastSuccessAt);
  fail(null);
  const reloaded = createStore(dir);
  const before = calls.length;
  const resumed = await runSource(source, { ...ctx, store: reloaded, now: NOW + DAY });
  assert.equal(resumed.imported, 1);
  assert.equal(calls.length, before, 'resuming does not choose another app through MCP');
  assert.equal(added.length, 2, 'does not repeat the file imported before restart');
  const sameDay = await runSource(source, { ...ctx, store: reloaded, now: NOW + DAY + 1000 });
  assert.equal(sameDay.imported, 0, 'finishing yesterday’s app consumes today’s selection');
});

test('a stopped run resumes the same app and leaves the remaining screens pending', async (t) => {
  const { source, store, ctx } = setup(t);
  const plan = await planSource(source, ctx);
  let checks = 0;
  const stopped = await importPlan(plan, { ...ctx, shouldStop: () => checks++ >= 1 });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.imported, 1);
  assert.ok(!store.library(ctx.libraryPath).mobbinDaily.current.completedAt);
  const resumed = await runSource(source, { ...ctx, days: 'all' });
  assert.equal(resumed.imported, 1);
  assert.ok(store.library(ctx.libraryPath).mobbinDaily.current.completedAt);
});

test('two sources planned together cannot duplicate the app’s screens or select another app', async (t) => {
  const { source, store, ctx, added } = setup(t);
  const other = store.addSource('https://mobbin.com/?query=checkout%20screen');
  const first = await planSource(source, ctx);
  const second = await planSource(other, ctx);
  assert.equal(first.metadata.appKey, second.metadata.appKey);
  await importPlan(first, ctx);
  const result = await importPlan(second, ctx);
  assert.equal(result.imported, 0);
  assert.equal(added.length, 2);
});

test('selection is persisted before website export so a Chrome failure retries the same app', async (t) => {
  const { dir, source, store, ctx, calls } = setup(t);
  const delegate = ctx.mobbinWebsite.request;
  ctx.mobbinWebsite.request = async () => { throw new Error('Chrome temporarily unavailable'); };
  const result = await runSource(source, ctx);
  assert.match(result.error, /temporarily unavailable/);
  assert.equal(createStore(dir).library(ctx.libraryPath).mobbinDaily.current.name, 'Alpha');
  ctx.mobbinWebsite.request = delegate;
  const before = calls.length;
  await runSource(source, ctx);
  assert.equal(calls.length, before);
});

test('imports every screen beyond 30 plus animations, and retries a failed video independently', async (t) => {
  const { store, source, ctx, added, fail } = setup(t);
  const screens = Array.from({ length: 45 }, (_, n) => screen(n + 1, 'Alpha'));
  ctx.mobbinWebsite = websiteFor(screens, [id(1), id(20), id(45)]);
  fail(`https://media.test/${id(20)}.mp4`);
  ctx.fetch = async (url) => new Response(new Uint8Array([1, 2]), { status: url === `https://media.test/${id(20)}.mp4` && !ctx.fixed ? 503 : 200, headers: { 'Content-Type': url.endsWith('.mp4') ? 'video/mp4' : 'image/webp' } });
  const first = await runSource(source, { ...ctx, days: 'all' });
  assert.equal(first.imported, 47);
  assert.match(first.error, /resume the same app/);
  assert.equal(store.library(ctx.libraryPath).mobbinDaily.current.assetIds.length, 48);
  assert.equal(added.filter((a) => a.tags.includes('Animation')).length, 2);
  ctx.fixed = true;
  const resumed = await runSource(source, ctx);
  assert.equal(resumed.imported, 1);
  assert.equal(added.filter((a) => a.tags.includes('Screen')).length, 45);
  assert.equal(added.filter((a) => a.tags.includes('Animation')).length, 3);
  assert.equal(store.library(ctx.libraryPath).mobbinDaily.completedApps['ios:alpha'].screens, 45);
});

test('the previous 30-screen daily selection is upgraded without importing those screens again', async (t) => {
  const { store, source, ctx, calls } = setup(t);
  const lib = store.library(ctx.libraryPath);
  lib.mobbinDaily = { current: { key: 'ios:alpha', name: 'Alpha', selectedAt: NOW - 1000, selectedDay: mobbin.dayOf(NOW), screenIds: [id(1)], completedAt: NOW, completedDay: mobbin.dayOf(NOW) }, completedApps: { 'ios:alpha': { name: 'Alpha', completedAt: NOW } } };
  lib.seen[`mobbin:${id(1)}`] = NOW;
  ctx.mobbinWebsite = websiteFor([screen(1, 'Alpha'), screen(2, 'Alpha')], [id(1)]);
  const result = await runSource(source, ctx);
  assert.equal(result.imported, 2, 'imports the missing screen and the existing screen’s animation');
  assert.equal(calls.length, 0, 'retains the app already selected today');
  assert.equal(lib.mobbinDaily.current.exportVersion, 3);
});

test('missing pending screens fail without changing the frozen catalog or selecting another app', async (t) => {
  const { store, source, ctx } = setup(t);
  await planSource(source, ctx);
  const daily = store.library(ctx.libraryPath).mobbinDaily;
  const ids = [...daily.current.assetIds];
  ctx.mobbinWebsite = websiteFor([screen(1, 'Alpha')]);
  await assert.rejects(planSource(source, ctx), /every screen in this app version/);
  assert.deepEqual(daily.current.assetIds, ids);
  assert.equal(daily.current.name, 'Alpha');
});
