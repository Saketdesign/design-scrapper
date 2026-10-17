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

function cleanTitle(text, max = 80) {
  const line = String(text || '').replace(/https?:\/\/\S+/g, '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1).trim()}…` : line;
}

module.exports = { MAX_VIDEO_SHORT_EDGE, USER_AGENT, fetchText, xStatusId, pickVideo, pickImage, toTime, cleanTitle };
