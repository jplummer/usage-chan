/* Does the simulator draw exactly what Figma exported?
 *
 *     node tools/verify-icons.js
 *
 * Renders a real dashboard through docs/sim, lifts the 32x32 box out of the
 * control column, and compares it against design/icons/<slug>.png thresholded
 * the same way tools/icons2c.py thresholds it. Since both sides now come from
 * the same generated bits, a non-zero count means something drifted -- a wrong
 * icon chosen for a state, a moved circle, a stale icons.js.
 *
 * This replaces an hour of eyeballing per icon. It is also the thing that
 * proves the pipeline: before the icons were generated, the same check ran at
 * 1-2% divergence, which was the cost of translating shapes by hand.
 */
const fs = require('fs'), vm = require('vm'), zlib = require('zlib');
const ROOT = require('path').dirname(__dirname);
const SIM = ROOT + '/docs/sim', ICONS = ROOT + '/design/icons';
const INSET = 4, SIZE = 32;

const ctx = { console, Math, atob: s => Buffer.from(s, 'base64').toString('binary'),
              document: { createElement: () => ({ getContext: () => ({}) }) } };
vm.createContext(ctx);
vm.runInContext('globalThis.window = globalThis;', ctx);
for (const f of ['fonts.js', 'lgfx.js', 'icons.js', 'screens.js'])
  vm.runInContext(fs.readFileSync(SIM + '/' + f, 'utf8'), ctx, { filename: f });
const { LGFX } = ctx, S = ctx.SCREENS, T = S.SHIPPED, V = S.V;

function png(path) {
  const d = fs.readFileSync(path);
  let off = 8, idat = [], w, h, color;
  while (off < d.length) {
    const n = d.readUInt32BE(off), k = d.toString('ascii', off + 4, off + 8);
    if (k === 'IHDR') { w = d.readUInt32BE(off + 8); h = d.readUInt32BE(off + 12); color = d[off + 17]; }
    if (k === 'IDAT') idat.push(d.slice(off + 8, off + 8 + n));
    if (k === 'IEND') break;
    off += 12 + n;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[color];
  const raw = zlib.inflateSync(Buffer.concat(idat), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v;
      switch (f) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        default: { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
                   v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      }
      out[y * stride + x] = v & 255;
    }
    p += stride;
  }
  // Linear light, matching tools/icons2c.py -- see lum() there for why.
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = i => ch <= 2 ? lin(out[i])
                           : lin(out[i]) * 0.3 + lin(out[i + 1]) * 0.59 + lin(out[i + 2]) * 0.11;
  let ink = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    ink = Math.max(ink, lum(((INSET + y) * w + INSET + x) * ch));
  const cut = (lum(0) + ink) / 2;
  const m = [];
  for (let y = 0; y < SIZE; y++) { const r = [];
    for (let x = 0; x < SIZE; x++) r.push(lum(((INSET + y) * w + INSET + x) * ch) > cut);
    m.push(r); }
  return m;
}

const base = { ok: true, h5: 34, e5: 0.52, d7: 31, e7: 0.46,
               reset5: '3:40pm', reset7: 'Fri 1pm', ageTxt: '47s', err: '' };
function ours(cy, extra) {
  const g = new LGFX(); S.dashboard(g, T, Object.assign({}, base, extra));
  const bg = g.px[0], m = [];
  for (let y = 0; y < SIZE; y++) { const r = [];
    for (let x = 0; x < SIZE; x++) r.push(g.px[(cy + y) * 320 + V.V_CTRL_X + x] !== bg);
    m.push(r); }
  return m;
}

const CASES = [
  ['menu',          V.V_CIRCLE_Y0, {}],
  ['wifi-hi',       V.V_CIRCLE_Y1, { rssi: -50 }],
  ['wifi-med',      V.V_CIRCLE_Y1, { rssi: -65 }],
  ['wifi-lo',       V.V_CIRCLE_Y1, { rssi: -80 }],
  ['wifi-out',      V.V_CIRCLE_Y1, { rssi: 0 }],
  ['wifi-med-alt',  V.V_CIRCLE_Y1, { rssi: -65, wifiGhost: false }],
  ['wifi-lo-alt',   V.V_CIRCLE_Y1, { rssi: -80, wifiGhost: false }],
  ['refresh-fail',  V.V_CIRCLE_Y2, { refreshFailed: true }],
];

let total = 0, worst = null;
for (const [slug, cy, st] of CASES) {
  const a = png(ICONS + '/' + slug + '.png'), b = ours(cy, st);
  let n = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (a[y][x] !== b[y][x]) n++;
  total += n;
  if (n && (!worst || n > worst.n)) worst = { slug, n, a, b };
  console.log((n === 0 ? 'ok   ' : 'DIFF ') + slug.padEnd(16) + n + ' px');
}
if (worst) {
  console.log('\nworst: ' + worst.slug + '   (# both, O figma only, X sim only)');
  for (let y = 0; y < SIZE; y++) {
    let r = '';
    for (let x = 0; x < SIZE; x++) { const p = worst.a[y][x], q = worst.b[y][x];
      r += p && q ? '#' : (p ? 'O' : (q ? 'X' : '.')); }
    console.log(String(y).padStart(3) + ' ' + r);
  }
}
console.log('\ntotal ' + total + ' differing pixels across ' + CASES.length + ' icons');
process.exit(total ? 1 : 0);
