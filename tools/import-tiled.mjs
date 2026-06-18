// Import a Tiled JSON export (+ sidecar meta JSON) into a unified-schema level file.
//   node tools/import-tiled.mjs <map.tiled.json> <meta.json> [out.json]
// The meta file supplies prose/lore/soulPool/boss/tint/title/id (awkward to edit in Tiled).
import { readFileSync, writeFileSync } from 'node:fs';
import { tiledToSchema } from '../src/levels/tiled.js';

const [mapPath, metaPath, outPath] = process.argv.slice(2);
if (!mapPath || !metaPath) {
  console.error('usage: node tools/import-tiled.mjs <map.tiled.json> <meta.json> [out.json]');
  process.exit(1);
}
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const level = tiledToSchema(map, meta);              // throws if invalid
const out = outPath || `src/data/levels/${meta.id || 'tiled-level'}.json`;
writeFileSync(out, JSON.stringify(level, null, 2) + '\n');
console.log(`✓ ${out}  (${level.width}x${level.height}, ${level.entities.length} entities)`);
