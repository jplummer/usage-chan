// Ten alternative main views, drawn through the same lgfx.js and the same
// glyph data as the shipped dashboard, so every string here measures what it
// would measure on the panel.
//
// Nothing in this file is committed to anything. It exists to be argued with.
// `screens.js` and `src/ui.cpp` are untouched: where a helper already carries
// the meaning -- pace colour, pace words, the diamond, the X, the smoke
// overlay, the control column's glyphs -- this file calls it rather than
// re-typing it, so a change to the pace thresholds moves all eleven screens at
// once and no second vocabulary creeps in.
//
// PLAN-dashboard-alternatives.md in the repo root has the reasoning and the
// coverage table.
(function () {
  'use strict';

  const { TL, TC, TR, ML, MC, MR, BL, BC, BR } = LGFX;
  const S = window.SCREENS;
  const V = S.V;

  // ── Shared reading of the state ─────────────────────────
  // Every renderer takes the same object, so the hard states cost nothing
  // extra to draw. A layout that only works in the state it was designed for
  // is not a layout, and this is how that shows up.
  //
  // s: { ok, h5, d7, e5, e7, reset5, reset7, sevenBinds, batPct, rssi,
  //      ageTxt, err, fetching, pollFrac, spinPhase, refreshFailed,
  //      refreshFailing, smoke, soloThresh,
  //      overage: { active, status, remaining, resetTxt, disabledReason } }

  // The binding window and the other one, already resolved, because nine of
  // the ten layouts want them that way round rather than as "5-hour" and
  // "7-day".
  function windows(s) {
    const five = {
      label: '5-HOUR', short: '5-hour', util: s.h5 / 100, elapsed: s.e5,
      reset: s.reset5, days: 1,
    };
    const seven = {
      label: '7-DAY', short: '7-day', util: s.d7 / 100, elapsed: s.e7,
      reset: s.reset7, days: 7,
    };
    five.rem = 1 - five.util;
    seven.rem = 1 - seven.util;
    return s.sevenBinds ? { bind: seven, other: five } : { bind: five, other: seven };
  }

  function ov(s) { return s.overage && s.overage.active ? s.overage : null; }
  function rejected(s) { const o = ov(s); return !!o && o.status === 'rejected'; }

  // The headline ladder, exactly as drawVBar computes it: percent left above
  // 40%, the reset clock below that, a warning word below 12%, "out" at zero,
  // and the extra-usage word over the top of all of it.
  function headline(T, s, w) {
    const o = ov(s);
    if (o) return { text: S.overageWord(o.status), col: o.status === 'rejected' ? T.crit : T.pay };
    if (!s.ok) return { text: '--', col: T.dim };
    const rem = w.rem * 100;
    if (rem >= 40) return { text: Math.round(rem) + '% left', col: T.text };
    if (rem <= 0) return { text: 'out', col: T.warn };
    return { text: w.reset, col: T.accent };
  }

  // The second line under the headline: whatever the ladder did not say.
  function subhead(T, s, w) {
    const o = ov(s);
    if (o) return { text: o.resetTxt ? 'allowance resets ' + o.resetTxt : '', col: T.dim };
    if (!s.ok) return { text: 'no reading', col: T.dim };
    const rem = w.rem * 100;
    if (rem >= 40) return { text: 'resets ' + w.reset, col: T.dim };
    if (rem <= 0) return { text: 'resets ' + w.reset, col: T.warn };
    if (rem < 12) return { text: s.lowWord || 'nearly out', col: T.warn };
    return { text: Math.round(rem) + '% left', col: T.text };
  }

  // ── The dying battery ───────────────────────────────────
  // Below 10% and not on power. Deliberately NOT smoke, and the argument is
  // the overlay's own rule: "the overlay scales with how much of the screen it
  // invalidates." Radio-down and three-failures-in-a-row both mean the numbers
  // on screen are suspect, which is why veiling them costs nothing. A dying
  // battery invalidates nothing -- every number behind the veil is exactly as
  // true as it was a minute ago, and still worth reading. Covering good data
  // to announce a problem that is not about the data is the wrong trade.
  //
  // What it does invalidate is the screen's future: in a few minutes there
  // will be no screen. That earns something permanent and loud rather than
  // something modal, so every layout here gets a standing mark in its own
  // vocabulary, and none of them gets a lozenge.
  //
  // Three power states, not two. halBatPercent() returns -1 when the gauge
  // cannot be read, and hiding beats drawing a lie, so -1 says nothing at all.
  // halIsCharging() has an unknown value, and this device lives plugged in on
  // a desk -- so a low battery with an unreadable charge state is itself news:
  // the cable is not delivering. It warns, in the quiet rung, the same way
  // degraded_performance gets a bar without a colour pop.
  function battery(T, s) {
    if (s.batPct === undefined || s.batPct < 0 || s.batPct >= 10) return null;
    if (s.power === 'mains') return null;
    const sure = s.power === 'battery';
    return { col: sure ? T.crit : T.warn, sure,
             text: sure ? 'battery low, plug in' : 'battery low' };
  }

  function reasonText(s) {
    const o = ov(s);
    if (!o || o.status !== 'rejected' || !o.disabledReason) return '';
    return o.disabledReason.replace(/_/g, ' ');
  }

  function pct(s, w) { return s.ok ? Math.round(w.rem * 100) + '%' : '--'; }

  // ── Shared chrome ───────────────────────────────────────
  // The shipped control column, unchanged, for the seven layouts that keep a
  // right-hand gutter. Reusing it means liveness and the menu affordance are
  // identical across those seven and only the ones that reject it have to
  // answer for themselves.
  function ctrlColumn(g, T, s) {
    S.drawIcon(g, V.V_CTRL_X, V.V_CIRCLE_Y0, (window.ICONS || {}).menu, T.ctrl);
    S.drawIcon(g, V.V_CTRL_X, V.V_CIRCLE_Y1,
               S.wifiIcon(s.rssi === undefined ? -55 : s.rssi, true), T.ctrl);
    S.drawRefreshIndicator(g, T, V.V_CIRCLE_Y2, !!s.fetching,
                           s.pollFrac === undefined ? 1 : s.pollFrac,
                           s.spinPhase || 0, !!s.refreshFailed,
                           'dots', !!s.refreshFailing);
  }

  // A one-line staleness statement, for the layouts with a spare row. The
  // control column says when the next reading is due; this says whether the
  // one on screen can be trusted, which is a different question.
  function staleLine(g, T, s, x, y, datum) {
    if (!s.err) return;
    g.setFont(T.small); g.setTextDatum(datum === undefined ? TL : datum);
    g.setTextColor(T.warn, T.bg);
    g.drawString(s.ageTxt + ' old, cant refresh', x, y);
  }

  // ── Small drawing helpers ───────────────────────────────

  // A filled annular band between two angles, tested per pixel the way the
  // control column's circles are. Angles run clockwise from twelve, in turns
  // (0..1), which is how every fraction on this device is already expressed.
  function arcBand(g, cx, cy, r0, r1, t0, t1, col) {
    if (t1 <= t0) return;
    const a0 = t0 * 2 * Math.PI, a1 = t1 * 2 * Math.PI;
    const R = Math.ceil(r1);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 < r0 * r0 || d2 > r1 * r1) continue;
        let a = Math.atan2(dx, -dy);
        if (a < 0) a += 2 * Math.PI;
        if (a >= a0 && a < a1) g.drawPixel(cx + dx, cy + dy, col);
      }
  }

  // One radial hairline, for the dial's week dividers.
  function radialTick(g, cx, cy, r0, r1, t, col) {
    const a = t * 2 * Math.PI, ux = Math.sin(a), uy = -Math.cos(a);
    for (let r = r0; r <= r1; r += 0.5)
      g.drawPixel(Math.round(cx + ux * r), Math.round(cy + uy * r), col);
  }

  // A small diamond, for the marks too cramped to take the shipped 15px one.
  // Same shape, same halo, smaller.
  function smallTick(g, T, cx, cy, r, col) {
    for (let k = r + 1; k >= r; k--) {
      const c = k === r + 1 ? T.bg : col;
      for (let dy = -k; dy <= k; dy++) {
        const dx = k - Math.abs(dy);
        g.drawFastHLine(cx - dx, cy + dy, dx * 2 + 1, c);
      }
    }
  }

  // A left-anchored horizontal strip: fill is what is available, the same rule
  // the vertical bars use, turned ninety degrees. `days` puts dividers on it.
  function strip(g, T, x, y, w, h, rem, elapsed, days, col, tickR) {
    g.fillRect(x, y, w, h, T.card);
    const fw = Math.round(w * Math.max(0, Math.min(1, rem)));
    if (fw > 0) g.fillRect(x, y, fw, h, col);
    if (days > 1)
      for (let i = 1; i < days; i++) g.drawFastVLine(x + Math.round(w * i / days), y, h, T.bg);
    if (elapsed >= 0 && tickR > 0)
      smallTick(g, T, x + Math.round(w * (1 - elapsed)), y + (h >> 1), tickR, T.text);
  }

  // The extra-usage token, drawn at an arbitrary place rather than at the
  // shipped bar's fixed end. Same two glyphs, same knockout ring, so a cross
  // still means the same thing everywhere it appears.
  function token(g, T, cx, cy, isRejected, arm) {
    const a = arm || 9;
    const col = isRejected ? T.crit : T.pay;
    if (isRejected) {
      S.drawMarkX(g, cx, cy, a, T.bg, 6);
      S.drawMarkX(g, cx, cy, a, col, 3);
    } else {
      g.setFont('FreeSansBold18pt7b');
      const w = g.textWidth('$');
      S.outlinedGlyph(g, T, '$', 'FreeSansBold18pt7b', cx - (w >> 1), cy - 15, col, T.bg, 3);
    }
  }

  // ── 1 · Dial ────────────────────────────────────────────
  // Time and budget in one shape. Going clockwise from twelve is the window
  // running down, so the arc still ahead of the hand is the time you have
  // left; the band's thickness across that arc is the budget you have left.
  // Even burn would make thickness track the arc exactly, so the pace hairline
  // is where the band's inner edge would sit if you were spending evenly:
  // band thinner than the hairline means you are ahead of pace. No second
  // geometry, no comparison between two pictures.
  // The circle is sized by the text, not the other way round: the hole has to
  // hold "100% left" at the stat face, which measures 104px, and the bottom
  // two rows have to hold "payment failed" and "battery low, plug in" at full
  // width. That leaves no right margin at all, which is the dial's real cost.
  const D_CX = 136, D_CY = 104, D_R = 92, D_R0 = 52;
  const D_R7O = 102, D_R7I = 96;
  const D_ROW1 = 206, D_ROW2 = 222;

  function dial(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const o = ov(s);

    // The whole window as an empty track, so the elapsed part reads as spent
    // time rather than as missing drawing.
    arcBand(g, D_CX, D_CY, D_R0, D_R, 0, 1, T.card);

    if (s.ok) {
      const e = Math.max(0, Math.min(1, bind.elapsed));
      const span = D_R - D_R0;
      const col = o ? (rejected(s) ? T.crit : T.pay)
                    : S.paceColor(T, bind.util, bind.elapsed);
      const rem = o ? (rejected(s) ? 0 : o.remaining) : bind.rem;
      const inner = D_R - span * Math.max(0, Math.min(1, rem));
      arcBand(g, D_CX, D_CY, inner, D_R, e, 1, col);
      // The even-burn edge, one pixel, across the same arc.
      const paceInner = D_R - span * (1 - e);
      arcBand(g, D_CX, D_CY, paceInner, paceInner + 1, e, 1, T.text);
      smallTick(g, T,
                Math.round(D_CX + Math.sin(e * 2 * Math.PI) * (paceInner + 4)),
                Math.round(D_CY - Math.cos(e * 2 * Math.PI) * (paceInner + 4)), 5, T.text);
      if (o) token(g, T, D_CX, D_CY + 72, rejected(s), 8);

      // The other window as an outer hairline ring, with its week dividers.
      const e7 = Math.max(0, Math.min(1, other.elapsed));
      arcBand(g, D_CX, D_CY, D_R7I, D_R7O, 0, 1, T.card);
      arcBand(g, D_CX, D_CY, D_R7I, D_R7O, e7, 1, T.dim);
      if (other.days > 1)
        for (let i = 0; i < other.days; i++)
          radialTick(g, D_CX, D_CY, D_R7I - 1, D_R7O + 1, i / other.days, T.bg);
    }

    // The centre holds the headline, because it is the one place on a dial
    // that is not saying something about time.
    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(BC); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, D_CX, D_CY + 4);
    const sub = subhead(T, s, bind);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(sub.col, T.bg);
    g.drawString(sub.text, D_CX, D_CY + 8);
    g.setTextDatum(BC); g.setTextColor(T.dim, T.bg);
    g.drawString(bind.label, D_CX, D_CY - 22);

    // Two full-width rows under the circle carry what a circle cannot: the
    // pace word, the other window, and whichever piece of bad news is live.
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.small); g.setTextDatum(TL);
    g.setTextColor(wcol, T.bg); g.drawString(word, 8, D_ROW1);
    g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
    g.drawString(other.short + ' ' + pct(s, other) + ' left, ' +
                 (s.ok ? other.reset : '--'), 268, D_ROW1);

    // Battery: the instrument's own rim. A dial has a bezel and nothing else
    // is using it, so the warning is a ring around the whole thing -- loud,
    // permanent, and covering no number.
    const bat = battery(T, s);
    if (bat) arcBand(g, D_CX, D_CY, D_R7O + 2, D_R7O + 5, 0, 1, bat.col);

    // One bottom row, three claimants, and they queue rather than overlap:
    // the reason string, then the battery, then staleness. Dropping the
    // quieter one is better than drawing two strings through each other, and
    // the queue order is how much of the screen each one invalidates.
    const r = reasonText(s);
    g.setFont(T.small); g.setTextDatum(TL);
    if (r) { g.setTextColor(T.crit, T.bg); g.drawString(r, 8, D_ROW2); }
    else if (bat) { g.setTextColor(bat.col, T.bg); g.drawString(bat.text, 8, D_ROW2); }
    else staleLine(g, T, s, 8, D_ROW2);
    if (r && bat) {
      g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.sure ? 'battery low' : 'battery?', 268, D_ROW2);
    }

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 2 · Tide ────────────────────────────────────────────
  // The screen is not a composition of parts, it is one object: a tank with a
  // level in it. Nothing is drawn beside the gauge because the gauge is the
  // whole panel, which is the strongest form of "readable from across a room"
  // available on 320x240. Everything else floats on the surface.
  function tide(g, T, s) {
    const { bind, other } = windows(s);
    const o = ov(s);
    g.fillScreen(T.card);

    const rem = !s.ok ? 0 : (o ? (rejected(s) ? 0 : o.remaining) : bind.rem);
    const waterY = 240 - Math.round(240 * Math.max(0, Math.min(1, rem)));
    const col = o ? (rejected(s) ? T.crit : T.pay)
                  : S.paceColor(T, bind.util, bind.elapsed);
    if (waterY < 240) g.fillRect(0, waterY, 320, 240 - waterY, col);

    // Where an even burn would have left the water. Above the line is behind
    // pace; below it is ahead. One hairline, the same deterministic quantity
    // the diamond carries elsewhere.
    if (s.ok && !o) {
      const paceY = Math.round(240 * bind.elapsed);
      for (let x = 0; x < 320; x += 4) g.drawFastHLine(x, paceY, 2, T.text);
      smallTick(g, T, 250, paceY, 6, T.text);
    }

    // The other window keeps a 16px gutter on the left rather than a column:
    // a second level in the same units, with its own dividers and its own
    // mark, small enough that it cannot be mistaken for the main event.
    g.fillRect(0, 0, 16, 240, T.bg);
    if (s.ok) {
      const oh = Math.round(240 * Math.max(0, Math.min(1, other.rem)));
      g.fillRect(2, 240 - oh, 12, oh, T.dim);
      if (other.days > 1)
        for (let i = 1; i < other.days; i++) g.drawFastHLine(2, Math.round(240 * i / other.days), 12, T.bg);
      smallTick(g, T, 8, Math.round(240 * other.elapsed), 4, T.text);
    }

    // Text sits on the surface and has to survive being submerged, which is
    // this layout's real problem: at 90% remaining the dry part is 24 pixels
    // tall. The fix drawn here is a colour swap, not a move.
    const h = headline(T, s, bind);
    const headY = 58, wet = headY > waterY;
    g.setFont(T.stat); g.setTextDatum(MC);
    g.setTextColor(wet ? T.bg : h.col, wet ? col : T.card);
    g.drawString(h.text, 160, headY);
    const sub = subhead(T, s, bind);
    const subY = 86, subWet = subY > waterY;
    g.setFont(T.small); g.setTextDatum(MC);
    g.setTextColor(subWet ? T.bg : sub.col, subWet ? col : T.card);
    g.drawString(sub.text, 160, subY);
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    const wordWet = 106 > waterY;
    g.setTextColor(wordWet ? T.bg : wcol, wordWet ? col : T.card);
    g.drawString(word, 160, 106);
    const r = reasonText(s);
    if (r) {
      const rw = 128 > waterY;
      g.setTextColor(rw ? T.bg : T.crit, rw ? col : T.card);
      g.drawString(r, 160, 128);
    }
    if (o) token(g, T, 160, Math.min(waterY, 222), rejected(s), 9);
    if (s.err) {
      const ew = 208 > waterY;
      g.setTextDatum(MC); g.setTextColor(ew ? T.bg : T.warn, ew ? col : T.card);
      g.drawString(s.ageTxt + ' old, cant refresh', 160, 208);
    }

    // Battery: sediment at the bottom of the tank. Tide has no margin to bolt
    // a warning onto, so the warning has to join the object -- a band the
    // water sits on, which is also where the level is heading.
    const bat = battery(T, s);
    if (bat) {
      g.fillRect(0, 228, 320, 12, bat.col);
      g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(T.bg, bat.col);
      g.drawString(bat.text, 160, 234);
    }

    // The control column gets its own ground, because the thing behind it
    // moves and chrome that changes colour with the data reads as data.
    g.fillRoundRect(272, 4, 44, 232, 10, T.bg);
    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 3 · Face ────────────────────────────────────────────
  // The shell is a robot, so the screen is a face. The two eyes are the two
  // windows -- left is always the five-hour one, so position is learned once
  // -- and the lid drops as the budget goes. The pupil sits where an even burn
  // would have put the lid, so an eye whose lid has covered its pupil is an
  // eye that is ahead of pace. Same relationship, no diamond.
  const F_LX = 78, F_RX = 178, F_CY = 88, F_RBIG = 46, F_RSML = 34;

  function eye(g, T, cx, cy, r, w, s, mark) {
    g.fillCircle(cx, cy, r, T.card);
    if (s.ok) {
      // The lid: everything above the level, cut out of the disc.
      const lidY = cy - r + Math.round(2 * r * Math.max(0, Math.min(1, 1 - w.rem)));
      g.fillCircle(cx, cy, r, T.card);
      const col = S.paceColor(T, w.util, w.elapsed);
      for (let dy = -r; dy <= r; dy++) {
        const dx = Math.floor(Math.sqrt(r * r - dy * dy));
        const y = cy + dy;
        g.drawFastHLine(cx - dx, y, dx * 2 + 1, y < lidY ? T.bg : col);
      }
      // The pupil, at even-burn height.
      const py = cy - r + Math.round(2 * r * Math.max(0, Math.min(1, w.elapsed)));
      g.fillCircle(cx, py, Math.max(5, (r / 5) | 0), T.bg);
      g.fillCircle(cx, py, Math.max(3, (r / 8) | 0), T.text);
    }
    g.drawCircle(cx, cy, r, T.dim);
    if (mark) { S.drawMarkX(g, cx, cy, r - 8, T.bg, 7); S.drawMarkX(g, cx, cy, r - 8, T.crit, 4); }
  }

  function face(g, T, s) {
    g.fillScreen(T.bg);
    const { bind } = windows(s);
    const five = s.sevenBinds ? windows(s).other : windows(s).bind;
    const seven = s.sevenBinds ? windows(s).bind : windows(s).other;
    const o = ov(s);

    // Size says which one binds; position says which one it is.
    eye(g, T, F_LX, F_CY, s.sevenBinds ? F_RSML : F_RBIG, five, s, rejected(s) && !s.sevenBinds);
    eye(g, T, F_RX, F_CY, s.sevenBinds ? F_RBIG : F_RSML, seven, s, rejected(s) && s.sevenBinds);

    // Battery as the ahoge: a cowlick is the one place on a face where a bar
    // is not a gauge. It is the only layout of the ten where the warning can
    // be carried by the picture rather than bolted to it -- the hair wilts and
    // reddens, which is legible from across a room and costs no row of type.
    // The words still appear, because a mood is not a fact.
    const bat = battery(T, s);
    if (s.batPct !== undefined && s.batPct >= 0) {
      const bh = Math.max(3, Math.round(30 * s.batPct / 100));
      const bx = F_LX + 40;
      g.fillRect(bx, 22 - bh, 3, bh, bat ? bat.col : T.dim);
      if (bat) g.fillRect(bx + 3, 22 - bh, 5, 3, bat.col);   // the wilt
    }

    // Blush when extra usage is running: it is a state of the whole face,
    // which is what overage is.
    if (o && !rejected(s)) {
      g.fillCircle(F_LX - 30, F_CY + 40, 8, T.pay);
      g.fillCircle(F_RX + 30, F_CY + 40, 8, T.pay);
    }

    // The mouth carries pace by curvature, and says it in words underneath,
    // because a curve is a mood and the reader still needs the fact.
    const d = s.ok ? bind.util - bind.elapsed : 0;
    const curve = Math.max(-10, Math.min(14, d * 60));
    for (let x = -34; x <= 34; x++) {
      const y = Math.round(152 + curve * (1 - (x / 34) * (x / 34)));
      g.fillRect(128 + x, y, 1, 3, s.ok ? T.text : T.dim);
    }

    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(TC); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 128, 174);
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(wcol, T.bg);
    g.drawString(word, 128, 200);
    // The reason string and the subhead want the same row, and the face has
    // no other. The reason wins, because it is the thing that changed.
    const r = reasonText(s);
    const sub = subhead(T, s, bind);
    g.setTextColor(r ? T.crit : sub.col, T.bg);
    g.drawString(r || sub.text, 128, 218);

    // Reset times ride under their own eye. The face has no other row for
    // them, which is the cost of spending the middle on a picture.
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.dim, T.bg);
    g.drawString(s.ok ? five.reset : '--', F_LX, 140);
    g.drawString(s.ok ? seven.reset : '--', F_RX, 140);

    // Two warnings, one row, 262 pixels. Both in full measure 273, so the
    // battery drops to its short form when staleness is also live. The face
    // spends its middle on a picture and this is the bill.
    if (s.err) {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.warn, T.bg);
      g.drawString(s.ageTxt + ' old, stale', 4, 4);
    }
    if (bat) {
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(s.err ? 'battery low' : bat.text, 258, 4);
    }

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 4 · Verdict ─────────────────────────────────────────
  // Lead with the decision. The strategy document says the resting state
  // should carry about one bit, and this is what that looks like taken all the
  // way: a word big enough to read without looking at, and every number pushed
  // to the edges where it can be inspected but not consulted.
  //
  // It is also the only one of the ten that refuses the control column, so the
  // menu and the refresh indicator sit in the bottom-left corner instead. The
  // signal glyph is gone, which costs nothing -- it is leaving this screen
  // anyway.
  function verdictWord(s, w) {
    const o = ov(s);
    if (o) return rejected(s) ? 'blocked' : 'paying';
    if (!s.ok) return 'no data';
    if (w.rem <= 0) return 'out';
    const d = w.util - w.elapsed;
    if (w.rem < 0.12) return 'wait';
    if (d > 0.15) return 'ease off';
    if (d > 0.02) return 'steady';
    return 'go';
  }

  function verdict(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const o = ov(s);

    // The marginalia: two eight-pixel strips at the very edges, one per
    // window, carrying fill, dividers and pace exactly as the columns do.
    const bcol = o ? (rejected(s) ? T.crit : T.pay)
                   : S.paceColor(T, bind.util, bind.elapsed);
    strip(g, T, 0, 0, 320, 8, s.ok ? other.rem : 0, s.ok ? other.elapsed : -1,
          other.days, T.dim, 4);
    strip(g, T, 0, 232, 320, 8,
          !s.ok ? 0 : (o ? (rejected(s) ? 0 : o.remaining) : bind.rem),
          s.ok && !o ? bind.elapsed : -1, bind.days, bcol, 4);

    // Battery: this is the layout with exactly one loud slot, so a warning has
    // to take it rather than sit beside it. When we know the device is on
    // battery the verdict IS "plug in" -- it is the decision, it takes five
    // seconds, and it outranks anything about usage because nothing else on
    // screen matters once the panel goes dark. When the charge state is
    // unreadable the verdict stays about usage and the battery joins the
    // marginalia, because taking the one slot on a guess is how a warning
    // gets ignored.
    const bat = battery(T, s);
    const takeover = bat && bat.sure;
    const word = takeover ? 'plug in' : verdictWord(s, bind);
    const h = headline(T, s, bind);
    g.setFont('FreeSansBold24pt7b'); g.setTextDatum(MC);
    g.setTextColor(takeover ? bat.col
                            : (o ? h.col
                                 : (s.ok ? S.paceColor(T, bind.util, bind.elapsed) : T.dim)), T.bg);
    g.drawString(word, 160, 74);
    if (takeover) {
      g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(bat.col, T.bg);
      g.drawString('usage: ' + verdictWord(s, bind), 160, 100);
    } else if (bat) {
      g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.text, 160, 100);
    }

    // The verdict and the headline ladder land on the same word whenever
    // extra usage is the story, and saying it twice makes the second one look
    // like a different fact.
    g.setFont(T.stat); g.setTextDatum(MC); g.setTextColor(h.col, T.bg);
    if (h.text !== word) g.drawString(h.text, 160, 122);

    g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(T.dim, T.bg);
    const sub = subhead(T, s, bind);
    g.setTextColor(sub.col, T.bg);
    g.drawString(sub.text, 160, 146);

    // Both windows' amounts and pace words, one line each. They were one line
    // until the sim measured it at 305px on a 320px screen -- which is the
    // argument for marginalia having to be laid out as carefully as the thing
    // it is marginal to.
    const [pw] = S.paceWord(T, bind.util, bind.elapsed);
    const [ow] = S.paceWord(T, other.util, other.elapsed);
    g.setTextColor(T.dim, T.bg);
    g.drawString(bind.short + ' ' + pct(s, bind) + ' left, ' + pw, 160, 166);
    g.drawString(other.short + ' ' + pct(s, other) + ' left, ' + ow, 160, 184);

    const r = reasonText(s);
    if (r) { g.setTextColor(T.crit, T.bg); g.drawString(r, 160, 202); }
    else if (s.err) {
      g.setTextColor(T.warn, T.bg);
      g.drawString(s.ageTxt + ' old, cant refresh', 160, 202);
    }
    if (o) token(g, T, 292, 176, rejected(s), 9);

    // Menu moves to the bottom-left corner so the centre stays a word. The
    // refresh indicator stays where the shipped one is, because it is the one
    // thing on this screen that has to be in the same place on every screen.
    S.drawIcon(g, 8, 198, (window.ICONS || {}).menu, T.ctrl);
    S.drawRefreshIndicator(g, T, 198, !!s.fetching,
                           s.pollFrac === undefined ? 1 : s.pollFrac,
                           s.spinPhase || 0, !!s.refreshFailed, 'dots',
                           !!s.refreshFailing);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 5 · Board ───────────────────────────────────────────
  // No graphic at all, to find out what the bar was doing. A departure board:
  // one row per limit, the number in the largest face that fits, columns
  // aligned so the eye can fall down them from three feet. The binding row is
  // named by a rule in the margin rather than by size, so the rows stay a
  // table.
  function board(g, T, s) {
    g.fillScreen(T.bg);
    const { bind } = windows(s);
    const five = s.sevenBinds ? windows(s).other : windows(s).bind;
    const seven = s.sevenBinds ? windows(s).bind : windows(s).other;
    const o = ov(s);

    const rows = [
      { w: five, name: '5-hour', binds: !s.sevenBinds },
      { w: seven, name: '7-day', binds: !!s.sevenBinds },
    ];
    if (o) rows.push({ ov: o, name: 'extra', binds: false });
    // Battery: a table just gets another row, which is the cheapest answer any
    // of the ten has -- and the row pitch has to shrink to fit it, which is
    // the cost. A table is the form that holds one more fact until the moment
    // it does not.
    const bat = battery(T, s);
    if (bat) rows.push({ bat: bat, name: 'power', binds: false });

    const pitch = rows.length > 3 ? 48 : 62;
    // Column heads only while there is room for them. A full table describes
    // itself, and the row the heads would cost is worth more than they are.
    if (rows.length <= 3) {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
      g.drawString('LIMIT', 20, 8);
      g.setTextDatum(TR); g.drawString('LEFT', 172, 8);
      g.setTextDatum(TL); g.drawString('RESETS', 186, 8);
    }
    g.drawFastHLine(8, 28, 256, T.card);

    rows.forEach((row, i) => {
      const y = 38 + i * pitch;
      if (row.bat) {
        g.fillRect(8, y, 4, 36, row.col || bat.col);
        g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(bat.col, T.bg);
        g.drawString(row.name, 20, y);
        g.drawString(bat.sure ? 'on battery' : 'charge unknown', 20, y + 20);
        g.setFont('FreeSansBold18pt7b'); g.setTextDatum(TR);
        g.setTextColor(bat.col, T.bg);
        g.drawString('low', 172, y + 2);
        g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(bat.col, T.bg);
        g.drawString('plug in', 186, y + 12);
        return;
      }
      if (row.binds) g.fillRect(8, y, 4, 48, T.accent);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.text, T.bg);
      g.drawString(row.name, 20, y);
      if (row.ov) {
        g.setTextColor(rejected(s) ? T.crit : T.pay, T.bg);
        g.drawString(S.overageWord(row.ov.status), 20, y + 20);
        g.setFont('FreeSansBold18pt7b'); g.setTextDatum(TR);
        g.setTextColor(rejected(s) ? T.crit : T.pay, T.bg);
        g.drawString(rejected(s) ? '0%' : Math.round(row.ov.remaining * 100) + '%', 172, y + 6);
        g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
        g.drawString(row.ov.resetTxt || '--', 186, y + 16);
        const r = reasonText(s);
        if (r) {
          g.setTextDatum(TR); g.setTextColor(T.crit, T.bg);
          g.drawString(r, 262, y + 32); g.setTextDatum(TL);
        }
        return;
      }
      const [word, wcol] = S.paceWord(T, row.w.util, row.w.elapsed);
      g.setTextColor(wcol, T.bg); g.drawString(word, 20, y + 20);
      g.setFont('FreeSansBold18pt7b'); g.setTextDatum(TR);
      const rem = row.w.rem * 100;
      g.setTextColor(!s.ok ? T.dim : (rem < 12 ? T.warn : T.text), T.bg);
      g.drawString(s.ok ? Math.round(rem) + '%' : '--', 172, y + 2);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
      g.drawString(s.ok ? row.w.reset : '--', 186, y + 12);
    });

    const tailY = 38 + rows.length * pitch + 6;
    if (!o && tailY < 200) {
      const sub = subhead(T, s, bind);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(sub.col, T.bg);
      g.drawString(sub.text, 20, tailY);
    }
    // With four rows there is no tail row left, so staleness moves up beside
    // the column heads rather than being dropped.
    if (tailY < 210) staleLine(g, T, s, 20, 216);
    else staleLine(g, T, s, 20, 8);

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 6 · Agenda ──────────────────────────────────────────
  // Sort everything by when it happens. This is the only one of the ten where
  // the monthly extra-usage reset is a peer rather than an orphan: it shares
  // no edge with either window, which is exactly why a layout built on edges
  // has no place to put it and a layout built on a list does.
  function agenda(g, T, s) {
    g.fillScreen(T.bg);
    const { bind } = windows(s);
    const five = s.sevenBinds ? windows(s).other : windows(s).bind;
    const seven = s.sevenBinds ? windows(s).bind : windows(s).other;
    const o = ov(s);

    const items = [
      { at: s.at5 === undefined ? 72 : s.at5, when: five.reset, what: '5-hour window',
        rem: five.rem, el: five.elapsed, days: 1, binds: !s.sevenBinds, w: five },
      { at: s.at7 === undefined ? 6120 : s.at7, when: seven.reset, what: '7-day window',
        rem: seven.rem, el: seven.elapsed, days: 7, binds: !!s.sevenBinds, w: seven },
    ];
    if (o) items.push({ at: s.atOv === undefined ? 14400 : s.atOv,
                        when: o.resetTxt || '--', what: 'extra usage allowance',
                        rem: rejected(s) ? 0 : o.remaining, el: -1, days: 1,
                        binds: false, ovRow: true });
    // Battery: the agenda is sorted by when things happen, and a dying battery
    // is the soonest thing that happens -- sooner than either reset, which is
    // exactly why it matters. So it is a row, at the top, by the same rule
    // every other row obeys. No estimate is invented: "soon" is all the gauge
    // honestly supports, and a made-up runtime would be the volatile figure
    // this project keeps refusing elsewhere.
    const bat = battery(T, s);
    if (bat) items.push({ at: -1, when: 'soon', what: 'battery runs out',
                          rem: (s.batPct || 0) / 100, el: -1, days: 1,
                          binds: false, batRow: true });
    items.sort((a, b) => a.at - b.at);
    const pitch = items.length > 3 ? 44 : 58;

    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 16, 8);
    const [pw, pc] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(pc, T.bg);
    g.drawString(pw, 262, 14);
    g.drawFastHLine(16, 40, 246, T.card);

    items.forEach((it, i) => {
      const y = 50 + i * pitch;
      if (it.batRow) {
        g.fillRect(8, y, 4, pitch - 14, bat.col);
        g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(bat.col, T.bg);
        g.drawString(bat.sure ? 'soon' : 'soon?', 16, y);
        g.setFont(T.small); g.setTextColor(bat.col, T.bg);
        g.drawString(it.what + (bat.sure ? '' : ', charge unknown'), 16, y + 24);
        strip(g, T, 176, y + 4, 86, 16, it.rem, -1, 1, bat.col, 0);
        g.setTextDatum(TR); g.drawString('plug in', 262, y + 24);
        return;
      }
      if (it.binds) g.fillRect(8, y, 4, pitch - 14, T.accent);
      g.setFont(T.stat); g.setTextDatum(TL);
      g.setTextColor(it.ovRow ? (rejected(s) ? T.crit : T.pay) : T.text, T.bg);
      g.drawString(s.ok ? it.when : '--', 16, y);
      g.setFont(T.small); g.setTextColor(T.dim, T.bg);
      g.drawString(it.what, 16, y + 24);
      const col = it.ovRow ? (rejected(s) ? T.crit : T.pay)
                           : S.paceColor(T, it.w.util, it.w.elapsed);
      strip(g, T, 176, y + 4, 86, 16, s.ok ? it.rem : 0, s.ok ? it.el : -1,
            it.days, col, 4);
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
      g.drawString(s.ok ? Math.round(it.rem * 100) + '% left' : '--', 262, y + 24);
      if (it.ovRow) token(g, T, 262, y + 12, rejected(s), 8);
    });

    // The reason already rode under the extra-usage row; repeating it in the
    // tail would be the same string twice.
    const tailY = 50 + items.length * pitch + 2;
    if (tailY < 220) staleLine(g, T, s, 16, 222);
    else staleLine(g, T, s, 262, 32, TR);

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 7 · Gap gauge ───────────────────────────────────────
  // The level is almost never the news; the distance between spend and pace
  // is. So the gauge shows only the gap, centre-zero, with the five thresholds
  // the pace words already use drawn on the scale as places. The amounts are
  // kept as numerals, because a gauge with no quantity on it cannot answer
  // "should I start this?".
  const G_X0 = 24, G_X1 = 264, G_Y = 86, G_MID = (G_X0 + G_X1) >> 1;

  function gapX(d) {
    const k = Math.max(-0.30, Math.min(0.30, d));
    return Math.round(G_MID + (k / 0.30) * ((G_X1 - G_X0) / 2));
  }

  function gapGauge(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const o = ov(s);

    g.fillRect(G_X0, G_Y - 3, G_X1 - G_X0, 6, T.card);
    // The thresholds as segments, so the colour and the word can never
    // disagree about where a boundary is.
    g.fillRect(gapX(0.02), G_Y - 3, gapX(0.15) - gapX(0.02), 6, T.warn);
    g.fillRect(gapX(0.15), G_Y - 3, G_X1 - gapX(0.15), 6, T.crit);
    for (const t of [-0.15, -0.02, 0.02, 0.15]) g.drawFastVLine(gapX(t), G_Y - 10, 20, T.dim);
    g.drawFastVLine(G_MID, G_Y - 14, 28, T.text);

    if (s.ok) {
      // The other window gets a plain stroke; the binding one gets the
      // diamond, so which is which needs no label.
      g.drawFastVLine(gapX(other.util - other.elapsed), G_Y - 16, 32, T.dim);
      S.drawPaceTick(g, T, gapX(bind.util - bind.elapsed), G_Y);
    }

    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('behind', G_X0, G_Y + 14);
    g.setTextDatum(TC); g.drawString('on pace', G_MID, G_Y + 14);
    g.setTextDatum(TR); g.drawString('ahead', G_X1, G_Y + 14);

    // The word alone in the big face, and which window it is about underneath.
    // One line read 294px on a 320px screen, which is what the measuring is
    // for -- a gauge whose caption wraps off the panel is a gauge with no
    // caption.
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.stat); g.setTextDatum(TC); g.setTextColor(s.ok ? wcol : T.dim, T.bg);
    g.drawString(s.ok ? word : 'no reading', G_MID, G_Y + 34);
    if (s.ok) {
      g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.dim, T.bg);
      g.drawString('on the ' + bind.short, G_MID, G_Y + 60);
    }

    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 20, 10);
    if (o) token(g, T, 240, 22, rejected(s), 9);

    // Battery: bolted on, and this is the layout where that is most obvious.
    // A gauge of one relationship has no spare geometry -- anything added to
    // the scale would be read as part of the measurement -- so the warning
    // takes a rule along the top edge, outside the instrument entirely.
    const bat = battery(T, s);
    if (bat) {
      g.fillRect(0, 0, 320, 4, bat.col);
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.text, 264, 10);
    }

    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(bind.short + ' ' + pct(s, bind) + ' left, resets ' +
                 (s.ok ? bind.reset : '--'), 20, 166);
    g.drawString(other.short + ' ' + pct(s, other) + ' left, resets ' +
                 (s.ok ? other.reset : '--'), 20, 186);
    // Four rows and no more. With extra usage live they are all spoken for,
    // and staleness falls back to the countdown ring's warning colour -- which
    // is the standing condition it was given a colour for in the first place.
    if (o) {
      g.setTextColor(rejected(s) ? T.crit : T.pay, T.bg);
      g.drawString('extra usage ' + S.overageWord(o.status) + ', ' +
                   (rejected(s) ? '0%' : Math.round(o.remaining * 100) + '%') +
                   ' left', 20, 206);
      const r = reasonText(s);
      if (r) { g.setTextColor(T.crit, T.bg); g.drawString(r, 20, 222); }
      g.setTextDatum(TR); g.setTextColor(rejected(s) ? T.crit : T.pay, T.bg);
      g.drawString('resets ' + (o.resetTxt || '--'), 262, 222);
      g.setTextDatum(TL);
    } else staleLine(g, T, s, 20, 206);

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 8 · Grid ────────────────────────────────────────────
  // Quantity as countable things rather than as a length. A hundred cells is
  // a hundred cells whether or not you can read the number, and the 7-day
  // field is seven columns wide, so its divisions are structural rather than
  // drawn on.
  const GR_CELL = 12, GR_GAP = 2, GR_STEP = GR_CELL + GR_GAP;

  function cellField(g, T, x, y, cols, rows, frac, col) {
    const total = cols * rows;
    const lit = Math.round(total * Math.max(0, Math.min(1, frac)));
    for (let i = 0; i < total; i++) {
      // Bottom-up, left to right, so the field empties downward the way the
      // columns do.
      const r = rows - 1 - ((i / cols) | 0), c = i % cols;
      g.fillRect(x + c * GR_STEP, y + r * GR_STEP, GR_CELL, GR_CELL,
                 i < lit ? col : T.card);
    }
  }

  function grid(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const o = ov(s);

    const five = s.sevenBinds ? other : bind;
    const seven = s.sevenBinds ? bind : other;
    const gy = 64, gh = 10 * GR_STEP - GR_GAP;

    const bcol = o ? (rejected(s) ? T.crit : T.pay)
                   : S.paceColor(T, five.util, five.elapsed);
    cellField(g, T, 20, gy, 10, 10,
              !s.ok ? 0 : (o && !s.sevenBinds ? (rejected(s) ? 0 : o.remaining) : five.rem),
              bcol);
    cellField(g, T, 172, gy, 7, 10, s.ok ? seven.rem : 0,
              s.sevenBinds ? S.paceColor(T, seven.util, seven.elapsed) : T.dim);

    // Pace in the margin, not through the field: a rule drawn across lit
    // cells is a gap in the data, which is the opposite of what it means.
    if (s.ok) {
      smallTick(g, T, 10, gy + gh - Math.round(gh * (1 - five.elapsed)), 6, T.text);
      smallTick(g, T, 162, gy + gh - Math.round(gh * (1 - seven.elapsed)), 5, T.text);
    }

    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('5-HOUR', 20, 46);
    g.drawString('7-DAY', 172, 46);
    g.drawString(s.ok ? five.reset : '--', 20, gy + gh + 4);
    g.drawString(s.ok ? seven.reset : '--', 172, gy + gh + 4);

    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 20, 10);
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(wcol, T.bg);
    g.drawString(word, 262, 20);

    if (o) token(g, T, 20 + 5 * GR_STEP - 1, gy + gh, rejected(s), 9);

    // Battery: the left gutter already exists to hold a mark that is about
    // the field without being in it, so it becomes the warning margin. A cell
    // inside the field would be read as a unit of budget, which is a lie of
    // exactly the kind a countable display makes easy to tell.
    const bat = battery(T, s);
    if (bat) {
      g.fillRect(0, gy - 6, 3, gh + 12, bat.col);
    }

    // The bottom row takes two claimants side by side, which it can because
    // the reason string is short and the field above needs no caption.
    const r = reasonText(s);
    g.setFont(T.small); g.setTextDatum(TL);
    if (r) { g.setTextColor(T.crit, T.bg); g.drawString(r, 20, 222); }
    else staleLine(g, T, s, 20, 222);
    if (bat) {
      g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.text, 262, 222);
    }

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 9 · Horizon ─────────────────────────────────────────
  // One time axis, both windows on it, each drawn as the glide path its own
  // average burn describes. The line hits zero at window-fraction elapsed ÷
  // utilization -- the same two numbers the diamond compares, rearranged into
  // a place in time. On pace it lands exactly on the reset tick; ahead of pace
  // it lands short, which is the thing you actually want to know, stated as a
  // moment rather than as a gap.
  const H_X0 = 20, H_MID = 142, H_X1 = 262, H_BASE = 186, H_TOP = 70;

  function horizon(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const five = s.sevenBinds ? other : bind;
    const seven = s.sevenBinds ? bind : other;
    const o = ov(s);

    g.drawFastHLine(H_X0, H_BASE, H_X1 - H_X0 + 8, T.dim);
    // Two spans on one axis: the next five hours on the left, the rest of the
    // week on the right. The break is marked, because a piecewise axis that
    // hides its own break lies about distance.
    g.drawFastVLine(H_MID, H_BASE - 6, 12, T.dim);
    g.drawFastVLine(H_X1, H_BASE - 6, 12, T.dim);
    for (let i = 1; i < 7; i++) {
      const x = H_MID + Math.round((H_X1 - H_MID) * i / 7);
      g.drawFastVLine(x, H_BASE - 3, 6, T.card);
    }

    // A glide, per window: the height at "now" is what is left, and the line
    // runs down to where that burn would empty it.
    const draw = (w, x0, x1, col, h) => {
      if (!s.ok) return;
      const y0 = H_BASE - Math.round((H_BASE - H_TOP) * Math.max(0, Math.min(1, w.rem)) * h);
      const empty = w.util <= 0.001 ? 4 : w.elapsed / w.util;   // in window-fractions
      const span = (x1 - x0) / Math.max(0.0001, 1 - w.elapsed);
      let xe = x0 + Math.round(span * Math.max(0, empty - w.elapsed));
      const off = xe > x1 + 8;
      if (off) xe = x1 + 8;
      const steps = Math.max(1, xe - x0);
      for (let i = 0; i <= steps; i++) {
        const x = x0 + i;
        const y = Math.round(y0 + (H_BASE - y0) * (i / steps));
        g.fillRect(x, y, 1, H_BASE - y, col);
      }
      if (off) { g.fillRect(xe, H_BASE - 4, 6, 3, col); g.fillRect(xe + 4, H_BASE - 6, 2, 7, col); }
      return xe;
    };

    draw(seven, H_MID, H_X1, s.sevenBinds ? S.paceColor(T, seven.util, seven.elapsed) : T.dim, 0.55);
    draw(five, H_X0, H_MID, o ? (rejected(s) ? T.crit : T.pay)
                              : S.paceColor(T, five.util, five.elapsed), 1);

    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.dim, T.bg);
    g.drawString(s.ok ? five.reset : '--', H_MID, H_BASE + 10);
    g.setTextDatum(TR); g.drawString(s.ok ? seven.reset : '--', H_X1 + 8, H_BASE + 10);
    g.setTextDatum(TL); g.drawString('now', H_X0, H_BASE + 10);
    g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('5-hour', H_X0, H_BASE + 24);
    g.setTextDatum(TR); g.drawString('7-day', H_X1 + 8, H_BASE + 24);

    const h = headline(T, s, bind);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 20, 6);
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(wcol, T.bg);
    g.drawString(word + ', ' + pct(s, bind) + ' left', 20, 34);
    g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
    g.drawString(other.short + ' ' + pct(s, other) + ' left', 262, 34);

    if (o) {
      token(g, T, 244, 14, rejected(s), 9);
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(rejected(s) ? T.crit : T.pay, T.bg);
      g.drawString('extra usage ' + (rejected(s) ? '0%' : Math.round(o.remaining * 100) + '%') +
                   ' left, resets ' + (o.resetTxt || '--'), 262, 52);
    }

    // Battery: structurally the best fit of the ten after Agenda. The axis is
    // already "when things happen", and the device stopping is one of those
    // things -- so it is a marked moment on the same axis, and it sits left of
    // both reset ticks, which says the whole picture ends before either of
    // them arrives. Position is nominal: the gauge supports no runtime figure,
    // so the mark sits near "now" and is labelled rather than measured.
    const bat = battery(T, s);
    if (bat) {
      const bx = H_X0 + 46;
      for (let y = H_TOP; y < H_BASE + 5; y += 4) g.fillRect(bx, y, 2, 2, bat.col);
      g.fillRect(bx - 1, H_BASE - 2, 4, 4, bat.col);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.sure ? 'bat' : 'bat?', bx + 5, H_BASE + 10);
    }
    const r = reasonText(s);
    if (r) {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.crit, T.bg);
      g.drawString(r, 20, 224);
    } else staleLine(g, T, s, 20, 224);
    if (bat) {
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.text, 262, 224);
    }

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // ── 10 · Solo ───────────────────────────────────────────
  // Show the limit that will stop you, at the size that deserves, and make the
  // other one earn its space. By default it is one line of type. It grows back
  // into a strip when it comes within `soloThresh` of binding, so the layout
  // changes shape for a reason and only then -- the same test the promotion to
  // a wide column already has to pass.
  const SO_X = 16, SO_W = 246, SO_Y = 152, SO_H = 54;

  function solo(g, T, s) {
    g.fillScreen(T.bg);
    const { bind, other } = windows(s);
    const o = ov(s);
    const thresh = s.soloThresh === undefined ? 0.15 : s.soloThresh;
    const close = s.ok && (other.rem - bind.rem) < thresh;

    const col = o ? (rejected(s) ? T.crit : T.pay)
                  : S.paceColor(T, bind.util, bind.elapsed);
    g.fillRoundRect(SO_X, SO_Y, SO_W, SO_H, 8, T.card);
    if (s.ok) {
      const rem = o ? (rejected(s) ? 0 : o.remaining) : bind.rem;
      const fw = Math.round(SO_W * Math.max(0, Math.min(1, rem)));
      if (fw > 0) g.fillRoundRect(SO_X, SO_Y, fw, SO_H, 8, col);
      if (bind.days > 1)
        for (let i = 1; i < bind.days; i++)
          g.drawFastVLine(SO_X + Math.round(SO_W * i / bind.days), SO_Y, SO_H, T.bg);
      if (!o) S.drawPaceTick(g, T, SO_X + Math.round(SO_W * (1 - bind.elapsed)), SO_Y + (SO_H >> 1));
    }
    if (o) token(g, T, SO_X + SO_W, SO_Y + (SO_H >> 1), rejected(s), 11);

    const h = headline(T, s, bind);
    g.setFont('FreeSansBold24pt7b'); g.setTextDatum(TL); g.setTextColor(h.col, T.bg);
    g.drawString(h.text, 14, 26);
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(bind.label, 16, 6);
    const sub = subhead(T, s, bind);
    g.setTextColor(sub.col, T.bg); g.setTextDatum(TL);
    g.drawString(sub.text, 16, 80);
    const [word, wcol] = S.paceWord(T, bind.util, bind.elapsed);
    g.setTextColor(wcol, T.bg); g.drawString(word, 16, 98);

    // Battery: Solo's whole claim is that dropping a window buys room, so this
    // is where it spends some. The warning takes the top-right line the other
    // window was using, and the other window falls back to its strip -- which
    // is the trade the layout says it can afford, drawn rather than asserted.
    const bat = battery(T, s);
    if (bat) {
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(bat.col, T.bg);
      g.drawString(bat.text, 262, 6);
    }

    // The other window: a line, or a strip once it is close enough to matter.
    if (close || bat) {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.text, T.bg);
      g.drawString(other.short + ' ' + pct(s, other) + ' left, ' +
                   (s.ok ? other.reset : '--'), 16, 116);
      strip(g, T, SO_X, 134, SO_W, 10, other.rem, other.elapsed, other.days, T.dim, 4);
    } else {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
      g.drawString(other.short + ' ' + pct(s, other) + ' left, ' +
                   (s.ok ? other.reset : '--'), 16, 116);
    }

    const r = reasonText(s);
    if (r) {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.crit, T.bg);
      g.drawString(r, 16, 222);
    } else staleLine(g, T, s, 16, 222);

    ctrlColumn(g, T, s);
    S.drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  window.DASHALTS = {
    list: [
      ['1 · Dial', 'One circle: the arc ahead of the hand is the time left, its thickness is the budget left.', dial],
      ['2 · Tide', 'The whole screen is one draining tank; the waterline is the budget.', tide],
      ['3 · Face', 'Two eyes are the two windows, lids drop as the budget goes, the mouth carries pace.', face],
      ['4 · Verdict', 'One word saying what to do; every number demoted to the screen edges.', verdict],
      ['5 · Board', 'A departure board. Type only, no graphic, aligned to be read from three feet.', board],
      ['6 · Agenda', 'Everything sorted by when it happens, so the monthly overage reset is a peer.', agenda],
      ['7 · Gap gauge', 'A centre-zero needle showing only the distance between spend and pace.', gapGauge],
      ['8 · Grid', 'Budget as countable lit cells; the 7-day field is seven columns wide.', grid],
      ['9 · Horizon', 'Both windows as glide paths on one time axis; the line lands where you run out.', horizon],
      ['10 · Solo', 'The binding window full-bleed; the other earns a strip only when it is close.', solo],
    ],
    dial, tide, face, verdict, board, agenda, gapGauge, grid, horizon, solo,
  };
})();
