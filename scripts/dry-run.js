// Run the adapters against the live sites outside Eagle and print what would be imported.
// Usage: node scripts/dry-run.js [hours=24] [url ...]
const { adapterFor } = require('../js/adapters');
const { DEFAULT_SOURCES } = require('../js/defaults');

async function main() {
  const [hoursArg, ...urls] = process.argv.slice(2);
  const hours = Number(hoursArg) || 24;
  const since = Date.now() - hours * 3600e3;
  for (const url of urls.length ? urls : DEFAULT_SOURCES.map((s) => s.url)) {
    const adapter = adapterFor(url);
    try {
      const items = await adapter.fetchItems(url, { fetch, since });
      const fresh = items.filter((it) => !it.publishedAt || it.publishedAt >= since);
      console.log(`\n${url}  [${adapter.id}]  ${items.length} on page, ${fresh.length} in the last ${hours}h`);
      for (const it of fresh) {
        const media = it.media.map((m) => `${m.type}${m.width ? ` ${m.width}x${m.height}` : ''}`).join(', ');
        console.log(`  - ${it.title}  @${it.creator.handle}  [${media}]  ${it.tags.slice(0, 4).join(', ')}`);
      }
    } catch (err) {
      console.log(`\n${url}  [${adapter.id}]  FAILED: ${err.message}`);
    }
  }
}

main();
