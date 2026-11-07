const { readTsr } = require('../lib/seroval');
const { fetchText, xStatusId, pickVideo, pickImage, toTime, oldestOf, mapLimit } = require('./util');

const ORIGIN = 'https://vibrant.design';
// Older posts come from the sitemap plus each post's page; the site's "load more" lives under
// /api/, which robots.txt disallows.
const MAX_DETAIL_PAGES = 2000;
const DETAIL_CONCURRENCY = 2;

// The homepage mixes categories; the feed with a category filter returns only that category.
function feedUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/feed';
  if (url.pathname === '/feed' && !url.searchParams.has('category')) url.searchParams.set('category', 'interface');
  return url.toString();
}

const asMedia = (type) => (r) => ({ type, url: r.url, width: r.width, height: r.height });

function videosOf(it) {
  return (it.videos || [])
    .map((v) => pickVideo([...(v.renditions || []).filter((r) => r.kind !== 'hover'), { url: v.url, width: v.width, height: v.height }]))
    .filter(Boolean)
    .map(asMedia('video'));
}

function imagesOf(it) {
  return (it.images || [])
    .map((img) => pickImage([...(img.renditions || []), { url: img.url, width: img.width, height: img.height }]))
    .filter(Boolean)
    .map(asMedia('image'));
}

const slugsOf = (list) => (list || []).map((c) => c && c.slug).filter(Boolean);
const namesOf = (list) => (list || []).map((t) => t && t.name).filter(Boolean);

function toItem(it) {
  const creator = it.creator || {};
  const postUrl = it.websiteUrl || null;
  return {
    id: it.shortId,
    xStatusId: xStatusId(postUrl),
    title: it.name || it.slug,
    description: it.description || '',
    creator: { name: creator.name || '', handle: creator.handle || '' },
    postUrl,
    pageUrl: `${ORIGIN}${it.path || `/feed/${it.slug}`}`,
    publishedAt: toTime(it.publishedAt) || toTime(it.createdAt),
    categories: slugsOf(it.categories),
    tags: namesOf(it.tags),
    media: [...videosOf(it), ...imagesOf(it)],
  };
}

function parseKey(html, key) {
  return readTsr(html)
    .valuesForKey(key)
    .flat()
    .filter((it) => it && it.shortId && (Array.isArray(it.videos) || Array.isArray(it.images)))
    .map(toItem)
    .filter((it) => it.media.length);
}

// Feed listing page.
function parse(html) {
  return parseKey(html, 'items');
}

// A single post page (/feed/<id>-<slug>).
function parseDetail(html) {
  return parseKey(html, 'initialData');
}

// Feed post URLs changed since `since`, newest first.
function parseSitemap(xml, since) {
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
    .map(([, url, lastmod]) => ({ url, at: Date.parse(lastmod), id: (/\/feed\/([a-z0-9]+)-/.exec(url) || [])[1] }))
    .filter((e) => e.id && e.at >= since)
    .sort((a, b) => b.at - a.at);
}

async function olderItems(fetch, since, skip) {
  const index = await fetchText(fetch, `${ORIGIN}/sitemap.xml`);
  const maps = [...index.matchAll(/<loc>([^<]*projects[^<]*\.xml)<\/loc>/g)].map((m) => m[1]);
  const entries = [];
  for (const map of maps) entries.push(...parseSitemap(await fetchText(fetch, map), since));
  const todo = entries.filter((e) => !skip(e.id)).slice(0, MAX_DETAIL_PAGES);
  let failed = 0;
  const load = (url) => fetchText(fetch, url).then(parseDetail);
  const pages = await mapLimit(todo, DETAIL_CONCURRENCY, (e) =>
    load(e.url).catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => load(e.url))).catch(() => {
      failed += 1;
      return [];
    }),
  );
  // A few misses are picked up by the next run (they stay unseen); many means we're blocked.
  if (failed > Math.max(3, todo.length * 0.1)) {
    throw new Error(`Couldn't load ${failed} of ${todo.length} older vibrant.design posts. Try again later.`);
  }
  return pages.flat();
}

module.exports = {
  id: 'vibrant',
  label: 'vibrant.design',
  matches: (url) => /(^|\.)vibrant\.design$/i.test(new URL(url).hostname),
  async fetchItems(sourceUrl, { fetch, since, isKnown = () => false }) {
    const url = feedUrl(sourceUrl);
    const category = new URL(url).searchParams.get('category');
    let items = parse(await fetchText(fetch, url));
    if (since != null && items.length && oldestOf(items) > since) {
      const onPage = new Set(items.map((it) => it.id));
      items = items.concat(await olderItems(fetch, since, (id) => onPage.has(id) || isKnown(id)));
    }
    return category ? items.filter((it) => !it.categories.length || it.categories.includes(category)) : items;
  },
  parse,
  parseDetail,
  parseSitemap,
  feedUrl,
};
