// Best-effort scraper for sites without a dedicated adapter. Reads static HTML only, so it
// works on simple pages and finds little on JavaScript-rendered galleries. Pages have no
// reliable dates, so every media URL not imported before counts as new.
const { fetchText, xStatusId } = require('./util');

const MAX_ITEMS = 30;
const MIN_WIDTH = 400;
const SKIP = /(avatar|favicon|logo|icon|sprite|emoji|badge|pixel|tracking|placeholder|blank)/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;

function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;/g, '&') : null;
}

function largestFromSrcset(srcset) {
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({ url, w: parseFloat(size) || 0 }))
    .sort((a, b) => b.w - a.w)[0]?.url;
}

function parse(html, pageUrl) {
  const abs = (u) => {
    try {
      return new URL(u, pageUrl).toString();
    } catch {
      return null;
    }
  };
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || new URL(pageUrl).hostname).trim();
  const found = new Map();
  const add = (url, type, alt) => {
    const u = url && !url.startsWith('data:') ? abs(url) : null;
    if (!u || SKIP.test(u) || found.has(u.split('?')[0])) return;
    found.set(u.split('?')[0], { type, url: u, alt: (alt || '').trim() });
  };

  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const prop = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (['og:video', 'og:video:url', 'og:video:secure_url'].includes(prop) && VIDEO_EXT.test(content || '')) add(content, 'video');
    if (['og:image', 'og:image:url', 'twitter:image'].includes(prop)) add(content, 'image');
  }
  for (const tag of html.match(/<(video|source)\s[^>]*>/gi) || []) {
    const src = attr(tag, 'src');
    if (src && (VIDEO_EXT.test(src) || /video\//i.test(attr(tag, 'type') || ''))) add(src, 'video');
  }
  for (const tag of html.match(/<img\s[^>]*>/gi) || []) {
    const width = parseInt(attr(tag, 'width') || '0', 10);
    if (width && width < MIN_WIDTH) continue;
    const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
    const src = (srcset && largestFromSrcset(srcset)) || attr(tag, 'data-src') || attr(tag, 'src');
    if (src && (IMAGE_EXT.test(src) || srcset)) add(src, 'image', attr(tag, 'alt'));
  }

  return [...found.values()].slice(0, MAX_ITEMS).map((m) => ({
    id: m.url.split('?')[0],
    xStatusId: xStatusId(pageUrl),
    title: m.alt || title,
    description: '',
    creator: { name: '', handle: '' },
    postUrl: null,
    pageUrl,
    publishedAt: null,
    tags: [],
    media: [{ type: m.type, url: m.url }],
  }));
}

module.exports = {
  id: 'generic',
  label: 'Generic (best effort)',
  matches: () => true,
  async fetchItems(sourceUrl, { fetch }) {
    return parse(await fetchText(fetch, sourceUrl), sourceUrl);
  },
  parse,
};
