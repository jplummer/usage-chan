# Design decisions

Decisions and the reasoning behind them, so the context can be reloaded without rereading the whole conversation. Decisions, not a transcript. `plan.md` holds the build sequence; this holds the *why*.

---

## Strategy — what this device is for

**An ambient indicator that can be looked at directly for more detail, meant to help decide how to continue working.** The Stack-Chan-ness is friendly icing on a functional cake.

That settles a stack of smaller questions:

- **Glanceable first.** The common case is peripheral vision, not reading. Detail
is available on inspection, but nothing should require it.
- **Decision support, not accounting.** The questions it answers are *"can I
start this now, or should I wait?"* and *"is paying to continue an option?"* — not *"what did I spend?"*
- **So dollar and token totals are out**, and not reluctantly. They answer a
different question.
- **The face is a later layer, not the point.** Phase 2 stays phase 2.

### What it can never do

Not scope choices — hard limits, recorded so they stop being re-litigated.

**Per-day token and dollar totals, spend trends, per-model spend breakdown.** Computed by desktop tools from Claude Code's session logs on the Mac (`~/.claude/projects/**/*.jsonl`) times a downloaded pricing table. No Anthropic endpoint carries them. A device off your machine cannot ever show them.

**How full the context window is in the chat you're in.** A real need — arguably a more urgent one than rate limits — but it lives inside a client session and nothing external can see it. Worth its own project, not this one.

---

## Conceptual model — limits, not windows

**Current model:** two independent windows, side by side, user works out which one matters.

**Domain model:** a set of limits, one of which is *currently binding*. Anthropic says so explicitly — `representative-claim` in the response headers, `is_active` in the `limits[]` array — and Claude Code's own usage bar displays exactly that.

Ours is a mismatch, and it shows up as work handed to the user: read two numbers, compare them against two different reset times, decide which governs. The server already knows.

**Direction:** the object is a **limit**, shaped roughly `{name, utilization, resetsAt, windowSeconds, isBinding}`. Several exist. One binds. That shape is not invented here — it is what OpenUsage exposes on its own local API, arrived at independently.

Not yet built. Recorded so the surface work doesn't start from the wrong object.

### A trap to avoid

Two different quantities get rendered as "Opus 58%": share of a *limit*, and share of *spending*. Different meanings, identical presentation. Whatever this device shows must not be ambiguous about which it is.

---

## Polling — 5 minutes, and why the ceiling is low

**Decision: 300s default, 120s floor, 900s ceiling.** Changed 2026-09-05 from an effective 60s.

Three reasons, which agree:

1. **Faster shows nothing.** The 5-hour window is 300 minutes, so whole-percent
utilization moves once every three minutes at maximum burn. The 7-day window moves 1% per 100 minutes. Countdowns are computed locally from a stored reset time and need no polling at all.
2. **The observer is part of the measurement.** Every poll is a real API call
against the budget being displayed. Small, but a reason to sample politely.
3. **The server rate-limits hard.** See below.

The 60s was a bug: `config.h` said 120 while the setup portal shipped 60 pre-selected, and the portal won. Devices provisioned before the fix made 1,440 calls a day. The floor at 120 repairs them on next boot, since stored values are clamped on load.

---

## The two usage surfaces, and why we are still on the older one

| | `POST /v1/messages` headers | `GET /api/oauth/usage` |
|---|---|---|
| Inference cost | A real call | None |
| Per-model weeklies | No | Yes, via `limits[]` |
| Rate limiting | Normal, auth checked first | **Aggressive, checked before auth** |

The second is richer and free, which made it look like an obvious upgrade. Two things argue against rushing:

**Its limiter appears not to be account-scoped.** An unauthenticated request with no `Authorization` header at all returns `429`, not `401` — so throttling happens *before* authentication. On `/v1/messages` the same unauthenticated request returns `401`. Observed `retry-after` on that 429: **784 seconds**, just over 13 minutes.

Pre-auth throttling behind Cloudflare most likely means it is keyed on IP. *Inference, not proof* — testing it properly needs a second IP. But if it holds, the budget is shared by **everything behind one home network**: a desktop monitor, a terminal, and this device would all draw on the same bucket. That is consistent with OpenUsage implementing a five-minute lockout after a 429 and telling users in its own interface that manual refreshes make it worse.

**Its schema is moving.** `seven_day_opus` and `seven_day_sonnet` now return `null`; per-model weeklies migrated into `limits[]` as `weekly_scoped` entries keyed by `scope.model.display_name`. Any client here must iterate that array rather than hard-code names, and ignore what it does not recognise.

**Decision: stay on the header probe for now.** Revisit if per-model weeklies become worth it. If we switch, `retry-after` must be honoured up to a quarter hour, and a 429 must serve the last good reading rather than blanking.

---

## Failure behaviour — say "I don't know" loudly

The device should never show a confident number it cannot stand behind. Established practice worth copying from OpenUsage:

- **A failed fetch keeps the last good values** and marks them stale. It does not
blank them. *Built 2026-09-07.* Two timestamps, deliberately separated: the age on screen counts from the last **success**, never the last attempt, because every freshness claim depends on success while only the retry schedule cares about attempts. Merging them meant a failure reset the counter and the device reported freshness it did not have.
- **Staleness is stated in words, not signalled by a colour.** A small element
changing hue is too quiet a channel for "your numbers are old". The status line says `14m old, can't refresh (http_-1)`: age first, because the numbers are what the reader came for, then the reason.
- **A missing field omits its row** rather than rendering zero.
- **"No data" is not "0".** A confident zero is indistinguishable from "nothing
has been recorded yet", and contradicts a live meter that says otherwise.
- **"Not started" beats a countdown** when there is no reset time to count to.
- **Authenticated-but-no-usage-headers is its own state**, not an error. It is
the normal condition on Enterprise and API-billed accounts.

---

## Licensing and publication

MIT throughout, public repo. PolyForm Noncommercial was considered and dropped: not OSI-approved, so it would deter contributors, and the MIT grant on the vendored files could not have been narrowed anyway. Publishing a near-derivative of an MIT project under stricter terms also reads as ungenerous.

---

## Display — five conflicts between the current screen and the evidence

Research is in `docs/research-limit-behaviour.md`. Five things the phase 1 screen does that the evidence argues against. **None resolved yet** — recorded so the redesign starts from a list rather than a vibe.

**1. The bar fills.** `drawUsageBlock()` draws a bar that grows with utilization. A bar filling toward "complete" invents a completion goal, and goal gradient then predicts acceleration toward it — the end-of-window burn we most want to avoid. A bar that *empties* invents nothing. Cheapest fix on the list, and the one with the clearest theory behind it.

**2. Two level-based thresholds.** Amber at 60%, red at 85%. The alarm literature says people probability-match their response rate to an alert's hit rate, so a 60% threshold firing on most working days goes invisible in a week and discredits the 85% behind it. The evidence wants **one** state change, tied to a projection crossing a line, not a level.

**3. Precision runs the wrong way at the top.** Currently one decimal below 10% and whole percent above. Directionally right at the low end, but it never gets coarser as the window closes — which is where precision provably causes overspending. Wants a band near exhaustion, not a number.

**4. The countdown is the smallest thing on screen.** Percentage at 24pt bold, "resets in 2h 14m" at 16px dim. The evidence says time-to-reset is the single most effective defence against hoarding, because it converts "I am running out" into "I get more at 3:40". The weighting is backwards.

**5. It shows used, not remaining.** Utilization is what the API reports, so this was inherited rather than chosen. "38% left" matches the question the user is actually asking. Not clear-cut — the small-area effect means a lone shrinking number grabs attention hardest late — which is another argument for pairing it with the countdown rather than showing it alone.

### And one strategy-level tension

The evidence for *ambience* is weaker than the evidence against it. Making scarcity salient is contested and largely failed a 20-study replication audit; the taxi meter effect — watching a meter reduces the pleasure of the metered activity — is better evidenced. Realistic behaviour change from passive consumption feedback is 1–3%.

The strategy already says "ambient indicator **that can be looked at directly**, meant to help decide how to continue working." The evidence supports the second half more strongly than the first. That is a reason to make the resting state carry roughly one bit — fine, or not fine — rather than a reason to change the strategy.

Also worth holding onto: **being ignored is not the failure mode.** Being unplugged is. The two causes named are a display that changes when nothing meaningful happened, and one that is unpleasant to have in your eye line.

### How not to evaluate this

METR's 2025 trial found experienced developers were ~19% slower with AI tools while believing themselves faster. Introspection about AI-assisted work is unreliable, so "does it feel helpful?" is not a usable test. Every display choice here is a hypothesis; the only real evidence would be logging what actually happened.

## Display spec — the pace bar

Decided 2026-09-07. Interactive sketch: `docs/display-sketch.html`.

### The object

**The bar is the window, not the budget.** Left edge is when the window opened, right edge is when it resets. Two markers travel across it, both rightward, because time flies like an arrow.

- **Remaining budget** is a block anchored to the *right* edge. Its **left edge
sits at your utilization**, so spending pushes it rightward and the block shrinks toward the right.
- **The pace tick** sits at `elapsed ÷ window_length`.

The read is the gap between them:

| | Meaning | Treatment |
|---|---|---|
| Tick left of block edge | Behind pace — spending slower than even | Calm, *however little remains* |
| Tick right of block edge | Ahead of pace — burning faster than the window carries | The one state worth a colour change |

The right edge is **both exhaustion and reset**. You race toward it either way; the only question is which arrives first. If the tick gets there before the block vanishes, you made it.

### Why this beats what phase 1 does

**It replaces level-based thresholds with a relationship.** "Close to the limit but behind pace" reads calm, which is correct and which a 60%/85% colour scheme cannot express. This satisfies the alarm literature's demand for one rare, meaningful state change instead of two arbitrary ones — the change now fires on days that are genuinely unusual rather than most working days.

**It is a projection with no volatility.** A burn-rate estimate would answer the same question, but the fuel-gauge literature says volatile estimates destroy trust faster than quietly wrong ones. `elapsed ÷ window_length` is deterministic: it never jumps, never revises, needs no model, and cannot be wrong.

**The bar empties instead of filling**, so it invents no completion goal for goal gradient to accelerate toward.

### Precision migrates by swapping slots, not by fuzzing the number

**Corrected 2026-09-07.** An earlier draft coarsened the budget figure into words: `34% left` → `about a third left` → `nearly out`. That was a misreading of the evidence and it shipped a bug.

The research finding was that showing a **range** (`€20–€60` rather than `€40`) reversed the overspending. A range is honest about its bounds. *"About a third left"* is not a range — it is a point estimate wearing a disguise, spanning 15–35% and therefore **wrong by a factor of two at the bottom of its own band**.

Two things follow.

**The bar was already the range.** A filled length is read approximately by nature and cannot overclaim. Layering vague words on top added no imprecision the geometry did not already provide, and added a way to be wrong.

**Precision migrates by the two quantities trading places.** Follow the rule to its conclusion and there is a crossover, because the *question* changes:

| Remaining | Headline slot | Footnote slot | Decision being made |
|---|---|---|---|
| ≥ 40% | `62% left` | `resets 3:40pm` | *Should I start this?* |
| < 40% | `3:40pm` | — (or `nearly out` below 12%) | *Should I wait?* |

Late in a window the number worth making big is not how much is left — it is when you get more. The bar keeps carrying the amount throughout, which is the honest way to be imprecise about it.

`nearly out` survives below 12%, because it claims **proximity** rather than a fraction. That is a warning, not a quantity, and cannot be wrong by 2×.

### Screen composition — chrome removed

Decided 2026-09-07. The phase 1 screen spent **62 of 240 pixels — 26%** on chrome: a 26px title stripe reading "USAGE-CHAN", and a 36px button row reading "DIM / REFRESH". Both are gone.

- **No title stripe.** The device does not need to tell you its name every
second of every day. The space may eventually carry a mascot, appearing after some period of use or not at all — but it is content's until then, not chrome's.
- **No button row.** Tap anywhere to open a menu. That frees the whole height
and removes the need for `M5.setTouchButtonHeight()`, since the menu reads raw touch coordinates rather than the three synthesised zones.
- **The menu is not PIN-protected.** Brightness, refresh interval, and the LAN
panel's address are all safe to expose to anyone standing at the device. The PIN guards the panel, which is where the destructive operations live.
- **Reset time moves to the right end of the bar**, because the right edge *is*
the reset moment. The label now names the thing its position encodes, and the geometry explains itself.
- **Signal strength appears only when poor** — below roughly −75 dBm, where it
starts to affect a fetch. Drawn as a fan rather than bars, so it can never be misread as a second gauge. Keep the main thing the main thing.

### Tick treatment

Three candidates, all evaluated at the hard case — tick within a pixel or two of the block edge:

- **(a) vertical stroke** overshooting the bar top and bottom. Reads at
coincidence. Costs ~4px of vertical room.
- **(b) triangular notch**, point up, cut into the lower edge. Reads at
coincidence, unmistakably a different kind of mark from the block edge, and stays inside the bar's footprint.
- **(c) centre dot**, block edge passing it on both sides. Quietest, but a
circle claims an *area* where the thing it marks is a *position*.
- **(d) centre diamond** — the dot sharpened to points on the axis that matters.
Same footprint, more specific about exactly where it sits.

All four work once each carries a **one-pixel halo in the background colour**, which is what lets a mark hold its shape against the dark track and against any fill colour it overlaps. That was the dot's real problem, and it applies to all of them.

**Leaning (d), the diamond**, with (b) the notch as the alternative. The stroke spends ten pixels of height the bar would rather have.

**Decided 2026-09-08: the diamond.** It shipped as the diamond and survived two days of use without complaint. Closed; the sketch keeps the other three for the record.

### The caption under the diamond

Decided 2026-09-08, from use. Colour said *ahead* and nothing connected that to the diamond, so the mark was doing its job for someone who already knew what it meant and nobody else. The fix is the cheapest form of the "legend as the real bar, annotated" idea: one caption, no leader line, riding under the diamond and explaining it by sitting on it.

Five steps rather than three, keyed to the same breaks the colour uses so words and colour can never disagree:

| Gap (util − elapsed) | Caption | Colour |
|---|---|---|
| < −15% | `well behind` | dim |
| −15% to −2% | `a little behind` | dim |
| ±2% | `on pace` | dim |
| +2% to +15% | `a little ahead` | amber |
| > +15% | `well ahead` | red |

The three-word version (`behind pace · on pace · ahead of pace`) was the alternative, on the argument that colour already carries degree and every extra word runs into the bar's ends sooner. Five was chosen because "a little ahead" is the phrase that actually helps decide whether to keep going. Same rule on both bars, so the diamond is explained once.

**The caption gets its own row.** A caption that tracks the diamond collides with a reset label on the same row for roughly the second half of every window, which is too often for any dodge to feel stable. So the rows under a bar are fixed: caption, then footnote. On the 7-day bar the reset label moved to the right end of the label row instead, which keeps its position meaning.

### The 7-day window gets a line, not a bar

Decided 2026-09-07. The two windows want opposite treatments and were getting identical ones.

The 7-day window moves 1% per 100 minutes, so a bar for it is seen hundreds of times per window and looks identical nearly every time — the definition of the wallpaper an ambient display gets tuned out and then unplugged for. Its action is also diffuse: being ahead of pace means moderating for *days*, with no moment to act at. And it is the **hoarding** window — uncertain future demand plus costly exhaustion, the conditions that produce a safety buffer nobody ever spends.

So by default it is one quiet line, no bar and no percentage:

```
7-DAY   behind pace · resets Friday
```

It becomes a full pace bar — the same geometry as the 5-hour one — only when it is genuinely the binding constraint. The API says which: the `representative-claim` header was `five_hour` 77% of the time and `seven_day` 23% in a 37,000-request capture. Collecting it costs **one more string in `RL_HEADERS[]`** in `api.cpp`, on a response already being parsed.

That makes the screen show *the limit that will stop you*, which is the conceptual model this project already chose. Presence graded by relevance, the same way message size is graded by invalidation.

Accepted cost: the layout changes shape occasionally. It has to pass the same test as the single colour threshold — rare, and always for a reason.

### Reversed 2026-09-08: a thin bar divided into sevenths

Two days of use found the line invisible, and for a reason the reasoning above predicted without noticing: it nearly always read `behind pace`, and a thing that never changes gets tuned out. The argument against a 7-day *bar* was that it would look identical for days. The line looked identical for the same days, with less to look at.

So it is now a thin bar, 8px against the 5-hour bar's 24, with the same right-anchored block and the same diamond, and six faint divisions at sevenths of the window. The gap between the markers moves, slowly, which is what the line lacked, and the divisions give the diamond a position that means something on its own — "Thursday-ish".

Two things kept from the original decision. The divisions are a **scale, not data**: unlike the parked week strip they cannot lie about days the device was unplugged, because they encode nothing. And the window does not start at midnight, so the divisions sit at fixed sevenths and nothing labels them by name. Promotion to a full bar when the server says 7-day is binding stays.

The hoarding worry stands in principle. A thin bar with a marker on it reads as a calendar rather than a gauge, which is the planning register the reset treatment was reaching for anyway. If it turns out to produce a safety buffer nobody spends, that is a finding worth recording here.

### Words assert, marks compare

An earlier draft read `comfortable to Friday`. That predicts a **result**, which is why it wanted `at your current pace` bolted on, which is too long to glance at.

The fix is a deletion. State the pace, state the reset, and leave the last step — trivial arithmetic — to the reader:

- `behind pace` · `on pace` · `ahead of pace`

These describe **now**, not Friday, so they are provisional without a hedge. They are shorter than what they replace, and they are the vocabulary the tick already embodies.

A word asserts a conclusion and therefore needs qualifying. A mark shows a relationship and lets the reader conclude, which is why the pace tick never needed an "approximately".

### Reset labels: planning register, then urgency register

Wall clock and duration answer different questions. *"Resets at 3:40pm"* is what you compare against a calendar — the planning register, and the one the range-anxiety finding is actually about. *"Resets in 12m"* is urgency, and is better only once the answer is imminent.

| Distance | 5-hour | 7-day |
|---|---|---|
| Plenty | `resets 3:40pm` | `resets Friday` |
| Closing | `resets 3:40pm` | `resets Fri 1pm` |
| Imminent | `resets in 12m` | `resets in 4h` |

### Personality stays out of this layer

The functional line is terse and has no voice. The Chan-ness is icing, so it goes *on top* rather than stirred in — a face has room for personality, an 11px status line does not, and every character spent on charm there is spent against glanceability. Phase 2's expression can be as warm as it likes precisely because the text under it reads plainly.

## The simulator is the spec

Decided 2026-09-08. `docs/sim/` draws the device's screens in a browser from the device's own glyph bitmaps and LovyanGFX's own shape loops, pixel-doubled. Earlier sketches approximated the panel in a web face, which made every typographic judgement a guess. Now a face that looks right in the sim looks right on the panel, and the only things a hardware check adds are backlight and viewing angle. `screens.js` is a port of `ui.cpp`; when one changes the other changes in the same commit, and a disagreement between them is a finding.

The first render found one: the status line's em dash, which Font2 cannot draw, had been a blank on the device since it shipped.

**PIN entry becomes a keypad.** Decided from the sim, 2026-09-08: ten targets in a 3×4 grid, four masked slots above, the fourth digit submits. Replaces the 36-tap digit cycling and the labelled button strip that existed to serve it.

## Figma was lying about type, and now it isn't

The sim closed the gap between the browser and the panel. It did nothing about the gap between Figma and either one, and that is where the next typographic error came from.

The vertical dashboard was drawn in Figma with a big headline beside the bars. On the device that headline gets 129px — what is left of 320 after two bars and the reserved control column. At the 24pt face the layout called for, "100% left" measures 205px, "near cap" 196px, and "blocked" 180px. Every realistic string overflowed, and because the control column is painted after the text, the overflow was not even visible as overflow — it was quietly erased. The thin column was worse in proportion: "a little behind" is 87px of text in a 48px slot, in the smallest face that exists. Nothing in Figma said any of this. The sim said all of it on the first render.

So the fix is the same one, one tool upstream. `tools/fonts2ttf.py` builds a TrueType file per face out of the same glyph data the sim draws from — exact outlines, exact advance widths — and Figma can then set type the panel will actually honour. Every face uses an em of 100 device pixels, so one size works for all of them: 100 at device scale, 200 on a 2x canvas, and no other number to type. The digit in the family name is the source face's point label, kept so it matches what `ui.cpp` asks for — not a size, and not a pixel height. Font2 gets covered too, which matters, because Font2 is where most of the text on this device lives and there has never been a TTF of it anywhere.

Checked rather than assumed: test strings rasterise pixel for pixel identical to LovyanGFX's own output, and widths match the sim exactly on Font2 across 428 strings. Font2 carries nearly every string this device draws, so in practice the two agree.

Three narrow places where they don't, all of them LovyanGFX behaviours a font file cannot carry. A string whose first glyph reaches left of the pen gets nudged 1px right by the device, and measured 1px wider, so it sits 1px further along on the panel than in Figma — that is `_` in the FreeSans faces, `W`, `v` and `y` in DejaVu 9, `J`, `V`, `v` and `y` in DejaVu 12, and `J` in DejaVu 18. A string's reported width also includes the last glyph's ink where it overhangs its own advance, which an advance-based TTF width does not. And where a glyph's ink is wider than its advance, the next glyph's background fill erases the overlap on the panel, so the device shows slightly less of it than Figma will.

None of those glyphs starts a string in the shipped UI, Font2 has none of them at all, and the worst case anywhere is 2px. Leave 2px of slack, and check the sim for anything that close to its budget.

Two things this does not fix. The Figma file is drawn at 2x, so every budget still needs halving before it means anything — an easy way to believe there is twice the room there is. And accurate type does not create room. 129px is a geometry decision, not a font-size decision; if the headline should be big, something else in the layout has to move.

## The PIN — reconsidered

**First assessment was too narrow, and wrong in its conclusion.**

The at-rest encryption value really is near zero. The KDF is `sha256(pin‖salt)` then 9,999 more rounds, so the entire 4-digit keyspace is 10⁸ hashes: ~35 s in pure Python, sub-second in C, instant on a GPU. The salt is the eFuse MAC stored in the clear beside the blob, which defeats rainbow tables and nothing else. Anyone who can run `esptool read_flash` — no soldering, the same command in our own `flashing.md` — bypasses the 10-attempt lockout entirely, because that lockout only guards the on-screen entry path.

But at-rest encryption is not the only thing it is for.

**It is the web panel's credential.** Upstream's panel — which phase 1.5 plans to port — can replace the token, wipe the device, and switch WiFi networks. It serves over plain HTTP on the LAN. Without the PIN, anyone on the home network could do all three: guests, a housemate, a compromised smart bulb. That is a far more plausible attacker than someone stealing a desk robot, and against it a 4-digit PIN with server-side throttling is *appropriate*, because the attack is online and rate-limited rather than offline and parallel.

**It denies casual continued use of a stolen device.** A device that boots straight to working quietly spends the owner's quota. One that boots to a PIN screen is a brick to anyone who cannot dump flash.

**Storing a live credential in plaintext is bad practice regardless**, and obfuscation costs nothing.

### Decision

**Keep the PIN. Remove the 36-tap boot entry.**

The usability cost was never the PIN itself — it was entering four digits on a touchscreen with three virtual buttons. Upstream already solved that: a web-panel login unlocks the device. Porting the panel removes the pain and *strengthens* the case for keeping the credential.

Do not treat the PIN as protection against physical theft. The control for that is **revocation** — which argues for the device knowing and displaying its token's age, so replacing it is routine rather than an emergency.

Rejected: deriving the key from the eFuse instead of a PIN. It would keep the obfuscation and lose the panel credential, which is the part that turned out to matter.

## Failure is graded by how much it invalidates

Decided 2026-09-07. A message should be as big as the amount of screen it makes untrue. Four rungs:

| State | What is still true | Treatment |
|---|---|---|
| Weak signal | Everything. Fetches are just slower | Small WiFi glyph, bottom right. Below ~−75 dBm only |
| Stale data | The numbers were true, and are ageing | Keep the last good reading, mark it stale. Never blank it |
| Claude degraded | Your numbers are right — and your work is still blocked | Its own line. A different *kind* of fact from usage |
| No network | Nothing on screen can be trusted | Full-screen overlay. It borks everything, so it covers everything |

**The WiFi mark is arcs radiating from a dot — never bars.** Bars sitting beside the pace bars would read as a second gauge. The no-network variant is the same glyph with a slash, shown large inside a translucent lozenge over a dimmed screen.

*Implementation note:* true translucency on a 16-bit sprite may need a pixel walk to darken the region rather than a blended fill. A solid lozenge is the fallback and costs nothing to read.

## Diagnosing failure — measure, don't infer

**Corrected 2026-09-07.** An earlier draft concluded that a failed usage fetch plus a failed status fetch meant the local network was down. That is not sound. Both failing is equally consistent with an ISP outage, a DNS failure, a shared CDN problem, a captive portal wanting re-authentication, or — the sneaky one — a **device clock so far off that every TLS handshake fails certificate validation**, which is what an NTP failure looks like from the outside.

The fix is not better inference. It is measuring the thing directly. Only the first rung below is genuinely "no WiFi", and it is observable for free:

| Observation | Conclusion | Treatment |
|---|---|---|
| `WiFi.status() != WL_CONNECTED` | Not associated with the AP | Full overlay — the only rung that earns it |
| Associated, no DHCP lease | Network is up, we are not on it | Overlay, different wording |
| `time(nullptr)` implausibly small | Clock unset; TLS will fail everywhere | *"clock not set"* — never "no network" |
| DNS resolution fails | Something beyond the AP | Its own message |
| status.claude.com reachable, API not | It is Anthropic | Service line |
| Both reachable, call returns an error | Auth or plan problem | Existing error states |

The clock rung is worth its own line of code. Without it, every failed handshake gets blamed on the network and the actual remedy — resync NTP — never suggests itself.

### Exhaust our own remedies before spending the user's attention

The table above is a *diagnosis* ladder, not a messaging one. Nothing in it should reach the screen until the device has tried to fix it and failed for a sustained period.

- **NTP.** `syncTime()` currently calls `getLocalTime(&t, 5000)` and **discards
the return value**, so a boot where NTP does not answer inside five seconds proceeds silently with an epoch near zero — countdowns break and every TLS handshake fails cert validation. It should retry with backoff, keep retrying in the background (a device up for hours may get an answer later), and only then say anything. *This is live in the shipped firmware.*
- **DHCP / association.** `WiFi.setAutoReconnect(true)` and an explicit
reconnect attempt come first.
- **First boot is not failure.** No clock yet on a cold start is *"syncing…"*,
not an error.

A message the user cannot act on is worse than silence. Say something only when we have run out of moves and they have one.

## Status headline bar

When there is an unresolved incident, a coloured bar appears at the bottom carrying the incident **headline**, inviting a tap to read the latest update. Zero pixels when there is nothing — which is nearly always.

This slots between "small glyph" and "full overlay" on the invalidation ladder, and it carries *content* rather than merely a state.

**Where the fields come from.** `incidents/unresolved.json` gives `name` (the headline) and `impact`, both stable — it is the `incident_updates[]` array nested inside that churns minute by minute. Take the title, ignore the stream.

**The churny data becomes acceptable on tap**, because the user asked for it at that moment. `incident_updates[0].body` is exactly right for a detail view and exactly wrong for an ambient one.

### Severity, including the quiet rung

| `impact` | Treatment |
|---|---|
| `major_outage` | Red bar |
| `partial_outage` | Amber bar |
| `degraded_performance` | **Included, but quiet** — dim bar, no colour pop |
| `none` | Nothing |

Degraded performance is visible to Claude users in their own work, so hiding it would make the device look oblivious. It just does not warrant the same volume.

## WiFi — three states, and only two of them show

| State | On screen | In the menu |
|---|---|---|
| Good enough | Nothing | Full detail: SSID, RSSI, IP |
| Weak | Arc glyph, corner | Same detail |
| No WiFi | Smoke overlay | Same detail |

Detail always lives in the menu; the screen speaks only when it must. Keep the main thing the main thing.

*Open:* RSSI is a proxy for "will fetches work." Once fetch durations are being timed, a slow or retried fetch is better evidence of a weak link than a dBm reading. RSSI is free and instantaneous where fetch history is five minutes apart, so likely both — RSSI to display, fetch history to corroborate.


## Service status — detect with our own requests, name with the status page

**Our own fetch outcomes are first-hand evidence about the exact endpoint we care about, arriving every five minutes at no extra cost.** The status page is second-hand. So the roles are:

- **Detect** with our own request history. Two consecutive failures is evidence;
one is noise.
- **Name and confirm** with status.claude.com — *is it them, and how bad* — not
*is something wrong*.

This also fixes the latency problem: we are never more than one poll behind, because noticing does not depend on Anthropic's publishing cadence.

### Reading it without flickering

status.claude.com posts minute-by-minute updates during an incident. Tracking that churn would make the *device* the unreliable thing, which is the same failure mode the alarm literature describes for a threshold that fires too often — a state that blinks trains people to stop seeing it.

- **Do not read `incident_updates[]`.** That is the churny stream. Read
`components.json`, whose per-component `status` moves far less.
- **Filter to the two components that matter**: *Claude API (api.anthropic.com)*
and *Claude Code*. The global `indicator` in `status.json` is stabler still but goes amber for a degraded claude.ai web app, which is irrelevant to CLI work.
- **Require two consecutive observations** before changing displayed state, in
either direction.
- **Gate on severity.** `major_outage` and `partial_outage` earn the line;
`degraded_performance` gets something quieter or nothing.
- **Show duration, not state.** *"degraded 20m"* is more useful than a light, and
a duration cannot blink — it either exists or it does not.

Poll it slowly (15–30 min) on top of the failure-triggered fetch, because a degraded **Claude Code** component can matter while the **API** component, and therefore our own fetches, stays perfectly healthy.

## Refresh takes ~2.7 seconds — measured

**Measured on hardware 2026-09-07: 2622–2780 ms across ten consecutive fetches**, tightly clustered. The earlier estimate of 1–3 s was right, and the consistency matters as much as the figure: this is dominated by a full TLS handshake, not by variable server latency.

**The spinner is therefore worth keeping.** Three seconds is plainly perceptible; without it the device would appear frozen every poll. It also settles the threading question retroactively — under the old blocking design that was 2.7 s of dead touch per poll, which tap-anywhere would have turned into an obviously broken device rather than a briefly slow one.

Two things make the TLS handshake unavoidable every time. `fetchUsage()` constructs a fresh `WiFiClientSecure` on each call (`api.cpp:26`), so no session is reused. And `CA_BUNDLE` carries three roots, all offered to the verifier. At a five-minute cadence that waste is affordable, but it is the dominant cost.

**The problem is not the duration, it is that `loop()` is stuck for it.** `refresh()` calls `fetchUsage()` synchronously, so for those seconds the device reads no touch, redraws nothing, and updates no countdown. `API_TIMEOUT_MS` is 15,000 — so a hung network freezes the device for **fifteen seconds**.

Phase 1 hid this: with three labelled button zones and a screen that changes slowly, a brief freeze is invisible. **Tap-anywhere-for-menu removes that cover.** A tap during a fetch does nothing, with no feedback, which reads as a broken device rather than a busy one.

So the fetch needs to stop blocking the interface, or to visibly announce itself, before the menu lands. Which is what the pace-tick-as-spinner idea was already reaching for: the tick becomes a spinner while a fetch is in flight, and the refresh cost becomes legible instead of being a mystery freeze.

### Move the fetch off the render loop

There is no reason to block. The ESP32-S3 is dual-core, Arduino's `loop()` runs pinned to core 1, and core 0 is idle.

- `xTaskCreatePinnedToCore()` a fetch task on core 0. It waits on a
notification, fetches into a **local** `UsageData`, then copies into the shared one under a mutex.
- `loop()` keeps drawing, keeps reading touch, keeps counting down. It reads an
atomic `g_fetching` flag to drive the spinner.
- The 15-second timeout stops mattering, because nothing waits on it.

Two things this breaks that must be handled rather than discovered:

**The no-locking assumption.** `app_state.h` carries an upstream comment — *"everything runs on the single Arduino loop task, so no locking is needed"* — which becomes false. It needs a mutex and an updated comment.

**Stack sizing.** An mbedTLS handshake wants roughly 8–16 KB of task stack, and underestimating it produces a reboot rather than an error. Budget 16 KB; there is room, with internal RAM at 15.8% of 320 KB.

This is also what makes the spinner honest: the tick can animate during a fetch *because the loop is still running*. On a blocked loop a spinner cannot spin, which is the tell that the whole idea needed this change first.

Measured by wrapping the fetch in `millis()` deltas, logged as `[FETCH] ok in NNNms`. Kept in place — it costs nothing and it is how the next regression here gets caught.

## Off must not be persistable

Found on hardware 2026-09-07. Brightness cycled `(n + 1) % 4` across `{0, 48, 128, 255}` and wrote the result to NVS. Level 0 is a genuinely dark backlight, so a fourth tap stored a device that boots dark, every time, with no visible way back.

**The bug was inherited, but the menu is what made it dangerous.** The same cycle sat on BtnA in phase 1, where "off, and the device keeps running" was a documented feature — and where a labelled button strip meant you could see nothing and still press the same button again. An invisible menu removes that: recovery now requires knowing the geometry rather than reading it.

Two rules, and the second is the general principle:

- **Cycling never lands on off.** It needs a deliberate act, not a fourth tap.
- **A stored 0 boots visible.** Off is a runtime state a power cycle clears.

Generally: *a control that can make the device appear broken must not be able to persist that state.* Worth applying to anything else that ends up in the menu — a refresh interval of "never", a WiFi setting that cannot connect.

### 2026-09-08: chosen, not cycled

Three steps were too few, and cycling was the wrong control from the start: you cannot see which tap you are on, and more steps make that worse. The row now shows five dots with the live one filled, and a tap on a dot applies it at once, so the choice is made by looking at the screen rather than by counting.

Five levels at 32, 64, 110, 175 and 255, roughly even in perceived brightness. None is off. The scale lives under its own NVS key, `bright5`, because the old 0–3 scale where 0 meant off is a different schema and an old value says nothing about this one; anything out of range falls back to the middle dot, the same treatment the refresh interval got.

*Not yet done:* the CoreS3 carries an ambient light sensor on its front panel. If the Stack-Chan shell leaves it uncovered, auto-brightness would answer this and the nightstand-at-2am item at once. Unverified on hardware.

## Overage — the device did not know

Found in use 2026-09-08. The account went into extra-usage billing for a while, and the screen said `nearly out` throughout. Two bugs, different sizes.

The small one needed no new data: below 12% remaining the footnote said `nearly out` all the way to zero, so at 100% used it was plainly false. It now says `out` at zero. The reset clock was already the headline there, which is right — nothing to decide but when.

The large one is that nothing on the device knew overage existed. The headers for it arrive on every response already being parsed: an overall `status`, plus `overage-status`, `overage-utilization`, `overage-reset` and `overage-disabled-reason`. None were read, and nobody has captured what they look like while overage is active. Two things a display cannot be designed without knowing: whether `5h-utilization` sits at 1.0 during overage or climbs past it, and whether `overage-status` takes a distinct value or stays `allowed` while only `overage-utilization` moves.

**So this is a spike, not a feature.** The five headers are now collected and written to the serial log on every fetch, and displayed nowhere. The next time the account crosses the wall, the log answers the questions above, and the display gets designed from the answer. The parked currency-symbol idea — a symbol past the right edge of the bar, where the geography already says *past here it costs money* — is the likely shape, with a headline that says you are paying rather than that you are out.

## The overage display rested on three assumptions; one is now measured

**Decided 2026-09-20, flagged rather than resolved, and then partly measured the same day** — see the amendments inline. The vertical dashboard now draws overage as a vessel: an inner-stroked track holding whatever the extra-usage allowance has left, with the pace diamond and its word intact because there is a fill edge to read them against. That is the right shape *if* the data behaves the way we are assuming. Nobody has ever captured a real overage header set — not us, and as far as a search can tell, not anyone. Another implementation carries an open issue whose acceptance criterion is, verbatim, getting "one real overage header set captured."

The three assumptions, in the order they would hurt:

`overage-utilization` has a real ceiling behind it. If extra usage is uncapped, there is no denominator, the blue bar has no length, and the correct display is the uncapped fallback in `explore.html` section 4 — a full vessel with the diamond and the pace word retired, because pace against an unbounded budget is undefined. The `allowed_warning` status implies a cap exists, which is the only reason to think otherwise.

The overage window resets with the window it belongs to. **Measured 2026-09-20, and false.** A live header set off the device reads `overage-reset` = 1790812800 = 2026-10-01 00:00 UTC, against a 7-day reset of 2026-09-26 and a 5-hour reset of 2026-09-21 01:50. Midnight UTC on the first of the month is a billing boundary, not a rolling window — the extra-usage allowance is monthly and shares no edge with either window the dashboard draws.

So the diamond is wrong on the overage bar. It is placed by the base window's elapsed fraction, and the bar underneath it is filling against a month. At the end of a 5-hour window the diamond sits at the bottom of a vessel that has 27 days left to run. The fix needs an elapsed fraction of its own, and that needs the window's *start*, which no header carries — but a monthly boundary is derivable: the reset is the first of the month, so the start is the first of the previous month. That is an assumption too, and a far cheaper one than the one it replaces.

`overage-utilization` is a 0–1 fraction. **Measured 2026-09-20, and true** — it reads `0.0` on an ordinary response, in the same shape as its siblings. The reasoning that held before the measurement: those siblings are documented as fractions in `data-inventory.md`, and `api.cpp` multiplies them by 100. It is called out because the first cut of the parsing divided by 100 instead, which would have been wrong by four orders of magnitude and rendered an empty bar forever.

Two things the search did settle, both of which were bugs.

**"In overage" is not "the overage-status header is present."** That header rides on ordinary responses too: a plan that simply blocks at 100% carries `overage-status: rejected` all day. The wall is `unified-status: rejected`; past it, `overage-status` says which side you are on. The device keyed on presence until 2026-09-20, which would have shown the overage treatment permanently.

**The capture had no way to happen, until 2026-09-20.** The five headers had been printed on every fetch since 2026-09-08, and printing is not logging: `Serial.printf` is a live stream out the USB port, and this device sits on a desk with nothing attached. The one event worth seeing would have printed to nobody. "Read the serial log next time" described a mechanism that did not exist.

It does now. The first header set seen while `unified-status` is `rejected` is pinned to NVS under the `ovcap` namespace and never overwritten — a later overage cannot be more informative, and overwriting would lose the thing we waited for. The values are stored as **raw strings**, because the open questions are about the format itself: parsing `overage-utilization` before storing it would discard the evidence for whether it is a fraction, whether it passes 1.0, and whether `5h-utilization` pegs or climbs. Both window utilizations are pinned alongside it for that reason.

Every boot prints whatever is pinned, or says nothing has been captured. So the retrieval is: plug in a cable whenever you like, days or weeks later, and read the `[CAP]` block.

One caveat found on 2026-09-20, while trying to read it: that block prints in the first two seconds of boot, and on this board those two seconds are only reachable from a terminal that is already attached across a reset. Native USB means the ROM bootloader and the application are different USB devices, and a handle opened on either side of that switch gets nothing from the other. So retrieval is `pio device monitor`, then the reset button — a keyboard job, not a scriptable one. `tools/readboot.py` documents the measurement.

### What a live non-overage header set already told us — 2026-09-20

The `[CAP]` block did not have to wait for an overage event to be worth reading. The ordinary fetch line beside it carries the whole overage family on every response:

    [API] status: allowed  overage: status=allowed util=0.0 reset=1790812800 disabled=-

Three things fall out of one line. `overage-utilization` is present, parseable and a fraction *outside* overage, which settles the third assumption. The wall is `unified-status`, not the presence of an overage header — `status: allowed overage: status=allowed` at low usage is the proof, and it is the bug fixed the same day. And `overage-reset` is a monthly billing boundary, which breaks the diamond as described above.

What still needs the real capture: whether `overage-utilization` climbs past 1.0, and whether `5h-utilization` pegs at 1.0 past the wall or keeps going. Both are questions about behaviour at a boundary this account has not crossed since the instrumentation existed.

## The refresh indicator — a clock that fills, then a spinner

**2026-09-20.** The control column's third circle is the first of the three to mean anything. It is a ring that closes clockwise from twelve as the poll interval runs down, and a spinner while the fetch it was counting towards is in flight.

The thing it replaces is the `updated 47s ago` line, which cost a row of text and answered the wrong question. The age of the last reading is only interesting as a proxy for the one you actually want — *when does this number change next* — and the proxy breaks exactly when it matters, because a reading that is 47 seconds old and a reading that is 47 seconds old because every fetch since has failed look the same in words. A ring that fills says the same thing without a word, and an empty one that stays empty says the other thing by itself.

It is also honest about cost. Every poll is a real API call that spends a sliver of the budget the screen is reporting, so the thing that spends it should be something you can watch. That is the argument in *Refresh as a visible, tappable object* in `plan.md`, and this is the first half of it. The second half is the tap, which needs somewhere for a manual refresh to go.

**All three circles are drawn by one test.** A pixel is in the circle when its centre falls inside a radius-16 circle centred on the 32px box. That is exactly what Figma means by a 32px ellipse, and it is something `fillCircle()` cannot express — an integer centre always yields an odd diameter, so a 32px circle would sit half a pixel off its own frame. `fillRoundRect()` with a radius of half its side gets within a pixel, which is close enough for a disc standing alone and not close enough here: the first cut drew the discs that way and the pie by hand, and a full ring came out 32 pixels fatter than the identical circles above it. Nobody would have been able to name that; everyone would have seen it. Testing pixels is the same escape `drawMarkX` takes, for the same reason, at the same negligible cost.

## Icons are exported, not translated

**2026-09-20.** Every icon before this one was translated by hand: read the ellipse radii out of Figma, guess a predicate, render it, diff it against the real thing, adjust, repeat. The wifi glyph took four rounds of numerical fitting and landed 1–2% divergent, which is what a rasterised vector costs when you rebuild it from parameters rather than from pixels.

The parameters bought nothing. Nobody is going to want a 43%-thick wifi wave at runtime — these are pictures, not gauges, and a picture's natural form on a device like this is a bitmap. `tools/icons2c.py` reads the PNGs in `design/icons/`, thresholds them at the midpoint between the frame's background and its ink, and writes `src/icons.h` and `docs/sim/icons.js` from the same bits. Eight icons, 1024 bytes of flash, one uint32 per row because 32 pixels is exactly a word — which is the other reason the box is 32 and not 33.

`tools/verify-icons.js` renders a real dashboard, lifts the 32×32 box out of the control column and compares it against the PNG. It reads zero differing pixels across every icon. The same check against the hand-fitted versions read 1–2% on every one of them.

**What stays hand-drawn.** Anything driven by a live value: the countdown wedge, which is a continuous fraction, and the spinner, which is one dot rotated eight ways. A bitmap per spinner frame would work and would be a worse thing to edit than one radius.

**Thresholded, not anti-aliased.** One ink colour, one bit. The screen is pixel art on purpose, and a 2-bit alpha channel would quadruple the data to soften edges nobody wants softened.

**The workflow this buys.** Edit the frame, export it, run the tool, build. Nothing to fit, nothing to argue about, and the simulator and the device read identical bytes rather than two ports of the same intent. The one sharp edge is getting the PNG out of Figma: base64 through a chat window arrived corrupt twice — the file was the right length and one byte inside was wrong, which a zlib checksum caught and a length check did not. Download the asset URL with `curl` instead.

## The control column: three glyphs, and how loud they are

**2026-09-20.** Menu, signal, refresh. The discs that stood in for them read as three lamps — the brightest thing on a screen whose job is a number and a bar. Drawing the real glyphs takes about five-sixths of that ink away on its own: a disc is 812 lit pixels, the menu bars are 144, a full-strength signal glyph is 319, the countdown ring at rest is 96.

`C_CTRL` exists so the rest is one line. The column is chrome and should lose to the numbers; the pace words are content and use `C_DIM` for a different reason. Giving them one colour meant tuning either one moved both.

### Signal strength: ghosted, or absent

Two treatments, both drawn. **Ghosted** keeps the whole figure at every level and outlines the bands the signal doesn't reach, so strength reads as how much of one shape is solid and the scale is on screen every time you look. **Absent** draws only the bands you have — quieter, and quietest exactly when the news is worst.

That inversion is the usual argument against absent, and it no longer holds here, because the alarm moved. A link too weak to fetch through now shows as a failed refresh on the circle below, which reports the thing that actually matters rather than a proxy for it. What absent gives up is the scale: a lone dot means "weak" only if you remember the figure it belongs to. On a device one person keeps on one desk, that is learned once.

No-link keeps the full ghosted figure under a strike either way. It is the one signal state worth being loud about, and a strike through nothing says nothing.

This supersedes the earlier three-state table above, which had a good link show nothing at all. That was written when the glyph would have had to live in a corner of the dashboard and earn its pixels; the control column is a permanent home, and an indicator that vanishes when healthy can't be told from one that is broken.

### The spinner: bars or dots

Eight positions, one moving gap, two treatments. The dots carry slightly more ink — 196 lit pixels against 143 — and far fewer edges. Which reads quieter in the corner of the eye is not something a pixel count settles, so both are in `explore.html` and the device is running dots.

### Failure holds for five seconds, and that is not enough

A failed refresh fills the circle and takes an X back out of it: the loudest mark in the column, for the only thing there that is bad news. It is the same X as the blocked-overage token, so a cross means the same thing wherever it appears. After five seconds it gives way to the countdown to the retry.

**Five seconds is the announcement, not the condition.** A device failing every poll would show the X for five seconds in every three hundred and look healthy for the rest — precisely the stale-reading-that-looks-fresh failure this project exists to prevent. So the countdown that follows the mark draws in the warning colour for as long as nothing has succeeded. An event gets a shape; a standing condition gets a colour.

Still crooked: the mark and the spinner draw in the column's own colour, so the sequence runs grey mark, then yellow countdown. The announcement being quieter than the condition is the wrong way round. One constant either way, and not yet decided.

### The bug the indicator found

Retries were scheduled from the last *successful* fetch. That value only advances when a fetch works, so a failing device asked again on every pass of `loop()` — against an endpoint `fetcher.h`'s own comments are careful to say rate-limits hard. Nothing on screen could have shown it, because nothing on screen knew an attempt had happened. `fetcherLastAttemptMs()` now exists, the schedule keys off it, and so does the ring. Building the thing that displays a mechanism is a good way to find out the mechanism was wrong.

## The dashboard has one touch target now

**2026-09-20.** A tap anywhere used to open the menu. That was right when the dashboard had no controls on it — the whole screen was the button, and there was nothing else a tap could have meant. It stopped being right the moment the control column got three circles: it made them look decorative, and it left no way for the other two to ever mean anything.

So the menu is the top circle, and the rest of the dashboard is inert. The touch zone is 56x56, not 32x32. Thirty-two pixels is about 5mm on this panel and the reliable floor is nearer 7mm — the same measurement that set the menu's row height. The zone runs to the top-right corner, so a tap that drifts toward the edge still lands on something rather than falling into dead space. Text is allowed to intrude on it; nothing there is interactive.

The cost is that the device is less obviously alive to a stranger poking at it. That is worth paying to get a control column that can hold controls.

## The PIN keypad — ten targets instead of one

**2026-09-20.** The old screen dialled each digit with BtnA and BtnB: up to ten taps for a digit, plus a confirm, so 36 taps at worst for four digits. That was survivable when the device booted once. It is not survivable now, because every flash is a reboot and every reboot is a PIN, and this thing gets flashed several times an hour while the display is being worked on.

A 320x240 touch panel can show ten targets. It only ever needed raw touch coordinates rather than the three synthesised zones along the bottom, which is the same move the dashboard and menu already made. Parked as "A real PIN keypad" since 2026-09-04; unparked because the cost finally landed on the person building it.

Keys are 96x46, three across and four down. 46px is about 7.3mm, which is the size the menu rows had to reach before they were reliable to hit. Four rows of them plus the dots comes to 238 of the 240 rows available, and that is why **there is no confirm key**: the fourth digit submits, the way a phone lock screen does. Backspace sits bottom right, zero centre, and the bottom-left cell is empty — the standard keypad shape, so nobody has to learn it.

**No digit is ever shown.** Four dots fill as the digits land. The old screen had to show the digit being edited, because with a +1 button there was no other way to know what you were dialling. That was a workaround leaking into the display, not a decision, and it goes away with the mechanism that forced it.

## Touch targets need ~7mm

34px rows on this panel are about 5.4mm at ~160 px/inch, and were unreliable to hit. 46px is ~7.3mm and works.

Five comfortable rows do not fit 240px and four do, so the menu lost a row rather than its margins. The version moved into the header, which is where an "About" row was headed anyway.

## Open questions

- **Does a `claude setup-token` token carry the `user:profile` scope** that
`/api/oauth/usage` wants? Sources conflict. Two attempts to test have returned 429 rather than an auth verdict — the test itself is rate-limited.
- **Is that limiter IP-scoped?** Would decide whether this device can coexist
with a desktop monitor on the same network.
- **Terms of service.** Consumer terms prohibit automated access except via an
API key; `claude setup-token` is Anthropic's own automation command. See `data-inventory.md`. An account-owner call.
- **What the overage headers do past the wall.** Logged since 2026-09-08,
captured never. Decides the overage display — see *Overage* above.
- **How to show that buying through is available.** `extra_usage` and
`overage-disabled-reason` are on the wire; the decision *"pay to continue?"* is real and needs warning in advance, not at the wall.
- **Rationing or use-it-or-lose-it?** Answered, mostly: under-use dominates
nearly every metered domain studied, so hoarding is the failure to design against — *except* in the 5-hour window, whose near, certain, non-rolling endpoint is exactly the condition that flips behaviour toward end-of-window burn. The two windows want opposite treatments, which the current screen does not give them.
