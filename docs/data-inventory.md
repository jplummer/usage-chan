# What the device can actually learn

Raw material for design decisions. Everything here is tagged by how well it is
established, because most of this surface is undocumented and some of it is
contradictory.

- **DOCUMENTED** — Anthropic's own docs
- **OBSERVED** — third-party source or captured traffic, multiple independent sources
- **UNVERIFIED** — one source, or inference

Compiled 2026-09-05. The undocumented parts have no stability guarantee and
have already changed at least once.

---

## The headline: there are two ways to get usage, and we picked the expensive one

Phase 1 does what claude-usage-stick does — POST to `/v1/messages` with
`max_tokens: 1` and read four response headers. That works. But there is a
second surface that is cheaper and much richer.

| | `POST /v1/messages` (current) | `GET /api/oauth/usage` |
|---|---|---|
| Cost | A real inference call. **Spends the budget it reports on** | None. No tokens consumed |
| 5h / 7d utilization | Yes | Yes |
| Opus weekly | **No** | Yes |
| Sonnet weekly | **No** | Yes |
| Which window is binding | Yes, via `representative-claim` | Yes, via `limits[].is_active` |
| Extra-usage credits and spend | Partial | Full, with dollar amounts |
| Utilization scale | **0–1 fraction** | **0–100 percent** |
| Reset format | **Unix epoch seconds** | **ISO 8601 string** |
| Evidence | OBSERVED, plus this project's own hardware | OBSERVED across six projects |

**The scale and format differ between the two.** `api.cpp` currently does
`h5u.toFloat() * 100.0f` and `h5r.toInt()`, both correct for headers. Pointing
the same parser at the JSON endpoint would render 48% as 4800% and every
countdown as "due". Any switch has to change the parser, not just the URL.

Endpoint existence checked directly from this machine, unauthenticated:
`GET /api/oauth/usage` returns **429** (rate-limited) where a fabricated path
under the same prefix returns **404**. The path is real.

---

## Surface 1 — `POST /v1/messages` response headers

### The unified family (OBSERVED, undocumented)

Sixteen headers, all prefixed `anthropic-ratelimit-unified-`. Phase 1 reads
four. Evidence: Claude Code's own `MockHeaders` type in a community source
mirror, corroborated by a 37,363-request proxy capture on a Max account.

| Suffix | Values / format | Notes |
|---|---|---|
| `status` | `allowed` \| `allowed_warning` \| `rejected` | Overall state |
| `representative-claim` | `five_hour` \| `seven_day` \| `seven_day_opus` \| `seven_day_sonnet` | **Which window is binding.** This is what Claude Code's own usage bar shows |
| `reset` | epoch seconds | For the representative claim |
| `5h-utilization` / `7d-utilization` | 0–1 fraction | Phase 1 reads these |
| `5h-reset` / `7d-reset` | **epoch seconds** | Phase 1 reads these |
| `5h-surpassed-threshold` / `7d-surpassed-threshold` | string | Present only once a warning threshold is crossed |
| `fallback` | `available` | Opus→Sonnet fallback |
| `fallback-percentage` | string | Was `0.5` on 37,363/37,363 captured requests |
| `overage-status` | `allowed` \| `allowed_warning` \| `rejected` | Extra-usage billing |
| `overage-utilization` / `overage-reset` / `overage-surpassed-threshold` | | |
| `overage-disabled-reason` | 13-value enum | Why extra usage is unavailable |

**There is no Opus-specific utilization header.** `seven_day_opus` exists only
as a *value* of `representative-claim`. The number lives on the JSON endpoint
only. If an Opus gauge is wanted, that decides the endpoint question.

### The documented family (DOCUMENTED)

`anthropic-ratelimit-requests-*`, `-tokens-*`, `-input-tokens-*`,
`-output-tokens-*`, each with `-limit` / `-remaining` / `-reset`. Plus
`retry-after` and `request-id`.

These are organization and API-key-tier oriented. **Note the format difference:**
documented `*-reset` headers are RFC 3339 strings, while the unified `*-reset`
headers are epoch seconds. Whether both families appear together on a
subscription OAuth token is UNVERIFIED — no capture shows both.

---

## Surface 2 — `GET /api/oauth/usage` (OBSERVED, undocumented)

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer sk-ant-oat01-...
anthropic-beta: oauth-2025-04-20
```

No `anthropic-version` header is sent by any of the six implementations found.
POST returns 405.

A captured response, March 2026:

```json
{
  "five_hour":            { "utilization": 48.0, "resets_at": "2026-03-02T11:00:00.521744+00:00" },
  "seven_day":            { "utilization": 64.0, "resets_at": "2026-03-06T06:00:00.521764+00:00" },
  "seven_day_opus":       null,
  "seven_day_sonnet":     { "utilization": 2.0,  "resets_at": "2026-03-06T07:00:00.521773+00:00" },
  "seven_day_oauth_apps": null,
  "seven_day_cowork":     null,
  "extra_usage": { "is_enabled": true, "monthly_limit": 1000, "used_credits": 0.0, "utilization": null }
}
```

**Both windows and `utilization` can be `null`**, independently. One project
records that typing `utilization` as non-nullable turned a single null into a
whole-response parse failure. Any parser here must tolerate both.

A newer `limits[]` array was captured in July 2026 and supersedes the flat
per-model keys, which were null on both probed accounts. Each entry carries
`kind` (`session` | `weekly_all` | `weekly_scoped`), `scope.model.display_name`,
`percent`, `severity`, `resets_at`, and `is_active` — the last marking the
binding limit. Only one of the six projects reads it; the rest still read the
flat keys. **The schema is actively moving.** Two projects deliberately parse
unknown keys rather than enumerate them, and captures contain unreleased
codename slots (`tangelo`, `iguana_necktie`, `nimbus_quill`, `cinder_cove`,
`amber_ladder`). Anything built here should ignore what it does not recognise
rather than fail.

### Sibling: `GET /api/oauth/profile` (OBSERVED)

Same auth. Returns `account.{full_name, email, has_claude_max, has_claude_pro}`
and `organization.{name, rate_limit_tier, subscription_status,
has_extra_usage_enabled}`. Would let the device name the plan it is watching, or
warn when a subscription lapses.

---

## Surface 3 — status.claude.com (DOCUMENTED format, verified live here)

Standard Atlassian Statuspage v2. **No authentication.** All endpoints verified
returning 200 from this machine on 2026-09-05.

`/api/v2/status.json` is the cheapest poll on offer at ~212 bytes:

```json
{"page":{...},"status":{"indicator":"none","description":"All Systems Operational"}}
```

`indicator` ∈ `none` | `minor` | `major` | `critical` | `maintenance`.
`/api/v2/components.json` (~2 KB) breaks it down; the two components that matter
here are **Claude API (api.anthropic.com)** and **Claude Code**.
`/api/v2/incidents/unresolved.json` (~157 B when clear) carries `impact` ∈
`none` | `minor` | `major` | `critical`.

Only `operational` / `none` were observed live, because everything was green.

---

## Surface 4 — HTTP status, which is data too

| Code | Meaning | What the screen should say |
|---|---|---|
| 200 **with** headers | Normal | Draw the gauges |
| 200 **without** headers | Authenticated fine, but this plan publishes no usage — real on Enterprise and API-billed accounts | Needs its own state. Not a network error, not an auth error |
| 400 | Malformed request, **or** a self-set spend limit hit | Firmware bug, most likely |
| 401 | Token malformed, revoked, or **expired** | "Token expired — re-run `claude setup-token`". This is the one that arrives in a year |
| 403 | Token lacks permission | Treat as 401 |
| 429 | Rate limited, **or** spend cap | Carries `retry-after` seconds — *except* on a spend-cap 429, which has none and keeps failing. Distinguish via `error.details.error_code == "enforced_spend_limit_reached"` |
| 500 / 504 | Anthropic-side error | Retry with backoff |
| 529 | Overloaded — "high traffic across all users" | "Anthropic busy", explicitly not the user's fault |

The 200-without-headers case is the one most likely to be misread as a bug.
Phase 1 already reports it as `no_usage_h_200`, which is correct but cryptic.

---

## What is NOT available

**The official Usage & Cost API is out of reach, and this is DOCUMENTED:**

> The Admin API is unavailable for individual accounts.

It needs an Admin API key, an OAuth token with `org:admin` scope, or an
unscoped personal/service key. A `claude setup-token` token carries
`user:profile user:inference user:sessions:claude_code user:mcp_servers
user:file_upload` — none of them. Separately, no evidence was found that those
reports cover consumer Max-plan usage at all; they report Console API usage.

This confirms plan.md's existing call to keep dollar spend out of scope.

**claude.ai's own usage endpoints** need a browser `sessionKey` cookie, not an
OAuth token. ClaudeGauge ships a Chrome extension purely to extract that cookie.
A more fragile path, not recommended.

---

## The terms-of-service question

Worth stating plainly rather than burying.

Anthropic's consumer terms prohibit, except when using an API key or where
otherwise permitted, accessing the Services

> through automated or non-human means, whether through a bot, script, or otherwise.

Against that: `claude setup-token` is Anthropic's own command, and its documented
purpose is producing a token for automated and CI use. Half a dozen public
projects poll these surfaces openly.

Also on the record: in February 2026, users reported `sk-ant-oat01-` tokens
being rejected outright with "OAuth authentication is currently not supported."
That block does not appear to have persisted, and Anthropic never answered the
issue. A claim circulates that consumer OAuth is "intended exclusively for
Claude Code and Claude.ai", but that quote **could not be verified at its
claimed source**.

Unresolved, and not resolvable from here. The practical read: this is a device
polling a personal account a few times an hour, which is modest. But the risk
is a personal account, and it is the account owner's call — and it argues for
polling *less*, not more, which happens to align with the JSON endpoint being
free.

---

## Could not verify

1. Utilization scale on `/api/oauth/usage`. Three sources say 0–100 and a
   captured payload agrees, but nobody has measured it on *this* account.
2. Whether documented and unified header families co-occur.
3. `anthropic-ratelimit-unified-5h-status` — read by Clawdmeter, absent from
   both Claude Code's own type and the 37k capture. Probably does not exist.
4. Whether `/v1/models` returns 200 with an OAuth token. Several shipped CLIs
   implement it that way, and one dated live probe reports 200, but no captured
   response was found.
5. Whether unified headers appear on 429 and 5xx responses.
6. Whether 529 carries `retry-after`.
7. The server-side rule for emitting `*-surpassed-threshold`.
