import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { asciiLevelToSchema } from '../src/levels/ascii.js';
import { validateLevel } from '../src/levels/schema.js';

// The authored campaign is loaded by the game straight from src/data/levels/*.json
// (filename order), so these files ARE the four branches.
const FILES = readdirSync('src/data/levels').filter((f) => f.endsWith('.json')).sort();
const CAMPAIGN = FILES.map((f) => JSON.parse(readFileSync(`src/data/levels/${f}`, 'utf8')));

describe('authored campaign (src/data/levels)', () => {
  it('has the four branches, in order', () => {
    expect(CAMPAIGN.map((L) => L.name)).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('the game loads levels from the JSON, not an inline literal', () => {
    const js = readFileSync('src/main.js', 'utf8');
    expect(js).toMatch(/import\.meta\.glob\("\.\/data\/levels\/\*\.json"/);
    expect(js).not.toMatch(/grid:\s*\[/);
  });

  CAMPAIGN.forEach((L, i) => {
    describe(`${FILES[i]} — ${L.title}`, () => {
      const count = (t, kind) => L.entities.filter((e) => e.type === t && (!kind || e.kind === kind)).length;

      it('is a valid, winnable level', () => {
        expect(validateLevel(L).errors).toEqual([]);
      });
      it('is authored content with a named boss, story and verse', () => {
        expect(L.source).toBe('authored');
        expect(L.boss.name).toBeTruthy();
        expect(L.boss.death).toBeTruthy();
        expect(L.story).toBeTruthy();
        expect(L.verse).toBeTruthy();
      });
      it('has exactly one boss and one start', () => {
        expect(count('enemy', 'boss')).toBe(1);
        expect(count('start')).toBe(1);
      });
      it('every lore entry is placed as a lorestone (codex is completable)', () => {
        const placed = new Set(L.entities.filter((e) => e.type === 'lorestone').map((e) => e.ref));
        for (const s of L.lore) expect(placed.has(s.id)).toBe(true);
      });
      it('has at least as many soul-pool names as souls', () => {
        expect(L.soulPool.length).toBeGreaterThanOrEqual(count('soul'));
      });
    });
  });

  it('lore ids are unique across the campaign (codex keys)', () => {
    const ids = CAMPAIGN.flatMap((L) => L.lore.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ASCII → schema conversion', () => {
  const LEGACY = {
    name: 'T', title: 'Test Hall — A Fixture', branch: 'Tester', tint: [1, 2, 3],
    bossName: 'Warden · Of Tests', bossDeath: 'It falls.', story: 's', verse: 'v',
    grid: [
      '11111111',
      '1.S..L.1',
      '1.E.2..1',
      '1.W.2B.1',
      '1..L..31',
      '11111111',
    ],
    torches: [[1, 1], [6, 4]], start: { x: 1.5, y: 1.5, a: 0 },
    lorestones: [{ id: 'a', title: 'A', body: 'a' }, { id: 'b', title: 'B', body: 'b' }],
    soulPool: [{ name: 'One', line: '…' }],
  };
  const schema = asciiLevelToSchema(LEGACY, 0);
  const count = (t, kind) => schema.entities.filter((e) => e.type === t && (!kind || e.kind === kind)).length;

  it('produces a valid level', () => {
    expect(validateLevel(schema).errors).toEqual([]);
  });
  it('maps grid characters to entities and walls', () => {
    expect(count('soul')).toBe(1);
    expect(count('enemy', 'hound')).toBe(1);
    expect(count('enemy', 'white')).toBe(1);
    expect(count('enemy', 'boss')).toBe(1);
    expect(count('exit')).toBe(1);
    expect(count('lorestone')).toBe(2);
    expect(count('torch')).toBe(2);
    expect(schema.tiles[2][4]).toBe(2);
    expect(schema.tiles[1][2]).toBe(0);
  });
  it('binds lorestones to lore defs in row-scan order', () => {
    expect(schema.entities.filter((e) => e.type === 'lorestone').map((e) => e.ref)).toEqual(['a', 'b']);
  });
  it('derives the id from the title and keeps boss text', () => {
    expect(schema.id).toBe('test-hall');
    expect(schema.boss).toEqual({ name: 'Warden · Of Tests', death: 'It falls.' });
  });
});
