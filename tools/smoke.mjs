// Headless smoke test: load the built single-file index.html in jsdom and assert the
// game boots to the title screen without throwing. Catches DOM/boot regressions that
// syntax checks miss.
//
// Note: jsdom does not execute <script type="module">. The game code uses no import/export
// (it was authored as one classic script), so we strip the inline module tag and run its
// text in the window's global scope via window.eval — behaviourally equivalent for boot.
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('SMOKE FAIL — no inline module script in built file'); process.exit(1); }
const scriptText = scriptMatch[1];
const htmlNoScript = html.replace(scriptMatch[0], '');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message || e)));

const dom = new JSDOM(htmlNoScript, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const win = dom.window;

// Stub the few APIs jsdom lacks so boot doesn't crash on unrelated features.
win.requestAnimationFrame = () => 0;
win.cancelAnimationFrame = () => {};
// Universal duck-typed object: callable, indexable, and any property is itself one.
// Covers the 2D context, gradients (addColorStop), ImageData (.data), etc. used at load.
function anyObj() {
  return new Proxy(function () { return anyObj(); }, {
    get(_t, p) {
      if (p === 'data') return new Uint8ClampedArray(4);
      if (p === 'width' || p === 'height') return 64;
      if (p === Symbol.toPrimitive) return () => 0;
      return anyObj();
    },
    set() { return true; },
  });
}
win.HTMLCanvasElement.prototype.getContext = () => anyObj();
win.AudioContext = win.webkitAudioContext = function () {
  return { createGain: () => ({ connect() {}, gain: {} }), destination: {}, state: 'suspended', resume() {} };
};

try {
  win.eval(scriptText);
} catch (e) {
  console.error('SMOKE FAIL — boot threw:\n' + (e.stack || e));
  process.exit(1);
}

const titleShown = !!win.document.getElementById('scrollContent')?.innerHTML;
const hasCanvas = !!win.document.getElementById('game');

if (errors.length) { console.error('SMOKE FAIL — runtime errors:\n' + errors.join('\n')); process.exit(1); }
if (!hasCanvas) { console.error('SMOKE FAIL — #game canvas missing'); process.exit(1); }
if (!titleShown) { console.error('SMOKE FAIL — title screen did not render'); process.exit(1); }
console.log('SMOKE OK — game boots to title screen, no runtime errors');
