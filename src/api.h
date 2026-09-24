/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 oauramos
 *
 * Vendored from claude-usage-stick (github.com/oauramos/claude-usage-stick).
 * Modified: collects anthropic-ratelimit-unified-representative-claim as well,
 * and UsageData carries it. The server names the binding window; without it the
 * screen has to make the user compare two bars and work it out. UsageData also
 * carries the overage-* family, and the comments on those fields were corrected
 * 2026-09-24 — they had described a derivation api.cpp does not use.
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

    // Extra-usage state, from the overage-* headers. overageActive is derived
    // from unified-status, NOT from the presence of any overage-* header: those
    // ride on ordinary responses too. Observed on the wire 2026-09-24, nowhere
    // near the wall: "status: allowed  overage: status=allowed util=0.0". The
    // wall is unified-status: rejected, and past it overage-status says which
    // side of it you are on. The derivation and its source are documented at
    // the assignment in api.cpp; read that before changing this.
    // overageStatus values seen so far: allowed | allowed_warning | rejected.
    bool     overageActive;
    char     overageStatus[24];
    // Fraction of the extra-usage allowance already spent, 0..1 from the wire,
    // like the other utilization headers and NOT a percentage — api.cpp stores
    // it unscaled while h5/d7 are multiplied by 100.
    //
    // What it is a fraction OF is still unknown. Claude.ai bills against two
    // ceilings — an unspent credit balance and a separate monthly spending
    // limit — and the binding one is whichever is smaller, which flips when
    // auto-reload is toggled. It is not simply spend-against-limit: on
    // 2026-09-24 this read 0.0 while the account showed $15.22 spent that
    // month. Neither dollar figure appears in any header we collect.
    // See docs/design-decisions.md and the answered question in plan.md.
    float    overageUtil;
    uint32_t overageResetEpoch;
    char     overageDisabledReason[32];
};

// Prints the pinned overage header set, if one was ever captured, or says so
// if not. Called once at boot: the capture is worthless unless it survives
// until somebody plugs a cable in, which is days or weeks after the event.
void apiDumpOverageCapture();

bool fetchUsage(const char* token, UsageData& out);
