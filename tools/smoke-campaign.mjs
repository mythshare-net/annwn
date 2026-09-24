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
win.HTMLCanvasElement.prototype.requestPointerLock = () => {};
win.document.exitPointerLock = () => {};
win.AudioContext = win.webkitAudioContext = function () {
  return { createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
    createOscillator: () => ({ connect: () => anyObj(), frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '', start() {}, stop() {} }),
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

const overlay = doc.getElementById('overlay');
const key = (code) => win.dispatchEvent(new win.KeyboardEvent('keydown', { code }));
const frames = (n) => { for (let i = 0; i < n; i++) raf && raf(200 + 16 * i); };

// Tab opens the codex; Esc must close it back into play (it used to be a no-op)
key('Tab');
if (!doc.getElementById('closeCdx')) fail('Tab did not open the codex');
key('Escape');
if (!overlay.classList.contains('hidden')) fail('Esc did not close the codex');

// pause → Leave to Title returns to the title menu with the checkpoint intact
key('Escape');
const quit = doc.getElementById('quitBtn');
if (!quit) fail('pause menu has no Leave to Title button');
quit.click();
if (!doc.getElementById('startBtn')) fail('Leave to Title did not show the title');
frames(3);

// Continue from a later checkpoint loads that branch from the JSON level data
win.localStorage.setItem('annwn.save', JSON.stringify({ lvl: 3, souls: 5, diff: 'hard' }));
doc.querySelector('[data-diff="hard"]').click();   // re-renders the title
const cont = doc.getElementById('contBtn');
if (!cont) fail('Continue button missing for a lvl-3 checkpoint');
cont.click();
try { frames(8); } catch (e) { fail('branch IV render/AI loop threw:\n' + (e.stack || e)); }
const lvl4 = doc.querySelector('#lvl .val')?.textContent;
if (lvl4 !== 'IV') fail(`continued to "${lvl4}", expected "IV"`);
if (errors.length) fail('runtime errors after continue');

console.log(`CAMPAIGN SMOKE OK — hard trial persisted, checkpoint saved (lvl ${save.lvl}), Branch ${lvl} rendered; codex Esc, Leave to Title, Continue → Branch ${lvl4}`);
