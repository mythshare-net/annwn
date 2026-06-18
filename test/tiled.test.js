import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tiledToSchema } from '../src/levels/tiled.js';
import { validateLevel, TILE } from '../src/levels/schema.js';

const map = JSON.parse(readFileSync('test/fixtures/tiled-sample.json', 'utf8'));
const meta = {
  id: 'tiled-test', name: 'T', title: 'A Tiled Branch', tint: [20, 20, 20],
  boss: { name: 'Warden', death: 'falls' },
  lore: [{ id: 't1', title: 'Test Stone', body: 'A test lorestone.' }],
  soulPool: [{ name: 'A test shade', line: '…' }],
};

describe('Tiled JSON → schema import', () => {
  const level = tiledToSchema(map, meta);

  it('produces a valid level', () => {
    const { ok, errors } = validateLevel(level);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('maps GIDs to tiles (0 floor, 1 wall, 2 special)', () => {
    expect(level.width).toBe(7);
    expect(level.tiles[0][0]).toBe(TILE.WALL);      // border
    expect(level.tiles[1][1]).toBe(TILE.FLOOR);     // interior floor
    expect(level.tiles[2][2]).toBe(TILE.SPECIAL);   // GID 2 → special (tile property)
  });

  it('translates object Class + properties into entities at tile centers', () => {
    const byType = (t) => level.entities.filter((e) => e.type === t);
    expect(byType('start')[0]).toMatchObject({ x: 1.5, y: 1.5, a: 0 });
    expect(byType('exit')[0]).toMatchObject({ x: 5.5, y: 5.5 });
    expect(byType('enemy')[0]).toMatchObject({ kind: 'boss', x: 3.5, y: 3.5 });
    expect(byType('soul')[0]).toMatchObject({ x: 1.5, y: 5.5 });
    expect(byType('lorestone')[0]).toMatchObject({ ref: 't1', x: 5.5, y: 1.5 });
    expect(byType('torch').length).toBe(1);
  });

  it('carries metadata and resolves lore refs', () => {
    expect(level.source).toBe('tiled');
    expect(level.title).toBe('A Tiled Branch');
    expect(level.lore.find((l) => l.id === 't1')).toBeTruthy();
  });

  it('rejects a map whose lorestone ref has no matching lore', () => {
    expect(() => tiledToSchema(map, { ...meta, lore: [] })).toThrow(/validation/i);
  });
});
