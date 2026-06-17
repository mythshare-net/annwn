// Integration smoke: drive the built game into "The Endless Mist" via real DOM clicks and
// tick the render loop on the procedurally-generated level. Verifies loadSchemaLevel() +
// rendering of a ROT.js level work at runtime — the part unit tests can't cover headlessly.
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('index.html', 'utf8');
const sm = html.match(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/);
const scriptText = sm[1];
const htmlNoScript = html.replace(sm[0], '');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message || e)));

const dom = new JSDOM(htmlNoScript, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const win = dom.window;
let raf = null;
win.requestAnimationFrame = (cb) => { raf = cb; return 1; };
win.cancelAnimationFrame = () => {};
function anyObj() {
  return new Proxy(function () { return anyObj(); }, {
    get(_t, p) {
      if (p === 'data') return new Uint8ClampedArray(4);
      if (p === 'width' || p === 'height') return 64;
      if (p === Symbol.toPrimitive) return () => 0;
      return anyObj();
    }, set() { return true; },
  });
}
win.HTMLCanvasElement.prototype.getContext = () => anyObj();
win.AudioContext = win.webkitAudioContext = function () {
  return { createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
    createOscillator: () => ({ connect: () => anyObj(), frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '', start() {}, stop() {} }),
    createBiquadFilter: () => anyObj(), createBufferSource: () => anyObj(),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    destination: {}, state: 'running', resume() {}, currentTime: 0, sampleRate: 44100 };
};

const fail = (m) => { console.error('ENDLESS SMOKE FAIL — ' + m + (errors.length ? '\n' + errors.join('\n') : '')); process.exit(1); };
try { win.eval(scriptText); } catch (e) { fail('boot threw:\n' + (e.stack || e)); }

const doc = win.document;
const btn = doc.getElementById('endlessBtn');
if (!btn) fail('no Endless Mist button on title screen');
btn.click();                                   // → startEndless → showEndlessStory (state 'story')
const go = doc.getElementById('goBtn');
if (!go) fail('Descend button did not appear after choosing Endless Mist');
go.click();                                    // → loadSchemaLevel (state 'play')

// tick the loop a few frames to exercise update()+render() on the generated level
try { for (let i = 0; i < 5; i++) raf && raf(16 * (i + 1)); } catch (e) { fail('render loop threw on procedural level:\n' + (e.stack || e)); }

const lvlLabel = doc.querySelector('#lvl .val')?.textContent;
const soulLabel = doc.querySelector('#soul .val')?.textContent;
if (errors.length) fail('runtime errors during endless play');
if (lvlLabel !== '∞') fail(`level label is "${lvlLabel}", expected "∞" (procedural)`);
if (!/^\d+\/\d+$/.test(soulLabel || '')) fail(`soul counter "${soulLabel}" looks wrong`);
console.log(`ENDLESS SMOKE OK — generated level loaded & rendered (level=${lvlLabel}, souls=${soulLabel})`);
