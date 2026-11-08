// Wording for the confirm dialog before a big import and the notification after a run.
// Pure functions of the run's plans and results, so main.js only has to show them.

const n = (x) => x.toLocaleString('en-US');

function sizeText(mb) {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

const rangeText = (days) => (days === 'all' ? 'all time' : `the last ${days} days`);
const slowNote = (files) =>
  files > 1000
    ? 'This can take hours and Eagle needs to stay open. Stop keeps everything already imported, and running it again continues where it left off.'
    : 'You can stop at any time.';

// What to ask before a long import, or null when there is nothing to import.
// avg: { video, image } average megabytes per file.
function backfillCopy(plans, days, avg) {
  const posts = plans.reduce((x, p) => x + p.items.length, 0);
  if (!posts) return null;
  const sum = (key) => plans.reduce((x, p) => x + p[key], 0);
  const files = sum('files');
  const size = sizeText(sum('videos') * avg.video + sum('images') * avg.image);
  const title = `Import ${n(posts)} designs from ${rangeText(days)}?`;
  const note = slowNote(files);
  const withItems = plans.filter((p) => p.items.length);
  const nativeDetail = [
    withItems.map((p) => `${p.label}: ${n(p.items.length)}`).join('\n'),
    `${n(files)} files, roughly ${size} (estimated from the average file sizes so far). They go to Uncategorized.`,
    note,
  ].join('\n\n');
  return {
    window: {
      title,
      rows: withItems.map((p) => ({ label: p.label, value: n(p.items.length) })),
      detail: `${n(files)} files, roughly ${size}. They go to Uncategorized. ${note}`,
      confirmLabel: `Import ${n(posts)} designs`,
    },
    native: { type: 'question', title: 'design scrapper', message: title.toLowerCase(), detail: nativeDetail.toLowerCase() },
  };
}

// The notification text for a finished run, or null when a scheduled run found nothing.
function notifyBody(results, manual) {
  const imported = results.reduce((x, r) => x + r.imported, 0);
  const failed = results.filter((r) => r.error);
  if (!manual && !imported && !failed.length) return null;
  const from = results.filter((r) => r.imported).map((r) => r.label).join(', ');
  const parts = [imported ? `${imported} new design${imported === 1 ? '' : 's'} from ${from}` : 'No new designs'];
  if (results.some((r) => r.stopped)) parts.push('stopped early');
  if (failed.length) parts.push(`${failed.map((r) => r.label).join(', ')} need${failed.length === 1 ? 's' : ''} attention`);
  return parts.join(' · ').toLowerCase();
}

// The command that opens a link in Google Chrome on this platform.
function chromeCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: ['-a', 'Google Chrome', url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', 'chrome', url] };
  return { command: 'google-chrome', args: [url] };
}

module.exports = { backfillCopy, notifyBody, chromeCommand };
