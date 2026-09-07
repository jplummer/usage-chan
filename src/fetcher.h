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

// Copies the last GOOD result, plus when it arrived. A failed fetch does not
// overwrite it — numbers that were true three minutes ago are still worth more
// than "--", they are just old, and the caller is told how old.
void fetcherSnapshot(UsageData& out, unsigned long& lastGoodMsOut);

// Seconds since the last SUCCESSFUL fetch, or -1 if there has never been one.
// This is deliberately not "since the last attempt": every freshness claim on
// screen depends on success, while only the retry schedule cares about attempts.
int32_t fetcherAgeSec();

// The most recent failure's reason, or an empty string if the last attempt
// succeeded. Non-empty alongside good data means exactly one thing: the numbers
// are real but stale.
const char* fetcherLastError();

// Milliseconds the last completed fetch took, or 0 if none has finished.
// Kept because "how long does a refresh take?" deserved a measurement rather
// than an estimate.
uint32_t fetcherLastDurationMs();
