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
 *   PIN entry and boot use BtnA/B/C — M5Unified's three synthesised zones along
 *   the bottom 36px, which every such screen labels.
 *     PIN entry   left = next digit value, middle = confirm digit
 *     Boot        hold left + middle for 2s = factory reset (wipes NVS)
 *
 *   Dashboard and menu read RAW touch coordinates, so a tap anywhere opens the
 *   menu and there is no permanent button strip eating 36 pixels.
 *     Dashboard   tap anywhere = open menu
 *     Menu        tap a row = act · tap outside the rows = close
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
    int digits[4] = {0, 0, 0, 0};
    int pos = 0;
    while (pos < 4) {
        uiPinScreen(pos, digits);
        while (true) {
            halUpdate();
            if (halBtnAWasPressed()) { digits[pos] = (digits[pos] + 1) % 10; break; }
            if (halBtnBWasPressed()) { pos++; break; }
            delay(20);
        }
    }
    snprintf(pinOut, maxLen, "%d%d%d%d", digits[0], digits[1], digits[2], digits[3]);
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

    // Drain the button edges the last confirm left behind, so the dashboard
    // does not immediately act on a phantom press.
    halUpdate();
    halBtnAWasPressed();
    halBtnBWasPressed();
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
    g_settings.brightness = halBootBrightness(g_settings.brightness);
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
    // the PIN screen, but the dashboard and menu read taps directly so a tap
    // anywhere can open the menu.
    static int s_hot = -1;
    if (M5.Touch.getCount()) {
        auto t = M5.Touch.getDetail(0);
        if (s_screen == SCREEN_MENU) {
            if (t.isPressed()) {
                int row = uiMenuRowAt(t.x, t.y);
                if (row != s_hot) { s_hot = row; uiMenu(s_hot); }
            } else if (t.wasClicked()) {
                int row = uiMenuRowAt(t.x, t.y);
                s_hot = -1;
                if (row < 0) {
                    s_screen = SCREEN_DASH;              // tap outside closes
                } else if (row == 0) {
                    // Brightness is wired because it worked before the menu
                    // existed; orphaning it would be a regression. The rest are
                    // deliberately inert until the settings work lands.
                    g_settings.brightness = halNextBrightness(g_settings.brightness);
                    halSetBrightness(g_settings.brightness);
                    settingsPutInt("brightness", g_settings.brightness);
                    uiMenu(-1);
                } else {
                    Serial.printf("[MENU] %s (not wired up yet)\n", kMenuRows[row]);
                    uiMenu(-1);
                }
            }
        } else if (t.wasClicked()) {
            s_screen = SCREEN_MENU;
            s_hot = -1;
            uiMenu(-1);
        }
    }

    if (millis() - g_lastFetchMs >= (unsigned long)g_settings.pollSec * 1000UL) {
        requestRefresh();
    }

    // Redraw the dashboard about three times a second while a fetch is running
    // so the spinner turns, and once a second otherwise for the countdowns.
    static unsigned long lastRedraw = 0;
    unsigned long interval = fetcherBusy() ? 300 : 1000;
    if (s_screen == SCREEN_DASH && millis() - lastRedraw > interval) {
        uiDashboard(g_usage, g_lastFetchMs, WiFi.RSSI(), halBatPercent(),
                    fetcherBusy());
        lastRedraw = millis();
    }

    delay(20);
}
