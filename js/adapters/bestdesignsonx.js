const { fetchText, xStatusId, toTime, cleanTitle } = require('./util');

const ORIGIN = 'https://bestdesignsonx.com';
const TABLE = 'bestdesignsonx';
const PAGE_ROWS = 200;
const MAX_ROWS = 20000;

// The site tags every post. These tags mark non-UI work (identity, type, art); a post is kept
// when it has at least one tag outside this list, e.g. ui-interaction, sidebar, dropdown.
const NON_UI_TAGS = new Set([
  'branding', 'logo', 'illustration', 'typography', 'motion', '3d', 'poster', 'packaging', 'editorial',
  'graphic-design', 'art-direction', 'type-design', 'photography', 'color-palette', 'print', 'lettering',
]);

// Newer posts are often untagged, so fall back to the post text: drop posts that read as
// identity/type/print work unless they also mention UI.
const NON_UI_TEXT = /\b(brand(ing|s)?|rebrand|identity|logos?|logotype|wordmark|typefaces?|fonts?|lettering|posters?|packaging|illustrations?|illustrated|editorial|magazine|album|merch)\b/i;
const UI_TEXT = /\b(ui|ux|apps?|dashboards?|components?|sidebar|footer|header|nav(bar|igation)?|menu|(micro)?interactions?|landing|websites?|web|pages?|buttons?|dropdown|modal|toggle|slider|onboarding|loading|states?|dark mode|design system|framer|templates?|hero|cards?|widgets?|inputs?|forms?|tabs?|scroll(ing)?|hover|cursor|swiftui|ios|android|mobile|saas|settings|checkout|pricing|chat|search|calendar|table|charts?|toasts?|tooltip|notifications?|prototype|figma|interface|screens?|portfolio|editor|toolbar)\b/i;

function isUi(row) {
  const tags = (row.tags || []).map((t) => String(t).toLowerCase());
  if (tags.length) return tags.some((t) => !NON_UI_TAGS.has(t));
  const text = row.tweet_text || '';
  return !NON_UI_TEXT.test(text) || UI_TEXT.test(text);
}

// The site is a client-only app reading a public Supabase table with the anon key shipped in its
// bundle. Read the key from the live bundle so a rotation doesn't break the source.
function findConfig(bundle) {
  const m = /"(https:\/\/[a-z0-9]+\.supabase\.co)"\s*,\s*"(eyJ[\w-]*\.[\w-]*\.?[\w-]*)"/.exec(bundle);
  return m ? { url: m[1], key: m[2] } : null;
}

let cachedConfig = null;

async function discoverConfig(fetch) {
  const html = await fetchText(fetch, `${ORIGIN}/`);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], ORIGIN).toString());
  for (const src of scripts.filter((s) => s.startsWith(ORIGIN))) {
    const config = findConfig(await fetchText(fetch, src));
    if (config) return config;
  }
  throw new Error('Could not find the bestdesignsonx data endpoint (site changed?)');
}

function toItem(row) {
  const postUrl = row.post_url ? `https://x.com${row.post_url}` : null;
  const media = (row.media || [])
    .map((m) => {
      if (m.video_url) return { type: 'video', url: m.video_url, width: Number(m.width) || null, height: Number(m.height) || null };
      const url = m.image || m.url;
      return url ? { type: 'image', url, width: Number(m.width) || null, height: Number(m.height) || null } : null;
    })
    .filter(Boolean);
  return {
    id: String(row.id),
    xStatusId: xStatusId(postUrl),
    title: cleanTitle(row.tweet_text) || `Design by @${row.handle}`,
    description: (row.tweet_text || '').trim(),
    creator: { name: row.author_name || '', handle: row.handle || '' },
    postUrl,
    pageUrl: row.post_url ? `${ORIGIN}${row.post_url}` : ORIGIN,
    publishedAt: toTime(row.published_at),
    tags: row.tags || [],
    media,
  };
}

function parse(rows) {
  return rows.filter((r) => (!r.status || r.status === 'Published') && isUi(r)).map(toItem).filter((it) => it.media.length);
}

async function query(fetch, config, since, offset) {
  const params = new URLSearchParams({
    select: 'id,author_name,handle,tweet_text,post_url,media,published_at,tags,status',
    status: 'eq.Published',
    order: 'published_at.desc.nullslast,id.desc',
    limit: String(PAGE_ROWS),
    offset: String(offset),
  });
  if (since) params.set('published_at', `gte.${new Date(since).toISOString()}`);
  return fetch(`${config.url}/rest/v1/${TABLE}?${params}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
  });
}

module.exports = {
  id: 'bestdesignsonx',
  label: 'bestdesignsonx.com',
  // A successful API query may have no posts in the requested date range, or only non-UI posts.
  allowsEmptyResults: true,
  matches: (url) => /(^|\.)bestdesignsonx\.com$/i.test(new URL(url).hostname),
  async fetchItems(_sourceUrl, { fetch, since }) {
    cachedConfig = cachedConfig || (await discoverConfig(fetch));
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_ROWS) {
      let res = await query(fetch, cachedConfig, since, offset);
      if (res.status === 401 || res.status === 403) {
        cachedConfig = await discoverConfig(fetch);
        res = await query(fetch, cachedConfig, since, offset);
      }
      if (!res.ok) throw new Error(`bestdesignsonx data endpoint responded ${res.status}`);
      const page = await res.json();
      if (!Array.isArray(page)) throw new Error('bestdesignsonx data endpoint returned an invalid response');
      rows.push(...page);
      // No `since` = first page only; since 0 (all time) pages through everything.
      if (page.length < PAGE_ROWS || since == null) break;
    }
    return parse(rows);
  },
  parse,
  findConfig,
  isUi,
};
