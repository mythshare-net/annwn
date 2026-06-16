// Copy the single-file build artifact to the repo root so GitHub Pages serves it
// at /annwn/index.html (the existing Pages config). Done as a post-step rather than
// building straight to root so a failed/partial build never corrupts the served file.
import { copyFileSync, existsSync, statSync } from 'node:fs';

const FROM = 'dist/index.html';
const TO = 'index.html';

if (!existsSync(FROM)) {
  console.error(`postbuild: ${FROM} not found — did the build run?`);
  process.exit(1);
}
copyFileSync(FROM, TO);
const kb = (statSync(TO).size / 1024).toFixed(1);
console.log(`postbuild: ${FROM} -> ${TO} (${kb} KB, single self-contained file)`);
