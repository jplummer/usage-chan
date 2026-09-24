// Headless text-fitting check for docs/sim/alternatives.html.
//
// Text fitting is the live problem on this screen, so the ten alternatives get
// measured rather than eyeballed. Loads the same scripts the page loads, wraps
// drawString to compute each string's real extent from the device's own glyph
// widths, and reports anything that runs past its layout's right edge or off
// the left. Run from the repo root:
//
//     node docs/sim/check-alternatives.js
//
// The limit is 272 for the layouts that keep the control column -- text is
// allowed to intrude on the menu's touch zone, but not on the glyphs -- and
// 318 for Verdict, which puts its menu in the opposite corner and owns the
// full width.
'use strict';
globalThis.window = globalThis;
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');

const fs = require('fs');
const path = require('path');
const here = __dirname;
for (const f of ['fonts.js', 'lgfx.js', 'icons.js', 'screens.js', 'dashboard-alternatives.js'])
  (0, eval)(fs.readFileSync(path.join(here, f), 'utf8'));

const T = SCREENS.SHIPPED;
const g = new LGFX();

let current = '';
let overflows = 0;
const seen = new Set();
const origDraw = LGFX.prototype.drawString;
LGFX.prototype.drawString = function (s, x, y, name) {
  const w = this.textWidth(s, name || this.font);
  const d = this.datum;
  let left = x;
  if (d & 1) left = x - (w >> 1); else if (d & 2) left = x - w;
  const right = left + w;
  // The straddle token is a mark on a bar's end, not a label, so it is
  // allowed past the text edge the way the shipped one is.
  if (s === '$') return origDraw.call(this, s, x, y, name);
  const limit = current.startsWith('4 ') ? 318 : 272;
  const key = current + '|' + s;
  if ((right > limit || left < 0) && !seen.has(key)) {
    seen.add(key); overflows++;
    console.log(current + '  OVERFLOW [' + s + '] w=' + w + ' x=' + left + '..' + right);
  }
  return origDraw.call(this, s, x, y, name);
};

// Plausible values, and then every state the screen has to survive.
const base = () => ({
  ok: true, h5: 34, e5: 0.52, d7: 31, e7: 0.46,
  reset5: 'in 2h 24m', reset7: 'in 4d 6h',
  sevenBinds: false, rssi: -55, batPct: 64, power: 'mains',
  ageTxt: '47s', err: '', fetching: false, pollFrac: 0.62, spinPhase: 1,
  refreshFailed: false, refreshFailing: false, smoke: 0,
  at5: 144, at7: 6120, atOv: 14400, soloThresh: 0.15,
});

const states = {
  normal: base(),
  full: Object.assign(base(), { h5: 0, e5: 0, reset5: 'in 4h 59m' }),
  low: Object.assign(base(), { h5: 92, e5: 0.74, reset5: 'in 1h 12m' }),
  out: Object.assign(base(), { h5: 100, e5: 1, reset5: 'resetting' }),
  sevenBinds: Object.assign(base(), { sevenBinds: true, d7: 70, e7: 0.5 }),
  invalid: Object.assign(base(), { ok: false, ageTxt: null, err: 'http_-1' }),
  stale: Object.assign(base(), { ageTxt: '14m', err: 'http_-1', refreshFailing: true }),
  smokeWifi: Object.assign(base(), { smoke: 1, ageTxt: '14m', err: 'http_-1' }),
  smokeApi: Object.assign(base(), { smoke: 2, ageTxt: '14m', err: 'http_-1' }),
  paying: Object.assign(base(), {
    h5: 100, e5: 0.6,
    overage: { active: true, status: 'allowed', remaining: 0.62, resetTxt: 'in 10d', disabledReason: null },
  }),
  nearCap: Object.assign(base(), {
    h5: 100, e5: 0.6,
    overage: { active: true, status: 'allowed_warning', remaining: 0.19, resetTxt: 'in 10d', disabledReason: null },
  }),
  blocked: Object.assign(base(), {
    h5: 100, e5: 0.81, d7: 88, e7: 0.7, reset5: 'in 58m',
    overage: { active: true, status: 'rejected', remaining: 0, resetTxt: 'in 10d', disabledReason: 'payment_failed' },
  }),
  batteryLow: Object.assign(base(), { batPct: 6, power: 'battery' }),
  batteryUnknown: Object.assign(base(), { batPct: 6, power: 'unknown' }),
  batteryUnreadable: Object.assign(base(), { batPct: -1, power: 'battery' }),
  pileUp: Object.assign(base(), {
    h5: 92, e5: 0.74, d7: 88, e7: 0.7, reset5: 'in 1h 12m',
    batPct: 6, power: 'battery',
    ageTxt: '14m', err: 'http_-1', refreshFailing: true,
    overage: { active: true, status: 'rejected', remaining: 0, resetTxt: 'in 10d', disabledReason: 'payment_failed' },
  }),
};

const layouts = [['shipped', SCREENS.dashboard]]
  .concat(DASHALTS.list.map(entry => [entry[0], entry[2]]));

let renders = 0, crashes = 0;
for (const [name, fn] of layouts)
  for (const key of Object.keys(states)) {
    current = name + ' / ' + key;
    try { fn(g, T, states[key]); renders++; }
    catch (err) { crashes++; console.log(current + '  THREW ' + err.message); }
  }

console.log(renders + ' renders, ' + crashes + ' crashes, ' + overflows + ' overflowing strings');
process.exit(crashes || overflows ? 1 : 0);
