# Design decisions

Decisions and the reasoning behind them, so the context can be reloaded without
rereading the whole conversation. Decisions, not a transcript. `plan.md` holds
the build sequence; this holds the *why*.

---

## Strategy — what this device is for

**An ambient indicator that can be looked at directly for more detail, meant to
help decide how to continue working.** The Stack-Chan-ness is friendly icing on
a functional cake.

That settles a stack of smaller questions:

- **Glanceable first.** The common case is peripheral vision, not reading. Detail
  is available on inspection, but nothing should require it.
- **Decision support, not accounting.** The question it answers is *"can I start
  this now, or should I wait?"* — not *"what did I spend?"*
- **So dollar and token totals are out**, and not reluctantly. They answer a
  different question.
- **The face is a later layer, not the point.** Phase 2 stays phase 2.

### What it can never do

Not scope choices — hard limits, recorded so they stop being re-litigated.

**Per-day token and dollar totals, spend trends, per-model spend breakdown.**
Computed by desktop tools from Claude Code's session logs on the Mac
(`~/.claude/projects/**/*.jsonl`) times a downloaded pricing table. No Anthropic
endpoint carries them. A device off your machine cannot ever show them.

**How full the context window is in the chat you're in.** A real need — arguably
a more urgent one than rate limits — but it lives inside a client session and
nothing external can see it. Worth its own project, not this one.

---

## Conceptual model — limits, not windows

**Current model:** two independent windows, side by side, user works out which
one matters.

**Domain model:** a set of limits, one of which is *currently binding*. Anthropic
says so explicitly — `representative-claim` in the response headers, `is_active`
in the `limits[]` array — and Claude Code's own usage bar displays exactly that.

Ours is a mismatch, and it shows up as work handed to the user: read two numbers,
compare them against two different reset times, decide which governs. The server
already knows.

**Direction:** the object is a **limit**, shaped roughly
`{name, utilization, resetsAt, windowSeconds, isBinding}`. Several exist. One
binds. That shape is not invented here — it is what OpenUsage exposes on its own
local API, arrived at independently.

Not yet built. Recorded so the surface work doesn't start from the wrong object.

### A trap to avoid

Two different quantities get rendered as "Opus 58%": share of a *limit*, and
share of *spending*. Different meanings, identical presentation. Whatever this
device shows must not be ambiguous about which it is.

---

## Polling — 5 minutes, and why the ceiling is low

**Decision: 300s default, 120s floor, 900s ceiling.** Changed 2026-09-05 from an
effective 60s.

Three reasons, which agree:

1. **Faster shows nothing.** The 5-hour window is 300 minutes, so whole-percent
   utilization moves once every three minutes at maximum burn. The 7-day window
   moves 1% per 100 minutes. Countdowns are computed locally from a stored reset
   time and need no polling at all.
2. **The observer is part of the measurement.** Every poll is a real API call
   against the budget being displayed. Small, but a reason to sample politely.
3. **The server rate-limits hard.** See below.

The 60s was a bug: `config.h` said 120 while the setup portal shipped 60
pre-selected, and the portal won. Devices provisioned before the fix made 1,440
calls a day. The floor at 120 repairs them on next boot, since stored values are
clamped on load.

---

## The two usage surfaces, and why we are still on the older one

| | `POST /v1/messages` headers | `GET /api/oauth/usage` |
|---|---|---|
| Inference cost | A real call | None |
| Per-model weeklies | No | Yes, via `limits[]` |
| Rate limiting | Normal, auth checked first | **Aggressive, checked before auth** |

The second is richer and free, which made it look like an obvious upgrade. Two
things argue against rushing:

**Its limiter appears not to be account-scoped.** An unauthenticated request
with no `Authorization` header at all returns `429`, not `401` — so throttling
happens *before* authentication. On `/v1/messages` the same unauthenticated
request returns `401`. Observed `retry-after` on that 429: **784 seconds**, just
over 13 minutes.

Pre-auth throttling behind Cloudflare most likely means it is keyed on IP.
*Inference, not proof* — testing it properly needs a second IP. But if it holds,
the budget is shared by **everything behind one home network**: a desktop
monitor, a terminal, and this device would all draw on the same bucket. That is
consistent with OpenUsage implementing a five-minute lockout after a 429 and
telling users in its own interface that manual refreshes make it worse.

**Its schema is moving.** `seven_day_opus` and `seven_day_sonnet` now return
`null`; per-model weeklies migrated into `limits[]` as `weekly_scoped` entries
keyed by `scope.model.display_name`. Any client here must iterate that array
rather than hard-code names, and ignore what it does not recognise.

**Decision: stay on the header probe for now.** Revisit if per-model weeklies
become worth it. If we switch, `retry-after` must be honoured up to a quarter
hour, and a 429 must serve the last good reading rather than blanking.

---

## Failure behaviour — say "I don't know" loudly

The device should never show a confident number it cannot stand behind.
Established practice worth copying from OpenUsage:

- **A failed fetch keeps the last good values** and marks them stale. It does not
  blank them. *usage-chan does not do this yet — known gap.*
- **A missing field omits its row** rather than rendering zero.
- **"No data" is not "0".** A confident zero is indistinguishable from "nothing
  has been recorded yet", and contradicts a live meter that says otherwise.
- **"Not started" beats a countdown** when there is no reset time to count to.
- **Authenticated-but-no-usage-headers is its own state**, not an error. It is
  the normal condition on Enterprise and API-billed accounts.

---

## Licensing and publication

MIT throughout, public repo. PolyForm Noncommercial was considered and dropped:
not OSI-approved, so it would deter contributors, and the MIT grant on the
vendored files could not have been narrowed anyway. Publishing a near-derivative
of an MIT project under stricter terms also reads as ungenerous.

---

## Open questions

- **Does a `claude setup-token` token carry the `user:profile` scope** that
  `/api/oauth/usage` wants? Sources conflict. Two attempts to test have returned
  429 rather than an auth verdict — the test itself is rate-limited.
- **Is that limiter IP-scoped?** Would decide whether this device can coexist
  with a desktop monitor on the same network.
- **Terms of service.** Consumer terms prohibit automated access except via an
  API key; `claude setup-token` is Anthropic's own automation command. See
  `data-inventory.md`. An account-owner call.
- **Rationing or use-it-or-lose-it?** A depleting meter can cause either. Which
  one this design should guard against is not yet decided. Research pending.
