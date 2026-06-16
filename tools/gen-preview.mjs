// Debug helper: render a level (authored JSON or a freshly generated one) as ASCII so you
// can eyeball layout, reachability and entity placement without opening a browser.
//   node tools/gen-preview.mjs                      # random procedural digger level
//   node tools/gen-preview.mjs --seed 42 --style cellular
//   node tools/gen-preview.mjs --file src/data/levels/04-caer-dathyl.json
import { readFileSync } from 'node:fs';
import { generateLevel } from '../src/levels/generate.js';
import { validateLevel } from '../src/levels/schema.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

let L;
const file = opt('--file');
if (file) L = JSON.parse(readFileSync(file, 'utf8'));
else L = generateLevel({ seed: opt('--seed') ? +opt('--seed') : undefined, style: opt('--style', 'digger') });

const GLYPH = { start: '@', exit: '>', soul: 's', lorestone: 'L', torch: '*', enemy: { hound: 'e', white: 'w', boss: 'B' } };
const grid = L.tiles.map((row) => row.map((v) => (v === 0 ? ' ' : v === 2 ? '%' : '#')));
for (const e of L.entities) {
  const g = e.type === 'enemy' ? GLYPH.enemy[e.kind] : GLYPH[e.type];
  if (g) grid[Math.floor(e.y)][Math.floor(e.x)] = g;
}

console.log(`${L.title}  [${L.source}${L.seed != null ? ' seed=' + L.seed : ''}${L.style ? ' ' + L.style : ''}]  ${L.width}x${L.height}`);
console.log(grid.map((r) => r.join('')).join('\n'));
const { ok, errors, warnings } = validateLevel(L);
console.log(`\nvalid: ${ok}${errors.length ? '\n  errors: ' + errors.join('\n  ') : ''}${warnings.length ? '\n  warn: ' + warnings.join('; ') : ''}`);
console.log('legend: @ start  > exit  s soul  e/w/B enemy  L lore  * torch  # wall  % special-wall');
