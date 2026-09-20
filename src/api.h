/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 oauramos
 *
 * Vendored from claude-usage-stick (github.com/oauramos/claude-usage-stick).
 * Modified: collects anthropic-ratelimit-unified-representative-claim as well,
 * and UsageData carries it. The server names the binding window; without it the
 * screen has to make the user compare two bars and work it out.
 *
 * See docs/attribution.md.
 */
#pragma once
#include <stdint.h>

struct UsageData {
    float    h5;
    float    d7;
    uint32_t h5ResetEpoch;
    uint32_t d7ResetEpoch;
    bool     ok;
    char     error[64];
    // Which window is currently the binding constraint, straight from the
    // server: five_hour | seven_day | seven_day_opus | seven_day_sonnet.
    // Empty when the header was absent. This is what Claude Code's own usage
    // bar displays, and it costs one more string in RL_HEADERS[].
    char     claim[24];

    // Extra-usage state, straight from the overage-* headers. overageActive
    // is false — and the rest unset — unless the account is at the wall and
    // overage is enabled at all; there's no separate "overage exists on this
    // account" flag, so presence of the status header is the signal.
    // overageStatus values seen so far: allowed | allowed_warning | rejected.
    bool     overageActive;
    char     overageStatus[24];
    // Fraction of the extra-usage allowance already spent, 0..1, from
    // overage-utilization. ASSUMED to be a percentage like the other
    // utilization headers and assumed to have a real ceiling behind it.
    // Neither has ever been observed -- see docs/design-decisions.md.
    float    overageUtil;
    uint32_t overageResetEpoch;
    char     overageDisabledReason[32];
};

// Prints the pinned overage header set, if one was ever captured, or says so
// if not. Called once at boot: the capture is worthless unless it survives
// until somebody plugs a cable in, which is days or weeks after the event.
void apiDumpOverageCapture();

bool fetchUsage(const char* token, UsageData& out);
