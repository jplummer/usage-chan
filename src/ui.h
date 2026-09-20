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

// PIN entry, on a keypad. `entered` is how many digits are in (0..4) and
// `pressed` is the key currently under a finger, or -1 for none.
void uiPinScreen(int entered, int pressed = -1);

// The key at a touch point: 0-9 for a digit, UI_PIN_DEL for backspace, or -1
// for a gap between keys.
#define UI_PIN_DEL 10
int uiPinKeyAt(int x, int y);
void uiLockoutStatic(int attempts, int maxAttempts, int lockoutSec);
void uiLockoutTick(int secondsLeft);

// How long the failed-refresh mark holds the circle before the countdown to
// the retry takes it back.
#define UI_FAIL_HOLD_MS 5000UL

// The main screen. lastAttemptMs is when the last fetch attempt finished --
// attempt, not success, because the ring counts down to the next try. pollSec
// is the poll interval; pass 0 to leave the ring empty. refreshFailed shows
// the fail mark in place of the ring.
// The smoke overlay: a veil over the whole screen with a lozenge on top, for
// the two conditions that mean the numbers behind it cannot get better on
// their own. SMOKE_NO_WIFI is the radio being down, where the next fetch
// cannot possibly succeed. SMOKE_NO_API is three failures in a row with the
// radio up, which is the far end rather than one bad request.
#define SMOKE_NONE     0
#define SMOKE_NO_WIFI  1
#define SMOKE_NO_API   2
#define SMOKE_API_FAILS 3          // consecutive failures that earn the overlay
#define SMOKE_WIFI_GRACE_MS 10000UL // a dropped link this brief is not news

// refreshFailing means the last attempt errored and none has succeeded since;
// the countdown to the retry takes the warning colour for as long as that is
// true. refreshFailed is the transient mark in its first few seconds.
void uiDashboard(const UsageData& data, unsigned long lastAttemptMs, int rssi,
                 int batPct, bool fetching, int pollSec, bool refreshFailed,
                 bool refreshFailing, int smoke, const char* ageTxt);

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
