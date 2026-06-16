import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { asciiLevelToSchema } from '../src/levels/ascii.js';
import { validateLevel } from '../src/levels/schema.js';

// Pull the legacy LEVELS literal straight from the game source (single source of truth)
// so this test fails if the authored grids and the extracted JSON ever drift apart.
const js = readFileSync('src/main.js', 'utf8');
const m = js.match(/const LEVELS=(\[[\s\S]*?\]);\s*\nconst KIND=/);
const LEGACY = Function('Math', `return (${m[1]});`)(Math);

function countChars(grid, ch) {
  return grid.reduce((n, row) => n + [...row].filter((c) => c === ch).length, 0);
}

describe('ASCII → schema conversion (content parity)', () => {
  it('finds the four legacy levels in source', () => {
    expect(LEGACY.length).toBe(4);
  });

  LEGACY.forEach((L, i) => {
    describe(L.title, () => {
      const schema = asciiLevelToSchema(L, i);
      const count = (t, kind) => schema.entities.filter((e) => e.type === t && (!kind || e.kind === kind)).length;

      it('produces a valid level', () => {
        const { errors } = validateLevel(schema);
        expect(errors).toEqual([]);
      });
      it('entity counts match the grid characters', () => {
        expect(count('soul')).toBe(countChars(L.grid, 'S'));
        expect(count('enemy', 'hound')).toBe(countChars(L.grid, 'E'));
        expect(count('enemy', 'white')).toBe(countChars(L.grid, 'W'));
        expect(count('enemy', 'boss')).toBe(countChars(L.grid, 'B'));
        expect(count('exit')).toBe(countChars(L.grid, '3'));
        expect(count('lorestone')).toBe(countChars(L.grid, 'L'));
        expect(count('torch')).toBe((L.torches || []).length);
      });
      it('preserves lore and soul pools', () => {
        expect(schema.lore.length).toBe(L.lorestones.length);
        expect(schema.soulPool.length).toBe(L.soulPool.length);
        expect(schema.boss.name).toBe(L.bossName);
      });
      it('every lorestone ref resolves to a lore entry', () => {
        const ids = new Set(schema.lore.map((s) => s.id));
        for (const e of schema.entities.filter((e) => e.type === 'lorestone')) {
          expect(ids.has(e.ref)).toBe(true);
        }
      });
    });
  });

  it('matches the extracted JSON on disk (no drift)', () => {
    const files = readdirSync('src/data/levels').filter((f) => f.endsWith('.json')).sort();
    expect(files.length).toBe(LEGACY.length);
    files.forEach((f, i) => {
      const onDisk = JSON.parse(readFileSync(`src/data/levels/${f}`, 'utf8'));
      const fresh = asciiLevelToSchema(LEGACY[i], i);
      expect(onDisk.entities.length).toBe(fresh.entities.length);
      expect(onDisk.tiles).toEqual(fresh.tiles);
    });
  });
});
