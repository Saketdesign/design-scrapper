const { readTsr } = require('../lib/seroval');
const { fetchText, xStatusId, pickVideo, pickImage, toTime, oldestOf, USER_AGENT } = require('./util');

const ORIGIN = 'https://recent.design';
// The site's own "load more" endpoint (oRPC), used only to page back past the first page.
const API = 'https://api.recent.design/rpc/items/list';
const PAGE_SIZE = 20;
const MAX_PAGES = 40;

function feedUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  if (!url.searchParams.has('category')) url.searchParams.set('category', 'interface');
  return url.toString();
}

function mediaOf(m) {
  const renditions = [...(m.renditions || []), { url: m.url, width: m.mediaWidth, height: m.mediaHeight }];
  const best = m.mediaType === 'video' ? pickVideo(renditions) : pickImage(renditions);
  if (!best) return null;
  return { type: m.mediaType === 'video' ? 'video' : 'image', url: best.url, width: best.width, height: best.height };
}

function toItems(raw) {
  return raw
    .filter((it) => it && it.id && Array.isArray(it.media) && it.media.length)
    .filter((it) => !it.status || it.status === 'published')
    .map((it) => {
      const account = (it.source && it.source.account) || it.creator || {};
      const postUrl = (it.source && it.source.url) || null;
      return {
        id: it.id,
        xStatusId: xStatusId(postUrl),
        title: it.title || it.slug,
        description: it.description || it.tagline || '',
        creator: { name: account.name || '', handle: account.handle || '' },
        postUrl,
        pageUrl: `${ORIGIN}/i/${it.id}-${it.slug}`,
        publishedAt: toTime(it.publishedAt) || toTime(it.createdAt),
        category: it.category && it.category.slug,
        tags: (it.tags || []).map((t) => t && t.name).filter(Boolean),
        media: it.media.map(mediaOf).filter(Boolean),
      };
    });
}

function parsePage(html) {
  const pages = readTsr(html)
    .valuesForKey('pages')
    .filter(Array.isArray)
    .flat()
    .filter((p) => p && Array.isArray(p.items) && p.items.some((it) => it && it.media));
  const last = pages[pages.length - 1];
  return { items: toItems(pages.flatMap((p) => p.items)), nextCursor: (last && last.nextCursor) || null };
}

function parse(html) {
  return parsePage(html).items;
}

async function fetchPage(fetch, category, cursor) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ json: { category, sort: 'recent', limit: PAGE_SIZE, cursor } }),
  });
  if (!res.ok) throw new Error(`recent.design older pages responded ${res.status}`);
  const { json } = await res.json();
  return { items: toItems(json.items || []), nextCursor: json.nextCursor || null };
}

module.exports = {
  id: 'recent',
  label: 'recent.design',
  matches: (url) => /(^|\.)recent\.design$/i.test(new URL(url).hostname),
  async fetchItems(sourceUrl, { fetch, since }) {
    const url = feedUrl(sourceUrl);
    const category = new URL(url).searchParams.get('category');
    let { items, nextCursor } = parsePage(await fetchText(fetch, url));
    for (let page = 1; nextCursor && since && oldestOf(items) >= since && page < MAX_PAGES; page++) {
      const next = await fetchPage(fetch, category, nextCursor);
      items = items.concat(next.items);
      nextCursor = next.nextCursor;
    }
    return items;
  },
  parse,
  parsePage,
  feedUrl,
};
