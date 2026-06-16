# ANNWN — The Hunt of Arawn

A retro first-person dungeon raycaster set in the Welsh *Mabinogion* — walk the Four Branches
of the Otherworld, free the bound shades, read the lorestones, unmake each warden, and find
your way home. Pure HTML5 Canvas, no engine.

▶ **Play:** open `index.html` (it's a single self-contained file) or visit the GitHub Pages site.

## Develop

The game source now lives in `src/` and builds, via [Vite](https://vitejs.dev) +
[`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile), back into
**one** self-contained `index.html` so it still works from `file://` and on GitHub Pages.

```bash
npm install
npm run dev       # dev server with hot reload (src/index.html)
npm run build     # bundle → dist/index.html, copied to ./index.html for Pages
npm test          # schema validation, generator invariants, round-trip parity
npm run validate  # validate authored level data
npm run lint
node tools/smoke.mjs   # headless boot check
```

### Layout
```
src/
  index.html  styles.css  main.js     # game shell + engine (the original monolith, split out)
  levels/  schema.js        # unified level schema + validate() (reachability invariant)
           ascii.js         # legacy ASCII grid → schema converter
           generate.js      # ROT.js procedural generation → schema
  engine/  rng.js           # seeded RNG (rot-js) for reproducible levels/runs
  data/levels/*.json        # the four authored branches, data-driven
tools/   extract-levels · validate-levels · gen-preview · smoke · postbuild
test/    schema · generate · loader   # 100+ tests
```

## World-building tools

Levels are data, validated and (optionally) generated, all sharing one schema (see the
`level-author` skill in `.claude/skills/`):

- **Authored** JSON under `src/data/levels/` — extracted from the original hand-typed grids.
- **Procedural** via **[ROT.js](https://ondras.github.io/rot.js/)** (MIT): `generateLevel({ seed, style })`
  with `digger` / `uniform` / `cellular` styles. Seeded for reproducible, shareable levels.
- **Tiled** import (planned): translate a [Tiled](https://www.mapeditor.org/) JSON export into the
  same schema.

Every level — authored or generated — must pass `validateLevel()`, whose key invariant is
**winnability**: the exit, boss, every soul and lorestone must be reachable on foot from the
start. (This caught a real bug — Branch IV's finale chamber was sealed and unwinnable; now fixed.)

Preview any level as ASCII:
```bash
node tools/gen-preview.mjs --seed 42 --style cellular
node tools/gen-preview.mjs --file src/data/levels/04-caer-dathyl.json
```
