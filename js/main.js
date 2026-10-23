// Entry point inside Eagle. As a background service this page loads when Eagle starts and stays
// alive; the same page is the Sources window when the user opens the plugin.
const path = require('path');

window.DS = null;

eagle.onPluginCreate(async (plugin) => {
  const load = (file) => require(path.join(plugin.path, 'js', file));
  const { createStore } = load('store.js');
  const { planSource, importPlan, recordFailure, labelFor, isDue } = load('runner.js');
  const { DEFAULT_SOURCES, CHECK_EVERY_MS, RANGE_OPTIONS, CONFIRM_FROM_DAYS, AVG_MB_PER_VIDEO, AVG_MB_PER_IMAGE } = load('defaults.js');
  const { adapterFor } = load('adapters/index.js');

  const dataDir = path.join(eagle.app.userDataPath || eagle.os.homedir(), 'design-scrapper');
  const store = createStore(dataDir);
  const listeners = new Set();
  const runDoneListeners = new Set();
  // queue: source ids in this run; planned: new posts found per source; results: outcome per finished source.
  const state = { running: false, phase: null, current: null, progress: null, stopRequested: false, queue: [], planned: {}, results: {} };
  // The Sources window registers an in-window confirm; the native dialog is the fallback.
  let confirmInWindow = null;

  const emit = () => listeners.forEach((fn) => fn());
  const libraryPath = () => eagle.library.path;
  const log = (msg) => eagle.log.info(`[design-scrapper] ${msg}`);

  async function confirmBackfill(plans, days) {
    const posts = plans.reduce((n, p) => n + p.items.length, 0);
    const files = plans.reduce((n, p) => n + p.files, 0);
    if (!posts) return true;
    const sum = (key) => plans.reduce((n, p) => n + p[key], 0);
    const mb = sum('videos') * AVG_MB_PER_VIDEO + sum('images') * AVG_MB_PER_IMAGE;
    const size = mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    const n = (x) => x.toLocaleString('en-US');
    const title = `Import ${n(posts)} designs from ${days === 'all' ? 'all time' : `the last ${days} days`}?`;
    const note =
      files > 1000
        ? 'This can take hours and Eagle needs to stay open. Stop keeps everything already imported, and running it again continues where it left off.'
        : 'You can stop at any time.';
    if (confirmInWindow) {
      return confirmInWindow({
        title,
        rows: plans.filter((p) => p.items.length).map((p) => ({ label: p.label, value: n(p.items.length) })),
        detail: `${n(files)} files, roughly ${size}. They go to Uncategorized. ${note}`,
        confirmLabel: 'Import',
      });
    }
    const lines = [
      plans.filter((p) => p.items.length).map((p) => `${p.label}: ${n(p.items.length)}`).join('\n'),
      `${n(files)} files, roughly ${size} (estimated from the average file sizes so far). They go to Uncategorized.`,
      note,
    ];
    const { response } = await eagle.dialog.showMessageBox({
      type: 'question',
      title: 'Design Scrapper',
      message: title,
      detail: lines.join('\n\n'),
      buttons: ['Import', 'Cancel'],
    });
    return response === 0;
  }

  async function run(sources, { manual = false, days = null } = {}) {
    if (state.running || !sources.length) return null;
    Object.assign(state, { running: true, phase: 'checking', stopRequested: false, progress: null, queue: sources.map((s) => s.id), planned: {}, results: {} });
    emit();
    const ctx = {
      store,
      libraryPath: libraryPath(),
      eagleItem: eagle.item,
      fetch: window.fetch.bind(window),
      tmpDir: path.join(eagle.os.tmpdir(), 'design-scrapper'),
      log,
      days,
      shouldStop: () => state.stopRequested,
      onProgress: (p) => {
        state.progress = { done: p.done, total: p.total };
        emit();
      },
    };
    const results = [];
    try {
      const plans = [];
      for (const source of sources) {
        state.current = source.id;
        emit();
        try {
          const plan = await planSource(source, ctx);
          state.planned[source.id] = plan.items.length;
          plans.push(plan);
        } catch (err) {
          recordFailure(source, err, ctx);
          const result = { sourceId: source.id, label: labelFor(source, adapterFor(source.url)), imported: 0, error: err.message };
          state.results[source.id] = result;
          results.push(result);
        }
      }
      const needsConfirm = days === 'all' || days >= CONFIRM_FROM_DAYS;
      if (needsConfirm) {
        state.phase = 'confirming';
        state.current = null;
        emit();
        if (!(await confirmBackfill(plans, days))) return results;
      }
      state.phase = 'importing';
      for (const plan of plans) {
        if (state.stopRequested) break;
        state.current = plan.source.id;
        state.progress = null;
        emit();
        const result = await importPlan(plan, ctx);
        state.results[plan.source.id] = result;
        results.push(result);
      }
    } finally {
      Object.assign(state, { running: false, phase: null, current: null, progress: null, queue: [], planned: {}, results: {} });
      emit();
    }
    await notify(results, manual);
    runDoneListeners.forEach((fn) => fn(results, { manual }));
    return results;
  }

  async function notify(results, manual) {
    const imported = results.reduce((n, r) => n + r.imported, 0);
    const failed = results.filter((r) => r.error);
    if (!manual && !imported && !failed.length) return;
    const from = results.filter((r) => r.imported).map((r) => r.label).join(', ');
    const parts = [imported ? `${imported} new design${imported === 1 ? '' : 's'} from ${from}` : 'No new designs'];
    if (results.some((r) => r.stopped)) parts.push('stopped early');
    if (failed.length) parts.push(`${failed.map((r) => r.label).join(', ')} need${failed.length === 1 ? 's' : ''} attention`);
    await eagle.notification.show({ title: 'Design Scrapper', body: parts.join(' · '), mute: true, duration: 6000 });
  }

  function dueSources() {
    const lib = store.library(libraryPath());
    return store.data.sources.filter((s) => s.enabled && isDue(lib.status[s.id]));
  }

  async function tick() {
    try {
      await run(dueSources());
    } catch (err) {
      log(`Scheduled run failed: ${err.message}`);
    }
  }

  window.DS = {
    store,
    state,
    adapterFor,
    libraryPath,
    rangeOptions: RANGE_OPTIONS,
    defaultSources: DEFAULT_SOURCES,
    labelFor: (source) => labelFor(source, adapterFor(source.url)),
    onChange: (fn) => listeners.add(fn),
    onRunDone: (fn) => runDoneListeners.add(fn),
    setConfirm: (fn) => {
      confirmInWindow = fn;
    },
    // sourceIds: one id, a list of ids, or null for every enabled source.
    runNow: (sourceIds, days = null) => {
      const ids = sourceIds == null ? null : [].concat(sourceIds);
      return run(store.data.sources.filter((s) => (ids ? ids.includes(s.id) : s.enabled)), { manual: true, days });
    },
    stop: () => {
      state.stopRequested = true;
      emit();
    },
    addSource: (url) => {
      const s = store.addSource(url);
      emit();
      return s;
    },
    removeSource: (id) => {
      store.removeSource(id);
      emit();
    },
    restoreSource: (source, index) => {
      store.restoreSource(source, index);
      emit();
    },
    setEnabled: (id, on) => {
      store.setEnabled(id, on);
      emit();
    },
  };
  window.dispatchEvent(new Event('ds-ready'));

  eagle.onLibraryChanged(() => {
    emit();
    tick();
  });
  setTimeout(tick, 30e3);
  setInterval(tick, CHECK_EVERY_MS);
});
