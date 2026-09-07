/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * NTP, retried rather than assumed.
 *
 * The version this replaces called getLocalTime(&t, 5000) and discarded the
 * return value. A boot where NTP did not answer within five seconds carried on
 * with an epoch near zero, which breaks two things at once: reset countdowns
 * have nothing to count from, and — less obviously — every TLS handshake fails
 * certificate validation, because a certificate valid from 2024 is not yet
 * valid in 1970. The device then reports a network problem it does not have,
 * and the actual remedy never suggests itself.
 *
 * So the clock keeps trying in the background. A device that has been up for
 * hours may get an answer it could not get at boot.
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

// Kicks off the first sync attempt. Non-blocking.
void clockBegin();

// Call from loop(). Re-issues NTP on a backoff while the clock is unset.
void clockTick();

// True once the clock is plausibly real. Everything that formats a time or
// counts down to one should check this rather than assuming.
bool clockValid();

// True while we are still trying and have not given up on this boot — the
// difference between "syncing..." and a genuine failure worth mentioning.
bool clockSyncing();
