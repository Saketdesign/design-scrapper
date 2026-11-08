// Run the adapters against the live sites outside Eagle and print what would be imported.
// Usage: node scripts/dry-run.js [hours=24 | all] [url ...]
const { adapterFor } = require('../js/adapters');
const { DEFAULT_SOURCES } = require('../js/defaults');

const hoursFrom = (arg) => (arg === 'all' ? Infinity : Number(arg) || 24);
const sinceFrom = (hours) => (hours === Infinity ? 0 : Date.now() - hours * 3600e3);
const rangeText = (hours) => (hours === Infinity ? 'all time' : `the last ${hours}h`);
const mediaText = (m) => `${m.type}${m.width ? ` ${m.width}x${m.height}` : ''}`;

function printItem(it) {
  console.log(`  - ${it.title}  @${it.creator.handle}  [${it.media.map(mediaText).join(', ')}]  ${it.tags.slice(0, 4).join(', ')}`);
}

async function check(url, hours, since) {
  const adapter = adapterFor(url);
  try {
    const items = await adapter.fetchItems(url, { fetch, since });
    const fresh = items.filter((it) => !it.publishedAt || it.publishedAt >= since);
    const files = fresh.reduce((n, it) => n + it.media.length, 0);
    console.log(`\n${url}  [${adapter.id}]  ${items.length} fetched, ${fresh.length} posts / ${files} files in ${rangeText(hours)}`);
    fresh.slice(0, 40).forEach(printItem);
  } catch (err) {
    console.log(`\n${url}  [${adapter.id}]  FAILED: ${err.message}`);
  }
}

async function main() {
  const [hoursArg, ...urls] = process.argv.slice(2);
  const hours = hoursFrom(hoursArg);
  const since = sinceFrom(hours);
  for (const url of urls.length ? urls : DEFAULT_SOURCES.map((s) => s.url)) await check(url, hours, since);
}

main();
