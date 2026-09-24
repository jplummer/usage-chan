// QR codes for the settings-URL sketches.
//
// M5GFX has qrcode() built into LGFXBase, so the device needs no library for
// this. The sim needs one, because a picture of a QR code with the wrong
// number of modules would give the wrong answer about how big the box has to
// be -- which is the only question these sketches are asking.
//
// What matches the panel exactly: the module count (same version rule, byte
// mode, ECC level LOW, smallest version that fits), the module thickness and
// the offset, because drawQR transcribes LGFXBase::qrcode's own arithmetic.
//
// What does not: the module PATTERN. This picks mask 0 and declares it in the
// format bits, which is valid and scannable; the device's encoder picks the
// mask with the lowest penalty score. Same size, same box, different speckle.
//
// Versions 1-5 only, ECC LOW, one block each -- 106 bytes, which is four times
// any address this device will ever show.
(function () {
  'use strict';

  // [size, total codewords, EC codewords, byte-mode capacity], ECC LOW.
  const VERSIONS = {
    1: { size: 21, total: 26,  ec: 7,  cap: 17,  align: null },
    2: { size: 25, total: 44,  ec: 10, cap: 32,  align: 18 },
    3: { size: 29, total: 70,  ec: 15, cap: 53,  align: 22 },
    4: { size: 33, total: 100, ec: 20, cap: 78,  align: 26 },
    5: { size: 37, total: 134, ec: 26, cap: 106, align: 30 },
  };

  // ECC LOW, mask 0. The 15-bit BCH format word, already XORed with 0x5412.
  const FORMAT_L_MASK0 = 0x77C4;

  // GF(256) multiply with the QR primitive polynomial, from the reference
  // implementation. No tables: this runs a few hundred times per page load.
  function gmul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function rsDivisor(degree) {
    const result = [];
    for (let i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gmul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gmul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= gmul(coef, factor); });
    }
    return result;
  }

  function pickVersion(len) {
    for (let v = 1; v <= 5; v++) if (len <= VERSIONS[v].cap) return v;
    throw new Error('QR: ' + len + ' bytes needs a version above 5');
  }

  // Mode indicator 0100, an 8-bit length (versions 1-9), the bytes, a
  // terminator, then the alternating pad bytes.
  function codewords(bytes, V) {
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    const dataCw = V.total - V.ec;
    const capBits = dataCw * 8;
    for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    for (let pad = 0xEC; data.length < dataCw; pad ^= 0xEC ^ 0x11) data.push(pad);
    return data.concat(rsRemainder(data, rsDivisor(V.ec)));
  }

  function encode(text) {
    const bytes = [];
    for (const ch of unescape(encodeURIComponent(text))) bytes.push(ch.charCodeAt(0) & 0xff);
    const version = pickVersion(bytes.length);
    const V = VERSIONS[version];
    const size = V.size;
    const mod = [], res = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); res.push(new Array(size).fill(false)); }
    const set = (x, y, v) => { mod[y][x] = v; res[y][x] = true; };

    // Finders and their separators.
    const finder = (fx, fy) => {
      for (let dy = -1; dy <= 7; dy++)
        for (let dx = -1; dx <= 7; dx++) {
          const x = fx + dx, y = fy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          set(x, y, d !== 2 && d <= 3);
        }
    };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

    // Timing, on row and column 6.
    for (let i = 0; i < size; i++) {
      if (!res[6][i]) set(i, 6, i % 2 === 0);
      if (!res[i][6]) set(6, i, i % 2 === 0);
    }

    // One alignment pattern, at the only centre that misses the finders.
    if (V.align !== null) {
      const c = V.align;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

    // Format information, both copies, plus the dark module.
    const fbit = i => ((FORMAT_L_MASK0 >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, fbit(i));
    set(8, 7, fbit(6));
    set(8, 8, fbit(7));
    set(7, 8, fbit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, fbit(i));
    for (let i = 0; i < 8; i++) set(8, size - 1 - i, fbit(i));
    for (let i = 8; i < 15; i++) set(size - 15 + i, 8, fbit(i));
    set(8, size - 8, true);

    // The zigzag, two columns at a time from the right, skipping column 6,
    // with mask 0 -- (row + col) even -- applied as each module lands.
    const cw = codewords(bytes, V);
    let bit = 0;
    const nextBit = () => {
      const i = bit >> 3;
      const v = i < cw.length && ((cw[i] >>> (7 - (bit & 7))) & 1) === 1;
      bit++;
      return v;
    };
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = upward ? size - 1 - v : v;
          if (res[y][x]) continue;
          mod[y][x] = nextBit() !== ((x + y) % 2 === 0);
        }
      }
      upward = !upward;
    }
    return { size, version, modules: mod };
  }

  // LGFXBase::qrcode's own arithmetic, transcribed. The device fills the box
  // white and draws black modules -- the palette does not reach it, so a QR is
  // always a white card on the warm black. `margin` defaults to FALSE on the
  // device, which leaves only the w/size rounding remainder as a quiet zone.
  function drawQR(g, text, x, y, w, margin) {
    const qr = encode(text);
    let thickness = Math.floor(w / qr.size);
    let lineLength = qr.size * thickness;
    let offset = (w - lineLength) >> 1;
    if (margin) {
      const mlen = thickness * 4;
      if (offset < mlen) {
        thickness = Math.floor((w - (mlen << 1)) / qr.size);
        lineLength = qr.size * thickness;
        offset = (w - lineLength) >> 1;
      }
    }
    g.fillRect(x, y, w, w, 0xFFFFFF);
    for (let r = 0; r < qr.size; r++)
      for (let c = 0; c < qr.size; c++)
        if (qr.modules[r][c])
          g.fillRect(x + offset + c * thickness, y + offset + r * thickness,
                     thickness, thickness, 0x000000);
    return { size: qr.size, version: qr.version, thickness, offset };
  }

  window.QR = { encode, drawQR, VERSIONS };
})();
