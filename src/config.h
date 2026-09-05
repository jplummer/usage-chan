/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * Rewritten for usage-chan. The claude-usage-stick original carried per-board
 * #ifdef blocks for eight displays; one board needs none of that.
 */
#pragma once

#define FW_VERSION              "0.1.0"

// ── Polling ──────────────────────────────────────────────
// Every poll is a real (if tiny) API call, so it counts against the very
// budget being displayed. 120s is the upstream default and stays here.
#define DEFAULT_POLL_SEC        120
#define MIN_POLL_SEC            30
#define MAX_POLL_SEC            300

// ── Security ─────────────────────────────────────────────
#define MAX_PIN_ATTEMPTS        10
#define LOCKOUT_BASE_SEC        60       // doubles each failure
#define KDF_ROUNDS              10000

// ── Display ──────────────────────────────────────────────
// 320x240 IPS. Rotation 1 is M5GFX's default for this panel (landscape, USB-C
// on the right) and is what Panel_M5StackCoreS3's constructor already sets.
#define SCREEN_W                320
#define SCREEN_H                240

// CoreS3 has physical buttons, just not A/B/C ones: reset underneath (wired to
// the chip's EN line, invisible to firmware) and soft power on the side (which
// arrives as M5.BtnPWR through the PMIC, not as BtnA). So M5Unified synthesises
// BtnA/B/C from a strip along the bottom of the touch panel instead, and only
// if we give that strip a height. It defaults to 0, which puts the strip at y>=240: off-screen, so the
// buttons never fire. This is the height of that strip in pixels, and also the
// height of the on-screen hint row that shows the user where to press.
#define TOUCH_BTN_H             36

#define DEFAULT_BRIGHTNESS      2        // 0=off 1=dim 2=normal 3=bright

// ── Network ──────────────────────────────────────────────
#define WIFI_CONNECT_TIMEOUT_S  20
#define API_TIMEOUT_MS          15000
#define MESSAGES_ENDPOINT       "https://api.anthropic.com/v1/messages"
#define ANTHROPIC_VERSION       "2023-06-01"
#define PROBE_MODEL             "claude-haiku-4-5-20251001"

// ── NVS ──────────────────────────────────────────────────
// Same namespace string as claude-usage-stick, so settings.cpp and
// provision.cpp keep working unmodified.
#define NVS_NAMESPACE           "claude"
