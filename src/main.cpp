/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * usage-chan — Claude usage on a Stack-Chan (M5Stack CoreS3).
 *
 * Structure follows claude-usage-stick's main.cpp (MIT, oauramos), reduced to
 * the single-screen path: no carousel, no web panel, no history, no news.
 *
 * Controls. The board's physical buttons are reset (invisible to firmware) and
 * soft power (M5.BtnPWR, unused so far), so everything happens on the panel.
 * Two input styles coexist deliberately:
 *
 *   Boot uses BtnA/B — M5Unified's synthesised zones along the bottom 36px,
 *   unlabelled.
 *     Boot        hold left + middle for 2s = factory reset (wipes NVS)
 *
 *   PIN entry, dashboard and menu read RAW touch coordinates, so the keypad
 *   gets ten real targets, the menu button is a real target, and there is no
 *   permanent button strip eating 36 pixels.
 *     PIN entry   a 3x4 keypad; the fourth digit submits
 *     Dashboard   tap the menu button (top right) = open menu
 *     Menu        tap a brightness dot = set · tap the X or outside the row = close
 */

#include "hal.h"
#include "ui.h"
#include "config.h"
#include "crypto.h"
#include "settings.h"
#include "app_state.h"
#include "provision.h"
#include "api.h"
#include "fetcher.h"
#include "clock.h"
#include <WiFi.h>

enum Screen : uint8_t { SCREEN_DASH, SCREEN_MENU };
static Screen s_screen = SCREEN_DASH;

Settings      g_settings;
UsageData     g_usage;
char          g_token[256];
bool          g_unlocked = false;
unsigned long g_lastFetchMs = 0;

// ── PIN entry (blocks until four digits are confirmed) ────
static void enterPin(char* pinOut, int maxLen) {
    char buf[5] = {0};
    int  n = 0, pressed = -1;
    uiPinScreen(0);
    while (n < 4) {
        halUpdate();
        if (M5.Touch.getCount()) {
            auto t = M5.Touch.getDetail(0);
            if (t.isPressed()) {
                // Redraw only when the finger moves to a different key, so a
                // held touch is not a redraw loop.
                const int k = uiPinKeyAt(t.x, t.y);
                if (k != pressed) { pressed = k; uiPinScreen(n, pressed); }
            } else if (t.wasClicked()) {
                const int k = uiPinKeyAt(t.x, t.y);
                pressed = -1;
                if (k == UI_PIN_DEL) { if (n > 0) buf[--n] = '\0'; }
                else if (k >= 0 && n < 4) buf[n++] = (char)('0' + k);
                uiPinScreen(n);
            }
        }
        delay(10);
    }
    snprintf(pinOut, maxLen, "%s", buf);
}

// ── WiFi ──────────────────────────────────────────────────
static bool connectWiFi(const char* ssid, const char* pass) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);
    int ticks = 0;
    while (WiFi.status() != WL_CONNECTED) {
        ticks++;
        uiConnecting(ssid, ticks / 2);
        delay(500);
        if (ticks > WIFI_CONNECT_TIMEOUT_S * 2) return false;
    }
    return true;
}

static void makeApCreds(char* apName, size_t nameLen, char* apPass, size_t passLen) {
    uint8_t mac[6];
    esp_efuse_mac_get_default(mac);
    snprintf(apName, nameLen, "UsageChan-%02X%02X", mac[4], mac[5]);

    static const char alphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    uint8_t rnd[8];
    esp_fill_random(rnd, sizeof(rnd));
    size_t n = (passLen > 9) ? 8 : passLen - 1;
    for (size_t i = 0; i < n; i++) apPass[i] = alphabet[rnd[i] % (sizeof(alphabet) - 1)];
    apPass[n] = '\0';
}

// Asks the worker on core 0 for a fetch and returns immediately. Nothing here
// waits: the render loop keeps drawing, keeps reading touch, and keeps counting
// down while the request is in flight.
//
// Reconnecting WiFi used to happen here, inline, before every fetch. It now
// belongs to the worker's own WL_CONNECTED check — doing it on the render loop
// would reintroduce exactly the blocking this change removes.
#ifdef UI_TEST_STATES
// Test mode: `pio run -e stackchan-test -t upload`. The device boots, joins
// WiFi, and fetches as usual, but the dashboard draws canned readings in
// place of the real ones and steps to the next every few seconds. It exists
// because some states cannot be produced on demand: nobody has seen the
// extra-usage display on the device, since that takes a real trip past the
// limit. Each state's name goes to the serial log as it appears. Flash the
// plain `stackchan` env to go back.
struct TestState {
    const char* name;
    float h5, e5, d7, e7;      // percent used, and fraction of the window elapsed
    const char* claim;
    const char* overage;       // overage-status, or "" for none
    float overageUtil;
    const char* reason;
};
static const TestState TEST_STATES[] = {
    { "plenty left",               38, 0.52f,  31, 0.46f, "five_hour", "",                0,    "" },
    { "5-hour low, ahead of pace", 78, 0.50f,  55, 0.46f, "five_hour", "",                0,    "" },
    { "5-hour nearly out",         93, 0.97f,  55, 0.46f, "five_hour", "",                0,    "" },
    { "7-day binds, 22% left",     38, 0.52f,  78, 0.60f, "seven_day", "",                0,    "" },
    { "5-hour paying",            100, 0.80f,  31, 0.46f, "five_hour", "allowed",         0.4f, "" },
    { "5-hour near cap",          100, 0.80f,  31, 0.46f, "five_hour", "allowed_warning", 0.9f, "" },
    { "5-hour blocked",           100, 0.80f,  31, 0.46f, "five_hour", "rejected",        1.0f, "out_of_credits" },
    { "7-day paying",              38, 0.52f, 100, 0.80f, "seven_day", "allowed",         0.4f, "" },
    { "7-day blocked",             38, 0.52f, 100, 0.80f, "seven_day", "rejected",        1.0f, "out_of_credits" },
};
static constexpr unsigned long TEST_STATE_MS = 6000;

static void testUsage(UsageData& d) {
    static int shown = -1;
    const int n = sizeof(TEST_STATES) / sizeof(TEST_STATES[0]);
    const int i = (millis() / TEST_STATE_MS) % n;
    const TestState& t = TEST_STATES[i];
    if (i != shown) { Serial.printf("[TEST] %d/%d %s\n", i + 1, n, t.name); shown = i; }

    const uint32_t now = (uint32_t)time(nullptr);
    d = UsageData{};
    d.ok = true;
    d.h5 = t.h5;
    d.d7 = t.d7;
    d.h5ResetEpoch = now + (uint32_t)((1.0f - t.e5) * 5 * 3600);
    d.d7ResetEpoch = now + (uint32_t)((1.0f - t.e7) * 7 * 86400);
    strlcpy(d.claim, t.claim, sizeof(d.claim));
    d.overageActive = t.overage[0] != '\0';
    strlcpy(d.overageStatus, t.overage, sizeof(d.overageStatus));
    d.overageUtil = t.overageUtil;
    d.overageResetEpoch = now + 20UL * 86400UL;
    strlcpy(d.overageDisabledReason, t.reason, sizeof(d.overageDisabledReason));
}
#endif

static void requestRefresh() {
    fetcherRequest();
}

// ── PIN + decrypt. Ten failures wipe the credentials. ─────
static void unlockPhase(int progressPct) {
    uiBootProgress(progressPct, "Enter PIN...");
    delay(300);

    int attempts = 0;
    while (attempts < MAX_PIN_ATTEMPTS) {
        char pin[9];
        enterPin(pin, sizeof(pin));
        if (decryptToken(g_settings.blob, pin, g_token, sizeof(g_token))) break;

        attempts++;
        if (attempts >= MAX_PIN_ATTEMPTS) {
            uiError("MAX ATTEMPTS", "Wiping credentials...");
            settingsWipeAll();
            delay(3000);
            ESP.restart();
        }

        int lockSec = LOCKOUT_BASE_SEC * (1 << (attempts - 1));
        if (lockSec > 3600) lockSec = 3600;
        uiLockoutStatic(attempts, MAX_PIN_ATTEMPTS, lockSec);
        for (int s = lockSec; s > 0; s--) {
            uiLockoutTick(s);
            delay(1000);
        }
    }
    g_unlocked = true;

    // Drain the touch edge the last keypress left behind, so the dashboard
    // does not immediately read it as a tap on the menu button.
    for (int i = 0; i < 10; i++) { halUpdate(); delay(10); }
}

void setup() {
    Serial.begin(115200);
    halInit();
    uiInit();

    uiBootProgress(10, "Initializing...");
    delay(300);

    // Factory reset needs both zones held for a full 2s. A single snapshot
    // would fire on a stray touch during boot.
    halUpdate();
    if (halBtnAIsPressed() && halBtnBIsPressed()) {
        uiBootProgress(30, "Hold to reset...");
        bool held = true;
        for (int i = 0; i < 20 && held; i++) {
            delay(100);
            halUpdate();
            if (!halBtnAIsPressed() || !halBtnBIsPressed()) held = false;
        }
        if (held) {
            uiBootProgress(40, "Factory reset...");
            settingsWipeAll();
            uiError("NVS WIPED", "Rebooting...");
            delay(2000);
            ESP.restart();
        }
    }

    uiBootProgress(30, "Checking config...");
    if (!settingsIsProvisioned()) {
        uiBootProgress(50, "No config found");
        delay(400);
        char apName[24], apPass[9];
        makeApCreds(apName, sizeof(apName), apPass, sizeof(apPass));
        runProvisioningPortal(apName, apPass);   // never returns
        return;
    }

    settingsLoad(g_settings);
    halSetBrightness(g_settings.brightness);
    uiSetHeaderLabel(g_settings.devName);
    uiSetTimezoneKnown(g_settings.tzSet != 0);

    unlockPhase(60);

    uiBootProgress(80, "Connecting WiFi...");
    if (!connectWiFi(g_settings.ssid, g_settings.wifipass)) {
        // A dead network drops into the reconfigure portal rather than looping
        // through reboots forever. Token and PIN are kept.
        char apName[24], apPass[9];
        makeApCreds(apName, sizeof(apName), apPass, sizeof(apPass));
        runProvisioningPortal(apName, apPass, true);   // never returns
        return;
    }

    uiBootProgress(90, "Syncing time...");
    clockBegin();
    settingsApplyTZ(g_settings.tzMin);
    // Wait briefly for a first answer, but do not hang on it. clockTick() keeps
    // trying from loop(), so a slow NTP server delays the countdowns rather
    // than wedging the boot.
    for (int i = 0; i < 30 && !clockValid(); i++) { delay(100); clockTick(); }

    uiBootProgress(95, "Fetching usage...");
    apiDumpOverageCapture();
    fetcherBegin();
    requestRefresh();
}

void loop() {
    halUpdate();
    clockTick();

    // Read the published result. Never blocks for long; a missed frame just
    // redraws the values already on screen, which are still correct.
    fetcherSnapshot(g_usage, g_lastFetchMs);

    // ── Touch ──────────────────────────────────────────
    // Raw coordinates, not BtnA/B/C. The synthesised buttons still exist for
    // the PIN screen; the dashboard and menu read taps directly. The dashboard
    // has exactly one target, the menu button at the top of the control
    // column, and the menu closes on a tap outside its rows -- which is what a
    // tap on its X is, since the X sits above them.
    static int s_hot = -1;
    if (M5.Touch.getCount()) {
        auto t = M5.Touch.getDetail(0);
        if (s_screen == SCREEN_MENU) {
            if (t.isPressed()) {
                int row = uiMenuRowAt(t.x, t.y);
                if (row != s_hot) { s_hot = row; uiMenu(s_hot, g_settings.brightness); }
            } else if (t.wasClicked()) {
                int row = uiMenuRowAt(t.x, t.y);
                s_hot = -1;
                if (row < 0) {
                    s_screen = SCREEN_DASH;              // the X, or anywhere outside
                } else if (row == 0) {
                    // Brightness is chosen from a row of dots, applied at once
                    // and persisted. A tap on the row's label does nothing.
                    int dot = uiMenuBrightnessDotAt(t.x);
                    if (dot >= 0) {
                        g_settings.brightness = (uint8_t)dot;
                        halSetBrightness(g_settings.brightness);
                        settingsPutU8("bright5", g_settings.brightness);
                    }
                    uiMenu(-1, g_settings.brightness);
                }
            }
        } else if (t.wasClicked() && uiMenuButtonHit(t.x, t.y)) {
            s_screen = SCREEN_MENU;
            s_hot = -1;
            uiMenu(-1, g_settings.brightness);
        }
    }

    // Schedule from the last ATTEMPT, not the last success. g_lastFetchMs only
    // advances when a fetch works, so keying off it meant a failing device
    // asked again on every pass of loop() -- against an endpoint the comments
    // in fetcher.h are careful to say rate-limits hard. Found 2026-09-20 while
    // building the indicator that would have shown it.
    const unsigned long lastTry = fetcherLastAttemptMs();
    if (!fetcherBusy() &&
        (lastTry == 0 || millis() - lastTry >= (unsigned long)g_settings.pollSec * 1000UL)) {
        requestRefresh();
    }

    // Redraw the dashboard about three times a second while a fetch is running
    // so the spinner turns, and once a second otherwise for the countdowns.
    static unsigned long lastRedraw = 0;
    unsigned long interval = fetcherBusy() ? 300 : 1000;
    if (s_screen == SCREEN_DASH && millis() - lastRedraw > interval) {
        // A connected radio always reports a negative dBm, so 0 is the
        // "no link" signal the wifi glyph reads. WiFi.RSSI() on a dropped
        // connection is not reliably anything in particular.
        // The ring counts down to the next attempt, so it is fed attempt time.
        // The fail mark shows for a few seconds after an attempt that did not
        // work, then gives way to that countdown.
        const bool failing = fetcherLastError()[0] != '\0' && lastTry != 0;
        const bool failed  = failing && millis() - lastTry < UI_FAIL_HOLD_MS;

        // Smoke, for the two conditions that cannot get better on their own.
        // The radio gets a few seconds' grace first. ESP32 links drop and come
        // back on their own, and a screen that veils itself for four seconds
        // and then clears does not teach you to ignore that warning -- it
        // teaches you the device is unreliable, which is a debt paid back
        // against everything else it says.
        static unsigned long s_linkLostMs = 0;
        const bool linked = WiFi.isConnected();
        if (linked) s_linkLostMs = 0;
        else if (!s_linkLostMs) s_linkLostMs = millis();

        int smoke = SMOKE_NONE;
        if (!linked && millis() - s_linkLostMs >= SMOKE_WIFI_GRACE_MS) smoke = SMOKE_NO_WIFI;
        else if (linked && fetcherFailStreak() >= SMOKE_API_FAILS)     smoke = SMOKE_NO_API;

        char age[16] = {0};
        const int32_t ageSec = fetcherAgeSec();
        if (ageSec >= 0) {
            if (ageSec < 90)        snprintf(age, sizeof(age), "%ds", (int)ageSec);
            else if (ageSec < 5400) snprintf(age, sizeof(age), "%dm", (int)(ageSec / 60));
            else                    snprintf(age, sizeof(age), "%dh", (int)(ageSec / 3600));
        }

#ifdef UI_TEST_STATES
        UsageData shown;
        testUsage(shown);
#else
        const UsageData& shown = g_usage;
#endif
        uiDashboard(shown, lastTry,
                    linked ? WiFi.RSSI() : 0, halBatPercent(),
                    fetcherBusy(), g_settings.pollSec, failed, failing,
                    smoke, age);
        lastRedraw = millis();
    }

    delay(20);
}
