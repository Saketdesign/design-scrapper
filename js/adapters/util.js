// Largest video whose short edge is at most this, so a daily run stays a reasonable size.
const MAX_VIDEO_SHORT_EDGE = 1440;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 EagleDesignScrapper/1.0';

async function fetchText(fetch, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

function xStatusId(url) {
  const m = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i.exec(url || '');
  return m ? m[1] : null;
}

function shortEdge(r) {
  return Math.min(Number(r.width) || 0, Number(r.height) || 0);
}

// Pick the best rendition: largest within the cap, else the smallest one above it.
function pickRendition(renditions, cap = Infinity) {
  const list = renditions.filter((r) => r && r.url);
  if (!list.length) return null;
  const within = list.filter((r) => shortEdge(r) <= cap).sort((a, b) => shortEdge(b) - shortEdge(a));
  if (within.length) return within[0];
  return list.sort((a, b) => shortEdge(a) - shortEdge(b))[0];
}

function pickVideo(renditions) {
  return pickRendition(renditions, MAX_VIDEO_SHORT_EDGE);
}

function pickImage(renditions) {
  return pickRendition(renditions);
}

function toTime(value) {
  if (value == null) return null;
  const t = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// Oldest publish time on a page; -Infinity when nothing is dated, so paging stops.
function oldestOf(items) {
  const times = items.map((it) => it.publishedAt).filter(Number.isFinite);
  return times.length ? Math.min(...times) : -Infinity;
}

async function mapLimit(list, size, fn) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
  return out;
}

function cleanTitle(text, max = 80) {
  const line = String(text || '').replace(/https?:\/\/\S+/g, '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1).trim()}…` : line;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

// Client-only sites that read a public Supabase table ship its URL and anon key in their bundle,
// e.g. `createClient("https://x.supabase.co","eyJ…")` or `const a="https://x.supabase.co",b="eyJ…"`.
function findSupabaseConfig(bundle) {
  const m = /"(https:\/\/[a-z0-9]+\.supabase\.co)"[^"]{0,40}"(eyJ[\w-]*\.[\w-]*\.?[\w-]*)"/.exec(bundle);
  return m ? { url: m[1], key: m[2] } : null;
}

// Fetch a site's own scripts and return the first Supabase config found in them.
async function discoverSupabaseConfig(fetch, origin) {
  const html = await fetchText(fetch, `${origin}/`);
  // SvelteKit loads its entries with import(), then references route nodes and chunks.
  // Inspect strings only; never execute scripts fetched from a source.
  const scriptsIn = (text, base) => [...text.matchAll(/["']((?:\.?\.?\/|https:\/\/)[^"'\s]+\.js(?:\?[^"'\s]*)?)["']/g)]
    .map((m) => new URL(m[1], base).toString()).filter((url) => new URL(url).origin === new URL(origin).origin);
  const scripts = scriptsIn(html, `${origin}/`);
  const visited = new Set();
  for (let i = 0; i < scripts.length && visited.size < 40; i++) {
    const src = scripts[i];
    if (visited.has(src)) continue;
    visited.add(src);
    const bundle = await fetchText(fetch, src);
    const config = findSupabaseConfig(bundle);
    if (config) return config;
    scripts.push(...scriptsIn(bundle, src));
  }
  return null;
}

module.exports = {
  MAX_VIDEO_SHORT_EDGE, USER_AGENT, fetchText, xStatusId, pickVideo, pickImage, toTime, cleanTitle, oldestOf, mapLimit,
  decodeEntities, findSupabaseConfig, discoverSupabaseConfig,
};
