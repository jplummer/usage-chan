// The device's screens, ported from src/ui.cpp line for line so the sim shows
// what the panel shows. Geometry constants match ui.cpp; when they diverge,
// ui.cpp is wrong or this is, and the diff is the finding.
//
// Everything takes a `T` (theme) object so the look-and-feel page can swap
// faces and colours without forking the layout code. The default theme is
// the shipped firmware.
(function () {
  'use strict';
  const { TL, TC, TR, ML, MC } = LGFX;

  const SHIPPED = {
    name: 'shipped',
    bg: 0x14110F, card: 0x241F1B, text: 0xE8E3DD, dim: 0x8A817A,
    accent: 0xD97757, ok: 0x5FA672, warn: 0xD9A441, crit: 0xD9564F, pay: 0x6E93C9,
    // The control column draws in its own colour rather than borrowing dim.
    // It is chrome, not content: it competes with the numbers for attention
    // and should lose. Separate so it can come down without dimming the pace
    // words, which say something.
    ctrl: 0x8A817A,
    small: 'Font2',                 // labels, captions, status, menu rows
    headline: 'FreeSansBold24pt7b', // the big number (horizontal layout only)
    title: 'FreeSansBold18pt7b',    // boot and setup screens
    stat: 'FreeSansBold12pt7b',     // vertical layout's headline: same column
                                     // has to fit "100% left" and "near cap",
                                     // which 24pt (and even 18pt) clip.
  };

  function paceColor(T, util, elapsed) {
    const d = util - elapsed;
    if (d > 0.15) return T.crit;
    if (d > 0.02) return T.warn;
    return T.ok;
  }

  function fmtReset(s, withDay) {
    // The sim has no clock; the state carries the strings the device would
    // have formatted. `s.tz` false gives the duration fallback.
    return withDay ? s.reset7 : s.reset5;
  }

  function drawPaceTick(g, T, cx, cy) {
    for (let r = 7; r >= 6; r--) {
      const c = r === 7 ? T.bg : T.text;
      for (let dy = -r; dy <= r; dy++) {
        const dx = r - Math.abs(dy);
        g.drawFastHLine(cx - dx, cy + dy, dx * 2 + 1, c);
      }
    }
  }

  // The blocked mark's X, plotted a pixel at a time. Font2's own 'X' blobs
  // against the edge of a 14px circle, and a 45-degree diagonal is exact, so
  // there is nothing here a line routine would do better -- and ui.cpp plots
  // it the same way, so the two agree pixel for pixel.
  // Two 45-degree bands, each tested per pixel rather than plotted along a
  // line: stepping along one diagonal while offsetting along the other only
  // ever lands on pixels of one parity, which comes out as a checkerboard.
  // Rotate the coordinates instead — a = along one arm, b = across it — and
  // the band fills solid with its ends cut square to the arm.
  function drawMarkX(g, cx, cy, arm, col, thick) {
    const t = (thick == null) ? 2 : thick, len = arm * 2, r = arm + t;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const a = dx + dy, b = dx - dy;
        if ((Math.abs(b) <= t && Math.abs(a) <= len) ||
            (Math.abs(a) <= t && Math.abs(b) <= len)) g.drawPixel(cx + dx, cy + dy, col);
      }
  }

  function drawPaceCaption(g, T, bx, bw, y, util, elapsed) {
    const d = util - elapsed;
    let txt, col;
    if (d > 0.15)       { txt = 'well ahead';      col = T.crit; }
    else if (d > 0.02)  { txt = 'a bit ahead';  col = T.warn; }
    else if (d < -0.15) { txt = 'well behind';     col = T.dim; }
    else if (d < -0.02) { txt = 'a bit behind'; col = T.dim; }
    else                { txt = 'on pace';         col = T.dim; }
    g.setFont(T.small);
    const half = (g.textWidth(txt) / 2) | 0;
    let cx = bx + Math.round(bw * elapsed);
    if (cx < bx + half) cx = bx + half;
    if (cx > bx + bw - half) cx = bx + bw - half;
    g.setTextDatum(TC);
    g.setTextColor(col, T.bg);
    g.drawString(txt, cx, y);
  }

  function drawWindowBar(g, T, y, label, util, elapsed, resetTxt, valid) {
    const bx = 16, bw = 320 - 32, bh = 24;
    const rem = 100 - util;
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(label, bx, y);

    const haveReset = valid && !!resetTxt;
    const plenty = rem >= 40;
    let headline;
    if (!valid) headline = '--';
    else if (plenty) headline = Math.round(rem) + '% left';
    else if (haveReset) headline = resetTxt;
    else headline = '--';

    g.setFont(T.headline); g.setTextDatum(TR);
    g.setTextColor(valid ? (plenty ? T.text : T.accent) : T.dim, T.bg);
    g.drawString(headline, bx + bw, y - 6);

    const by = y + 38;
    g.fillRoundRect(bx, by, bw, bh, 5, T.card);
    const e = valid ? elapsed : -1;
    if (valid) {
      const u = Math.max(0, Math.min(100, util));
      const edge = bx + Math.round(bw * u / 100);
      const wRem = bx + bw - edge;
      if (wRem > 0) g.fillRoundRect(edge, by, wRem, bh, 5, e >= 0 ? paceColor(T, u / 100, e) : T.ok);
      if (e >= 0) {
        drawPaceTick(g, T, bx + Math.round(bw * e), by + (bh >> 1));
        drawPaceCaption(g, T, bx, bw, by + bh + 4, u / 100, e);
      }
    }

    g.setFont(T.small); g.setTextDatum(TR);
    const fy = by + bh + 4 + g.fontHeight(T.small) - 1;
    if (valid && plenty && haveReset) {
      g.setTextColor(T.dim, T.bg); g.drawString('resets ' + resetTxt, bx + bw, fy);
    } else if (valid && rem <= 0) {
      g.setTextColor(T.warn, T.bg); g.drawString('out', bx + bw, fy);
    } else if (valid && rem < 12) {
      g.setTextColor(T.warn, T.bg); g.drawString('nearly out', bx + bw, fy);
    }
  }

  function drawSevenDayBar(g, T, y, s, L = (x => x)) {
    const bx = 16, bw = 320 - 32, bh = 8;
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(L('7-DAY'), bx, y);
    if (s.ok && s.reset7) { g.setTextDatum(TR); g.drawString('resets ' + s.reset7, bx + bw, y); }
    const by = y + g.fontHeight(T.small) + 4;
    g.fillRoundRect(bx, by, bw, bh, 3, T.card);
    if (!s.ok) return;
    const e = s.e7, u = Math.max(0, Math.min(100, s.d7));
    const edge = bx + Math.round(bw * u / 100);
    const wRem = bx + bw - edge;
    if (wRem > 0) g.fillRoundRect(edge, by, wRem, bh, 3, e >= 0 ? paceColor(T, u / 100, e) : T.ok);
    for (let i = 1; i < 7; i++) g.drawFastVLine(bx + ((bw * i / 7) | 0), by, bh, T.bg);
    if (e >= 0) {
      drawPaceTick(g, T, bx + Math.round(bw * e), by + (bh >> 1));
      drawPaceCaption(g, T, bx, bw, by + bh + 6, u / 100, e);
    }
  }

  function drawSpinner(g, T, x, y, phase) {
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.accent, T.bg);
    g.drawString('|/-\\'[phase & 3], x, y);
  }

  // Same five-way split drawPaceCaption() uses, factored out so the vertical
  // layout's fixed-position caption (which can't centre on a moving diamond
  // the way the horizontal one does) can reuse the words and colours without
  // re-typing the thresholds.
  function paceWord(T, util, elapsed) {
    const d = util - elapsed;
    if (d > 0.15)      return ['well ahead', T.crit];
    if (d > 0.02)      return ['a bit ahead', T.warn];
    if (d < -0.15)     return ['well behind', T.dim];
    if (d < -0.02)     return ['a bit behind', T.dim];
    return ['on pace', T.dim];
  }

  // Headline copy for the extra-usage states. overage-status values seen so
  // far: allowed | allowed_warning | rejected.
  function overageWord(status) {
    if (status === 'rejected')        return 'blocked';
    if (status === 'allowed_warning') return 'near cap';
    if (status === 'allowed')         return 'paying';
    return 'overage';
  }

  // ── Vertical dashboard, shipped 2026-09-19 ──────────────
  // Two columns side by side instead of two bars stacked. Each bar fills
  // bottom-up, so its own bottom edge reads as exhaustion the same way the
  // old bar's right edge did. The 5-hour window is always the wide bar on the
  // right and the 7-day window always the thin bar on the left. Until
  // 2026-11-10 the window the server named as binding took the wide column,
  // and the swap produced a screen that looked almost the same and meant
  // something else. A reserved column on the right stays empty on purpose: a
  // fixed-width home for whatever needs one later (signal, the menu button,
  // an update spinner), rather than more text fighting for room on a line
  // that's already full.
  const V7_X = 91, V7_W = 24;          // thin column: 7-day
  const V5_X = 123, V5_W = 48;         // wide column: 5-hour
  const V5_TEXT_X = 178;               // wide column's text, left-aligned
  const V7_TEXT_R = 84;                // thin column's text, right-aligned to this x
  const V_CTRL_X = 278, V_CTRL_W = 42;
  const V_TITLE_Y = 8, V_HEAD_Y = 29, V_FOOT_Y = 224;
  const V_SUB_Y = V_TITLE_Y + 18;      // thin column's amount line
  // The headline sits 2px left of the other rows: Sans Bold carries more left
  // bearing than Font2, so matching the box edges leaves the stems misaligned.
  const V_HEAD_X = V5_TEXT_X - 2;
  const V_REASON_Y = V_HEAD_Y + 27;   // third line of the stat block
  const V_TOKEN_ARM = 11, V_TOKEN_T = 3, V_TOKEN_RING = 3;
  const V_CIRCLE_Y0 = 11, V_CIRCLE_Y1 = 156, V_CIRCLE_Y2 = 198;  // menu, signal, refresh
  const V_CIRCLE_D = 32;               // the frames say 32, not 33
  // The refresh spinner, straight off the frame: eight 2x10 spokes between
  // radius 6 and radius 16, one of them dark and moving.
  const V_SPOKES = 8, V_SPOKE_R0 = 6, V_SPOKE_R1 = 16, V_SPOKE_HW = 1;
  // The other spinner: eight dots on a ring, same eight positions, same gap.
  const V_DOT_RING = 12.8, V_DOT_R = 2.9;
  const V_FAIL_HOLD_MS = 5000;
  // The menu button's touch zone, deliberately bigger than its circle: 32px is
  // about 5mm on this panel and the reliable floor is nearer 7mm.
  const V_MENU_HIT_L = 264, V_MENU_HIT_T = 0, V_MENU_HIT_R = 320, V_MENU_HIT_B = 56;
  // The wifi levels are a data rule, not a picture: four buckets because the
  // frames draw four. The pictures come from design/icons via icons.js.
  const V_TRACK_H = 240;               // both bars, every state: a bar that
                                       // changes length makes the screen
                                       // twitch exactly when it has something
                                       // to say. Full panel height since
                                       // 2026-11-10, so the bars stand on the
                                       // floor of the display.


  // The pace caption rides with the diamond, so the mark and the words read
  // as one object rather than two facts on the same screen. It steps aside
  // when that would land it on a row that never moves. Same intent as
  // drawPaceCaption's clamp in the horizontal layout, turned ninety degrees:
  // there it dodged the bar's own ends, here it dodges the headline and the
  // reset line.
  function captionY(tickCy, avoid) {
    const H = 16, lo = 0, hi = V_TRACK_H - H;
    let y = Math.min(hi, Math.max(lo, Math.round(tickCy) - (H >> 1)));
    for (const [top, bot] of avoid) {
      if (y >= bot || y + H <= top) continue;            // already clear
      const above = top - H - 2, below = bot + 2;
      const fitsA = above >= lo, fitsB = below <= hi;
      if (fitsA && fitsB) y = (tickCy < (top + bot) / 2) ? above : below;
      else if (fitsA)     y = above;
      else if (fitsB)     y = below;
    }
    return Math.min(hi, Math.max(lo, y));
  }

  function outlinedGlyph(g, T, ch, font, x, y, fill, ring, weight) {
    g.setFont(font); g.setTextDatum(TL);
    g.setTextColor(ring, ring);
    for (let dy = -weight; dy <= weight; dy++)
      for (let dx = -weight; dx <= weight; dx++)
        if (dx * dx + dy * dy <= weight * weight) g.drawString(ch, x + dx, y + dy);
    g.setTextColor(fill, fill);
    g.drawString(ch, x, y);
  }

  // Sits inside the bottom of the track, at the end you just reached. It
  // straddled the track's end edge while the track stopped at 224; at 240
  // half of it would be off the panel. The ring is C_BG, which separates the
  // token from the fill around it. The '$' sits by its ink rather than its
  // box: FreeSansBold18pt7b puts that glyph's 29 rows flush with the box top,
  // so the box goes 29 above the base plus a 4px margin.
  function drawToken(g, T, cx, rejected) {
    const col = rejected ? T.crit : T.pay;
    if (rejected) {
      drawMarkX(g, cx, V_TRACK_H - 16, V_TOKEN_ARM, T.bg, V_TOKEN_T + V_TOKEN_RING);
      drawMarkX(g, cx, V_TRACK_H - 16, V_TOKEN_ARM, col, V_TOKEN_T);
    } else {
      g.setFont(T.title);                       // FreeSansBold18pt7b, ink 29 tall
      const w = g.textWidth('$');
      outlinedGlyph(g, T, '$', T.title, cx - (w >> 1), V_TRACK_H - 33,
                    col, T.bg, V_TOKEN_RING);
    }
  }

  // One column. `wide` picks the slot: the 48px bar on the right with the
  // headline, which is always the 5-hour window, or the 24px bar on the left
  // with one small amount line, which is always the 7-day window. `binds`
  // says the server named this window as the one that will stop you;
  // `overage` is only passed for that window, since extra usage only applies
  // to it. `days` puts day dividers on the 7-day bar. `resetTxt` is
  // pre-formatted (the sim has no clock).
  //
  // Every row holds one kind of fact in every state: title, amount, pace,
  // and reset time at the foot. Until 2026-11-10 the headline swapped to a
  // bare reset time below 40%, in an orange that could match the other bar.
  function drawVBar(g, T, wide, binds, label, util, elapsed, resetTxt, valid, days, overage) {
    const trackX = wide ? V5_X : V7_X;
    const trackW = wide ? V5_W : V7_W;
    const textX  = wide ? V5_TEXT_X : V7_TEXT_R;
    const datum  = wide ? TL : TR;

    const isOverage = !!(overage && overage.active);
    const rejected  = isOverage && overage.status === 'rejected';
    // The thin column has no room for the reason: "out of credits" is 88px
    // and the slot is 84.
    const showReason = wide && rejected && !!overage.disabledReason;
    const trackH    = V_TRACK_H;

    const rem = 100 - util;
    const u = Math.max(0, Math.min(100, util));
    const e = valid ? elapsed : -1;
    const haveReset = valid && !!resetTxt;
    // The colour this column's bar is drawn in. Words that take it read as
    // belonging to this bar and not the one beside it.
    const barCol = isOverage ? (rejected ? T.crit : T.pay)
                 : (valid && e >= 0) ? paceColor(T, u / 100, e) : T.ok;

    // Title. The binding window's is lit: white on the wide column, where the
    // headline carries the colour, and the bar's colour on the thin one.
    const lit = !binds ? T.dim : (wide ? T.text : barCol);
    g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(lit, T.bg);
    g.drawString(label, textX, V_TITLE_Y);

    let blockBot = V_TITLE_Y + 16;
    if (wide) {
      let headline, hcol;
      if (isOverage)   { headline = overageWord(overage.status); hcol = barCol; }
      else if (!valid) { headline = '--'; hcol = T.dim; }
      else             { headline = Math.round(rem) + '% left'; hcol = barCol === T.ok ? T.text : barCol; }

      g.setFont(T.stat); g.setTextDatum(TL);
      g.setTextColor(hcol, T.bg);
      g.drawString(headline, textX - 2, V_HEAD_Y);   // optical, see V_HEAD_X
      blockBot = showReason ? V_REASON_Y + 16 : V_HEAD_Y + 23;

      // The reason explains the headline, so it rides directly under it as a
      // third line of the same block rather than floating mid-column in the
      // caption's travel band.
      if (showReason) {
        g.setFont(T.small); g.setTextColor(T.dim, T.bg);
        g.drawString(String(overage.disabledReason).replace(/_/g, ' '), textX, V_REASON_Y);
      }
    } else if (isOverage || valid) {
      const sub = isOverage ? overageWord(overage.status) : Math.round(rem) + '% left';
      g.setTextColor(isOverage ? barCol : lit, T.bg);
      g.drawString(sub, textX, V_SUB_Y);
      blockBot = V_SUB_Y + 16;
    }

    // Foot: when this window resets, or when extra usage does.
    g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(T.dim, T.bg);
    if (isOverage) { if (overage.resetTxt) g.drawString(overage.resetTxt, textX, V_FOOT_Y); }
    else if (haveReset) g.drawString(resetTxt, textX, V_FOOT_Y);

    g.fillRoundRect(trackX, 0, trackW, trackH, 6, T.card);
    let used = null;
    if (isOverage) {
      g.drawRoundRect(trackX, 0, trackW, trackH, 6, barCol);
      g.drawRoundRect(trackX + 1, 1, trackW - 2, trackH - 2, 5, barCol);
      // Blocked holds nothing. Paying holds whatever the overage budget has
      // left, read by the same rule as the green: fill is what is available.
      const orem = rejected ? 0 : Math.max(0, Math.min(1, overage.remaining || 0));
      const oh = Math.round(trackH * orem);
      if (oh > 0) g.fillRoundRect(trackX, trackH - oh, trackW, oh, 6, T.pay);
      used = 1 - orem;
    } else if (valid) {
      const usedH = Math.round(trackH * u / 100);
      const fillH = trackH - usedH;
      if (fillH > 0) g.fillRoundRect(trackX, usedH, trackW, fillH, 6, barCol);
      if (days > 1) {
        for (let i = 1; i < days; i++) g.drawFastHLine(trackX, (trackH * i / days) | 0, trackW, T.bg);
      }
      used = u / 100;
    }
    if (used !== null && e >= 0) {
      const cy = Math.round(trackH * e);
      drawPaceTick(g, T, trackX + trackW / 2, cy);
      const [word, col2] = paceWord(T, used, e);
      // The title block is the caption's one obstacle above and the reset
      // line its one obstacle below.
      const avoid = [[V_TITLE_Y, blockBot], [V_FOOT_Y, V_FOOT_Y + 16]];
      g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(col2, T.bg);
      g.drawString(word, textX, captionY(cy, avoid));
    }

    if (isOverage) {
      // Blocked gets a mark too, not just a colour change: red-vs-blue alone
      // doesn't survive a glance from across the desk, a dimmed backlight, or
      // an eye that doesn't separate those two hues. The glyph carries the
      // state; the colour only reinforces it.
      drawToken(g, T, trackX + trackW / 2, rejected);
    }
  }

  // ── The control column's circles ────────────────────────
  // Every circle in this column is 32 pixels across and drawn the same way: a
  // pixel belongs to it when its centre falls inside a radius-16 circle
  // centred on the box. That's exactly what Figma means by a 32px ellipse,
  // which fillCircle can't express -- an integer centre always yields an odd
  // diameter -- and it keeps the three circles identical to each other.
  // fillRoundRect gets within a pixel, but the pie has to agree with its own
  // ring perfectly, and "within a pixel" is what makes a full ring look fatter
  // than the disc beside it.
  const V_CIRCLE_R = V_CIRCLE_D / 2;

  function ctrlDisc(g, y, col) {
    for (let py = 0; py < V_CIRCLE_D; py++)
      for (let px = 0; px < V_CIRCLE_D; px++) {
        const dx = px + 0.5 - V_CIRCLE_R, dy = py + 0.5 - V_CIRCLE_R;
        if (dx * dx + dy * dy <= V_CIRCLE_R * V_CIRCLE_R)
          g.drawPixel(V_CTRL_X + px, y + py, col);
      }
  }

  // The empty track the pie fills into: a one-pixel ring inside the same
  // circle, matching the frame's inside stroke.
  function ctrlRing(g, y, col) {
    const inner = V_CIRCLE_R - 1;
    for (let py = 0; py < V_CIRCLE_D; py++)
      for (let px = 0; px < V_CIRCLE_D; px++) {
        const dx = px + 0.5 - V_CIRCLE_R, dy = py + 0.5 - V_CIRCLE_R;
        const d2 = dx * dx + dy * dy;
        if (d2 <= V_CIRCLE_R * V_CIRCLE_R && d2 > inner * inner)
          g.drawPixel(V_CTRL_X + px, y + py, col);
      }
  }

  // A pie filled clockwise from twelve o'clock, in the same circle, so a full
  // one is indistinguishable from the disc.
  function ctrlWedge(g, y, frac, col) {
    if (frac <= 0) return;
    if (frac > 1) frac = 1;
    const sweep = frac * 2 * Math.PI;
    for (let py = 0; py < V_CIRCLE_D; py++)
      for (let px = 0; px < V_CIRCLE_D; px++) {
        const dx = px + 0.5 - V_CIRCLE_R, dy = py + 0.5 - V_CIRCLE_R;
        if (dx * dx + dy * dy > V_CIRCLE_R * V_CIRCLE_R) continue;
        let a = Math.atan2(dx, -dy);        // clockwise from straight up
        if (a < 0) a += 2 * Math.PI;
        if (a < sweep) g.drawPixel(V_CTRL_X + px, y + py, col);
      }
  }

  // The same eight positions as the spokes, drawn as dots. Fewer edges for
  // the eye to catch on; slightly more ink. Which of the two is quieter is a
  // looking question, not an arguing one -- explore.html puts them side by side.
  function ctrlDots(g, y, gap, col) {
    for (let k = 0; k < V_SPOKES; k++) {
      if (k === gap) continue;
      const a = k * (2 * Math.PI / V_SPOKES);
      const cx = V_CIRCLE_R + V_DOT_RING * Math.sin(a);
      const cy = V_CIRCLE_R - V_DOT_RING * Math.cos(a);
      for (let py = 0; py < V_CIRCLE_D; py++)
        for (let px = 0; px < V_CIRCLE_D; px++) {
          const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
          if (dx * dx + dy * dy <= V_DOT_R * V_DOT_R)
            g.drawPixel(V_CTRL_X + px, y + py, col);
        }
    }
  }

  // Eight spokes with one missing, the gap advancing a step per redraw. Each
  // spoke is tested in its own rotated frame: distance along it against the
  // two radii, distance across it against half the width.
  function ctrlSpokes(g, y, gap, col) {
    for (let py = 0; py < V_CIRCLE_D; py++)
      for (let px = 0; px < V_CIRCLE_D; px++) {
        const dx = px + 0.5 - V_CIRCLE_R, dy = py + 0.5 - V_CIRCLE_R;
        for (let k = 0; k < V_SPOKES; k++) {
          if (k === gap) continue;
          const a = k * (2 * Math.PI / V_SPOKES);
          const ux = Math.sin(a), uy = -Math.cos(a);   // k = 0 points up
          const t = dx * ux + dy * uy, sx = -dx * uy + dy * ux;
          if (t >= V_SPOKE_R0 && t < V_SPOKE_R1 && sx >= -V_SPOKE_HW && sx < V_SPOKE_HW) {
            g.drawPixel(V_CTRL_X + px, y + py, col);
            break;
          }
        }
      }
  }

  // ── Icons ───────────────────────────────────────────────
  // One uint32 per row, bit 31 leftmost, 32 rows, generated from the Figma
  // frames by tools/icons2c.py. Every fixed picture in the control column is
  // one of these; only the things driven by a live value -- the countdown
  // wedge, the spinner -- are still drawn by hand.
  function drawIconScaled(g, x, y, ic, col, s) {
    if (!ic) return;
    for (let py = 0; py < ic.h; py++)
      for (let px = 0; px < ic.w; px++) {
        const w = ic.bits[py * ic.stride + (px >> 5)];
        if (!(w & (1 << (31 - (px & 31))))) continue;
        if (s === 1) g.drawPixel(x + px, y + py, col);
        else         g.fillRect(x + px * s, y + py * s, s, s, col);
      }
  }
  function drawIcon(g, x, y, ic, col) { drawIconScaled(g, x, y, ic, col, 1); }

  // RSSI is a proxy for "will fetches work", and a coarse one -- see the open
  // note in design-decisions.md. A non-negative reading means no link: a
  // connected radio always reports a negative dBm.
  function wifiLevel(rssi) {
    if (rssi >= 0) return 0;
    if (rssi >= -60) return 3;
    if (rssi >= -70) return 2;
    return 1;
  }

  // ghost: the bands the link doesn't reach show as their own outline, so the
  // figure keeps one silhouette and the scale is on screen every time you
  // look. With ghost off they are simply absent -- quieter, and quietest when
  // the news is worst. No-link keeps the ghosted figure either way: it is the
  // one state worth being loud about, and a strike through nothing says
  // nothing.
  function wifiIcon(rssi, ghost) {
    const I = window.ICONS || {};
    switch (wifiLevel(rssi)) {
      case 3:  return I['wifi-hi'];
      case 2:  return ghost ? I['wifi-med'] : I['wifi-med-alt'];
      case 1:  return ghost ? I['wifi-lo']  : I['wifi-lo-alt'];
      default: return I['wifi-out'];
    }
  }

  // Two states, one object: a ring that fills clockwise as the poll interval
  // runs down, and a spinner while the fetch it was counting towards is
  // happening. Every poll spends a sliver of the budget this screen reports,
  // so the thing that spends it should be something you can watch.
  function drawRefreshIndicator(g, T, y, fetching, frac, phase, failed, style, failing) {
    // The mark for a failed attempt outranks everything: it holds the circle
    // for a few seconds and then gives way to the countdown to the retry.
    if (failed) { drawIcon(g, V_CTRL_X, y, (window.ICONS || {})['refresh-fail'], T.ctrl); return; }
    if (fetching) {
      const gap = (phase | 0) % V_SPOKES;
      if (style === 'bars') ctrlSpokes(g, y, gap, T.ctrl);
      else                  ctrlDots(g, y, gap, T.ctrl);
      return;
    }
    // Counting down after a failure is a standing condition, not an event, so
    // it gets a colour rather than a shape. The five-second mark is the
    // announcement; this is what is still true afterwards.
    const col = failing ? T.warn : T.ctrl;
    ctrlRing(g, y, col);
    ctrlWedge(g, y, frac, col);
  }

  // The dashboard's one touch target.
  function menuButtonHit(x, y) {
    return x >= V_MENU_HIT_L && x < V_MENU_HIT_R &&
           y >= V_MENU_HIT_T && y < V_MENU_HIT_B;
  }

  // ── The smoke overlay ───────────────────────────────────
  // "The overlay scales with how much of the screen it invalidates." A single
  // failed fetch invalidates nothing -- the numbers are as true as they were a
  // second before. What earns an overlay is a condition that cannot get better
  // on its own: the radio is down, so the next fetch cannot possibly succeed,
  // or three attempts in a row failed with the radio up, which is the far end.
  //
  // It veils rather than hides. The numbers behind it are still true, just
  // ageing, and covering them would claim we know less than we do.
  const SMOKE_ALPHA = 150, SMOKE_LZ_W = 224, SMOKE_LZ_H = 118, SMOKE_ICON_S = 2;

  function drawSmoke(g, T, kind, ageTxt) {
    if (!kind) return;
    const alpha = window.SCREENS && window.SCREENS.SMOKE_ALPHA_OVERRIDE !== undefined
                ? window.SCREENS.SMOKE_ALPHA_OVERRIDE : SMOKE_ALPHA;
    g.fillRectAlpha(0, 0, 320, 240, alpha, T.bg);

    const x = (320 - SMOKE_LZ_W) / 2, y = (240 - SMOKE_LZ_H) / 2;
    g.fillRoundRect(x, y, SMOKE_LZ_W, SMOKE_LZ_H, 14, T.card);
    g.drawRoundRect(x, y, SMOKE_LZ_W, SMOKE_LZ_H, 14, T.dim);

    // Placeholders, and they say so by being the small icons doubled.
    const I = window.ICONS || {};
    const ic = kind === 'wifi' ? I['wifi-out'] : I['refresh-fail'];
    const iw = ic ? ic.w * SMOKE_ICON_S : 0, ih = ic ? ic.h * SMOKE_ICON_S : 0;
    drawIconScaled(g, x + (SMOKE_LZ_W - iw) / 2, y + 10, ic, T.dim, SMOKE_ICON_S);

    g.setFont('FreeSansBold12pt7b');
    g.setTextDatum(TC);
    g.setTextColor(T.text, T.card);
    g.drawString(kind === 'wifi' ? 'no network' : 'API not answering', 160, y + 12 + ih);

    if (ageTxt) {
      g.setFont(T.small);
      g.setTextColor(T.dim, T.card);
      g.drawString('readings ' + ageTxt + ' old', 160, y + 36 + ih);
    }
  }

  // s: {ok, h5, e5, d7, e7, reset5, reset7, sevenBinds, ageTxt, err, fetching,
  //     overage: {active, status, resetTxt, disabledReason} | undefined}
  function dashboard(g, T, s) {
    g.fillScreen(T.bg);
    const sevenBinds = !!s.sevenBinds;
    drawVBar(g, T, false, sevenBinds,  '7-DAY',  s.d7, s.e7, s.reset7, s.ok, 7, sevenBinds ? s.overage : null);
    drawVBar(g, T, true,  !sevenBinds, '5-HOUR', s.h5, s.e5, s.reset5, s.ok, 1, sevenBinds ? null : s.overage);

    // Menu, signal, refresh. The first two are still discs standing in for
    // icons. The third is real: a ring that fills as the poll interval runs
    // down, or a spinner while the fetch is actually in flight.
    drawIcon(g, V_CTRL_X, V_CIRCLE_Y0, (window.ICONS || {}).menu, T.ctrl);
    drawIcon(g, V_CTRL_X, V_CIRCLE_Y1,
             wifiIcon(s.rssi === undefined ? -55 : s.rssi,
                      s.wifiGhost === undefined ? true : s.wifiGhost), T.ctrl);
    drawRefreshIndicator(g, T, V_CIRCLE_Y2, !!s.fetching,
                         s.pollFrac === undefined ? 1 : s.pollFrac,
                         s.spinPhase || 0, !!s.refreshFailed,
                         s.spinner || 'dots', !!s.refreshFailing);

    // Last, over everything including the control column: what it says is true
    // of the whole screen. The menu button keeps working through it.
    drawSmoke(g, T, s.smoke, s.ageTxt);
  }

  // Factored out of dashboard() so the exploratory sim pages (dashboard-
  // variants.js) can build alternate dashboards around the same footer
  // without re-typing it. Behaviour unchanged from the inline version.
  //
  // Font2 is ASCII only: an em dash here once rendered as a space on the
  // device, which the sim showed first. Punctuation stays inside ASCII.
  function drawStatusLine(g, T, s, statusY) {
    g.setFont(T.small); g.setTextDatum(TL);
    if (s.ageTxt == null) {
      g.setTextColor(T.dim, T.bg);
      g.drawString(s.err ? 'no reading yet, retrying' : 'waiting for first reading', 16, statusY);
    } else if (s.err) {
      g.setTextColor(T.warn, T.bg);
      g.drawString(s.ageTxt + ' old, can\'t refresh (' + s.err + ')', 16, statusY);
    } else {
      g.setTextColor(T.dim, T.bg);
      g.drawString('updated ' + s.ageTxt + ' ago', 16, statusY);
    }
    if (s.fetching) drawSpinner(g, T, 320 - 26, statusY, s.phase | 0);
  }

  // ── Menu, as shipped ────────────────────────────────────
  const MENU_ROWS = ['Brightness'];
  const MENU_TOP = 56, MENU_ROW_H = 46, MENU_X = 20, MENU_W = 320 - 40;
  const LEVELS = 5, DOT_PITCH = 36;
  const DOT_X0 = MENU_X + MENU_W - 10 - DOT_PITCH * LEVELS + (DOT_PITCH >> 1);

  function drawBrightnessDots(g, T, cy, level, rowLit) {
    const ink = rowLit ? T.bg : T.text;
    for (let i = 0; i < LEVELS; i++) {
      const cx = DOT_X0 + i * DOT_PITCH;
      if (i === level) g.fillCircle(cx, cy, 7, ink); else g.drawCircle(cx, cy, 6, ink);
    }
  }

  function menu(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('Usage-Chan 0.1.0', MENU_X, 18);
    // Close, in the menu button's box. Placeholder until Figma has a frame.
    drawMarkX(g, V_CTRL_X + 16, V_CIRCLE_Y0 + 16, 9, T.ctrl, 1);
    for (let i = 0; i < MENU_ROWS.length; i++) {
      const y = MENU_TOP + i * MENU_ROW_H, on = i === s.highlight;
      g.fillRoundRect(MENU_X, y + 3, MENU_W, MENU_ROW_H - 6, 6, on ? T.accent : T.card);
      g.setTextDatum(ML); g.setTextColor(on ? T.bg : T.text, on ? T.accent : T.card);
      g.drawString(MENU_ROWS[i], MENU_X + 16, y + (MENU_ROW_H >> 1));
      if (i === 0) drawBrightnessDots(g, T, y + (MENU_ROW_H >> 1), s.brightness, on);
    }
  }

  // ── PIN entry, as shipped ───────────────────────────────
  function drawButtonHints(g, T, a, b, c) {
    const H = 36, y = 240 - H;
    g.fillRect(0, y, 320, H, T.card);
    g.drawFastHLine(0, y, 320, T.bg);
    g.setFont(T.small); g.setTextDatum(LGFX.MC); g.setTextColor(T.dim, T.card);
    [a, b, c].forEach((l, i) => {
      const cx = 320 * (2 * i + 1) / 6 | 0;
      if (i > 0) g.drawFastVLine(320 * i / 3 | 0, y + 6, H - 12, T.bg);
      if (l) g.drawString(l, cx, y + (H >> 1));
    });
  }

  // ── PIN keypad ──────────────────────────────────────────
  // Ten targets instead of one. The old screen dialled each digit with
  // BtnA/BtnB -- up to ten taps a digit plus a confirm, 36 at worst, on a
  // device that reboots every time it is flashed. Keys are 96x46; 46px is
  // about 7.3mm, the size the menu rows had to be before they were reliable.
  // Four rows plus the dots is 238 of 240, which is why there is no confirm
  // key: the fourth digit submits.
  const PIN_KEY_W = 96, PIN_KEY_H = 46, PIN_KEY_GX = 8, PIN_KEY_GY = 2;
  const PIN_KEY_X0 = 8, PIN_KEY_Y0 = 48;
  const PIN_DOT_Y = 24, PIN_DOT_R = 7, PIN_DOT_PITCH = 34;
  const PIN_DEL = 10;
  const PIN_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, PIN_DEL];

  function pinKeyBox(k) {
    return [PIN_KEY_X0 + (k % 3) * (PIN_KEY_W + PIN_KEY_GX),
            PIN_KEY_Y0 + ((k / 3) | 0) * (PIN_KEY_H + PIN_KEY_GY)];
  }

  function pinKeyAt(tx, ty) {
    for (let k = 0; k < 12; k++) {
      if (PIN_KEYS[k] < 0) continue;
      const [x, y] = pinKeyBox(k);
      if (tx >= x && tx < x + PIN_KEY_W && ty >= y && ty < y + PIN_KEY_H) return PIN_KEYS[k];
    }
    return -1;
  }

  // A backspace arrow, tested per pixel the way drawMarkX is: Font2 is ASCII
  // only so the glyph cannot be typed, and three half-plane tests are less
  // code than a triangle primitive nothing else would use.
  function drawBackspace(g, cx, cy, col) {
    const h = 9, tip = 9, body = 11;
    for (let dy = -h; dy <= h; dy++) {
      const ady = Math.abs(dy);
      for (let dx = -tip + ady; dx <= body; dx++)
        if (dx < 0 || ady <= h - 2) g.drawPixel(cx + dx, cy + dy, col);
    }
  }

  // s: { entered: 0..4, pressed: key under a finger or -1 }
  function pin(g, T, s) {
    g.fillScreen(T.bg);
    const entered = s.entered !== undefined ? s.entered : (s.pos || 0);
    const pressed = typeof s.pressed === 'number' ? s.pressed : -1;

    // Four dots, filled as digits land. No digit is ever shown: the old screen
    // had to show the one being edited because there was no other way to know
    // what you were dialling, which is not a property anyone wanted.
    const x0 = 160 - (PIN_DOT_PITCH * 3) / 2;
    for (let i = 0; i < 4; i++) {
      const cx = x0 + i * PIN_DOT_PITCH;
      if (i < entered) g.fillCircle(cx, PIN_DOT_Y, PIN_DOT_R, T.text);
      else             g.drawCircle(cx, PIN_DOT_Y, PIN_DOT_R, T.dim);
    }

    for (let k = 0; k < 12; k++) {
      const val = PIN_KEYS[k];
      if (val < 0) continue;
      const [x, y] = pinKeyBox(k), hot = val === pressed;
      g.fillRoundRect(x, y, PIN_KEY_W, PIN_KEY_H, 8, hot ? T.accent : T.card);
      if (val === PIN_DEL) {
        drawBackspace(g, x + PIN_KEY_W / 2, y + PIN_KEY_H / 2, hot ? T.bg : T.dim);
      } else {
        g.setFont('FreeSansBold18pt7b');
        g.setTextDatum(LGFX.MC);
        g.setTextColor(hot ? T.bg : T.text, hot ? T.accent : T.card);
        g.drawString(String(val), x + PIN_KEY_W / 2, y + PIN_KEY_H / 2);
      }
    }
  }

  // ── Interstitials, as shipped ───────────────────────────
  // Boot, setup, connecting, lockout and error. Ported from ui.cpp so the
  // look-and-feel pass can judge every screen the device shows, not just the
  // one it shows most.
  function boot(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.title); g.setTextDatum(MC); g.setTextColor(T.accent, T.bg);
    g.drawString('Usage-Chan', 160, 82);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString('0.1.0', 160, 110);
    const bx = 50, bw = 320 - 100, bh = 8, by = 150;
    g.fillRoundRect(bx, by, bw, bh, 3, T.card);
    const fw = (bw * Math.max(0, Math.min(100, s.percent)) / 100) | 0;
    if (fw > 0) g.fillRoundRect(bx, by, fw, bh, 3, T.accent);
    g.setTextColor(T.dim, T.bg);
    g.drawString(s.bootLabel || '', 160, 178);
  }

  function setup(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.accent, T.bg);
    g.drawString(s.reconfigure ? 'RECONNECT WIFI' : 'SETUP', 160, 12);
    g.setTextColor(T.dim, T.bg);
    g.drawString('Join this WiFi network:', 160, 42);
    g.setFont(T.title); g.setTextColor(T.text, T.bg);
    g.drawString(s.apName || 'UsageChan-A3F2', 160, 66);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString('password', 160, 112);
    g.setFont(T.title); g.setTextColor(T.text, T.bg);
    g.drawString(s.apPass || 'K7M2QRST', 160, 132);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString('then open', 160, 176);
    g.setTextColor(T.accent, T.bg);
    g.drawString('http://192.168.4.1', 160, 194);
  }

  function connecting(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(T.dim, T.bg);
    g.drawString('connecting to', 160, 92);
    g.setFont(T.title); g.setTextColor(T.text, T.bg);
    g.drawString(s.ssid || 'Plummer', 160, 120);
    g.setFont(T.small); g.setTextColor(T.accent, T.bg);
    g.drawString('.'.repeat(((s.attempt | 0) % 3) + 1), 160, 156);
  }

  function lockout(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.crit, T.bg);
    g.drawString('WRONG PIN', 160, 40);
    g.setTextColor(T.dim, T.bg);
    g.drawString(`attempt ${s.attempt || 2} of 10`, 160, 66);
    g.drawString('locked for', 160, 108);
    const sec = s.lockSec == null ? 97 : s.lockSec;
    g.setFont(T.headline); g.setTextColor(T.text, T.bg);
    g.drawString(`${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`, 160, 130);
  }

  function error(g, T, s) {
    g.fillScreen(T.bg);
    g.setFont(T.title); g.setTextDatum(MC); g.setTextColor(T.crit, T.bg);
    g.drawString(s.title || 'MAX ATTEMPTS', 160, 100);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString(s.detail || 'Wiping credentials...', 160, 140);
  }

  // Geometry the exploration page needs to draw alternate treatments on the
  // same grid. Read-only as far as anything outside this file is concerned.
  const V = { V7_X, V7_W, V5_X, V5_W, V5_TEXT_X, V7_TEXT_R,
              V_CTRL_X, V_CTRL_W, V_TRACK_H, V_TITLE_Y, V_HEAD_Y, V_FOOT_Y,
              V_CIRCLE_Y0, V_CIRCLE_Y1, V_CIRCLE_Y2, V_CIRCLE_D, V_SPOKES,
              V_DOT_RING, V_DOT_R, V_FAIL_HOLD_MS,
              V_MENU_HIT_L, V_MENU_HIT_T, V_MENU_HIT_R, V_MENU_HIT_B };

  window.SCREENS = { SHIPPED, dashboard, menu, pin, pinKeyAt, boot, setup, connecting, lockout, error,
                     paceColor, drawPaceTick, drawPaceCaption, paceWord, overageWord, drawVBar,
                     drawMarkX, captionY, drawToken, outlinedGlyph, V,
                     ctrlDisc, ctrlRing, ctrlWedge, ctrlSpokes,
                     drawRefreshIndicator, menuButtonHit,
                     drawIcon, drawIconScaled, wifiIcon, wifiLevel, ctrlDots, drawSmoke,
                     drawWindowBar, drawSevenDayBar, drawStatusLine };
})();
