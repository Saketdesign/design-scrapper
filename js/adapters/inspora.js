const { USER_AGENT, pickVideo, pickImage, toTime } = require('./util');

const ORIGIN = 'https://www.inspora.design';
// The site's categories are Web, Branding, Product, Motion, Illustration, 3D and Print; these two
// are the UI work. Posts carry no category of their own, so each category page is read separately.
const UI_CATEGORIES = ['Web', 'Product'];

// Category pages to read: the source's own category if it has one, else the UI categories.
function listingUrls(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.searchParams.get('category')) return [`${ORIGIN}/?${url.searchParams}`];
  return UI_CATEGORIES.map((category) => {
    const params = new URLSearchParams(url.searchParams);
    params.set('category', category);
    return `${ORIGIN}/?${params}`;
  });
}

// Next.js streams page data as `self.__next_f.push([1,"…"])` string chunks; join them back up.
function flightData(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return '';
      }
    })
    .join('');
}

// The JSON value that starts at `start` (an object or array), or null.
function jsonAt(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function toMedia(m) {
  if (!m || !m.url) return null;
  const own = { url: m.url, width: m.width, height: m.height };
  // videoPreview is the same clip at a lower resolution, used when the original is very large.
  const pick = m.type === 'video' ? pickVideo([own, m.videoPreview].filter(Boolean)) : pickImage([own, ...(m.variants || [])]);
  return pick && { type: m.type === 'video' ? 'video' : 'image', url: pick.url, width: pick.width || null, height: pick.height || null };
}

function toItem(it) {
  const creator = it.creator || {};
  return {
    id: String(it.id),
    xStatusId: null,
    title: it.title || it.slug,
    description: '',
    creator: { name: creator.name || '', handle: '' },
    postUrl: null,
    pageUrl: `${ORIGIN}/posts/${it.slug}`,
    publishedAt: toTime(it.createdAt),
    tags: [],
    media: (it.media || []).map(toMedia).filter(Boolean),
  };
}

// Posts in the page's `initialPage` (the newest 16 of the listing).
function parse(html) {
  const data = flightData(html);
  const items = [];
  for (const m of data.matchAll(/"initialPage":/g)) {
    const page = jsonAt(data, m.index + m[0].length);
    if (page && Array.isArray(page.items)) items.push(...page.items.filter((it) => it && it.id && it.slug));
  }
  return items.map(toItem).filter((it) => it.media.length);
}

// The site sits behind Vercel's bot protection, which answers with a challenge page (429) when it
// thinks it's being crawled, so read only the listing pages and say so plainly when blocked.
async function fetchListing(fetch, url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const html = await res.text();
  if (res.status === 429 || /Vercel Security Checkpoint/i.test(html)) {
    throw new Error('inspora.design is showing a browser check to automated requests. Try again later.');
  }
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return html;
}

module.exports = {
  id: 'inspora',
  label: 'inspora.design',
  matches: (url) => /^(www\.)?inspora\.design$/i.test(new URL(url).hostname),
  // Older posts load from /api/, which robots.txt disallows, so every run reads only the newest
  // posts in each category (about four weeks' worth).
  async fetchItems(sourceUrl, { fetch }) {
    const items = [];
    for (const url of listingUrls(sourceUrl)) items.push(...parse(await fetchListing(fetch, url)));
    return items;
  },
  parse,
  listingUrls,
};
