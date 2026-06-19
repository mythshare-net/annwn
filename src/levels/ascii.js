// Convert a legacy ASCII-grid level (the original `LEVELS` entry shape) into the unified
// schema. Mirrors the parsing in the original loadLevel(): grid chars S/E/W/B/3/L become
// entities and their cell becomes floor; '1'/'2' are walls; '.'/'0' are floor. Lorestone
// 'L' cells bind to lore defs in row-scan order (same as the original positional binding).

const GRID_WALL = { '1': 1, '2': 2 };

export function slugFromTitle(title) {
  const head = String(title).split('—')[0].split('-')[0].trim();
  return head.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function asciiLevelToSchema(L, index = 0) {
  const grid = L.grid;
  const height = grid.length, width = grid[0].length;
  const tiles = [];
  const entities = [];
  const lore = (L.lorestones || []).map((s) => ({ id: s.id, title: s.title, body: s.body }));
  let stoneIdx = 0;

  for (let y = 0; y < height; y++) {
    const row = [];
    const line = grid[y];
    for (let x = 0; x < width; x++) {
      const c = line[x];
      const cx = x + 0.5, cy = y + 0.5;
      if (c === 'S') { entities.push({ type: 'soul', x: cx, y: cy }); row.push(0); }
      else if (c === 'E') { entities.push({ type: 'enemy', kind: 'hound', x: cx, y: cy }); row.push(0); }
      else if (c === 'W') { entities.push({ type: 'enemy', kind: 'white', x: cx, y: cy }); row.push(0); }
      else if (c === 'B') { entities.push({ type: 'enemy', kind: 'boss', x: cx, y: cy }); row.push(0); }
      else if (c === '3') { entities.push({ type: 'exit', x: cx, y: cy }); row.push(0); }
      else if (c === 'L') {
        const ref = lore[stoneIdx % Math.max(1, lore.length)]?.id;
        entities.push({ type: 'lorestone', x: cx, y: cy, ref });
        stoneIdx++; row.push(0);
      } else row.push(GRID_WALL[c] || 0);
    }
    tiles.push(row);
  }

  // start + torches come from explicit fields, already in tile-center coords
  entities.push({ type: 'start', x: L.start.x, y: L.start.y, a: L.start.a || 0 });
  for (const t of (L.torches || [])) entities.push({ type: 'torch', x: t[0] + 0.5, y: t[1] + 0.5 });

  return {
    schema: 1,
    id: slugFromTitle(L.title) || `branch-${index + 1}`,
    name: L.name,
    title: L.title,
    branch: L.branch,
    tint: L.tint,
    ...(L.palette ? { palette: L.palette } : {}),
    boss: { name: L.bossName, death: L.bossDeath },
    story: L.story,
    verse: L.verse,
    source: 'authored',
    seed: null,
    width,
    height,
    tiles,
    entities,
    lore,
    soulPool: L.soulPool || [],
  };
}
