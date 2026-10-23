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

// `days` is a manual "last X days" run ('all' = no limit, returned as 0); otherwise pick up
// from the last successful run.
function sinceFor(status = {}, now = Date.now(), days = null) {
  if (days === 'all') return 0;
  if (days) return now - days * 24 * 3600e3;
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

function labelFor(source, adapter) {
  return adapter.id === 'generic' ? new URL(source.url).hostname.replace(/^www\./, '') : adapter.label;
}

// Step 1: fetch a source and work out which posts are new. Throws if the source fails.
async function planSource(source, ctx) {
  const { store, libraryPath, fetch, now = Date.now(), days = null } = ctx;
  const lib = store.library(libraryPath);
  const adapter = adapterFor(source.url);
  const status = lib.status[source.id] || {};
  const since = sinceFor(status, now, days);
  const isKnown = (id) => Boolean(lib.seen[`${adapter.id}:${id}`]);
  const items = await adapter.fetchItems(source.url, { fetch, since, isKnown });
  if (!items.length && adapter.id !== 'generic' && !adapter.allowsEmptyResults) {
    throw new Error('The site returned no designs. Its layout may have changed.');
  }
  const unique = [...new Map(items.map((it) => [it.id, it])).values()];
  const fresh = unique.filter((it) => !it.publishedAt || it.publishedAt >= since);
  // Oldest first, so the newest designs end up on top when Eagle sorts by date added.
  const unseen = fresh
    .filter((it) => !keysFor(adapter.id, it).some((k) => lib.seen[k]))
    .sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0));
  const media = unseen.flatMap((it) => it.media);
  const videos = media.filter((m) => m.type === 'video').length;
  return { source, adapter, label: labelFor(source, adapter), items: unseen, files: media.length, videos, images: media.length - videos };
}

function recordFailure(source, err, ctx) {
  const { store, libraryPath, now = Date.now(), log = () => {} } = ctx;
  const lib = store.library(libraryPath);
  lib.status[source.id] = { ...lib.status[source.id], lastAttemptAt: now, lastError: err.message };
  log(`${labelFor(source, adapterFor(source.url))}: ${err.message}`);
  store.save();
}

// Step 2: download and import the planned posts, then record the outcome.
async function importPlan(plan, ctx) {
  const { store, libraryPath, eagleItem, fetch, tmpDir, now = Date.now(), log = () => {}, shouldStop = () => false, onProgress = () => {} } = ctx;
  const { source, adapter, label } = plan;
  const lib = store.library(libraryPath);
  const status = (lib.status[source.id] = { ...lib.status[source.id], lastAttemptAt: now });
  const result = { sourceId: source.id, label, imported: 0, posts: 0, failed: 0, total: plan.items.length, done: 0, stopped: false, error: null };
  onProgress(result);

  try {
    for (const item of plan.items) {
      if (shouldStop()) {
        result.stopped = true;
        break;
      }
      result.done += 1;
      onProgress(result);
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
      store.addActivity(lib, { at: Date.now(), sourceId: source.id, label, title: item.title, itemId: ids[0], count: ids.length });
      // Save as we go so a long backfill that gets interrupted doesn't re-import.
      if (result.posts % 10 === 0) store.save();
    }
    Object.assign(status, result.stopped ? { lastImported: result.imported, lastError: null } : { lastSuccessAt: now, lastImported: result.imported, lastError: null });
  } catch (err) {
    result.error = err.message;
    status.lastError = err.message;
    log(`${label}: ${err.message}`);
  }
  store.pruneSeen(lib, now);
  store.save();
  return result;
}

// Fetch one source, import its new posts, and record the outcome in the library's state.
async function runSource(source, ctx) {
  let plan;
  try {
    plan = await planSource(source, ctx);
  } catch (err) {
    recordFailure(source, err, ctx);
    return { sourceId: source.id, label: labelFor(source, adapterFor(source.url)), imported: 0, posts: 0, failed: 0, error: err.message };
  }
  return importPlan(plan, ctx);
}

module.exports = { runSource, planSource, importPlan, recordFailure, labelFor, isDue, sinceFor, extFor, tagsFor, annotationFor };
