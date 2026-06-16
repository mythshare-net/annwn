// Seeded RNG wrapper around rot-js's RNG. Centralizes randomness so a seed reproduces
// both procedural level generation AND (once wired into the engine) gameplay rolls —
// enabling shareable seeds / "daily Annwn". Replaces bare Math.random() going forward.
import { RNG } from 'rot-js';

export function setSeed(seed) {
  const s = (seed >>> 0) || 1;
  RNG.setSeed(s);
  return s;
}
export function rand() { return RNG.getUniform(); }            // [0,1)
export function randInt(min, max) { return Math.floor(RNG.getUniform() * (max - min + 1)) + min; }
export function pick(arr) { return arr[Math.floor(RNG.getUniform() * arr.length)]; }
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(RNG.getUniform() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export { RNG };
