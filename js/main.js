// Entry point inside Eagle. As a background service this page loads when Eagle starts and stays
// alive; the same page is the Sources window when the user opens the plugin.
const path = require('path');

window.DS = null;

eagle.onPluginCreate(async (plugin) => {
  const load = (file) => require(path.join(plugin.path, 'js', file));
  const { createStore } = load('store.js');
  const { planSource, importPlan, recordFailure, labelFor, isDue } = load('runner.js');
  const { CHECK_EVERY_MS, RANGE_OPTIONS, CONFIRM_FROM_DAYS, AVG_MB_PER_FILE } = load('defaults.js');
  const { adapterFor } = load('adapters/index.js');

  const dataDir = path.join(eagle.app.userDataPath || eagle.os.homedir(), 'design-scrapper');
  const store = createStore(dataDir);
  const listeners = new Set();
  const state = { running: false, phase: null, current: null, progress: null, stopRequested: false };

  const emit = () => listeners.forEach((fn) => fn());
  const libraryPath = () => eagle.library.path;
  const log = (msg) => eagle.log.info(`[design-scrapper] ${msg}`);

  async function confirmBackfill(plans, days) {
    const posts = plans.reduce((n, p) => n + p.items.length, 0);
    const files = plans.reduce((n, p) => n + p.files, 0);
    if (!posts) return true;
    const mb = files * AVG_MB_PER_FILE;
    const size = mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    const { response } = await eagle.dialog.showMessageBox({
      type: 'question',
      title: 'Design Scrapper',
      message: `Import ${posts} designs from the last ${days} days?`,
      detail: `${plans.filter((p) => p.items.length).map((p) => `${p.label}: ${p.items.length}`).join('\n')}\n\n${files} files, roughly ${size} (estimated from the average file size so far). They go to Uncategorized. You can stop at any time.`,
      buttons: ['Import', 'Cancel'],
    });
    return response === 0;
  }

  async function run(sources, { manual = false, days = null } = {}) {
    if (state.running || !sources.length) return null;
    Object.assign(state, { running: true, phase: 'checking', stopRequested: false, progress: null });
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
          plans.push(await planSource(source, ctx));
        } catch (err) {
          recordFailure(source, err, ctx);
          results.push({ sourceId: source.id, label: labelFor(source, adapterFor(source.url)), imported: 0, error: err.message });
        }
      }
      if (days >= CONFIRM_FROM_DAYS && !(await confirmBackfill(plans, days))) return results;
      state.phase = 'importing';
      for (const plan of plans) {
        if (state.stopRequested) break;
        state.current = plan.source.id;
        state.progress = null;
        emit();
        results.push(await importPlan(plan, ctx));
      }
    } finally {
      Object.assign(state, { running: false, phase: null, current: null, progress: null });
      emit();
    }
    await notify(results, manual);
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
    onChange: (fn) => listeners.add(fn),
    runNow: (sourceId, days = null) =>
      run(store.data.sources.filter((s) => (sourceId ? s.id === sourceId : s.enabled)), { manual: true, days }),
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
