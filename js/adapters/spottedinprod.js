const { fetchText, toTime } = require('./util');
const { flightData, jsonAt } = require('../lib/next-flight');

const ORIGIN = 'https://www.spottedinprod.com';

const ready = (v) => v.status == null || v.status === 'ready';
const onCdn = (v) => /^https:\/\/cdn\.spottedinprod\.com\//.test(v.url || '');
const toMedia = (v) => ({
  type: v.type === 'video' ? 'video' : 'image',
  url: v.transcodedUrl || v.url,
  width: v.width || null,
  height: v.height || null,
});

function editorialMedia(clip) {
  if (!clip.videoName || !/^[\w.-]+\.mp4$/.test(clip.videoName)) return [];
  return [{ type: 'video', url: `https://cdn.spottedinprod.com/clips/${clip.videoName}` }];
}

function mediaOf(clip, community) {
  const raw = community ? clip.media || [] : editorialMedia(clip);
  return raw.filter(ready).map(toMedia).filter(onCdn);
}

const titleOf = (clip) => clip.title || [clip.appName, clip.displayName].filter(Boolean).join(' — ') || `Clip ${clip.id}`;
const tagsOf = (clip) => (clip.tags || []).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);

function itemOf(clip, id, media) {
  const owner = clip.owner || clip.app || { name: clip.appName };
  return {
    id, xStatusId: null, title: titleOf(clip),
    description: clip.description || '',
    creator: { name: owner.displayName || owner.name || '', handle: owner.username || '' },
    postUrl: null, pageUrl: `${ORIGIN}/clips/${id}`, publishedAt: toTime(clip.publishedAt || clip.createdAt),
    tags: tagsOf(clip), media,
  };
}

function parse(html) {
  const data = flightData(html);
  const items = new Map();
  for (const m of data.matchAll(/"sourceType":"(community|editorial)","(?:clip|post)":/g)) {
    const clip = jsonAt(data, m.index + m[0].length);
    if (!clip || clip.id == null || clip.isLocked) continue;
    const community = m[1] === 'community';
    const id = `${community ? 'community-' : ''}${clip.id}`;
    const media = mediaOf(clip, community);
    if (media.length) items.set(id, itemOf(clip, id, media));
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
