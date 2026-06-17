import { describe, it, expect } from 'vitest';
import { pathStep } from '../src/ai/pathfinding.js';

// 0 = floor, 1 = wall
const grid = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
];
const passable = (x, y) => x >= 0 && y >= 0 && x < 5 && y < 5 && grid[y][x] === 0;

describe('ROT.js A* pathfinding', () => {
  it('returns the first hop toward the goal', () => {
    const step = pathStep(passable, 1, 1, 3, 1);
    expect(step).toEqual([2, 1]); // straight along the open top row
  });

  it('routes around a wall (the centre block)', () => {
    // from (1,3) to (3,3): the direct cell (2,3) is open, so step is (2,3)…
    expect(pathStep(passable, 1, 3, 3, 3)).toEqual([2, 3]);
    // …but from (1,1) to (3,3) it must go around — never steps onto the wall (2,2)
    const step = pathStep(passable, 1, 1, 3, 3);
    expect(step).not.toEqual([2, 2]);
    expect(passable(step[0], step[1])).toBe(true);
  });

  it('returns null when already at the goal', () => {
    expect(pathStep(passable, 1, 1, 1, 1)).toBe(null);
  });

  it('returns null when the goal is unreachable', () => {
    const sealed = [
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    const p = (x, y) => x >= 0 && y >= 0 && x < 5 && y < 5 && sealed[y][x] === 0;
    expect(pathStep(p, 1, 1, 3, 1)).toBe(null);
  });
});
