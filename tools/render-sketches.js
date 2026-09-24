// Throwaway: renders every sketch headless so they can be looked at without a
// browser. Lives under build/, which is gitignored.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'sim');
const OUT = path.join(__dirname, '..', 'build', 'sketch-out');
fs.mkdirSync(OUT, { recursive: true });
global.window = global;
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.document = { createElement: () => ({ getContext: () => ({}) }) };
for (const f of ['fonts.js', 'lgfx.js', 'icons.js', 'screens.js', 'qr.js', 'sketch-variants.js'])
  eval(fs.readFileSync(path.join(DIR, f), 'utf8'));

let tbl = null;
function crc32(buf) {
  if (!tbl) { tbl = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tbl[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = tbl[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(g, scale, out) {
  const w = g.w * scale, h = g.h * scale;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const c = g.px[((y / scale) | 0) * g.w + ((x / scale) | 0)];
      raw[p++] = (c >> 16) & 255; raw[p++] = (c >> 8) & 255; raw[p++] = c & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const T = SCREENS.SHIPPED, g = new LGFX();
const mk = (bad, power, gauge) => {
  const s = Object.assign({}, bad ? SKETCH.DEGRADED : SKETCH.NOMINAL);
  if (power) s.power = power;
  if (gauge === false) s.batPct = -1;
  s.brightness = 3;
  return s;
};
const cases = [['ok', mk(false)], ['bad', mk(true)], ['unk', mk(false, 'unknown', false)]];
let fail = 0;
for (const group of ['panel', 'legend', 'url'])
  for (const name of Object.keys(SKETCH[group]))
    for (const [tag, s] of cases) {
      if (group !== 'panel' && tag === 'unk') continue;
      try {
        SKETCH[group][name](g, T, s);
        png(g, 2, path.join(OUT, group + '-' + name + '-' + tag + '.png'));
      } catch (e) { fail++; console.log('FAIL', group, name, tag, e.message); }
    }
console.log('qr', JSON.stringify(SKETCH.QRSTATS));
console.log(fail ? 'failures: ' + fail : 'all rendered');
