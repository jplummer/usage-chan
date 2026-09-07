# Living with usage-chan

*Living document. Updated whenever behaviour or configuration changes — if this
drifts from what the device does, that is a bug in the document. Last checked
against firmware 0.1.0.*

The device is meant to be glanced at, not operated. Most days you should not
touch it. This covers the times you do.

## What is on screen

Two bars.

**5-hour window** — the rolling short limit, the one that usually stops you.
**7-day window** — the rolling long limit.

Each shows a percentage used, a bar, and a countdown to when that window
resets. Bars are green below 60%, amber from 60%, red from 85%.

Below them, a status line: how long ago the numbers arrived, or why they did
not.

> These are *utilization* figures straight from Anthropic, not a calculation we
> do. If they disagree with `claude /usage`, believe `claude /usage` and please
> open an issue.

## The controls

The board's physical buttons are reset (which reboots the chip without firmware
seeing it) and soft power (not wired to anything yet), so everything happens on
the panel. Two input styles coexist:

**The dashboard reads taps anywhere.** Tap the screen to open the menu; tap
outside the menu rows to close it.

| Menu row | Does |
|---|---|
| Brightness | Cycles off → dim → normal → bright |
| Refresh interval | Nothing yet |
| Network | Nothing yet |
| Control panel | Nothing yet |
| About | Nothing yet |

**PIN entry and boot still use the three zones** along the bottom 36 pixels,
labelled on the screens that use them.

| Screen | Left third | Middle third |
|---|---|---|
| PIN entry | Advance digit | Confirm digit |
| During boot | Hold both for 2s → factory reset | |

Brightness survives a reboot. "Off" really is off, and the device keeps running.

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
| Refresh interval | 2–15 min, default 5 | No |
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

A small spinner appears beside the status line while a fetch is in flight. It
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
