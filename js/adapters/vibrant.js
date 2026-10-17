const { readTsr } = require('../lib/seroval');
const { fetchText, xStatusId, pickVideo, pickImage, toTime } = require('./util');

const ORIGIN = 'https://vibrant.design';

// The homepage mixes categories; the feed with a category filter returns only that category.
function feedUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/feed';
  if (url.pathname === '/feed' && !url.searchParams.has('category')) url.searchParams.set('category', 'interface');
  return url.toString();
}

function parse(html) {
  const items = readTsr(html).valuesForKey('items').filter(Array.isArray).flat();
  return items
    .filter((it) => it && it.shortId && (Array.isArray(it.videos) || Array.isArray(it.images)))
    .map((it) => {
      const videos = (it.videos || [])
        .map((v) => pickVideo([...(v.renditions || []).filter((r) => r.kind !== 'hover'), { url: v.url, width: v.width, height: v.height }]))
        .filter(Boolean)
        .map((r) => ({ type: 'video', url: r.url, width: r.width, height: r.height }));
      const images = (it.images || [])
        .map((img) => pickImage([...(img.renditions || []), { url: img.url, width: img.width, height: img.height }]))
        .filter(Boolean)
        .map((r) => ({ type: 'image', url: r.url, width: r.width, height: r.height }));
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
        categories: (it.categories || []).map((c) => c && c.slug).filter(Boolean),
        tags: (it.tags || []).map((t) => t && t.name).filter(Boolean),
        media: [...videos, ...images],
      };
    })
    .filter((it) => it.media.length);
}

module.exports = {
  id: 'vibrant',
  label: 'vibrant.design',
  matches: (url) => /(^|\.)vibrant\.design$/i.test(new URL(url).hostname),
  async fetchItems(sourceUrl, { fetch }) {
    const url = feedUrl(sourceUrl);
    const category = new URL(url).searchParams.get('category');
    const items = parse(await fetchText(fetch, url));
    return category ? items.filter((it) => !it.categories.length || it.categories.includes(category)) : items;
  },
  parse,
  feedUrl,
};
