// Import a Tiled (https://www.mapeditor.org/) map — "File → Export As → JSON" — into the
// unified level schema, so branches can be designed in a real editor instead of typed grids.
//
// Expected Tiled structure:
//   - one TILE LAYER (type "tilelayer") whose non-zero GIDs are walls. A tile's wall variant
//     is read from the tileset tile property `special` (true → tile 2), else a normal wall (1).
//   - one OBJECT LAYER (type "objectgroup"); each object's Class (`class`/`type`) is the entity
//     type (start|exit|torch|soul|enemy|lorestone) and custom properties carry kind/ref/a.
//   - long prose (title/story/lore/soulPool/…) comes from a sidecar `meta` object, since editing
//     paragraphs inside Tiled is painful.
import { validateLevel } from './schema.js';

// Normalize Tiled properties (array of {name,value} in modern JSON; object map in older) → map.
function props(o) {
  const out = {};
  if (Array.isArray(o?.properties)) for (const p of o.properties) out[p.name] = p.value;
  else if (o?.properties && typeof o.properties === 'object') Object.assign(out, o.properties);
  return out;
}

// Resolve a GID to a schema tile value (0 floor / 1 wall / 2 special) using tileset properties.
function gidToTile(gid, tilesets) {
  if (!gid) return 0;
  let ts = null;
  for (const t of tilesets) if (gid >= t.firstgid) ts = (!ts || t.firstgid > ts.firstgid) ? t : ts;
  if (ts && Array.isArray(ts.tiles)) {
    const local = gid - ts.firstgid;
    const def = ts.tiles.find((td) => td.id === local);
    if (def && props(def).special) return 2;
  }
  return 1;
}

/** Convert a parsed Tiled JSON map (+ sidecar meta) into a validated unified-schema level. */
export function tiledToSchema(map, meta = {}) {
  const W = map.width, H = map.height;
  const tw = map.tilewidth || 1, th = map.tileheight || 1;
  const tileLayer = (map.layers || []).find((l) => l.type === 'tilelayer');
  if (!tileLayer) throw new Error('Tiled map has no tile layer');

  const tiles = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(gidToTile(tileLayer.data[y * W + x], map.tilesets || []));
    tiles.push(row);
  }

  const entities = [];
  for (const layer of (map.layers || [])) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of (layer.objects || [])) {
      const type = o.class || o.type;
      if (!type) continue;
      const p = props(o);
      // Tiled object x/y are pixels; point/rect objects use top-left, tile objects use bottom-left.
      const py = o.gid ? o.y - th / 2 : o.y;
      const x = Math.floor(o.x / tw) + 0.5;
      const yy = Math.floor(py / th) + 0.5;
      const e = { type, x, y: yy };
      if (type === 'enemy') e.kind = p.kind || 'hound';
      if (type === 'lorestone') e.ref = p.ref;
      if (type === 'start' && p.a != null) e.a = Number(p.a);
      entities.push(e);
    }
  }

  const level = {
    schema: 1,
    id: meta.id || map.class || 'tiled-level',
    name: meta.name || '?',
    title: meta.title || 'A Tiled Branch',
    branch: meta.branch || '',
    tint: meta.tint || [26, 30, 36],
    ...(meta.palette ? { palette: meta.palette } : {}),
    boss: meta.boss || { name: 'A Warden', death: 'The warden falls.' },
    story: meta.story || '',
    verse: meta.verse || '',
    source: 'tiled',
    seed: null,
    width: W,
    height: H,
    tiles,
    entities,
    lore: meta.lore || [],
    soulPool: meta.soulPool || [],
  };

  const v = validateLevel(level);
  if (!v.ok) throw new Error('Tiled import failed validation:\n  ' + v.errors.join('\n  '));
  return level;
}
