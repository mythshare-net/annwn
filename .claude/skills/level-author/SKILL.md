---
name: level-author
description: Author, generate, and validate ANNWN levels. Use when creating a new branch/level, editing level JSON under src/data/levels, generating procedural levels with ROT.js, importing a Tiled map, or debugging level layout/reachability. Knows the unified level schema, the tile legend, and the validation invariants.
---

# ANNWN level authoring

ANNWN levels use one **unified schema** (`src/levels/schema.js`) consumed by the engine
regardless of source: hand-authored JSON, ROT.js procedural generation, or a Tiled export.
Always validate before shipping — CI runs `npm run validate` and the test suite.

## Schema (src/data/levels/*.json)

```jsonc
{
  "schema": 1,
  "id": "glyn-cuch",            // unique slug
  "name": "I",                  // short HUD label
  "title": "Glyn Cuch — The First Branch",
  "branch": "Pwyll, Prince of Dyfed",
  "tint": [26, 40, 38],          // [r,g,b] mist colour
  "boss": { "name": "...", "death": "..." },
  "story": "...", "verse": "...",
  "source": "authored",          // authored | tiled | procedural
  "seed": null,                  // set for procedural (reproducible)
  "width": 16, "height": 16,
  "tiles": [[0,1,2,...], ...],   // height rows × width cols
  "entities": [ ... ],           // see below; coords are tile-CENTERS (x+0.5, y+0.5)
  "lore": [ { "id", "title", "body" } ],
  "soulPool": [ { "name", "line" } ]
}
```

### Tiles
- `0` floor (walkable) · `1` wall · `2` special wall (still **solid** — blocks movement & sight).
- The outer border must be solid wall.

### Entities (`type`, float `x`/`y` at tile centers)
- `start` (also `a` = facing angle, radians) — exactly one.
- `exit` — at least one.
- `enemy` with `kind`: `hound` | `white` | `boss` — exactly one `boss`.
- `soul` — freed by walking adjacent; assigned a name from `soulPool` at load.
- `lorestone` with `ref` → must match a `lore[].id`.
- `torch` — light source (may sit in/near walls).

## Critical invariant — winnability
Every `soul`, `lorestone`, `boss`, and `exit` MUST be reachable on foot from `start`.
Souls free only by proximity and the boss only takes damage with line-of-sight, so a sealed
region makes a level **unwinnable** (this was a real shipped bug in Branch IV). `validateLevel`
enforces reachability via flood-fill — never bypass it.

## Workflows

**Validate** all authored levels: `npm run validate`
**Preview** a level as ASCII: `node tools/gen-preview.mjs --file src/data/levels/04-caer-dathyl.json`

**Generate** procedurally (ROT.js — `src/levels/generate.js`):
```js
import { generateLevel } from './src/levels/generate.js';
const lvl = generateLevel({ seed: 42, style: 'digger', width: 25, height: 25 });
// styles: 'digger' | 'uniform' | 'cellular' (cellular keeps only the largest region)
```
Preview one: `node tools/gen-preview.mjs --seed 42 --style cellular`

**Convert** a legacy ASCII grid (old `LEVELS` shape) → schema: `asciiLevelToSchema()` in
`src/levels/ascii.js`. Re-extract the four authored branches with `node tools/extract-levels.mjs`.

**Tiled import** (`src/levels/tiled.js`): translate a [Tiled](https://www.mapeditor.org/) JSON
export ("File → Export As → JSON") with `tiledToSchema(map, meta)`, or via the CLI:
`node tools/import-tiled.mjs <map.tiled.json> <meta.json> [out.json]`.
- One **tile layer**: non-zero GIDs are walls; a tileset tile property `special: true` → tile 2.
- One **object layer**: each object's Class (`start`/`exit`/`torch`/`soul`/`enemy`/`lorestone`) is the
  entity type; custom properties carry `kind` (enemy), `ref` (lorestone), `a` (start angle).
- Prose/lore/soulPool/boss/tint/title/id come from the sidecar `meta` JSON. The result is piped
  through `validateLevel` automatically.

## After any level change
1. `npm run validate` (and `npm test` for the round-trip/parity + reachability tests)
2. `npm run build` then `node tools/smoke.mjs` to confirm the game still boots.
