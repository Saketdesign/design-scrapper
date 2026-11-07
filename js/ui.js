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


  // The view logic lives in js/lib/ui-model.js; main.js hands it over as app.model.
  let M = null;

  // Focus helpers: a control can be gone or disabled by the time focus has to go back to it.
  const usable = (el) => Boolean(el) && document.contains(el) && !el.disabled;
  const focusedKey = (el) => (el.contains(document.activeElement) ? document.activeElement.dataset.key : null);

  function refocus(el, key) {
    if (!key) return;
    const again = el.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (usable(again)) again.focus({ preventScroll: true });
  }

  // Replaces a region's markup and puts focus back on the control that had it (matched by data-key).
  function swap(el, html) {
    const key = focusedKey(el);
    el.innerHTML = html;
    refocus(el, key);
  }

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
    const host = M.hostOf(url);
    if (noFavicon.has(origin)) return `<span class="letter" aria-hidden="true">${esc(host[0])}</span>`;
    const invert = host === 'recent.design' ? ' data-invert' : '';
    return `<img class="favicon" src="${esc(SOURCE_LOGOS[host] || `${origin}/favicon.ico`)}" alt="" data-origin="${esc(origin)}"${invert}>`;
  }

  // ---- Header ----

  function renderHeader(app) {
    const h = M.headerState(app.state.running, app.store.data.sources.some((s) => s.enabled));
    const runAll = $('runAll');
    runAll.setAttribute('aria-busy', String(h.busy));
    runAll.setAttribute('aria-disabled', String(h.blocked));
    runAll.title = h.title;
    $('olderBtn').disabled = h.blocked;
    $('olderBtn').innerHTML = `<span data-slot="button-text">Import older</span>${icon('ChevronDown')}`;
  }

  // ---- Alerts: failed sources, outside a run ----

  function alertHtml(view, running) {
    const attrs = `data-retry="${esc(view.ids.join(','))}" data-key="retry" ${running ? 'disabled' : ''}`;
    return `<div data-slot="alert" data-status="fail" role="alert">
      <div data-slot="alert-grid">
        <span data-slot="alert-status">${statusMark('fail')}<span class="sr-only">Failed</span></span>
        <p data-slot="alert-title">${esc(view.title)}</p>
        <div data-slot="alert-description">${esc(view.description)}</div>
        <div data-slot="alert-action">${button({ label: view.action, size: 'sm', attrs })}</div>
      </div></div>`;
  }

  function renderAlerts(app) {
    const { status } = app.store.library(app.libraryPath());
    const failed = M.failedSources(app.store.data.sources, status, app.state);
    const box = $('alerts');
    box.hidden = !failed.length;
    swap(box, failed.length ? alertHtml(M.alertView(failed, status, app.labelFor), app.state.running) : '');
  }

  // ---- Overview: the numbers to check first, or the run while one is going ----

  const stripCell = (label, value, unit = '') =>
    `<div data-slot="status-strip-cell"><span data-slot="status-strip-label">${esc(label)}</span>
        <span data-slot="status-strip-value">${esc(value)}${unit ? `<span data-slot="status-strip-unit">${esc(unit)}</span>` : ''}</span></div>`;

  function renderStrip(app) {
    const lib = app.store.library(app.libraryPath());
    const v = M.stripView(app.store.data.sources, lib.status, lib.activity);
    return `<div data-slot="status-strip" data-variant="framed" role="group" aria-label="Collection status"><div data-slot="status-strip-cells">
      ${stripCell('Last run', v.last)}
      ${stripCell('Next run', v.next)}
      ${stripCell('Last 7 days', v.week, v.unit)}
    </div></div>`;
  }

  const stepLabel = (app, id) => {
    const source = app.store.data.sources.find((s) => s.id === id);
    return source ? app.labelFor(source) : 'Removed source';
  };

  function progressHtml(view) {
    const { determinate, pct, value } = M.progressOf(view);
    const name = esc(view.label || view.title);
    const attrs = determinate
      ? `aria-valuemin="0" aria-valuemax="${view.total}" aria-valuenow="${view.now}" aria-valuetext="${esc(value)}"`
      : 'data-indeterminate aria-valuetext="In progress"';
    return `<div data-slot="progress" role="progressbar" aria-label="${name}" ${attrs}>
        <span data-slot="progress-label">${name}</span>
        <span data-slot="progress-value">${determinate ? esc(value) : '<span class="pending"></span>'}</span>
        <span data-slot="progress-track"><span data-slot="progress-indicator" style="--progress:${pct}%"></span></span>
      </div>`;
  }

  const stepRow = (s) => `<div data-slot="item" data-size="sm" role="listitem">
              <div data-slot="item-content"><div data-slot="item-title"><span>${esc(s.label)}</span></div></div>
              <div data-slot="item-actions">${statusTag(s.status, s.value)}</div></div>`;

  function stepsHtml(st, steps) {
    const open = runStepsOpen;
    return `<div data-slot="collapsible">
          <button type="button" data-slot="collapsible-trigger" data-key="steps" aria-expanded="${open}" aria-controls="runSteps" ${open ? 'data-panel-open' : ''}>
            ${icon('ChevronRight')}<span>Each source</span><span data-slot="collapsible-summary">${M.stepsSummary(st, steps)}</span>
          </button>
          <div id="runSteps" data-slot="item-group" data-variant="plain" class="run-steps" role="list" ${open ? '' : 'hidden'}>
            ${steps.map(stepRow).join('')}
          </div>
        </div>`;
  }

  function runFooter(st) {
    const stopping = st.stopRequested;
    return `<footer data-slot="frame-footer">
        <span data-slot="frame-meta">${stopping ? 'Stopping after this design' : 'Stop keeps what is imported'}</span>
        ${button({ label: stopping ? 'Stopping' : 'Stop run', size: 'sm', attrs: `id="stopRun" data-key="stop" ${stopping ? 'disabled' : ''}` })}
      </footer>`;
  }

  const runTag = (confirming) => statusTag(confirming ? 'paused' : 'running', confirming ? 'Waiting' : 'Running');

  function renderRun(app) {
    const st = app.state;
    const current = app.store.data.sources.find((s) => s.id === st.current);
    const view = M.runView(st, current ? app.labelFor(current) : '');
    const steps = st.queue.map((id) => M.stepFor(st, stepLabel(app, id), id));
    return `<section data-slot="frame" class="frame" aria-labelledby="runTitle">
      <header data-slot="frame-header" class="panel-head">
        <h2 id="runTitle" data-slot="frame-title">${esc(view.title)}</h2>
        ${runTag(st.phase === 'confirming')}
      </header>
      <div data-slot="frame-body" data-padding="default">
        ${progressHtml(view)}
        <p data-slot="frame-description" aria-live="polite">${esc(view.sentence)}</p>
        ${stepsHtml(st, steps)}
      </div>
      ${runFooter(st)}
    </section>`;
  }

  function renderOverview(app) {
    const box = $('overview');
    box.hidden = !app.state.running && !app.store.data.sources.length;
    swap(box, app.state.running ? renderRun(app) : box.hidden ? '' : renderStrip(app));
  }

  // ---- Tabs ----

  function paintTab(tab) {
    const on = tab.dataset.tab === activeTab;
    tab.toggleAttribute('data-active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !on;
  }

  function renderTabs(app) {
    const { activity } = app.store.library(app.libraryPath());
    $('importsCount').textContent = M.countText(activity.length);
    $('sourcesCount').textContent = M.countText(app.store.data.sources.length);
    document.querySelectorAll('[data-slot="tabs-trigger"]').forEach(paintTab);
  }

  function selectTab(app, name, focus) {
    activeTab = name;
    renderTabs(app);
    if (focus) $(`tab-${name}`).focus();
  }

  // ---- Imports ----

  const EMPTY_IMPORTS = `<div data-slot="empty" data-reason="empty" class="frame">
        <span data-slot="empty-icon" aria-hidden="true">${icon('Download')}</span>
        <div data-slot="empty-header">
          <h3 data-slot="empty-title">Nothing imported yet</h3>
          <p data-slot="empty-description">Run now checks every source for new designs. Otherwise the daily run picks them up while Eagle is open.</p>
        </div></div>`;

  function filterHtml(view) {
    const options = view.sources.map(([id, label]) => `<option value="${esc(id)}" ${id === view.feed ? 'selected' : ''}>${esc(label)}</option>`);
    return `<div data-slot="native-select" data-size="sm" class="imports-filter">
          <select data-slot="native-select-control" class="field" id="feedSource" data-key="feed" aria-label="Show imports from">
            <option value="">All sources</option>
            ${options.join('')}
          </select>${icon('ChevronSort')}</div>`;
  }

  const importRow = (a) => `<div data-slot="item" role="listitem">
        <div data-slot="item-content">
          <div data-slot="item-title"><button type="button" data-slot="item-link" data-control data-item="${esc(a.itemId)}" data-key="item:${esc(a.itemId)}" title="Show in Eagle">${esc(a.title)}</button></div>
          <p data-slot="item-description">${esc(a.label)}${a.count > 1 ? `, ${a.count} files` : ''}</p>
        </div>
        <div data-slot="item-meta"><time datetime="${new Date(a.at).toISOString()}">${esc(M.whenOf(a.at))}</time></div>
      </div>`;

  function moreHtml(view) {
    const meta = showAllImports ? `All ${M.n(view.list.length)}` : `${view.shown.length} of ${M.n(view.list.length)}`;
    return `<footer data-slot="frame-footer">
          <span data-slot="frame-meta">${meta}</span>
          ${button({ label: showAllImports ? 'Show fewer' : 'Show all', variant: 'ghost', size: 'sm', attrs: 'id="moreImports" data-key="more"' })}
        </footer>`;
  }

  function importsFrame(view) {
    const filter = view.sources.length > 1 ? filterHtml(view) : '';
    const more = view.list.length > IMPORTS_SHOWN ? moreHtml(view) : '';
    return `<section data-slot="frame" class="frame" aria-labelledby="importsTitle">
      <header data-slot="frame-header" class="panel-head">
        <h2 id="importsTitle" data-slot="frame-title">Recent imports</h2>${filter}
      </header>
      <div data-slot="frame-body" data-padding="none"><div data-slot="item-group" data-variant="plain" role="list">${view.shown.map(importRow).join('')}</div></div>
      ${more}
    </section>`;
  }

  function renderImports(app) {
    const { activity } = app.store.library(app.libraryPath());
    if (!activity.length) return swap($('imports'), EMPTY_IMPORTS);
    const view = M.importsView(activity, feedSource, showAllImports, IMPORTS_SHOWN);
    feedSource = view.feed;
    swap($('imports'), importsFrame(view));
  }

  // ---- Sources ----

  // The Mobbin source also reports which app it is on today; other sources have no such state.
  function dailyOf(app, adapter, url) {
    return adapter.id === 'mobbin' && !adapter.isAnimations(url) ? app.store.library(app.libraryPath()).mobbinDaily : null;
  }

  const scopeTag = (adapter, url) => {
    const scope = adapter.scopeFor ? adapter.scopeFor(url) : M.scopeOf(url);
    return scope ? tag(scope) : '';
  };
  const bestEffortTag = (adapter) => (adapter.id === 'generic' ? tag('Best effort', 'title="No built-in support for this site, so results may vary"') : '');
  const statusHtml = (status) => (status ? statusTag(status.kind, status.word) : '');

  function rowTitle(source, adapter, status) {
    return `<span title="${esc(source.url)}">${esc(M.hostOf(source.url))}</span>${scopeTag(adapter, source.url)}${bestEffortTag(adapter)}${statusHtml(status)}`;
  }

  function rowActions(app, source, adapter) {
    const name = esc(app.labelFor(source));
    const connect = adapter.requiresLogin ? button({ label: 'Connect Mobbin', size: 'sm', attrs: `data-action="signin" data-key="signin:${esc(source.id)}" aria-label="Connect Mobbin"` }) : '';
    const toggle = switchControl(source.enabled, `data-action="toggle" data-key="toggle:${esc(source.id)}" aria-label="Daily imports from ${name}"`);
    const more = button({ variant: 'ghost', size: 'icon-sm', iconStart: 'OverflowMenuHorizontal', attrs: `data-action="menu" data-key="menu:${esc(source.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${name}"` });
    return `${connect}${toggle}${more}`;
  }

  function sourceRow(app, lib, source) {
    const adapter = app.adapterFor(source.url);
    const view = M.sourceView({ st: app.state, source, status: lib.status[source.id], daily: dailyOf(app, adapter, source.url) });
    return `<div data-slot="item" role="listitem" data-id="${esc(source.id)}">
        <div data-slot="item-media" data-variant="icon">${siteIcon(source.url)}</div>
        <div data-slot="item-content">
          <div data-slot="item-title">${rowTitle(source, adapter, view.status)}</div>
          <p data-slot="item-description">${esc(view.sentence)}</p>
        </div>
        <div data-slot="item-actions">${rowActions(app, source, adapter)}</div>
      </div>`;
  }

  const suggestionRow = (d) => `<div data-slot="item" role="listitem">
          <div data-slot="item-media" data-variant="icon">${siteIcon(d.url)}</div>
          <div data-slot="item-content"><div data-slot="item-title"><span>${esc(M.hostOf(d.url))}</span></div></div>
          <div data-slot="item-actions">${button({ label: 'Add', size: 'sm', attrs: `data-add="${esc(d.url)}" data-key="add:${esc(d.url)}"` })}</div>
        </div>`;

  function emptySources(app) {
    return `<div data-slot="empty" data-reason="empty" data-size="sm" role="listitem">
          <div data-slot="empty-header">
            <h3 data-slot="empty-title">No sources yet</h3>
            <p data-slot="empty-description">Add a gallery link below, or start with a built-in one. New designs arrive once a day.</p>
          </div></div>${app.defaultSources.map(suggestionRow).join('')}`;
  }

  function renderSources(app) {
    const lib = app.store.library(app.libraryPath());
    const { sources } = app.store.data;
    swap($('sources'), sources.length ? sources.map((s) => sourceRow(app, lib, s)).join('') : emptySources(app));
  }

  // ---- Dropdown menu ----

  let openMenu = null;
  const isOpenFor = (trigger) => Boolean(openMenu) && openMenu.trigger === trigger;

  function closeMenu({ focusTrigger = true } = {}) {
    if (!openMenu) return;
    const { menu, trigger } = openMenu;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('data-popup-open');
    openMenu = null;
    if (focusTrigger && document.contains(trigger)) trigger.focus();
  }

  const menuItemHtml = (it, i) => `${it.separator ? '<div data-slot="dropdown-menu-separator" role="separator"></div>' : ''}<button type="button" role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" class="menu-row" data-index="${i}" ${it.variant ? `data-variant="${it.variant}"` : ''}>${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`;

  function placeMenu(menu, trigger) {
    const size = { width: menu.offsetWidth, height: menu.offsetHeight };
    const place = M.menuPlacement(trigger.getBoundingClientRect(), size, { width: window.innerWidth, height: window.innerHeight });
    menu.dataset.side = place.side;
    menu.style.top = `${place.top}px`;
    menu.style.left = `${place.left}px`;
  }

  // items: {label, icon, variant, separator, run}. Opens under the trigger, aligned to its end.
  function showMenu(menu, trigger, items) {
    closeMenu({ focusTrigger: false });
    menu.innerHTML = items.map(menuItemHtml).join('');
    menu.hidden = false;
    placeMenu(menu, trigger);
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

  // Escape closes and is swallowed; Tab closes and moves on. True when the key was handled here.
  const MENU_CLOSE_KEYS = new Map([['Escape', true], ['Tab', false]]);

  function handleMenuKey(menu, e) {
    if (MENU_CLOSE_KEYS.has(e.key)) {
      closeMenu();
      return MENU_CLOSE_KEYS.get(e.key);
    }
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const to = M.navIndex(e.key, items.indexOf(document.activeElement), items.length);
    if (to === null) return false;
    highlight(items[to]);
    return true;
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
      if (!handleMenuKey(menu, e)) return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function copyText(text) {
    if (eagle.clipboard && eagle.clipboard.writeText) eagle.clipboard.writeText(text);
    else navigator.clipboard.writeText(text);
  }

  const openSite = (url) => (eagle.shell ? eagle.shell.openExternal(url) : window.open(url));

  const mobbinMenuItems = (app) => [
    { label: 'Connect Mobbin', icon: 'Launch', run: () => signIn(app) },
    { label: 'Disconnect Mobbin MCP', run: () => signOut(app) },
  ];

  function sourceMenu(app, source, trigger) {
    const login = app.adapterFor(source.url).requiresLogin ? mobbinMenuItems(app) : [];
    showMenu($('rowMenu'), trigger, [
      { label: 'Run now', icon: 'Play', run: () => startRun(app, source.id, null) },
      ...login,
      { label: 'Copy link', icon: 'Copy', run: () => copyText(source.url) },
      { label: 'Open site', icon: 'Launch', run: () => openSite(source.url) },
      { label: 'Remove source', icon: 'TrashCan', variant: 'destructive', separator: true, run: () => removeSource(app, source) },
    ]);
    $('rowMenu').setAttribute('aria-label', `Actions for ${app.labelFor(source)}`);
  }

  // ---- Toasts ----

  const TOAST_MARK = { success: 'ok', fail: 'fail' };
  const toastMark = (kind) => (TOAST_MARK[kind] ? statusMark(TOAST_MARK[kind]) : '');
  const toastAction = (action) => (action ? button({ label: action, size: 'sm', attrs: 'data-part="action"' }) : '');
  const toastTimer = (duration) => (duration ? `<span data-slot="toast-timer" style="--toast-ms:${duration}ms"></span>` : '');

  function toastHtml({ kind, title, text, action, duration }) {
    return `<div data-slot="toast-content">${toastMark(kind)}
        <div data-slot="toast-text"><div data-slot="toast-title">${esc(title)}</div><div data-slot="toast-description">${esc(text)}</div></div></div>
      ${toastAction(action)}
      ${button({ variant: 'ghost', size: 'icon-sm', iconStart: 'Close', attrs: 'data-part="close" aria-label="Dismiss"' })}
      ${toastTimer(duration)}`;
  }

  function toast({ kind = 'default', title, text = '', action, onAction, duration = 6000 }) {
    const el = document.createElement('div');
    el.dataset.slot = 'toast';
    el.className = 'overlay';
    el.setAttribute('role', kind === 'fail' ? 'alert' : 'status');
    el.innerHTML = toastHtml({ kind, title, text, action, duration });
    el.addEventListener('click', (e) => {
      const part = e.target.closest('[data-part]');
      if (!part) return;
      if (part.dataset.part === 'action') onAction();
      el.remove();
    });
    el.addEventListener('animationend', (e) => {
      if (e.target.dataset.slot === 'toast-timer') el.remove();
    });
    el.setAttribute('data-starting-style', '');
    $('toasts').prepend(el);
    requestAnimationFrame(() => el.removeAttribute('data-starting-style'));
    while ($('toasts').children.length > 4) $('toasts').lastElementChild.remove();
  }

  // ---- Dialog: the in-window confirm main.js asks for ----

  const dialogRow = (r) => `<div data-slot="data-list-item"><dt data-slot="data-list-label">${esc(r.label)}</dt><dd data-slot="data-list-value">${esc(r.value)}</dd></div>`;

  function fillDialog({ title, rows, detail, confirmLabel }) {
    $('dialogTitle').textContent = title;
    $('dialogTitle').title = title;
    $('dialogRows').innerHTML = rows.map(dialogRow).join('');
    $('dialogRows').hidden = !rows.length;
    $('dialogDetail').textContent = detail;
    $('dialogConfirm').querySelector('[data-slot="button-text"]').textContent = confirmLabel;
  }

  // Tab stays inside the dialog.
  function trapTab(e, content) {
    const stops = [...content.querySelectorAll('button:not(:disabled)')];
    const to = M.tabStop(stops.indexOf(document.activeElement), stops.length, e.shiftKey);
    e.preventDefault();
    stops[to].focus();
  }

  function confirmInWindow({ title, rows = [], detail = '', confirmLabel = 'OK' }) {
    return new Promise((resolve) => {
      const dialog = $('dialog');
      const content = dialog.querySelector('[data-slot="dialog-content"]');
      const overlay = dialog.querySelector('[data-slot="dialog-overlay"]');
      const returnTo = document.activeElement;
      closeMenu({ focusTrigger: false });
      fillDialog({ title, rows, detail, confirmLabel });
      dialog.hidden = false;
      overlay.setAttribute('data-starting-style', '');
      requestAnimationFrame(() => overlay.removeAttribute('data-starting-style'));
      $('dialogConfirm').focus();
      const done = (ok) => {
        dialog.hidden = true;
        dialog.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        // Back to where focus was, or to Run now when that control went away or is off during the run.
        (returnTo !== document.body && usable(returnTo) ? returnTo : $('runAll')).focus();
        resolve(ok);
      };
      const onClick = (e) => {
        if (e.target === overlay || e.target.closest('#dialogCancel')) done(false);
        else if (e.target.closest('#dialogConfirm')) done(true);
      };
      // Escape cancels.
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        } else if (e.key === 'Tab') trapTab(e, content);
      };
      dialog.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function announceRun(app, results, { manual }) {
    if (!manual) return;
    const latest = app.store.library(app.libraryPath()).activity[0];
    for (const t of M.runToasts(results, latest)) {
      const onAction = () => ('retry' in t ? startRun(app, t.retry, lastRunDays) : eagle.item.open(t.open));
      toast({ ...t, onAction });
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

  // Back to the control that opened the login, found again by data-key since the list re-renders.
  function restoreFocus() {
    const key = mobbinReturnTo && mobbinReturnTo.dataset.key;
    const target = key ? document.querySelector(`[data-key="${CSS.escape(key)}"]`) : mobbinReturnTo;
    (usable(target) ? target : $('runAll')).focus();
  }

  function closeMobbinLogin(app) {
    if (app) app.mobbin.cancelSignIn();
    $('mobbinLogin').hidden = true;
    document.querySelector('.page').inert = false;
    $('toasts').inert = false;
    restoreFocus();
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

  async function pairMobbin(app) {
    if (!app.mobbin.connected) await app.mobbin.signIn();
    if ($('mobbinLogin').hidden) return;
    mobbinLoginMessage('Pairing Chrome with your existing Mobbin login. Once paired, choose Check connection.');
    await app.mobbinWebsite.connect();
  }

  function showLoginError(error) {
    if (!$('mobbinLogin').hidden) mobbinLoginMessage(error.message, true);
  }

  async function signIn(app) {
    if (app.state.running) return toast({ title: 'A run is in progress', text: 'Finish or stop the run before changing your Mobbin login.' });
    if (app.mobbin.connecting) return;
    openMobbinLogin();
    await pairMobbin(app).catch(showLoginError);
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

  const loginOpen = () => !$('mobbinLogin').hidden;
  const runAllDisabled = () => $('runAll').getAttribute('aria-disabled') === 'true';
  const runBlocked = (app, ids) => loginOpen() || app.state.running || (ids === null && runAllDisabled());

  function startRun(app, ids, days) {
    if (runBlocked(app, ids)) return;
    lastRunDays = days;
    app.runNow(ids, days);
  }

  function removeSource(app, source) {
    const index = app.store.data.sources.indexOf(source);
    app.removeSource(source.id);
    toast({ title: `Removed ${app.labelFor(source)}`, action: 'Undo', onAction: () => app.restoreSource(source, index), duration: 10000 });
  }

  // message: the error text to show under the field, or null to clear it.
  function setAddError(message) {
    const bad = message !== null;
    $('addError').hidden = !bad;
    if (bad) $('addError').textContent = message;
    $('addField').toggleAttribute('data-invalid', bad);
    if (bad) $('addUrl').setAttribute('aria-invalid', 'true');
    else $('addUrl').removeAttribute('aria-invalid');
  }

  function addSource(app, raw) {
    try {
      const source = app.addSource(M.normalizeSourceUrl(raw));
      setAddError(null);
      return source;
    } catch (err) {
      setAddError(M.addErrorText(err));
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

  function onLoginKey(app, event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobbinLogin(app);
    } else if (event.key === 'Tab') trapLoginEdges(event);
  }

  function trapLoginEdges(event) {
    const stops = [...$('mobbinLogin').querySelectorAll('button')];
    const to = M.edgeWrap(event.shiftKey, stops.indexOf(document.activeElement), stops.length);
    if (to === null) return;
    event.preventDefault();
    stops[to].focus();
  }

  function wireMobbinLogin(app) {
    $('mobbinLoginClose').addEventListener('click', () => closeMobbinLogin(app));
    $('mobbinBridgeFolder').addEventListener('click', () => app.openMobbinBridgeFolder());
    $('mobbinChromePair').addEventListener('click', () => app.mobbinWebsite.connect().catch((error) => mobbinLoginMessage(error.message, true)));
    $('mobbinLoginCheck').addEventListener('click', () => checkMobbinLogin(app));
    $('mobbinLogin').addEventListener('click', (event) => {
      if (event.target.dataset.slot === 'dialog-overlay') closeMobbinLogin(app);
    });
    $('mobbinLogin').addEventListener('keydown', (event) => onLoginKey(app, event));
  }

  // Favicons that fail fall back to the site's first letter and aren't requested again.
  function onFaviconError(e) {
    if (!e.target.classList || !e.target.classList.contains('favicon')) return;
    noFavicon.add(e.target.dataset.origin);
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.setAttribute('aria-hidden', 'true');
    letter.textContent = M.hostOf(e.target.dataset.origin)[0];
    e.target.replaceWith(letter);
  }

  const olderItems = (app) =>
    app.rangeOptions.filter((o) => o.days !== null).map((o) => ({
      label: o.days === 'all' ? 'Import all time' : `Import the ${o.label.toLowerCase()}`,
      separator: o.days === 'all',
      run: () => startRun(app, null, o.days),
    }));

  function wireMenus(app) {
    $('olderBtn').addEventListener('click', (e) => {
      if (isOpenFor(e.currentTarget)) return closeMenu();
      showMenu($('olderMenu'), e.currentTarget, olderItems(app));
    });
    [$('olderMenu'), $('rowMenu')].forEach(wireMenu);
    document.addEventListener('mousedown', (e) => {
      if (openMenu && !openMenu.menu.contains(e.target) && !openMenu.trigger.contains(e.target)) closeMenu({ focusTrigger: false });
    });
    window.addEventListener('resize', () => closeMenu({ focusTrigger: false }));
    document.addEventListener('scroll', () => closeMenu({ focusTrigger: false }), true);
  }

  function wireOverview(app) {
    $('alerts').addEventListener('click', (e) => {
      const retry = e.target.closest('[data-retry]');
      if (retry) startRun(app, retry.dataset.retry.split(','), null);
    });
    $('overview').addEventListener('click', (e) => {
      if (e.target.closest('#stopRun')) return app.stop();
      if (!e.target.closest('[data-slot="collapsible-trigger"]')) return;
      runStepsOpen = !runStepsOpen;
      renderOverview(app);
    });
  }

  const TAB_KEYS = { next: 'ArrowRight', prev: 'ArrowLeft' };

  function onTabsKey(app, e) {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const at = tabs.findIndex((t) => t.dataset.tab === activeTab);
    const to = M.navIndex(e.key, at, tabs.length, TAB_KEYS);
    if (to === null) return;
    e.preventDefault();
    selectTab(app, tabs[to].dataset.tab, true);
  }

  function wireTabs(app) {
    const list = document.querySelector('[data-slot="tabs-list"]');
    list.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) selectTab(app, tab.dataset.tab);
    });
    list.addEventListener('keydown', (e) => onTabsKey(app, e));
  }

  function wireImports(app) {
    $('imports').addEventListener('click', (e) => {
      const item = e.target.closest('[data-item]');
      if (item) return eagle.item.open(item.dataset.item);
      if (!e.target.closest('#moreImports')) return;
      showAllImports = !showAllImports;
      renderImports(app);
    });
    $('imports').addEventListener('change', (e) => {
      if (e.target.id !== 'feedSource') return;
      feedSource = e.target.value;
      showAllImports = false;
      renderImports(app);
    });
  }

  const toggleSourceMenu = (app, source, control) => (isOpenFor(control) ? closeMenu() : sourceMenu(app, source, control));
  const SOURCE_ACTIONS = {
    signin: (app) => signIn(app),
    toggle: (app, source) => app.setEnabled(source.id, !source.enabled),
    menu: toggleSourceMenu,
  };

  const rowSource = (app, target) => {
    const row = target.closest('[data-id]');
    return row && app.store.data.sources.find((s) => s.id === row.dataset.id);
  };

  function runSourceAction(app, control, source) {
    const act = SOURCE_ACTIONS[control.dataset.action];
    if (act && source) act(app, source, control);
  }

  function onSourcesClick(app, e) {
    const add = e.target.closest('[data-add]');
    if (add) return addSource(app, add.dataset.add);
    const control = e.target.closest('[data-action]');
    if (control) runSourceAction(app, control, rowSource(app, e.target));
  }

  function wireSources(app) {
    $('sources').addEventListener('click', (e) => onSourcesClick(app, e));
    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (addSource(app, $('addUrl').value)) $('addUrl').value = '';
    });
    $('addUrl').addEventListener('input', () => {
      if (!$('addError').hidden) setAddError(null);
    });
    $('addField').addEventListener('mousedown', (e) => {
      if (e.target === $('addUrl')) return;
      e.preventDefault();
      $('addUrl').focus();
    });
  }

  function init(app) {
    M = app.model;
    applyTheme();
    eagle.onThemeChanged(applyTheme);
    app.onChange(() => render(app));
    app.onRunDone((results, opts) => announceRun(app, results, opts));
    app.setConfirm(confirmInWindow);
    wireMobbinLogin(app);
    eagle.onPluginShow(() => render(app));
    setInterval(() => render(app), 60e3);
    if (!app.store.data.sources.length) activeTab = 'sources';
    document.addEventListener('error', onFaviconError, true);
    $('runAll').addEventListener('click', () => startRun(app, null, null));
    wireMenus(app);
    wireOverview(app);
    wireTabs(app);
    wireImports(app);
    wireSources(app);
    render(app);
  }

  if (window.DS) init(window.DS);
  else window.addEventListener('ds-ready', () => init(window.DS), { once: true });
})();
