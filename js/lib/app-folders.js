// Each fully exported Mobbin app gets an "App: <name>" tag and its own smart folder
// inside the "Apps" smart-folder group.
const GROUP = 'Apps';
const appTag = (name) => `App: ${name}`;
const flatten = (folders) => folders.flatMap((f) => [f, ...flatten(f.children || [])]);
const matchesTag = (folder, tag) => (folder.conditions || []).some((c) => (c.rules || [])
  .some((r) => r.property === 'tags' && [].concat(r.value).includes(tag)));

async function ensureAppFolder(smartFolder, name) {
  const tag = appTag(name);
  const folders = flatten(await smartFolder.getAll());
  let group = folders.find((f) => f.name === GROUP && !f.parent && !(f.conditions || []).length);
  if (!group) group = await smartFolder.create({ name: GROUP, conditions: [] });
  const children = folders.filter((f) => f.parent === group.id || (group.children || []).some((c) => c.id === f.id));
  if (children.some((f) => matchesTag(f, tag))) return;
  await smartFolder.create({
    name, parent: group.id,
    conditions: [{ match: 'OR', boolean: 'TRUE', rules: [{ property: 'tags', method: 'union', value: [tag] }] }],
  });
}

// Tags items imported before the app tag existed, then makes the folder. Runs once per app.
async function organizeApps({ store, libraryPath, eagleItem, smartFolder, log = () => {} }) {
  const lib = store.library(libraryPath);
  const apps = lib.mobbinDaily && lib.mobbinDaily.completedApps;
  if (!apps || !smartFolder) return;
  for (const app of Object.values(apps)) {
    if (app.organized) continue;
    try {
      const tag = appTag(app.name);
      for (const item of await eagleItem.get({ tags: [app.name, 'mobbin.com'] })) {
        if (item.tags.includes(tag)) continue;
        item.tags = [...item.tags, tag];
        await item.save();
      }
      await ensureAppFolder(smartFolder, app.name);
      app.organized = true;
      store.save();
    } catch (error) {
      log(`Could not file ${app.name} under ${GROUP}: ${error.message}`);
    }
  }
}

module.exports = { appTag, organizeApps };
