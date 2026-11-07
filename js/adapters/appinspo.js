const { toTime, discoverSupabaseConfig, pagedRows } = require('./util');

const ORIGIN = 'https://appinspo.com';
const TABLE = 'mockups';
const PAGE_ROWS = 200;
const MAX_ROWS = 20000;
// The site's categories; icons and illustrations aren't interface work.
const UI_CATEGORIES = ['desktop', 'mobile', 'watch', 'vision'];
const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;

// A /tagged/<category> link keeps that category; anything else gets the UI categories.
function categoriesFor(sourceUrl) {
  const m = /^\/tagged\/([a-z0-9-]+)/i.exec(new URL(sourceUrl).pathname);
  return m ? [decodeURIComponent(m[1]).toLowerCase()] : UI_CATEGORIES;
}

function handleOf(link) {
  const m = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i.exec(link || '');
  return m ? m[1] : '';
}

function mediaOf(row) {
  // Video posts also put the video in image_url.
  const videoUrl = row.video_url || (VIDEO_EXT.test(row.image_url || '') ? row.image_url : null);
  const url = videoUrl || row.image_url;
  return url ? [{ type: videoUrl ? 'video' : 'image', url }] : [];
}

const titleOf = (row) => row.title || row.alt || `Design by ${row.author || 'unknown'}`;
const pageUrlOf = (row) => (row.category ? `${ORIGIN}/tagged/${row.category}` : ORIGIN);

function toItem(row) {
  return {
    id: String(row.id),
    xStatusId: null,
    title: titleOf(row),
    description: row.alt && row.alt !== row.title ? row.alt : '',
    creator: { name: row.author || '', handle: handleOf(row.author_link) },
    postUrl: null,
    pageUrl: pageUrlOf(row),
    publishedAt: toTime(row.created_at),
    tags: [row.category].filter(Boolean),
    media: mediaOf(row),
  };
}

function parse(rows, categories = UI_CATEGORIES) {
  return rows.filter((r) => categories.includes(r.category)).map(toItem).filter((it) => it.media.length);
}

let cachedConfig = null;

async function discoverConfig(fetch) {
  const config = await discoverSupabaseConfig(fetch, ORIGIN);
  if (!config) throw new Error('Could not find the appinspo data endpoint (site changed?)');
  return config;
}

async function query(fetch, config, categories, since, offset) {
  const params = new URLSearchParams({
    select: 'id,image_url,video_url,alt,title,author,author_link,category,created_at',
    category: `in.(${categories.join(',')})`,
    order: 'created_at.desc,id.desc',
    limit: String(PAGE_ROWS),
    offset: String(offset),
  });
  if (since) params.set('created_at', `gte.${new Date(since).toISOString()}`);
  return fetch(`${config.url}/rest/v1/${TABLE}?${params}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
  });
}

module.exports = {
  id: 'appinspo',
  label: 'appinspo.com',
  // A successful query may have no posts in the requested date range.
  allowsEmptyResults: true,
  matches: (url) => /^(www\.)?appinspo\.com$/i.test(new URL(url).hostname),
  // A client-only app reading a public Supabase table with the anon key shipped in its bundle,
  // like bestdesignsonx.
  async fetchItems(sourceUrl, { fetch, since }) {
    const categories = categoriesFor(sourceUrl);
    cachedConfig = cachedConfig || (await discoverConfig(fetch));
    const rows = await pagedRows({
      name: 'appinspo', since, pageRows: PAGE_ROWS, maxRows: MAX_ROWS,
      send: (offset) => query(fetch, cachedConfig, categories, since, offset),
      refresh: async () => { cachedConfig = await discoverConfig(fetch); },
    });
    return parse(rows, categories);
  },
  parse,
  categoriesFor,
};
