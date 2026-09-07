/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * Screens for usage-chan. Numbers and bars, no face, no servo — phase 1 of
 * plan.md. Function names match claude-usage-stick's ui.h where the vendored
 * provision.cpp calls into them; the rest is a smaller surface than upstream's
 * because there is no carousel, no news screen and no mascot row.
 */
#pragma once
#include "api.h"

void uiInit();

// Boot + setup
void uiBootProgress(int percent, const char* label);
void uiSetupScreen(const char* apName, const char* apPass, bool reconfigure = false);
void uiConnecting(const char* ssid, int attempt = 0);

// PIN entry. pos is the digit being edited (0..3); digits holds the current
// values, including the ones not yet confirmed.
void uiPinScreen(int pos, const int digits[4]);
void uiLockoutStatic(int attempts, int maxAttempts, int lockoutSec);
void uiLockoutTick(int secondsLeft);

// The main screen.
void uiDashboard(const UsageData& data, unsigned long lastFetchMs, int rssi,
                 int batPct, bool fetching);

void uiError(const char* title, const char* detail = nullptr);

// ── Menu ─────────────────────────────────────────────────
// Dummy contents for now: this exists to prove tap-to-open/close and to give
// the settings work somewhere to land. Rows do nothing yet.
#define MENU_ROWS 4
extern const char* const kMenuRows[MENU_ROWS];

// Draws the menu. `highlight` is the row under the finger, or -1 for none.
void uiMenu(int highlight);

// Returns the row index at a touch point, or -1 if the touch was outside the
// rows (which the caller treats as "close").
int  uiMenuRowAt(int x, int y);

// Header label, from the device name set in the captive portal. Empty falls
// back to "USAGE-CHAN".
void uiSetHeaderLabel(const char* name);
