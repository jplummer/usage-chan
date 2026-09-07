/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 */
#include "fetcher.h"
#include "app_state.h"
#include <Arduino.h>
#include <WiFi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

// mbedTLS wants a lot of stack for a handshake, and running short does not
// produce an error — it produces a reboot. 16KB is generous for a single TLS
// session with a three-root CA bundle; internal RAM has the room.
static constexpr uint32_t FETCH_STACK   = 16384;
static constexpr UBaseType_t FETCH_PRIO = 1;    // below the Arduino loop task
static constexpr BaseType_t FETCH_CORE  = 0;    // loop() is pinned to core 1

static TaskHandle_t      s_task  = nullptr;
static SemaphoreHandle_t s_mutex = nullptr;

// Published result. Only ever written inside s_mutex.
static UsageData     s_usage{};
static unsigned long s_lastFetchMs = 0;
static uint32_t      s_lastDurMs   = 0;

// Written by the worker, read by the render loop. A plain bool is adequate:
// aligned 32-bit reads and writes are atomic on this core, and nothing branches
// on it in a way a stale read for one frame would break.
static volatile bool s_busy = false;

static void fetchTask(void*) {
    for (;;) {
        // Sleep until someone asks. pdTRUE clears the count on take, so a burst
        // of requests during one fetch collapses into at most one more.
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        s_busy = true;
        uint32_t t0 = millis();

        // Fetch into a local. The published copy is never half-written, so the
        // render loop cannot catch a result mid-update.
        UsageData local{};
        local.ok = false;
        if (WiFi.status() == WL_CONNECTED) {
            fetchUsage(g_token, local);
        } else {
            strlcpy(local.error, "no_wifi", sizeof(local.error));
        }

        uint32_t dur = millis() - t0;

        xSemaphoreTake(s_mutex, portMAX_DELAY);
        s_usage       = local;
        s_lastFetchMs = millis();
        s_lastDurMs   = dur;
        xSemaphoreGive(s_mutex);

        s_busy = false;
        Serial.printf("[FETCH] %s in %ums\n", local.ok ? "ok" : local.error, dur);
    }
}

void fetcherBegin() {
    if (s_task) return;
    s_mutex = xSemaphoreCreateMutex();
    xTaskCreatePinnedToCore(fetchTask, "usage_fetch", FETCH_STACK, nullptr,
                            FETCH_PRIO, &s_task, FETCH_CORE);
}

void fetcherRequest() {
    if (!s_task || s_busy) return;
    xTaskNotifyGive(s_task);
}

bool fetcherBusy() { return s_busy; }

uint32_t fetcherLastDurationMs() { return s_lastDurMs; }

void fetcherSnapshot(UsageData& out, unsigned long& lastFetchMsOut) {
    if (!s_mutex) { out = s_usage; lastFetchMsOut = s_lastFetchMs; return; }
    // A short timeout rather than portMAX_DELAY: the render loop must never be
    // the thing that blocks. Missing one frame's update is free — the previous
    // frame's values are still on screen and still correct.
    if (xSemaphoreTake(s_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        out            = s_usage;
        lastFetchMsOut = s_lastFetchMs;
        xSemaphoreGive(s_mutex);
    }
}
