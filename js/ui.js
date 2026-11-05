// Renders the Sources window from the shared app object created in main.js, with Sodium's components
// (css/sodium/components.css). Markup carries the data-slot names Sodium's React components render.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---- Sodium components ----

  // Lucide glyphs (ISC) under Sodium's names; .icon squares them off.
  const GLYPH = {
    ChevronDown: '<path d="m6 9 6 6 6-6"/>',
    ChevronRight: '<path d="m9 18 6-6-6-6"/>',
    ChevronSort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    OverflowMenuHorizontal: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    Close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    Play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    Copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    Launch: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    TrashCan: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    Download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    DataTable: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  };
  const icon = (name) => `<svg class="icon lucide" viewBox="0 0 24 24" aria-hidden="true">${GLYPH[name]}</svg>`;

  const SURFACE = { primary: 'slab', destructive: 'slab-fail', secondary: 'edged', ghost: 'quiet' };
  // Button: label is plain text; an icon size needs an aria-label in attrs.
  function button({ label = '', variant = 'secondary', size = 'default', iconStart, iconEnd, attrs = '' }) {
    const text = label ? `<span data-slot="button-text">${esc(label)}</span>` : '';
    return `<button type="button" data-slot="button" data-variant="${variant}" data-size="${size}" class="${SURFACE[variant]}" ${attrs}>${iconStart ? icon(iconStart) : ''}${text}${iconEnd ? icon(iconEnd) : ''}</button>`;
  }

  // Status mark: a square shape per status. The running mark's walk starts in phase across re-renders.
  function statusMark(status) {
    const running = status === 'running';
    const phase = running ? ` style="--phase:-${Date.now() % 800}ms"` : '';
    return `<span data-slot="status-mark" data-status="${status}" aria-hidden="true"><span class="status-shape" data-shape="${status}"${phase}>${running ? '<i></i><i></i><i></i><i></i>' : ''}</span></span>`;
  }
  const statusTag = (status, word, size = 'sm') =>
    `<span data-slot="status" data-status="${status}" data-size="${size}">${statusMark(status)}<span data-slot="status-word">${esc(word)}</span></span>`;
  const tag = (text, attrs = '') => `<span data-slot="tag" data-variant="outline" data-size="sm" ${attrs}>${esc(text)}</span>`;
  const switchControl = (on, attrs) =>
    `<button type="button" role="switch" aria-checked="${on}" data-slot="switch" class="light-motion${on ? ' checked' : ''}" ${on ? 'data-checked' : ''} ${attrs}><span data-slot="switch-thumb"></span></button>`;

  // Replaces a region's markup and puts focus back on the control that had it (matched by data-key).
  function swap(el, html) {
    const key = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    el.innerHTML = html;
    if (!key) return;
    const again = el.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }

  // ---- Formatting ----

  function ago(t) {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  }
  // Due 24 h after the last good run, checked every hour.
  function msToNextRun(status) {
    if (!status || !status.lastSuccessAt || status.lastError) return 0;
    return Math.max(0, status.lastSuccessAt + 24 * 3600e3 - Date.now());
  }
  function inWords(ms) {
    if (ms <= 0) return 'on the next check';
    const h = Math.round(ms / 3600e3);
    return h >= 1 ? `in ${h} h` : 'within the hour';
  }
  const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function whenOf(t) {
    const d = new Date(t);
    const diff = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
    const day = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${day} ${timeOf(t)}`;
  }
  const n = (x) => x.toLocaleString('en-US');
  const plural = (x, word) => `${n(x)} ${word}${x === 1 ? '' : 's'}`;
  const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');

  // ---- UI state ----

  let activeTab = 'imports';
  let feedSource = '';
  let showAllImports = false;
  let runStepsOpen = false;
  let lastRunDays = null;
  const noFavicon = new Set();
  const IMPORTS_SHOWN = 8;

  // Official site icons are bundled because these sites use different favicon paths.
  const SOURCE_LOGOS = {
    'recent.design': 'assets/source-logos/recent.svg',
    'vibrant.design': 'assets/source-logos/vibrant.ico',
    'bestdesignsonx.com': 'assets/source-logos/bestdesignsonx.webp',
  };

  function siteIcon(url) {
    const { origin } = new URL(url);
    const host = hostOf(url);
    if (noFavicon.has(origin)) return `<span class="letter" aria-hidden="true">${esc(host[0])}</span>`;
    const invert = host === 'recent.design' ? ' data-invert' : '';
    return `<img class="favicon" src="${esc(SOURCE_LOGOS[host] || `${origin}/favicon.ico`)}" alt="" data-origin="${esc(origin)}"${invert}>`;
  }

  // What part of a site a source reads, when the URL narrows it: ?category=interface, /snippets, /tagged/mobile.
  function scopeOf(url) {
    const u = new URL(url);
    const category = u.searchParams.get('category');
    if (category) return category;
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last && !/\.\w+$/.test(last) ? last.replace(/[-_]/g, ' ') : '';
  }

  // ---- Header ----

  function renderHeader(app) {
    const { running } = app.state;
    const none = !app.store.data.sources.some((s) => s.enabled);
    const runAll = $('runAll');
    runAll.setAttribute('aria-busy', String(running));
    runAll.setAttribute('aria-disabled', String(running || none));
    runAll.title = none && !running ? 'Turn on a source to run' : '';
    $('olderBtn').disabled = running || none;
    $('olderBtn').innerHTML = `<span data-slot="button-text">Import older</span>${icon('ChevronDown')}`;
  }

  // ---- Alerts: failed sources, outside a run ----

  function renderAlerts(app) {
    const lib = app.store.library(app.libraryPath());
    const st = app.state;
    const failed = app.store.data.sources.filter((s) => lib.status[s.id] && lib.status[s.id].lastError && !(st.running && st.queue.includes(s.id)));
    const box = $('alerts');
    box.hidden = !failed.length;
    if (!failed.length) return swap(box, '');
    const one = failed.length === 1;
    const title = one ? `${app.labelFor(failed[0])} failed` : `${failed.length} sources failed`;
    const desc = one
      ? lib.status[failed[0].id].lastError
      : `${failed.map((s) => app.labelFor(s)).join(', ')}. Open Sources for each reason.`;
    swap(box, `<div data-slot="alert" data-status="fail" role="alert">
      <div data-slot="alert-grid">
        <span data-slot="alert-status">${statusMark('fail')}<span class="sr-only">Failed</span></span>
        <p data-slot="alert-title">${esc(title)}</p>
        <div data-slot="alert-description">${esc(desc)}</div>
        <div data-slot="alert-action">${button({ label: one ? 'Try again' : 'Try all again', size: 'sm', attrs: `data-retry="${esc(failed.map((s) => s.id).join(','))}" data-key="retry" ${st.running ? 'disabled' : ''}` })}</div>
      </div></div>`);
  }

  // ---- Overview: the numbers to check first, or the run while one is going ----

  function renderStrip(app) {
    const lib = app.store.library(app.libraryPath());
    const { sources } = app.store.data;
    const on = sources.filter((s) => s.enabled);
    const last = Math.max(0, ...sources.map((s) => (lib.status[s.id] && lib.status[s.id].lastSuccessAt) || 0));
    const next = on.length ? Math.min(...on.map((s) => msToNextRun(lib.status[s.id]))) : null;
    const weekAgo = Date.now() - 7 * 864e5;
    const week = lib.activity.filter((a) => a.at >= weekAgo).length;
    const capped = week === lib.activity.length && week >= 50;
    const cell = (label, value, unit = '') =>
      `<div data-slot="status-strip-cell"><span data-slot="status-strip-label">${esc(label)}</span>
        <span data-slot="status-strip-value">${esc(value)}${unit ? `<span data-slot="status-strip-unit">${esc(unit)}</span>` : ''}</span></div>`;
    return `<div data-slot="status-strip" data-variant="framed" role="group" aria-label="Collection status"><div data-slot="status-strip-cells">
      ${cell('Last run', last ? ago(last) : 'Never')}
      ${cell('Next run', next === null ? 'All sources paused' : inWords(next).replace(/^\w/, (c) => c.toUpperCase()))}
      ${cell('Last 7 days', `${n(week)}${capped ? '+' : ''}`, week === 1 ? 'design' : 'designs')}
    </div></div>`;
  }

  function stepFor(app, id) {
    const st = app.state;
    const source = app.store.data.sources.find((s) => s.id === id);
    const label = source ? app.labelFor(source) : 'Removed source';
    const r = st.results[id];
    const planned = st.planned[id];
    if (r && r.error) return { status: 'fail', label, value: 'Failed' };
    if (r) {
      const x = r.posts || 0;
      return { status: 'ok', label, value: r.stopped ? `Stopped, ${x} new` : x ? `${x} new` : 'Up to date' };
    }
    if (st.current === id) {
      const p = st.progress;
      return { status: 'running', label, value: st.phase === 'importing' && p && p.total ? `${p.done} of ${p.total}` : 'Checking' };
    }
    if (planned === 0) return { status: 'ok', label, value: 'Nothing new' };
    if (planned) return { status: 'queued', label, value: `${planned} to import` };
    return { status: 'queued', label, value: 'Queued' };
  }

  function renderRun(app) {
    const st = app.state;
    const planned = st.queue.reduce((x, id) => x + (st.planned[id] || 0), 0);
    const done = st.queue.reduce((x, id) => {
      if (st.results[id]) return x + (st.results[id].done || 0);
      if (st.current === id && st.phase === 'importing' && st.progress) return x + st.progress.done;
      return x;
    }, 0);
    const current = app.store.data.sources.find((s) => s.id === st.current);
    const where = current ? app.labelFor(current) : '';
    const checked = st.queue.filter((id) => st.planned[id] !== undefined || st.results[id]).length;

    let title, sentence, label, value, total, now;
    if (st.stopRequested) {
      title = 'Stopping';
      sentence = 'Finishing the current design. Everything imported so far is kept.';
    } else if (st.phase === 'confirming') {
      title = 'Waiting for you';
      sentence = `Found ${plural(planned, 'new design')}. Confirm to start importing.`;
    } else if (st.phase === 'importing') {
      title = 'Importing';
      sentence = where ? `Importing from ${where}.` : 'Importing.';
      label = 'Designs';
      [now, total] = [done, planned];
    } else {
      title = 'Checking sources';
      sentence = where ? `Looking for new designs on ${where}.` : 'Looking for new designs.';
      label = 'Sources checked';
      [now, total] = [checked, st.queue.length];
    }
    const determinate = total > 0;
    const pct = determinate ? Math.round((now / total) * 100) : 0;
    value = determinate ? `${n(now)} of ${n(total)}` : '';
    const steps = st.queue.map((id) => stepFor(app, id));
    const finished = steps.filter((s) => s.status === 'ok' || s.status === 'fail').length;
    const progress = `<div data-slot="progress" role="progressbar" aria-label="${esc(label || title)}" ${determinate ? `aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${now}" aria-valuetext="${esc(value)}"` : 'data-indeterminate aria-valuetext="In progress"'}>
        <span data-slot="progress-label">${esc(label || title)}</span>
        <span data-slot="progress-value">${determinate ? esc(value) : '<span class="pending"></span>'}</span>
        <span data-slot="progress-track"><span data-slot="progress-indicator" style="--progress:${pct}%"></span></span>
      </div>`;
    return `<section data-slot="frame" class="frame" aria-labelledby="runTitle">
      <header data-slot="frame-header" class="panel-head">
        <h2 id="runTitle" data-slot="frame-title">${esc(title)}</h2>
        ${statusTag(st.phase === 'confirming' ? 'paused' : 'running', st.phase === 'confirming' ? 'Waiting' : 'Running')}
      </header>
      <div data-slot="frame-body" data-padding="default">
        ${progress}
        <p data-slot="frame-description" aria-live="polite">${esc(sentence)}</p>
        <div data-slot="collapsible">
          <button type="button" data-slot="collapsible-trigger" data-key="steps" aria-expanded="${runStepsOpen}" aria-controls="runSteps" ${runStepsOpen ? 'data-panel-open' : ''}>
            ${icon('ChevronRight')}<span>Each source</span><span data-slot="collapsible-summary">${st.phase === 'importing' ? `${finished} of ${steps.length} done` : `${checked} of ${steps.length} checked`}</span>
          </button>
          <div id="runSteps" data-slot="item-group" data-variant="plain" class="run-steps" role="list" ${runStepsOpen ? '' : 'hidden'}>
            ${steps.map((s) => `<div data-slot="item" data-size="sm" role="listitem">
              <div data-slot="item-content"><div data-slot="item-title"><span>${esc(s.label)}</span></div></div>
              <div data-slot="item-actions">${statusTag(s.status, s.value)}</div></div>`).join('')}
          </div>
        </div>
      </div>
      <footer data-slot="frame-footer">
        <span data-slot="frame-meta">${st.stopRequested ? 'Stopping after this design' : 'Stop keeps what is imported'}</span>
        ${button({ label: st.stopRequested ? 'Stopping' : 'Stop run', size: 'sm', attrs: `id="stopRun" data-key="stop" ${st.stopRequested ? 'disabled' : ''}` })}
      </footer>
    </section>`;
  }

  function renderOverview(app) {
    const box = $('overview');
    box.hidden = !app.state.running && !app.store.data.sources.length;
    swap(box, app.state.running ? renderRun(app) : box.hidden ? '' : renderStrip(app));
  }

  // ---- Tabs ----

  function renderTabs(app) {
    const { activity } = app.store.library(app.libraryPath());
    $('importsCount').textContent = activity.length ? n(activity.length) : '';
    $('sourcesCount').textContent = app.store.data.sources.length ? n(app.store.data.sources.length) : '';
    for (const tab of document.querySelectorAll('[data-slot="tabs-trigger"]')) {
      const on = tab.dataset.tab === activeTab;
      tab.toggleAttribute('data-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !on;
    }
  }

  function selectTab(app, name, focus) {
    activeTab = name;
    renderTabs(app);
    if (focus) $(`tab-${name}`).focus();
  }

  // ---- Imports ----

  function renderImports(app) {
    const { activity } = app.store.library(app.libraryPath());
    const box = $('imports');
    if (!activity.length) {
      return swap(box, `<div data-slot="empty" data-reason="empty" class="frame">
        <span data-slot="empty-icon" aria-hidden="true">${icon('Download')}</span>
        <div data-slot="empty-header">
          <h3 data-slot="empty-title">Nothing imported yet</h3>
          <p data-slot="empty-description">Run now checks every source for new designs. Otherwise the daily run picks them up while Eagle is open.</p>
        </div></div>`);
    }
    const sources = [...new Map(activity.map((a) => [a.sourceId, a.label])).entries()];
    if (feedSource && !sources.some(([id]) => id === feedSource)) feedSource = '';
    const list = activity.filter((a) => !feedSource || a.sourceId === feedSource);
    const shown = showAllImports ? list : list.slice(0, IMPORTS_SHOWN);
    const filter = sources.length > 1
      ? `<div data-slot="native-select" data-size="sm" class="imports-filter">
          <select data-slot="native-select-control" class="field" id="feedSource" data-key="feed" aria-label="Show imports from">
            <option value="">All sources</option>
            ${sources.map(([id, label]) => `<option value="${esc(id)}" ${id === feedSource ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>${icon('ChevronSort')}</div>`
      : '';
    const rows = shown.map((a) => `<div data-slot="item" role="listitem">
        <div data-slot="item-content">
          <div data-slot="item-title"><button type="button" data-slot="item-link" data-control data-item="${esc(a.itemId)}" data-key="item:${esc(a.itemId)}" title="Show in Eagle">${esc(a.title)}</button></div>
          <p data-slot="item-description">${esc(a.label)}${a.count > 1 ? `, ${a.count} files` : ''}</p>
        </div>
        <div data-slot="item-meta"><time datetime="${new Date(a.at).toISOString()}">${esc(whenOf(a.at))}</time></div>
      </div>`).join('');
    const more = list.length > IMPORTS_SHOWN
      ? `<footer data-slot="frame-footer">
          <span data-slot="frame-meta">${showAllImports ? `All ${n(list.length)}` : `${shown.length} of ${n(list.length)}`}</span>
          ${button({ label: showAllImports ? 'Show fewer' : 'Show all', variant: 'ghost', size: 'sm', attrs: 'id="moreImports" data-key="more"' })}
        </footer>`
      : '';
    swap(box, `<section data-slot="frame" class="frame" aria-labelledby="importsTitle">
      <header data-slot="frame-header" class="panel-head">
        <h2 id="importsTitle" data-slot="frame-title">Recent imports</h2>${filter}
      </header>
      <div data-slot="frame-body" data-padding="none"><div data-slot="item-group" data-variant="plain" role="list">${rows}</div></div>
      ${more}
    </section>`);
  }

  // ---- Sources ----

  function sourceState(app, source, status) {
    const st = app.state;
    const adapter = app.adapterFor(source.url);
    const daily = adapter.id === 'mobbin' && !adapter.isAnimations(source.url) && app.store.library(app.libraryPath()).mobbinDaily;
    const appName = daily && daily.current && daily.current.name;
    if (st.running && st.queue.includes(source.id) && !st.results[source.id]) {
      if (st.current === source.id) {
        const p = st.progress;
        const currentApp = daily && daily.current;
        const checking = currentApp && currentApp.catalog && !currentApp.inventoryComplete
          ? `Checking ${currentApp.catalog.length} screens from ${appName} for animations.`
          : 'Looking for new designs.';
        const sentence = st.phase === 'importing' && p && p.total
          ? `Importing ${p.done} of ${plural(p.total, 'design')}${appName ? ` from ${appName}` : ''}.` : checking;
        return { status: statusTag('running', st.stopRequested ? 'Stopping' : 'Running'), sentence };
      }
      return { status: statusTag('queued', 'Queued'), sentence: 'Waiting for its turn in this run.' };
    }
    if (status && status.lastError) return { status: statusTag('fail', 'Failed'), sentence: status.lastError };
    const files = status && status.lastImported ? `${plural(status.lastImported, 'new file')}` : 'no new files';
    const last = status && status.lastSuccessAt ? `Last run ${ago(status.lastSuccessAt)}, ${files}.` : 'Not run yet.';
    if (!source.enabled) return { status: statusTag('paused', 'Paused'), sentence: last };
    const completed = daily && daily.current && daily.current.completedAt && daily.completedApps[daily.current.key];
    const appSummary = appName ? `App: ${appName}${completed && completed.exportVersion === 3 ? `, ${completed.screens} screens and ${completed.animations} animations` : ''}. ` : '';
    return { status: '', sentence: `${appSummary}${last} Next run ${inWords(msToNextRun(status))}.` };
  }

  function renderSources(app) {
    const lib = app.store.library(app.libraryPath());
    const { sources } = app.store.data;
    const list = $('sources');
    if (!sources.length) {
      const have = new Set(sources.map((s) => s.url));
      const suggestions = app.defaultSources.filter((d) => !have.has(d.url)).map((d) => `<div data-slot="item" role="listitem">
          <div data-slot="item-media" data-variant="icon">${siteIcon(d.url)}</div>
          <div data-slot="item-content"><div data-slot="item-title"><span>${esc(hostOf(d.url))}</span></div></div>
          <div data-slot="item-actions">${button({ label: 'Add', size: 'sm', attrs: `data-add="${esc(d.url)}" data-key="add:${esc(d.url)}"` })}</div>
        </div>`).join('');
      return swap(list, `<div data-slot="empty" data-reason="empty" data-size="sm" role="listitem">
          <div data-slot="empty-header">
            <h3 data-slot="empty-title">No sources yet</h3>
            <p data-slot="empty-description">Add a gallery link below, or start with a built-in one. New designs arrive once a day.</p>
          </div></div>${suggestions}`);
    }
    swap(list, sources.map((s) => {
      const host = hostOf(s.url);
      const status = lib.status[s.id];
      const { status: word, sentence } = sourceState(app, s, status);
      const adapter = app.adapterFor(s.url);
      const scope = adapter.scopeFor ? adapter.scopeFor(s.url) : scopeOf(s.url);
      const generic = adapter.id === 'generic';
      const needsLogin = adapter.requiresLogin;
      return `<div data-slot="item" role="listitem" data-id="${esc(s.id)}">
        <div data-slot="item-media" data-variant="icon">${siteIcon(s.url)}</div>
        <div data-slot="item-content">
          <div data-slot="item-title"><span title="${esc(s.url)}">${esc(host)}</span>${scope ? tag(scope) : ''}${generic ? tag('Best effort', 'title="No built-in support for this site, so results may vary"') : ''}${word}</div>
          <p data-slot="item-description">${esc(sentence)}</p>
        </div>
        <div data-slot="item-actions">
          ${needsLogin ? button({ label: 'Connect Mobbin', size: 'sm', attrs: `data-action="signin" data-key="signin:${esc(s.id)}" aria-label="Connect Mobbin"` }) : ''}
          ${switchControl(s.enabled, `data-action="toggle" data-key="toggle:${esc(s.id)}" aria-label="Daily imports from ${esc(app.labelFor(s))}"`)}
          ${button({ variant: 'ghost', size: 'icon-sm', iconStart: 'OverflowMenuHorizontal', attrs: `data-action="menu" data-key="menu:${esc(s.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(app.labelFor(s))}"` })}
        </div>
      </div>`;
    }).join(''));
  }

  // ---- Dropdown menu ----

  let openMenu = null;

  function closeMenu({ focusTrigger = true } = {}) {
    if (!openMenu) return;
    const { menu, trigger } = openMenu;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('data-popup-open');
    openMenu = null;
    if (focusTrigger && document.contains(trigger)) trigger.focus();
  }

  // items: {label, icon, variant, separator, run}. Opens under the trigger, aligned to its end.
  function showMenu(menu, trigger, items) {
    closeMenu({ focusTrigger: false });
    menu.innerHTML = items.map((it, i) => `${it.separator ? '<div data-slot="dropdown-menu-separator" role="separator"></div>' : ''}<button type="button" role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" class="menu-row" data-index="${i}" ${it.variant ? `data-variant="${it.variant}"` : ''}>${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('');
    menu.hidden = false;
    const r = trigger.getBoundingClientRect();
    const gap = 4;
    const below = r.bottom + gap + menu.offsetHeight <= window.innerHeight - 8;
    menu.dataset.side = below ? 'bottom' : 'top';
    menu.style.top = `${below ? r.bottom + gap : Math.max(8, r.top - gap - menu.offsetHeight)}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.setAttribute('data-starting-style', '');
    requestAnimationFrame(() => menu.removeAttribute('data-starting-style'));
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('data-popup-open', '');
    openMenu = { menu, trigger, items };
    // Next frame, so the Enter or Space that opened the menu is not delivered to its first item.
    requestAnimationFrame(() => openMenu && openMenu.menu === menu && highlight(menu.querySelector('[role="menuitem"]')));
  }

  function highlight(item) {
    if (!openMenu || !item) return;
    openMenu.menu.querySelectorAll('[data-highlighted]').forEach((el) => el.removeAttribute('data-highlighted'));
    item.setAttribute('data-highlighted', '');
    item.focus({ preventScroll: true });
  }

  function wireMenu(menu) {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[role="menuitem"]');
      if (!item || !openMenu) return;
      const { run } = openMenu.items[Number(item.dataset.index)];
      closeMenu();
      run();
    });
    menu.addEventListener('mousemove', (e) => {
      const item = e.target.closest('[role="menuitem"]');
      if (item && !item.hasAttribute('data-highlighted')) highlight(item);
    });
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') highlight(items[(at + 1) % items.length]);
      else if (e.key === 'ArrowUp') highlight(items[(at - 1 + items.length) % items.length]);
      else if (e.key === 'Home') highlight(items[0]);
      else if (e.key === 'End') highlight(items[items.length - 1]);
      else if (e.key === 'Escape') closeMenu();
      else if (e.key === 'Tab') return closeMenu();
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function copyText(text) {
    if (eagle.clipboard && eagle.clipboard.writeText) eagle.clipboard.writeText(text);
    else navigator.clipboard.writeText(text);
  }

  function sourceMenu(app, source, trigger) {
    showMenu($('rowMenu'), trigger, [
      { label: 'Run now', icon: 'Play', run: () => startRun(app, source.id, null) },
      ...(app.adapterFor(source.url).requiresLogin ? [
        { label: 'Connect Mobbin', icon: 'Launch', run: () => signIn(app) },
        { label: 'Disconnect Mobbin MCP', run: () => signOut(app) },
      ] : []),
      { label: 'Copy link', icon: 'Copy', run: () => copyText(source.url) },
      { label: 'Open site', icon: 'Launch', run: () => (eagle.shell ? eagle.shell.openExternal(source.url) : window.open(source.url)) },
      { label: 'Remove source', icon: 'TrashCan', variant: 'destructive', separator: true, run: () => removeSource(app, source) },
    ]);
    $('rowMenu').setAttribute('aria-label', `Actions for ${app.labelFor(source)}`);
  }

  // ---- Toasts ----

  const TOAST_MARK = { success: 'ok', fail: 'fail' };
  function toast({ kind = 'default', title, text = '', action, onAction, duration = 6000 }) {
    const el = document.createElement('div');
    el.dataset.slot = 'toast';
    el.className = 'overlay';
    el.setAttribute('role', kind === 'fail' ? 'alert' : 'status');
    el.innerHTML = `<div data-slot="toast-content">${TOAST_MARK[kind] ? statusMark(TOAST_MARK[kind]) : ''}
        <div data-slot="toast-text"><div data-slot="toast-title">${esc(title)}</div><div data-slot="toast-description">${esc(text)}</div></div></div>
      ${action ? button({ label: action, size: 'sm', attrs: 'data-part="action"' }) : ''}
      ${button({ variant: 'ghost', size: 'icon-sm', iconStart: 'Close', attrs: 'data-part="close" aria-label="Dismiss"' })}
      ${duration ? `<span data-slot="toast-timer" style="--toast-ms:${duration}ms"></span>` : ''}`;
    const close = () => el.remove();
    el.addEventListener('click', (e) => {
      const part = e.target.closest('[data-part]');
      if (!part) return;
      if (part.dataset.part === 'action') onAction();
      close();
    });
    el.addEventListener('animationend', (e) => {
      if (e.target.dataset.slot === 'toast-timer') close();
    });
    el.setAttribute('data-starting-style', '');
    $('toasts').prepend(el);
    requestAnimationFrame(() => el.removeAttribute('data-starting-style'));
    while ($('toasts').children.length > 4) $('toasts').lastElementChild.remove();
  }

  // ---- Dialog: the in-window confirm main.js asks for ----

  function confirmInWindow({ title, rows = [], detail = '', confirmLabel = 'OK' }) {
    return new Promise((resolve) => {
      const dialog = $('dialog');
      const content = dialog.querySelector('[data-slot="dialog-content"]');
      const overlay = dialog.querySelector('[data-slot="dialog-overlay"]');
      const returnTo = document.activeElement;
      closeMenu({ focusTrigger: false });
      $('dialogTitle').textContent = title;
      $('dialogTitle').title = title;
      $('dialogRows').innerHTML = rows.map((r) => `<div data-slot="data-list-item"><dt data-slot="data-list-label">${esc(r.label)}</dt><dd data-slot="data-list-value">${esc(r.value)}</dd></div>`).join('');
      $('dialogRows').hidden = !rows.length;
      $('dialogDetail').textContent = detail;
      $('dialogConfirm').querySelector('[data-slot="button-text"]').textContent = confirmLabel;
      dialog.hidden = false;
      overlay.setAttribute('data-starting-style', '');
      requestAnimationFrame(() => overlay.removeAttribute('data-starting-style'));
      $('dialogConfirm').focus();
      const done = (ok) => {
        dialog.hidden = true;
        dialog.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        // Back to where focus was, or to Run now when that control went away or is off during the run.
        const back = returnTo && returnTo !== document.body && document.contains(returnTo) && !returnTo.disabled ? returnTo : $('runAll');
        back.focus();
        resolve(ok);
      };
      const onClick = (e) => {
        if (e.target === overlay || e.target.closest('#dialogCancel')) done(false);
        else if (e.target.closest('#dialogConfirm')) done(true);
      };
      // Escape cancels; Tab stays inside the dialog.
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        } else if (e.key === 'Tab') {
          const stops = [...content.querySelectorAll('button:not(:disabled)')];
          const at = stops.indexOf(document.activeElement);
          const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
          e.preventDefault();
          stops[next].focus();
        }
      };
      dialog.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function announceRun(app, results, { manual }) {
    if (!manual) return;
    const posts = results.reduce((x, r) => x + (r.posts || 0), 0);
    const failed = results.filter((r) => r.error);
    const stopped = results.some((r) => r.stopped);
    if (posts) {
      const from = results.filter((r) => r.posts).map((r) => r.label);
      const latest = app.store.library(app.libraryPath()).activity[0];
      toast({
        kind: 'success',
        title: `${plural(posts, 'design')} imported`,
        text: `From ${from.join(', ')}. ${stopped ? 'Stopped early; run again to continue.' : 'They are in Uncategorized.'}`,
        action: latest ? 'Show' : null,
        onAction: () => eagle.item.open(latest.itemId),
      });
    } else if (!failed.length) {
      toast({ title: stopped ? 'Stopped' : 'No new designs', text: stopped ? 'Run again to continue where it left off.' : 'Every source is up to date.' });
    }
    for (const r of failed) {
      toast({ kind: 'fail', title: `${r.label} failed`, text: r.error, action: 'Try again', onAction: () => startRun(app, r.sourceId, lastRunDays), duration: 0 });
    }
  }

  // ---- Actions ----

  let mobbinReturnTo = null;
  let checkingMobbin = false;

  function openMobbinLogin() {
    if (!$('mobbinLogin').hidden) return;
    mobbinReturnTo = document.activeElement;
    closeMenu({ focusTrigger: false });
    document.querySelector('.page').inert = true;
    $('toasts').inert = true;
    $('mobbinLogin').hidden = false;
    $('mobbinLoginStatus').textContent = 'Connecting to Mobbin...';
    $('mobbinLoginStatus').setAttribute('role', 'status');
    $('mobbinLoginClose').focus();
  }

  function closeMobbinLogin(app) {
    if (app) app.mobbin.cancelSignIn();
    $('mobbinLogin').hidden = true;
    document.querySelector('.page').inert = false;
    $('toasts').inert = false;
    const previousKey = mobbinReturnTo && mobbinReturnTo.dataset.key;
    const target = previousKey ? document.querySelector(`[data-key="${CSS.escape(previousKey)}"]`) : mobbinReturnTo;
    (target && document.contains(target) && !target.disabled ? target : $('runAll')).focus();
  }

  function mobbinLoginMessage(text, failed = false) {
    $('mobbinLoginStatus').textContent = text;
    $('mobbinLoginStatus').setAttribute('role', failed ? 'alert' : 'status');
  }

  async function checkMobbinLogin(app) {
    if (checkingMobbin) return;
    checkingMobbin = true;
    const button = $('mobbinLoginCheck');
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    mobbinLoginMessage('Checking your Mobbin MCP connection...');
    try {
      await app.mobbin.checkLogin();
      await app.mobbinWebsite.checkLogin();
      closeMobbinLogin(app);
      toast({ kind: 'success', title: 'Connected to Mobbin', text: 'Run the Mobbin source to import all screens and animations from one iOS app.' });
    } catch (error) {
      mobbinLoginMessage(error.message, true);
    } finally {
      checkingMobbin = false;
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
    }
  }

  async function signIn(app) {
    if (app.state.running) return toast({ title: 'A run is in progress', text: 'Finish or stop the run before changing your Mobbin login.' });
    if (app.mobbin.connecting) return;
    openMobbinLogin();
    try {
      if (!app.mobbin.connected) await app.mobbin.signIn();
      if ($('mobbinLogin').hidden) return;
      mobbinLoginMessage('Pairing Chrome with your existing Mobbin login. Once paired, choose Check connection.');
      await app.mobbinWebsite.connect();
    } catch (error) {
      if (!$('mobbinLogin').hidden) mobbinLoginMessage(error.message, true);
    }
  }

  async function signOut(app) {
    if (app.state.running) return toast({ title: 'A run is in progress', text: 'Finish or stop the run before signing out of Mobbin.' });
    try {
      await app.mobbin.signOut();
      toast({ title: 'Disconnected Mobbin MCP', text: 'The plugin’s saved authorization has been removed.' });
    } catch (error) {
      toast({ kind: 'fail', title: 'Could not disconnect Mobbin MCP', text: error.message });
    }
  }

  function startRun(app, ids, days) {
    if (!$('mobbinLogin').hidden || app.state.running || $('runAll').getAttribute('aria-disabled') === 'true' && ids === null) return;
    lastRunDays = days;
    app.runNow(ids, days);
  }

  function removeSource(app, source) {
    const index = app.store.data.sources.indexOf(source);
    app.removeSource(source.id);
    toast({ title: `Removed ${app.labelFor(source)}`, action: 'Undo', onAction: () => app.restoreSource(source, index), duration: 10000 });
  }

  function addSource(app, raw) {
    const error = $('addError');
    const field = $('addField');
    try {
      const value = raw.trim();
      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      // URL() takes "https://not a link"; a site needs a dotted host and no spaces.
      if (!value || /\s/.test(value) || !new URL(url).hostname.includes('.')) throw new TypeError('not a link');
      const source = app.addSource(url);
      error.hidden = true;
      field.removeAttribute('data-invalid');
      $('addUrl').removeAttribute('aria-invalid');
      return source;
    } catch (err) {
      error.textContent = err instanceof TypeError ? 'Enter a website link, such as https://recent.design.' : `${err.message}.`;
      error.hidden = false;
      field.setAttribute('data-invalid', '');
      $('addUrl').setAttribute('aria-invalid', 'true');
      return null;
    }
  }

  // ---- Wiring ----

  function render(app) {
    renderHeader(app);
    renderAlerts(app);
    renderOverview(app);
    renderTabs(app);
    renderImports(app);
    renderSources(app);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = eagle.app.isDarkColors() ? 'dark' : 'light';
  }

  function init(app) {
    applyTheme();
    eagle.onThemeChanged(applyTheme);
    app.onChange(() => render(app));
    app.onRunDone((results, opts) => announceRun(app, results, opts));
    app.setConfirm(confirmInWindow);
    $('mobbinLoginClose').addEventListener('click', () => closeMobbinLogin(app));
    $('mobbinBridgeFolder').addEventListener('click', () => app.openMobbinBridgeFolder());
    $('mobbinChromePair').addEventListener('click', () => app.mobbinWebsite.connect().catch((error) => mobbinLoginMessage(error.message, true)));
    $('mobbinLoginCheck').addEventListener('click', () => checkMobbinLogin(app));
    $('mobbinLogin').addEventListener('click', (event) => {
      if (event.target.dataset.slot === 'dialog-overlay') closeMobbinLogin(app);
    });
    $('mobbinLogin').addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMobbinLogin(app); }
      if (event.key === 'Tab') {
        const stops = [...$('mobbinLogin').querySelectorAll('button')];
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    eagle.onPluginShow(() => render(app));
    setInterval(() => render(app), 60e3);
    if (!app.store.data.sources.length) activeTab = 'sources';

    // Favicons that fail fall back to the site's first letter and aren't requested again.
    document.addEventListener('error', (e) => {
      if (!e.target.classList || !e.target.classList.contains('favicon')) return;
      noFavicon.add(e.target.dataset.origin);
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.setAttribute('aria-hidden', 'true');
      letter.textContent = new URL(e.target.dataset.origin).hostname.replace(/^www\./, '')[0];
      e.target.replaceWith(letter);
    }, true);

    $('runAll').addEventListener('click', () => startRun(app, null, null));
    $('olderBtn').addEventListener('click', (e) => {
      if (openMenu && openMenu.trigger === e.currentTarget) return closeMenu();
      showMenu($('olderMenu'), e.currentTarget, app.rangeOptions.filter((o) => o.days !== null).map((o) => ({
        label: o.days === 'all' ? 'Import all time' : `Import the ${o.label.toLowerCase()}`,
        separator: o.days === 'all',
        run: () => startRun(app, null, o.days),
      })));
    });
    [$('olderMenu'), $('rowMenu')].forEach(wireMenu);
    document.addEventListener('mousedown', (e) => {
      if (openMenu && !openMenu.menu.contains(e.target) && !openMenu.trigger.contains(e.target)) closeMenu({ focusTrigger: false });
    });
    window.addEventListener('resize', () => closeMenu({ focusTrigger: false }));
    document.addEventListener('scroll', () => closeMenu({ focusTrigger: false }), true);

    $('alerts').addEventListener('click', (e) => {
      const retry = e.target.closest('[data-retry]');
      if (retry) startRun(app, retry.dataset.retry.split(','), null);
    });

    $('overview').addEventListener('click', (e) => {
      if (e.target.closest('#stopRun')) return app.stop();
      if (e.target.closest('[data-slot="collapsible-trigger"]')) {
        runStepsOpen = !runStepsOpen;
        renderOverview(app);
      }
    });

    document.querySelector('[data-slot="tabs-list"]').addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) selectTab(app, tab.dataset.tab);
    });
    document.querySelector('[data-slot="tabs-list"]').addEventListener('keydown', (e) => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const at = tabs.findIndex((t) => t.dataset.tab === activeTab);
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      const to = step ? tabs[(at + step + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
      if (!to) return;
      e.preventDefault();
      selectTab(app, to.dataset.tab, true);
    });

    $('imports').addEventListener('click', (e) => {
      const itemId = e.target.closest('[data-item]')?.dataset.item;
      if (itemId) return eagle.item.open(itemId);
      if (e.target.closest('#moreImports')) {
        showAllImports = !showAllImports;
        renderImports(app);
      }
    });
    $('imports').addEventListener('change', (e) => {
      if (e.target.id !== 'feedSource') return;
      feedSource = e.target.value;
      showAllImports = false;
      renderImports(app);
    });

    $('sources').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) return addSource(app, add.dataset.add);
      const control = e.target.closest('[data-action]');
      const id = e.target.closest('[data-id]')?.dataset.id;
      const source = app.store.data.sources.find((s) => s.id === id);
      if (!control || !source) return;
      if (control.dataset.action === 'signin') return signIn(app);
      if (control.dataset.action === 'toggle') app.setEnabled(id, !source.enabled);
      if (control.dataset.action === 'menu') {
        if (openMenu && openMenu.trigger === control) return closeMenu();
        sourceMenu(app, source, control);
      }
    });

    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (addSource(app, $('addUrl').value)) $('addUrl').value = '';
    });
    $('addUrl').addEventListener('input', () => {
      if ($('addError').hidden) return;
      $('addError').hidden = true;
      $('addField').removeAttribute('data-invalid');
      $('addUrl').removeAttribute('aria-invalid');
    });
    $('addField').addEventListener('mousedown', (e) => {
      if (e.target !== $('addUrl')) {
        e.preventDefault();
        $('addUrl').focus();
      }
    });

    render(app);
  }

  if (window.DS) init(window.DS);
  else window.addEventListener('ds-ready', () => init(window.DS), { once: true });
})();
