const test = require('node:test');
const assert = require('node:assert');
const m = require('../js/lib/ui-model');

const NOW = Date.parse('2026-10-18T12:00:00Z');
const MIN = 60e3;
const HOUR = 3600e3;

test('formats counts and hosts', () => {
  assert.strictEqual(m.n(12345), '12,345');
  assert.strictEqual(m.plural(1, 'design'), '1 design');
  assert.strictEqual(m.plural(2, 'design'), '2 designs');
  assert.strictEqual(m.hostOf('https://www.recent.design/x'), 'recent.design');
  assert.strictEqual(m.countText(0), '');
  assert.strictEqual(m.countText(1500), '1,500');
});

test('ago words', () => {
  assert.strictEqual(m.ago(0, NOW), '');
  assert.strictEqual(m.ago(NOW - 10e3, NOW), 'just now');
  assert.strictEqual(m.ago(NOW - 5 * MIN, NOW), '5 min ago');
  assert.strictEqual(m.ago(NOW - 5 * HOUR, NOW), '5 h ago');
  assert.strictEqual(m.ago(NOW - 72 * HOUR, NOW), '3 days ago');
});

test('next run timing', () => {
  assert.strictEqual(m.msToNextRun(null, NOW), 0);
  assert.strictEqual(m.msToNextRun({ lastSuccessAt: NOW, lastError: 'x' }, NOW), 0);
  assert.strictEqual(m.msToNextRun({ lastSuccessAt: NOW - 20 * HOUR }, NOW), 4 * HOUR);
  assert.strictEqual(m.msToNextRun({ lastSuccessAt: NOW - 30 * HOUR }, NOW), 0);
  assert.strictEqual(m.inWords(0), 'on the next check');
  assert.strictEqual(m.inWords(30 * MIN - 1), 'within the hour');
  assert.strictEqual(m.inWords(4 * HOUR), 'in 4 h');
});

test('whenOf names today and yesterday', () => {
  const now = new Date(2026, 9, 18, 12);
  assert.match(m.whenOf(new Date(2026, 9, 18, 9), now), /^Today /);
  assert.match(m.whenOf(new Date(2026, 9, 17, 9), now), /^Yesterday /);
  assert.match(m.whenOf(new Date(2026, 8, 1, 9), now), /^Sep 1 /);
});

test('scopeOf reads the category or last path segment', () => {
  assert.strictEqual(m.scopeOf('https://recent.design/?category=interface'), 'interface');
  assert.strictEqual(m.scopeOf('https://60fps.design/snippets'), 'snippets');
  assert.strictEqual(m.scopeOf('https://appinspo.com/tagged/mobile-apps'), 'mobile apps');
  assert.strictEqual(m.scopeOf('https://x.com/sitemap.xml'), '');
  assert.strictEqual(m.scopeOf('https://x.com/'), '');
});

test('header state', () => {
  assert.deepStrictEqual(m.headerState(false, true), { busy: false, blocked: false, title: '' });
  assert.deepStrictEqual(m.headerState(false, false), { busy: false, blocked: true, title: 'Turn on a source to run' });
  assert.deepStrictEqual(m.headerState(true, false), { busy: true, blocked: true, title: '' });
});

test('alerts list failed sources outside the run', () => {
  const sources = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const status = { a: { lastError: 'boom' }, b: { lastError: 'bad' }, c: {} };
  const idle = { running: false, queue: [] };
  assert.deepStrictEqual(m.failedSources(sources, status, idle).map((s) => s.id), ['a', 'b']);
  assert.deepStrictEqual(m.failedSources(sources, status, { running: true, queue: ['a'] }).map((s) => s.id), ['b']);
  const label = (s) => s.id.toUpperCase();
  assert.deepStrictEqual(m.alertView([sources[0]], status, label), { title: 'A failed', description: 'boom', action: 'Try again', ids: ['a'] });
  const many = m.alertView(sources.slice(0, 2), status, label);
  assert.strictEqual(many.title, '2 sources failed');
  assert.strictEqual(many.description, 'A, B. Open Sources for each reason.');
  assert.strictEqual(many.action, 'Try all again');
});

test('status strip', () => {
  const sources = [{ id: 'a', enabled: true }, { id: 'b', enabled: false }];
  const status = { a: { lastSuccessAt: NOW - 2 * HOUR } };
  const activity = [{ at: NOW - HOUR }, { at: NOW - 30 * 24 * HOUR }];
  assert.deepStrictEqual(m.stripView(sources, status, activity, NOW), { last: '2 h ago', next: 'In 22 h', week: '1', unit: 'design' });
  const paused = m.stripView([{ id: 'a', enabled: false }], {}, [], NOW);
  assert.deepStrictEqual(paused, { last: 'Never', next: 'All sources paused', week: '0', unit: 'designs' });
  const busy = Array.from({ length: 50 }, () => ({ at: NOW }));
  assert.strictEqual(m.stripView(sources, status, busy, NOW).week, '50+');
});

test('run steps', () => {
  const st = { current: 'c', phase: 'importing', progress: { done: 2, total: 5 }, planned: { d: 0, e: 3 }, results: { a: { posts: 2 }, b: { error: 'x' }, f: { posts: 0 }, g: { posts: 1, stopped: true } } };
  assert.deepStrictEqual(m.stepFor(st, 'A', 'a'), { label: 'A', status: 'ok', value: '2 new' });
  assert.strictEqual(m.stepFor(st, 'B', 'b').status, 'fail');
  assert.strictEqual(m.stepFor(st, 'F', 'f').value, 'Up to date');
  assert.strictEqual(m.stepFor(st, 'G', 'g').value, 'Stopped, 1 new');
  assert.strictEqual(m.stepFor(st, 'C', 'c').value, '2 of 5');
  assert.strictEqual(m.stepFor({ ...st, phase: 'checking' }, 'C', 'c').value, 'Checking');
  assert.strictEqual(m.stepFor(st, 'D', 'd').value, 'Nothing new');
  assert.strictEqual(m.stepFor(st, 'E', 'e').value, '3 to import');
  assert.strictEqual(m.stepFor(st, 'H', 'h').value, 'Queued');
});

test('run view by phase', () => {
  const base = { queue: ['a', 'b'], planned: { a: 4 }, results: { b: { done: 3 } }, current: 'a', progress: { done: 1, total: 4 }, phase: 'checking' };
  assert.strictEqual(m.runView({ ...base, stopRequested: true }, '').title, 'Stopping');
  const confirm = m.runView({ ...base, phase: 'confirming' }, '');
  assert.strictEqual(confirm.title, 'Waiting for you');
  assert.match(confirm.sentence, /Found 4 new designs/);
  const importing = m.runView({ ...base, phase: 'importing' }, 'A');
  assert.deepStrictEqual([importing.sentence, importing.now, importing.total], ['Importing from A.', 4, 4]);
  assert.strictEqual(m.runView({ ...base, phase: 'importing' }, '').sentence, 'Importing.');
  const checking = m.runView(base, 'A');
  assert.deepStrictEqual([checking.sentence, checking.now, checking.total], ['Looking for new designs on A.', 2, 2]);
  assert.strictEqual(m.runView(base, '').sentence, 'Looking for new designs.');
});

test('progress and step summary', () => {
  assert.deepStrictEqual(m.progressOf({ now: 1, total: 4 }), { determinate: true, pct: 25, value: '1 of 4' });
  assert.deepStrictEqual(m.progressOf({}), { determinate: false, pct: 0, value: '' });
  const steps = [{ status: 'ok' }, { status: 'queued' }];
  assert.strictEqual(m.stepsSummary({ phase: 'importing', queue: [], planned: {}, results: {} }, steps), '1 of 2 done');
  assert.strictEqual(m.stepsSummary({ phase: 'checking', queue: ['a', 'b'], planned: { a: 1 }, results: {} }, steps), '1 of 2 checked');
});

test('imports view filters by source and limits rows', () => {
  const activity = [{ sourceId: 'a', label: 'A' }, { sourceId: 'b', label: 'B' }, { sourceId: 'a', label: 'A' }];
  const all = m.importsView(activity, '', false, 2);
  assert.deepStrictEqual(all.sources, [['a', 'A'], ['b', 'B']]);
  assert.strictEqual(all.shown.length, 2);
  assert.strictEqual(m.importsView(activity, '', true, 2).shown.length, 3);
  assert.strictEqual(m.importsView(activity, 'b', false, 2).list.length, 1);
  assert.strictEqual(m.importsView(activity, 'gone', false, 2).feed, '');
});

test('source row text', () => {
  const source = { id: 's', enabled: true };
  const idle = { running: false, queue: [], results: {} };
  const view = (over) => m.sourceView({ st: idle, source, status: undefined, daily: null, now: NOW, ...over });
  assert.deepStrictEqual(view({}), { status: null, sentence: 'Not run yet. Next run on the next check.' });
  assert.strictEqual(view({ status: { lastError: 'boom' } }).sentence, 'boom');
  const ok = { lastSuccessAt: NOW - 2 * HOUR, lastImported: 3 };
  assert.strictEqual(view({ status: ok }).sentence, 'Last run 2 h ago, 3 new files. Next run in 22 h.');
  assert.strictEqual(view({ status: { lastSuccessAt: NOW - HOUR } }).sentence, 'Last run 1 h ago, no new files. Next run in 23 h.');
  assert.deepStrictEqual(view({ source: { ...source, enabled: false } }).status, { kind: 'paused', word: 'Paused' });
  const queued = { running: true, queue: ['s'], results: {}, current: 'other' };
  assert.deepStrictEqual(view({ st: queued }).status, { kind: 'queued', word: 'Queued' });
});

test('source row while running', () => {
  const source = { id: 's', enabled: true };
  const run = { running: true, queue: ['s'], results: {}, current: 's', phase: 'checking', progress: null };
  const view = (st, daily) => m.sourceView({ st, source, status: undefined, daily, now: NOW });
  assert.deepStrictEqual(view(run, null).status, { kind: 'running', word: 'Running' });
  assert.strictEqual(view({ ...run, stopRequested: true }, null).status.word, 'Stopping');
  assert.strictEqual(view(run, null).sentence, 'Looking for new designs.');
  const daily = { current: { name: 'Zed', catalog: [1, 2], inventoryComplete: false }, completedApps: {} };
  assert.strictEqual(view(run, daily).sentence, 'Checking 2 screens from Zed for animations.');
  const importing = { ...run, phase: 'importing', progress: { done: 1, total: 3 } };
  assert.strictEqual(view(importing, daily).sentence, 'Importing 1 of 3 designs from Zed.');
  assert.strictEqual(view(importing, null).sentence, 'Importing 1 of 3 designs.');
});

test('source row shows the daily mobbin app', () => {
  const source = { id: 's', enabled: true };
  const idle = { running: false, queue: [], results: {} };
  const daily = { current: { name: 'Zed', key: 'k', completedAt: 1 }, completedApps: { k: { exportVersion: 3, screens: 9, animations: 2 } } };
  const row = m.sourceView({ st: idle, source, status: undefined, daily, now: NOW });
  assert.match(row.sentence, /^App: Zed, 9 screens and 2 animations\. Not run yet\./);
  const plain = m.sourceView({ st: idle, source, status: undefined, daily: { current: { name: 'Zed' }, completedApps: {} }, now: NOW });
  assert.match(plain.sentence, /^App: Zed\. /);
});

test('add field parsing', () => {
  assert.strictEqual(m.normalizeSourceUrl(' recent.design '), 'https://recent.design');
  assert.strictEqual(m.normalizeSourceUrl('http://a.co/x'), 'http://a.co/x');
  for (const bad of ['', 'nodots', 'a b.com', 'https://not a link']) assert.throws(() => m.normalizeSourceUrl(bad), TypeError);
  assert.match(m.addErrorText(new TypeError('x')), /Enter a website link/);
  assert.strictEqual(m.addErrorText(new Error('Already added')), 'Already added.');
});

test('toasts after a manual run', () => {
  const ok = { sourceId: 'a', label: 'A', posts: 2 };
  const [done] = m.runToasts([ok], { itemId: 'i1' });
  assert.deepStrictEqual([done.kind, done.title, done.action, done.open], ['success', '2 designs imported', 'Show', 'i1']);
  assert.match(done.text, /^From A\. They are in Uncategorized\./);
  assert.strictEqual(m.runToasts([ok], undefined)[0].action, null);
  assert.match(m.runToasts([{ ...ok, stopped: true }], undefined)[0].text, /Stopped early/);
  assert.strictEqual(m.runToasts([{ sourceId: 'a', label: 'A', posts: 0 }], undefined)[0].title, 'No new designs');
  assert.strictEqual(m.runToasts([{ sourceId: 'a', label: 'A', stopped: true }], undefined)[0].title, 'Stopped');
  const failed = m.runToasts([{ sourceId: 'a', label: 'A', error: 'bad' }], undefined);
  assert.deepStrictEqual(failed, [{ kind: 'fail', title: 'A failed', text: 'bad', action: 'Try again', retry: 'a', duration: 0 }]);
});

test('keyboard helpers', () => {
  assert.strictEqual(m.navIndex('ArrowDown', 2, 3), 0);
  assert.strictEqual(m.navIndex('ArrowUp', 0, 3), 2);
  assert.strictEqual(m.navIndex('Home', 1, 3), 0);
  assert.strictEqual(m.navIndex('End', 1, 3), 2);
  assert.strictEqual(m.navIndex('x', 1, 3), null);
  assert.strictEqual(m.navIndex('ArrowRight', 0, 2, { next: 'ArrowRight', prev: 'ArrowLeft' }), 1);
  assert.strictEqual(m.tabStop(1, 3, false), 2);
  assert.strictEqual(m.tabStop(2, 3, false), 0);
  assert.strictEqual(m.tabStop(0, 3, true), 2);
  assert.strictEqual(m.tabStop(-1, 3, true), 2);
  assert.strictEqual(m.tabStop(2, 3, true), 1);
  assert.strictEqual(m.edgeWrap(true, 0, 3), 2);
  assert.strictEqual(m.edgeWrap(false, 2, 3), 0);
  assert.strictEqual(m.edgeWrap(false, 1, 3), null);
  assert.strictEqual(m.edgeWrap(true, -1, 3), null);
});

test('menu placement', () => {
  const win = { width: 800, height: 600 };
  const size = { width: 160, height: 100 };
  const rect = { top: 40, bottom: 70, right: 300 };
  assert.deepStrictEqual(m.menuPlacement(rect, size, win), { side: 'bottom', top: 74, left: 140 });
  const low = m.menuPlacement({ top: 560, bottom: 590, right: 300 }, size, win);
  assert.deepStrictEqual([low.side, low.top], ['top', 456]);
  assert.strictEqual(m.menuPlacement({ ...rect, right: 100 }, size, win).left, 8);
  assert.strictEqual(m.menuPlacement({ ...rect, right: 900 }, size, win).left, 632);
});
