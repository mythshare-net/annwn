// CLI: validate every authored level JSON under src/data/levels/. Used by `npm run validate`
// and CI. Exits non-zero on any error so bad content can't ship.
import { readdirSync, readFileSync } from 'node:fs';
import { validateLevel } from '../src/levels/schema.js';

const dir = 'src/data/levels';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let failed = false;

for (const f of files) {
  const L = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const { ok, errors, warnings } = validateLevel(L);
  if (!ok) { failed = true; console.error(`✗ ${f}\n   ${errors.join('\n   ')}`); }
  else console.log(`✓ ${f}${warnings.length ? '  (warn: ' + warnings.join('; ') + ')' : ''}`);
}
if (!files.length) { console.error('no level JSON found'); process.exit(1); }
if (failed) process.exit(1);
console.log(`\n${files.length} levels valid.`);
