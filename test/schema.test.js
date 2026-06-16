import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { validateLevel, reachable, floorRegions } from '../src/levels/schema.js';

const dir = 'src/data/levels';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

describe('authored level data', () => {
  it('has all four branches', () => {
    expect(files.length).toBe(4);
  });

  for (const f of files) {
    const L = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    describe(f, () => {
      it('passes schema validation', () => {
        const { ok, errors } = validateLevel(L);
        expect(errors).toEqual([]);
        expect(ok).toBe(true);
      });
      it('has exactly one start and one boss', () => {
        expect(L.entities.filter((e) => e.type === 'start').length).toBe(1);
        expect(L.entities.filter((e) => e.type === 'enemy' && e.kind === 'boss').length).toBe(1);
      });
      it('exit, boss and every soul are reachable from start (winnable)', () => {
        const start = L.entities.find((e) => e.type === 'start');
        const mustReach = L.entities.filter((e) => ['exit', 'soul', 'lorestone'].includes(e.type)
          || (e.type === 'enemy' && e.kind === 'boss'));
        for (const e of mustReach) {
          expect(reachable(L.tiles, start.x, start.y, e.x, e.y),
            `${e.type}${e.kind ? '/' + e.kind : ''} at (${e.x},${e.y}) unreachable in ${f}`).toBe(true);
        }
      });
    });
  }
});

describe('schema helpers', () => {
  const open = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  const split = [
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  it('reachable() respects walls', () => {
    expect(reachable(open, 1.5, 1.5, 3.5, 3.5)).toBe(true);
    expect(reachable(split, 1.5, 1.5, 3.5, 3.5)).toBe(false);
  });
  it('floorRegions() counts connected components', () => {
    expect(floorRegions(open)).toBe(1);
    expect(floorRegions(split)).toBe(2);
  });
  it('flags Branch-IV-style sealed chamber as a validation error', () => {
    // a sealed inner cell (the bug we fixed): soul boxed in by walls
    const sealed = {
      schema: 1, id: 'x', name: 'x', title: 'x', tint: [0, 0, 0], width: 5, height: 5,
      tiles: [
        [1, 1, 1, 1, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 1, 1, 1, 1],
      ],
      entities: [
        { type: 'start', x: 1.5, y: 1.5 },
        { type: 'exit', x: 1.5, y: 3.5 },
        { type: 'soul', x: 3.5, y: 2.5 }, // sealed on the far side
      ],
      lore: [], soulPool: [{ name: 'a', line: 'b' }], boss: { name: 'b' },
    };
    const { ok, errors } = validateLevel(sealed);
    expect(ok).toBe(false);
    expect(errors.some((e) => /not reachable/.test(e))).toBe(true);
  });
});
