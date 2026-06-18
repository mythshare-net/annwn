// Integration smoke: pick a difficulty, start the campaign, and verify the checkpoint +
// difficulty are persisted and a campaign level renders (exercises loadLevel + the new AI).
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('index.html', 'utf8');
const sm = html.match(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/);
const htmlNoScript = html.replace(sm[0], '');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e.detail || e.message || e)));
const dom = new JSDOM(htmlNoScript, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'https://example.com' });
const win = dom.window;
let raf = null;
win.requestAnimationFrame = (cb) => { raf = cb; return 1; };
win.cancelAnimationFrame = () => {};
function anyObj() {
  return new Proxy(function () { return anyObj(); }, {
    get(_t, p) { if (p === 'data') return new Uint8ClampedArray(4); if (p === 'width' || p === 'height') return 64; if (p === Symbol.toPrimitive) return () => 0; return anyObj(); }, set() { return true; },
  });
}
win.HTMLCanvasElement.prototype.getContext = () => anyObj();
win.AudioContext = win.webkitAudioContext = function () {
  return { createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
    createOscillator: () => ({ connect: () => anyObj(), frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '', start() {}, stop() {} }),
    createBiquadFilter: () => anyObj(), createBufferSource: () => anyObj(), createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    destination: {}, state: 'running', resume() {}, currentTime: 0, sampleRate: 44100 };
};

const fail = (m) => { console.error('CAMPAIGN SMOKE FAIL — ' + m + (errors.length ? '\n' + errors.join('\n') : '')); process.exit(1); };
try { win.eval(sm[1]); } catch (e) { fail('boot threw:\n' + (e.stack || e)); }
const doc = win.document;

// pick the hard trial, then start the campaign
const hard = doc.querySelector('[data-diff="hard"]');
if (!hard) fail('difficulty selector missing');
hard.click();
if (win.localStorage.getItem('annwn.diff') !== 'hard') fail('difficulty not persisted');

doc.getElementById('startBtn').click();            // loadLevel(0) writes a checkpoint, then story
const save = JSON.parse(win.localStorage.getItem('annwn.save') || 'null');
if (!save || save.lvl !== 0 || save.diff !== 'hard') fail('checkpoint not written: ' + JSON.stringify(save));

doc.getElementById('goBtn').click();               // enter play
try { for (let i = 0; i < 8; i++) raf && raf(16 * (i + 1)); } catch (e) { fail('campaign render/AI loop threw:\n' + (e.stack || e)); }

const lvl = doc.querySelector('#lvl .val')?.textContent;
if (errors.length) fail('runtime errors during campaign play');
if (lvl !== 'I') fail(`level label "${lvl}", expected "I"`);
console.log(`CAMPAIGN SMOKE OK — hard trial persisted, checkpoint saved (lvl ${save.lvl}), Branch ${lvl} rendered`);
