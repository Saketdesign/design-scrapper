// Safe reader for the seroval payloads TanStack Start embeds in `<script class="$tsr">`.
// It never evaluates site code: it understands the data subset (objects, arrays, strings,
// numbers, !0/!1, void 0, null, $R[n]= assignments and $R[n] references) and skips anything
// else (functions, `new X(...)`, streams) by jumping over the balanced expression.

const LITERALS = [
  ['!0', true],
  ['!1', false],
  ['void 0', undefined],
  ['null', null],
  ['-Infinity', -Infinity],
  ['Infinity', Infinity],
  ['NaN', NaN],
];

function extractTsrScripts(html) {
  const out = [];
  const re = /<script\b[^>]*class=["']\$tsr["'][^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join('\n;\n');
}

function createReader(text) {
  const positions = new Map();
  const assignRe = /\$R\[(\d+)\]=/g;
  let m;
  while ((m = assignRe.exec(text))) {
    const n = Number(m[1]);
    if (!positions.has(n)) positions.set(n, m.index + m[0].length);
  }
  const registry = new Map();
  const resolving = new Set();

  function get(n) {
    if (registry.has(n)) return registry.get(n);
    const pos = positions.get(n);
    if (pos === undefined || resolving.has(n)) return undefined;
    resolving.add(n);
    try {
      return parseAssigned(n, pos).value;
    } catch {
      return undefined;
    } finally {
      resolving.delete(n);
    }
  }

  function parseAssigned(n, pos) {
    const ch = text[pos];
    if (ch === '{' || ch === '[') {
      const container = ch === '{' ? {} : [];
      registry.set(n, container);
      return ch === '{' ? parseObject(pos, container) : parseArray(pos, container);
    }
    const res = parseValue(pos);
    registry.set(n, res.value);
    return res;
  }

  function ws(pos) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    return pos;
  }

  function parseValue(pos) {
    pos = ws(pos);
    const ch = text[pos];
    if (ch === '$' && text.startsWith('$R[', pos)) {
      const close = text.indexOf(']', pos);
      const n = Number(text.slice(pos + 3, close));
      if (text[close + 1] === '=' && text[close + 2] !== '=') {
        if (registry.has(n)) return { value: registry.get(n), end: skipValue(close + 2) };
        return parseAssigned(n, close + 2);
      }
      return { value: get(n), end: close + 1 };
    }
    if (ch === '{') return parseObject(pos, {});
    if (ch === '[') return parseArray(pos, []);
    if (ch === '"' || ch === "'") return parseString(pos);
    if (ch === '-' || (ch >= '0' && ch <= '9') || ch === '.') {
      const num = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(text.slice(pos, pos + 40));
      if (num) return { value: Number(num[0]), end: pos + num[0].length };
    }
    for (const [lit, value] of LITERALS) {
      if (text.startsWith(lit, pos) && !/[\w$]/.test(text[pos + lit.length] || '')) {
        return { value, end: pos + lit.length };
      }
    }
    return { value: undefined, end: skipValue(pos) };
  }

  function parseObject(pos, obj) {
    pos = ws(pos + 1);
    while (text[pos] !== '}') {
      let key;
      if (text[pos] === '"' || text[pos] === "'") {
        const s = parseString(pos);
        key = s.value;
        pos = s.end;
      } else {
        const id = /^[\w$]+/.exec(text.slice(pos, pos + 200));
        if (!id) throw new SyntaxError(`Bad key at ${pos}`);
        key = id[0];
        pos += key.length;
      }
      pos = ws(pos);
      if (text[pos] !== ':') throw new SyntaxError(`Expected ':' at ${pos}`);
      const v = parseValue(pos + 1);
      if (key !== '__proto__') obj[key] = v.value;
      pos = ws(v.end);
      if (text[pos] === ',') pos = ws(pos + 1);
      else if (text[pos] !== '}') throw new SyntaxError(`Expected ',' or '}' at ${pos}`);
    }
    return { value: obj, end: pos + 1 };
  }

  function parseArray(pos, arr) {
    pos = ws(pos + 1);
    while (text[pos] !== ']') {
      if (text[pos] === ',') {
        arr.push(undefined);
        pos = ws(pos + 1);
        continue;
      }
      const v = parseValue(pos);
      arr.push(v.value);
      pos = ws(v.end);
      if (text[pos] === ',') pos = ws(pos + 1);
      else if (text[pos] !== ']') throw new SyntaxError(`Expected ',' or ']' at ${pos}`);
    }
    return { value: arr, end: pos + 1 };
  }

  function parseString(pos) {
    const quote = text[pos];
    let out = '';
    let i = pos + 1;
    while (i < text.length && text[i] !== quote) {
      const c = text[i];
      if (c !== '\\') {
        out += c;
        i++;
        continue;
      }
      const e = text[i + 1];
      const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
      if (e in simple) {
        out += simple[e];
        i += 2;
      } else if (e === 'x') {
        out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
        i += 4;
      } else if (e === 'u' && text[i + 2] === '{') {
        const close = text.indexOf('}', i);
        out += String.fromCodePoint(parseInt(text.slice(i + 3, close), 16));
        i = close + 1;
      } else if (e === 'u') {
        out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
        i += 6;
      } else {
        out += e;
        i += 2;
      }
    }
    return { value: out, end: i + 1 };
  }

  // Jump over one expression we don't understand, stopping at a top-level , } or ].
  function skipValue(pos) {
    let depth = 0;
    let i = pos;
    while (i < text.length) {
      const c = text[i];
      if (c === '"' || c === "'" || c === '`') {
        i = skipQuoted(i);
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) return i;
        depth--;
      } else if (c === ',' && depth === 0) return i;
      i++;
    }
    return i;
  }

  function skipQuoted(i) {
    const q = text[i++];
    while (i < text.length && text[i] !== q) i += text[i] === '\\' ? 2 : 1;
    return i + 1;
  }

  // Values assigned right after `<key>:` anywhere in the payload, e.g. every `items:` array.
  function valuesForKey(key) {
    const out = [];
    const re = new RegExp(`[{,]${key.replace(/[$]/g, '\\$')}:`, 'g');
    let k;
    while ((k = re.exec(text))) {
      try {
        out.push(parseValue(k.index + k[0].length).value);
      } catch {
        /* skip malformed occurrence */
      }
    }
    return out;
  }

  return { get, valuesForKey, parseValue: (pos) => parseValue(pos).value };
}

function readTsr(html) {
  return createReader(extractTsrScripts(html));
}

module.exports = { readTsr, createReader };
