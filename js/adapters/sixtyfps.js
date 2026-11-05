const { fetchText, toTime, decodeEntities } = require('./util');

const ORIGIN = 'https://60fps.design';
// Listing pages show dates nowhere, but each shot's page has a JSON-LD VideoObject with its
// upload date. Shots are listed newest first, so stop reading shot pages after this many in a
// row fall before the range (a few share a date or sit slightly out of order).
const STOP_AFTER_OLD = 3;

// Framer renders each card as: app link, <video><source src=…mp4>, then
// <a href="./shots/<slug>"><p>Title</p></a> (snippets: the same without the app link). The
// homepage repeats every card for each breakpoint, and also carries ads (videos that link offsite)
// and nav links like ./shots/watch, so a video only counts when a shot/snippet link comes next.
function parse(html, pageUrl = `${ORIGIN}/`) {
  const items = new Map();
  let video = null;
  let app = '';
  const tokens = /<source\s[^>]*src="([^"]+\.mp4)"|<video\s[^>]*\ssrc="([^"]+\.mp4)"|<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(tokens)) {
    if (m[1] || m[2]) {
      video = decodeEntities(m[1] || m[2]);
      continue;
    }
    const href = new URL(decodeEntities(m[3]), pageUrl);
    const text = [...m[4].matchAll(/<p[^>]*>([^<]+)<\/p>/g)].map((p) => decodeEntities(p[1]).trim()).filter(Boolean);
    const route = href.origin === ORIGIN && /^\/(shots|snippets|apps)\/([a-z0-9-]+)\/?$/.exec(href.pathname);
    if (route && route[1] === 'apps') {
      app = text[0] || app;
    } else if (route && video && text.length) {
      const id = `${route[1]}/${route[2]}`;
      if (!items.has(id)) items.set(id, toItem({ id, kind: route[1], title: text[0], app, video }));
      app = '';
    }
    video = null;
  }
  return [...items.values()];
}

function toItem({ id, kind, title, app, video, description = '', publishedAt = null }) {
  return {
    id,
    kind,
    xStatusId: null,
    title,
    description,
    creator: { name: '', handle: '' },
    postUrl: null,
    pageUrl: `${ORIGIN}/${id}`,
    publishedAt,
    tags: [app, kind === 'snippets' ? 'SwiftUI snippet' : ''].filter(Boolean),
    media: [{ type: 'video', url: video }],
  };
}

// A shot page's VideoObject: name, description, contentUrl and uploadDate.
function parseDetail(html) {
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const video = [].concat(data).find((d) => d && d['@type'] === 'VideoObject' && d.contentUrl);
    if (video) {
      return { title: video.name || '', description: video.description || '', video: video.contentUrl, publishedAt: toTime(video.uploadDate) };
    }
  }
  return null;
}

module.exports = {
  id: '60fps',
  label: '60fps.design',
  labelFor: (url) => {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    return path ? `60fps.design${path}` : '60fps.design';
  },
  matches: (url) => /^(www\.)?60fps\.design$/i.test(new URL(url).hostname),
  async fetchItems(sourceUrl, { fetch, since, isKnown = () => false }) {
    const listed = parse(await fetchText(fetch, sourceUrl), sourceUrl);
    const out = [];
    let old = 0;
    for (const item of listed) {
      // Snippet pages carry no date, and known shots are skipped by the runner anyway.
      if (item.kind !== 'shots' || isKnown(item.id)) {
        out.push(item);
        continue;
      }
      const detail = await fetchText(fetch, item.pageUrl).then(parseDetail, () => null);
      // Without its page the shot still imports, dated by nothing; the listing has the video.
      const full = detail ? { ...item, title: detail.title || item.title, description: detail.description, publishedAt: detail.publishedAt, media: [{ type: 'video', url: detail.video }] } : item;
      out.push(full);
      if (since && full.publishedAt && full.publishedAt < since) {
        if (++old >= STOP_AFTER_OLD) break;
      } else {
        old = 0;
      }
    }
    return out;
  },
  parse,
  parseDetail,
};
