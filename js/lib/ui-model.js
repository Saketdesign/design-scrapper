// Pure view logic for the Sources window (js/ui.js): text, numbers and decisions, no DOM.
// Kept apart so it can be unit tested; ui.js only turns these results into markup.

const DAY = 864e5;
const HOUR = 3600e3;

const n = (x) => x.toLocaleString('en-US');
const plural = (x, word) => `${n(x)} ${word}${x === 1 ? '' : 's'}`;
const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');
const countText = (x) => (x ? n(x) : '');

function ago(t, now = Date.now()) {
  if (!t) return '';
  const m = Math.round((now - t) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// Due 24 h after the last good run, checked every hour.
function msToNextRun(status, now = Date.now()) {
  if (!status || !status.lastSuccessAt || status.lastError) return 0;
  return Math.max(0, status.lastSuccessAt + 24 * HOUR - now);
}

function inWords(ms) {
  if (ms <= 0) return 'on the next check';
  const h = Math.round(ms / HOUR);
  return h >= 1 ? `in ${h} h` : 'within the hour';
}

const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function whenOf(t, now = new Date()) {
  const d = new Date(t);
  const diff = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / DAY);
  const names = { 0: 'Today', 1: 'Yesterday' };
  const day = names[diff] || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${timeOf(t)}`;
}

// What part of a site a source reads, when the URL narrows it: ?category=interface, /snippets, /tagged/mobile.
function scopeOf(url) {
  const u = new URL(url);
  const category = u.searchParams.get('category');
  if (category) return category;
  const last = u.pathname.split('/').filter(Boolean).pop();
  return last && !/\.\w+$/.test(last) ? last.replace(/[-_]/g, ' ') : '';
}

// ---- Header and alerts ----

function headerState(running, anyEnabled) {
  const blocked = running || !anyEnabled;
  return { busy: running, blocked, title: !anyEnabled && !running ? 'Turn on a source to run' : '' };
}

function failedSources(sources, status, st) {
  const queued = (s) => st.running && st.queue.includes(s.id);
  return sources.filter((s) => Boolean(status[s.id] && status[s.id].lastError) && !queued(s));
}

function alertView(failed, status, labelFor) {
  if (failed.length === 1) {
    return { title: `${labelFor(failed[0])} failed`, description: status[failed[0].id].lastError, action: 'Try again', ids: failed.map((s) => s.id) };
  }
  return {
    title: `${failed.length} sources failed`,
    description: `${failed.map(labelFor).join(', ')}. Open Sources for each reason.`,
    action: 'Try all again',
    ids: failed.map((s) => s.id),
  };
}

// ---- Status strip ----

function stripView(sources, status, activity, now = Date.now()) {
  const on = sources.filter((s) => s.enabled);
  const lastOf = (s) => (status[s.id] && status[s.id].lastSuccessAt) || 0;
  const last = Math.max(0, ...sources.map(lastOf));
  const next = on.length ? Math.min(...on.map((s) => msToNextRun(status[s.id], now))) : null;
  const week = activity.filter((a) => a.at >= now - 7 * DAY).length;
  const capped = week === activity.length && week >= 50;
  return {
    last: last ? ago(last, now) : 'Never',
    next: next === null ? 'All sources paused' : inWords(next).replace(/^\w/, (c) => c.toUpperCase()),
    week: `${n(week)}${capped ? '+' : ''}`,
    unit: week === 1 ? 'design' : 'designs',
  };
}

// ---- The run in progress ----

function finishedStep(r) {
  if (r.error) return { status: 'fail', value: 'Failed' };
  const x = r.posts || 0;
  if (r.stopped) return { status: 'ok', value: `Stopped, ${x} new` };
  return { status: 'ok', value: x ? `${x} new` : 'Up to date' };
}

function activeStep(st) {
  const p = st.progress;
  const counting = st.phase === 'importing' && p && p.total;
  return { status: 'running', value: counting ? `${p.done} of ${p.total}` : 'Checking' };
}

function waitingStep(planned) {
  if (planned === 0) return { status: 'ok', value: 'Nothing new' };
  return { status: 'queued', value: planned ? `${planned} to import` : 'Queued' };
}

function stepFor(st, label, id) {
  const r = st.results[id];
  const part = r ? finishedStep(r) : st.current === id ? activeStep(st) : waitingStep(st.planned[id]);
  return { label, ...part };
}

function importedFor(st, id) {
  if (st.results[id]) return st.results[id].done || 0;
  const importing = st.current === id && st.phase === 'importing' && st.progress;
  return importing ? st.progress.done : 0;
}

const plannedCount = (st) => st.queue.reduce((x, id) => x + (st.planned[id] || 0), 0);
const doneCount = (st) => st.queue.reduce((x, id) => x + importedFor(st, id), 0);
const checkedCount = (st) => st.queue.filter((id) => st.planned[id] !== undefined || st.results[id]).length;

// Title, sentence and the counter the progress bar shows. `where` is the label of the source being read.
function runView(st, where) {
  if (st.stopRequested) return { title: 'Stopping', sentence: 'Finishing the current design. Everything imported so far is kept.' };
  if (st.phase === 'confirming') return { title: 'Waiting for you', sentence: `Found ${plural(plannedCount(st), 'new design')}. Confirm to start importing.` };
  if (st.phase === 'importing') {
    return { title: 'Importing', sentence: where ? `Importing from ${where}.` : 'Importing.', label: 'Designs', now: doneCount(st), total: plannedCount(st) };
  }
  return {
    title: 'Checking sources',
    sentence: where ? `Looking for new designs on ${where}.` : 'Looking for new designs.',
    label: 'Sources checked',
    now: checkedCount(st),
    total: st.queue.length,
  };
}

function progressOf({ now, total }) {
  const determinate = total > 0;
  return { determinate, pct: determinate ? Math.round((now / total) * 100) : 0, value: determinate ? `${n(now)} of ${n(total)}` : '' };
}

function stepsSummary(st, steps) {
  if (st.phase === 'importing') return `${steps.filter((s) => s.status === 'ok' || s.status === 'fail').length} of ${steps.length} done`;
  return `${checkedCount(st)} of ${steps.length} checked`;
}

// ---- Imports ----

function importsView(activity, feedSource, showAll, limit) {
  const sources = [...new Map(activity.map((a) => [a.sourceId, a.label])).entries()];
  const feed = sources.some(([id]) => id === feedSource) ? feedSource : '';
  const list = activity.filter((a) => !feed || a.sourceId === feed);
  return { sources, feed, list, shown: showAll ? list : list.slice(0, limit) };
}

// ---- Sources ----

const currentApp = (daily) => (daily && daily.current) || null;

function checkingSentence(app) {
  if (app && app.catalog && !app.inventoryComplete) return `Checking ${app.catalog.length} screens from ${app.name} for animations.`;
  return 'Looking for new designs.';
}

function importingSentence(p, app) {
  return `Importing ${p.done} of ${plural(p.total, 'design')}${app && app.name ? ` from ${app.name}` : ''}.`;
}

function runningSource(st, daily) {
  const app = currentApp(daily);
  const p = st.progress;
  const importing = st.phase === 'importing' && p && p.total;
  return { status: { kind: 'running', word: st.stopRequested ? 'Stopping' : 'Running' }, sentence: importing ? importingSentence(p, app) : checkingSentence(app) };
}

function lastRunSentence(status, now) {
  if (!status || !status.lastSuccessAt) return 'Not run yet.';
  const files = status.lastImported ? plural(status.lastImported, 'new file') : 'no new files';
  return `Last run ${ago(status.lastSuccessAt, now)}, ${files}.`;
}

function appSummary(daily) {
  const app = currentApp(daily);
  if (!app || !app.name) return '';
  const done = app.completedAt && daily.completedApps[app.key];
  const detail = done && done.exportVersion === 3 ? `, ${done.screens} screens and ${done.animations} animations` : '';
  return `App: ${app.name}${detail}. `;
}

// status is {kind, word} for the status tag, or null when the row shows none.
function sourceView({ st, source, status, daily, now = Date.now() }) {
  if (st.running && st.queue.includes(source.id) && !st.results[source.id]) {
    if (st.current === source.id) return runningSource(st, daily);
    return { status: { kind: 'queued', word: 'Queued' }, sentence: 'Waiting for its turn in this run.' };
  }
  if (status && status.lastError) return { status: { kind: 'fail', word: 'Failed' }, sentence: status.lastError };
  const last = lastRunSentence(status, now);
  if (!source.enabled) return { status: { kind: 'paused', word: 'Paused' }, sentence: last };
  return { status: null, sentence: `${appSummary(daily)}${last} Next run ${inWords(msToNextRun(status, now))}.` };
}

// The https:// link for what the user typed in the add field. Throws TypeError when it is not a site.
function normalizeSourceUrl(raw) {
  const value = raw.trim();
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  // URL() takes "https://not a link"; a site needs a dotted host and no spaces.
  if (!value || /\s/.test(value) || !new URL(url).hostname.includes('.')) throw new TypeError('not a link');
  return url;
}

const addErrorText = (err) => (err instanceof TypeError ? 'Enter a website link, such as https://recent.design.' : `${err.message}.`);

// ---- Toasts after a manual run ----

function importedToast(results, posts, stopped, latest) {
  return {
    kind: 'success',
    title: `${plural(posts, 'design')} imported`,
    text: `From ${results.filter((r) => r.posts).map((r) => r.label).join(', ')}. ${stopped ? 'Stopped early; run again to continue.' : 'They are in Uncategorized.'}`,
    action: latest ? 'Show' : null,
    open: latest ? latest.itemId : null,
  };
}

function idleToast(stopped) {
  return { title: stopped ? 'Stopped' : 'No new designs', text: stopped ? 'Run again to continue where it left off.' : 'Every source is up to date.' };
}

function runToasts(results, latest) {
  const posts = results.reduce((x, r) => x + (r.posts || 0), 0);
  const failed = results.filter((r) => r.error);
  const stopped = results.some((r) => r.stopped);
  const list = [];
  if (posts) list.push(importedToast(results, posts, stopped, latest));
  else if (!failed.length) list.push(idleToast(stopped));
  for (const r of failed) list.push({ kind: 'fail', title: `${r.label} failed`, text: r.error, action: 'Try again', retry: r.sourceId, duration: 0 });
  return list;
}

// ---- Keyboard and menu geometry ----

// Index to move to for a list key (next/prev wrap around, Home and End jump), or null for any other key.
function navIndex(key, at, len, keys = { next: 'ArrowDown', prev: 'ArrowUp' }) {
  if (key === keys.next) return (at + 1) % len;
  if (key === keys.prev) return (at - 1 + len) % len;
  if (key === 'Home') return 0;
  return key === 'End' ? len - 1 : null;
}

// Tab inside a dialog that wraps around: the index to focus after Tab or Shift+Tab from `at`.
function tabStop(at, len, shift) {
  if (shift) return at <= 0 ? len - 1 : at - 1;
  return (at + 1) % len;
}

// Index to focus when Tab leaves either end of a dialog, or null when the browser can move focus itself.
function edgeWrap(shift, at, len) {
  if (shift && at === 0) return len - 1;
  return !shift && at === len - 1 ? 0 : null;
}

// Where a menu goes: under the trigger and aligned to its end, or above it when there is no room below.
function menuPlacement(rect, size, win, gap = 4, pad = 8) {
  const below = rect.bottom + gap + size.height <= win.height - pad;
  const top = below ? rect.bottom + gap : Math.max(pad, rect.top - gap - size.height);
  const left = Math.max(pad, Math.min(rect.right - size.width, win.width - size.width - pad));
  return { side: below ? 'bottom' : 'top', top, left };
}

module.exports = {
  n, plural, hostOf, countText, ago, msToNextRun, inWords, whenOf, scopeOf,
  headerState, failedSources, alertView, stripView,
  stepFor, runView, progressOf, stepsSummary, importsView,
  sourceView, normalizeSourceUrl, addErrorText, runToasts,
  navIndex, tabStop, edgeWrap, menuPlacement,
};
