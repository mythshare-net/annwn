// Preview per-level palettes as ANSI colour swatches — a quick sanity check that branches and
// named procedural forts get distinct, sensible looks without opening a browser.
//   node tools/palette-preview.mjs            # campaign branches + a few seeds
//   node tools/palette-preview.mjs 1 2 3 4 5  # specific procedural seeds
import { readFileSync, readdirSync } from 'node:fs';
import { resolvePalette } from '../src/levels/palette.js';
import { generateLevel } from '../src/levels/generate.js';

const sw = (c) => c ? `\x1b[48;2;${c[0]};${c[1]};${c[2]}m   \x1b[0m` : '   ';
const hex = (c) => c ? '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('') : '------';
const FIELDS = ['wall', 'wall2', 'floor', 'accent', 'light', 'fog'];

function show(label, tint, partial) {
  const p = resolvePalette(tint, partial);
  const row = FIELDS.map((f) => sw(p[f])).join(' ');
  console.log(`\n  ${label}`);
  console.log(`  tint ${sw(tint)} ${hex(tint)}`);
  console.log('  ' + row);
  console.log('  ' + FIELDS.map((f) => hex(p[f]).padEnd(7)).join(''));
  console.log('  ' + FIELDS.map((f) => f.padEnd(7)).join(''));
}

console.log('=== Campaign branches (hand-tuned palettes) ===');
const dir = 'src/data/levels';
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const L = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  show(L.title || file, L.tint, L.palette);
}

const seeds = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const styles = ['digger', 'cellular'];
console.log('\n=== Procedural themes (seeded) ===');
for (const seed of (seeds.length ? seeds : [1, 7, 42, 123, 2024])) {
  const style = styles[seed % styles.length];
  const L = generateLevel({ seed, style, width: 21, height: 21 });
  show(`${L.title}  (seed ${seed}, ${style})`, L.tint, L.palette);
}
