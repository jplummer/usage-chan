// Exploratory dashboard treatments for two open questions — not shipped, not
// decided. Each export is a full `(g, T, s) => void` dashboard renderer, same
// calling convention as SCREENS.dashboard, so lookfeel-style pages can drop
// them straight into a grid next to the shipped screen.
//
// 1. Reset-time anchor. Today the 5-hour block's reset time only ever
//    appears in the headline (once under 40% left) or the footnote (above
//    it) — never in a fixed place. The 7-day bar already anchors it at the
//    top-right of its label row; these three try that same anchor on the
//    5-hour block, which is always the top bar on screen. The catch: that
//    slot is currently claimed by the big headline number (see drawWindowBar
//    in screens.js — label sits top-left at y, headline sits top-right at
//    y-6, and they coexist because one is far left and the other far right,
//    not because there's room for a third thing). Anchoring the reset time
//    there for real means giving the label row its own line above the
//    headline, which costs about one small-font row of height per block —
//    working against the 26% reclaim the "no title stripe" decision bought.
//    These three treatments spend that cost differently.
//
// 2. Overage. The device already parses overage-status / overage-utilization
//    / overage-reset / overage-disabled-reason on every fetch (api.cpp) and
//    shows none of it (see "Overage" in docs/design-decisions.md). Nobody
//    has captured what these headers actually do past the wall — whether
//    5h-utilization keeps climbing past 1.0 or sits pinned there, whether
//    overage-status takes its own value or overage-utilization moves alone.
//    So these three are built to survive not knowing: they read a status
//    word and an optional fraction/clock, never a dollar figure. A dollar
//    figure exists only on the JSON usage endpoint (data-inventory.md),
//    which is its own open, undecided switch — `s.overage.usedCredits` is
//    here for that day, and all three work with it absent.
(function () {
  'use strict';
  const { TL, TC, TR } = LGFX;
  const BX = 16, BW = 320 - 32, BH = 24;
  const PAY = 0x6E93C9; // a colour that isn't ok/warn/crit — "money", not "alarm"

  function packing(sh) {
    return { block: 81 + 2 * sh - 16, statusY: 240 - sh - 2 };
  }

  // ── 1. Reset-time anchor ────────────────────────────────────────────

  // Shared by all three anchor treatments: label row, then the headline,
  // then the track+fill+tick+caption exactly as shipped. What differs
  // between callers is the headline's content and whether a footnote row
  // follows. Returns the y just past whatever it drew, so the caller (which
  // also has to place the 7-day block) knows how tall this ran.
  function anchoredBlock(g, T, y, label, util, elapsed, resetTxt, valid, opts) {
    const sh = g.fontHeight(T.small);
    const rem = 100 - util;

    // Row 1: the anchor. Same shape as the 7-day bar's label row — label far
    // left, reset time far right, both dim, both small, always there when
    // there's a reset to show.
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(label, BX, y);
    if (valid && resetTxt) {
      const close = rem < 12;
      g.setTextColor(opts.urgentAnchor && close ? T.warn : T.dim, T.bg);
      g.setTextDatum(TR);
      g.drawString('resets ' + resetTxt, BX + BW, y);
    }

    // Row 2: the headline, now on its own line below the anchor rather than
    // overshooting above it.
    const hy = y + sh + 3;
    let headline;
    if (!valid) headline = '--';
    else if (opts.swapHeadline && rem < 40 && resetTxt) headline = resetTxt;
    else headline = valid ? Math.round(rem) + '% left' : '--';
    g.setFont(T.headline); g.setTextDatum(TR);
    g.setTextColor(valid ? (rem >= 40 ? T.text : T.accent) : T.dim, T.bg);
    g.drawString(headline, BX + BW, hy);

    // Track + fill + pace tick + caption, geometry unchanged from shipped.
    const by = hy + 34;
    g.fillRoundRect(BX, by, BW, BH, 5, T.card);
    const e = valid ? elapsed : -1;
    if (valid) {
      const u = Math.max(0, Math.min(100, util));
      const edge = BX + Math.round(BW * u / 100);
      const wRem = BX + BW - edge;
      if (wRem > 0) g.fillRoundRect(edge, by, wRem, BH, 5, e >= 0 ? SCREENS.paceColor(T, u / 100, e) : T.ok);
      if (e >= 0) {
        SCREENS.drawPaceTick(g, T, BX + Math.round(BW * e), by + (BH >> 1));
        SCREENS.drawPaceCaption(g, T, BX, BW, by + BH + 4, u / 100, e);
      }
    }

    let bottom = by + BH + 4 + sh - 1;
    if (opts.footnote) {
      g.setFont(T.small); g.setTextDatum(TR);
      const fy = bottom;
      if (valid && rem <= 0) { g.setTextColor(T.warn, T.bg); g.drawString('out', BX + BW, fy); }
      else if (valid && rem < 12) { g.setTextColor(T.warn, T.bg); g.drawString('nearly out', BX + BW, fy); }
      bottom += sh;
    }
    return bottom;
  }

  function dashboardWithAnchor(g, T, s, opts) {
    g.fillScreen(T.bg);
    const sh = g.fontHeight(T.small);
    const { block: shippedBlock, statusY } = packing(sh);
    // The anchor row adds roughly one small-font line per block versus the
    // shipped packing; give it room rather than let it crowd the 7-day bar.
    const grown = shippedBlock + sh + (opts.footnote ? 0 : -sh);
    if (s.sevenBinds) {
      // Two anchored, footnote-carrying blocks want 2*grown + a gap, and at
      // sh=16 that's ~229px against the 190px this layout actually has above
      // the status line (222 - 6 - 4). It doesn't fit — found by trying to
      // render it, not by planning ahead. Rather than clip off the top edge,
      // pin the top block at a small margin and let the pitch go as tight as
      // it must; if that means the blocks crowd or touch, that crowding IS
      // the finding for "both"/"only" in the ~23% of requests where 7-day is
      // also the binding window. "urgent" doesn't grow here (its dropped
      // footnote pays for its added anchor row 1-for-1), so it never hits
      // this branch's clamp.
      const y0 = 4;
      const pitch = Math.max(0, statusY - 6 - grown - y0);
      anchoredBlock(g, T, y0, '5-HOUR', s.h5, s.e5, s.reset5, s.ok, opts);
      anchoredBlock(g, T, y0 + pitch, '7-DAY', s.d7, s.e7, s.reset7, s.ok, opts);
    } else {
      const y0 = 24;
      const bottom = anchoredBlock(g, T, y0, '5-HOUR', s.h5, s.e5, s.reset5, s.ok, opts);
      const y7 = Math.min(bottom + 13, statusY - (2 * sh + 18) - 6);
      SCREENS.drawSevenDayBar(g, T, y7, s);
    }
    SCREENS.drawStatusLine(g, T, s, statusY);
  }

  // Both: keep the existing swap AND add the anchor. Below 40% left the
  // reset time is stated twice — once up top, once as the headline. Tests
  // whether that redundancy reassures or just repeats itself.
  function resetAnchorBoth(g, T, s) {
    dashboardWithAnchor(g, T, s, { swapHeadline: true, footnote: true, urgentAnchor: false });
  }

  // Only: the anchor is the one and only home for the reset time. Headline
  // always reads the remaining percentage — no more swap, no more branch on
  // the 40% crossover for its content, just a colour change. The cleanest
  // of the three, and the one most likely to actually simplify ui.cpp.
  function resetAnchorOnly(g, T, s) {
    dashboardWithAnchor(g, T, s, { swapHeadline: false, footnote: true, urgentAnchor: false });
  }

  // Urgent: same as Only, but the footnote row is dropped — "nearly out" /
  // "out" retire — and the anchor itself takes the warn colour under 12%
  // remaining instead. One signal, one place, and the reclaimed footnote
  // row pays back most of what the anchor row cost, so the block ends up
  // close to the shipped height rather than a full row taller.
  function resetAnchorUrgent(g, T, s) {
    dashboardWithAnchor(g, T, s, { swapHeadline: false, footnote: false, urgentAnchor: true });
  }

  // ── 2. Overage ───────────────────────────────────────────────────────

  // Headline copy has to survive the 24pt bold face at 288px wide — that's
  // roughly an 8-character budget for a right-aligned word (found the hard
  // way: "paying, near cap" ran clean off the left edge of the canvas).
  // Longer detail belongs on the footnote row, in T.small, not here.
  function overageWord(status) {
    if (status === 'rejected') return 'blocked';
    if (status === 'allowed_warning') return 'near cap';
    if (status === 'allowed') return 'paying';
    return 'overage'; // status unread or unrecognised — say only what's known
  }

  // Mark: the shipped bar, unchanged, pinned at 100% util (whether the wire
  // keeps climbing past 1.0 or sits there is exactly the open question in
  // design-decisions.md, so this treatment doesn't depend on which). Past
  // its right edge, in the margin that's already there, a small mark in a
  // colour that belongs to neither pace state — literally the parked idea
  // from design-decisions.md: "past here it costs money."
  function overageBlockMark(g, T, y, label, s) {
    const sh = g.fontHeight(T.small);
    const o = s.overage || {};
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(label, BX, y);

    const headline = o.active ? overageWord(o.status) : '0% left';
    g.setFont(T.headline); g.setTextDatum(TR);
    g.setTextColor(o.active ? PAY : T.accent, T.bg);
    g.drawString(headline, BX + BW, y - 6);

    const by = y + 38;
    g.fillRoundRect(BX, by, BW, BH, 5, T.card);
    g.fillRoundRect(BX, by, BW, BH, 5, o.active ? PAY : T.crit); // pinned full
    if (o.active) {
      // Small font, not the headline face — the existing right margin (bx+bw
      // to the 320px edge) is 16px, nowhere near enough room for a 24pt
      // glyph without running off-canvas the same way the headline did.
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(PAY, T.bg);
      g.drawString('$', BX + BW + 3, by + (BH >> 1) - g.fontHeight(T.small) / 2);
    }

    g.setFont(T.small); g.setTextDatum(TR);
    const fy = by + BH + 4 + sh - 1;
    if (o.active) {
      g.setTextColor(PAY, T.bg);
      g.drawString(o.resetTxt ? 'resets ' + o.resetTxt : 'status: ' + (o.status || 'unknown'), BX + BW, fy);
    } else {
      g.setTextColor(T.warn, T.bg);
      g.drawString('out', BX + BW, fy);
    }
    return by + BH + 4 + 2 * sh - 1;
  }

  // Badge: the bar is not touched at all — still shipped geometry, still
  // "out" at the wall. A badge underneath, the same visual idiom as the
  // service-degraded mark sketched in display-sketch.html, states the fact
  // next to the bar instead of inside it. Cheapest to build; leaves the
  // "bar is the window" reading exactly as it is, for better or worse —
  // once you're paying, the window isn't really the constraint any more,
  // and this treatment doesn't say so.
  function overageBlockBadge(g, T, y, label, s) {
    const sh = g.fontHeight(T.small);
    const o = s.overage || {};
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(label, BX, y);
    g.setFont(T.headline); g.setTextDatum(TR); g.setTextColor(T.accent, T.bg);
    g.drawString('0% left', BX + BW, y - 6);
    const by = y + 38;
    g.fillRoundRect(BX, by, BW, BH, 5, T.card);
    g.fillRoundRect(BX, by, BW, BH, 5, T.crit);
    g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(T.warn, T.bg);
    g.drawString('out', BX + BW, by + BH + 4 + sh - 1);

    let bottom = by + BH + 4 + 2 * sh - 1;
    if (o.active) {
      const by2 = bottom + 6;
      g.fillCircle(BX + 5, by2 - 4, 5, PAY);
      g.setTextDatum(TL); g.setTextColor(T.bg, PAY);
      g.drawString('$', BX + 2, by2 - 9);
      g.setTextColor(PAY, T.bg);
      g.drawString(overageWord(o.status) + (o.resetTxt ? ' · resets ' + o.resetTxt : ''), BX + 16, by2 - sh);
      bottom = by2 + 2;
    }
    return bottom;
  }

  // State: overage is treated as a different mode, not a bar decoration.
  // Pace stops meaning anything once you're past the wall — you are not
  // "ahead" or "behind", so the diamond and the pace caption drop out —
  // and the whole fill goes to the one colour reserved for "paying",
  // replacing crit rather than sitting next to it. The caption underneath
  // states the raw status word rather than inventing a fraction the wire
  // hasn't been confirmed to send.
  function overageBlockState(g, T, y, label, s) {
    const sh = g.fontHeight(T.small);
    const o = s.overage || {};
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString(label, BX, y);
    const headline = o.active ? 'IN OVERAGE' : '0% left';
    g.setFont(T.headline); g.setTextDatum(TR);
    g.setTextColor(o.active ? PAY : T.accent, T.bg);
    g.drawString(headline, BX + BW, y - 6);
    const by = y + 38;
    g.fillRoundRect(BX, by, BW, BH, 5, T.card);
    g.fillRoundRect(BX, by, BW, BH, 5, o.active ? PAY : T.crit);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.dim, T.bg);
    let bottom = by + BH + 4 + sh - 1;
    if (o.active) {
      const word = o.status === 'rejected' && o.disabledReason
        ? 'blocked: ' + o.disabledReason
        : 'extra usage: ' + (o.status || 'unknown');
      g.drawString(word, BX + BW / 2, by + BH + 4);
      bottom = by + BH + 4 + sh;
    } else {
      g.setTextDatum(TR); g.setTextColor(T.warn, T.bg);
      g.drawString('out', BX + BW, bottom);
    }
    return bottom + sh - 1;
  }

  function dashboardWithOverage(g, T, s, blockFn) {
    g.fillScreen(T.bg);
    const sh = g.fontHeight(T.small);
    const { statusY } = packing(sh);
    const y0 = 40 - (sh - 16);
    const bottom = blockFn(g, T, y0, '5-HOUR', s);
    const y7 = Math.min(bottom + 13, statusY - (2 * sh + 18) - 6);
    SCREENS.drawSevenDayBar(g, T, y7, s);
    SCREENS.drawStatusLine(g, T, s, statusY);
  }

  function overageMark(g, T, s) { dashboardWithOverage(g, T, s, overageBlockMark); }
  function overageBadge(g, T, s) { dashboardWithOverage(g, T, s, overageBlockBadge); }
  function overageState(g, T, s) { dashboardWithOverage(g, T, s, overageBlockState); }

  // ── 3. Seven-day diamond, off the straddle ─────────────────────────
  //
  // Shipped draws the pace diamond at a fixed radius (7px) centred on the
  // 7-day track regardless of the track's own thickness (8px) — the mark is
  // nearly twice the track's height and reads as stabbing through it rather
  // than sitting on it. Thinning the track without rescaling the diamond
  // (tried first, not kept below) only makes that worse. Two treatments
  // that do better: shrink the diamond to the track's own scale, or lift it
  // off the track entirely so the track stays an unbroken bar and the
  // diamond reads as a marker floating above it — literally "atop".
  function drawTick(g, T, cx, cy, r) {
    for (let rr = r; rr >= r - 1; rr--) {
      const c = rr === r ? T.bg : T.text;
      for (let dy = -rr; dy <= rr; dy++) {
        const dx = rr - Math.abs(dy);
        g.drawFastHLine(cx - dx, cy + dy, dx * 2 + 1, c);
      }
    }
  }

  function drawSevenDayTick(g, T, y, s, bh, r, atop) {
    const rad = Math.min(3, bh >> 1);
    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('7-DAY', BX, y);
    if (s.ok && s.reset7) { g.setTextDatum(TR); g.drawString('resets ' + s.reset7, BX + BW, y); }
    const sh = g.fontHeight(T.small);
    const by = y + sh + 4;
    g.fillRoundRect(BX, by, BW, bh, rad, T.card);
    if (!s.ok) return by + bh;
    const e = s.e7, u = Math.max(0, Math.min(100, s.d7));
    const edge = BX + Math.round(BW * u / 100);
    const wRem = BX + BW - edge;
    if (wRem > 0) g.fillRoundRect(edge, by, wRem, bh, rad, e >= 0 ? SCREENS.paceColor(T, u / 100, e) : T.ok);
    for (let i = 1; i < 7; i++) g.drawFastVLine(BX + ((BW * i / 7) | 0), by, bh, T.bg);
    if (e >= 0) {
      const tx = BX + Math.round(BW * e);
      const cy = atop ? by - r : by + (bh >> 1);
      drawTick(g, T, tx, cy, r);
      SCREENS.drawPaceCaption(g, T, BX, BW, by + bh + 6, u / 100, e);
    }
    return by + bh + 6 + sh;
  }

  function dashboardSevenDay(g, T, s, bh, r, atop) {
    g.fillScreen(T.bg);
    const sh = g.fontHeight(T.small);
    const { statusY } = packing(sh);
    const y0 = 40 - (sh - 16);
    SCREENS.drawWindowBar(g, T, y0, '5-HOUR', s.h5, s.e5, s.reset5, s.ok);
    const bottom = 40 - (sh - 16) + 81 + 2 * sh - 16;
    const y7 = Math.min(bottom + 13, statusY - (2 * sh + 18) - 6);
    drawSevenDayTick(g, T, y7, s, bh, r, atop);
    SCREENS.drawStatusLine(g, T, s, statusY);
  }

  // Diamond scaled down to match a thinner track, still centred through it —
  // the smallest change from shipped that actually looks proportionate.
  function sevenDayProportional(g, T, s) { dashboardSevenDay(g, T, s, 5, 4, false); }

  // Track stays full shipped thickness (8px) and reads as one clean bar;
  // the diamond lifts off it entirely, tip resting on the top edge — a
  // marker above the timeline rather than a mark punched through it.
  function sevenDayAtop(g, T, s) { dashboardSevenDay(g, T, s, 8, 6, true); }

  // ── Vertical overage treatments, from the alt frames, 2026-09-20 ────
  // The bar's grammar is "fill = what is available", so a solid bar says
  // everything remains — the opposite of what overage means. The shipped
  // vertical dashboard fills the track solid and therefore lies. These three
  // keep the grammar and differ only in what is actually left to draw.
  //
  // Geometry is the alt frames': the track stops at 224 in every state, which
  // costs 16px of bar but keeps the layout still and leaves the reset time a
  // home that never moves. The headline stays at its usual y here even in
  // overage, so what these cells compare is the bar and nothing else.
  const VH = SCREENS.V.V_TRACK_H;      // shared, so the two columns can't drift

  // A 2px inner stroke is two nested outlines. LovyanGFX draws a 1px rounded
  // outline and nothing wider, so this is the whole technique — and ui.cpp
  // already calls drawRoundRect for the menu's selection ring.
  function vTrack(g, T, x, w, ring) {
    g.fillRoundRect(x, 0, w, VH, 6, T.card);
    if (ring) {
      g.drawRoundRect(x, 0, w, VH, 6, ring);
      g.drawRoundRect(x + 1, 1, w - 2, VH - 2, 5, ring);
    }
  }

  function vFill(g, T, x, w, frac, col) {
    const h = Math.round(VH * Math.max(0, Math.min(1, frac)));
    if (h > 0) g.fillRoundRect(x, VH - h, w, h, 6, col);
  }

  // Glyph with a knockout outline, which the panel has no primitive for:
  // draw the glyph in the outline colour at every offset on a ring, then once
  // more on top in its own colour. Costs ~20 extra draws of one character,
  // which is nothing once per refresh, and it is the only way to separate a
  // bar-coloured token from the bar it sits on.
  function outlinedGlyph(g, T, ch, font, cx, cy, fill, outline, weight) {
    g.setFont(font);
    const w = g.textWidth(ch), h = g.fontHeight(font);
    const x = cx - (w >> 1), y = cy - (h >> 1);
    g.setTextDatum(TL);
    g.setTextColor(outline, outline);
    for (let dy = -weight; dy <= weight; dy++)
      for (let dx = -weight; dx <= weight; dx++)
        if (dx * dx + dy * dy <= weight * weight) g.drawString(ch, x + dx, y + dy);
    g.setTextColor(fill, fill);
    g.drawString(ch, x, y);
  }

  // Thickness runs ACROSS each arm, so the terminals are cut square to the
  // arm rather than sliced off horizontally. Outline pass first, then fill.
  function outlinedX(g, cx, cy, arm, thick, fill, outline) {
    for (let pass = 0; pass < 2; pass++) {
      const col = pass ? fill : outline;
      const t = pass ? thick : thick + 2;
      SCREENS.drawMarkX(g, cx, cy, arm, col, t);
    }
  }

  // One screen. `bar` paints the primary track and whatever is left in it,
  // and returns the used fraction the pace word should judge — or false when
  // pace has no meaning in that state, which suppresses the diamond too.
  // `token` straddles the track's end edge, half on the bar, half below.
  //
  // The diamond is placed by the BASE window's elapsed fraction even when the
  // bar is drawing the overage budget. That assumes overage resets with the
  // window it belongs to, which nobody has verified — compare overage-reset
  // against the 5h reset the first time a real overage lands in the log.
  function vDash(g, T, s, bar, token) {
    const V = SCREENS.V;
    g.fillScreen(T.bg);

    SCREENS.drawVBar(g, T, false, '7-DAY', s.d7, s.e7, s.reset7, s.ok, 7, null);

    const x = V.V5_X, w = V.V5_W, tx = V.V5_TEXT_X;
    const used = bar(g, T, x, w, s);

    if (s.ok && used !== false && s.e5 >= 0) {
      const cy = Math.round(VH * s.e5);
      SCREENS.drawPaceTick(g, T, x + w / 2, cy);
      const [word, col] = SCREENS.paceWord(T, used, s.e5);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(col, T.bg);
      g.drawString(word, tx, SCREENS.captionY(cy, [[7, 23], [62, 85], [216, 232]]));
    }

    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('5-HOUR', tx, 7);
    const st = (s.overage && s.overage.status) || 'allowed';
    g.setFont(T.stat); g.setTextDatum(TL);
    g.setTextColor(st === 'rejected' ? T.crit : T.pay, T.bg);
    g.drawString(SCREENS.overageWord(st), tx, 62);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString(s.reset5, tx, 216);

    token(g, T, x + w / 2, VH);

    g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
    const sx = V.V_CTRL_X + V.V_CTRL_W - 8;
    g.drawString('updated', sx, 190);
    g.drawString(s.ageTxt || '--', sx, 206);
  }

  // Blocked needs no data we do not already have: overage-status says
  // rejected, and that is the whole input. Empty vessel, crit ring. Pace
  // still means something here — the base budget is spent, and how early you
  // spent it is worth saying.
  function vBlocked(g, T, s) {
    vDash(g, T, s,
      (g, T, x, w) => { vTrack(g, T, x, w, T.crit); return 1; },
      (g, T, cx, edge) => outlinedX(g, cx, edge, 11, 6, T.crit, T.bg));
  }

  // Paying against a cap: the blue is overage remaining, judged by the same
  // rule as the green. Needs overage-utilization to be a real fraction of a
  // real ceiling, which nobody has captured. overage.remaining stands in for it.
  function vPayingCapped(g, T, s) {
    vDash(g, T, s,
      (g, T, x, w, s) => {
        const rem = (s.overage && s.overage.remaining != null) ? s.overage.remaining : 0.2;
        vTrack(g, T, x, w, T.pay);
        vFill(g, T, x, w, rem, T.pay);
        return 1 - rem;
      },
      (g, T, cx, edge) => outlinedGlyph(g, T, '$', T.headline, cx, edge, T.pay, T.bg, 3));
  }

  // Paying with nothing above you: the vessel is full because nothing is
  // missing from it. Pace is undefined against an unbounded budget, so the
  // diamond and the word both retire rather than assert something false.
  // This is the fallback if overage-utilization has no denominator behind it.
  function vPayingUncapped(g, T, s) {
    vDash(g, T, s,
      (g, T, x, w) => { vTrack(g, T, x, w, T.pay); vFill(g, T, x, w, 1, T.pay); return false; },
      (g, T, cx, edge) => outlinedGlyph(g, T, '$', T.headline, cx, edge, T.pay, T.bg, 3));
  }

  // ── Big-caption states, 2026-09-20 ──────────────────────
  // Shipped swaps the headline for the reset time below 40% remaining. That
  // was right when the headline and footnote were adjacent rows and only one
  // could be prominent (design-decisions.md, 2026-09-07). In this layout the
  // reset time has a permanent home at the bottom, so the swap empties that
  // home exactly when the clock matters most. The ladder keeps every fact in
  // one place and escalates emphasis instead: the headline always states the
  // budget's own condition, the bottom row always answers when you get more,
  // and colour carries the urgency the swap used to carry.
  //
  // `lowWord` is the open question. "nearly out" is what the shipped footnote
  // says and what design-decisions blesses as a proximity claim rather than a
  // quantity -- but it measures 116px against a 102px slot, so it cannot go
  // in the headline as written.
  function ladderHead(T, rem, valid, ov, lowWord) {
    if (ov && ov.active)
      return [SCREENS.overageWord(ov.status), ov.status === 'rejected' ? T.crit : T.pay];
    if (!valid)   return ['--', T.dim];
    if (rem <= 0) return ['out', T.warn];
    if (rem < 12) return [lowWord === 'number' ? Math.round(rem) + '% left' : lowWord, T.warn];
    if (rem < 40) return [Math.round(rem) + '% left', T.accent];
    return [Math.round(rem) + '% left', T.text];
  }

  function vLadder(g, T, s) {
    const V = SCREENS.V;
    g.fillScreen(T.bg);
    SCREENS.drawVBar(g, T, false, '7-DAY', s.d7, s.e7, s.reset7, s.ok, 7, null);

    const x = V.V5_X, w = V.V5_W, tx = V.V5_TEXT_X;
    const util = Math.max(0, Math.min(100, s.h5)), rem = 100 - util;
    const ov = s.overage && s.overage.active ? s.overage : null;

    g.fillRoundRect(x, 0, w, V.V_TRACK_H, 6, T.card);
    if (ov) {
      g.drawRoundRect(x, 0, w, V.V_TRACK_H, 6, ov.status === 'rejected' ? T.crit : T.pay);
      g.drawRoundRect(x + 1, 1, w - 2, V.V_TRACK_H - 2, 5, ov.status === 'rejected' ? T.crit : T.pay);
    } else {
      const usedH = Math.round(V.V_TRACK_H * util / 100), fillH = V.V_TRACK_H - usedH;
      if (fillH > 0) g.fillRoundRect(x, usedH, w, fillH, 6, SCREENS.paceColor(T, util / 100, s.e5));
    }

    if (s.ok && s.e5 >= 0 && !ov) {
      const cy = Math.round(V.V_TRACK_H * s.e5);
      SCREENS.drawPaceTick(g, T, x + w / 2, cy);
      const [word, col] = SCREENS.paceWord(T, util / 100, s.e5);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(col, T.bg);
      g.drawString(word, tx, SCREENS.captionY(cy, [[V.V_TITLE_Y, V.V_HEAD_Y + 23],
                                                   [V.V_FOOT_Y, V.V_FOOT_Y + 16]]));
    }

    g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.dim, T.bg);
    g.drawString('5-HOUR', tx, V.V_TITLE_Y);

    const [head, hcol] = ladderHead(T, rem, s.ok, ov, s.lowWord || 'very low');
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(hcol, T.bg);
    g.drawString(head, tx - 2, V.V_HEAD_Y);

    // The bottom row never empties: it is always when you get more, dim while
    // there is room and accent once there is not.
    g.setFont(T.small); g.setTextDatum(TL);
    g.setTextColor(rem < 40 || ov ? T.accent : T.dim, T.bg);
    g.drawString((ov && ov.resetTxt) || s.reset5 || '', tx, V.V_FOOT_Y);

    if (ov) SCREENS.drawToken(g, T, x + w / 2, ov.status === 'rejected');

    g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
    const sx = V.V_CTRL_X + V.V_CTRL_W - 8;
    g.drawString('updated', sx, 190);
    g.drawString(s.ageTxt || '--', sx, 206);
  }

  window.DASHVARIANTS = {
    vLadder,
    vBlocked, vPayingCapped, vPayingUncapped,
    resetAnchorBoth, resetAnchorOnly, resetAnchorUrgent,
    overageMark, overageBadge, overageState,
    sevenDayProportional, sevenDayAtop,
    PAY,
  };
})();
