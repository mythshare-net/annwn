// One-time migration: split the original single-file game into Vite source files.
// Reads the backed-up original and emits src/index.html, src/styles.css, src/main.js.
// Faithful extraction — no behavioral change. Safe to delete after Phase 1.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = '/tmp/annwn-original.html';
const html = readFileSync(SRC, 'utf8');

// Extract <style>…</style> (first occurrence) and <script>…</script> (first occurrence).
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch) throw new Error('no <style> block found');
if (!scriptMatch) throw new Error('no <script> block found');

let css = styleMatch[1].replace(/^\n/, '');
let js = scriptMatch[1].replace(/^\n/, '');

// Build the HTML shell: replace inline style/script with external references.
let shell = html
  .replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="./styles.css">')
  .replace(/<script>[\s\S]*?<\/script>/, '<script type="module" src="./main.js"></script>');

writeFileSync('src/styles.css', css);
writeFileSync('src/main.js', js);
writeFileSync('src/index.html', shell);

console.log(`styles.css: ${css.split('\n').length} lines`);
console.log(`main.js:    ${js.split('\n').length} lines`);
console.log(`index.html: ${shell.split('\n').length} lines`);
