import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/levels/generate.js';
import { validateLevel, reachable, floorRegions, TILE } from '../src/levels/schema.js';

const SEEDS = [1, 7, 42, 123, 2024, 99999];
const STYLES = ['digger', 'uniform', 'cellular'];

describe('procedural generation (ROT.js)', () => {
  for (const style of STYLES) {
    describe(`style: ${style}`, () => {
      for (const seed of SEEDS) {
        const L = generateLevel({ seed, style, width: 25, height: 25 });
        it(`seed ${seed} passes validation`, () => {
          const { ok, errors } = validateLevel(L);
          expect(errors).toEqual([]);
          expect(ok).toBe(true);
        });
        it(`seed ${seed} is a single connected region`, () => {
          expect(floorRegions(L.tiles)).toBe(1);
        });
        it(`seed ${seed}: exit + boss reachable from start (winnable)`, () => {
          const start = L.entities.find((e) => e.type === 'start');
          const exit = L.entities.find((e) => e.type === 'exit');
          const boss = L.entities.find((e) => e.type === 'enemy' && e.kind === 'boss');
          expect(reachable(L.tiles, start.x, start.y, exit.x, exit.y)).toBe(true);
          expect(reachable(L.tiles, start.x, start.y, boss.x, boss.y)).toBe(true);
        });
        it(`seed ${seed}: every entity sits on a floor tile`, () => {
          for (const e of L.entities) {
            expect(L.tiles[Math.floor(e.y)][Math.floor(e.x)]).toBe(TILE.FLOOR);
          }
        });
      }
    });
  }

  it('same seed reproduces an identical level', () => {
    const a = generateLevel({ seed: 555, style: 'digger' });
    const b = generateLevel({ seed: 555, style: 'digger' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds produce different levels', () => {
    const a = generateLevel({ seed: 1, style: 'digger' });
    const b = generateLevel({ seed: 2, style: 'digger' });
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it('records source and seed for reproducibility', () => {
    const L = generateLevel({ seed: 808, style: 'digger' });
    expect(L.source).toBe('procedural');
    expect(L.seed).toBe(808);
  });

  it('surfaces varied flavour across seeds (RNG warmup, not stuck on index 0)', () => {
    const titles = new Set();
    for (let s = 1; s <= 8; s++) titles.add(generateLevel({ seed: s, style: 'digger' }).title);
    expect(titles.size).toBeGreaterThan(1);
  });

  it('draws lore from the authentic Mabinogion pool', () => {
    const L = generateLevel({ seed: 5, style: 'digger' });
    expect(L.lore.length).toBeGreaterThan(0);
    for (const entry of L.lore) { expect(entry.title).toBeTruthy(); expect(entry.body.length).toBeGreaterThan(20); }
  });
});
