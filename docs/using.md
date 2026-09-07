# Living with usage-chan

*Living document. Updated whenever behaviour or configuration changes — if this
drifts from what the device does, that is a bug in the document. Last checked
against firmware 0.1.0.*

The device is meant to be glanced at, not operated. Most days you should not
touch it. This covers the times you do.

## What is on screen

Usually one bar and one line.

**The bar is the window, not the budget.** Its left edge is when the window
opened; its right edge is both exhaustion and reset. Remaining budget is a block
anchored to the right, so spending pushes its left edge rightward.

**The diamond is your pace** — where an even burn would have you right now. Both
markers travel rightward, because time flies like an arrow.

- Diamond **left** of the block's edge: you are spending slower than even. Calm,
  however little remains.
- Diamond **right** of it: burning faster than the window carries.

That relationship is what colours the bar. There is no "you are at 60%" warning,
because being at 60% with time to spare is fine and being at 60% early is not.

**The big number changes what it means as the window closes.** With plenty left
it is the budget (`62% left`) and the reset is a footnote. Below about 40% they
swap: the clock becomes the headline, because the question has changed from
*should I start this?* to *should I wait?*

**The 7-day window is one line**, not a bar — it moves 1% per 100 minutes, so a
bar for it would be furniture. It says `behind pace`, `on pace` or `ahead of
pace`, which describes now rather than predicting Friday. It grows into a full
bar only when the server says it is the binding limit.

> The utilization figures come straight from Anthropic; so does the answer to
> which window is binding. If they disagree with `claude /usage`, believe
> `claude /usage` and please open an issue.

**Reset times show as durations until a timezone is set.** `tzMin` defaults to
0, which is a legitimate offset rather than a marker for "unknown", so a wall
clock would silently render seven or eight hours wrong. Nothing can choose a
timezone yet — that arrives with the menu, and the clocks light up then.

## The controls

The board's physical buttons are reset (which reboots the chip without firmware
seeing it) and soft power (not wired to anything yet), so everything happens on
the panel. Two input styles coexist:

**The dashboard reads taps anywhere.** Tap the screen to open the menu; tap
outside the menu rows to close it.

| Menu row | Does |
|---|---|
| Brightness | Cycles dim → normal → bright |
| Refresh interval | Nothing yet |
| Network | Nothing yet |
| Control panel | Nothing yet |

Four rows rather than five, because 34-pixel rows were too small to hit
reliably — this panel is around 160 px/inch, so that is about 5.4mm against the
7mm a fingertip wants. The version moved into the menu header, which is where an
"About" row was headed anyway.

**PIN entry and boot still use the three zones** along the bottom 36 pixels,
labelled on the screens that use them.

| Screen | Left third | Middle third |
|---|---|---|
| PIN entry | Advance digit | Confirm digit |
| During boot | Hold both for 2s → factory reset | |

Brightness survives a reboot — **except off**, deliberately.

Cycling goes dim → normal → bright and never lands on off. Level 0 really does
cut the backlight, and because brightness is persisted, a device that stored 0
would boot dark forever with no visible way back: indistinguishable from broken
hardware. Off stays reachable for a nightstand at 2am, but it is a runtime state
a power cycle clears, not something that can be saved into a corner.

> **If your screen is dark and the device seems alive**, it is probably this,
> from firmware before the fix. Touch still works: tap the middle of the screen
> to open the menu, then tap about a quarter of the way down to hit Brightness.

> **Changed.** Refresh-now used to be a button. It is not currently reachable —
> the poll runs on its own five-minute schedule and the menu row is inert. Given
> that Anthropic's usage surfaces rate-limit hard and manual refreshes make that
> worse, this is not urgent to restore.

## Configuration

Everything is set once through the setup portal. **There is currently no way to
change a setting without a factory reset**, apart from brightness. That is the
largest gap in the product today and the LAN settings panel is the fix — see
`plan.md`, phase 1.5.

| Setting | Range | Changeable now? |
|---|---|---|
| Brightness | 0–3 | Yes, left button |
| Refresh interval | 2–15 min, default 5 | No — and a device provisioned before the floor changed sits at 2 min, clamped up from its stored value. Reaching 5 needs a re-provision |
| WiFi credentials | | Only via the recovery portal, after three failed connects |
| Token | | No. Factory reset only |
| PIN | | No. Factory reset only |
| Device name | | No |

## Why five minutes

Two independent reasons, and they agree.

**It cannot show you more.** The 5-hour window is 300 minutes long. Even at a
burn rate that would exhaust the whole thing, a whole-percent number moves once
every three minutes. The 7-day window moves 1% per 100 minutes. Polling faster
measures noise. The countdowns don't need polling at all — they are computed
locally from a stored reset time, which is why the screen updates every second
between fetches.

**The server does not like it.** Anthropic's usage surfaces rate-limit hard. The
most widely used desktop client polls on a fixed five-minute cadence with no
setting to change it, locks itself out for five minutes after a 429, and warns
users in its own interface that manual refreshes make things worse.

Every poll is also a real API call, so the monitor spends a sliver of the budget
it reports on. Not much — a `max_tokens: 1` call is roughly ten tokens — but the
device is part of the measurement, which is a reason to sample politely.

Earlier firmware shipped a 60-second default by accident: `config.h` said 120
but the setup portal had 60 pre-selected, and the portal won. Devices set up
before the fix made 1,440 calls a day.

**Flashing the new firmware repairs them**, and your token, PIN and WiFi survive
it — a stored interval below the floor is clamped up on the first boot after the
update. There is no over-the-air update, so this means a USB-C cable. Getting
all the way to 300s needs a re-provision, which today means a factory reset.

## When something is wrong

The device is deliberately loud about not knowing things, rather than showing a
confident stale number.

| Status line | Meaning | What to do |
|---|---|---|
| `updated 12s ago` | Normal | Nothing |
| `no data: auth_failed` | Token rejected — usually expired | Re-run `claude setup-token`, factory reset, set up again |
| `no data: no_usage_h_200` | Authenticated, but this plan publishes no usage headers | Expected on Enterprise and API-billed accounts. Nothing to fix |
| `no data: http_-1` and similar | Network or TLS failure | Usually transient. Check WiFi |
| `waiting for first reading` | Booted, nothing fetched yet | Normal for the first few seconds |
| `reset unknown` under a bar | No reset time, or the clock has not synced | Should resolve within a minute of boot. NTP now retries with backoff and keeps trying in the background |
| `--` instead of a percentage | No data at all this session | See the status line |

A fetch takes about **2.7 seconds**, measured on hardware. A small spinner
appears beside the status line while one is in flight. It
can turn at all because the fetch runs on the second core — the screen stays
live throughout, including touch.

**Known gap:** a failed fetch still replaces the last good numbers rather than
keeping them with a staleness note. Good clients keep the last reading and mark
it stale. Worth fixing.

## Things it deliberately does not show

Not oversights — these are decisions, recorded in `docs/design-decisions.md`.

**Dollars, and token counts per day.** Not available to a standalone device at
any price. Those figures are computed by reading Claude Code's session logs on
your Mac and multiplying by a pricing table; no Anthropic endpoint has them.
Desktop tools that show them are reading `~/.claude/projects/**/*.jsonl`.

**Context window fullness for the chat you are in.** A real need, and outside
what any device off your machine can see.

**A face, expressions, or servo movement.** Phase 2. The functional device comes
first.

## Getting back to a clean state

Hold the bottom-left and bottom-middle of the screen for two seconds during
boot. Wipes WiFi credentials, the encrypted token, and preferences. The firmware
stays. You will need your token again.
