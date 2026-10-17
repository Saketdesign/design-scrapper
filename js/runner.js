const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { adapterFor } = require('./adapters');
const { USER_AGENT } = require('./adapters/util');
const { RUN_EVERY_MS, CHECK_EVERY_MS, FIRST_RUN_LOOKBACK_MS, LOOKBACK_SLACK_MS, MAX_LOOKBACK_MS } = require('./defaults');

const DOWNLOAD_CONCURRENCY = 2;
const EXT_BY_TYPE = {
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};
const KNOWN_EXT = new Set(Object.values(EXT_BY_TYPE).concat('jpeg'));

// A source is due once a day; after a failure it retries on the next hourly check.
function isDue(status = {}, now = Date.now()) {
  if (status.lastAttemptAt && now - status.lastAttemptAt < CHECK_EVERY_MS - 60e3) return false;
  return !status.lastSuccessAt || now - status.lastSuccessAt >= RUN_EVERY_MS - 5 * 60e3;
}

function sinceFor(status = {}, now = Date.now()) {
  const since = status.lastSuccessAt ? status.lastSuccessAt - LOOKBACK_SLACK_MS : now - FIRST_RUN_LOOKBACK_MS;
  return Math.max(since, now - MAX_LOOKBACK_MS);
}

function keysFor(adapterId, item) {
  return [`${adapterId}:${item.id}`, item.xStatusId && `x:${item.xStatusId}`].filter(Boolean);
}

function annotationFor(item, sourceLabel) {
  const by = item.creator.name || item.creator.handle ? `By ${item.creator.name}${item.creator.handle ? ` (@${item.creator.handle})` : ''}` : '';
  return [item.description, by, item.postUrl && `Post: ${item.postUrl}`, `Found on ${sourceLabel}: ${item.pageUrl}`]
    .filter(Boolean)
    .join('\n');
}

function tagsFor(item, sourceLabel) {
  const tags = [sourceLabel, item.creator.handle && `@${item.creator.handle}`, ...item.tags];
  return [...new Set(tags.filter(Boolean).map((t) => String(t).trim()))];
}

function extFor(url, contentType) {
  const fromType = EXT_BY_TYPE[(contentType || '').split(';')[0].trim().toLowerCase()];
  if (fromType) return fromType;
  const m = /\.([a-z0-9]{3,4})$/i.exec(new URL(url).pathname);
  return m && KNOWN_EXT.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}

async function download(fetch, url, tmpDir) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`);
  const ext = extFor(url, res.headers.get('content-type'));
  if (!ext) throw new Error(`Unsupported media type ${res.headers.get('content-type')} ${url}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `${crypto.randomBytes(6).toString('hex')}.${ext}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function pool(tasks, size) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]().then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
  return results;
}

// Fetch one source, import its new posts, and record the outcome in the library's state.
async function runSource(source, ctx) {
  const { store, libraryPath, eagleItem, fetch, tmpDir, now = Date.now(), log = () => {} } = ctx;
  const lib = store.library(libraryPath);
  const adapter = adapterFor(source.url);
  const label = adapter.id === 'generic' ? new URL(source.url).hostname.replace(/^www\./, '') : adapter.label;
  const status = (lib.status[source.id] = { ...lib.status[source.id], lastAttemptAt: now });
  const result = { sourceId: source.id, label, imported: 0, posts: 0, failed: 0, error: null };

  try {
    const since = sinceFor(status, now);
    const items = await adapter.fetchItems(source.url, { fetch, since });
    if (!items.length && adapter.id !== 'generic') {
      throw new Error('The site returned no designs. Its layout may have changed.');
    }
    const fresh = items.filter((it) => !it.publishedAt || it.publishedAt >= since);
    const unseen = fresh.filter((it) => !keysFor(adapter.id, it).some((k) => lib.seen[k]));

    for (const item of unseen) {
      const website = item.postUrl || item.pageUrl;
      if (item.postUrl && (await eagleItem.count({ url: website })) > 0) {
        for (const k of keysFor(adapter.id, item)) lib.seen[k] = now;
        continue;
      }
      const total = item.media.length;
      const outcomes = await pool(
        item.media.map((m, i) => async () => {
          const file = await download(fetch, m.url, tmpDir);
          try {
            return await eagleItem.addFromPath(file, {
              name: total > 1 ? `${item.title} (${i + 1}/${total})` : item.title,
              website,
              tags: tagsFor(item, label),
              folders: [],
              annotation: annotationFor(item, label),
            });
          } finally {
            fs.rmSync(file, { force: true });
          }
        }),
        DOWNLOAD_CONCURRENCY,
      );
      const ids = outcomes.filter((o) => o.ok).map((o) => o.value);
      outcomes.filter((o) => !o.ok).forEach((o) => log(`${label}: ${o.error.message}`));
      result.failed += outcomes.length - ids.length;
      if (!ids.length) continue;
      for (const k of keysFor(adapter.id, item)) lib.seen[k] = now;
      result.imported += ids.length;
      result.posts += 1;
      store.addActivity(lib, { at: now, sourceId: source.id, label, title: item.title, itemId: ids[0], count: ids.length });
    }
    Object.assign(status, { lastSuccessAt: now, lastImported: result.imported, lastError: null });
  } catch (err) {
    result.error = err.message;
    status.lastError = err.message;
    log(`${label}: ${err.message}`);
  }
  store.pruneSeen(lib, now);
  store.save();
  return result;
}

module.exports = { runSource, isDue, sinceFor, extFor, tagsFor, annotationFor };
