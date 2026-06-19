// Per-level palettes — derive a coherent set of surface/light colours from a level's `tint`,
// so every branch (authored, procedural, Tiled) can look distinct without hand-authoring.
// Pure and deterministic → unit-testable and safe to call at level-load time.
//
// A palette is { wall, wall2, floor, accent, light, fog } where each field is an [r,g,b] triple
// (0–255), except it is consumed by the renderer as: wall/wall2 → the two wall textures,
// floor → the floor texture, accent → wall seam colour, fog → ceiling/mist gradient, and
// light → a colour cast for torch/ambient lighting (see normLight()).

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const rgb = (a) => [clamp(a[0]), clamp(a[1]), clamp(a[2])];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Scale a colour so its average channel hits `target`, preserving hue.
function scaleTo(c, target) {
  const avg = (c[0] + c[1] + c[2]) / 3;
  const f = target / Math.max(avg, 1);
  return [c[0] * f, c[1] * f, c[2] * f];
}

const STONE = [80, 82, 80]; // neutral rock to desaturate tinted walls toward

/**
 * Derive a full palette from a dark mist `tint` ([r,g,b]). Deterministic and pure.
 * Lifts the tint's hue into mid-bright stone walls, a channel-rotated accent wall, an
 * earthier floor, dark seams, and a warm light cast biased slightly toward the tint hue.
 */
export function derivePalette(tint) {
  const t = Array.isArray(tint) && tint.length === 3 ? tint : [26, 30, 36];
  const wall = rgb(mix(STONE, scaleTo(t, 82), 0.6));
  // rotate channels for a contrasting-but-related second wall hue (tile value 2)
  const wall2 = rgb(mix(STONE, scaleTo([t[2], t[0], t[1]], 74), 0.58));
  const floor = rgb(scaleTo(mix(t, [40, 36, 30], 0.4), 30));
  const accent = rgb(scaleTo(t, 22)); // dark seams
  const light = rgb(mix([255, 220, 170], scaleTo(t, 200), 0.25)); // warm, tint-biased
  return { wall, wall2, floor, accent, light, fog: rgb(t) };
}

/** Fill in any missing fields of a partial palette from derivePalette(tint). */
export function resolvePalette(tint, partial) {
  const base = derivePalette(tint);
  if (!partial) return base;
  return {
    wall: partial.wall || base.wall,
    wall2: partial.wall2 || base.wall2,
    floor: partial.floor || base.floor,
    accent: partial.accent || base.accent,
    light: partial.light || base.light,
    fog: partial.fog || base.fog,
  };
}

/**
 * Normalise a light colour to a multiplier whose channels average ~1, so applying it as a
 * lighting cast shifts hue without darkening or brightening overall.
 */
export function normLight(light) {
  const c = Array.isArray(light) && light.length === 3 ? light : [255, 255, 255];
  const avg = (c[0] + c[1] + c[2]) / 3;
  if (avg <= 0) return [1, 1, 1];
  return [c[0] / avg, c[1] / avg, c[2] / avg];
}
