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

// The main screen. pollSec is the poll interval, which the refresh ring needs
// to know how far through the wait it is; pass 0 to leave the ring empty.
void uiDashboard(const UsageData& data, unsigned long lastFetchMs, int rssi,
                 int batPct, bool fetching, int pollSec);

// Whether a dashboard touch landed on the menu button. The zone is larger
// than the circle it draws -- see V_MENU_HIT_* in ui.cpp.
bool uiMenuButtonHit(int x, int y);

void uiError(const char* title, const char* detail = nullptr);

// ── Menu ─────────────────────────────────────────────────
// Dummy contents for now: this exists to prove tap-to-open/close and to give
// the settings work somewhere to land. Rows do nothing yet.
#define MENU_ROWS 4
extern const char* const kMenuRows[MENU_ROWS];

// Draws the menu. `highlight` is the row under the finger, or -1 for none.
// `brightness` is the live level, shown as the filled dot on the first row.
void uiMenu(int highlight, uint8_t brightness);

// Returns the row index at a touch point, or -1 if the touch was outside the
// rows (which the caller treats as "close").
int  uiMenuRowAt(int x, int y);

// For a tap on the Brightness row: which of the dots it landed on, or -1 if it
// hit the label instead, which does nothing.
int  uiMenuBrightnessDotAt(int x);

// Header label, from the device name set in the captive portal. Empty falls
// back to "USAGE-CHAN". Unused by the dashboard now that the title stripe is
// gone; kept for the menu and for provisioning screens.
void uiSetHeaderLabel(const char* name);

// Whether a real timezone has been chosen. Until one has, reset times render as
// durations rather than a wall clock, because tzMin defaults to 0 — a
// legitimate offset (UTC) that would otherwise silently render every clock
// seven or eight hours wrong.
void uiSetTimezoneKnown(bool known);
