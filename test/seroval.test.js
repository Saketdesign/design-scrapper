const test = require('node:test');
const assert = require('node:assert');
const { createReader, readTsr } = require('../js/lib/seroval');

test('reads objects, arrays, literals and escaped strings', () => {
  const r = createReader('x=$R[0]={a:!0,b:!1,c:void 0,d:null,e:-1.5e3,"f g":"q\\"\\u00e9\\n",h:[1,,2]}');
  assert.deepStrictEqual(r.get(0), { a: true, b: false, c: undefined, d: null, e: -1500, 'f g': 'q"é\n', h: [1, undefined, 2] });
});

test('resolves references defined elsewhere, including cycles', () => {
  const r = createReader('$R[0]={cat:$R[1]={slug:"ui"},again:$R[1],self:$R[0]};z=$R[2]={late:$R[3]};$R[3]="later"');
  const root = r.get(0);
  assert.strictEqual(root.again, root.cat);
  assert.strictEqual(root.self, root);
  assert.deepStrictEqual(r.get(2), { late: 'later' });
});

test('skips code it does not understand instead of evaluating it', () => {
  const r = createReader('$R[0]={fn:(e)=>{alert(1)},s:new ReadableStream({start(c){}}),ok:"yes"}');
  assert.deepStrictEqual(r.get(0), { fn: undefined, s: undefined, ok: 'yes' });
});

test('finds item lists in a real TanStack page', () => {
  const html = require('node:fs').readFileSync(`${__dirname}/fixtures/vibrant.html`, 'utf8');
  const lists = readTsr(html).valuesForKey('items').filter(Array.isArray);
  assert.ok(lists.flat().length >= 20);
});
