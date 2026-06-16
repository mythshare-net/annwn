// Extract the 4 authored branches from src/main.js into data-driven JSON under
// src/data/levels/, via the ASCII→schema converter. Validates each before writing.
// Re-runnable; the JSON files become the canonical level data going forward.
import { readFileSync, writeFileSync } from 'node:fs';
import { asciiLevelToSchema } from '../src/levels/ascii.js';
import { validateLevel } from '../src/levels/schema.js';

const js = readFileSync('src/main.js', 'utf8');
const m = js.match(/const LEVELS=(\[[\s\S]*?\]);\s*\nconst KIND=/);
if (!m) { console.error('could not locate LEVELS literal in src/main.js'); process.exit(1); }

// The literal only depends on Math (Math.PI in one start angle).
const LEVELS = Function('Math', `return (${m[1]});`)(Math);
console.log(`parsed ${LEVELS.length} legacy levels`);

let failed = false;
LEVELS.forEach((L, i) => {
  const schema = asciiLevelToSchema(L, i);
  const { ok, errors, warnings } = validateLevel(schema);
  const num = String(i + 1).padStart(2, '0');
  const file = `src/data/levels/${num}-${schema.id}.json`;
  if (!ok) { failed = true; console.error(`✗ ${file}\n   ${errors.join('\n   ')}`); }
  else {
    writeFileSync(file, JSON.stringify(schema, null, 2) + '\n');
    const ents = schema.entities.length;
    console.log(`✓ ${file}  (${schema.width}x${schema.height}, ${ents} entities, ${schema.lore.length} lore)${warnings.length ? '  warn: ' + warnings.join('; ') : ''}`);
  }
});

if (failed) process.exit(1);
