/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * usage-chan — Claude usage on a Stack-Chan (M5Stack CoreS3).
 *
 * Structure follows claude-usage-stick's main.cpp (MIT, oauramos), reduced to
 * the single-screen path: no carousel, no web panel, no history, no news.
 *
 * Controls — the three "buttons" are the left, middle and right thirds of the
 * bottom 36 pixels of the touchscreen. There are no physical buttons on this
 * board; the bottom strip of every screen labels them.
 *   PIN entry   left = next digit value, middle = confirm digit
 *   Dashboard   left = brightness, middle = refresh now
 *   Boot        hold left + middle for 2s = factory reset (wipes NVS)
 */

#include "hal.h"
#include "ui.h"
#include "config.h"
#include "crypto.h"
#include "settings.h"
#include "app_state.h"
#include "provision.h"
#include "api.h"
#include <WiFi.h>

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

// The reset countdowns are the only thing that needs a real clock, and they
// need it before the first fetch is drawn.
static void syncTime() {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    struct tm t;
    getLocalTime(&t, 5000);
}

static void refresh() {
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi(g_settings.ssid, g_settings.wifipass);
    }
    fetchUsage(g_token, g_usage);
    g_lastFetchMs = millis();
    uiDashboard(g_usage, g_lastFetchMs, WiFi.RSSI(), halBatPercent());
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
    halSetBrightness(g_settings.brightness);
    uiSetHeaderLabel(g_settings.devName);

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
    syncTime();
    settingsApplyTZ(g_settings.tzMin);

    uiBootProgress(95, "Fetching usage...");
    refresh();
}

void loop() {
    halUpdate();

    if (halBtnAWasPressed()) {
        g_settings.brightness = (g_settings.brightness + 1) % 4;
        halSetBrightness(g_settings.brightness);
        settingsPutInt("brightness", g_settings.brightness);
    }

    if (halBtnBWasPressed()) {
        refresh();
    }

    if (millis() - g_lastFetchMs >= (unsigned long)g_settings.pollSec * 1000UL) {
        refresh();
    }

    // Redraw once a second so the countdowns and the "updated Ns ago" line
    // stay honest between fetches. The whole frame is composed off-screen and
    // pushed at once, so there is nothing to flicker.
    static unsigned long lastRedraw = 0;
    if (millis() - lastRedraw > 1000) {
        uiDashboard(g_usage, g_lastFetchMs, WiFi.RSSI(), halBatPercent());
        lastRedraw = millis();
    }

    delay(20);
}
