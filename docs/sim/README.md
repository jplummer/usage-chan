# The simulator

A pixel-exact picture of the device's screens in a browser, so the spec and the panel are one dialect. `lgfx.js` reimplements the handful of LovyanGFX calls `src/ui.cpp` uses, transcribing the library's own shape loops, and draws text from the device's glyph bitmaps in `fonts.js`. Output is a 320×240 buffer pixel-doubled onto a canvas, never smoothed.

What it cannot show: the backlight, the IPS panel's viewing angle, and how the warm near-black reads in a lit room. Those remain a hardware check, but they do not change layout decisions.

## Pages

| Page | What it is for |
|---|---|
| `dashboard.html` | The shipped dashboard, one screen, every state on sliders. Compare it against the device before trusting the rest |
| `lookfeel.html` | Candidates side by side: the dashboard in every small face, then the menu, PIN entry, and the interstitials (boot, setup, connecting, lockout, error) in Font2 beside a candidate face you choose. Label case, headline face, and the candidate are switches; the sliders drive every dashboard at once |
| `sketches.html` | Five candidates each for three screens that do not exist yet — the status panel the menu becomes, the legend, and the settings-URL screen. One control panel drives all fifteen, including the degraded states. Reasoning in `docs/exploration-screen-sketches.md` |
| `alternatives.html` | Ten alternative main views, drawn against the same data the shipped dashboard carries, plus four fixed grids showing every layout in the hard states. Exploration rather than proposals — the vertical bars are staying. Reasoning and the coverage table in `docs/exploration-dashboard-alternatives.md` |

Two of these pages come with checkers rather than eyeballs:

```bash
node docs/sim/check-alternatives.js   # every layout x every state, measures each string
node tools/qr-check.js                # proves the sketched QR codes round-trip
node tools/render-sketches.js         # writes every sketch to build/sketch-out/*.png
```

`check-alternatives.js` is the one worth running after any change to `screens.js`: it reports the four strings the shipped dashboard currently overflows in its 102px headline slot.

## Running it

The pages load scripts relatively, so they need to be served rather than opened as files:

```bash
python3 -m http.server 8765 --directory docs/sim
```

then open `http://localhost:8765/lookfeel.html`. `.claude/launch.json` carries the same command as `sim` for the in-app browser.

## Regenerating the fonts

`fonts.js` is generated from the M5GFX headers under `.pio/libdeps`, so it needs a PlatformIO checkout to rebuild but not to use. Add faces to the `GFX` list in the script and rerun:

```bash
python3 tools/fonts2js.py > docs/sim/fonts.js
```

`Font2` is the 16px bitmap face every small string on the device uses today. FreeSans is GNU FreeFont and DejaVu is DejaVu Sans, both bundled with LovyanGFX in Adafruit's GFXfont format. Sizes the library does not ship, such as FreeSans below 9pt, need the TTF and a rasteriser; generate them once and the same data feeds the sim and the firmware, so the two match by construction.

## Designing with these faces in Figma

`tools/fonts2ttf.py` writes one TrueType file per face from the same glyph data the sim draws from, so type set in Figma carries the panel's exact advance widths — a string that fits there fits here.

```bash
python3 tools/fonts2ttf.py ~/Library/Fonts
```

The first run builds a venv under `build/` for fontTools and re-runs itself inside it; after that it takes about a second. Quit and reopen Figma so it rescans.

**Always set size 100.** Every face has an em of exactly 100 device pixels, so 100 renders at device scale and 200 on a 2x canvas. There is no other number to type, and nothing to look up per face — pick the family and the size is already decided.

The digit in a family name is the source face's point label, kept so it lines up with what `ui.cpp` asks for. It is neither a size nor a pixel height, and the two diverge: DejaVu 9 is the smallest face here at 10px, while Sans 9 is 18px. What each family actually measures on the panel:

- **UsageChan Font2** — `Font2`, 16px. Every small string on the device today
- **UsageChan Sans 9 / 12 / 18 / 24** — `FreeSans9pt7b` and friends, 18 / 23 / 35 / 45px
- **UsageChan Sans Bold 9 / 12 / 18 / 24** — `FreeSansBold9pt7b` and friends, 18 / 23 / 33 / 47px
- **UsageChan DejaVu 9 / 12 / 18** — `DejaVu9` and friends, 10 / 13 / 18px

Widths are the whole point, so give the text slots real bounds while you work: draw them as frames with clipping on, at 129px for the vertical dashboard's headline slot and 48px for the thin column, doubled on a 2x canvas. Anything too long then clips in Figma the way it clips on the panel.

Two things a font file cannot carry, both LovyanGFX behaviours rather than font bugs. A string whose first glyph reaches left of the pen sits 1px further right on the panel than in Figma and measures 1px wider — `_` in the FreeSans faces, `W`, `v`, `y` in DejaVu 9, `J`, `V`, `v`, `y` in DejaVu 12, `J` in DejaVu 18. And a glyph whose ink is wider than its own advance has that overhang erased on the panel by the next glyph's background fill, where Figma shows it in full.

Font2 has neither problem, no shipped string starts with one of those glyphs, and the worst case anywhere is 2px. Leave 2px of slack, or check the sim. `docs/design-decisions.md` has the full account.

## Keeping it honest

`screens.js` is a port of `ui.cpp`, geometry constant for geometry constant. When a screen changes in firmware, change it here in the same commit. If the two ever disagree, one of them is wrong, and the diff is the finding.
