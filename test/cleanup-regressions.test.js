const test = require('node:test');
const assert = require('node:assert/strict');
const { pagedRows } = require('../js/adapters/util');

test('Supabase paging warns when the all-time row cap may truncate results', async () => {
  const warnings = [];
  const rows = await pagedRows({
    name: 'example', since: 0, pageRows: 2, maxRows: 4,
    send: async (offset) => ({ status: 200, ok: true, json: async () => [offset, offset + 1] }),
    refresh: async () => {},
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(rows, [0, 1, 2, 3]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /example.*4-row.*incomplete/);
});

test('Supabase paging does not warn for a complete page range', async () => {
  const warnings = [];
  const rows = await pagedRows({
    name: 'example', since: 0, pageRows: 2, maxRows: 6,
    send: async (offset) => ({ status: 200, ok: true, json: async () => offset ? [2] : [0, 1] }),
    refresh: async () => {},
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(rows, [0, 1, 2]);
  assert.deepEqual(warnings, []);
});
