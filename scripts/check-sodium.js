// Sodium's rules for the files its ESLint plugin cannot read: the plugin checks JSX and className, while this
// window is plain CSS and HTML built in template strings. Run: node scripts/check-sodium.js (exit 1 on a finding).
// tokens.css and base.css are Sodium's own, vendored as they ship, so they are not checked.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// What a raw colour is, from lib/sodium/lint/value-rules.mjs.
const RAW = /(?<![A-Za-z0-9&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/;
const SYSTEM_CSS = ['css/sodium/recipes.css', 'css/sodium/components.css'];
const APP_CSS = ['css/app.css'];
const MARKUP = ['index.html', 'js/ui.js'];

const rules = [
  { files: [...SYSTEM_CSS, ...APP_CSS, ...MARKUP], test: (l) => RAW.test(l), say: 'raw colour; use a colour role token' },
  { files: [...SYSTEM_CSS, ...APP_CSS], test: (l) => /border-radius\s*:\s*(?!0\b|var\(--radius\))/.test(l), say: 'rounded corner; Sodium is square everywhere' },
  { files: [...SYSTEM_CSS, ...APP_CSS], test: (l) => /box-shadow\s*:[^;]*\b\d+px\s+\d+px\s+[1-9]/.test(l) || /drop-shadow|backdrop-filter|blur\(/.test(l), say: 'shadow or blur; Sodium has no elevation' },
  { files: [...SYSTEM_CSS, ...APP_CSS], test: (l) => /font-weight\s*:\s*(?!400|normal|var\(--weight-normal\))/.test(l), say: 'font weight; hierarchy is size, case and colour' },
  { files: [...APP_CSS, ...MARKUP], test: (l) => /text-transform\s*:\s*(upper|lower)case|class="[^"]*\buppercase\b/.test(l), say: 'hand-set case; use a label role (type-label, type-label-sm, type-micro)' },
  { files: [...APP_CSS, ...MARKUP], test: (l) => /(?:linear|radial|conic)-gradient\(/.test(l), say: 'gradient; the only one is the light inside slab and edged' },
  { files: [...APP_CSS], test: (l) => /:\s*[^;]*\b\d+(?:\.\d+)?px\b/.test(l) && !/var\(--/.test(l), say: 'hand-picked size; use a space, size or type token' },
  { files: MARKUP, test: (l) => /—|\p{Extended_Pictographic}/u.test(l), say: 'em dash or emoji in copy' },
];

let found = 0;
for (const rule of rules) {
  for (const file of rule.files) {
    read(file).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\*.*?\*\/|^\s*\/\/.*$/g, '');
      if (!rule.test(code)) return;
      found++;
      console.log(`${file}:${i + 1}  ${rule.say}\n    ${line.trim().slice(0, 140)}`);
    });
  }
}
console.log(found ? `\n${found} finding${found === 1 ? '' : 's'}` : 'check-sodium: no findings');
process.exitCode = found ? 1 : 0;
