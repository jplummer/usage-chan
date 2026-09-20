/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 oauramos
 *
 * Vendored from claude-usage-stick (github.com/oauramos/claude-usage-stick).
 * Modified: collects anthropic-ratelimit-unified-representative-claim, the
 * server's own answer to which window is binding.
 *
 * See docs/attribution.md.
 */
#include "api.h"
#include "config.h"
#include "certs.h"
#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>

// HTTPClient discards any header not named here, and collectHeaders() must be
// called before POST — which is why this allowlist exists at all.
static const char* RL_HEADERS[] = {
    "anthropic-ratelimit-unified-5h-utilization",
    "anthropic-ratelimit-unified-5h-reset",
    "anthropic-ratelimit-unified-7d-utilization",
    "anthropic-ratelimit-unified-7d-reset",
    "anthropic-ratelimit-unified-representative-claim",
    // Collected and logged only, not yet displayed. The device once said
    // "nearly out" while the account was in overage, and nothing here knew.
    // Nobody has captured what these look like while overage is active —
    // whether 5h-utilization sits at 1.0 or climbs past it, and whether
    // overage-status changes value — so the log is the spike that decides
    // the display. Values seen so far: status and overage-status are
    // allowed | allowed_warning | rejected.
    "anthropic-ratelimit-unified-status",
    "anthropic-ratelimit-unified-overage-status",
    "anthropic-ratelimit-unified-overage-utilization",
    "anthropic-ratelimit-unified-overage-reset",
    "anthropic-ratelimit-unified-overage-disabled-reason",
};
static const int RL_HEADER_COUNT = 10;

// ── Overage capture ───────────────────────────────────────
// The serial line below is a live stream, not a log. This device lives on a
// desk with no console attached, so the one event worth seeing -- the first
// time this account crosses the wall -- would print to nobody and be gone.
//
// So pin it. The FIRST header set seen past the wall is written to NVS and
// never overwritten: a later one cannot be more informative, and being
// overwritten by a subsequent ordinary overage would lose the thing we waited
// for. Raw strings, not parsed values, because the open questions are about
// the format itself -- whether utilization is a fraction past 1.0, whether
// 5h-utilization pegs at 1.0 or climbs. Parsing it would throw away the
// evidence. See docs/design-decisions.md.
static const char* OVCAP_NS = "ovcap";

static void captureOverage(const String& uStatus, const String& ovStatus,
                           const String& ovUtil, const String& ovReset,
                           const String& ovReason, const String& h5u,
                           const String& d7u, uint32_t now) {
    if (uStatus != "rejected") return;              // not past the wall
    Preferences p;
    if (!p.begin(OVCAP_NS, false)) return;
    if (p.isKey("seen")) { p.end(); return; }       // already pinned; keep the first
    p.putULong("seen", now ? now : 1);
    p.putString("status", uStatus);
    p.putString("ov_st", ovStatus);
    p.putString("ov_util", ovUtil);
    p.putString("ov_rst", ovReset);
    p.putString("ov_why", ovReason);
    p.putString("h5_util", h5u);
    p.putString("d7_util", d7u);
    p.end();
    Serial.println("[API] *** overage header set captured and pinned to NVS ***");
}

void apiDumpOverageCapture() {
    Preferences p;
    // Read-WRITE, deliberately. A read-only open of a namespace that was never
    // created fails outright and logs "nvs_open failed: NOT_FOUND", and the
    // first version of this took that failure as a reason to return silently
    // -- so the one line this function exists to print never appeared. Opening
    // read-write creates the namespace once, on the first boot, and after that
    // costs nothing: no keys are written unless something is captured.
    if (!p.begin(OVCAP_NS, false) || !p.isKey("seen")) {
        p.end();
        Serial.println("[CAP] no overage header set captured yet");
        return;
    }
    Serial.println("[CAP] ---- pinned overage header set ----");
    Serial.printf("[CAP] captured at epoch %lu\n", (unsigned long)p.getULong("seen"));
    const char* keys[][2] = {
        { "status",  "unified-status        " },
        { "ov_st",   "overage-status        " },
        { "ov_util", "overage-utilization   " },
        { "ov_rst",  "overage-reset         " },
        { "ov_why",  "overage-disabled-reason" },
        { "h5_util", "5h-utilization        " },
        { "d7_util", "7d-utilization        " },
    };
    for (auto& k : keys)
        Serial.printf("[CAP]   %s = %s\n", k[1], p.getString(k[0], "-").c_str());
    Serial.println("[CAP] -------------------------------------");
    p.end();
}

bool fetchUsage(const char* token, UsageData& out) {
    WiFiClientSecure client;
    client.setCACert(CA_BUNDLE);

    HTTPClient https;
    if (!https.begin(client, MESSAGES_ENDPOINT)) {
        strlcpy(out.error, "https_init", sizeof(out.error));
        out.ok = false;
        return false;
    }

    https.addHeader("Authorization", String("Bearer ") + token);
    https.addHeader("anthropic-version", ANTHROPIC_VERSION);
    https.addHeader("anthropic-beta", "oauth-2025-04-20");
    https.addHeader("content-type", "application/json");
    https.addHeader("User-Agent", "claude-code/2.1.5");
    https.setTimeout(API_TIMEOUT_MS);
    https.collectHeaders(RL_HEADERS, RL_HEADER_COUNT);

    String body = "{\"model\":\"" PROBE_MODEL "\","
                  "\"max_tokens\":1,"
                  "\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}";

    Serial.printf("[API] POST %s\n", MESSAGES_ENDPOINT);
    int code = https.POST(body);
    Serial.printf("[API] HTTP %d\n", code);

    if (code <= 0) {
        snprintf(out.error, sizeof(out.error), "http_%d", code);
        out.ok = false;
        https.end();
        return false;
    }

    String h5u = https.header("anthropic-ratelimit-unified-5h-utilization");
    String h5r = https.header("anthropic-ratelimit-unified-5h-reset");
    String d7u = https.header("anthropic-ratelimit-unified-7d-utilization");
    String d7r = https.header("anthropic-ratelimit-unified-7d-reset");
    String claim = https.header("anthropic-ratelimit-unified-representative-claim");
    String ovStatus = https.header("anthropic-ratelimit-unified-overage-status");
    String uStatus  = https.header("anthropic-ratelimit-unified-status");
    String ovUtil   = https.header("anthropic-ratelimit-unified-overage-utilization");
    String ovReset  = https.header("anthropic-ratelimit-unified-overage-reset");
    String ovReason = https.header("anthropic-ratelimit-unified-overage-disabled-reason");

    Serial.printf("[API] 5h: %s  7d: %s\n", h5u.c_str(), d7u.c_str());
    Serial.printf("[API] 5h_reset: %s  7d_reset: %s\n", h5r.c_str(), d7r.c_str());
    Serial.printf("[API] binding: %s\n", claim.length() ? claim.c_str() : "(absent)");

    // Overage spike: one log line per fetch so the wire's behaviour past the
    // wall can be read off the serial console. Absent headers print as "-".
    auto hdr = [&](const char* suffix) {
        String v = https.header((String("anthropic-ratelimit-unified-") + suffix).c_str());
        return v.length() ? v : String("-");
    };
    Serial.printf("[API] status: %s  overage: status=%s util=%s reset=%s disabled=%s\n",
                  hdr("status").c_str(), hdr("overage-status").c_str(),
                  hdr("overage-utilization").c_str(), hdr("overage-reset").c_str(),
                  hdr("overage-disabled-reason").c_str());

    https.end();

    if (h5u.length() == 0 && d7u.length() == 0) {
        if (code == 401) {
            strlcpy(out.error, "auth_failed", sizeof(out.error));
        } else {
            snprintf(out.error, sizeof(out.error), "no_usage_h_%d", code);
        }
        out.ok = false;
        return false;
    }

    // utilization is 0.0–1.0, convert to percentage
    out.h5 = h5u.toFloat() * 100.0f;
    out.d7 = d7u.toFloat() * 100.0f;
    out.h5ResetEpoch = (uint32_t)h5r.toInt();
    out.d7ResetEpoch = (uint32_t)d7r.toInt();
    strlcpy(out.claim, claim.c_str(), sizeof(out.claim));

    // Extra-usage state. There is no "in overage" flag; it is derived, and the
    // obvious derivation is wrong. overage-status is present on ordinary
    // responses too — a plan that simply blocks at 100% carries
    // overage-status: rejected all day — so presence means nothing. What marks
    // the wall is unified-status: rejected. Past that wall, overage-status
    // says which side of it you are on: allowed/allowed_warning means the
    // extra usage is carrying you, rejected means nothing is.
    //
    // Source: another implementation's notes on the provider's own client
    // (github.com/Abilityai/trinity#2865). Not from Anthropic, and still not
    // a captured sample -- nobody anywhere appears to have one.
    captureOverage(uStatus, ovStatus, ovUtil, ovReset, ovReason, h5u, d7u,
                   (uint32_t)time(nullptr));
    out.overageActive = (uStatus == "rejected");
    strlcpy(out.overageStatus, ovStatus.c_str(), sizeof(out.overageStatus));
    // A 0..1 fraction like its siblings above, NOT a percentage — see
    // docs/data-inventory.md. Whether it climbs past 1.0 in overage is still
    // unconfirmed by anyone.
    out.overageUtil = ovUtil.toFloat();
    out.overageResetEpoch = (uint32_t)ovReset.toInt();
    strlcpy(out.overageDisabledReason, ovReason.c_str(), sizeof(out.overageDisabledReason));

    out.ok = true;
    return true;
}
