/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * Runs the usage fetch on core 0 so the render loop never blocks on it.
 *
 * Before this existed, refresh() called fetchUsage() straight from loop(), and
 * the whole device — touch, redraw, countdowns — froze for the duration of a
 * TLS handshake plus a round trip. Up to API_TIMEOUT_MS, which is 15 seconds.
 * That was survivable while the screen had three labelled button zones and
 * changed slowly. It is not survivable with tap-anywhere-for-menu, where a dead
 * tap reads as a broken device rather than a busy one.
 *
 * It is also what makes a spinner possible at all: an animation cannot run on a
 * blocked loop.
 */
#pragma once
#include "api.h"
#include <stdbool.h>

// Starts the worker. Call once, after WiFi and the token are available.
void fetcherBegin();

// Asks for a fetch. Returns immediately. A request made while one is already
// running is dropped rather than queued — the next scheduled poll is at most
// five minutes out, and stacking fetches against an endpoint that rate-limits
// hard is the opposite of what we want.
void fetcherRequest();

// True from the moment a fetch starts until its result has been published.
// Drives the spinner.
bool fetcherBusy();

// Copies the last published result. Safe to call from the render loop at any
// time; never tears, never blocks for long.
void fetcherSnapshot(UsageData& out, unsigned long& lastFetchMsOut);

// Milliseconds the last completed fetch took, or 0 if none has finished.
// Kept because "how long does a refresh take?" deserved a measurement rather
// than an estimate.
uint32_t fetcherLastDurationMs();
