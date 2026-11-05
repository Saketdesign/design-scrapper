const test = require('node:test');
const assert = require('node:assert/strict');
const { organizeApps } = require('../js/lib/app-folders');

function fakes() {
  const lib = { mobbinDaily: { completedApps: { 'ios:jomo': { name: 'Jomo' } } } };
  const store = { library: () => lib, save() {} };
  const items = [{ tags: ['Jomo', 'mobbin.com'] }, { tags: ['Jomo', 'mobbin.com', 'App: Jomo'] }].map((item) => ({ ...item, async save() { this.saved = true; } }));
  const eagleItem = { get: async ({ tags }) => items.filter((i) => tags.every((t) => i.tags.includes(t))) };
  const folders = [
    { id: 'old', name: 'Apps', conditions: [{ rules: [{ property: 'tags', value: ['App CRED'] }] }] },
    { id: 'group', name: 'Apps', conditions: [], children: [{ id: 'cred', name: 'Cred', parent: 'group', conditions: [] }] },
  ];
  const created = [];
  const smartFolder = { getAll: async () => folders, create: async (f) => { created.push(f); folders[1].children.push({ ...f, id: f.name }); return f; } };
  return { lib, store, items, eagleItem, smartFolder, created };
}

test('files a finished Mobbin app under the Apps group once, tagging older imports', async () => {
  const f = fakes();
  await organizeApps({ ...f, libraryPath: 'lib' });
  assert.deepEqual(f.items[0].tags, ['Jomo', 'mobbin.com', 'App: Jomo']);
  assert.ok(!f.items[1].saved);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].parent, 'group');
  assert.deepEqual(f.created[0].conditions[0].rules[0], { property: 'tags', method: 'union', value: ['App: Jomo'] });

  delete f.lib.mobbinDaily.completedApps['ios:jomo'].organized;
  await organizeApps({ ...f, libraryPath: 'lib' });
  assert.equal(f.created.length, 1, 'an existing folder for the tag is reused');
});
