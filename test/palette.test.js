import { describe, it, expect } from 'vitest';
import { derivePalette, resolvePalette, normLight } from '../src/levels/palette.js';

const isRGB = (v) => Array.isArray(v) && v.length === 3 &&
  v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

describe('palette derivation', () => {
  it('derives in-range [r,g,b] triples for every field', () => {
    const p = derivePalette([26, 40, 38]);
    for (const k of ['wall', 'wall2', 'floor', 'accent', 'light', 'fog']) {
      expect(isRGB(p[k]), `${k} should be an integer [r,g,b]`).toBe(true);
    }
  });

  it('is deterministic for a given tint', () => {
    expect(derivePalette([22, 30, 40])).toEqual(derivePalette([22, 30, 40]));
  });

  it('yields distinct walls for distinct tints', () => {
    const a = derivePalette([44, 20, 28]); // red branch
    const b = derivePalette([22, 30, 40]); // blue branch
    expect(a.wall).not.toEqual(b.wall);
    expect(a.fog).not.toEqual(b.fog);
  });

  it('carries the tint hue into the floor (warm tint → warmer floor)', () => {
    const warm = derivePalette([44, 20, 28]); // red-dominant
    expect(warm.floor[0]).toBeGreaterThan(warm.floor[2]); // r > b
    const cool = derivePalette([20, 30, 44]); // blue-dominant
    expect(cool.floor[2]).toBeGreaterThan(cool.floor[0]); // b > r
  });

  it('tolerates a missing/invalid tint with a sensible fallback', () => {
    const p = derivePalette(undefined);
    for (const k of ['wall', 'floor', 'light', 'fog']) expect(isRGB(p[k])).toBe(true);
  });
});

describe('resolvePalette', () => {
  it('fills missing fields from the derived palette', () => {
    const tint = [26, 40, 38];
    const base = derivePalette(tint);
    const p = resolvePalette(tint, { wall: [10, 20, 30] });
    expect(p.wall).toEqual([10, 20, 30]); // explicit kept
    expect(p.floor).toEqual(base.floor);  // missing filled
  });

  it('returns the derived palette when no partial is given', () => {
    const tint = [22, 30, 40];
    expect(resolvePalette(tint, null)).toEqual(derivePalette(tint));
  });
});

describe('normLight', () => {
  it('normalises channels to average ~1 (hue shift, no brightness change)', () => {
    const m = normLight([255, 220, 170]);
    expect((m[0] + m[1] + m[2]) / 3).toBeCloseTo(1, 5);
    expect(m[0]).toBeGreaterThan(m[2]); // warm: red boosted over blue
  });

  it('falls back to neutral for invalid input', () => {
    expect(normLight(null)).toEqual([1, 1, 1]);
    expect(normLight([0, 0, 0])).toEqual([1, 1, 1]);
  });
});
