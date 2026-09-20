// Candidate treatments for the screens that are not yet settled: the menu and
// PIN entry. Each is a function (g, T, s) like the shipped ones in screens.js,
// so the look-and-feel page can lay them out in a grid against the same theme.
(function () {
  'use strict';
  const { TL, TC, TR, ML, MR, MC } = LGFX;
  const ROWS = [
    ['Brightness', null],
    ['Refresh', 'every 5 min'],
    ['Network', 'Plummer · good'],
    ['Timezone', 'Pacific'],
    ['Control panel', '10.0.0.42'],
  ];

  function dots(g, T, x1, cy, level, ink, pitch = 36) {
    const x0 = x1 - pitch * 5 + (pitch >> 1);
    for (let i = 0; i < 5; i++) {
      const cx = x0 + i * pitch;
      if (i === level) g.fillCircle(cx, cy, 7, ink); else g.drawCircle(cx, cy, 6, ink);
    }
  }

  // A list: flat rows with hairline rules, a value at the right in dim, and
  // the pressed row lit by the card colour rather than the accent. Five rows
  // fit because the rows are 40px with no pill margins to pay for.
  function menuList(g, T, s) {
    g.fillScreen(T.bg);
    const X = 16, W = 320 - 32, top = 34, rh = 40;
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('Usage-Chan 0.1.0', X, 10);
    g.setTextDatum(TR); g.drawString('tap outside to close', X + W, 10);
    g.drawFastHLine(X, top - 1, W, T.card);
    ROWS.forEach(([name, val], i) => {
      const y = top + i * rh, on = i === s.highlight;
      if (on) g.fillRect(X - 6, y, W + 12, rh, T.card);
      const bgc = on ? T.card : T.bg;
      g.setFont(T.small); g.setTextDatum(ML); g.setTextColor(T.text, bgc);
      g.drawString(name, X, y + (rh >> 1));
      if (i === 0) dots(g, T, X + W, y + (rh >> 1), s.brightness, T.text, 34);
      else if (val) { g.setTextDatum(MR); g.setTextColor(T.dim, bgc); g.drawString(val, X + W, y + (rh >> 1)); }
      g.drawFastHLine(X, y + rh - 1, W, T.card);
    });
  }

  // The same list with the accent doing one job only: marking what is live.
  // The live brightness dot and the row under the finger both take it.
  function menuListAccent(g, T, s) {
    g.fillScreen(T.bg);
    const X = 16, W = 320 - 32, top = 34, rh = 40;
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('Usage-Chan 0.1.0', X, 10);
    g.setTextDatum(TR); g.drawString('tap outside to close', X + W, 10);
    ROWS.forEach(([name, val], i) => {
      const y = top + i * rh, on = i === s.highlight;
      if (on) g.fillRect(X - 6, y, W + 12, rh, T.card);
      const bgc = on ? T.card : T.bg;
      g.setFont(T.small); g.setTextDatum(ML); g.setTextColor(on ? T.accent : T.text, bgc);
      g.drawString(name, X, y + (rh >> 1));
      if (i === 0) {
        const x0 = X + W - 34 * 5 + 17;
        for (let k = 0; k < 5; k++) {
          const cx = x0 + k * 34;
          if (k === s.brightness) g.fillCircle(cx, y + (rh >> 1), 7, T.accent);
          else g.drawCircle(cx, y + (rh >> 1), 6, T.dim);
        }
      } else if (val) { g.setTextDatum(MR); g.setTextColor(T.dim, bgc); g.drawString(val, X + W, y + (rh >> 1)); }
      g.drawFastHLine(X, y + rh - 1, W, T.card);
    });
  }

  // PIN entry as a keypad: ten targets instead of 36 taps. Four masked slots
  // above, digits in a 3x4 grid of 46px rows, "clear" where a keypad's star
  // would be. No confirm key: the fourth digit submits.
  function pinKeypad(g, T, s) {
    g.fillScreen(T.bg);
    // Slots.
    const sw = 18, gap = 12, total = sw * 4 + gap * 3, sx = (320 - total) >> 1, sy = 12;
    for (let i = 0; i < 4; i++) {
      const x = sx + i * (sw + gap);
      if (i < s.pos) g.fillCircle(x + (sw >> 1), sy + 8, 6, T.text);
      else g.drawCircle(x + (sw >> 1), sy + 8, 6, T.dim);
    }
    // Keys.
    const kw = 92, kh = 40, kx0 = (320 - (kw * 3 + 8 * 2)) >> 1, ky0 = 40, pitch = 46;
    const keys = ['1','2','3','4','5','6','7','8','9','clear','0',''];
    g.setTextDatum(MC);
    keys.forEach((k, i) => {
      if (!k) return;
      const col = i % 3, row = (i / 3) | 0;
      const x = kx0 + col * (kw + 8), y = ky0 + row * pitch;
      const on = s.pressed === k;
      g.fillRoundRect(x, y, kw, kh, 6, on ? T.accent : T.card);
      const isWord = k.length > 1;
      g.setFont(isWord ? T.small : T.title);
      g.setTextColor(on ? T.bg : (isWord ? T.dim : T.text), on ? T.accent : T.card);
      g.drawString(k, x + (kw >> 1), y + (kh >> 1));
    });
  }

  window.VARIANTS = { menuList, menuListAccent, pinKeypad };
})();
