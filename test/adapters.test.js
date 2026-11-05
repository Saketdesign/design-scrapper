const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const recent = require('../js/adapters/recent');
const vibrant = require('../js/adapters/vibrant');
const bdx = require('../js/adapters/bestdesignsonx');
const generic = require('../js/adapters/generic');
const sixtyfps = require('../js/adapters/sixtyfps');
const appinspo = require('../js/adapters/appinspo');
const inspora = require('../js/adapters/inspora');
const { labelFor } = require('../js/runner');
const { adapterFor } = require('../js/adapters');
const { MAX_VIDEO_SHORT_EDGE, findSupabaseConfig } = require('../js/adapters/util');

const fixture = (name) => fs.readFileSync(`${__dirname}/fixtures/${name}`, 'utf8');
const shortEdge = (m) => Math.min(m.width, m.height);

test('routes source links to the right adapter', () => {
  assert.strictEqual(adapterFor('https://recent.design/?category=interface').id, 'recent');
  assert.strictEqual(adapterFor('https://vibrant.design/').id, 'vibrant');
  assert.strictEqual(adapterFor('https://www.bestdesignsonx.com/').id, 'bestdesignsonx');
  assert.strictEqual(adapterFor('https://60fps.design/').id, '60fps');
  assert.strictEqual(adapterFor('https://60fps.design/snippets').id, '60fps');
  assert.strictEqual(adapterFor('https://mockup.60fps.design/').id, 'generic');
  assert.strictEqual(adapterFor('https://appinspo.com').id, 'appinspo');
  assert.strictEqual(adapterFor('https://inspora.design').id, 'inspora');
  assert.strictEqual(adapterFor('https://example.com/gallery').id, 'generic');
});

test('sources on one site get distinct labels', () => {
  assert.strictEqual(labelFor({ url: 'https://60fps.design/' }, sixtyfps), '60fps.design');
  assert.strictEqual(labelFor({ url: 'https://60fps.design/snippets' }, sixtyfps), '60fps.design/snippets');
  assert.strictEqual(labelFor({ url: 'https://www.inspora.design/' }, inspora), 'inspora.design');
});

test('UI-only feed URLs', () => {
  assert.strictEqual(vibrant.feedUrl('https://vibrant.design/'), 'https://vibrant.design/feed?category=interface');
  assert.strictEqual(recent.feedUrl('https://recent.design/'), 'https://recent.design/?category=interface');
  assert.strictEqual(recent.feedUrl('https://recent.design/?category=motion'), 'https://recent.design/?category=motion');
});

test('recent.design: interface posts with X links, capped videos and multi-slide media', () => {
  const items = recent.parse(fixture('recent.html'));
  assert.ok(items.length >= 15);
  for (const it of items) {
    assert.strictEqual(it.category, 'interface');
    assert.match(it.pageUrl, /^https:\/\/recent\.design\/i\/\w+-/);
    assert.ok(it.publishedAt > Date.parse('2026-01-01'));
    for (const m of it.media.filter((x) => x.type === 'video')) assert.ok(shortEdge(m) <= MAX_VIDEO_SHORT_EDGE, m.url);
  }
  assert.ok(items.every((it) => it.xStatusId));
  assert.ok(items.some((it) => it.media.length > 1));
  assert.ok(items.some((it) => it.media.some((m) => m.type === 'video' && m.url.endsWith('.mp4'))));
});

test('vibrant.design: interface items, never the hover preview clip', () => {
  const items = vibrant.parse(fixture('vibrant.html'));
  assert.ok(items.length >= 20);
  for (const it of items) {
    assert.ok(it.categories.includes('interface'));
    assert.ok(it.media.every((m) => !m.url.includes('/hover.')));
  }
  const withVideo = items.find((it) => it.media[0].type === 'video');
  assert.ok(shortEdge(withVideo.media[0]) <= MAX_VIDEO_SHORT_EDGE);
  assert.ok(items.some((it) => it.tags.length && it.description));
});

test('bestdesignsonx: keeps UI posts, drops branding/logo-only ones', () => {
  const rows = JSON.parse(fixture('bestdesignsonx.json'));
  const items = bdx.parse(rows);
  assert.ok(items.length > 0 && items.length < rows.length);
  assert.ok(items.every((it) => it.tags.some((t) => !['branding', 'logo', 'motion'].includes(t))));
  assert.ok(items.every((it) => it.postUrl.startsWith('https://x.com/') && it.xStatusId));
  assert.strictEqual(bdx.isUi({ tags: ['branding', 'logo'] }), false);
  assert.strictEqual(bdx.isUi({ tags: ['ui-interaction', 'branding'] }), true);
  // Untagged posts are judged by their text.
  assert.strictEqual(bdx.isUi({ tags: [], tweet_text: 'Brand identity for Pera' }), false);
  assert.strictEqual(bdx.isUi({ tags: [], tweet_text: 'New release: a contemporary sans serif typeface' }), false);
  assert.strictEqual(bdx.isUi({ tags: [], tweet_text: 'Toasts that stack instead of pile up' }), true);
  assert.strictEqual(bdx.isUi({ tags: [], tweet_text: 'Branding website hero section' }), true);
  const gif = bdx.parse([{ id: 1, handle: 'a', tags: ['ui-interaction'], post_url: '/a/status/9', media: [{ type: 'animated_gif', video_url: 'https://cdn/x', width: 10, height: 10 }] }]);
  assert.strictEqual(gif[0].media[0].type, 'video');
});

test('bestdesignsonx: reads the data endpoint from the site bundle', () => {
  assert.deepStrictEqual(bdx.findConfig(fixture('bestdesignsonx-bundle.txt')), {
    url: 'https://tuzpqmdnxvlzwqthgseg.supabase.co',
    key: 'eyJFAKE.test.key',
  });
});

test('60fps: one item per shot, paired with its own video, no ads or nav links', () => {
  const items = sixtyfps.parse(fixture('60fps.html'), 'https://60fps.design/');
  assert.ok(items.length >= 25);
  assert.strictEqual(new Set(items.map((it) => it.id)).size, items.length);
  assert.ok(items.every((it) => /^shots\/[a-z0-9-]+$/.test(it.id) && it.id !== 'shots/watch'));
  assert.ok(items.every((it) => it.media.length === 1 && /^https:\/\/video\.gumlet\.io\/.+\/main\.mp4$/.test(it.media[0].url)));
  const first = items.find((it) => it.id === 'shots/apple-app-store-app-page-header-asset-animation');
  assert.strictEqual(first.title, 'Apple App Store App Page Header Asset Animation');
  assert.match(first.media[0].url, /6ad76a161ab4445ed4e6277c/);
  assert.deepStrictEqual(first.tags, ['App Store']);
  assert.strictEqual(first.pageUrl, 'https://60fps.design/shots/apple-app-store-app-page-header-asset-animation');
});

test('60fps: snippets and shot pages', () => {
  const snippets = sixtyfps.parse(fixture('60fps-snippets.html'), 'https://60fps.design/snippets');
  assert.deepStrictEqual(snippets.map((it) => it.id), [
    'snippets/subscribe-button-change-interaction',
    'snippets/cancel-button-expand-to-confirm-interaction',
    'snippets/graph-scrub-highlight-glow-interaction',
    'snippets/dropdown-menu-expand-morph-interaction',
  ]);
  assert.strictEqual(snippets[0].title, 'Subscribe Button Change Interaction');
  assert.match(snippets[0].media[0].url, /6ad642e0e3f3cd8d1a457b91\/main\.mp4$/);
  const detail = sixtyfps.parseDetail(fixture('60fps-shot.html'));
  assert.strictEqual(detail.title, 'Apple App Store App Page Header Asset Animation');
  assert.strictEqual(detail.publishedAt, Date.parse('2026-10-20T13:18:14.000Z'));
  assert.match(detail.video, /main\.mp4$/);
  assert.ok(detail.description);
});

test('appinspo: UI categories only, videos and X handles', () => {
  const rows = JSON.parse(fixture('appinspo.json'));
  const items = appinspo.parse(rows);
  assert.ok(items.length > 0 && items.length < rows.length, 'drops the icons post');
  assert.ok(items.every((it) => ['desktop', 'mobile', 'watch', 'vision'].includes(it.tags[0]) && it.publishedAt));
  const video = items.find((it) => it.media[0].type === 'video');
  assert.match(video.media[0].url, /\.mp4/);
  assert.ok(items.some((it) => it.media[0].type === 'image'));
  assert.ok(items.some((it) => it.creator.handle));
  assert.deepStrictEqual(appinspo.categoriesFor('https://appinspo.com/tagged/icons'), ['icons']);
  assert.deepStrictEqual(appinspo.parse(rows, ['icons']).map((it) => it.tags[0]), ['icons']);
});

test('appinspo: reads the data endpoint from the site bundle', () => {
  assert.deepStrictEqual(findSupabaseConfig(fixture('appinspo-bundle.txt')), {
    url: 'https://agbxwcsaoimvmnlnelss.supabase.co',
    key: 'eyJFAKE.test.key',
  });
});

test('inspora: posts from the page data, oversized videos swapped for the preview', () => {
  const items = inspora.parse(fixture('inspora.html'));
  assert.strictEqual(items.length, 16);
  for (const it of items) {
    assert.match(it.pageUrl, /^https:\/\/www\.inspora\.design\/posts\/[a-z0-9-]+$/);
    assert.ok(it.publishedAt > Date.parse('2026-01-01') && it.title && it.creator.name);
    for (const m of it.media.filter((x) => x.type === 'video')) assert.ok(shortEdge(m) <= MAX_VIDEO_SHORT_EDGE, m.url);
  }
  assert.deepStrictEqual(inspora.listingUrls('https://inspora.design'), [
    'https://www.inspora.design/?category=Web',
    'https://www.inspora.design/?category=Product',
  ]);
  assert.deepStrictEqual(inspora.listingUrls('https://www.inspora.design/?category=Motion'), ['https://www.inspora.design/?category=Motion']);
});

test('generic: decodes entities in titles', () => {
  const items = generic.parse('<title>A &amp; B &#8211; C</title><video src="/a.mp4"></video>', 'https://example.com/');
  assert.strictEqual(items[0].title, 'A & B – C');
});

test('generic: picks large images and videos, skips icons and duplicates', () => {
  const html = `<title>Gallery</title>
    <meta property="og:image" content="/og.png">
    <img src="/logo.png" width="800"><img src="/tiny.jpg" width="40">
    <img srcset="/shot-640.webp 640w, /shot-1600.webp 1600w" alt="Dashboard">
    <img src="/shot-1600.webp?x=1"><video src="/clip.mp4"></video>`;
  const items = generic.parse(html, 'https://example.com/page');
  assert.deepStrictEqual(items.map((i) => i.media[0].url), [
    'https://example.com/og.png',
    'https://example.com/clip.mp4',
    'https://example.com/shot-1600.webp',
  ]);
  assert.strictEqual(items[2].title, 'Dashboard');
});
