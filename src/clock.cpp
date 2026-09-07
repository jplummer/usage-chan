/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 */
#include "clock.h"
#include <Arduino.h>
#include <WiFi.h>
#include <time.h>

// Any epoch below this is not a real clock. 1 700 000 000 is late 2023 — safely
// before anything this device could legitimately see and safely after the 1970
// value an unsynced ESP32 reports.
static constexpr time_t SANE_EPOCH = 1700000000;

// Three servers, because pool.ntp.org can be blocked on networks that run their
// own, and time.google.com answers almost everywhere.
static void issueSync() {
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
}

static uint32_t s_nextAttemptMs = 0;
static uint32_t s_backoffMs     = 2000;
static uint8_t  s_attempts      = 0;
static bool     s_started       = false;

// After this many attempts we stop escalating and settle into a slow retry.
// We never stop entirely: the network that was broken at boot may not be later.
static constexpr uint8_t  LOUD_ATTEMPTS = 6;
static constexpr uint32_t SLOW_RETRY_MS = 5UL * 60UL * 1000UL;

bool clockValid() { return time(nullptr) >= SANE_EPOCH; }

bool clockSyncing() { return s_started && !clockValid() && s_attempts < LOUD_ATTEMPTS; }

void clockBegin() {
    s_started       = true;
    s_attempts      = 1;
    s_backoffMs     = 2000;
    issueSync();
    s_nextAttemptMs = millis() + s_backoffMs;
}

void clockTick() {
    if (!s_started || clockValid()) return;
    if (WiFi.status() != WL_CONNECTED) return;   // nothing to retry against yet
    if ((int32_t)(millis() - s_nextAttemptMs) < 0) return;

    s_attempts++;
    issueSync();

    if (s_attempts < LOUD_ATTEMPTS) {
        s_backoffMs = s_backoffMs * 2;           // 2s, 4s, 8s, 16s, 32s
        s_nextAttemptMs = millis() + s_backoffMs;
    } else {
        // Quiet persistence. Still trying, no longer urgent about it.
        s_nextAttemptMs = millis() + SLOW_RETRY_MS;
    }
    Serial.printf("[CLOCK] ntp retry %u\n", (unsigned)s_attempts);
}
