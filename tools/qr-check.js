// Round-trips the encoder: unmask, re-read the zigzag, decode mode/length/bytes.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'sim');
global.window = global;
eval(fs.readFileSync(path.join(DIR, 'qr.js'), 'utf8'));
for (const text of ['http://usage-chan.local', 'http://192.168.1.47']) {
  const q = QR.encode(text);
  const size = q.size, res = [];
  for (let y = 0; y < size; y++) res.push(new Array(size).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) res[y][x] = true; };
  for (const [fx, fy] of [[0,0],[size-7,0],[0,size-7]])
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mark(fx+dx, fy+dy);
  for (let i = 0; i < size; i++) { mark(i, 6); mark(6, i); }
  const a = QR.VERSIONS[q.version].align;
  if (a !== null) for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) mark(a+dx, a+dy);
  for (let i = 0; i <= 8; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) mark(8, size-1-i);
  for (let i = 8; i < 15; i++) mark(size-15+i, 8);
  const bits = [];
  let upward = true;
  for (let right = size-1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j, y = upward ? size-1-v : v;
        if (res[y][x]) continue;
        bits.push(q.modules[y][x] !== ((x + y) % 2 === 0) ? 1 : 0);
      }
    upward = !upward;
  }
  const take = (o, n) => { let v = 0; for (let i = 0; i < n; i++) v = (v<<1)|bits[o+i]; return v; };
  const mode = take(0, 4), len = take(4, 8);
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(take(12 + i*8, 8));
  console.log('v' + q.version, size + 'x' + size, 'mode', mode, 'len', len, out === text ? 'ROUND-TRIP OK' : 'MISMATCH: ' + out);
}
