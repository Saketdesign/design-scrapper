// Settings and run state, saved as one JSON file outside the Eagle library.
// Sources are global; seen lists, run status and activity are kept per library path.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_SOURCES } = require('./defaults');

const MAX_ACTIVITY = 50;
const SEEN_TTL_MS = 365 * 24 * 3600e3;

function createStore(dir) {
  const file = path.join(dir, 'state.json');
  let data;

  function load() {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      data = { version: 1, sources: DEFAULT_SOURCES.map((s) => ({ ...s, id: newId(), addedAt: Date.now() })), libraries: {} };
    }
    return data;
  }

  function save() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  }

  function newId() {
    return crypto.randomBytes(4).toString('hex');
  }

  function library(libraryPath) {
    const key = libraryPath || 'default';
    data.libraries[key] = data.libraries[key] || { seen: {}, status: {}, activity: [] };
    return data.libraries[key];
  }

  function addSource(rawUrl) {
    const url = new URL(rawUrl.trim()).toString();
    if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('Only http(s) links are supported');
    if (data.sources.some((s) => s.url === url)) throw new Error('That source is already in the list');
    const source = { id: newId(), url, enabled: true, addedAt: Date.now() };
    data.sources.push(source);
    save();
    return source;
  }

  function removeSource(id) {
    data.sources = data.sources.filter((s) => s.id !== id);
    save();
  }

  // Put a removed source back where it was (Undo). Its run status is still in each library.
  function restoreSource(source, index) {
    if (data.sources.some((s) => s.id === source.id || s.url === source.url)) return;
    data.sources.splice(Math.min(index, data.sources.length), 0, source);
    save();
  }

  function setEnabled(id, enabled) {
    const s = data.sources.find((x) => x.id === id);
    if (s) s.enabled = enabled;
    save();
  }

  function pruneSeen(lib, now = Date.now()) {
    for (const [k, t] of Object.entries(lib.seen)) if (now - t > SEEN_TTL_MS) delete lib.seen[k];
  }

  function addActivity(lib, entry) {
    lib.activity.unshift(entry);
    lib.activity.length = Math.min(lib.activity.length, MAX_ACTIVITY);
  }

  load();
  return {
    get data() {
      return data;
    },
    load,
    save,
    library,
    addSource,
    removeSource,
    restoreSource,
    setEnabled,
    pruneSeen,
    addActivity,
  };
}

module.exports = { createStore };
