// Exploration, 2026-11-09 — not shipped, not decided. Two questions about the
// vertical dashboard, drawn by one parameterised copy of drawVBar so the
// candidates differ only where they mean to:
//
// 1. The flip. Shipped, the window the server names as binding takes the wide
//    column and the headline, and the other takes the thin one. Seen on the
//    device, that produced a screen that looked almost the same and meant
//    something different. The `layout` argument tries keeping every element
//    in one place with one meaning: 5-hour is always the wide bar on the
//    right, 7-day always the thin bar on the left.
//
// 2. The floor. Shipped, both tracks stop at 224 of 240 rows, which leaves a
//    home for the reset line and lets the overage token straddle the bar's
//    end. The `geo` argument runs the tracks to row 240, drops the labels,
//    and has to put the token somewhere else, because half of a straddling
//    token would be off the panel.
//
// Everything here reads geometry and helpers from SCREENS and changes nothing
// in screens.js.
(function () {
  'use strict';
  const { TL, TR } = LGFX;
  const S = SCREENS, V = S.V;
  const HEAD_KERN = -2, REASON_Y = V.V_HEAD_Y + 27;   // as in screens.js
  const SUB_Y = V.V_TITLE_Y + 18;                     // thin column's second line
  const MID_FACE = 'FreeSansBold9pt7b';               // thin column's headline
  const MID_Y = V.V_TITLE_Y + 19, MID_H = 20;
  const TOKEN_ARM = 11, TOKEN_T = 3, TOKEN_RING = 3;

  // geo: { trackH, footY, square, token: 'straddle' | 'inside' | 'center' }
  const GEO = {
    shipped:    { trackH: 224, footY: 216, square: false, token: 'straddle' },
    floorRound: { trackH: 240, footY: 224, square: false, token: 'inside' },
    floorSquare:{ trackH: 240, footY: 224, square: true,  token: 'inside' },
    floorLift:  { trackH: 240, footY: 222, square: true,  token: 'inside' },
    floorCenter:{ trackH: 240, footY: 224, square: true,  token: 'center' },
  };

  // The X's ink reaches 12 rows either side of its centre and the knockout
  // ring 3 more; the '$' ink is 29 rows, flush with the top of its box.
  function token(g, T, cx, rejected, geo) {
    const col = rejected ? T.crit : T.pay;
    let xCy, dTop;
    if (geo.token === 'straddle')    { xCy = geo.trackH;            dTop = geo.trackH - 14; }
    else if (geo.token === 'inside') { xCy = geo.trackH - 16;       dTop = geo.trackH - 29 - 4; }
    else                             { xCy = geo.trackH >> 1;       dTop = (geo.trackH >> 1) - 14; }
    if (rejected) {
      S.drawMarkX(g, cx, xCy, TOKEN_ARM, T.bg, TOKEN_T + TOKEN_RING);
      S.drawMarkX(g, cx, xCy, TOKEN_ARM, col, TOKEN_T);
    } else {
      g.setFont(T.title);
      const w = g.textWidth('$');
      S.outlinedGlyph(g, T, '$', T.title, cx - (w >> 1), dTop, col, T.bg, TOKEN_RING);
    }
  }

  // screens.js's captionY with the track height passed in rather than read.
  function captionY(tickCy, avoid, trackH) {
    const H = 16, lo = 0, hi = trackH - H;
    let y = Math.min(hi, Math.max(lo, Math.round(tickCy) - (H >> 1)));
    for (const [top, bot] of avoid) {
      if (y >= bot || y + H <= top) continue;
      const above = top - H - 2, below = bot + 2;
      const fitsA = above >= lo, fitsB = below <= hi;
      if (fitsA && fitsB) y = (tickCy < (top + bot) / 2) ? above : below;
      else if (fitsA)     y = above;
      else if (fitsB)     y = below;
    }
    return Math.min(hi, Math.max(lo, y));
  }

  // A track-shaped fill. Square-bottomed ones run past the last row and let
  // the panel edge cut them, so the bar stands on the floor.
  function slab(g, x, y, w, h, col, geo) {
    if (h <= 0) return;
    g.fillRoundRect(x, y, w, h, 6, col);
    if (geo.square) g.fillRect(x, y + h - Math.min(6, h), w, Math.min(6, h), col);
  }

  // c: { wide, label, util, elapsed, resetTxt, valid, days, overage,
  //      headline, amount, bright }
  //   wide      which slot: the 48px bar on the right, or the 24px one
  //   headline  draw the big stat block (wide slot only)
  //   amount    thin slot: state "NN% left" on a second line under the title
  //   bright    draw the title in the text colour: this window is binding
  //   mid       thin slot: a 9pt bold headline under the title, right-aligned.
  //             The 12pt face does not fit the 84px slot ("near cap" is 101);
  //             9pt tops out at 78 for "100% left"
  function column(g, T, c, geo) {
    const trackX = c.wide ? V.V5_X : V.V7_X;
    const trackW = c.wide ? V.V5_W : V.V7_W;
    const textX  = c.wide ? V.V5_TEXT_X : V.V7_TEXT_R;
    const datum  = c.wide ? TL : TR;
    const trackH = geo.trackH, footY = geo.footY;

    const ov       = c.overage && c.overage.active ? c.overage : null;
    const rejected = !!ov && ov.status === 'rejected';
    const reason   = rejected && ov.disabledReason;
    const rem      = 100 - c.util;
    const haveReset = c.valid && !!c.resetTxt;

    // tint: this column's title and amount take the colour its bar is drawn
    // in, so the words and the bar read as one thing.
    const barCol = ov ? (rejected ? T.crit : T.pay)
                 : (c.valid && c.elapsed >= 0) ? S.paceColor(T, Math.max(0, Math.min(100, c.util)) / 100, c.elapsed)
                 : T.ok;
    const lit = c.tint ? barCol : (c.bright ? T.text : T.dim);

    g.setFont(T.small); g.setTextDatum(datum);
    g.setTextColor(lit, T.bg);
    g.drawString(c.label, textX, V.V_TITLE_Y);

    let blockBot = V.V_TITLE_Y + 16;
    if (c.headline) {
      const plenty = rem >= 40;
      let headline, hcol;
      if (ov)             { headline = S.overageWord(ov.status); hcol = rejected ? T.crit : T.pay; }
      else if (!c.valid)  { headline = '--'; hcol = T.dim; }
      else if (c.steady)  { headline = Math.round(rem) + '% left'; hcol = barCol === T.ok ? T.text : barCol; }
      else if (plenty)    { headline = Math.round(rem) + '% left'; hcol = T.text; }
      else if (haveReset) { headline = c.resetTxt; hcol = T.accent; }
      else                { headline = '--'; hcol = T.dim; }
      g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(hcol, T.bg);
      g.drawString(headline, textX + HEAD_KERN, V.V_HEAD_Y);
      blockBot = reason ? REASON_Y + 16 : V.V_HEAD_Y + 23;

      g.setFont(T.small); g.setTextDatum(TL);
      if (ov) {
        g.setTextColor(T.dim, T.bg);
        if (reason) g.drawString(String(ov.disabledReason).replace(/_/g, ' '), textX, REASON_Y);
        if (ov.resetTxt) g.drawString(ov.resetTxt, textX, footY);
      } else if (c.valid && haveReset && (plenty || c.steady)) {
        g.setTextColor(T.dim, T.bg); g.drawString(c.resetTxt, textX, footY);
      } else if (c.valid && rem <= 0) {
        g.setTextColor(T.warn, T.bg); g.drawString('out', textX, footY);
      } else if (c.valid && rem < 12) {
        g.setTextColor(T.warn, T.bg); g.drawString('nearly out', textX, footY);
      }
    } else if (c.mid) {
      const plenty = rem >= 40;
      let headline, hcol;
      if (ov)             { headline = S.overageWord(ov.status); hcol = rejected ? T.crit : T.pay; }
      else if (!c.valid)  { headline = '--'; hcol = T.dim; }
      else if (plenty)    { headline = Math.round(rem) + '% left'; hcol = T.text; }
      else if (haveReset) { headline = c.resetTxt; hcol = T.accent; }
      else                { headline = '--'; hcol = T.dim; }
      g.setFont(MID_FACE); g.setTextDatum(datum); g.setTextColor(hcol, T.bg);
      g.drawString(headline, textX, MID_Y);
      blockBot = MID_Y + MID_H;
      g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(T.dim, T.bg);
      if (reason) {
        g.drawString(String(ov.disabledReason).replace(/_/g, ' '), textX, blockBot);
        blockBot += 16;
      }
      const foot = ov ? ov.resetTxt : (plenty && haveReset ? c.resetTxt : null);
      if (foot) g.drawString(foot, textX, footY);
    } else {
      // No stat block: at most one small line under the title.
      g.setFont(T.small); g.setTextDatum(datum);
      let sub = null, scol = T.dim;
      if (ov)                         { sub = S.overageWord(ov.status); scol = rejected ? T.crit : T.pay; }
      else if (c.amount && c.valid)   { sub = Math.round(rem) + '% left'; scol = lit; }
      if (sub) {
        g.setTextColor(scol, T.bg); g.drawString(sub, textX, SUB_Y);
        blockBot = SUB_Y + 16;
      }
      const foot = ov ? ov.resetTxt : (haveReset ? c.resetTxt : null);
      if (foot) { g.setTextColor(T.dim, T.bg); g.drawString(foot, textX, footY); }
    }

    slab(g, trackX, 0, trackW, trackH, T.card, geo);
    const e = c.valid ? c.elapsed : -1;
    let used = null;
    if (ov) {
      const ring = rejected ? T.crit : T.pay;
      const ringH = geo.square ? trackH + 8 : trackH;      // bottom edge off-panel
      g.drawRoundRect(trackX, 0, trackW, ringH, 6, ring);
      g.drawRoundRect(trackX + 1, 1, trackW - 2, ringH - 2, 5, ring);
      const orem = rejected ? 0 : Math.max(0, Math.min(1, ov.remaining || 0));
      const oh = Math.round(trackH * orem);
      slab(g, trackX, trackH - oh, trackW, oh, T.pay, geo);
      used = 1 - orem;
    } else if (c.valid) {
      const u = Math.max(0, Math.min(100, c.util));
      const usedH = Math.round(trackH * u / 100);
      const col = e >= 0 ? S.paceColor(T, u / 100, e) : T.ok;
      slab(g, trackX, usedH, trackW, trackH - usedH, col, geo);
      for (let i = 1; i < c.days; i++)
        g.drawFastHLine(trackX, (trackH * i / c.days) | 0, trackW, T.bg);
      used = u / 100;
    }
    if (used !== null && e >= 0) {
      const cy = Math.round(trackH * e);
      S.drawPaceTick(g, T, trackX + trackW / 2, cy);
      const [word, wcol] = S.paceWord(T, used, e);
      g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(wcol, T.bg);
      g.drawString(word, textX,
                   captionY(cy, [[V.V_TITLE_Y, blockBot], [footY, footY + 16]], trackH));
    }
    if (ov) token(g, T, trackX + trackW / 2, rejected, geo);
  }

  function chrome(g, T, s) {
    S.drawIcon(g, V.V_CTRL_X, V.V_CIRCLE_Y0, (window.ICONS || {}).menu, T.ctrl);
    S.drawIcon(g, V.V_CTRL_X, V.V_CIRCLE_Y1, S.wifiIcon(-55, true), T.ctrl);
    S.drawRefreshIndicator(g, T, V.V_CIRCLE_Y2, false,
                           s.pollFrac === undefined ? 0.62 : s.pollFrac, 0, false, 'dots', false);
  }

  // layout:
  //   'flip'    shipped: the binding window takes the wide slot and headline
  //   'pinned'  5-hour wide and 7-day thin, always. The headline is always
  //             the 5-hour window's. Only the overage vessel, token and word
  //             go to whichever window binds.
  //   'stated'  pinned, and the 7-day column always says how much is left,
  //             so both columns carry the same four facts in the same places.
  //             The binding window's title is drawn bright.
  //   'tinted'  stated, but when the 7-day window binds its title and amount
  //             are drawn in its bar's colour instead of white.
  //   'steady'  tinted, and the 5-hour headline is always "NN% left", never a
  //             bare reset time. The reset time stays at the foot. The
  //             headline takes its own bar's colour when that is not green.
  //   'cross'   stated, until the 7-day window binds. Then the headline
  //             leaves the 5-hour column and a smaller one appears beside the
  //             7-day bar, so the stat sits next to the bar it describes and
  //             the change of subject is a change of place. The 5-hour column
  //             drops to the small "NN% left" line the 7-day one normally has.
  function screen(g, T, s, layout, geo) {
    geo = geo || GEO.shipped;
    g.fillScreen(T.bg);
    const five  = { label: '5-HOUR', util: s.h5, elapsed: s.e5, resetTxt: s.reset5, valid: s.ok, days: 1 };
    const seven = { label: '7-DAY',  util: s.d7, elapsed: s.e7, resetTxt: s.reset7, valid: s.ok, days: 7 };
    const bind = s.sevenBinds ? seven : five, other = s.sevenBinds ? five : seven;
    bind.overage = s.overage;
    if (layout === 'flip') {
      Object.assign(bind,  { wide: true,  headline: true });
      Object.assign(other, { wide: false });
    } else if (layout === 'cross' && s.sevenBinds) {
      Object.assign(five,  { wide: true,  amount: true });
      Object.assign(seven, { wide: false, mid: true, bright: true });
    } else if (layout === 'cross') {
      Object.assign(five,  { wide: true,  headline: true, bright: true });
      Object.assign(seven, { wide: false, amount: true });
    } else {
      Object.assign(five,  { wide: true,  headline: true });
      Object.assign(seven, { wide: false, amount: layout !== 'pinned' });
      if (layout === 'stated') bind.bright = true;
      if (layout === 'steady') { five.steady = true; layout = 'tinted'; }
      if (layout === 'tinted') { if (s.sevenBinds) seven.tint = true; else five.bright = true; }
    }
    column(g, T, other, geo);
    column(g, T, bind, geo);
    chrome(g, T, s);
  }

  window.FLOORVARIANTS = { GEO, screen };
})();
