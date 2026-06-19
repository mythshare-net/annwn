// Procedural level generation via ROT.js — the open-source world-building engine.
// Produces the SAME unified schema as authored/Tiled levels, so the loader and game
// consume generated and hand-made branches identically.
//
// Styles: 'digger'/'uniform' (rooms + corridors, guaranteed connected) and 'cellular'
// (organic "mist-cave"; we keep only the largest region so the result stays winnable).
import { Map as ROTMap } from 'rot-js';
import { setSeed, shuffle, pick } from '../engine/rng.js';
import { TILE, floorRegions, validateLevel } from './schema.js';

// Small public-domain-flavoured pools so generated branches are valid and atmospheric.
// Authentic Annwn / Mabinogion lore (public-domain sources) so generated branches read as
// richly as the hand-authored campaign. The generator surfaces a varied, seeded subset.
const DEFAULT_THEME = {
  name: '∞',
  branch: 'Annwn Unbound',
  lore: [
    { title: 'The Shifting Roads', body: 'The deep mist of Annwn keeps no fixed shape. Walls rise where none stood, and the ford moves with the year. Only the hounds remember the true path, and they do not share it.' },
    { title: 'Cŵn Annwn', body: 'White of body and red of ear, the Hounds of Annwn course the mist. Their cry is heard most clear on the eves of the great feasts and through the dark of autumn; to hear it near is a death-omen, and they alone of all hounds the dead obey.' },
    { title: 'The Pair Dadeni', body: 'The Cauldron of Rebirth restores the slain cast into it by night — but they rise mute, and remember nothing of who they were. Some say its breath still rises in the deep mist, and the nameless you free here are its work.' },
    { title: 'Caer Sidi', body: 'The Fortress of the Mound, the spiral caer, turns at the still centre of the Otherworld. "Complete was the prison of Gweir in Caer Sidi," sang Taliesin — and few who enter find the turning of the way out.' },
    { title: 'The Cauldron of the Chief of Annwn', body: 'Rimmed with pearl and warmed by the breath of nine maidens, the cauldron of Pen Annwn will not boil the food of a coward. From it Taliesin had his poetry, and for it Arthur sailed — and only seven returned.' },
    { title: 'Except Seven, None Returned', body: 'Three shiploads of Prydwen went into Annwn for its treasures, and out of Caer Sidi, Caer Feddwid and Caer Wydr only seven came home. The mist keeps the rest still.' },
    { title: 'Caer Wydr — the Glass Fort', body: 'The Fortress of Glass stands guarded by six thousand men upon its wall, and no word could be had of their sentinel. Past its bright unanswering ramparts the way runs on into deeper mist.' },
    { title: 'The Wild Hunt', body: 'Gwyn ap Nudd, given dominion over the demons of Annwn lest they destroy mankind, rides at the year\'s hinge with his hound Dormarth, gathering the souls of the slain. To meet the Hunt is to be counted among its quarry.' },
    { title: 'A World of Delights', body: 'Annwn is no hell but a country of feasting and eternal youth, where no disease comes and the meat is never spent. Yet for the living who walk it unready, its peace is only another kind of forgetting.' },
    { title: 'The Howling at Cadair Idris', body: 'On the high seat of Idris the spectral pack runs loudest, and the country folk bar their doors. To hear the Cŵn Annwn pass overhead is to be told, plainly, the hour of one\'s death.' },
  ],
  souls: [
    { name: 'A nameless shade', line: 'Which way was the ford? I have forgotten.' },
    { name: 'A bard of the mist', line: 'Sing me home — any home will do.' },
    { name: 'A huntsman of Dyfed', line: 'The walls were not here yesterday.' },
    { name: 'A drowned ferryman', line: 'I rose without a tongue, and yet I speak.' },
    { name: 'A maid of the hollow', line: 'The hounds passed close. Too close.' },
    { name: 'An old king', line: 'I wore another\'s face, and lost my own.' },
    { name: 'One of the seven', line: 'We sailed in three ships. Only seven of us came back.' },
    { name: 'A sentinel of the glass fort', line: 'Six thousand we were upon the wall. None of us answered.' },
    { name: 'Gweir, in his chains', line: 'My song has not ceased since they bound me in Caer Sidi.' },
    { name: 'A reborn warrior', line: 'The cauldron gave me back my body. It kept my name.' },
    { name: 'A girl who heard the pack', line: 'I barred the door. It was not enough.' },
    { name: 'A reveller of Caer Feddwid', line: 'The mead never ran dry. Neither did the years.' },
  ],
};
// Per-seed flavour THEMES so two procedural branches never feel identical. Each bundle ties a
// named fort to its own tint + palette (walls/floor/seams/light), so the look matches the name —
// the Glass Fort reads cold and pale, the Fort of Carousal warm and red, and so on.
const THEMES = [
  { title: 'The Endless Mist — A Procedural Branch',
    verse: '"No bard has sung this road, / for it is made new each time it is walked." — of the Endless Mist',
    tint: [22, 34, 32],
    palette: { wall: [72, 86, 74], wall2: [58, 80, 66], floor: [20, 30, 24], accent: [16, 26, 20], light: [210, 225, 180] } },
  { title: 'Caer Sidi — The Spiral Fort',
    verse: '"Complete was the prison of Gweir in Caer Sidi." — Preiddeu Annwfn',
    tint: [28, 26, 42],
    palette: { wall: [84, 78, 104], wall2: [70, 56, 108], floor: [26, 22, 34], accent: [22, 18, 30], light: [205, 190, 255] } },
  { title: 'Caer Feddwid — The Fort of Carousal',
    verse: '"Three full loads of Prydwen we went; / except seven, none rose up." — Preiddeu Annwfn',
    tint: [34, 24, 30],
    palette: { wall: [104, 76, 68], wall2: [116, 56, 52], floor: [34, 24, 22], accent: [40, 20, 18], light: [255, 200, 150] } },
  { title: 'Caer Wydr — The Fortress of Glass',
    verse: '"Beyond the Glass Fort they saw not the valour of Arthur." — Preiddeu Annwfn',
    tint: [20, 32, 40],
    palette: { wall: [120, 134, 150], wall2: [96, 120, 150], floor: [30, 38, 46], accent: [44, 56, 68], light: [200, 220, 255] } },
  { title: 'The Turning Ways of Annwn',
    verse: '"The first word from the cauldron, when was it spoken? / By the breath of nine maidens it was kindled." — Preiddeu Annwfn',
    tint: [24, 30, 38],
    palette: { wall: [84, 86, 90], wall2: [70, 72, 82], floor: [24, 28, 32], accent: [20, 22, 26], light: [230, 225, 210] } },
  { title: 'Beyond the Four Branches',
    verse: '"Beyond the Four Branches the mist keeps no map." — of the deep Otherworld',
    tint: [36, 30, 24],
    palette: { wall: [100, 86, 66], wall2: [96, 74, 48], floor: [32, 26, 18], accent: [28, 22, 14], light: [255, 215, 160] } },
];
// Organic cave dressing — selection is biased toward this when carving with the 'cellular' style.
const CAVE_THEME = {
  title: 'The Mist-Caves of Annwn',
  verse: '"In the four-cornered castle the mist runs underground; / its turning ways were never mapped." — of the Mist-Caves',
  tint: [20, 32, 28],
  palette: { wall: [64, 82, 68], wall2: [52, 74, 58], floor: [18, 28, 22], accent: [14, 22, 16], light: [190, 220, 180] },
};
const BOSSES = [
  { name: 'A Warden of the Deep Mist', death: 'The warden falls; the mist thins, and the way opens.' },
  { name: 'The Sentinel of the Glass Fort', death: 'The sentinel answers at last — by falling. The bright wall dims.' },
  { name: 'A Hound-Lord of Annwn', death: 'The crimson-eared lord is unmade; its pack scatters into mist.' },
  { name: 'A Reborn Champion of the Cauldron', death: 'You break what the cauldron remade. This time it does not rise.' },
];
const STORY = 'Beyond the Four Branches the mist has no map. Each crossing reshapes the Otherworld. Free the shades, unmake the warden, and find the portal before Annwn forgets your name.';

function carve(style, w, h) {
  let gen;
  if (style === 'cellular') {
    gen = new ROTMap.Cellular(w, h);
    gen.randomize(0.5);
    for (let i = 0; i < 4; i++) gen.create();
  } else if (style === 'uniform') {
    gen = new ROTMap.Uniform(w, h, { roomDugPercentage: 0.5 });
  } else {
    gen = new ROTMap.Digger(w, h);
  }
  const tiles = Array.from({ length: h }, () => new Array(w).fill(TILE.WALL));
  gen.create((x, y, v) => { tiles[y][x] = v ? TILE.WALL : TILE.FLOOR; });
  // force a solid border (schema invariant; also stops the raycaster marching off-map)
  for (let x = 0; x < w; x++) { tiles[0][x] = TILE.WALL; tiles[h - 1][x] = TILE.WALL; }
  for (let y = 0; y < h; y++) { tiles[y][0] = TILE.WALL; tiles[y][w - 1] = TILE.WALL; }
  const rooms = (gen.getRooms && gen.getRooms()) || [];
  return { tiles, rooms };
}

// Keep only the largest connected floor region; wall off the rest. Makes cellular winnable.
function keepLargestRegion(tiles) {
  const h = tiles.length, w = tiles[0].length;
  const id = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[y][x] !== TILE.FLOOR || id[y * w + x] !== -1) continue;
    const r = sizes.length; let size = 0;
    const stack = [y * w + x]; id[y * w + x] = r;
    while (stack.length) {
      const cur = stack.pop(); size++; const cx = cur % w, cy = (cur - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (tiles[ny][nx] !== TILE.FLOOR || id[ni] !== -1) continue;
        id[ni] = r; stack.push(ni);
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return;
  let best = 0; for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (id[y * w + x] !== -1 && id[y * w + x] !== best) tiles[y][x] = TILE.WALL;
}

function floorCells(tiles) {
  const cells = [];
  for (let y = 0; y < tiles.length; y++) for (let x = 0; x < tiles[0].length; x++) if (tiles[y][x] === TILE.FLOOR) cells.push([x, y]);
  return cells;
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Generate a procedural level. opts: { seed, width, height, style, theme, counts }. */
export function generateLevel(opts = {}) {
  const seed = setSeed(opts.seed ?? Math.floor(Math.random() * 1e9));
  const width = opts.width || 25;
  const height = opts.height || 25;
  const style = opts.style || 'digger';
  const theme = { ...DEFAULT_THEME, ...(opts.theme || {}) };
  // seeded flavour — pick one coherent THEME bundle (title + verse + tint + palette) so the
  // look matches the name; cellular caves lean toward the organic CAVE_THEME. Overridable via opts.theme.
  if (!theme.title) {
    const pool = style === 'cellular' ? [CAVE_THEME, CAVE_THEME, CAVE_THEME, ...THEMES] : THEMES;
    const bundle = pick(pool);
    theme.title = bundle.title;
    theme.verse = theme.verse || bundle.verse;
    theme.tint = theme.tint || bundle.tint;
    theme.palette = theme.palette || bundle.palette;
  }
  theme.boss = theme.boss || pick(BOSSES);
  theme.story = theme.story || STORY;
  const lorePool = shuffle(theme.lore);

  let tiles, cells;
  for (let attempt = 0; attempt < 8; attempt++) {
    ({ tiles } = carve(style, width, height));
    if (style === 'cellular') keepLargestRegion(tiles);
    cells = floorCells(tiles);
    if (cells.length >= 30 && floorRegions(tiles) === 1) break;
  }

  // Order floor cells by distance from a start anchor so we can place start near one end
  // and exit/boss near the far end.
  const anchor = cells[0];
  const byFar = cells.slice().sort((a, b) => dist2(b, anchor) - dist2(a, anchor));
  const startC = byFar[byFar.length - 1];
  const exitC = byFar[0];
  // boss: farthest cell from start that isn't the exit cell
  let bossC = exitC;
  for (const c of byFar) { if (c !== exitC) { bossC = c; break; } }

  const used = new Set([startC.join(','), exitC.join(','), bossC.join(',')]);
  const free = shuffle(cells.filter((c) => !used.has(c.join(','))));
  const take = () => free.pop();

  const counts = opts.counts || {};
  const nSouls = Math.min(counts.souls ?? 6, Math.max(3, free.length));
  const nHounds = Math.min(counts.hounds ?? 5, free.length);
  const nWhite = Math.min(counts.white ?? 2, free.length);
  const nLore = Math.min(counts.lore ?? 3, theme.lore.length, free.length);

  const entities = [];
  entities.push({ type: 'start', x: startC[0] + 0.5, y: startC[1] + 0.5, a: 0 });
  entities.push({ type: 'exit', x: exitC[0] + 0.5, y: exitC[1] + 0.5 });
  entities.push({ type: 'enemy', kind: 'boss', x: bossC[0] + 0.5, y: bossC[1] + 0.5 });

  const lore = [];
  for (let i = 0; i < nLore; i++) {
    const src = lorePool[i % lorePool.length];
    const id = `gen-${seed}-${i}`;
    lore.push({ id, title: src.title, body: src.body });
    const c = take(); if (!c) break;
    entities.push({ type: 'lorestone', x: c[0] + 0.5, y: c[1] + 0.5, ref: id });
  }
  for (let i = 0; i < nSouls; i++) { const c = take(); if (!c) break; entities.push({ type: 'soul', x: c[0] + 0.5, y: c[1] + 0.5 }); }
  for (let i = 0; i < nHounds; i++) { const c = take(); if (!c) break; entities.push({ type: 'enemy', kind: 'hound', x: c[0] + 0.5, y: c[1] + 0.5 }); }
  for (let i = 0; i < nWhite; i++) { const c = take(); if (!c) break; entities.push({ type: 'enemy', kind: 'white', x: c[0] + 0.5, y: c[1] + 0.5 }); }
  // a handful of torches for light
  for (let i = 0; i < 6; i++) { const c = take(); if (!c) break; entities.push({ type: 'torch', x: c[0] + 0.5, y: c[1] + 0.5 }); }

  const level = {
    schema: 1,
    id: `procedural-${seed}`,
    name: theme.name,
    title: theme.title,
    branch: theme.branch,
    tint: theme.tint,
    palette: theme.palette,
    boss: theme.boss,
    story: theme.story,
    verse: theme.verse,
    source: 'procedural',
    seed,
    style,
    width,
    height,
    tiles,
    entities,
    lore,
    soulPool: theme.souls,
  };

  const v = validateLevel(level);
  if (!v.ok) throw new Error(`generated level failed validation (seed ${seed}, style ${style}):\n  ${v.errors.join('\n  ')}`);
  return level;
}
