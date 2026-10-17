// Renders the Sources window from the shared app object created in main.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function ago(t) {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  }

  function nextRunIn(status) {
    if (!status || !status.lastSuccessAt) return 'on the next check';
    const ms = status.lastSuccessAt + 24 * 3600e3 - Date.now();
    if (ms <= 0) return 'on the next check';
    const h = Math.round(ms / 3600e3);
    return h >= 1 ? `in ${h} h` : 'within the hour';
  }

  function statusLine(app, source, status) {
    if (app.state.current === source.id) return { cls: 'running', text: 'Scraping…' };
    if (status && status.lastError) return { cls: 'error', text: `Needs attention: ${status.lastError}` };
    if (!source.enabled) return { cls: '', text: 'Paused' };
    if (!status || !status.lastSuccessAt) return { cls: '', text: 'Not run yet · runs on the next check' };
    const n = status.lastImported || 0;
    return { cls: '', text: `Last run ${ago(status.lastSuccessAt)} · ${n} new · next ${nextRunIn(status)}` };
  }

  function renderSources(app) {
    const lib = app.store.library(app.libraryPath());
    const { sources } = app.store.data;
    $('sourceCount').textContent = `${sources.filter((s) => s.enabled).length} of ${sources.length} on`;
    $('sources').innerHTML = sources.length
      ? sources
          .map((s) => {
            const url = new URL(s.url);
            const builtIn = app.adapterFor(s.url).id !== 'generic';
            const line = statusLine(app, s, lib.status[s.id]);
            const pathText = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
            return `<li class="source ${s.enabled ? '' : 'disabled'}" data-id="${esc(s.id)}">
              <label class="switch" title="${s.enabled ? 'Pause' : 'Resume'} this source">
                <input type="checkbox" data-action="toggle" ${s.enabled ? 'checked' : ''}><span></span>
              </label>
              <div class="source-main">
                <div class="source-url" title="${esc(s.url)}">
                  <span class="host">${esc(url.hostname.replace(/^www\./, ''))}</span>
                  <span class="path">${esc(pathText)}</span>
                  <span class="badge">${builtIn ? 'Built-in' : 'Best effort'}</span>
                </div>
                <div class="source-status ${line.cls}" title="${esc(line.text)}">${esc(line.text)}</div>
              </div>
              <button class="btn" data-action="run" ${app.state.running ? 'disabled' : ''}>Run</button>
              <button class="btn icon" data-action="remove" title="Remove source" ${app.state.running ? 'disabled' : ''}>✕</button>
            </li>`;
          })
          .join('')
      : '<li class="empty">No sources yet. Add a website link below.</li>';
  }

  function renderActivity(app) {
    const { activity } = app.store.library(app.libraryPath());
    $('activity').innerHTML = activity.length
      ? activity
          .slice(0, 20)
          .map(
            (a) => `<li data-item="${esc(a.itemId)}" title="Show in Eagle">
              <span class="title">${esc(a.title)}${a.count > 1 ? ` <span class="muted">· ${a.count} files</span>` : ''}</span>
              <span class="meta">${esc(a.label)} · ${esc(ago(a.at))}</span>
            </li>`,
          )
          .join('')
      : '<li class="empty">Nothing imported yet.</li>';
  }

  function render(app) {
    const runAll = $('runAll');
    runAll.disabled = app.state.running;
    runAll.textContent = app.state.running ? 'Running…' : 'Run all now';
    renderSources(app);
    renderActivity(app);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = eagle.app.isDarkColors() ? 'dark' : 'light';
  }

  function init(app) {
    applyTheme();
    eagle.onThemeChanged(applyTheme);
    app.onChange(() => render(app));
    eagle.onPluginShow(() => render(app));
    setInterval(() => render(app), 60e3);

    $('runAll').addEventListener('click', () => app.runNow());

    $('sources').addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (!id || action === 'toggle') return;
      if (action === 'run') app.runNow(id);
      if (action === 'remove') app.removeSource(id);
    });
    $('sources').addEventListener('change', (e) => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (id && e.target.dataset.action === 'toggle') app.setEnabled(id, e.target.checked);
    });

    $('activity').addEventListener('click', (e) => {
      const itemId = e.target.closest('[data-item]')?.dataset.item;
      if (itemId) eagle.item.open(itemId);
    });

    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('addUrl');
      const error = $('addError');
      try {
        const value = input.value.trim();
        app.addSource(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        input.value = '';
        error.hidden = true;
      } catch (err) {
        error.textContent = err instanceof TypeError ? 'That doesn’t look like a website link.' : err.message;
        error.hidden = false;
      }
    });

    render(app);
  }

  if (window.DS) init(window.DS);
  else window.addEventListener('ds-ready', () => init(window.DS), { once: true });
})();
