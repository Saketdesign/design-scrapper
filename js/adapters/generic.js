// Best-effort scraper for sites without a dedicated adapter. Reads static HTML only, so it
// works on simple pages and finds little on JavaScript-rendered galleries. Pages have no
// reliable dates, so every media URL not imported before counts as new.
const { fetchText, xStatusId, decodeEntities } = require('./util');

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

const META_VIDEO = new Set(['og:video', 'og:video:url', 'og:video:secure_url']);
const META_IMAGE = new Set(['og:image', 'og:image:url', 'twitter:image']);

// Each finder returns [url, type, alt?] candidates found in the HTML, in page order.
function metaMedia(html) {
  const found = [];
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const prop = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (META_VIDEO.has(prop) && VIDEO_EXT.test(content || '')) found.push([content, 'video']);
    if (META_IMAGE.has(prop)) found.push([content, 'image']);
  }
  return found;
}

function videoMedia(html) {
  const found = [];
  for (const tag of html.match(/<(video|source)\s[^>]*>/gi) || []) {
    const src = attr(tag, 'src');
    if (src && (VIDEO_EXT.test(src) || /video\//i.test(attr(tag, 'type') || ''))) found.push([src, 'video']);
  }
  return found;
}

function imageSource(tag) {
  const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  const src = (srcset && largestFromSrcset(srcset)) || attr(tag, 'data-src') || attr(tag, 'src');
  return src && (IMAGE_EXT.test(src) || srcset) ? src : null;
}

function imageMedia(html) {
  const found = [];
  for (const tag of html.match(/<img\s[^>]*>/gi) || []) {
    const width = parseInt(attr(tag, 'width') || '0', 10);
    const src = width && width < MIN_WIDTH ? null : imageSource(tag);
    if (src) found.push([src, 'image', attr(tag, 'alt')]);
  }
  return found;
}

function absolute(url, pageUrl) {
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return null;
  }
}

function parse(html, pageUrl) {
  const title = decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || new URL(pageUrl).hostname).trim();
  const found = new Map();
  for (const [url, type, alt] of [...metaMedia(html), ...videoMedia(html), ...imageMedia(html)]) {
    const u = url && !url.startsWith('data:') ? absolute(url, pageUrl) : null;
    if (u && !SKIP.test(u) && !found.has(u.split('?')[0])) found.set(u.split('?')[0], { type, url: u, alt: decodeEntities(alt).trim() });
  }
  const xId = xStatusId(pageUrl);
  return [...found.values()].slice(0, MAX_ITEMS).map((m) => ({
    id: m.url.split('?')[0],
    xStatusId: xId,
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
