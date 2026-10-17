const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const recent = require('../js/adapters/recent');
const vibrant = require('../js/adapters/vibrant');
const bdx = require('../js/adapters/bestdesignsonx');

const fixture = (name) => fs.readFileSync(`${__dirname}/fixtures/${name}`, 'utf8');
const DAY = 24 * 3600e3;

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const route = routes.find(([match]) => url.startsWith(match));
    if (!route) return new Response('not found', { status: 404 });
    const body = typeof route[1] === 'function' ? route[1](url, init) : route[1];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body));
  };
  fn.calls = calls;
  return fn;
}

test('recent.design: pages back through the API until the range is covered', async () => {
  const first = recent.parsePage(fixture('recent.html'));
  const oldest = Math.min(...first.items.map((i) => i.publishedAt));
  const older = (cursor, at) => ({ id: `old${cursor}`, slug: 's', title: 'Old', status: 'published', publishedAt: at, media: [{ mediaType: 'image', url: 'https://cdn/x.webp', mediaWidth: 10, mediaHeight: 10 }] });
  const fetch = fakeFetch([
    ['https://recent.design/', fixture('recent.html')],
    ['https://api.recent.design/rpc/items/list', (_url, init) => {
      const { cursor } = JSON.parse(init.body).json;
      return cursor === first.nextCursor
        ? { json: { items: [older(1, oldest - DAY)], nextCursor: 'c2' } }
        : { json: { items: [older(2, oldest - 10 * DAY)], nextCursor: 'c3' } };
    }],
  ]);

  const items = await recent.fetchItems('https://recent.design/?category=interface', { fetch, since: oldest - 5 * DAY });
  const apiCalls = fetch.calls.filter((c) => c.url.startsWith('https://api.'));
  assert.strictEqual(apiCalls.length, 2, 'stops once a page reaches past the range');
  assert.strictEqual(JSON.parse(apiCalls[0].init.body).json.category, 'interface');
  assert.deepStrictEqual(items.slice(-2).map((i) => i.id), ['old1', 'old2']);

  fetch.calls.length = 0;
  await recent.fetchItems('https://recent.design/?category=interface', { fetch, since: Date.now() - DAY });
  assert.strictEqual(fetch.calls.length, 1, 'a normal daily run reads only the first page');
});

test('vibrant.design: reaches older posts through the sitemap and post pages, skipping known ones', async () => {
  const sitemap = `<urlset>
    <url><loc>https://vibrant.design/feed/bc1ir7v-aquarium-404-error-page</loc><lastmod>2026-10-16T03:44:35.682Z</lastmod></url>
    <url><loc>https://vibrant.design/feed/known01-already-imported</loc><lastmod>2026-10-15T00:00:00.000Z</lastmod></url>
    <url><loc>https://vibrant.design/feed/ancient-too-old</loc><lastmod>2025-01-01T00:00:00.000Z</lastmod></url>
    <url><loc>https://vibrant.design/website/abc1234-site</loc><lastmod>2026-10-16T00:00:00.000Z</lastmod></url>
  </urlset>`;
  const listing = '<script class="$tsr">$R[0]={items:$R[1]=[$R[2]={shortId:"newest1",path:"/feed/newest1-x",name:"New",publishedAt:"2026-10-17T00:00:00Z",videos:[{url:"https://cdn/v.mp4",width:1440,height:1080}],images:[],categories:[{slug:"interface"}],tags:[]}]}</script>';
  const fetch = fakeFetch([
    ['https://vibrant.design/feed?', listing],
    ['https://vibrant.design/sitemap.xml', '<sitemapindex><sitemap><loc>https://vibrant.design/sitemaps/projects-1.xml</loc></sitemap></sitemapindex>'],
    ['https://vibrant.design/sitemaps/projects-1.xml', sitemap],
    ['https://vibrant.design/feed/bc1ir7v', fixture('vibrant-post.html')],
  ]);

  const items = await vibrant.fetchItems('https://vibrant.design/', {
    fetch,
    since: Date.parse('2026-10-01'),
    isKnown: (id) => id === 'known01',
  });
  assert.deepStrictEqual(items.map((i) => i.id), ['newest1', 'bc1ir7v']);
  assert.ok(!fetch.calls.some((c) => c.url.includes('known01') || c.url.includes('ancient') || c.url.includes('/website/')));
  assert.ok(!fetch.calls.some((c) => c.url.includes('/api/')), 'never touches the robots-disallowed API');
});

test('vibrant.design: many failed post pages flag the source instead of returning less', async () => {
  const urls = Array.from({ length: 8 }, (_, i) => `<url><loc>https://vibrant.design/feed/p${i}-x</loc><lastmod>2026-10-10T00:00:00Z</lastmod></url>`);
  const fetch = fakeFetch([
    ['https://vibrant.design/feed?', '<script class="$tsr">$R[0]={items:$R[1]=[$R[2]={shortId:"n1",name:"N",publishedAt:"2026-10-17T00:00:00Z",videos:[{url:"https://cdn/v.mp4",width:1,height:1}],images:[],categories:[],tags:[]}]}</script>'],
    ['https://vibrant.design/sitemap.xml', '<loc>https://vibrant.design/sitemaps/projects-1.xml</loc>'],
    ['https://vibrant.design/sitemaps/projects-1.xml', `<urlset>${urls.join('')}</urlset>`],
  ]);
  await assert.rejects(vibrant.fetchItems('https://vibrant.design/', { fetch, since: Date.parse('2026-10-01') }), /Couldn't load 8 of 8/);
});

test('bestdesignsonx: pages through all rows in the range', async () => {
  const row = (id) => ({ id, handle: 'a', tweet_text: 'Sidebar UI', post_url: `/a/status/${id}`, status: 'Published', published_at: '2026-10-10T00:00:00Z', tags: [], media: [{ type: 'photo', image: 'https://cdn/x.avif' }] });
  const fetch = fakeFetch([
    ['https://bestdesignsonx.com/assets/index-x.js', fixture('bestdesignsonx-bundle.txt')],
    ['https://bestdesignsonx.com/', '<script type="module" src="/assets/index-x.js"></script>'],
    ['https://tuzpqmdnxvlzwqthgseg.supabase.co/rest/v1/', (url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      return Array.from({ length: offset === 0 ? 200 : 5 }, (_, i) => row(offset + i));
    }],
  ]);
  const items = await bdx.fetchItems('https://bestdesignsonx.com/', { fetch, since: Date.parse('2026-09-18') });
  assert.strictEqual(items.length, 205);
});
