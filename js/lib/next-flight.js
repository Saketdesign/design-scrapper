// Read JSON from Next.js flight strings without evaluating any page code.
function flightData(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return ''; } }).join('');
}

// Index of the closing quote of the string that opens at `i`.
function endOfString(text, i) {
  let j = i + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
  return j;
}

const DEPTH = { '{': 1, '[': 1, '}': -1, ']': -1 };

// Index of the bracket that closes the object or array opening at `start`, or -1.
function endOfValue(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '"') {
      i = endOfString(text, i);
      continue;
    }
    const step = DEPTH[text[i]] || 0;
    depth += step;
    if (step < 0 && depth === 0) return i;
  }
  return -1;
}

// The JSON value that starts at `start` (an object or array), or null.
function jsonAt(text, start) {
  const end = endOfValue(text, start);
  if (end < 0) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

module.exports = { flightData, jsonAt };
