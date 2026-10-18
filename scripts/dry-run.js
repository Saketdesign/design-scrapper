// Run the adapters against the live sites outside Eagle and print what would be imported.
// Usage: node scripts/dry-run.js [hours=24 | all] [url ...]
const { adapterFor } = require('../js/adapters');
const { DEFAULT_SOURCES } = require('../js/defaults');

async function main() {
  const [hoursArg, ...urls] = process.argv.slice(2);
  const hours = hoursArg === 'all' ? Infinity : Number(hoursArg) || 24;
  const since = hours === Infinity ? 0 : Date.now() - hours * 3600e3;
  for (const url of urls.length ? urls : DEFAULT_SOURCES.map((s) => s.url)) {
    const adapter = adapterFor(url);
    try {
      const items = await adapter.fetchItems(url, { fetch, since });
      const fresh = items.filter((it) => !it.publishedAt || it.publishedAt >= since);
      const files = fresh.reduce((n, it) => n + it.media.length, 0);
      const range = hours === Infinity ? 'all time' : `the last ${hours}h`;
      console.log(`\n${url}  [${adapter.id}]  ${items.length} fetched, ${fresh.length} posts / ${files} files in ${range}`);
      for (const it of fresh.slice(0, 40)) {
        const media = it.media.map((m) => `${m.type}${m.width ? ` ${m.width}x${m.height}` : ''}`).join(', ');
        console.log(`  - ${it.title}  @${it.creator.handle}  [${media}]  ${it.tags.slice(0, 4).join(', ')}`);
      }
    } catch (err) {
      console.log(`\n${url}  [${adapter.id}]  FAILED: ${err.message}`);
    }
  }
}

main();
