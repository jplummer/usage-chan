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
    out.ok = true;
    return true;
}
