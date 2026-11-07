const test = require('node:test');
const assert = require('node:assert');
const { backfillCopy, notifyBody, chromeCommand } = require('../js/lib/messages');

const avg = { video: 2, image: 0.5 };
const plan = (label, count, videos, images) => ({ label, items: new Array(count).fill({}), files: videos + images, videos, images });

test('backfill copy is null with nothing to import', () => {
  assert.strictEqual(backfillCopy([plan('A', 0, 0, 0)], 7, avg), null);
});

test('backfill copy for the window dialog', () => {
  const copy = backfillCopy([plan('A', 3, 2, 4), plan('B', 0, 0, 0)], 7, avg).window;
  assert.strictEqual(copy.title, 'Import 3 designs from the last 7 days?');
  assert.deepStrictEqual(copy.rows, [{ label: 'A', value: '3' }]);
  assert.strictEqual(copy.detail, '6 files, roughly 6 MB. They go to Uncategorized. You can stop at any time.');
  assert.strictEqual(copy.confirmLabel, 'Import 3 designs');
});

test('backfill copy for all time with a long import, native dialog in lowercase', () => {
  const { window, native } = backfillCopy([plan('A', 1500, 600, 900)], 'all', { video: 2, image: 0.5 });
  assert.strictEqual(window.title, 'Import 1,500 designs from all time?');
  assert.match(window.detail, /roughly 1\.6 GB/);
  assert.match(window.detail, /This can take hours/);
  assert.strictEqual(native.message, 'import 1,500 designs from all time?');
  assert.strictEqual(native.detail, native.detail.toLowerCase());
  assert.match(native.detail, /^a: 1,500/);
});

test('notification text', () => {
  const quiet = [{ label: 'A', imported: 0 }];
  assert.strictEqual(notifyBody(quiet, false), null);
  assert.strictEqual(notifyBody(quiet, true), 'no new designs');
  const mixed = [{ label: 'A', imported: 1, stopped: true }, { label: 'B', imported: 0, error: 'x' }];
  assert.strictEqual(notifyBody(mixed, false), '1 new design from a · stopped early · b needs attention');
  const two = [{ label: 'A', imported: 2 }, { label: 'B', imported: 1, error: 'x' }, { label: 'C', imported: 0, error: 'x' }];
  assert.strictEqual(notifyBody(two, false), '3 new designs from a, b · b, c need attention');
});

test('chrome command per platform', () => {
  assert.deepStrictEqual(chromeCommand('darwin', 'u'), { command: 'open', args: ['-a', 'Google Chrome', 'u'] });
  assert.deepStrictEqual(chromeCommand('win32', 'u'), { command: 'cmd', args: ['/c', 'start', '', 'chrome', 'u'] });
  assert.deepStrictEqual(chromeCommand('linux', 'u'), { command: 'google-chrome', args: ['u'] });
});
