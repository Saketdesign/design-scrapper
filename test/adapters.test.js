const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const recent = require('../js/adapters/recent');
const vibrant = require('../js/adapters/vibrant');
const bdx = require('../js/adapters/bestdesignsonx');
const generic = require('../js/adapters/generic');
const { adapterFor } = require('../js/adapters');
const { MAX_VIDEO_SHORT_EDGE } = require('../js/adapters/util');

const fixture = (name) => fs.readFileSync(`${__dirname}/fixtures/${name}`, 'utf8');
const shortEdge = (m) => Math.min(m.width, m.height);

test('routes source links to the right adapter', () => {
  assert.strictEqual(adapterFor('https://recent.design/?category=interface').id, 'recent');
  assert.strictEqual(adapterFor('https://vibrant.design/').id, 'vibrant');
  assert.strictEqual(adapterFor('https://www.bestdesignsonx.com/').id, 'bestdesignsonx');
  assert.strictEqual(adapterFor('https://example.com/gallery').id, 'generic');
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
