const { fetchText, toTime } = require('./util');
const { flightData, jsonAt } = require('../lib/next-flight');

const ORIGIN = 'https://www.spottedinprod.com';

function parse(html) {
  const data = flightData(html);
  const items = new Map();
  for (const m of data.matchAll(/"sourceType":"(community|editorial)","(?:clip|post)":/g)) {
    const clip = jsonAt(data, m.index + m[0].length);
    if (!clip || clip.id == null) continue;
    const community = m[1] === 'community';
    if (clip.isLocked) continue;
    const id = `${community ? 'community-' : ''}${clip.id}`;
    const rawMedia = community ? clip.media || [] : clip.videoName && /^[\w.-]+\.mp4$/.test(clip.videoName)
      ? [{ type: 'video', url: `https://cdn.spottedinprod.com/clips/${clip.videoName}` }] : [];
    const media = rawMedia.filter((v) => v.status == null || v.status === 'ready').map((v) => ({
      type: v.type === 'video' ? 'video' : 'image',
      url: v.transcodedUrl || v.url,
      width: v.width || null, height: v.height || null,
    })).filter((v) => /^https:\/\/cdn\.spottedinprod\.com\//.test(v.url || ''));
    if (!media.length) continue;
    const owner = clip.owner || clip.app || { name: clip.appName };
    items.set(id, {
      id, xStatusId: null, title: clip.title || [clip.appName, clip.displayName].filter(Boolean).join(' — ') || `Clip ${clip.id}`,
      description: clip.description || '',
      creator: { name: owner.displayName || owner.name || '', handle: owner.username || '' },
      postUrl: null, pageUrl: `${ORIGIN}/clips/${id}`, publishedAt: toTime(clip.publishedAt || clip.createdAt),
      tags: (clip.tags || []).map((t) => typeof t === 'string' ? t : t.name).filter(Boolean), media,
    });
  }
  return [...items.values()];
}

module.exports = {
  id: 'spottedinprod', label: 'spottedinprod.com',
  matches: (url) => /^(www\.)?spottedinprod\.com$/i.test(new URL(url).hostname),
  // The server-rendered listing is curated, not chronological. Never stop on an old pinned clip.
  // Reads the visible listing only; an all-time run does not imply a full archive crawl.
  async fetchItems(sourceUrl, { fetch }) {
    const url = new URL(sourceUrl);
    return parse(await fetchText(fetch, `${ORIGIN}${url.pathname === '/' ? '/clips' : url.pathname}${url.search}`));
  },
  parse,
};
