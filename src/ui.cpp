/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 */
#include "ui.h"
#include "hal.h"
#include "config.h"
#include <Arduino.h>
#include <time.h>

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

// Bands are deliberately generous at the low end. A 5-hour window at 55% is
// not worth alarming about; at 85% it is.
static uint16_t barColor(float pct) {
    if (pct >= 85.0f) return C_CRIT;
    if (pct >= 60.0f) return C_WARN;
    return C_OK;
}

// ── Helpers ───────────────────────────────────────────────

// Renders the time left until a reset epoch as "3d 4h", "2h 14m" or "9m".
// Returns false when there is nothing truthful to say — no epoch from the API,
// or the clock has not been set — and the caller then draws a dash rather
// than a plausible-looking wrong number.
static bool fmtCountdown(uint32_t resetEpoch, char* out, size_t n) {
    if (resetEpoch == 0) return false;
    time_t now = time(nullptr);
    if (now < 1700000000) return false;      // NTP has not landed yet
    long secs = (long)resetEpoch - (long)now;
    if (secs <= 0) { snprintf(out, n, "due"); return true; }

    long mins = secs / 60;
    long hours = mins / 60;
    long days = hours / 24;
    if (days > 0)       snprintf(out, n, "%ldd %ldh", days, hours % 24);
    else if (hours > 0) snprintf(out, n, "%ldh %02ldm", hours, mins % 60);
    else                snprintf(out, n, "%ldm", mins);
    return true;
}

static void drawHeader(int rssi, int batPct) {
    g->fillRect(0, 0, SCREEN_W, 26, C_CARD);
    g->setFont(&fonts::Font2);
    g->setTextDatum(middle_left);
    g->setTextColor(C_ACCENT, C_CARD);
    g->drawString(s_headerLabel, 10, 13);

    // Right side: signal bars then battery, laid out from the right edge in.
    int x = SCREEN_W - 10;

    if (batPct >= 0) {
        char b[8];
        snprintf(b, sizeof(b), "%d%%", batPct);
        g->setTextDatum(middle_right);
        g->setTextColor(batPct <= 15 ? C_CRIT : C_DIM, C_CARD);
        g->drawString(b, x, 13);
        x -= g->textWidth(b) + 10;
    }

    // Four bars. RSSI of 0 means "not connected" as far as this screen cares.
    int bars = 0;
    if (rssi != 0) {
        if      (rssi > -60) bars = 4;
        else if (rssi > -70) bars = 3;
        else if (rssi > -80) bars = 2;
        else                 bars = 1;
    }
    for (int i = 0; i < 4; i++) {
        int h = 4 + i * 3;
        g->fillRect(x - 22 + i * 6, 18 - h, 4, h, i < bars ? C_TEXT : C_DIM);
    }
}

// One usage block: label, big percentage, bar, countdown.
static void drawUsageBlock(int y, const char* label, float pct,
                           uint32_t resetEpoch, bool valid) {
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    g->drawString(label, 14, y);

    g->setTextDatum(top_right);
    if (valid) {
        char v[12];
        // One decimal below 10% so a nearly-fresh window still visibly moves;
        // whole numbers above that, where a tenth is noise.
        if (pct < 10.0f) snprintf(v, sizeof(v), "%.1f%%", pct);
        else             snprintf(v, sizeof(v), "%.0f%%", pct);
        g->setFont(&fonts::FreeSansBold24pt7b);
        g->setTextColor(C_TEXT, C_BG);
        g->drawString(v, SCREEN_W - 14, y - 6);
    } else {
        g->setFont(&fonts::FreeSansBold24pt7b);
        g->setTextColor(C_DIM, C_BG);
        g->drawString("--", SCREEN_W - 14, y - 6);
    }

    // Bar
    const int bx = 14, bw = SCREEN_W - 28, bh = 14;
    const int by = y + 44;
    g->fillRoundRect(bx, by, bw, bh, 4, C_CARD);
    if (valid && pct > 0.0f) {
        float p = pct > 100.0f ? 100.0f : pct;
        int fw = (int)(bw * p / 100.0f + 0.5f);
        if (fw < 5) fw = 5;              // a sliver still reads as "some"
        g->fillRoundRect(bx, by, fw, bh, 4, barColor(pct));
    }

    // Countdown
    char cd[24];
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    g->setTextColor(C_DIM, C_BG);
    if (valid && fmtCountdown(resetEpoch, cd, sizeof(cd))) {
        char line[40];
        snprintf(line, sizeof(line), "resets in %s", cd);
        g->drawString(line, 14, by + bh + 4);
    } else {
        g->drawString("reset unknown", 14, by + bh + 4);
    }
}

// The bottom strip. This is not decoration: it is the only thing telling the
// user where the invisible touch buttons are, since CoreS3 has no real ones.
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

void uiDashboard(const UsageData& data, unsigned long lastFetchMs, int rssi, int batPct) {
    g->fillScreen(C_BG);
    drawHeader(rssi, batPct);

    drawUsageBlock(34,  "5-HOUR WINDOW", data.h5, data.h5ResetEpoch, data.ok);
    drawUsageBlock(120, "7-DAY WINDOW",  data.d7, data.d7ResetEpoch, data.ok);

    // Status line. When the headers went missing this is the only place that
    // says so, and plan.md asks for that failure to be visible rather than
    // silently showing stale bars.
    g->setFont(&fonts::Font2);
    g->setTextDatum(top_left);
    if (data.ok) {
        unsigned long age = (millis() - lastFetchMs) / 1000UL;
        char s[40];
        if (age < 90) snprintf(s, sizeof(s), "updated %lus ago", age);
        else          snprintf(s, sizeof(s), "updated %lum ago", age / 60);
        g->setTextColor(C_DIM, C_BG);
        g->drawString(s, 14, 206 - 22);
    } else {
        g->setTextColor(C_CRIT, C_BG);
        char s[64];
        snprintf(s, sizeof(s), "no data: %s", data.error);
        g->drawString(s, 14, 206 - 22);
    }

    drawButtonHints("DIM", "REFRESH", "");
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
