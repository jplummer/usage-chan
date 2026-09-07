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
};

bool fetchUsage(const char* token, UsageData& out);
