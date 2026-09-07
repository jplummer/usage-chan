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
static uint16_t C_BG, C_CARD, C_TEXT, C_DIM, C_ACCENT, C_OK, C_WARN, C_CRIT;

static void initPalette() {
    C_BG     = lcd.color565(0x14, 0x11, 0x0F);
    C_CARD   = lcd.color565(0x24, 0x1F, 0x1B);
    C_TEXT   = lcd.color565(0xE8, 0xE3, 0xDD);
    C_DIM    = lcd.color565(0x8A, 0x81, 0x7A);
    C_ACCENT = lcd.color565(0xD9, 0x77, 0x57);   // Claude clay
    C_OK     = lcd.color565(0x5F, 0xA6, 0x72);
    C_WARN   = lcd.color565(0xD9, 0xA4, 0x41);
    C_CRIT   = lcd.color565(0xD9, 0x56, 0x4F);
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

// One window as a full bar. The bar IS the window: its left edge is when the
// window opened, its right edge is both exhaustion and reset. Remaining budget
// is anchored right, so spending pushes its left edge rightward — and the pace
// tick travels rightward too. Time flies like an arrow.
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
        if (e >= 0.0f) drawPaceTick(bx + (int)(bw * e + 0.5f), by + bh / 2, C_BG, C_TEXT);
    }

    // Footnote: the clock while there is plenty, a proximity warning when there
    // is not. "nearly out" claims closeness, not a fraction, so it cannot be
    // wrong by a factor of two the way "about a third left" was.
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_right);
    if (valid && plenty && haveReset) {
        char line[32];
        snprintf(line, sizeof(line), "resets %s", resetTxt);
        g->setTextColor(C_DIM, C_BG);
        g->drawString(line, bx + bw, by + bh + 8);
    } else if (valid && rem < 12.0f) {
        g->setTextColor(C_WARN, C_BG);
        g->drawString("nearly out", bx + bw, by + bh + 8);
    }
}

// The 7-day window as one quiet line. It moves 1% per 100 minutes, so a bar for
// it is seen hundreds of times per window looking identical every time — the
// wallpaper an ambient display gets tuned out and then unplugged for.
//
// The pace phrase describes NOW, not Friday, so it is provisional without
// needing an "at your current pace" hedge that would be too long to glance at.
static void drawSevenDayLine(int y, const UsageData& d) {
    const int bx = 16, bw = SCREEN_W - 32;
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("7-DAY", bx, y);

    if (!d.ok) return;

    float e = elapsedFraction(d.d7ResetEpoch, WIN_7D);
    if (e >= 0.0f) {
        float diff = (d.d7 / 100.0f) - e;
        const char* phrase = diff > 0.02f ? "ahead of pace"
                           : diff < -0.02f ? "behind pace" : "on pace";
        g->setTextColor(diff > 0.15f ? C_CRIT : diff > 0.02f ? C_WARN : C_DIM, C_BG);
        g->drawString(phrase, bx + 58, y);
    }

    char resetTxt[24];
    if (fmtReset(d.d7ResetEpoch, resetTxt, sizeof(resetTxt), true)) {
        char line[32];
        snprintf(line, sizeof(line), "resets %s", resetTxt);
        g->setTextDatum(top_right);
        g->setTextColor(C_DIM, C_BG);
        g->drawString(line, bx + bw, y);
    }
}

// The bottom strip, used only by the screens that still drive BtnA/B/C — PIN
// entry and boot. The dashboard has none: it reads raw taps, so it needs no
// permanent legend and gets those 36 pixels back.
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
    g->drawString("usage-chan", SCREEN_W / 2, 82);

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

void uiPinScreen(int pos, const int digits[4]) {
    g->fillScreen(C_BG);

    g->setFont(&fonts::Font2);
    g->setTextDatum(top_center);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("ENTER PIN", SCREEN_W / 2, 30);

    // Four boxes. Digits already confirmed are masked; the one being edited
    // shows its value, because otherwise there is no way to dial it in.
    const int bw = 46, bh = 62, gap = 14;
    const int total = bw * 4 + gap * 3;
    const int x0 = (SCREEN_W - total) / 2;
    const int y0 = 66;

    for (int i = 0; i < 4; i++) {
        int x = x0 + i * (bw + gap);
        bool active = (i == pos);
        g->fillRoundRect(x, y0, bw, bh, 6, C_CARD);
        if (active) g->drawRoundRect(x, y0, bw, bh, 6, C_ACCENT);

        g->setTextDatum(middle_center);
        if (i < pos) {
            g->setTextColor(C_DIM, C_CARD);
            g->fillCircle(x + bw / 2, y0 + bh / 2, 6, C_DIM);
        } else if (active) {
            char d[2] = {(char)('0' + digits[i]), 0};
            g->setFont(&fonts::FreeSansBold24pt7b);
            g->setTextColor(C_TEXT, C_CARD);
            g->drawString(d, x + bw / 2, y0 + bh / 2);
            g->setFont(&fonts::Font2);
        }
    }

    g->setTextDatum(top_center);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("touch the labels below", SCREEN_W / 2, y0 + bh + 18);

    drawButtonHints("+1", "NEXT", "");
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

void uiDashboard(const UsageData& data, unsigned long lastFetchMs, int rssi,
                 int batPct, bool fetching) {
    g->fillScreen(C_BG);

    // No title stripe, no button row. Those cost 62 of 240 pixels — 26% of the
    // screen — telling you the device's name and where to tap. Tap anywhere.
    //
    // The 7-day window is promoted to a full bar only when the server says it
    // is the binding constraint. That was 23% of requests in a large capture,
    // so most of the time the 5-hour window gets the display to itself.
    const bool sevenBinds = data.ok && strncmp(data.claim, "seven_day", 9) == 0;

    // Vertical placement. Content ran 56..200 against a 240px panel, leaving
    // 56 above and 40 below — visibly bottom-heavy. Shifted up 12px, which also
    // nudges past geometric centre: the bar carries the visual mass, and optical
    // centre for a heavy element sits slightly above the middle.
    if (sevenBinds) {
        drawWindowBar(22,  "5-HOUR", data.h5, data.h5ResetEpoch, WIN_5H, data.ok);
        drawWindowBar(122, "7-DAY",  data.d7, data.d7ResetEpoch, WIN_7D, data.ok);
    } else {
        drawWindowBar(50, "5-HOUR", data.h5, data.h5ResetEpoch, WIN_5H, data.ok);
        drawSevenDayLine(174, data);
    }

    // Failure is graded by how much of the screen it makes untrue, and staleness
    // is stated here in words rather than implied by a colour somewhere small.
    // A number that was right twelve minutes ago is still worth reading; the
    // reader just has to know it is twelve minutes old.
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);

    const int32_t age = fetcherAgeSec();
    const char*   err = fetcherLastError();

    if (age < 0) {
        g->setTextColor(C_DIM, C_BG);
        g->drawString(err[0] ? "no reading yet — retrying" : "waiting for first reading",
                      16, 216);
    } else {
        char sline[64];
        char ago[16];
        if (age < 90) snprintf(ago, sizeof(ago), "%ds", (int)age);
        else          snprintf(ago, sizeof(ago), "%dm", (int)(age / 60));

        if (err[0]) {
            // Stale: real numbers, failing refresh. Both facts, in that order,
            // because the numbers are what the reader came for.
            snprintf(sline, sizeof(sline), "%s old — can't refresh (%s)", ago, err);
            g->setTextColor(C_WARN, C_BG);
        } else {
            snprintf(sline, sizeof(sline), "updated %s ago", ago);
            g->setTextColor(C_DIM, C_BG);
        }
        g->drawString(sline, 16, 216);
    }

    if (fetching) drawSpinner(SCREEN_W - 26, 216);
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

void uiMenu(int highlight) {
    g->fillScreen(C_BG);

    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString("usage-chan " FW_VERSION, MENU_X, 18);
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
