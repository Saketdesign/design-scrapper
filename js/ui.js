// Renders the Sources window from the shared app object created in main.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = (body, attrs = '') => `<svg viewBox="0 0 16 16"${attrs}>${body}</svg>`;
  const ICON = {
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    pause: svg('<circle cx="8" cy="8" r="6"/><path d="M6.5 6v4M9.5 6v4"/>'),
    alert: svg('<circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11h.01"/>'),
    pending: svg('<circle cx="8" cy="8" r="5.5" stroke-dasharray="2.2 2.4"/>'),
    x: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
    play: svg('<path d="M5.5 3.8l6.2 4.2-6.2 4.2z" fill="currentColor" stroke-width="1"/>'),
    chevron: svg('<path d="M4.5 6.5L8 10l3.5-3.5"/>'),
    calendar: svg('<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 7h11M5.5 2v3M10.5 2v3"/>'),
    globe: svg('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 2z"/>'),
    image: svg('<rect x="2.5" y="3" width="11" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="M13.5 10.5l-3-3-6.5 5.5"/>'),
  };
  // Spinners are re-created on every render; starting each one at the same phase keeps them from jumping.
  const spinner = () => `<svg class="spin" viewBox="0 0 16 16" style="animation-delay:-${Date.now() % 900}ms"><circle cx="8" cy="8" r="6" opacity=".25"/><path d="M8 2a6 6 0 0 1 6 6"/></svg>`;

  // Colours are handed out in source order so sites next to each other never share one.
  const SOURCE_COLORS = ['#c4a6ff', '#5eead4', '#fbbf24', '#f472b6', '#60a5fa', '#a3e635', '#fb923c'];
  const colorOf = new Map();
  function colorFor(key) {
    if (!colorOf.has(key)) colorOf.set(key, SOURCE_COLORS[colorOf.size % SOURCE_COLORS.length]);
    return colorOf.get(key);
  }

  const SUGGESTION_NOTES = {
    'recent.design': 'Recent interface designs',
    'vibrant.design': 'Curated interface feed',
    'bestdesignsonx.com': 'Best UI posts from X',
  };
  const TIPS = [
    'New designs land in Uncategorized, newest on top.',
    'Stop keeps everything imported so far.',
    'Running again continues where it left off.',
    'Each source runs once a day while Eagle is open.',
  ];

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

  const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function dayOf(t) {
    const d = new Date(t);
    const today = new Date();
    const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

  // UI-only state: selected sources, hidden sources in the imports filter, failed favicons.
  const selected = new Set();
  const hiddenInFeed = new Set();
  const noFavicon = new Set();
  let rangeValue = null;

  function tile(host, origin, { selectable = false, id = '' } = {}) {
    const icon = noFavicon.has(origin) ? '' : `<img class="favicon" src="${esc(origin)}/favicon.ico" alt="" data-origin="${esc(origin)}">`;
    const select = selectable
      ? `<input type="checkbox" class="select" data-action="select" title="Select" ${selected.has(id) ? 'checked' : ''}><span class="check">${ICON.check}</span>`
      : '';
    return `<span class="tile ${icon ? 'has-icon' : ''}" style="--c:${colorFor(host)}"><span class="letter">${esc(host[0].toUpperCase())}</span>${icon}${select}</span>`;
  }

  // ---- Sources ----

  function sourceTag(app, source, status) {
    const st = app.state;
    if (st.running && st.queue.includes(source.id) && !st.results[source.id]) {
      if (st.current === source.id) {
        const label = st.stopRequested ? 'Stopping' : st.phase === 'checking' ? 'Checking' : 'Importing';
        return `<span class="tag glow tag-run">${spinner()}${label}</span>`;
      }
      const checked = st.phase === 'checking' && st.planned[source.id] !== undefined;
      if (!checked) return `<span class="tag">${ICON.pending}Queued</span>`;
    }
    if (status && status.lastError) return `<span class="tag glow tag-error">${ICON.alert}Needs attention</span>`;
    if (!source.enabled) return `<span class="tag">${ICON.pause}Paused</span>`;
    return '';
  }

  function sourceMeta(app, source, status) {
    const st = app.state;
    const sep = '<span class="sep">·</span>';
    const num = (n) => `<span class="num">${n}</span>`;
    if (st.current === source.id) {
      const p = st.progress;
      if (st.phase === 'importing' && p && p.total) return `Importing ${num(p.done)} of ${num(p.total)} designs`;
      return 'Looking for new designs…';
    }
    const parts = [];
    if (!status || !status.lastSuccessAt) parts.push(status && status.lastError ? 'Never finished a run' : 'Not run yet');
    else parts.push(`Last run ${ago(status.lastSuccessAt)}`, `${num(status.lastImported || 0)} new`);
    if (source.enabled && !(status && status.lastError)) parts.push(`next ${nextRunIn(status)}`);
    if (app.adapterFor(source.url).id === 'generic') parts.push('<span title="No built-in support for this site, so results may vary">Best effort</span>');
    return parts.join(sep);
  }

  function renderSources(app) {
    const lib = app.store.library(app.libraryPath());
    const { sources } = app.store.data;
    const list = $('sources');
    sources.forEach((s) => colorFor(new URL(s.url).hostname.replace(/^www\./, '')));
    for (const id of selected) if (!sources.some((s) => s.id === id)) selected.delete(id);
    $('sourceCount').textContent = sources.length ? `${sources.filter((s) => s.enabled).length}/${sources.length} on` : '';
    list.classList.toggle('selecting', selected.size > 0);

    if (!sources.length) {
      const have = new Set(sources.map((s) => s.url));
      const suggestions = app.defaultSources
        .filter((d) => !have.has(d.url))
        .map((d) => {
          const url = new URL(d.url);
          const host = url.hostname.replace(/^www\./, '');
          return `<div class="suggest-card">${tile(host, url.origin)}
            <div><b>${esc(host)}</b><span class="sub">${esc(SUGGESTION_NOTES[host] || 'Built-in')}</span></div>
            <button class="btn sm" data-add="${esc(d.url)}">Add</button></div>`;
        })
        .join('');
      list.innerHTML = `<li class="empty-state"><div class="rings">${ICON.globe}</div>
        <h3>Add your first source</h3>
        <p>Paste a link to any design gallery below, or start with a built-in one. New designs arrive once a day.</p>
        ${suggestions ? `<div class="suggest">${suggestions}</div>` : ''}</li>`;
      return;
    }

    list.innerHTML = sources
      .map((s) => {
        const url = new URL(s.url);
        const host = url.hostname.replace(/^www\./, '');
        const status = lib.status[s.id];
        const pathText = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
        const alert =
          status && status.lastError && app.state.current !== s.id
            ? `<div class="row-alert"><span class="dot"></span><span class="msg" title="${esc(status.lastError)}">${esc(status.lastError)}</span>
               <button class="link-btn" data-action="run" ${app.state.running ? 'disabled' : ''}>Try again</button></div>`
            : '';
        return `<li class="source ${s.enabled ? '' : 'off'} ${selected.has(s.id) ? 'selected' : ''}" data-id="${esc(s.id)}">
          ${tile(host, url.origin, { selectable: true, id: s.id })}
          <div class="source-main">
            <div class="source-name" title="${esc(s.url)}"><span class="host">${esc(host)}</span><span class="path">${esc(pathText)}</span></div>
            <div class="source-meta">${sourceMeta(app, s, status)}</div>
            ${alert}
          </div>
          ${sourceTag(app, s, status)}
          ${app.state.running ? '' : `<button class="btn sm row-run" data-action="run" title="Run this source now">${ICON.play}Run</button>`}
          <label class="switch" title="${s.enabled ? 'Pause' : 'Resume'} daily runs for this source">
            <input type="checkbox" data-action="toggle" ${s.enabled ? 'checked' : ''}><span></span>
          </label>
        </li>`;
      })
      .join('');
  }

  function renderSelection(app) {
    const bar = $('selectionBar');
    bar.hidden = selected.size === 0;
    $('selCount').textContent = `${selected.size} selected`;
    bar.querySelector('[data-sel="run"]').disabled = app.state.running;
    bar.querySelector('[data-sel="remove"]').disabled = app.state.running;
  }

  // ---- Run panel ----

  let tipIndex = 0;
  let tipTimer = null;
  function showTip(i) {
    tipIndex = i % TIPS.length;
    $('tipDots').innerHTML = TIPS.map((_, k) => `<i class="${k === tipIndex ? 'on' : ''}"></i>`).join('');
    $('tipText').textContent = TIPS[tipIndex];
  }
  function startTips() {
    if (tipTimer) return;
    showTip(0);
    if (reduceMotion) return;
    tipTimer = setInterval(() => {
      const text = $('tipText');
      text.classList.add('out');
      setTimeout(() => {
        showTip(tipIndex + 1);
        text.classList.remove('out');
      }, 300);
    }, 6000);
  }
  function stopTips() {
    clearInterval(tipTimer);
    tipTimer = null;
  }

  function stepFor(app, id) {
    const st = app.state;
    const source = app.store.data.sources.find((s) => s.id === id);
    const label = source ? app.labelFor(source) : 'Removed source';
    const r = st.results[id];
    const planned = st.planned[id];
    if (r && r.error) return { cls: 'failed', icon: ICON.alert, label, value: 'Failed' };
    if (r) {
      const n = r.posts || 0;
      return { cls: 'done', icon: ICON.check, label, value: r.stopped ? `Stopped · ${n} new` : n ? `${n} new` : 'Up to date' };
    }
    if (st.current === id) {
      const p = st.progress;
      const value = st.phase === 'importing' && p && p.total ? `${p.done} of ${p.total}` : 'Checking…';
      return { cls: 'current', icon: spinner(), label, value };
    }
    if (planned === 0) return { cls: 'done', icon: ICON.check, label, value: 'Nothing new' };
    if (planned) return { cls: '', icon: ICON.pending, label, value: `${planned} to import` };
    return { cls: 'waiting', icon: ICON.pending, label, value: 'Queued' };
  }

  let lastStepsHtml = '';
  function renderRun(app) {
    const st = app.state;
    const panel = $('runPanel');
    if (!st.running) {
      panel.hidden = true;
      lastStepsHtml = '';
      stopTips();
      return;
    }
    panel.hidden = false;
    startTips();

    const planned = st.queue.reduce((n, id) => n + (st.planned[id] || 0), 0);
    const done = st.queue.reduce((n, id) => {
      if (st.results[id]) return n + (st.results[id].done || 0);
      if (st.current === id && st.phase === 'importing' && st.progress) return n + st.progress.done;
      return n;
    }, 0);
    const current = app.store.data.sources.find((s) => s.id === st.current);
    const checkedCount = st.queue.filter((id) => st.planned[id] !== undefined || st.results[id]).length;

    let title;
    let sub;
    if (st.stopRequested) {
      title = 'Finishing current design…';
      sub = 'Everything imported so far is kept.';
    } else if (st.phase === 'confirming') {
      title = 'Waiting for you';
      sub = `Found ${plural(planned, 'new design')}. Confirm to start importing.`;
    } else if (st.phase === 'importing') {
      title = 'Importing';
      sub = `${plural(done, 'design')} of ${planned.toLocaleString('en-US')}${current ? ` · ${app.labelFor(current)}` : ''}`;
    } else {
      title = 'Looking for new designs';
      sub = current ? `Checking ${app.labelFor(current)} · ${Math.min(checkedCount + 1, st.queue.length)} of ${st.queue.length}` : '';
    }
    $('runTitle').textContent = title;
    $('runSub').textContent = sub;

    const importing = st.phase === 'importing' && planned > 0;
    const pct = importing ? Math.round((done / planned) * 100) : null;
    $('runPct').textContent = pct === null ? '' : `${pct}%`;
    $('runBar').parentElement.classList.toggle('indeterminate', !importing);
    $('runBar').style.width = importing ? `${Math.max(pct, 2)}%` : '';

    const stepsHtml = st.queue
      .map((id) => {
        const s = stepFor(app, id);
        return `<li class="${s.cls}"><span class="step-icon">${s.icon}</span><span class="step-label">${esc(s.label)}</span><span class="step-value">${esc(s.value)}</span></li>`;
      })
      .join('');
    const key = stepsHtml.replace(/animation-delay:-\d+ms/g, '');
    if (key !== lastStepsHtml) {
      $('runSteps').innerHTML = stepsHtml;
      lastStepsHtml = key;
    }
  }

  // ---- Recent imports ----

  function feedSources(activity) {
    const seen = new Map();
    for (const a of activity) if (!seen.has(a.sourceId)) seen.set(a.sourceId, a.label);
    return [...seen].map(([id, label]) => ({ id, label }));
  }

  function renderFilter(app, activity) {
    const sources = feedSources(activity);
    for (const id of hiddenInFeed) if (!sources.some((s) => s.id === id)) hiddenInFeed.delete(id);
    $('filter').hidden = sources.length < 2;
    if (sources.length < 2) return;
    const shown = sources.filter((s) => !hiddenInFeed.has(s.id));
    $('filterBtn').innerHTML = `<span class="dots">${shown
      .slice(0, 4)
      .map((s) => `<i style="--c:${colorFor(s.label)}"></i>`)
      .join('')}</span>Sources<span class="num">${shown.length}/${sources.length}</span>${ICON.chevron}`;
    const menu = $('filterMenu');
    if (!menu.hidden) {
      menu.innerHTML = sources
        .map(
          (s) => `<label class="menu-row" data-source="${esc(s.id)}">
            <input type="checkbox" ${hiddenInFeed.has(s.id) ? '' : 'checked'}>
            <span class="dot" style="--c:${colorFor(s.label)}"></span><span class="name">${esc(s.label)}</span>
            <button type="button" class="only" data-only="${esc(s.id)}">Only</button></label>`,
        )
        .join('');
    }
  }

  function renderActivity(app) {
    const { activity } = app.store.library(app.libraryPath());
    renderFilter(app, activity);
    const box = $('activity');
    if (!activity.length) {
      box.innerHTML = `<div class="empty-state compact"><div class="rings">${ICON.image}</div>
        <h3>Nothing imported yet</h3><p>Click Run all now to fetch today’s designs, or wait for the daily run.</p></div>`;
      return;
    }
    const items = activity.filter((a) => !hiddenInFeed.has(a.sourceId)).slice(0, 40);
    if (!items.length) {
      box.innerHTML = '<div class="empty-state compact"><p>No imports from the selected sources.</p></div>';
      return;
    }
    const days = [];
    for (const a of items) {
      const label = dayOf(a.at);
      if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
      days[days.length - 1].items.push(a);
    }
    box.innerHTML = days
      .map(
        (d) => `<div class="day"><div class="day-head"><span class="rail-icon">${ICON.calendar}</span><span class="day-pill">${esc(d.label)}</span></div>
        ${d.items
          .map(
            (a) => `<div class="entry" data-item="${esc(a.itemId)}" title="Show in Eagle">
              <span class="rail-dot" style="--c:${colorFor(a.label)}"></span>
              <div class="entry-main"><div class="entry-title">${esc(a.title)}</div>
              <div class="entry-meta">${esc(a.label)}${a.count > 1 ? ` · ${a.count} files` : ''}</div></div>
              <time>${esc(timeOf(a.at))}</time></div>`,
          )
          .join('')}</div>`,
      )
      .join('');
  }

  // ---- Header ----

  const SHORT_RANGE = { null: 'New', all: 'All' };
  function buildRange(app) {
    const range = $('range');
    range.insertAdjacentHTML(
      'beforeend',
      app.rangeOptions
        .map((o) => {
          const key = String(o.days ?? null);
          return `<button type="button" role="radio" data-days="${key}" title="${esc(o.label)}">${esc(SHORT_RANGE[key] || `${o.days}d`)}</button>`;
        })
        .join(''),
    );
    range.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b || b.disabled) return;
      const d = b.dataset.days;
      rangeValue = d === 'null' ? null : d === 'all' ? 'all' : Number(d);
      placeThumb();
    });
    window.addEventListener('resize', placeThumb);
  }
  function placeThumb() {
    const range = $('range');
    const key = String(rangeValue);
    let active = null;
    for (const b of range.querySelectorAll('button')) {
      const on = b.dataset.days === key;
      b.setAttribute('aria-checked', on);
      if (on) active = b;
    }
    const thumb = range.querySelector('.segmented-thumb');
    if (!active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // Title letters shuffle briefly on hover, then settle left to right.
  function scramble(el) {
    if (reduceMotion || el.dataset.busy) return;
    const text = el.dataset.text;
    const glyphs = '!<>-_/[]{}=+*^?#:.';
    const start = performance.now();
    el.dataset.busy = '1';
    el.style.minWidth = `${el.offsetWidth}px`;
    const step = (now) => {
      const t = Math.min((now - start) / 520, 1);
      el.textContent = [...text].map((ch, i) => (ch === ' ' || i < t * text.length ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('');
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = text;
        delete el.dataset.busy;
      }
    };
    requestAnimationFrame(step);
  }

  // ---- Toasts and confirm ----

  function toast({ kind = 'info', title, text = '', action, onAction, duration = 6000 }) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    const icon = kind === 'success' ? ICON.check : kind === 'error' ? ICON.alert : ICON.check;
    el.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-body"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>
      ${action ? `<button class="link-btn" data-act>${esc(action)}</button>` : ''}<button class="icon-btn" data-close title="Dismiss">${ICON.x}</button>`;
    const close = () => {
      if (el.classList.contains('leaving')) return;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) {
        onAction();
        close();
      } else if (e.target.closest('[data-close]')) close();
    });
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
    if (duration) setTimeout(close, duration);
  }

  function confirmInWindow({ title, rows = [], detail = '', confirmLabel = 'OK' }) {
    return new Promise((resolve) => {
      const modal = $('modal');
      $('modalTitle').textContent = title;
      $('modalRows').innerHTML = rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('');
      $('modalRows').hidden = !rows.length;
      $('modalDetail').textContent = detail;
      $('modalConfirm').textContent = confirmLabel;
      modal.hidden = false;
      modal.querySelector('.modal').focus();
      const done = (ok) => {
        modal.hidden = true;
        modal.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        resolve(ok);
      };
      const onClick = (e) => {
        if (e.target === modal || e.target.closest('#modalCancel')) done(false);
        else if (e.target.closest('#modalConfirm')) done(true);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        }
      };
      modal.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function announceRun(app, results, { manual }) {
    if (!manual) return;
    const posts = results.reduce((n, r) => n + (r.posts || 0), 0);
    const failed = results.filter((r) => r.error);
    const stopped = results.some((r) => r.stopped);
    if (posts) {
      const from = results.filter((r) => r.posts).map((r) => r.label);
      const latest = app.store.library(app.libraryPath()).activity[0];
      toast({
        kind: 'success',
        title: `${plural(posts, 'new design')} imported`,
        text: `From ${from.join(', ')}${stopped ? '. Stopped early, run again to continue.' : ', in Uncategorized.'}`,
        action: latest ? 'Show' : null,
        onAction: () => eagle.item.open(latest.itemId),
      });
    } else if (!failed.length) {
      toast({ title: stopped ? 'Stopped' : 'No new designs', text: stopped ? 'Run again to continue where it left off.' : 'Everything is up to date.' });
    }
    for (const r of failed) {
      toast({
        kind: 'error',
        title: `${r.label} needs attention`,
        text: r.error,
        action: 'Try again',
        onAction: () => app.runNow(r.sourceId, rangeValue),
        duration: 0,
      });
    }
  }

  // ---- Wiring ----

  function render(app) {
    const { running, stopRequested } = app.state;
    const runAll = $('runAll');
    runAll.disabled = running && stopRequested;
    runAll.textContent = running ? (stopRequested ? 'Stopping…' : 'Stop') : 'Run all now';
    runAll.classList.toggle('stop', running);
    runAll.classList.toggle('primary', !running);
    $('range').classList.toggle('disabled', running);
    for (const b of $('range').querySelectorAll('button')) b.disabled = running;
    renderRun(app);
    renderSources(app);
    renderSelection(app);
    renderActivity(app);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = eagle.app.isDarkColors() ? 'dark' : 'light';
  }

  function removeSelected(app) {
    const removed = app.store.data.sources.map((s, i) => ({ s, i })).filter(({ s }) => selected.has(s.id));
    selected.clear();
    removed.forEach(({ s }) => app.removeSource(s.id));
    toast({
      title: removed.length === 1 ? `Removed ${app.labelFor(removed[0].s)}` : `Removed ${removed.length} sources`,
      action: 'Undo',
      onAction: () => removed.forEach(({ s, i }) => app.restoreSource(s, i)),
    });
  }

  function addSource(app, raw) {
    const error = $('addError');
    try {
      const value = raw.trim();
      app.addSource(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      error.hidden = true;
      return true;
    } catch (err) {
      error.textContent = err instanceof TypeError ? 'That doesn’t look like a website link.' : err.message;
      error.hidden = false;
      return false;
    }
  }

  function init(app) {
    applyTheme();
    eagle.onThemeChanged(applyTheme);
    app.onChange(() => render(app));
    app.onRunDone((results, opts) => announceRun(app, results, opts));
    app.setConfirm(confirmInWindow);
    eagle.onPluginShow(() => render(app));
    setInterval(() => render(app), 60e3);

    buildRange(app);
    rangeValue = app.rangeOptions[0].days ?? null;

    const title = $('title');
    title.addEventListener('mouseenter', () => scramble(title));

    // Favicons that fail fall back to the letter tile and aren't requested again.
    document.addEventListener(
      'error',
      (e) => {
        if (e.target.classList && e.target.classList.contains('favicon')) {
          noFavicon.add(e.target.dataset.origin);
          e.target.parentElement.classList.remove('has-icon');
          e.target.remove();
        }
      },
      true,
    );

    $('runAll').addEventListener('click', () => (app.state.running ? app.stop() : app.runNow(null, rangeValue)));

    $('sources').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) return addSource(app, add.dataset.add);
      const action = e.target.closest('[data-action]')?.dataset.action;
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (id && action === 'run') app.runNow(id, rangeValue);
    });
    $('sources').addEventListener('change', (e) => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (!id) return;
      if (e.target.dataset.action === 'toggle') app.setEnabled(id, e.target.checked);
      if (e.target.dataset.action === 'select') {
        if (e.target.checked) selected.add(id);
        else selected.delete(id);
        render(app);
      }
    });

    $('selectionBar').addEventListener('click', (e) => {
      const act = e.target.closest('[data-sel]')?.dataset.sel;
      if (act === 'clear') selected.clear();
      if (act === 'run') {
        app.runNow([...selected], rangeValue);
        selected.clear();
      }
      if (act === 'remove') return removeSelected(app);
      render(app);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('filterMenu').hidden) return closeFilter(app);
      if (selected.size) {
        selected.clear();
        render(app);
      }
    });

    const closeFilter = () => {
      $('filterMenu').hidden = true;
      $('filterBtn').setAttribute('aria-expanded', 'false');
    };
    $('filterBtn').addEventListener('click', () => {
      const menu = $('filterMenu');
      menu.hidden = !menu.hidden;
      $('filterBtn').setAttribute('aria-expanded', String(!menu.hidden));
      renderActivity(app);
    });
    $('filterMenu').addEventListener('click', (e) => {
      const only = e.target.closest('[data-only]');
      if (!only) return;
      e.preventDefault();
      const { activity } = app.store.library(app.libraryPath());
      feedSources(activity).forEach((s) => (s.id === only.dataset.only ? hiddenInFeed.delete(s.id) : hiddenInFeed.add(s.id)));
      renderActivity(app);
    });
    $('filterMenu').addEventListener('change', (e) => {
      const id = e.target.closest('[data-source]')?.dataset.source;
      if (!id) return;
      if (e.target.checked) hiddenInFeed.delete(id);
      else hiddenInFeed.add(id);
      renderActivity(app);
    });
    document.addEventListener('click', (e) => {
      if (!$('filterMenu').hidden && !e.target.closest('#filter')) closeFilter();
    });

    $('activity').addEventListener('click', (e) => {
      const itemId = e.target.closest('[data-item]')?.dataset.item;
      if (itemId) eagle.item.open(itemId);
    });

    $('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (addSource(app, $('addUrl').value)) $('addUrl').value = '';
    });

    render(app);
    requestAnimationFrame(placeThumb);
  }

  if (window.DS) init(window.DS);
  else window.addEventListener('ds-ready', () => init(window.DS), { once: true });
})();
