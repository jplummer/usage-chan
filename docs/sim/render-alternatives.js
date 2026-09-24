// Renders the ten alternatives to a PNG contact sheet, so they can be looked
// at without a browser. Companion to check-alternatives.js, which measures
// rather than draws. Run from the repo root:
//
//     node docs/sim/render-alternatives.js <outdir> [state]
//
// One sheet per state, eleven screens to a sheet with the shipped dashboard
// first. Pixels are written straight out at 1x -- the doubling the browser
// page does is for looking at type, and a sheet is for looking at layout.
// PNG is hand-rolled on zlib so the sim keeps needing nothing installed.
'use strict';
globalThis.window = globalThis;
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const here = __dirname;
for (const f of ['fonts.js', 'lgfx.js', 'icons.js', 'screens.js', 'dashboard-alternatives.js'])
  (0, eval)(fs.readFileSync(path.join(here, f), 'utf8'));

const outDir = process.argv[2] || '.';
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

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
  low: Object.assign(base(), { h5: 92, e5: 0.74, reset5: 'in 1h 12m' }),
  blocked: Object.assign(base(), {
    h5: 100, e5: 0.81, d7: 88, e7: 0.7, reset5: 'in 58m',
    overage: { active: true, status: 'rejected', remaining: 0, resetTxt: 'in 10d', disabledReason: 'payment_failed' },
  }),
  paying: Object.assign(base(), {
    h5: 100, e5: 0.6,
    overage: { active: true, status: 'allowed_warning', remaining: 0.19, resetTxt: 'in 10d', disabledReason: null },
  }),
  stale: Object.assign(base(), { ageTxt: '14m', err: 'http_-1', refreshFailing: true }),
  smoke: Object.assign(base(), { smoke: 2, ageTxt: '14m', err: 'http_-1', refreshFailing: true }),
  pileUp: Object.assign(base(), {
    h5: 92, e5: 0.74, d7: 88, e7: 0.7, reset5: 'in 1h 12m',
    batPct: 6, power: 'battery',
    ageTxt: '14m', err: 'http_-1', refreshFailing: true,
    overage: { active: true, status: 'rejected', remaining: 0, resetTxt: 'in 10d', disabledReason: 'payment_failed' },
  }),
};

const T = SCREENS.SHIPPED;
const g = new LGFX();
const layouts = [['shipped', SCREENS.dashboard]].concat(DASHALTS.list.map(e => [e[0], e[2]]));

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
const crc = bytes => {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function writeSheet(file, pixels, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const c = pixels[y * w + x], i = off + 1 + x * 3;
      raw[i] = c >> 16; raw[i + 1] = (c >> 8) & 0xff; raw[i + 2] = c & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const COLS = 4, PAD = 6, W = 320, H = 240;
const ROWS = Math.ceil(layouts.length / COLS);
const sw = COLS * (W + PAD) + PAD, sh = ROWS * (H + PAD) + PAD;

for (const key of Object.keys(states)) {
  if (only && key !== only) continue;
  const sheet = new Uint32Array(sw * sh).fill(0x303030);
  layouts.forEach(([, fn], i) => {
    fn(g, T, states[key]);
    const cx = PAD + (i % COLS) * (W + PAD), cy = PAD + ((i / COLS) | 0) * (H + PAD);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) sheet[(cy + y) * sw + cx + x] = g.px[y * W + x];
  });
  const file = path.join(outDir, 'alts-' + key + '.png');
  writeSheet(file, sheet, sw, sh);
  console.log(file);
}
