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
- **Decision support, not accounting.** The questions it answers are *"can I
  start this now, or should I wait?"* and *"is paying to continue an option?"* —
  not *"what did I spend?"*
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

## Display — five conflicts between the current screen and the evidence

Research is in `docs/research-limit-behaviour.md`. Five things the phase 1 screen
does that the evidence argues against. **None resolved yet** — recorded so the
redesign starts from a list rather than a vibe.

**1. The bar fills.** `drawUsageBlock()` draws a bar that grows with utilization.
A bar filling toward "complete" invents a completion goal, and goal gradient then
predicts acceleration toward it — the end-of-window burn we most want to avoid. A
bar that *empties* invents nothing. Cheapest fix on the list, and the one with
the clearest theory behind it.

**2. Two level-based thresholds.** Amber at 60%, red at 85%. The alarm literature
says people probability-match their response rate to an alert's hit rate, so a
60% threshold firing on most working days goes invisible in a week and discredits
the 85% behind it. The evidence wants **one** state change, tied to a projection
crossing a line, not a level.

**3. Precision runs the wrong way at the top.** Currently one decimal below 10%
and whole percent above. Directionally right at the low end, but it never gets
coarser as the window closes — which is where precision provably causes
overspending. Wants a band near exhaustion, not a number.

**4. The countdown is the smallest thing on screen.** Percentage at 24pt bold,
"resets in 2h 14m" at 16px dim. The evidence says time-to-reset is the single
most effective defence against hoarding, because it converts "I am running out"
into "I get more at 3:40". The weighting is backwards.

**5. It shows used, not remaining.** Utilization is what the API reports, so this
was inherited rather than chosen. "38% left" matches the question the user is
actually asking. Not clear-cut — the small-area effect means a lone shrinking
number grabs attention hardest late — which is another argument for pairing it
with the countdown rather than showing it alone.

### And one strategy-level tension

The evidence for *ambience* is weaker than the evidence against it. Making
scarcity salient is contested and largely failed a 20-study replication audit;
the taxi meter effect — watching a meter reduces the pleasure of the metered
activity — is better evidenced. Realistic behaviour change from passive
consumption feedback is 1–3%.

The strategy already says "ambient indicator **that can be looked at directly**,
meant to help decide how to continue working." The evidence supports the second
half more strongly than the first. That is a reason to make the resting state
carry roughly one bit — fine, or not fine — rather than a reason to change the
strategy.

Also worth holding onto: **being ignored is not the failure mode.** Being
unplugged is. The two causes named are a display that changes when nothing
meaningful happened, and one that is unpleasant to have in your eye line.

### How not to evaluate this

METR's 2025 trial found experienced developers were ~19% slower with AI tools
while believing themselves faster. Introspection about AI-assisted work is
unreliable, so "does it feel helpful?" is not a usable test. Every display choice
here is a hypothesis; the only real evidence would be logging what actually
happened.

## Display spec — the pace bar

Decided 2026-09-07. Interactive sketch: `docs/display-sketch.html`.

### The object

**The bar is the window, not the budget.** Left edge is when the window opened,
right edge is when it resets. Two markers travel across it, both rightward,
because time flies like an arrow.

- **Remaining budget** is a block anchored to the *right* edge. Its **left edge
  sits at your utilization**, so spending pushes it rightward and the block
  shrinks toward the right.
- **The pace tick** sits at `elapsed ÷ window_length`.

The read is the gap between them:

| | Meaning | Treatment |
|---|---|---|
| Tick left of block edge | Behind pace — spending slower than even | Calm, *however little remains* |
| Tick right of block edge | Ahead of pace — burning faster than the window carries | The one state worth a colour change |

The right edge is **both exhaustion and reset**. You race toward it either way;
the only question is which arrives first. If the tick gets there before the block
vanishes, you made it.

### Why this beats what phase 1 does

**It replaces level-based thresholds with a relationship.** "Close to the limit
but behind pace" reads calm, which is correct and which a 60%/85% colour scheme
cannot express. This satisfies the alarm literature's demand for one rare,
meaningful state change instead of two arbitrary ones — the change now fires on
days that are genuinely unusual rather than most working days.

**It is a projection with no volatility.** A burn-rate estimate would answer the
same question, but the fuel-gauge literature says volatile estimates destroy
trust faster than quietly wrong ones. `elapsed ÷ window_length` is deterministic:
it never jumps, never revises, needs no model, and cannot be wrong.

**The bar empties instead of filling**, so it invents no completion goal for goal
gradient to accelerate toward.

### Precision migrates from the budget to the clock

The two quantities move in opposite directions as a window tightens, and this
resolves what looked like a contradiction:

- **The budget** is the thing that can be overspent, and precision provably
  causes overspending. It gets **vaguer**: `34% left` → `about a third left` →
  `nearly out`.
- **The reset time** is reassurance, not a spending signal. It gets **sharper**:
  `resets soon` → `resets in 1h38m`.

Precision moves from the thing you cannot control to the thing that is certain.
The posture is *"you're getting close, but don't worry, it resets in 1h38m."*

### Tick treatment

Three candidates, all evaluated at the hard case — tick within a pixel or two of
the block edge:

- **(a) vertical stroke** overshooting the bar top and bottom. Reads at
  coincidence. Costs ~4px of vertical room.
- **(b) triangular notch**, point up, cut into the lower edge. Reads at
  coincidence, unmistakably a different kind of mark from the block edge, and
  stays inside the bar's footprint.
- **(c) centre dot**, block edge passing it on both sides. Quietest, but at
  coincidence it is half-swallowed by the fill it sits on.

**Leaning (b).** It survives coincidence, costs no vertical space, and cannot be
mistaken for the edge it sits beside. Not final.

### Still open

The 5-hour and 7-day windows want *opposite* treatments — the short one guards
against end-of-window burn, the long one against hoarding — and this spec
currently gives them the same one.

## The PIN — reconsidered

**First assessment was too narrow, and wrong in its conclusion.**

The at-rest encryption value really is near zero. The KDF is
`sha256(pin‖salt)` then 9,999 more rounds, so the entire 4-digit keyspace is
10⁸ hashes: ~35 s in pure Python, sub-second in C, instant on a GPU. The salt is
the eFuse MAC stored in the clear beside the blob, which defeats rainbow tables
and nothing else. Anyone who can run `esptool read_flash` — no soldering, the
same command in our own `flashing.md` — bypasses the 10-attempt lockout entirely,
because that lockout only guards the on-screen entry path.

But at-rest encryption is not the only thing it is for.

**It is the web panel's credential.** Upstream's panel — which phase 1.5 plans to
port — can replace the token, wipe the device, and switch WiFi networks. It
serves over plain HTTP on the LAN. Without the PIN, anyone on the home network
could do all three: guests, a housemate, a compromised smart bulb. That is a far
more plausible attacker than someone stealing a desk robot, and against it a
4-digit PIN with server-side throttling is *appropriate*, because the attack is
online and rate-limited rather than offline and parallel.

**It denies casual continued use of a stolen device.** A device that boots
straight to working quietly spends the owner's quota. One that boots to a PIN
screen is a brick to anyone who cannot dump flash.

**Storing a live credential in plaintext is bad practice regardless**, and
obfuscation costs nothing.

### Decision

**Keep the PIN. Remove the 36-tap boot entry.**

The usability cost was never the PIN itself — it was entering four digits on a
touchscreen with three virtual buttons. Upstream already solved that: a web-panel
login unlocks the device. Porting the panel removes the pain and *strengthens*
the case for keeping the credential.

Do not treat the PIN as protection against physical theft. The control for that
is **revocation** — which argues for the device knowing and displaying its
token's age, so replacing it is routine rather than an emergency.

Rejected: deriving the key from the eFuse instead of a PIN. It would keep the
obfuscation and lose the panel credential, which is the part that turned out to
matter.

## Open questions

- **Does a `claude setup-token` token carry the `user:profile` scope** that
  `/api/oauth/usage` wants? Sources conflict. Two attempts to test have returned
  429 rather than an auth verdict — the test itself is rate-limited.
- **Is that limiter IP-scoped?** Would decide whether this device can coexist
  with a desktop monitor on the same network.
- **Terms of service.** Consumer terms prohibit automated access except via an
  API key; `claude setup-token` is Anthropic's own automation command. See
  `data-inventory.md`. An account-owner call.
- **Tick treatment (a), (b) or (c).** Leaning (b), the notch. See the sketch.
- **How to show that buying through is available.** `extra_usage` and
  `overage-disabled-reason` are on the wire; the decision *"pay to continue?"* is
  real and needs warning in advance, not at the wall.
- **Rationing or use-it-or-lose-it?** Answered, mostly: under-use dominates
  nearly every metered domain studied, so hoarding is the failure to design
  against — *except* in the 5-hour window, whose near, certain, non-rolling
  endpoint is exactly the condition that flips behaviour toward end-of-window
  burn. The two windows want opposite treatments, which the current screen does
  not give them.
