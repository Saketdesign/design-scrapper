const { readTsr } = require('../lib/seroval');
const { fetchText, xStatusId, pickVideo, pickImage, toTime } = require('./util');

const ORIGIN = 'https://recent.design';

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

function parse(html) {
  const items = readTsr(html).valuesForKey('items').filter(Array.isArray).flat();
  return items
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

module.exports = {
  id: 'recent',
  label: 'recent.design',
  matches: (url) => /(^|\.)recent\.design$/i.test(new URL(url).hostname),
  async fetchItems(sourceUrl, { fetch }) {
    return parse(await fetchText(fetch, feedUrl(sourceUrl)));
  },
  parse,
  feedUrl,
};
