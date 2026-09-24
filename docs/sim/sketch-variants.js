// Candidates for three screens that do not exist yet: the status panel the
// menu is becoming, the legend, and the settings-URL screen.
//
// Exploratory. Nothing here is committed to screens.js or src/ui.cpp, and
// neither of those files is touched. Everything draws through lgfx.js and the
// device's own glyph bitmaps, so every string measures what it will measure on
// the panel.
//
// Geometry borrowed rather than reinvented: the close control sits in the
// hamburger's own touch zone (V_MENU_HIT, 264-320 x 0-56), brightness is
// drawBrightnessDots' five dots on a 36px pitch, and the 46px row height is
// the ~7mm touch floor that 34px missed on hardware.
(function () {
  'use strict';

  const { TL, TC, TR, ML, MC, MR, BL } = LGFX;
  const V = SCREENS.V;
  const ICONS = window.ICONS || {};

  const SCREEN_W = 320, SCREEN_H = 240;
  const ROW_H = 46;                 // ~7.3mm at this panel's ~160 px/inch
  const LINE = 16;                  // Font2's own height, no leading

  // ── Sample values ───────────────────────────────────────
  // Real-shaped, never placeholder. NOMINAL is the healthy case the brief
  // names; DEGRADED is the one a status panel has to survive.
  const NOMINAL = {
    ssid: 'rosewater-5g', rssi: -52,
    pollSec: 120, ageTxt: '47s', lastMs: 1800,
    err: '', streak: 0,
    tzSet: false,
    ovActive: false, ovStatus: '', ovReason: '', ovReset: '1 Oct',
    host: 'usage-chan', ip: '192.168.1.47',
    power: 'mains', batPct: 100,
    h5: 34, e5: 0.52, d7: 31, e7: 0.46,
  };
  const DEGRADED = {
    ssid: 'rosewater-5g', rssi: -74,
    pollSec: 120, ageTxt: '4m 12s', lastMs: 15000,
    err: 'http_529', streak: 2,
    tzSet: false,
    ovActive: true, ovStatus: 'rejected', ovReason: 'payment_failed', ovReset: '1 Oct',
    host: 'usage-chan', ip: '192.168.1.47',
    power: 'battery', batPct: 62,
    h5: 100, e5: 0.61, d7: 78, e7: 0.7,
  };

  // ── Phrasing, in one place ──────────────────────────────
  // Every variant draws from these, so a wording argument is one edit rather
  // than five, and no two variants accidentally say the same thing differently.
  const levelWord = rssi => ['no link', 'weak', 'fair', 'strong'][SCREENS.wifiLevel(rssi)];
  const pollWord = s => (s % 60 === 0 ? (s / 60) + 'm' : s + 's');
  const secs = ms => (ms / 1000).toFixed(1) + 's';

  // Battery, and the asymmetry that decides how it is drawn. This device lives
  // plugged in inside a Stack-Chan shell, so the charge level is meaningless
  // almost always and sharply relevant on the day the cable gets knocked out.
  // So it earns space by being true rather than by being a reading: on mains
  // with a working gauge it says nothing at all. halBatPercent() returns -1
  // when the gauge cannot be read, and that case draws the words rather than a
  // plausible wrong number. halIsCharging() has three values, not two, so
  // "cannot tell" is a state with its own appearance.
  function battery(s) {
    const p = s.batPct;
    if (s.power === 'mains') {
      return p < 0 ? { txt: 'battery gauge not answering', col: 'dim', show: true } : { show: false };
    }
    if (s.power === 'battery') {
      if (p < 0) return { txt: 'on battery, charge unknown', col: 'warn', show: true, pct: -1 };
      return { txt: 'on battery, ' + p + '%', col: p < 20 ? 'crit' : 'warn', show: true, pct: p };
    }
    return p < 0
      ? { txt: 'battery unreadable', col: 'dim', show: true, pct: -1 }
      : { txt: 'battery ' + p + '%', col: 'dim', show: true, pct: p };
  }

  // A battery outline, 22x11 with a nub. An unreadable gauge draws the empty
  // outline with a dash through it, never a partly filled one.
  function batteryGlyph(g, col, bg, x, y, pct) {
    g.drawRoundRect(x, y, 22, 11, 2, col);
    g.fillRect(x + 22, y + 3, 2, 5, col);
    if (pct < 0) { g.drawFastHLine(x + 5, y + 5, 12, col); return; }
    const w = Math.round(18 * Math.max(0, Math.min(100, pct)) / 100);
    if (w > 0) g.fillRect(x + 2, y + 2, w, 7, col);
  }

  function readings(s) {
    return {
      wifi: s.ssid,
      wifiVal: levelWord(s.rssi) + ', ' + s.rssi + ' dBm',
      refresh: 'every ' + pollWord(s.pollSec) + ', ' + s.ageTxt + ' ago',
      refreshVal: 'took ' + secs(s.lastMs),
      api: s.err ? s.streak + ' failures (' + s.err + ')' : 'answering',
      apiCol: s.err ? (s.streak >= 2 ? 'crit' : 'warn') : 'ok',
      clock: 'no timezone set',
      clockWhy: 'resets show as durations',
      // A stub. The device says this without asking anyone -- see Stubs and
      // IOUs in plan.md. Drawn as the firmware would draw it, and flagged on
      // the page rather than softened here.
      service: 'no service issues',
      overage: s.ovActive
        ? (s.ovStatus === 'rejected' ? 'rejected: ' + s.ovReason.replace(/_/g, ' ')
                                     : 'in use, ' + s.ovStatus.replace(/_/g, ' '))
        : 'off',
      overageWhen: 'allowance resets ' + s.ovReset,
    };
  }

  // ── Shared furniture ────────────────────────────────────
  // The close control goes exactly where the hamburger is on the dashboard,
  // in the same 56x56 zone (8.9 x 8.9mm). The thing you tapped to get in is
  // the thing you tap to get out, in the same pixels.
  function closeX(g, T) {
    SCREENS.drawMarkX(g, V.V_CTRL_X + 16, V.V_CIRCLE_Y0 + 16, 9, T.ctrl, 2);
  }

  // Back, mirrored into the top-left 56x56. Same size, same reasoning.
  function backChevron(g, T) {
    const cx = 30, cy = 27;
    for (let i = 0; i < 10; i++) {
      g.drawFastVLine(cx + i, cy - i - 1, 3, T.ctrl);
      g.drawFastVLine(cx + i, cy + i - 1, 3, T.ctrl);
    }
  }

  function line(g, T, txt, x, y, col, font) {
    g.setFont(font || T.small);
    g.setTextDatum(TL);
    g.setTextColor(col, T.bg);
    g.drawString(txt, x, y);
  }

  // A tappable row: the card is 40 tall, the target is the full 46.
  function row(g, T, x, y, w, label, lit) {
    g.fillRoundRect(x, y + 3, w, ROW_H - 6, 6, lit ? T.accent : T.card);
    g.setFont(T.small); g.setTextDatum(ML);
    g.setTextColor(lit ? T.bg : T.text, lit ? T.accent : T.card);
    g.drawString(label, x + 16, y + (ROW_H >> 1));
  }

  // A right-pointing chevron, for the rows that lead somewhere.
  function goChevron(g, col, x, cy) {
    for (let i = 0; i <= 6; i++) {
      g.drawFastVLine(x + i, cy - (6 - i) - 1, 3, col);
      g.drawFastVLine(x + i, cy + (6 - i) - 1, 3, col);
    }
  }

  function destRow(g, T, x, y, w, label) {
    row(g, T, x, y, w, label, false);
    goChevron(g, T.dim, x + w - 30, y + (ROW_H >> 1));
  }

  // drawBrightnessDots, with the row's own left and right edges passed in so a
  // narrower row can still carry the full 36px pitch. Five dots, each owning
  // 36 x 46 -- 5.7 x 7.3mm, the geometry ui.cpp already proved on hardware.
  const LEVELS = 5, DOT_PITCH = 36;
  // The label is a parameter because the arithmetic forces it: the dot strip
  // needs 180px and "Brightness" needs about 78 plus padding, so a row under
  // ~280px wide cannot hold both. ui.cpp hit the same wall from the other
  // side, where a 40px pitch ran the first dot into the word.
  function brightnessRow(g, T, x, y, w, level, label) {
    row(g, T, x, y, w, label || 'Brightness', false);
    const x0 = x + w - 10 - DOT_PITCH * LEVELS + (DOT_PITCH >> 1);
    for (let i = 0; i < LEVELS; i++) {
      const cx = x0 + i * DOT_PITCH, cy = y + (ROW_H >> 1);
      if (i === level) g.fillCircle(cx, cy, 7, T.text); else g.drawCircle(cx, cy, 6, T.text);
    }
  }

  const COL = (T, name) => ({ ok: T.ok, warn: T.warn, crit: T.crit, dim: T.dim, text: T.text })[name];

  // ═══════════════════════════════════════════════════════
  // Screen 1 — the status panel
  // ═══════════════════════════════════════════════════════

  // 1 · Ledger. Readings are a table at Font2's own 16px pitch; targets are
  // three full 46px rows. The bet: reading and hitting are different acts and
  // should not share a grammar. 6 x 16 = 96 for the readings leaves exactly
  // 3 x 46 = 138 for the rows, and 240 - 96 - 138 = 6 for the top margin.
  function panelLedger(g, T, s) {
    g.fillScreen(T.bg);
    const r = readings(s), b = battery(s);
    const pairs = [
      ['wifi',    r.wifi + '  ' + levelWord(s.rssi), 'text'],
      ['refresh', 'every ' + pollWord(s.pollSec) + ', ' + s.ageTxt + ' ago', 'text'],
      ['api',     r.api, r.apiCol],
      ['clock',   r.clock, 'dim'],
      ['service', r.service, 'dim'],
      ['extra',   r.overage, s.ovActive ? 'crit' : 'dim'],
      // The seventh slot is battery's, and it stays reserved whether or not
      // battery has anything to say. A block that changes height moves the
      // rows under it, and a row that moves between states is the twitch the
      // fixed 224px track exists to avoid.
      ['power',   b.show ? b.txt : null, b.col || 'dim'],
    ];
    pairs.forEach(([k, v, c], i) => {
      if (v === null) return;
      const y = 6 + i * LINE;
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(T.dim, T.bg);
      g.drawString(k, 96, y);
      line(g, T, v, 104, y, COL(T, c));
    });
    // Seven reading lines cost the ledger its full-width destination rows:
    // 7 x 16 = 112, and 240 - 112 leaves room for one 46px row and one split
    // row, not three rows. See the note on the page.
    brightnessRow(g, T, 20, 132, 280, s.brightness);
    destRow(g, T, 20, 184, 136, 'The key');
    destRow(g, T, 164, 184, 136, 'Settings');
    closeX(g, T);
  }

  // 2 · Column. The dashboard's control column stays where it is and explains
  // itself: the wifi glyph and the refresh ring keep their dashboard y, so the
  // rail you just tapped the top of is still the rail.
  //
  // The first cut put each glyph's value to its left and it did not survive
  // contact: the rows have to run to x=258 to carry the 36px dot pitch, and
  // the glyphs sit at y 156 and 198, which is inside the row band. There is no
  // room for a caption. So this variant makes the stronger claim instead --
  // the glyph IS the reading. Signal strength and the countdown are pictures;
  // only the readings that need words get words. The SSID goes with them, to
  // the PIN-gated panel, which is where you would change it anyway.
  function panelColumn(g, T, s) {
    g.fillScreen(T.bg);
    const r = readings(s);

    line(g, T, r.api, 12, 8, COL(T, r.apiCol));
    line(g, T, 'no timezone: resets are durations', 12, 28, T.dim);
    line(g, T, r.service, 12, 48, T.dim);
    line(g, T, 'extra usage ' + r.overage, 12, 68, s.ovActive ? T.crit : T.dim);

    // The rail: same x, same two y positions the dashboard uses, plus a slot
    // above them that battery occupies only when it has something true to say.
    // On mains with a working gauge the slot stays empty, which is the whole
    // argument for putting battery in a rail rather than in a row.
    const b = battery(s);
    if (b.show) batteryGlyph(g, COL(T, b.col), T.bg, V.V_CTRL_X + 4, 116,
                             b.pct === undefined ? -1 : b.pct);
    SCREENS.drawIcon(g, V.V_CTRL_X, V.V_CIRCLE_Y1, SCREENS.wifiIcon(s.rssi, true), T.ctrl);
    SCREENS.drawRefreshIndicator(g, T, V.V_CIRCLE_Y2, false, s.err ? 0.85 : 0.39,
                                 0, false, 'dots', !!s.err);

    brightnessRow(g, T, 12, 100, 246, s.brightness, 'Light');
    destRow(g, T, 12, 146, 246, 'What the screen means');
    destRow(g, T, 12, 192, 246, 'Settings, on your phone');
    closeX(g, T);
  }

  // 3 · Headline. One verdict at 18pt answering "is this thing working",
  // four dim lines of evidence under it, then a brightness row and a split row
  // of two destinations. The bet: this screen is opened with one question, and
  // the other five readings are only ever the reason for the answer.
  function panelHeadline(g, T, s) {
    g.fillScreen(T.bg);
    const r = readings(s);
    const verdict = s.err ? s.streak + ' failures' : 'answering';
    g.setFont(T.title); g.setTextDatum(TL);
    g.setTextColor(s.err ? T.crit : T.ok, T.bg);
    g.drawString(verdict, 18, 10);

    // A first cut put battery beside the verdict as a chip. "2 failures" at
    // 18pt is 180px wide and the chip landed on top of it, so battery joins
    // the evidence instead -- at the head of it, because when the cable is out
    // that is the first thing you want to read. The block holds five slots
    // whether or not battery fills one, so the rows below never move.
    const b = battery(s);
    const ev = s.err
      ? [[s.err + ', last good reading ' + s.ageTxt + ' old', 'warn'],
         [r.wifi + ', ' + levelWord(s.rssi) + ' signal', 'dim'],
         ['no timezone; ' + r.service, 'dim'],
         ['extra usage ' + r.overage, 'crit']]
      : [[r.wifi + ', ' + levelWord(s.rssi) + ' signal', 'dim'],
         [s.ageTxt + ' ago, took ' + secs(s.lastMs) + ', polls every ' + pollWord(s.pollSec), 'dim'],
         ['no timezone; ' + r.service, 'dim'],
         ['extra usage ' + r.overage + ', ' + r.overageWhen, 'dim']];
    if (b.show) ev.unshift([b.txt, b.col]);
    ev.forEach(([t, c], i) => line(g, T, t, 18, 50 + i * 18, COL(T, c)));

    brightnessRow(g, T, 20, 142, 280, s.brightness);
    destRow(g, T, 20, 190, 136, 'The key');
    destRow(g, T, 164, 190, 136, 'Settings');
    closeX(g, T);
  }

  // 4 · Sentences. The readings as prose, because half of them are only worth
  // saying as a relationship -- no clock set, SO resets are durations -- which
  // a label/value table cannot express. The two destinations are sentences
  // too, and a tappable sentence gets a 46px line.
  function panelSentences(g, T, s) {
    g.fillScreen(T.bg);
    const prose = s.err
      ? [['On ' + s.ssid + ', signal ' + levelWord(s.rssi) + '.', 'text'],
         [s.streak + ' fetches failed (' + s.err + '). The last', 'warn'],
         ['good reading is ' + s.ageTxt + ' old.', 'warn'],
         ['Anthropic reports no service issues.', 'dim'],
         ['Extra usage rejected: payment failed.', 'crit']]
      : [['On ' + s.ssid + ', signal ' + levelWord(s.rssi) + '.', 'text'],
         ['Checked ' + s.ageTxt + ' ago in ' + secs(s.lastMs) + '; next in ' + pollWord(s.pollSec) + '.', 'dim'],
         ['Anthropic reports no service issues.', 'dim'],
         ['No timezone set, so resets are durations.', 'dim'],
         ['Extra usage off; allowance resets ' + s.ovReset + '.', 'dim']];
    // Battery is one more sentence, which is the cheapest way any of these
    // five absorbs it. The block holds six slots whether or not it speaks.
    const b = battery(s);
    if (b.show) prose.push([s.power === 'battery' && s.batPct >= 0
      ? 'Running on battery, ' + s.batPct + '% left.'
      : b.txt.charAt(0).toUpperCase() + b.txt.slice(1) + '.', b.col]);
    prose.forEach(([t, c], i) => line(g, T, t, 16, 2 + i * 16, COL(T, c)));

    brightnessRow(g, T, 12, 100, 296, s.brightness);
    // Tappable sentences: no card, a rule under each, 46px of line height.
    [['What the colours and the diamond mean', 146],
     ['Settings, on your phone', 192]].forEach(([t, y]) => {
      g.drawFastHLine(16, y, 288, T.card);
      line(g, T, t, 16, y + 15, T.text);
      goChevron(g, T.dim, 286, y + 22);
    });
    closeX(g, T);
  }

  // 5 · Pared. Five 46px slots fit 240px exactly once the version header goes
  // -- ui.cpp's "five do not fit" was measured with a 48px header above them,
  // and the close control has taken over the corner that header used. Two
  // slots are readings, three are targets. Four readings are dropped: the poll
  // interval, the fetch duration, the overage reset date and the service-status
  // stub. All four belong to the PIN-gated panel or to nothing.
  function panelPared(g, T, s) {
    g.fillScreen(T.bg);
    const r = readings(s);
    // Slot 1 clears the close column; the rest run full width. A 46px card
    // holds two Font2 lines, which is where battery goes when it speaks --
    // the pared variant has spare height inside its cards, not between them.
    const b = battery(s);
    g.fillRoundRect(12, 8, 246, ROW_H - 6, 6, T.card);
    g.setFont(T.small);
    if (b.show) {
      g.setTextDatum(TL);
      g.setTextColor(T.text, T.card); g.drawString(r.wifi + '  ' + levelWord(s.rssi), 28, 14);
      g.setTextColor(COL(T, b.col), T.card); g.drawString(b.txt, 28, 32);
    } else {
      g.setTextDatum(ML);
      g.setTextColor(T.text, T.card); g.drawString(r.wifi, 28, 28);
      g.setTextDatum(MR);
      g.setTextColor(T.dim, T.card); g.drawString(levelWord(s.rssi), 244, 28);
    }

    g.fillRoundRect(12, 54, 296, ROW_H - 6, 6, T.card);
    g.setTextDatum(TL);
    g.setTextColor(COL(T, r.apiCol), T.card);
    g.drawString(r.api + ', ' + s.ageTxt + ' ago', 28, 60);
    g.setTextColor(T.dim, T.card);
    g.drawString('no timezone: resets are durations', 28, 78);

    brightnessRow(g, T, 12, 100, 296, s.brightness);
    destRow(g, T, 12, 146, 296, 'What the screen means');
    destRow(g, T, 12, 192, 296, 'Settings, on your phone');
    closeX(g, T);
  }

  // ═══════════════════════════════════════════════════════
  // Screen 2 — the legend
  // ═══════════════════════════════════════════════════════

  // A short leader: horizontal run from the text, then a stub into the target.
  function leader(g, col, x0, y0, x1, y1) {
    g.drawFastHLine(Math.min(x0, x1), y0, Math.abs(x1 - x0), col);
    g.drawFastVLine(x1, Math.min(y0, y1), Math.abs(y1 - y0) + 1, col);
  }

  // 1 · The real bar, annotated. plan.md's parked idea, built to find out
  // whether it works. The bar is the shipped geometry at the shipped values:
  // x 123, 48 wide, 224 tall, fill = what is left, diamond at even-burn pace.
  function legendRealBar(g, T, s) {
    g.fillScreen(T.bg);
    const trackX = V.V5_X, trackW = V.V5_W, trackH = V.V_TRACK_H;
    const u = Math.max(0, Math.min(100, s.h5)) / 100;
    const usedH = Math.round(trackH * u);
    g.fillRoundRect(trackX, 0, trackW, trackH, 6, T.card);
    if (s.ovActive) {
      const ring = s.ovStatus === 'rejected' ? T.crit : T.pay;
      g.drawRoundRect(trackX, 0, trackW, trackH, 6, ring);
      g.drawRoundRect(trackX + 1, 1, trackW - 2, trackH - 2, 5, ring);
      SCREENS.drawToken(g, T, trackX + (trackW >> 1), s.ovStatus === 'rejected');
    } else if (trackH - usedH > 0) {
      g.fillRoundRect(trackX, usedH, trackW, trackH - usedH, 6,
                      SCREENS.paceColor(T, u, s.e5));
    }
    const tickCy = Math.round(trackH * s.e5);
    SCREENS.drawPaceTick(g, T, trackX + (trackW >> 1), tickCy);

    const dim = T.dim;
    // Left callouts, right-aligned to x=112, kept apart by hand. The diamond
    // one has to sit at the diamond; the fill one is pushed to the middle of
    // whatever fill there is, which is the only free space left on that side.
    const fillMid = Math.min(196, usedH + Math.round((trackH - usedH) / 2));
    const L = [
      [['an even burn', 'puts you here'], tickCy - 8],
      [['this much is', 'left, not spent'], Math.max(tickCy + 40, fillMid)],
    ];
    L.forEach(([txt, y]) => {
      g.setFont(T.small); g.setTextDatum(TR); g.setTextColor(dim, T.bg);
      txt.forEach((t, i) => g.drawString(t, 112, y + i * LINE));
      leader(g, dim, 116, y + 8, trackX - 3, y + 8);
    });
    // Right callouts, all below the close control's band. Three of the five
    // facts live on the bottom edge -- empty, the reset, and where the token
    // sits -- so they share one callout and one L-shaped leader. Three
    // separate captions at y=224 would run off the screen.
    const R = [
      [['the colour says', 'how far ahead', 'of pace you are'], 64, 72],
      // 180 to 310 is 130px, which Font2 spends in about 17 characters. That
      // is the whole right gutter, and it is why this callout is four lines.
      [['empty here, which', 'is the reset too,', 'and where the', '$ or X sits'], 142, trackH - 2],
    ];
    R.forEach(([txt, y, ty]) => {
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(dim, T.bg);
      txt.forEach((t, i) => g.drawString(t, 180, y + i * LINE));
      leader(g, dim, 176, y + 8, trackX + trackW + 3, ty);
    });
    backChevron(g, T); closeX(g, T);
  }

  // 2 · Diagram. A schematic bar, smaller than the real one, with numbered
  // callouts stacked beside it. Gives up verite to buy the room to point.
  function legendDiagram(g, T, s) {
    g.fillScreen(T.bg);
    line(g, T, 'WHAT THE SCREEN MEANS', 66, 14, T.dim);
    const bx = 26, bw = 34, by = 44, bh = 156;
    g.fillRoundRect(bx, by, bw, bh, 5, T.card);
    g.fillRoundRect(bx, by + 62, bw, bh - 62, 5, T.ok);
    SCREENS.drawPaceTick(g, T, bx + (bw >> 1), by + 80);
    SCREENS.drawMarkX(g, bx + (bw >> 1), by + bh, 8, T.bg, 5);
    SCREENS.drawMarkX(g, bx + (bw >> 1), by + bh, 8, T.crit, 2);

    // Two lines where a line is not enough; 96 to 310 is 214px, which Font2
    // spends in about 28 characters.
    const items = [
      [['filled = what is left'], by + 108],
      [['where an even burn', 'would have you'], by + 80],
      [['green on pace, amber a bit', 'ahead, red well ahead'], by + 40],
      [['the bottom is empty,', 'and the reset'], by + bh],
      [['$ or X: extra usage,', 'running or blocked'], by + bh],
    ];
    let cy = 38;
    items.forEach(([txt, y], i) => {
      g.fillCircle(80, cy + 7, 8, T.card);
      g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(T.dim, T.card);
      g.drawString(String(i + 1), 80, cy + 8);
      txt.forEach((t, k) => line(g, T, t, 96, cy + k * LINE, T.text));
      leader(g, T.card, 72, cy + 7, bx + bw + 2, y);
      cy += txt.length * LINE + 10;
    });
    backChevron(g, T); closeX(g, T);
  }

  // 3 · Key. No bar at all -- a key with the marks themselves beside the
  // sentences, the way a map legend works. Six rows at 30px.
  function legendKey(g, T, s) {
    g.fillScreen(T.bg);
    line(g, T, 'WHAT THE SCREEN MEANS', 66, 14, T.dim);
    const rows = [
      ['fill', 'the filled part is what is left'],
      ['ok', 'green: on pace, or behind it'],
      ['warn', 'amber: a bit ahead of an even burn'],
      ['crit', 'red: well ahead of an even burn'],
      ['tick', 'where an even burn would have you'],
      ['token', 'extra usage: running, or blocked'],
    ];
    rows.forEach(([kind, txt], i) => {
      const y = 38 + i * 28, cy = y + 11;
      if (kind === 'fill') {
        g.fillRoundRect(22, y, 22, 24, 4, T.card);
        g.fillRoundRect(22, y + 9, 22, 15, 4, T.ok);
      } else if (kind === 'tick') {
        SCREENS.drawPaceTick(g, T, 33, cy);
      } else if (kind === 'token') {
        SCREENS.outlinedGlyph(g, T, '$', T.stat, 18, y - 4, T.pay, T.bg, 2);
        SCREENS.drawMarkX(g, 46, cy, 7, T.crit, 2);
      } else {
        g.fillRoundRect(22, y + 4, 22, 16, 4, T[kind]);
      }
      line(g, T, txt, 60, cy - 8, T.text);
    });
    line(g, T, 'the bar runs out at its bottom edge, which is', 22, 208, T.dim);
    line(g, T, 'also where it refills', 22, 224, T.dim);
    backChevron(g, T); closeX(g, T);
  }

  // 4 · Two panes. Colour is one question and shape is another; each gets a
  // card and one line of gloss. Fewer words than any other version here.
  function legendPanes(g, T, s) {
    g.fillScreen(T.bg);
    // The title sits between the back and close zones, the only clear strip
    // at the top of any of these screens.
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.dim, T.bg);
    g.drawString('FILL IS WHAT IS LEFT', 160, 19);

    g.fillRoundRect(12, 44, 296, 82, 8, T.card);
    line(g, T, 'COLOUR SAYS PACE', 24, 52, T.dim);
    [['ok', 'on pace'], ['warn', 'a bit ahead'], ['crit', 'well ahead']].forEach(([k, t], i) => {
      const x = 26 + i * 96;
      g.fillRoundRect(x, 74, 60, 22, 4, T[k]);
      g.setFont(T.small); g.setTextDatum(TL); g.setTextColor(T.text, T.card);
      g.drawString(t, x, 102);
    });

    g.fillRoundRect(12, 134, 296, 82, 8, T.card);
    line(g, T, 'MARKS SAY WHERE', 24, 142, T.dim);
    SCREENS.drawPaceTick(g, T, 50, 172);
    SCREENS.outlinedGlyph(g, T, '$', T.stat, 136, 156, T.pay, T.card, 2);
    SCREENS.drawMarkX(g, 250, 172, 9, T.crit, 3);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.text, T.card);
    g.drawString('even burn', 50, 190);
    g.drawString('paying', 148, 190);
    g.drawString('blocked', 250, 190);
    line(g, T, 'the bottom edge is empty, and the reset', 14, 222, T.dim);
    backChevron(g, T); closeX(g, T);
  }

  // 5 · Scrim. The strongest form of verite: annotate the real screen in
  // place, dimmed by the same fillRectAlpha the smoke overlay uses, so the
  // thing being explained is the thing you were just looking at.
  function legendScrim(g, T, s) {
    SCREENS.dashboard(g, T, {
      ok: true, h5: s.h5, e5: s.e5, d7: s.d7, e7: s.e7,
      reset5: 'in 2h 24m', reset7: 'in 3d 4h', sevenBinds: false,
      ageTxt: s.ageTxt, err: s.err, fetching: false, phase: 1,
      rssi: s.rssi, pollFrac: 0.39,
      overage: s.ovActive ? { active: true, status: s.ovStatus, remaining: 0,
                              resetTxt: s.ovReset, disabledReason: s.ovReason } : null,
    });
    g.fillRectAlpha(0, 0, SCREEN_W, SCREEN_H, 190, T.bg);
    const trackX = V.V5_X, trackW = V.V5_W;
    const u = Math.max(0, Math.min(100, s.h5)) / 100;
    const usedH = Math.round(V.V_TRACK_H * u);
    const tickCy = Math.round(V.V_TRACK_H * s.e5);
    const put = (txt, x, y, tx, ty, datum) => {
      g.setFont(T.small); g.setTextDatum(datum); g.setTextColor(T.text, T.bg);
      g.drawString(txt, x, y);
      leader(g, T.dim, datum === TR ? x + 4 : x - 4, y + 8, tx, ty);
    };
    // Left stubs stop short of the 7-day column rather than crossing it.
    const fillMid = Math.min(196, usedH + Math.round((V.V_TRACK_H - usedH) / 2));
    put('even burn', 86, tickCy - 8, trackX - 3, tickCy, TR);
    put('what is left', 86, Math.max(tickCy + 34, fillMid), trackX - 3,
        Math.max(tickCy + 34, fillMid) + 8, TR);
    put('colour = pace', 180, 88, trackX + trackW + 3, 96, TL);
    put('empty, and the reset', 180, 196, trackX + trackW + 3, 204, TL);
    backChevron(g, T); closeX(g, T);
  }

  // ═══════════════════════════════════════════════════════
  // Screen 3 — the settings URL
  // ═══════════════════════════════════════════════════════
  // qrcode() fills a WHITE box and draws black modules; the palette does not
  // reach it, so a QR is always a white card on the warm black. Its `margin`
  // argument defaults to false, which leaves only the w/size rounding
  // remainder as a quiet zone -- so every call here passes true, and the page
  // prints the thickness that came back.
  const QRSTATS = {};
  function qr(g, key, text, x, y, w) {
    QRSTATS[key] = QR.drawQR(g, text, x, y, w, true);
    return QRSTATS[key];
  }
  const nameURL = s => 'http://' + s.host + '.local';
  const ipURL = s => 'http://' + s.ip;

  // 1 · QR dominant. One code, as big as the screen allows, with the name
  // under it and the address under that.
  function urlDominant(g, T, s) {
    g.fillScreen(T.bg);
    qr(g, 'dominant', nameURL(s), 88, 26, 148);
    g.setFont(T.stat); g.setTextDatum(TC); g.setTextColor(T.text, T.bg);
    g.drawString(s.host + '.local', 160, 184);
    g.setFont(T.small); g.setTextColor(T.dim, T.bg);
    g.drawString('or ' + s.ip + ' if that name fails', 160, 214);
    backChevron(g, T); closeX(g, T);
  }

  // 2 · Split. Code on the left, an address block on the right, so the two
  // ways in sit side by side rather than one under the other.
  function urlSplit(g, T, s) {
    g.fillScreen(T.bg);
    qr(g, 'split', nameURL(s), 14, 58, 132);
    line(g, T, 'http://', 160, 66, T.dim);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(T.text, T.bg);
    g.drawString(s.host, 158, 84);
    line(g, T, '.local', 160, 112, T.dim);
    g.drawFastHLine(158, 136, 146, T.card);
    line(g, T, 'or ' + s.ip, 160, 146, T.text);
    line(g, T, 'PIN required', 160, 170, T.dim);
    backChevron(g, T); closeX(g, T);
  }

  // 3 · Two codes. mDNS fails on plenty of home networks, so the fallback is
  // scannable rather than typed. The cost is module size, which the page
  // prints, because a code too small to scan is worse than no code.
  function urlTwoCodes(g, T, s) {
    g.fillScreen(T.bg);
    line(g, T, 'BY NAME', 30, 54, T.dim);
    line(g, T, 'BY ADDRESS', 182, 54, T.dim);
    qr(g, 'two-name', nameURL(s), 22, 74, 116);
    qr(g, 'two-ip', ipURL(s), 182, 74, 116);
    g.setFont(T.small); g.setTextDatum(TC); g.setTextColor(T.text, T.bg);
    g.drawString(s.host + '.local', 80, 198);
    g.drawString(s.ip, 240, 198);
    g.setTextColor(T.dim, T.bg);
    g.drawString('try this one first', 80, 216);
    g.drawString('always works', 240, 216);
    backChevron(g, T); closeX(g, T);
  }

  // 4 · Text first. The address big enough to read across a desk and type,
  // with the code reduced to a corner for whoever has a phone in hand.
  function urlTextFirst(g, T, s) {
    g.fillScreen(T.bg);
    line(g, T, 'http://', 20, 62, T.dim);
    g.setFont(T.stat); g.setTextDatum(TL); g.setTextColor(T.text, T.bg);
    g.drawString(s.host + '.local', 18, 80);
    line(g, T, 'or ' + s.ip, 20, 116, T.text);
    line(g, T, 'Your PIN logs you in, and', 20, 148, T.dim);
    line(g, T, 'unlocks the device too.', 20, 166, T.dim);
    qr(g, 'corner', nameURL(s), 216, 150, 88);
    backChevron(g, T); closeX(g, T);
  }

  // 5 · Stepped. Two numbered steps, because the PIN is the part that makes
  // the trip to a phone worth taking and nothing else here says so.
  function urlStepped(g, T, s) {
    g.fillScreen(T.bg);
    qr(g, 'stepped', nameURL(s), 12, 62, 124);
    const step = (n, a, b, y) => {
      g.fillCircle(154, y + 8, 9, T.card);
      g.setFont(T.small); g.setTextDatum(MC); g.setTextColor(T.text, T.card);
      g.drawString(String(n), 154, y + 9);
      line(g, T, a, 172, y, T.text);
      line(g, T, b, 172, y + 18, T.dim);
    };
    step(1, 'Scan, or type', s.host + '.local', 70);
    step(2, 'Enter your PIN', 'unlocks the device', 126);
    line(g, T, 'no name? ' + s.ip, 150, 186, T.dim);
    backChevron(g, T); closeX(g, T);
  }

  window.SKETCH = {
    NOMINAL, DEGRADED, QRSTATS,
    panel: { ledger: panelLedger, column: panelColumn, headline: panelHeadline,
             sentences: panelSentences, pared: panelPared },
    legend: { realbar: legendRealBar, diagram: legendDiagram, key: legendKey,
              panes: legendPanes, scrim: legendScrim },
    url: { dominant: urlDominant, split: urlSplit, two: urlTwoCodes,
           text: urlTextFirst, stepped: urlStepped },
  };
})();
