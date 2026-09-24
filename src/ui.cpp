/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 */
#include "ui.h"
#include "hal.h"
#include "config.h"
#include <Arduino.h>
#include <time.h>
#include "fetcher.h"
#include "icons.h"

// ── Drawing target ────────────────────────────────────────
// Everything is composed into an off-screen sprite and pushed in one write, so
// no screen ever shows a half-drawn frame. 320x240 at 16bpp is 150KB, which is
// why platformio.ini turns PSRAM on; internal RAM would not hold it alongside
// the WiFi and TLS stacks.
//
// If the allocation fails anyway the code draws straight to the panel instead
// of refusing to boot. It flickers, and it says so on the serial log, but a
// usable device beats a black one.
static M5Canvas   canvas(&lcd);
static LovyanGFX* g         = nullptr;
static bool       useSprite = false;

static char s_headerLabel[24] = "USAGE-CHAN";

static void flush() {
    if (useSprite) canvas.pushSprite(0, 0);
}

// ── Palette ───────────────────────────────────────────────
// Warm near-black rather than pure black: on an IPS panel in a lit room pure
// black reads as a dead pixel field, and this thing sits on a desk all day.
static uint16_t C_BG, C_CARD, C_TEXT, C_DIM, C_ACCENT, C_OK, C_WARN, C_CRIT, C_PAY;
// The control column draws in its own colour rather than borrowing C_DIM.
// It is chrome, not content -- it competes with the numbers for attention and
// should lose. Kept separate so it can be taken down without dimming the pace
// words, which say something.
static uint16_t C_CTRL;

static void initPalette() {
    C_BG     = lcd.color565(0x14, 0x11, 0x0F);
    C_CARD   = lcd.color565(0x24, 0x1F, 0x1B);
    C_TEXT   = lcd.color565(0xE8, 0xE3, 0xDD);
    C_DIM    = lcd.color565(0x8A, 0x81, 0x7A);
    C_ACCENT = lcd.color565(0xD9, 0x77, 0x57);   // Claude clay
    C_OK     = lcd.color565(0x5F, 0xA6, 0x72);
    C_WARN   = lcd.color565(0xD9, 0xA4, 0x41);
    C_CRIT   = lcd.color565(0xD9, 0x56, 0x4F);
    C_PAY    = lcd.color565(0x6E, 0x93, 0xC9);
    C_CTRL   = C_DIM;
}

// Colour comes from the RELATIONSHIP between spend and elapsed time, not from
// the level. Behind pace reads calm however little remains, which a level-based
// threshold cannot express — and it means the one state worth flagging fires on
// unusual days rather than most of them.
static uint16_t paceColor(float util, float elapsed) {
    float d = util - elapsed;
    if (d > 0.15f) return C_CRIT;
    if (d > 0.02f) return C_WARN;
    return C_OK;
}

// Window lengths, needed to turn a reset time into an elapsed fraction. Both
// are fixed, so the pace tick needs no data the API does not already give us:
//   elapsed = 1 - (reset - now) / length
static constexpr uint32_t WIN_5H = 5UL * 3600UL;
static constexpr uint32_t WIN_7D = 7UL * 86400UL;

static bool s_tzKnown = false;
void uiSetTimezoneKnown(bool known) { s_tzKnown = known; }

// Returns -1 when the fraction cannot be computed honestly.
static float elapsedFraction(uint32_t resetEpoch, uint32_t windowSec) {
    if (resetEpoch == 0) return -1.0f;
    time_t now = time(nullptr);
    if (now < 1700000000) return -1.0f;
    long remain = (long)resetEpoch - (long)now;
    if (remain < 0) remain = 0;
    if ((uint32_t)remain > windowSec) return -1.0f;
    float e = 1.0f - (float)remain / (float)windowSec;
    return e < 0.0f ? 0.0f : (e > 1.0f ? 1.0f : e);
}

// The reset moment as a wall clock — "3:40pm" — which is the planning register:
// what you compare against a calendar. Falls back to a duration when we have no
// timezone, because a confidently wrong clock is worse than a vague duration.
static bool fmtReset(uint32_t epoch, char* out, size_t n, bool withDay) {
    if (epoch == 0) return false;
    time_t now = time(nullptr);
    if (now < 1700000000) return false;
    long remain = (long)epoch - (long)now;
    if (remain <= 0) { snprintf(out, n, "resetting"); return true; }

    if (!s_tzKnown) {
        long mins = remain / 60, hours = mins / 60, days = hours / 24;
        if (days > 0)       snprintf(out, n, "in %ldd %ldh", days, hours % 24);
        else if (hours > 0) snprintf(out, n, "in %ldh %02ldm", hours, mins % 60);
        else                snprintf(out, n, "in %ldm", mins);
        return true;
    }

    time_t t = (time_t)epoch;
    struct tm tm_;
    localtime_r(&t, &tm_);
    int h12 = tm_.tm_hour % 12; if (h12 == 0) h12 = 12;
    const char* ap = tm_.tm_hour < 12 ? "am" : "pm";
    static const char* kDay[7] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
    if (withDay) snprintf(out, n, "%s %d%s", kDay[tm_.tm_wday], h12, ap);
    else         snprintf(out, n, "%d:%02d%s", h12, tm_.tm_min, ap);
    return true;
}

// A diamond, with a one-pixel halo in the background colour so it holds its
// shape against the dark track AND against any fill it overlaps. Points at its
// own position, where a circle would claim an area.
static void drawPaceTick(int cx, int cy, uint16_t halo, uint16_t ink) {
    for (int r = 7; r >= 6; r--) {
        uint16_t c = (r == 7) ? halo : ink;
        for (int dy = -r; dy <= r; dy++) {
            int dx = r - (dy < 0 ? -dy : dy);
            g->drawFastHLine(cx - dx, cy + dy, dx * 2 + 1, c);
        }
    }
}

// The blocked mark's X, plotted a pixel at a time. Font2's own 'X' blobs
// against the edge of a 14px circle, and a 45-degree diagonal is exact, so
// there is nothing here a line routine would do better -- and plotting it
// the same way in docs/sim guarantees the two agree pixel for pixel.
// Two 45-degree bands, each tested per pixel rather than plotted along a line:
// stepping along one diagonal while offsetting along the other only ever lands
// on pixels of one parity, which comes out as a checkerboard. Rotate the
// coordinates instead -- a = along one arm, b = across it -- and the band
// fills solid with its ends cut square to the arm.
static void drawMarkX(int cx, int cy, int arm, uint16_t col, int thick = 2) {
    const int len = arm * 2, r = arm + thick;
    for (int dy = -r; dy <= r; dy++)
        for (int dx = -r; dx <= r; dx++) {
            const int a = dx + dy, b = dx - dy;
            const int aa = a < 0 ? -a : a, ab = b < 0 ? -b : b;
            if ((ab <= thick && aa <= len) || (aa <= thick && ab <= len))
                g->drawPixel(cx + dx, cy + dy, col);
        }
}

// The caption under the diamond says in words what the gap between the markers
// shows. Five steps -- well/a bit either side of on pace -- keyed to the same
// breaks paceColor() uses, so words and
// colour can never disagree. Behind and on-pace are dim; ahead takes the bar's
// colour, because ahead is the one state worth noticing.
//
// Centred on the tick and clamped to the bar's ends. It gets its own row: a
// caption that tracks the diamond would collide with a reset label on the same
// row for half of every window, which is too often for any dodge to feel
// stable.
static void drawPaceCaption(int bx, int bw, int y, float util, float elapsed) {
    const float d = util - elapsed;
    const char* txt;
    uint16_t    col;
    if      (d >  0.15f) { txt = "well ahead";      col = C_CRIT; }
    else if (d >  0.02f) { txt = "a bit ahead";  col = C_WARN; }
    else if (d < -0.15f) { txt = "well behind";     col = C_DIM;  }
    else if (d < -0.02f) { txt = "a bit behind"; col = C_DIM;  }
    else                 { txt = "on pace";         col = C_DIM;  }

    g->setFont(&fonts::Font2);
    const int half = g->textWidth(txt) / 2;
    int cx = bx + (int)(bw * elapsed + 0.5f);
    if (cx < bx + half)      cx = bx + half;
    if (cx > bx + bw - half) cx = bx + bw - half;
    g->setTextDatum(top_center);
    g->setTextColor(col, C_BG);
    g->drawString(txt, cx, y);
}

// One window as a full bar. The bar IS the window: its left edge is when the
// window opened, its right edge is both exhaustion and reset. Remaining budget
// is anchored right, so spending pushes its left edge rightward — and the pace
// tick travels rightward too. Time flies like an arrow.
//
// Vertical layout from y (the label's top): headline overshoots to y-6, bar at
// y+38..y+62, caption row at y+66, footnote row at y+81. About 97px in all.
static void drawWindowBar(int y, const char* label, float util,
                          uint32_t resetEpoch, uint32_t windowSec, bool valid) {
    const int bx = 16, bw = SCREEN_W - 32, bh = 24;
    const float rem = 100.0f - util;

    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString(label, bx, y);

    // Headline and footnote trade contents at the crossover. Above it the big
    // number is the budget; below it the clock, because the question has changed
    // from "should I start this?" to "should I wait?".
    char resetTxt[24];
    bool haveReset = valid && fmtReset(resetEpoch, resetTxt, sizeof(resetTxt),
                                       windowSec > WIN_5H);
    const bool plenty = rem >= 40.0f;

    char headline[24];
    if (!valid)        strlcpy(headline, "--", sizeof(headline));
    else if (plenty)   snprintf(headline, sizeof(headline), "%d%% left", (int)(rem + 0.5f));
    else if (haveReset) strlcpy(headline, resetTxt, sizeof(headline));
    else               strlcpy(headline, "--", sizeof(headline));

    g->setFont(&fonts::FreeSansBold24pt7b);
    g->setTextDatum(top_right);
    g->setTextColor(valid ? (plenty ? C_TEXT : C_ACCENT) : C_DIM, C_BG);
    g->drawString(headline, bx + bw, y - 6);

    // Track, then the remaining block anchored to the right edge.
    const int by = y + 38;
    g->fillRoundRect(bx, by, bw, bh, 5, C_CARD);

    float e = valid ? elapsedFraction(resetEpoch, windowSec) : -1.0f;
    if (valid) {
        float u = util < 0 ? 0 : (util > 100 ? 100 : util);
        int edge = bx + (int)(bw * u / 100.0f + 0.5f);
        int wRem = bx + bw - edge;
        if (wRem > 0) {
            uint16_t col = (e >= 0.0f) ? paceColor(u / 100.0f, e) : C_OK;
            g->fillRoundRect(edge, by, wRem, bh, 5, col);
        }
        if (e >= 0.0f) {
            drawPaceTick(bx + (int)(bw * e + 0.5f), by + bh / 2, C_BG, C_TEXT);
            drawPaceCaption(bx, bw, by + bh + 4, u / 100.0f, e);
        }
    }

    // Footnote: the clock while there is plenty, a proximity warning when there
    // is not. "nearly out" claims closeness, not a fraction, so it cannot be
    // wrong by a factor of two the way "about a third left" was. And "out"
    // claims arrival: a device in overage once said "nearly out" at zero
    // remaining, which was plainly false.
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_right);
    const int fy = by + bh + 19;
    if (valid && plenty && haveReset) {
        char line[32];
        snprintf(line, sizeof(line), "resets %s", resetTxt);
        g->setTextColor(C_DIM, C_BG);
        g->drawString(line, bx + bw, fy);
    } else if (valid && rem <= 0.0f) {
        g->setTextColor(C_WARN, C_BG);
        g->drawString("out", bx + bw, fy);
    } else if (valid && rem < 12.0f) {
        g->setTextColor(C_WARN, C_BG);
        g->drawString("nearly out", bx + bw, fy);
    }
}

// The 7-day window as a thin bar divided into sevenths. It replaced a one-line
// phrase that turned out to be invisible in use: it nearly always read "behind
// pace", and a thing that never changes gets tuned out. A bar shows the gap
// between the markers, which does move, and the divisions give the diamond a
// position that means something on its own — "Thursday-ish".
//
// The divisions are a scale, not data: unlike a per-day history they cannot
// lie about days the device was unplugged. They sit at fixed sevenths of the
// window, which does not start at midnight, so nothing labels them by name.
//
// The reset label sits at the right end of the label row rather than under the
// bar, which keeps its position meaning and leaves the caption row free.
// Layout from y: label row at y, bar at y+20..y+28, caption at y+34.
static void drawSevenDayBar(int y, const UsageData& d) {
    const int bx = 16, bw = SCREEN_W - 32, bh = 8;
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("7-DAY", bx, y);

    char resetTxt[24];
    if (d.ok && fmtReset(d.d7ResetEpoch, resetTxt, sizeof(resetTxt), true)) {
        char line[32];
        snprintf(line, sizeof(line), "resets %s", resetTxt);
        g->setTextDatum(top_right);
        g->drawString(line, bx + bw, y);
    }

    const int by = y + 20;
    g->fillRoundRect(bx, by, bw, bh, 3, C_CARD);
    if (!d.ok) return;

    float e = elapsedFraction(d.d7ResetEpoch, WIN_7D);
    float u = d.d7 < 0 ? 0 : (d.d7 > 100 ? 100 : d.d7);
    int edge = bx + (int)(bw * u / 100.0f + 0.5f);
    int wRem = bx + bw - edge;
    if (wRem > 0) {
        uint16_t col = (e >= 0.0f) ? paceColor(u / 100.0f, e) : C_OK;
        g->fillRoundRect(edge, by, wRem, bh, 3, col);
    }
    for (int i = 1; i < 7; i++) {
        g->drawFastVLine(bx + bw * i / 7, by, bh, C_BG);
    }
    if (e >= 0.0f) {
        drawPaceTick(bx + (int)(bw * e + 0.5f), by + bh / 2, C_BG, C_TEXT);
        drawPaceCaption(bx, bw, by + bh + 6, u / 100.0f, e);
    }
}

// Same five-way split drawPaceCaption() uses, factored out so the vertical
// layout's fixed-position caption (which can't centre on a moving diamond the
// way the horizontal one does — see drawVBar) can reuse the words and colours
// without re-typing the thresholds.
static const char* paceWord(float util, float elapsed, uint16_t& col) {
    const float d = util - elapsed;
    if      (d >  0.15f) { col = C_CRIT; return "well ahead"; }
    else if (d >  0.02f) { col = C_WARN; return "a bit ahead"; }
    else if (d < -0.15f) { col = C_DIM;  return "well behind"; }
    else if (d < -0.02f) { col = C_DIM;  return "a bit behind"; }
    else                 { col = C_DIM;  return "on pace"; }
}

// Headline copy for the extra-usage states. Even at the vertical layout's
// 12pt headline face, "near cap" and "blocked" are the widest words this
// column can take — measured by rendering every state through docs/sim
// before trusting it. overage-status values seen so far: allowed |
// allowed_warning | rejected.
static const char* overageWord(const char* status) {
    if (strcmp(status, "rejected") == 0)        return "blocked";
    if (strcmp(status, "allowed_warning") == 0) return "near cap";
    if (strcmp(status, "allowed") == 0)         return "paying";
    return "overage";
}

// ── Vertical dashboard ────────────────────────────────────
// Two columns side by side instead of two bars stacked. Each bar fills
// bottom-up, so its own bottom edge reads as exhaustion the same way the old
// bar's right edge did. Whichever window the server names as binding gets the
// wide column and the headline; the other gets the thin one — the same swap
// the stacked layout did with drawWindowBar/drawSevenDayBar above. A reserved
// column on the right stays empty on purpose: a fixed-width home for whatever
// needs one later (signal, the menu button, an update spinner), rather than
// more text fighting for room on a line that is already full.
static constexpr int V7_X       = 91,  V7_W  = 24;   // thin (secondary) column
static constexpr int V5_X       = 123, V5_W  = 48;   // wide (primary) column
static constexpr int V5_TEXT_X  = 178;                // primary text, left-aligned
static constexpr int V7_TEXT_R  = 84;                 // secondary text, right-aligned to this x
static constexpr int V_CTRL_X   = 278, V_CTRL_W = 42;
static constexpr int V_TITLE_Y  = 8, V_HEAD_Y = 29, V_FOOT_Y = 216;
// The headline sits 2px left of the other rows: Sans Bold carries more left
// bearing than Font2, so matching the box edges leaves the stems misaligned.
static constexpr int V_HEAD_KERN = -2;
static constexpr int V_REASON_Y = V_HEAD_Y + 27;  // third line of the stat block
static constexpr int V_TRACK_H  = 224;   // both bars, every state: a bar that
                                         // changes length makes the screen
                                         // twitch exactly when it has something
                                         // to say, and the 16px it gives up is a
                                         // permanent home for the reset line and
                                         // the end-of-bar token.
// Tokens straddle the track's end edge, centred on it -- the frames put the X
// across 209..237 and the '$' ink across 210..239 for an edge at 224.
static constexpr int V_TOKEN_ARM = 11, V_TOKEN_T = 3, V_TOKEN_RING = 3;
static constexpr int V_CIRCLE_Y[3] = { 11, 156, 198 };   // menu, signal, refresh
static constexpr int V_CIRCLE_D    = 32;                 // the frames say 32, not 33

// The refresh spinner, straight off the frame: eight 2x10 spokes between
// radius 6 and radius 16, one of them dark and moving.
static constexpr int   V_SPOKES   = 8;
static constexpr float V_SPOKE_R0 = 6.0f, V_SPOKE_R1 = 16.0f;
static constexpr float V_SPOKE_HW = 1.0f;                // half of 2px
// The other spinner: eight dots on a ring, same eight positions, same gap.
static constexpr float V_DOT_RING = 12.8f, V_DOT_R = 2.9f;

// The menu button's touch zone, which is deliberately bigger than the circle
// it belongs to. 32px is about 5mm on this panel and the reliable floor is
// nearer 7mm -- the same measurement that set the menu's row height. The zone
// runs to the top-right corner so a tap that drifts toward the edge still
// lands on something.
static constexpr int V_MENU_HIT_L = 264, V_MENU_HIT_T = 0;
static constexpr int V_MENU_HIT_R = 320, V_MENU_HIT_B = 56;

// The pace caption rides with the diamond, so the mark and the words read as
// one object rather than two facts on the same screen. It steps aside when
// that would land it on a row that never moves. Same intent as
// drawPaceCaption's clamp in the horizontal layout, turned ninety degrees:
// there it dodged the bar's own ends, here it dodges the headline and the
// reset line.
// The panel has no text-stroke primitive, so a knockout ring is the glyph
// drawn on a disc of offsets in the ring colour, then once more on top in its
// own. About twenty extra draws of one character, which is nothing once per
// refresh, and the only way to separate a bar-coloured token from its bar.
static void outlinedGlyph(const char* ch, const lgfx::IFont* font, int x, int y,
                          uint16_t fill, uint16_t ring, int weight) {
    g->setFont(font);
    g->setTextDatum(top_left);
    g->setTextColor(ring, ring);
    for (int dy = -weight; dy <= weight; dy++)
        for (int dx = -weight; dx <= weight; dx++)
            if (dx * dx + dy * dy <= weight * weight) g->drawString(ch, x + dx, y + dy);
    g->setTextColor(fill, fill);
    g->drawString(ch, x, y);
}

// ── The control column's circles ──────────────────────────
// Every circle in this column is 32 pixels across and drawn the same way: a
// pixel belongs to it when its centre falls inside a radius-16 circle centred
// on the box. That is exactly what Figma means by a 32px ellipse, which
// fillCircle() cannot express -- an integer centre always yields an odd
// diameter -- and it also keeps the three circles identical to each other.
// fillRoundRect() gets within a pixel, but the pie below has to agree with
// its own ring perfectly, and "within a pixel" is what makes a full ring look
// fatter than the disc beside it. drawMarkX already established that testing
// pixels is the cheap, exact way out of this.
static constexpr float V_CIRCLE_R = V_CIRCLE_D * 0.5f;

static void ctrlDisc(int y, uint16_t col) {
    for (int py = 0; py < V_CIRCLE_D; py++)
        for (int px = 0; px < V_CIRCLE_D; px++) {
            const float dx = px + 0.5f - V_CIRCLE_R, dy = py + 0.5f - V_CIRCLE_R;
            if (dx * dx + dy * dy <= V_CIRCLE_R * V_CIRCLE_R)
                g->drawPixel(V_CTRL_X + px, y + py, col);
        }
}

// The empty track the pie fills into: a one-pixel ring, inside the same
// circle, matching the frame's inside stroke.
static void ctrlRing(int y, uint16_t col) {
    const float inner = V_CIRCLE_R - 1.0f;
    for (int py = 0; py < V_CIRCLE_D; py++)
        for (int px = 0; px < V_CIRCLE_D; px++) {
            const float dx = px + 0.5f - V_CIRCLE_R, dy = py + 0.5f - V_CIRCLE_R;
            const float d2 = dx * dx + dy * dy;
            if (d2 <= V_CIRCLE_R * V_CIRCLE_R && d2 > inner * inner)
                g->drawPixel(V_CTRL_X + px, y + py, col);
        }
}

// A pie filled clockwise from twelve o'clock, in the same circle, so a full
// one is indistinguishable from the disc.
static void ctrlWedge(int y, float frac, uint16_t col) {
    if (frac <= 0.0f) return;
    if (frac > 1.0f) frac = 1.0f;
    const float sweep = frac * 2.0f * (float)M_PI;
    for (int py = 0; py < V_CIRCLE_D; py++)
        for (int px = 0; px < V_CIRCLE_D; px++) {
            const float dx = px + 0.5f - V_CIRCLE_R, dy = py + 0.5f - V_CIRCLE_R;
            if (dx * dx + dy * dy > V_CIRCLE_R * V_CIRCLE_R) continue;
            float a = atan2f(dx, -dy);          // clockwise from straight up
            if (a < 0.0f) a += 2.0f * (float)M_PI;
            if (a < sweep) g->drawPixel(V_CTRL_X + px, y + py, col);
        }
}

// The same eight positions as the spokes, drawn as dots. Fewer edges for the
// eye to catch on; slightly more ink. Which of the two is quieter is a looking
// question, not an arguing one -- explore.html puts them side by side.
static void ctrlDots(int y, int gap, uint16_t col) {
    for (int k = 0; k < V_SPOKES; k++) {
        if (k == gap) continue;
        const float a  = k * (2.0f * (float)M_PI / V_SPOKES);
        const float cx = V_CIRCLE_R + V_DOT_RING * sinf(a);
        const float cy = V_CIRCLE_R - V_DOT_RING * cosf(a);
        for (int py = 0; py < V_CIRCLE_D; py++)
            for (int px = 0; px < V_CIRCLE_D; px++) {
                const float dx = px + 0.5f - cx, dy = py + 0.5f - cy;
                if (dx * dx + dy * dy <= V_DOT_R * V_DOT_R)
                    g->drawPixel(V_CTRL_X + px, y + py, col);
            }
    }
}

// Eight spokes with one missing, the gap advancing a step per redraw. The
// cheapest thing that reads as rotation, and the one the frame draws. Each
// spoke is tested in its own rotated frame: distance along the spoke against
// the two radii, distance across it against half the width.
static void ctrlSpokes(int y, int gap, uint16_t col) {
    for (int py = 0; py < V_CIRCLE_D; py++)
        for (int px = 0; px < V_CIRCLE_D; px++) {
            const float dx = px + 0.5f - V_CIRCLE_R;
            const float dy = py + 0.5f - V_CIRCLE_R;
            for (int k = 0; k < V_SPOKES; k++) {
                if (k == gap) continue;
                const float a  = k * (2.0f * (float)M_PI / V_SPOKES);
                const float ux = sinf(a), uy = -cosf(a);   // k = 0 points up
                const float t  =  dx * ux + dy * uy;       // along
                const float sx = -dx * uy + dy * ux;       // across
                if (t >= V_SPOKE_R0 && t < V_SPOKE_R1 &&
                    sx >= -V_SPOKE_HW && sx < V_SPOKE_HW) {
                    g->drawPixel(V_CTRL_X + px, y + py, col);
                    break;
                }
            }
        }
}

// ── Icons ─────────────────────────────────────────────────
// One uint32 per row, bit 31 leftmost, 32 rows, generated from the Figma
// frames by tools/icons2c.py -- see that file for why these stopped being
// hand-fitted geometry. Every fixed picture in the control column is one of
// these; only what is driven by a live value, the countdown wedge and the
// spinner, is still drawn by hand.
//
// A pixel at a time, because M5Canvas's mono-bitmap paths want their own
// buffer format and this is 1024 bit tests at a redraw rate measured in hertz.
static void drawIconScaled(int x, int y, const Icon& ic, uint16_t col, int s) {
    for (int py = 0; py < ic.h; py++)
        for (int px = 0; px < ic.w; px++) {
            const uint32_t w = ic.bits[py * ic.stride + (px >> 5)];
            if (!(w & (1u << (31 - (px & 31))))) continue;
            if (s == 1) g->drawPixel(x + px, y + py, col);
            else        g->fillRect(x + px * s, y + py * s, s, s, col);
        }
}

static void drawIcon(int x, int y, const Icon& ic, uint16_t col) {
    drawIconScaled(x, y, ic, col, 1);
}

// RSSI is a proxy for "will fetches work", and a coarse one -- see the open
// note in design-decisions.md. Four buckets because the frame draws four. A
// non-negative reading means no link: a connected radio always reports a
// negative dBm.
static int wifiLevel(int rssi) {
    if (rssi >= 0)   return 0;
    if (rssi >= -60) return 3;
    if (rssi >= -70) return 2;
    return 1;
}

// Ghosted: the bands the link doesn't reach show as their own outline, so the
// figure keeps one silhouette and the scale is on screen every time you look.
// Absent: they are simply gone -- quieter, and quietest when the news is
// worst. No-link keeps the ghosted figure either way. Both sets are drawn;
// explore.html section 7 puts them side by side.
static constexpr bool V_WIFI_GHOST = true;

static const Icon& wifiIcon(int rssi) {
    switch (wifiLevel(rssi)) {
        case 3:  return ICON_WIFI_HI;
        case 2:  return V_WIFI_GHOST ? ICON_WIFI_MED : ICON_WIFI_MED_ALT;
        case 1:  return V_WIFI_GHOST ? ICON_WIFI_LO  : ICON_WIFI_LO_ALT;
        default: return ICON_WIFI_OUT;
    }
}

// Two states, one object: a ring that fills clockwise as the poll interval
// runs down, and a spinner while the fetch it was counting towards is actually
// happening. Making the interval visible is the point. Every poll spends a
// sliver of the budget this screen reports, so the thing that spends it should
// be something you can watch, and eventually tap to pull forward -- see
// "Refresh as a visible, tappable object" in plan.md.
static void drawRefreshIndicator(int y, bool fetching, float frac, bool failed,
                                 bool failing) {
    // The mark for a failed attempt outranks everything here: it holds the
    // circle for a few seconds and then gives way to the countdown to the
    // retry.
    if (failed) { drawIcon(V_CTRL_X, y, ICON_REFRESH_FAIL, C_CTRL); return; }
    if (fetching) {
        static uint8_t phase = 0;
        ctrlDots(y, phase % V_SPOKES, C_CTRL);
        phase++;
        return;
    }
    // Counting down after a failure is a standing condition, not an event, so
    // it gets a colour rather than a shape. The five-second mark is the
    // announcement; this is what is still true afterwards, for as long as it
    // stays true.
    const uint16_t col = failing ? C_WARN : C_CTRL;
    ctrlRing(y, col);
    ctrlWedge(y, frac, col);
}

// Straddles the track's end edge -- the boundary you just crossed. The ring is
// C_BG, which separates the token from the bar above it and then vanishes into
// the background below, so it reads as emerging from the bar's end rather than
// sitting on top of it. The '$' is placed by its ink, not its box:
// FreeSansBold18pt7b puts that glyph's 29 rows flush with the box top, so the
// box goes 29 above the base.
static void drawToken(int cx, bool rejected) {
    const uint16_t col = rejected ? C_CRIT : C_PAY;
    if (rejected) {
        drawMarkX(cx, V_TRACK_H, V_TOKEN_ARM, C_BG, V_TOKEN_T + V_TOKEN_RING);
        drawMarkX(cx, V_TRACK_H, V_TOKEN_ARM, col,  V_TOKEN_T);
    } else {
        g->setFont(&fonts::FreeSansBold18pt7b);
        const int w = g->textWidth("$");
        outlinedGlyph("$", &fonts::FreeSansBold18pt7b, cx - (w >> 1),
                      V_TRACK_H - 14, col, C_BG, V_TOKEN_RING);
    }
}

static int captionY(int tickCy, bool primary, bool showReason = false) {
    const int H = 16, lo = 0, hi = V_TRACK_H - H;
    int y = tickCy - (H >> 1);
    if (y < lo) y = lo;
    if (y > hi) y = hi;
    // {top, bottom} of every row that never moves in this column.
    // Title and headline are one block now, so the caption has one obstacle
    // above and one below, and its resting place is the row immediately under
    // the block.
    const int blockBot = primary ? (showReason ? V_REASON_Y + 16 : V_HEAD_Y + 23)
                                 : V_TITLE_Y + 16;
    const int avoid[][2] = { { V_TITLE_Y, blockBot },
                             { V_FOOT_Y,  V_FOOT_Y + 16 } };
    for (int i = 0; i < 2; i++) {
        const int top = avoid[i][0], bot = avoid[i][1];
        if (y >= bot || y + H <= top) continue;     // already clear
        const int above = top - H - 2, below = bot + 2;
        const bool fitsA = above >= lo, fitsB = below <= hi;
        if (fitsA && fitsB) y = (tickCy < (top + bot) / 2) ? above : below;
        else if (fitsA)     y = above;
        else if (fitsB)     y = below;
    }
    if (y < lo) y = lo;
    if (y > hi) y = hi;
    return y;
}

// One column. `primary` picks the geometry (wide/right vs thin/left) and how
// much text rides beside it; `days` puts week dividers on the 7-day bar and
// none on the 5-hour one, whichever slot each is drawn in. `ov` is the
// overage source and is only ever passed for the primary column, since extra
// usage only applies to whichever window is currently binding. Normally the
// bar runs the full screen height; it only gives up a strip at its own bottom
// for the paid mark once overage is actually active, rather than paying that
// cost all the time.
static void drawVBar(bool primary, const char* label, float util,
                     uint32_t resetEpoch, uint32_t windowSec, bool valid, int days,
                     const UsageData* ov) {
    const int trackX = primary ? V5_X : V7_X;
    const int trackW = primary ? V5_W : V7_W;
    const int textX  = primary ? V5_TEXT_X : V7_TEXT_R;
    const textdatum_t td = primary ? top_left : top_right;

    const bool overage  = primary && ov && ov->overageActive;
    const bool rejected = overage && strcmp(ov->overageStatus, "rejected") == 0;
    const bool showReason = rejected && ov->overageDisabledReason[0];
    const int  trackH   = V_TRACK_H;

    g->setFont(&fonts::Font2);
    g->setTextDatum(td);
    g->setTextColor(C_DIM, C_BG);
    g->drawString(label, textX, V_TITLE_Y);

    const float rem = 100.0f - util;
    char resetTxt[24];
    bool haveReset = valid && fmtReset(resetEpoch, resetTxt, sizeof(resetTxt),
                                       windowSec > WIN_5H);
    char ovResetTxt[24];
    bool haveOvReset = overage && fmtReset(ov->overageResetEpoch, ovResetTxt,
                                           sizeof(ovResetTxt), false);

    if (primary) {
        const bool plenty = rem >= 40.0f;
        char headline[24];
        uint16_t   hcol;
        if (overage) {
            strlcpy(headline, overageWord(ov->overageStatus), sizeof(headline));
            hcol = rejected ? C_CRIT : C_PAY;
        } else if (!valid) {
            strlcpy(headline, "--", sizeof(headline)); hcol = C_DIM;
        } else if (plenty) {
            snprintf(headline, sizeof(headline), "%d%% left", (int)(rem + 0.5f)); hcol = C_TEXT;
        } else if (haveReset) {
            strlcpy(headline, resetTxt, sizeof(headline)); hcol = C_ACCENT;
        } else {
            strlcpy(headline, "--", sizeof(headline)); hcol = C_DIM;
        }
        g->setFont(&fonts::FreeSansBold12pt7b);
        g->setTextDatum(top_left);
        g->setTextColor(hcol, C_BG);
        g->drawString(headline, textX + V_HEAD_KERN, V_HEAD_Y);

        g->setFont(&fonts::Font2);
        g->setTextDatum(top_left);
        if (overage) {
            if (rejected && ov->overageDisabledReason[0]) {
                char reason[32];
                strlcpy(reason, ov->overageDisabledReason, sizeof(reason));
                for (char* p = reason; *p; p++) if (*p == '_') *p = ' ';
                g->setTextColor(C_DIM, C_BG);
                g->drawString(reason, textX, V_REASON_Y);
            }
            if (haveOvReset) {
                g->setTextColor(C_DIM, C_BG);
                g->drawString(ovResetTxt, textX, V_FOOT_Y);
            }
        } else if (valid && plenty && haveReset) {
            g->setTextColor(C_DIM, C_BG);
            g->drawString(resetTxt, textX, V_FOOT_Y);
        } else if (valid && rem <= 0.0f) {
            g->setTextColor(C_WARN, C_BG);
            g->drawString("out", textX, V_FOOT_Y);
        } else if (valid && rem < 12.0f) {
            g->setTextColor(C_WARN, C_BG);
            g->drawString("nearly out", textX, V_FOOT_Y);
        }
    } else if (haveReset) {
        g->setTextColor(C_DIM, C_BG);
        g->drawString(resetTxt, textX, V_FOOT_Y);
    }

    g->fillRoundRect(trackX, 0, trackW, trackH, 6, C_CARD);
    float e = valid ? elapsedFraction(resetEpoch, windowSec) : -1.0f;
    // Overage is an inner-stroked vessel holding whatever is left, not a
    // flood: the bar's rule everywhere is "fill is what is available", so a
    // solid bar would say everything remains. Blocked holds nothing; paying
    // holds what the extra-usage allowance has left. Either way there is a
    // fill edge again, so the diamond and the pace word keep their meaning.
    float used = -1.0f;
    if (overage) {
        const uint16_t ring = rejected ? C_CRIT : C_PAY;
        g->drawRoundRect(trackX, 0, trackW, trackH, 6, ring);
        g->drawRoundRect(trackX + 1, 1, trackW - 2, trackH - 2, 5, ring);
        float orem = rejected ? 0.0f : (1.0f - ov->overageUtil);
        if (orem < 0.0f) orem = 0.0f;
        if (orem > 1.0f) orem = 1.0f;
        const int oh = (int)(trackH * orem + 0.5f);
        if (oh > 0) g->fillRoundRect(trackX, trackH - oh, trackW, oh, 6, C_PAY);
        used = 1.0f - orem;
    } else if (valid) {
        float u = util < 0 ? 0 : (util > 100 ? 100 : util);
        int usedH = (int)(trackH * u / 100.0f + 0.5f);
        int fillH = trackH - usedH;
        if (fillH > 0) {
            uint16_t col = (e >= 0.0f) ? paceColor(u / 100.0f, e) : C_OK;
            g->fillRoundRect(trackX, usedH, trackW, fillH, 6, col);
        }
        if (days > 1) {
            for (int i = 1; i < days; i++) {
                g->drawFastHLine(trackX, trackH * i / days, trackW, C_BG);
            }
        }
        used = u / 100.0f;
    }
    if (used >= 0.0f && e >= 0.0f) {
        const int cy = (int)(trackH * e + 0.5f);
        drawPaceTick(trackX + trackW / 2, cy, C_BG, C_TEXT);
        uint16_t ccol;
        const char* word = paceWord(used, e, ccol);
        g->setFont(&fonts::Font2);
        g->setTextDatum(td);
        g->setTextColor(ccol, C_BG);
        g->drawString(word, textX, captionY(cy, primary, showReason));
    }

    if (overage) {
        // Blocked gets a mark too, not just a colour change: red-vs-blue alone
        // doesn't survive a glance from across the desk, a dimmed backlight, or
        // an eye that doesn't separate those two hues. The glyph carries the
        // state; the colour only reinforces it.
        drawToken(trackX + trackW / 2, rejected);
    }
}

// The bottom strip. Only boot still reads BtnA/B/C (factory reset), and it
// draws no labels. The dashboard has none: it reads raw taps, so it needs no
// permanent legend and gets those 36 pixels back.
// The bottom strip's labels. Nothing calls it now that the PIN screen has a
// keypad -- kept because the setup and error screens may want it back, and
// because deleting the only reader of TOUCH_BTN_H would strand that constant.
__attribute__((unused))
static void drawButtonHints(const char* a, const char* b, const char* c) {
    const int y = SCREEN_H - TOUCH_BTN_H;
    g->fillRect(0, y, SCREEN_W, TOUCH_BTN_H, C_CARD);
    g->drawFastHLine(0, y, SCREEN_W, C_BG);
    g->setFont(&fonts::Font2);
    g->setTextDatum(middle_center);
    g->setTextColor(C_DIM, C_CARD);
    const char* labels[3] = {a, b, c};
    for (int i = 0; i < 3; i++) {
        int cx = SCREEN_W * (2 * i + 1) / 6;
        if (i > 0) g->drawFastVLine(SCREEN_W * i / 3, y + 6, TOUCH_BTN_H - 12, C_BG);
        if (labels[i] && labels[i][0]) g->drawString(labels[i], cx, y + TOUCH_BTN_H / 2);
    }
}

// ── Public screens ────────────────────────────────────────

void uiInit() {
    initPalette();

    canvas.setPsram(true);
    canvas.setColorDepth(16);
    if (canvas.createSprite(SCREEN_W, SCREEN_H)) {
        g = &canvas;
        useSprite = true;
    } else {
        // Not fatal. Everything below draws through g either way.
        Serial.println("[UI] sprite alloc failed — drawing direct, expect flicker");
        g = &lcd;
        useSprite = false;
    }
    g->fillScreen(C_BG);
    flush();
}

void uiSetHeaderLabel(const char* name) {
    if (!name || !name[0]) {
        strlcpy(s_headerLabel, "USAGE-CHAN", sizeof(s_headerLabel));
        return;
    }
    strlcpy(s_headerLabel, name, sizeof(s_headerLabel));
    for (char* p = s_headerLabel; *p; p++) *p = toupper((unsigned char)*p);
}

void uiBootProgress(int percent, const char* label) {
    g->fillScreen(C_BG);

    g->setFont(&fonts::FreeSansBold18pt7b);
    g->setTextDatum(middle_center);
    g->setTextColor(C_ACCENT, C_BG);
    g->drawString("Usage-Chan", SCREEN_W / 2, 82);

    g->setFont(&fonts::Font2);
    g->setTextColor(C_DIM, C_BG);
    g->drawString(FW_VERSION, SCREEN_W / 2, 110);

    const int bx = 50, bw = SCREEN_W - 100, bh = 8, by = 150;
    g->fillRoundRect(bx, by, bw, bh, 3, C_CARD);
    int fw = bw * (percent < 0 ? 0 : percent > 100 ? 100 : percent) / 100;
    if (fw > 0) g->fillRoundRect(bx, by, fw, bh, 3, C_ACCENT);

    g->setTextColor(C_DIM, C_BG);
    g->drawString(label ? label : "", SCREEN_W / 2, 178);
    flush();
}

void uiSetupScreen(const char* apName, const char* apPass, bool reconfigure) {
    g->fillScreen(C_BG);

    g->setFont(&fonts::Font2);
    g->setTextDatum(top_center);
    g->setTextColor(C_ACCENT, C_BG);
    g->drawString(reconfigure ? "RECONNECT WIFI" : "SETUP", SCREEN_W / 2, 12);

    g->setTextColor(C_DIM, C_BG);
    g->drawString("Join this WiFi network:", SCREEN_W / 2, 42);

    g->setFont(&fonts::FreeSansBold18pt7b);
    g->setTextColor(C_TEXT, C_BG);
    g->drawString(apName, SCREEN_W / 2, 66);

    g->setFont(&fonts::Font2);
    if (apPass && apPass[0]) {
        g->setTextColor(C_DIM, C_BG);
        g->drawString("password", SCREEN_W / 2, 112);
        g->setFont(&fonts::FreeSansBold18pt7b);
        g->setTextColor(C_TEXT, C_BG);
        g->drawString(apPass, SCREEN_W / 2, 132);
        g->setFont(&fonts::Font2);
    } else {
        g->setTextColor(C_DIM, C_BG);
        g->drawString("(open network)", SCREEN_W / 2, 118);
    }

    g->setTextColor(C_DIM, C_BG);
    g->drawString("then open", SCREEN_W / 2, 176);
    g->setTextColor(C_ACCENT, C_BG);
    g->drawString("http://192.168.4.1", SCREEN_W / 2, 194);
    flush();
}

void uiConnecting(const char* ssid, int attempt) {
    g->fillScreen(C_BG);
    g->setFont(&fonts::Font2);
    g->setTextDatum(middle_center);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("connecting to", SCREEN_W / 2, 92);

    g->setFont(&fonts::FreeSansBold18pt7b);
    g->setTextColor(C_TEXT, C_BG);
    g->drawString(ssid, SCREEN_W / 2, 120);

    // Three dots cycling, so a slow join looks alive rather than hung.
    g->setFont(&fonts::Font2);
    g->setTextColor(C_ACCENT, C_BG);
    char dots[4] = {0};
    int n = (attempt % 3) + 1;
    for (int i = 0; i < n; i++) dots[i] = '.';
    g->drawString(dots, SCREEN_W / 2, 156);
    flush();
}

// ── PIN keypad ────────────────────────────────────────────
// Ten targets instead of one. The old screen dialled each digit with
// BtnA/BtnB, which is up to nine taps a digit plus a confirm -- 40 taps at
// worst, and this device reboots every time it is flashed. A 320x240 touch
// panel can show a keypad; it just needs raw touch coordinates rather than
// the three synthesised zones. See "A real PIN keypad" in plan.md, parked
// since 2026-09-04.
//
// Keys are 96x46. 46px is about 7.3mm on this panel, which is the size the
// menu rows had to be before they were reliable to hit -- see "Touch targets
// need ~7mm" in docs/design-decisions.md. Four rows of them plus the dots is
// 238 of the 240 rows available, which is why there is no confirm key: the
// fourth digit submits, the way a phone lock screen does.
static constexpr int PIN_KEY_W = 96, PIN_KEY_H = 46;
static constexpr int PIN_KEY_GX = 8, PIN_KEY_GY = 2;
static constexpr int PIN_KEY_X0 = 8, PIN_KEY_Y0 = 48;
static constexpr int PIN_DOT_Y = 24, PIN_DOT_R = 7, PIN_DOT_PITCH = 34;

// Row-major: 1-9, then a gap, 0 and backspace. -1 is a dead cell.
static constexpr int PIN_KEYS[12] = { 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, UI_PIN_DEL };

static void pinKeyBox(int k, int& x, int& y) {
    x = PIN_KEY_X0 + (k % 3) * (PIN_KEY_W + PIN_KEY_GX);
    y = PIN_KEY_Y0 + (k / 3) * (PIN_KEY_H + PIN_KEY_GY);
}

int uiPinKeyAt(int tx, int ty) {
    for (int k = 0; k < 12; k++) {
        if (PIN_KEYS[k] < 0) continue;
        int x, y; pinKeyBox(k, x, y);
        if (tx >= x && tx < x + PIN_KEY_W && ty >= y && ty < y + PIN_KEY_H)
            return PIN_KEYS[k];
    }
    return -1;
}

// A backspace arrow: a left-pointing triangle with a body, tested per pixel
// the way drawMarkX is. Font2 is ASCII only, so the glyph cannot be typed,
// and three half-plane tests are less code than teaching the simulator a
// triangle primitive it has no other use for.
static void drawBackspace(int cx, int cy, uint16_t col) {
    const int h = 9, tip = 9, body = 11;      // half-height, arrow, tail
    for (int dy = -h; dy <= h; dy++) {
        const int ady = dy < 0 ? -dy : dy;
        // The arrowhead narrows to the left; the body is a plain rectangle.
        const int x0 = -tip + ady;
        for (int dx = x0; dx <= body; dx++)
            if (dx < 0 || ady <= h - 2) g->drawPixel(cx + dx, cy + dy, col);
    }
}

void uiPinScreen(int entered, int pressed) {
    g->fillScreen(C_BG);

    // Four dots, filled as digits land. No digit is ever shown: the old screen
    // had to show the one being edited because there was no other way to know
    // what you were dialling, which is not a property anyone wanted.
    const int x0 = SCREEN_W / 2 - (PIN_DOT_PITCH * 3) / 2;
    for (int i = 0; i < 4; i++) {
        const int cx = x0 + i * PIN_DOT_PITCH;
        if (i < entered) g->fillCircle(cx, PIN_DOT_Y, PIN_DOT_R, C_TEXT);
        else             g->drawCircle(cx, PIN_DOT_Y, PIN_DOT_R, C_DIM);
    }

    for (int k = 0; k < 12; k++) {
        const int val = PIN_KEYS[k];
        if (val < 0) continue;
        int x, y; pinKeyBox(k, x, y);
        const bool hot = (val == pressed);
        g->fillRoundRect(x, y, PIN_KEY_W, PIN_KEY_H, 8, hot ? C_ACCENT : C_CARD);
        if (val == UI_PIN_DEL) {
            drawBackspace(x + PIN_KEY_W / 2, y + PIN_KEY_H / 2,
                          hot ? C_BG : C_DIM);
        } else {
            char d[2] = { (char)('0' + val), 0 };
            g->setFont(&fonts::FreeSansBold18pt7b);
            g->setTextDatum(middle_center);
            g->setTextColor(hot ? C_BG : C_TEXT, hot ? C_ACCENT : C_CARD);
            g->drawString(d, x + PIN_KEY_W / 2, y + PIN_KEY_H / 2);
        }
    }
    flush();
}

void uiLockoutStatic(int attempts, int maxAttempts, int lockoutSec) {
    g->fillScreen(C_BG);
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_center);
    g->setTextColor(C_CRIT, C_BG);
    g->drawString("WRONG PIN", SCREEN_W / 2, 40);

    char s[48];
    snprintf(s, sizeof(s), "attempt %d of %d", attempts, maxAttempts);
    g->setTextColor(C_DIM, C_BG);
    g->drawString(s, SCREEN_W / 2, 66);
    g->drawString("locked for", SCREEN_W / 2, 108);
    flush();
}

void uiLockoutTick(int secondsLeft) {
    // Repaints only the number. A full redraw here would strobe once a second.
    const int y = 130, h = 52;
    g->fillRect(0, y, SCREEN_W, h, C_BG);
    char s[16];
    snprintf(s, sizeof(s), "%d:%02d", secondsLeft / 60, secondsLeft % 60);
    g->setFont(&fonts::FreeSansBold24pt7b);
    g->setTextDatum(top_center);
    g->setTextColor(C_TEXT, C_BG);
    g->drawString(s, SCREEN_W / 2, y);
    flush();
}

// A four-phase mark that advances on every redraw during a fetch. It can only
// animate because the fetch now runs on core 0 — on a blocked loop this would
// simply freeze, which is what made the whole idea need the threading first.
static void drawSpinner(int x, int y) {
    static uint8_t phase = 0;
    static const char* frames[4] = {"|", "/", "-", "\\"};
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_ACCENT, C_BG);
    g->drawString(frames[phase & 3], x, y);
    phase++;
}

// ── The smoke overlay ─────────────────────────────────────
// "The overlay scales with how much of the screen it invalidates." That line
// is from the display sketch and it is the whole rule. A single failed fetch
// invalidates nothing -- the numbers are exactly as true as they were a second
// before, and a five-minute-old reading is what this screen shows for most of
// every interval anyway. What earns an overlay is a condition that cannot get
// better on its own: the radio is down, so the next fetch cannot possibly
// succeed, or three attempts in a row have failed with the radio up, which is
// the far end rather than one bad request.
//
// It veils rather than hides. The numbers behind it are still true, just
// ageing, and covering them would claim we know less than we do. fillRectAlpha
// does the blend in one call -- a payoff from composing into a sprite, which
// was decided for an unrelated reason on the first day.
static constexpr int SMOKE_ALPHA = 150;   // of 255, over C_BG
static constexpr int SMOKE_LZ_W  = 224, SMOKE_LZ_H = 118;
static constexpr int SMOKE_ICON_S = 2;    // placeholder: the 32px icon, doubled

static void drawSmoke(int kind, const char* ageTxt) {
    if (kind == SMOKE_NONE) return;
    g->fillRectAlpha(0, 0, SCREEN_W, SCREEN_H, SMOKE_ALPHA, C_BG);

    const int x = (SCREEN_W - SMOKE_LZ_W) / 2, y = (SCREEN_H - SMOKE_LZ_H) / 2;
    g->fillRoundRect(x, y, SMOKE_LZ_W, SMOKE_LZ_H, 14, C_CARD);
    g->drawRoundRect(x, y, SMOKE_LZ_W, SMOKE_LZ_H, 14, C_DIM);

    // Placeholders, and they say so by being the small icons doubled: the
    // no-network one is the strike-through glyph the control column already
    // draws, and the API one is the failed-refresh mark. Both mean the right
    // thing at the wrong resolution. Drawing them at 64 wants 80x80 frames,
    // which icons2c.py will take whenever they exist.
    const Icon& ic = (kind == SMOKE_NO_WIFI) ? ICON_WIFI_OUT : ICON_REFRESH_FAIL;
    const int iw = ic.w * SMOKE_ICON_S, ih = ic.h * SMOKE_ICON_S;
    drawIconScaled(x + (SMOKE_LZ_W - iw) / 2, y + 10, ic, C_DIM, SMOKE_ICON_S);

    g->setFont(&fonts::FreeSansBold12pt7b);
    g->setTextDatum(top_center);
    g->setTextColor(C_TEXT, C_CARD);
    g->drawString(kind == SMOKE_NO_WIFI ? "no network" : "API not answering",
                  SCREEN_W / 2, y + 12 + ih);

    if (ageTxt && ageTxt[0]) {
        char line[32];
        snprintf(line, sizeof(line), "readings %s old", ageTxt);
        g->setFont(&fonts::Font2);
        g->setTextColor(C_DIM, C_CARD);
        g->drawString(line, SCREEN_W / 2, y + 36 + ih);
    }
}

void uiDashboard(const UsageData& data, unsigned long lastAttemptMs, int rssi,
                 int batPct, bool fetching, int pollSec, bool refreshFailed,
                 bool refreshFailing, int smoke, const char* ageTxt) {
    g->fillScreen(C_BG);

    // Vertical layout, 2026-09-19 — two columns side by side instead of two
    // bars stacked; see the decision log in plan.md and drawVBar() above for
    // the reasoning. The 7-day window is promoted to the wide column only
    // when the server says it is the binding constraint — 23% of requests in
    // a large capture — so most of the time the 5-hour window gets it.
    const bool sevenBinds = data.ok && strncmp(data.claim, "seven_day", 9) == 0;

    if (sevenBinds) {
        drawVBar(false, "5-HOUR", data.h5, data.h5ResetEpoch, WIN_5H, data.ok, 1, nullptr);
        drawVBar(true,  "7-DAY",  data.d7, data.d7ResetEpoch, WIN_7D, data.ok, 7, &data);
    } else {
        drawVBar(true,  "5-HOUR", data.h5, data.h5ResetEpoch, WIN_5H, data.ok, 1, &data);
        drawVBar(false, "7-DAY",  data.d7, data.d7ResetEpoch, WIN_7D, data.ok, 7, nullptr);
    }

    // Three circles: menu, signal, refresh. The first two are still discs
    // standing in for icons. The third is real as of 2026-09-20, and it is
    // the one that matters most -- a stale reading that looks fresh is the
    // failure this device exists to make visible, and a ring you can watch
    // fill says when the next reading is due without spending a line of text
    // on it. See docs/design-decisions.md.
    drawIcon(V_CTRL_X, V_CIRCLE_Y[0], ICON_MENU, C_CTRL);
    drawIcon(V_CTRL_X, V_CIRCLE_Y[1], wifiIcon(rssi), C_CTRL);

    float frac = 1.0f;
    if (pollSec > 0 && lastAttemptMs != 0)
        frac = (float)(millis() - lastAttemptMs) / ((float)pollSec * 1000.0f);
    drawRefreshIndicator(V_CIRCLE_Y[2], fetching, frac, refreshFailed,
                         refreshFailing);

    // Last, over everything, including the control column: what it says is
    // true of the whole screen. The menu button keeps working through it --
    // the overlay is not modal, and the menu is where the cause and any fix
    // will live.
    drawSmoke(smoke, ageTxt);
    flush();
}

// ── Menu ──────────────────────────────────────────────────
const char* const kMenuRows[MENU_ROWS] = {
    "Brightness",
    "Refresh interval",
    "Network",
    "Control panel",
};

// Geometry shared by the drawing and the hit test, so they cannot disagree.
//
// 34px rows were too small to hit reliably on hardware. This panel is about
// 160 px/inch, so 34px is ~5.4mm — well under the ~7mm a fingertip wants. 46px
// is ~7.3mm. Five comfortable rows do not fit 240px and four do, so the menu
// paid for the size with a row rather than with its margins; the version moved
// into the header, which is where an "About" row was headed anyway.
static constexpr int MENU_TOP   = 48;
static constexpr int MENU_ROW_H = 46;
static constexpr int MENU_X     = 20;
static constexpr int MENU_W     = SCREEN_W - 40;

int uiMenuRowAt(int x, int y) {
    if (x < MENU_X || x > MENU_X + MENU_W) return -1;
    if (y < MENU_TOP) return -1;
    int row = (y - MENU_TOP) / MENU_ROW_H;
    return (row >= 0 && row < MENU_ROWS) ? row : -1;
}

// Brightness is chosen, not cycled. Five dots at the right end of the row, the
// live one filled; tapping a dot applies it at once, so you pick by looking at
// the screen rather than by counting taps. Each dot owns a 36px-wide column
// spanning the full row height, about 5.7mm by 7.3mm on this panel. 40px
// columns ran the first dot into the "Brightness" label.
static constexpr int DOT_PITCH = 36;
static constexpr int DOT_X0    = MENU_X + MENU_W - 10 - DOT_PITCH * BRIGHTNESS_LEVELS + DOT_PITCH / 2;

int uiMenuBrightnessDotAt(int x) {
    int rel = x - (DOT_X0 - DOT_PITCH / 2);
    if (rel < 0) return -1;
    int i = rel / DOT_PITCH;
    return i < BRIGHTNESS_LEVELS ? i : -1;
}

static void drawBrightnessDots(int cy, uint8_t level, bool rowLit) {
    const uint16_t ink = rowLit ? C_BG : C_TEXT;
    for (int i = 0; i < BRIGHTNESS_LEVELS; i++) {
        int cx = DOT_X0 + i * DOT_PITCH;
        if (i == level) g->fillCircle(cx, cy, 7, ink);
        else            g->drawCircle(cx, cy, 6, ink);
    }
}

void uiMenu(int highlight, uint8_t brightness) {
    g->fillScreen(C_BG);

    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("Usage-Chan " FW_VERSION, MENU_X, 18);
    g->setTextDatum(top_right);
    g->drawString("tap outside to close", MENU_X + MENU_W, 18);

    for (int i = 0; i < MENU_ROWS; i++) {
        int y = MENU_TOP + i * MENU_ROW_H;
        bool on = (i == highlight);
        g->fillRoundRect(MENU_X, y + 3, MENU_W, MENU_ROW_H - 6, 6,
                         on ? C_ACCENT : C_CARD);
        g->setTextDatum(middle_left);
        g->setTextColor(on ? C_BG : C_TEXT, on ? C_ACCENT : C_CARD);
        g->drawString(kMenuRows[i], MENU_X + 16, y + MENU_ROW_H / 2);
        if (i == 0) drawBrightnessDots(y + MENU_ROW_H / 2, brightness, on);
    }
    flush();
}

void uiError(const char* title, const char* detail) {
    g->fillScreen(C_BG);
    g->setFont(&fonts::FreeSansBold18pt7b);
    g->setTextDatum(middle_center);
    g->setTextColor(C_CRIT, C_BG);
    g->drawString(title, SCREEN_W / 2, 100);
    if (detail && detail[0]) {
        g->setFont(&fonts::Font2);
        g->setTextColor(C_DIM, C_BG);
        g->drawString(detail, SCREEN_W / 2, 140);
    }
    flush();
}

// The dashboard's one touch target. Everything else on that screen is inert
// for now: a tap anywhere used to open the menu, which made the circles look
// decorative and left no room for the other two to mean anything.
bool uiMenuButtonHit(int x, int y) {
    return x >= V_MENU_HIT_L && x < V_MENU_HIT_R &&
           y >= V_MENU_HIT_T && y < V_MENU_HIT_B;
}
