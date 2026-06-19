// Unified level schema — one shape emitted by all three sources (hand-authored, Tiled
// export, procedural generation) and consumed by one loader. See plan "Architecture".
//
// A level:
//   { schema:1, id, name, title, branch, tint:[r,g,b], boss:{name,death},
//     story, verse, source:"authored"|"tiled"|"procedural", seed,
//     width, height,
//     tiles:  height rows of width ints  (0=floor, 1=wall, 2=special wall)
//     entities: [{type,x,y,...}]  start|exit|torch|soul|enemy(kind)|lorestone(ref)
//     lore:    [{id,title,body}]
//     soulPool:[{name,line}] }

export const TILE = { FLOOR: 0, WALL: 1, SPECIAL: 2 };
export const ENTITY_TYPES = ['start', 'exit', 'torch', 'soul', 'enemy', 'lorestone'];
export const ENEMY_KINDS = ['hound', 'white', 'boss'];
// entity types that MUST sit on a walkable floor tile
const ON_FLOOR = new Set(['start', 'exit', 'soul', 'enemy', 'lorestone']);

function isWall(v) { return v === TILE.WALL || v === TILE.SPECIAL; }

/** Flood-fill reachability over floor tiles (4-connected). Returns true if (tx,ty) is
 *  reachable from (sx,sy). The single most important invariant for generated levels. */
export function reachable(tiles, sx, sy, tx, ty) {
  const h = tiles.length, w = tiles[0].length;
  const si = (Math.floor(sy) * w) + Math.floor(sx);
  const ti = (Math.floor(ty) * w) + Math.floor(tx);
  const seen = new Uint8Array(w * h);
  const stack = [si];
  seen[si] = 1;
  while (stack.length) {
    const cur = stack.pop();
    if (cur === ti) return true;
    const cx = cur % w, cy = (cur - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] || isWall(tiles[ny][nx])) continue;
      seen[ni] = 1; stack.push(ni);
    }
  }
  return false;
}

/** Count the connected floor regions — generators must produce exactly one. */
export function floorRegions(tiles) {
  const h = tiles.length, w = tiles[0].length;
  const seen = new Uint8Array(w * h);
  let regions = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isWall(tiles[y][x]) || seen[y * w + x]) continue;
    regions++;
    const stack = [y * w + x]; seen[y * w + x] = 1;
    while (stack.length) {
      const cur = stack.pop(); const cx = cur % w, cy = (cur - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || isWall(tiles[ny][nx])) continue;
        seen[ni] = 1; stack.push(ni);
      }
    }
  }
  return regions;
}

/** Validate a level object. Returns { ok, errors:[], warnings:[] }. */
export function validateLevel(L) {
  const errors = [], warnings = [];
  const e = (m) => errors.push(m), w = (m) => warnings.push(m);

  if (!L || typeof L !== 'object') return { ok: false, errors: ['level is not an object'], warnings };
  if (L.schema !== 1) e(`schema must be 1 (got ${L.schema})`);
  for (const k of ['id', 'name', 'title']) if (typeof L[k] !== 'string' || !L[k]) e(`${k} must be a non-empty string`);
  if (!Array.isArray(L.tint) || L.tint.length !== 3) e('tint must be [r,g,b]');
  if (L.palette != null) {
    if (typeof L.palette !== 'object') e('palette must be an object');
    else for (const k of ['wall', 'wall2', 'floor', 'accent', 'light', 'fog']) {
      const v = L.palette[k];
      if (v != null && (!Array.isArray(v) || v.length !== 3)) e(`palette.${k} must be [r,g,b]`);
    }
  }
  if (!L.boss || typeof L.boss.name !== 'string') w('boss.name missing');

  // tiles
  if (!Array.isArray(L.tiles) || !L.tiles.length) { e('tiles missing'); return { ok: false, errors, warnings }; }
  const h = L.tiles.length, width = L.tiles[0].length;
  if (L.height !== h) e(`height (${L.height}) != tiles rows (${h})`);
  if (L.width !== width) e(`width (${L.width}) != tiles cols (${width})`);
  for (let y = 0; y < h; y++) {
    if (L.tiles[y].length !== width) { e(`row ${y} has ragged width`); continue; }
    for (let x = 0; x < width; x++) {
      const v = L.tiles[y][x];
      if (v !== 0 && v !== 1 && v !== 2) e(`tile (${x},${y}) has illegal value ${v}`);
      if ((y === 0 || y === h - 1 || x === 0 || x === width - 1) && !isWall(v)) e(`border tile (${x},${y}) is not solid`);
    }
  }
  const tileAt = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= h) return TILE.WALL;
    return L.tiles[iy][ix];
  };

  // entities
  const ents = Array.isArray(L.entities) ? L.entities : (e('entities missing'), []);
  const loreIds = new Set((L.lore || []).map((s) => s.id));
  let starts = 0, exits = 0, bosses = 0;
  for (const en of ents) {
    if (!ENTITY_TYPES.includes(en.type)) { e(`unknown entity type "${en.type}"`); continue; }
    if (typeof en.x !== 'number' || typeof en.y !== 'number') { e(`entity ${en.type} missing x/y`); continue; }
    if (ON_FLOOR.has(en.type) && isWall(tileAt(en.x, en.y))) e(`${en.type} at (${en.x},${en.y}) is inside a wall`);
    if (en.type === 'start') starts++;
    if (en.type === 'exit') exits++;
    if (en.type === 'enemy') {
      if (!ENEMY_KINDS.includes(en.kind)) e(`enemy at (${en.x},${en.y}) has bad kind "${en.kind}"`);
      if (en.kind === 'boss') bosses++;
    }
    if (en.type === 'lorestone' && !loreIds.has(en.ref)) e(`lorestone references unknown lore "${en.ref}"`);
  }
  if (starts !== 1) e(`expected exactly 1 start (got ${starts})`);
  if (exits < 1) e('expected at least 1 exit');
  if (bosses !== 1) w(`expected exactly 1 boss (got ${bosses})`);
  if (!Array.isArray(L.soulPool) || !L.soulPool.length) w('soulPool is empty');

  // reachability: every floor-bound entity must be reachable from start
  const start = ents.find((en) => en.type === 'start');
  if (start && errors.length === 0) {
    for (const en of ents) {
      if (!ON_FLOOR.has(en.type) || en.type === 'start') continue;
      if (!reachable(L.tiles, start.x, start.y, en.x, en.y)) e(`${en.type} at (${en.x},${en.y}) is not reachable from start`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
