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
  blank them. *Built 2026-09-07.* Two timestamps, deliberately separated: the age
  on screen counts from the last **success**, never the last attempt, because
  every freshness claim depends on success while only the retry schedule cares
  about attempts. Merging them meant a failure reset the counter and the device
  reported freshness it did not have.
- **Staleness is stated in words, not signalled by a colour.** A small element
  changing hue is too quiet a channel for "your numbers are old". The status line
  says `14m old — can't refresh (http_-1)`: age first, because the numbers are
  what the reader came for, then the reason.
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

### Precision migrates by swapping slots, not by fuzzing the number

**Corrected 2026-09-07.** An earlier draft coarsened the budget figure into
words: `34% left` → `about a third left` → `nearly out`. That was a
misreading of the evidence and it shipped a bug.

The research finding was that showing a **range** (`€20–€60` rather than `€40`)
reversed the overspending. A range is honest about its bounds. *"About a third
left"* is not a range — it is a point estimate wearing a disguise, spanning
15–35% and therefore **wrong by a factor of two at the bottom of its own band**.

Two things follow.

**The bar was already the range.** A filled length is read approximately by
nature and cannot overclaim. Layering vague words on top added no imprecision the
geometry did not already provide, and added a way to be wrong.

**Precision migrates by the two quantities trading places.** Follow the rule to
its conclusion and there is a crossover, because the *question* changes:

| Remaining | Headline slot | Footnote slot | Decision being made |
|---|---|---|---|
| ≥ 40% | `62% left` | `resets 3:40pm` | *Should I start this?* |
| < 40% | `3:40pm` | — (or `nearly out` below 12%) | *Should I wait?* |

Late in a window the number worth making big is not how much is left — it is
when you get more. The bar keeps carrying the amount throughout, which is the
honest way to be imprecise about it.

`nearly out` survives below 12%, because it claims **proximity** rather than a
fraction. That is a warning, not a quantity, and cannot be wrong by 2×.

### Screen composition — chrome removed

Decided 2026-09-07. The phase 1 screen spent **62 of 240 pixels — 26%** on
chrome: a 26px title stripe reading "USAGE-CHAN", and a 36px button row reading
"DIM / REFRESH". Both are gone.

- **No title stripe.** The device does not need to tell you its name every
  second of every day. The space may eventually carry a mascot, appearing after
  some period of use or not at all — but it is content's until then, not
  chrome's.
- **No button row.** Tap anywhere to open a menu. That frees the whole height
  and removes the need for `M5.setTouchButtonHeight()`, since the menu reads raw
  touch coordinates rather than the three synthesised zones.
- **The menu is not PIN-protected.** Brightness, refresh interval, and the LAN
  panel's address are all safe to expose to anyone standing at the device. The
  PIN guards the panel, which is where the destructive operations live.
- **Reset time moves to the right end of the bar**, because the right edge *is*
  the reset moment. The label now names the thing its position encodes, and the
  geometry explains itself.
- **Signal strength appears only when poor** — below roughly −75 dBm, where it
  starts to affect a fetch. Drawn as a fan rather than bars, so it can never be
  misread as a second gauge. Keep the main thing the main thing.

### Tick treatment

Three candidates, all evaluated at the hard case — tick within a pixel or two of
the block edge:

- **(a) vertical stroke** overshooting the bar top and bottom. Reads at
  coincidence. Costs ~4px of vertical room.
- **(b) triangular notch**, point up, cut into the lower edge. Reads at
  coincidence, unmistakably a different kind of mark from the block edge, and
  stays inside the bar's footprint.
- **(c) centre dot**, block edge passing it on both sides. Quietest, but a
  circle claims an *area* where the thing it marks is a *position*.
- **(d) centre diamond** — the dot sharpened to points on the axis that matters.
  Same footprint, more specific about exactly where it sits.

All four work once each carries a **one-pixel halo in the background colour**,
which is what lets a mark hold its shape against the dark track and against any
fill colour it overlaps. That was the dot's real problem, and it applies to all
of them.

**Leaning (d), the diamond**, with (b) the notch as the alternative. The stroke
spends ten pixels of height the bar would rather have.

### The 7-day window gets a line, not a bar

Decided 2026-09-07. The two windows want opposite treatments and were getting
identical ones.

The 7-day window moves 1% per 100 minutes, so a bar for it is seen hundreds of
times per window and looks identical nearly every time — the definition of the
wallpaper an ambient display gets tuned out and then unplugged for. Its action is
also diffuse: being ahead of pace means moderating for *days*, with no moment to
act at. And it is the **hoarding** window — uncertain future demand plus costly
exhaustion, the conditions that produce a safety buffer nobody ever spends.

So by default it is one quiet line, no bar and no percentage:

```
7-DAY   behind pace · resets Friday
```

It becomes a full pace bar — the same geometry as the 5-hour one — only when it
is genuinely the binding constraint. The API says which: the
`representative-claim` header was `five_hour` 77% of the time and `seven_day` 23%
in a 37,000-request capture. Collecting it costs **one more string in
`RL_HEADERS[]`** in `api.cpp`, on a response already being parsed.

That makes the screen show *the limit that will stop you*, which is the
conceptual model this project already chose. Presence graded by relevance, the
same way message size is graded by invalidation.

Accepted cost: the layout changes shape occasionally. It has to pass the same
test as the single colour threshold — rare, and always for a reason.

### Words assert, marks compare

An earlier draft read `comfortable to Friday`. That predicts a **result**, which
is why it wanted `at your current pace` bolted on, which is too long to glance at.

The fix is a deletion. State the pace, state the reset, and leave the last step —
trivial arithmetic — to the reader:

- `behind pace` · `on pace` · `ahead of pace`

These describe **now**, not Friday, so they are provisional without a hedge.
They are shorter than what they replace, and they are the vocabulary the tick
already embodies.

A word asserts a conclusion and therefore needs qualifying. A mark shows a
relationship and lets the reader conclude, which is why the pace tick never
needed an "approximately".

### Reset labels: planning register, then urgency register

Wall clock and duration answer different questions. *"Resets at 3:40pm"* is what
you compare against a calendar — the planning register, and the one the
range-anxiety finding is actually about. *"Resets in 12m"* is urgency, and is
better only once the answer is imminent.

| Distance | 5-hour | 7-day |
|---|---|---|
| Plenty | `resets 3:40pm` | `resets Friday` |
| Closing | `resets 3:40pm` | `resets Fri 1pm` |
| Imminent | `resets in 12m` | `resets in 4h` |

### Personality stays out of this layer

The functional line is terse and has no voice. The Chan-ness is icing, so it goes
*on top* rather than stirred in — a face has room for personality, an 11px status
line does not, and every character spent on charm there is spent against
glanceability. Phase 2's expression can be as warm as it likes precisely because
the text under it reads plainly.

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

## Failure is graded by how much it invalidates

Decided 2026-09-07. A message should be as big as the amount of screen it makes
untrue. Four rungs:

| State | What is still true | Treatment |
|---|---|---|
| Weak signal | Everything. Fetches are just slower | Small WiFi glyph, bottom right. Below ~−75 dBm only |
| Stale data | The numbers were true, and are ageing | Keep the last good reading, mark it stale. Never blank it |
| Claude degraded | Your numbers are right — and your work is still blocked | Its own line. A different *kind* of fact from usage |
| No network | Nothing on screen can be trusted | Full-screen overlay. It borks everything, so it covers everything |

**The WiFi mark is arcs radiating from a dot — never bars.** Bars sitting beside
the pace bars would read as a second gauge. The no-network variant is the same
glyph with a slash, shown large inside a translucent lozenge over a dimmed
screen.

*Implementation note:* true translucency on a 16-bit sprite may need a pixel walk
to darken the region rather than a blended fill. A solid lozenge is the fallback
and costs nothing to read.

## Diagnosing failure — measure, don't infer

**Corrected 2026-09-07.** An earlier draft concluded that a failed usage fetch
plus a failed status fetch meant the local network was down. That is not sound.
Both failing is equally consistent with an ISP outage, a DNS failure, a shared
CDN problem, a captive portal wanting re-authentication, or — the sneaky one — a
**device clock so far off that every TLS handshake fails certificate
validation**, which is what an NTP failure looks like from the outside.

The fix is not better inference. It is measuring the thing directly. Only the
first rung below is genuinely "no WiFi", and it is observable for free:

| Observation | Conclusion | Treatment |
|---|---|---|
| `WiFi.status() != WL_CONNECTED` | Not associated with the AP | Full overlay — the only rung that earns it |
| Associated, no DHCP lease | Network is up, we are not on it | Overlay, different wording |
| `time(nullptr)` implausibly small | Clock unset; TLS will fail everywhere | *"clock not set"* — never "no network" |
| DNS resolution fails | Something beyond the AP | Its own message |
| status.claude.com reachable, API not | It is Anthropic | Service line |
| Both reachable, call returns an error | Auth or plan problem | Existing error states |

The clock rung is worth its own line of code. Without it, every failed handshake
gets blamed on the network and the actual remedy — resync NTP — never suggests
itself.

### Exhaust our own remedies before spending the user's attention

The table above is a *diagnosis* ladder, not a messaging one. Nothing in it
should reach the screen until the device has tried to fix it and failed for a
sustained period.

- **NTP.** `syncTime()` currently calls `getLocalTime(&t, 5000)` and **discards
  the return value**, so a boot where NTP does not answer inside five seconds
  proceeds silently with an epoch near zero — countdowns break and every TLS
  handshake fails cert validation. It should retry with backoff, keep retrying in
  the background (a device up for hours may get an answer later), and only then
  say anything. *This is live in the shipped firmware.*
- **DHCP / association.** `WiFi.setAutoReconnect(true)` and an explicit
  reconnect attempt come first.
- **First boot is not failure.** No clock yet on a cold start is *"syncing…"*,
  not an error.

A message the user cannot act on is worse than silence. Say something only when
we have run out of moves and they have one.

## Status headline bar

When there is an unresolved incident, a coloured bar appears at the bottom
carrying the incident **headline**, inviting a tap to read the latest update.
Zero pixels when there is nothing — which is nearly always.

This slots between "small glyph" and "full overlay" on the invalidation ladder,
and it carries *content* rather than merely a state.

**Where the fields come from.** `incidents/unresolved.json` gives `name` (the
headline) and `impact`, both stable — it is the `incident_updates[]` array nested
inside that churns minute by minute. Take the title, ignore the stream.

**The churny data becomes acceptable on tap**, because the user asked for it at
that moment. `incident_updates[0].body` is exactly right for a detail view and
exactly wrong for an ambient one.

### Severity, including the quiet rung

| `impact` | Treatment |
|---|---|
| `major_outage` | Red bar |
| `partial_outage` | Amber bar |
| `degraded_performance` | **Included, but quiet** — dim bar, no colour pop |
| `none` | Nothing |

Degraded performance is visible to Claude users in their own work, so hiding it
would make the device look oblivious. It just does not warrant the same volume.

## WiFi — three states, and only two of them show

| State | On screen | In the menu |
|---|---|---|
| Good enough | Nothing | Full detail: SSID, RSSI, IP |
| Weak | Arc glyph, corner | Same detail |
| No WiFi | Smoke overlay | Same detail |

Detail always lives in the menu; the screen speaks only when it must. Keep the
main thing the main thing.

*Open:* RSSI is a proxy for "will fetches work." Once fetch durations are being
timed, a slow or retried fetch is better evidence of a weak link than a dBm
reading. RSSI is free and instantaneous where fetch history is five minutes
apart, so likely both — RSSI to display, fetch history to corroborate.


## Service status — detect with our own requests, name with the status page

**Our own fetch outcomes are first-hand evidence about the exact endpoint we
care about, arriving every five minutes at no extra cost.** The status page is
second-hand. So the roles are:

- **Detect** with our own request history. Two consecutive failures is evidence;
  one is noise.
- **Name and confirm** with status.claude.com — *is it them, and how bad* — not
  *is something wrong*.

This also fixes the latency problem: we are never more than one poll behind,
because noticing does not depend on Anthropic's publishing cadence.

### Reading it without flickering

status.claude.com posts minute-by-minute updates during an incident. Tracking
that churn would make the *device* the unreliable thing, which is the same
failure mode the alarm literature describes for a threshold that fires too
often — a state that blinks trains people to stop seeing it.

- **Do not read `incident_updates[]`.** That is the churny stream. Read
  `components.json`, whose per-component `status` moves far less.
- **Filter to the two components that matter**: *Claude API (api.anthropic.com)*
  and *Claude Code*. The global `indicator` in `status.json` is stabler still but
  goes amber for a degraded claude.ai web app, which is irrelevant to CLI work.
- **Require two consecutive observations** before changing displayed state, in
  either direction.
- **Gate on severity.** `major_outage` and `partial_outage` earn the line;
  `degraded_performance` gets something quieter or nothing.
- **Show duration, not state.** *"degraded 20m"* is more useful than a light, and
  a duration cannot blink — it either exists or it does not.

Poll it slowly (15–30 min) on top of the failure-triggered fetch, because a
degraded **Claude Code** component can matter while the **API** component, and
therefore our own fetches, stays perfectly healthy.

## Refresh takes ~2.7 seconds — measured

**Measured on hardware 2026-09-07: 2622–2780 ms across ten consecutive
fetches**, tightly clustered. The earlier estimate of 1–3 s was right, and the
consistency matters as much as the figure: this is dominated by a full TLS
handshake, not by variable server latency.

**The spinner is therefore worth keeping.** Three seconds is plainly
perceptible; without it the device would appear frozen every poll. It also
settles the threading question retroactively — under the old blocking design
that was 2.7 s of dead touch per poll, which tap-anywhere would have turned into
an obviously broken device rather than a briefly slow one.

Two things make the TLS handshake unavoidable every time. `fetchUsage()`
constructs a fresh `WiFiClientSecure` on each call (`api.cpp:26`), so no session
is reused. And `CA_BUNDLE` carries three roots, all offered to the verifier.
At a five-minute cadence that waste is affordable, but it is the dominant cost.

**The problem is not the duration, it is that `loop()` is stuck for it.**
`refresh()` calls `fetchUsage()` synchronously, so for those seconds the device
reads no touch, redraws nothing, and updates no countdown. `API_TIMEOUT_MS` is
15,000 — so a hung network freezes the device for **fifteen seconds**.

Phase 1 hid this: with three labelled button zones and a screen that changes
slowly, a brief freeze is invisible. **Tap-anywhere-for-menu removes that cover.**
A tap during a fetch does nothing, with no feedback, which reads as a broken
device rather than a busy one.

So the fetch needs to stop blocking the interface, or to visibly announce
itself, before the menu lands. Which is what the pace-tick-as-spinner idea was
already reaching for: the tick becomes a spinner while a fetch is in flight, and
the refresh cost becomes legible instead of being a mystery freeze.

### Move the fetch off the render loop

There is no reason to block. The ESP32-S3 is dual-core, Arduino's `loop()` runs
pinned to core 1, and core 0 is idle.

- `xTaskCreatePinnedToCore()` a fetch task on core 0. It waits on a
  notification, fetches into a **local** `UsageData`, then copies into the shared
  one under a mutex.
- `loop()` keeps drawing, keeps reading touch, keeps counting down. It reads an
  atomic `g_fetching` flag to drive the spinner.
- The 15-second timeout stops mattering, because nothing waits on it.

Two things this breaks that must be handled rather than discovered:

**The no-locking assumption.** `app_state.h` carries an upstream comment —
*"everything runs on the single Arduino loop task, so no locking is needed"* —
which becomes false. It needs a mutex and an updated comment.

**Stack sizing.** An mbedTLS handshake wants roughly 8–16 KB of task stack, and
underestimating it produces a reboot rather than an error. Budget 16 KB; there is
room, with internal RAM at 15.8% of 320 KB.

This is also what makes the spinner honest: the tick can animate during a fetch
*because the loop is still running*. On a blocked loop a spinner cannot spin,
which is the tell that the whole idea needed this change first.

Measured by wrapping the fetch in `millis()` deltas, logged as
`[FETCH] ok in NNNms`. Kept in place — it costs nothing and it is how the next
regression here gets caught.

## Off must not be persistable

Found on hardware 2026-09-07. Brightness cycled `(n + 1) % 4` across
`{0, 48, 128, 255}` and wrote the result to NVS. Level 0 is a genuinely dark
backlight, so a fourth tap stored a device that boots dark, every time, with no
visible way back.

**The bug was inherited, but the menu is what made it dangerous.** The same
cycle sat on BtnA in phase 1, where "off, and the device keeps running" was a
documented feature — and where a labelled button strip meant you could see
nothing and still press the same button again. An invisible menu removes that:
recovery now requires knowing the geometry rather than reading it.

Two rules, and the second is the general principle:

- **Cycling never lands on off.** It needs a deliberate act, not a fourth tap.
- **A stored 0 boots visible.** Off is a runtime state a power cycle clears.

Generally: *a control that can make the device appear broken must not be able to
persist that state.* Worth applying to anything else that ends up in the menu —
a refresh interval of "never", a WiFi setting that cannot connect.

## Touch targets need ~7mm

34px rows on this panel are about 5.4mm at ~160 px/inch, and were unreliable to
hit. 46px is ~7.3mm and works.

Five comfortable rows do not fit 240px and four do, so the menu lost a row
rather than its margins. The version moved into the header, which is where an
"About" row was headed anyway.

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
