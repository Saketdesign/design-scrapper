// Entry point inside Eagle. As a background service this page loads when Eagle starts and stays
// alive; the same page is the Sources window when the user opens the plugin.
const path = require('path');

window.DS = null;

eagle.onPluginCreate(async (plugin) => {
  const load = (file) => require(path.join(plugin.path, 'js', file));
  const { createStore } = load('store.js');
  const { runSource, isDue } = load('runner.js');
  const { CHECK_EVERY_MS } = load('defaults.js');
  const { adapterFor } = load('adapters/index.js');

  const dataDir = path.join(eagle.app.userDataPath || eagle.os.homedir(), 'design-scrapper');
  const store = createStore(dataDir);
  const listeners = new Set();
  const state = { running: false, current: null, lastCheckAt: null };

  const emit = () => listeners.forEach((fn) => fn());
  const libraryPath = () => eagle.library.path;
  const log = (msg) => eagle.log.info(`[design-scrapper] ${msg}`);

  async function run(sources, { manual = false } = {}) {
    if (state.running || !sources.length) return null;
    state.running = true;
    emit();
    const results = [];
    try {
      for (const source of sources) {
        state.current = source.id;
        emit();
        results.push(
          await runSource(source, {
            store,
            libraryPath: libraryPath(),
            eagleItem: eagle.item,
            fetch: window.fetch.bind(window),
            tmpDir: path.join(eagle.os.tmpdir(), 'design-scrapper'),
            log,
          }),
        );
        emit();
      }
    } finally {
      state.running = false;
      state.current = null;
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
    if (failed.length) parts.push(`${failed.map((r) => r.label).join(', ')} need${failed.length === 1 ? 's' : ''} attention`);
    await eagle.notification.show({ title: 'Design Scrapper', body: parts.join(' · '), mute: true, duration: 6000 });
  }

  function dueSources() {
    const lib = store.library(libraryPath());
    return store.data.sources.filter((s) => s.enabled && isDue(lib.status[s.id]));
  }

  async function tick() {
    state.lastCheckAt = Date.now();
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
    checkEveryMs: CHECK_EVERY_MS,
    onChange: (fn) => listeners.add(fn),
    runNow: (sourceId) => run(store.data.sources.filter((s) => (sourceId ? s.id === sourceId : s.enabled)), { manual: true }),
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
