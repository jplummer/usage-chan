# Plan — three screens, five ways each

Written before drawing anything, so the thinking stays put while the building happens.
Amended in place if building proves a line of it wrong; amendments are marked **Amended**.

Nothing here touches `src/ui.cpp` or `docs/sim/screens.js`. New files only:
`docs/sim/qr.js`, `docs/sim/sketch-variants.js`, `docs/sim/sketches.html`.

---

## What the constraints actually say

Three numbers decide most of this.

**46px is a touch floor, not a layout unit.** `ui.cpp`'s comment says 34px rows missed on
hardware and 46px works, and `design-decisions.md` says the same in millimetres. It is a
rule about *things you hit*. A line of Font2 you only read costs 16px and owes nobody
7mm. The shipped menu spends 46px a row on four rows that are all targets. The status
panel has six readings that are not targets and three things that are, so the honest
budget is `3 x 46 = 138` for the targets and `240 - 138 = 102` for everything else,
including the header. That is the whole design problem stated as arithmetic, and four of
my five variants are different answers to it.

**The close control inherits the hamburger's zone.** `V_MENU_HIT` is x 264–320, y 0–56 —
56x56, about 8.9 x 8.9mm. Putting the X at `V_CTRL_X, V_CIRCLE_Y0` (278, 11) keeps the
glyph exactly where the hamburger was, so the thing you tapped to get in is the thing you
tap to get out, in the same pixels. Every variant does this; it is not a variable.

**Brightness is already solved.** Five dots, 36px pitch, first at x=128, last at x=272,
each dot owning 36 x 46 (5.7 x 7.3mm). `drawBrightnessDots` is copied, not redesigned. The
only choice left is which row it rides on, and whether that row is otherwise empty.

One more that is easy to miss: the dot strip runs to x=272, which is inside the close
control's column. That is fine below y=56 and a collision above it, so the brightness row
can never be the top row.

## Screen 1 — the status panel

Six readings, one control, two destinations, one close. What I am *not* willing to do is
shrink rows to 34px, which is the failure the comment above `MENU_TOP` records.

The five bets:

1. **Ledger.** Readings are a dense label/value table at 18px pitch — six lines, 108px,
   the top two-thirds of the screen. Targets are three full 46px rows below it. Bet: the
   two registers are different kinds of thing and should not share a grammar. Worst case
   is that it reads as a settings dump.
2. **Column.** The panel mirrors the dashboard's control column: the wifi glyph, the
   refresh ring and a service dot stay in the right-hand rail at their dashboard
   positions, each gaining a value beside it. Only the readings that need words get
   words. Bet: the panel explains the column by *being* the column, expanded, and you
   already know where to look because you just tapped the top of it.
3. **Headline.** One big `FreeSansBold12pt` state word — the answer to "is this thing
   working" — with one dim line of evidence under it, then three rows. The other five
   readings collapse into that verdict and only surface when they are the reason.
   Bet: the panel is read-mostly and the real question is *why is the dashboard doing
   that*, singular.
4. **Sentences.** The readings written as three short plain sentences in Font2 instead of
   a table. "On rosewater-5g, strong signal." Bet: at 16px, prose beats label/value —
   it names the relationship between facts (no clock set, *so* resets are durations) that
   a table cannot express, and that relationship is the point of half these readings.
5. **Pared.** Drop four readings and defend it. Keep only what changes what you do: the
   radio, whether the API is answering, and the clock explanation. Poll interval, fetch
   duration, overage reset date and the service-status stub go to the web panel. Buys
   four full 46px rows. Bet: an unauthenticated read-only screen earns its keep by being
   short.

Service status is a stub in all five — `plan.md` lists it under Stubs and IOUs, and it
claims "no service issues" without asking anyone. Variants 1–4 draw it with a visible
marker on the page saying so. Variant 5 drops it, which is the same claim made by
deletion.

Every variant gets a degraded state on the same toggle: timezone unset, `http_529` twice
in a row, overage rejected with `payment_failed`. A panel that only looks right when
everything is fine is not finished, so the toggle is global rather than one sample cell.

## Screen 2 — the legend

Minimum content: fill means what is *left*; the bottom edge is exhaustion and the reset at
once; the diamond is even-burn pace; the three colours; the vessel and its `$`/`X`.
Plus back and close.

1. **Annotated real bar** — the version `plan.md` parks. The actual 5-hour bar at actual
   values, in place, with callouts and leader lines. My prediction before drawing: the
   bar is 224 tall and 48 wide at x=123, which leaves 123px to its left and 149px to its
   right. Four callouts at 16px each need vertical separation, and three of the four
   things being pointed at (fill, bottom edge, token) cluster in the bottom third. I
   expect the leaders to cross or the callouts to sit nowhere near what they point at.
   Drawing it is how that gets settled rather than argued.
2. **Diagram** — a schematic bar, narrower and shorter than the real one, with numbered
   callouts stacked beside it. Bet: giving up vérité buys the room to point cleanly.
3. **Key** — no bar at all. Six rows, each a small drawn mark (swatch, diamond, token,
   edge) beside one sentence. Bet: a legend is a key, and a key does not need the map.
4. **Two panes** — colours on top, marks below, each pane with its own one-line gloss.
   Bet: "what the colours mean" and "what the shapes mean" are two questions and
   separating them halves the reading.
5. **Scrim** — the legend as a translucent overlay on the live dashboard, using the same
   `fillRectAlpha` the smoke overlay uses. Bet: the strongest version of vérité is
   annotating the real screen in place, not a copy of its bar.

## Screen 3 — the settings URL

`http://usage-chan.local` and the raw IP, both reachable, on a dark screen.

Two facts fix the frame before any variant. `LGFXBase::qrcode` fills a **white** square
and draws black modules — it ignores the palette entirely, so the QR is a white card on
warm black in every variant. And its `margin` parameter **defaults to false**, so the
quiet zone is only whatever the `w / size` rounding leaves over. At 23 bytes, ECC L, the
encoder lands on version 2 — 25 modules — so a 120px box gives thickness 4, a 100px run
and a 10px margin, which is 2.5 modules where the spec wants 4. Passing `margin=true` or
choosing the width deliberately is the fix.

1. **QR dominant** — one large code centred, hostname under it, IP dim under that.
2. **Split** — QR left, an address block right: name, IP, and the PIN note.
3. **Two codes** — one for the name, one for the IP, labelled. Bet: mDNS failing is
   common enough that the fallback deserves to be scannable, not typed.
4. **Text first** — the address big in `FreeSansBold12pt`, QR reduced to a corner. Bet:
   the person is as likely to type it as scan it.
5. **Stepped** — the QR plus numbered steps, including that the PIN unlocks the device
   too, which is the fact that makes the trip to a phone worth taking.

## How it gets built

`docs/sim/qr.js` — a real QR encoder (byte mode, ECC L, versions 1–5, single block,
mask 0) plus a `drawQR` that mirrors `LGFXBase::qrcode`'s fill-white-then-modules and its
thickness/offset arithmetic. Mask 0 is valid and declared in the format bits; it is not
the penalty-optimal mask the device's own encoder would pick, so the *pattern* may differ
from the panel's while the module count, thickness and box size match exactly.

`docs/sim/sketch-variants.js` — fifteen draw functions, all through `LGFX` and
`SCREENS`' exported helpers, none of them editing `screens.js`.

`docs/sim/sketches.html` — three sections following `explore.html`: prose, a `.grid` of
cells, a sticky `.controls` panel. One global degraded toggle, one brightness slider.
Every tappable thing gets its target size stated in px and mm in the cell's note.

---

## Amended, mid-build

**Battery was added to the brief.** Seven readings now, not six. The rule that fell out
of it applies to all five variants: this device lives plugged in, so battery earns its
space by being *true* rather than by being a reading. On mains with a working gauge it
says nothing at all. `halBatPercent()` returns -1 when the gauge cannot be read, so that
case draws words and an empty outline with a dash through it, never a partly filled cell.
`halIsCharging()` has three values, so "cannot tell" gets its own appearance. The page
carries a power control and a gauge-readable checkbox so all six combinations are
reachable.

**The column variant's first cut did not survive contact.** It put each rail glyph's
value to the glyph's left. The rows have to run to x=258 to carry the 36px dot pitch, and
the glyphs sit at y 156 and 198 — inside the row band — so there is nowhere for a
caption to go. Rather than move the glyphs, which would have thrown away the variant's
whole bet, the variant now makes the stronger claim: the glyph *is* the reading, and the
SSID goes to the web panel. A glyph that needs a caption is not doing its job.

**The headline variant's battery chip landed on the verdict.** "2 failures" at 18pt is
about 180px wide and the chip was at x=236. Battery moved to the head of the evidence
list instead, which is where you want it on the day the cable is out.

**A row narrower than ~280px cannot hold "Brightness" plus five dots.** The strip needs
180px and the word about 78 plus padding. `brightnessRow` took a label parameter; the
column variant, whose rows are 246 wide, says "Light". `ui.cpp` hit the same wall from
the other side, where a 40px pitch ran the first dot into the word.

**The annotated real bar does not work, and the reason is not space.** Space is survivable
— three of the five facts share the bottom edge, so they collapse into one callout with
an L-shaped leader. What kills it is that the bar contradicts the callouts. Full write-up
on the page and in the report.
