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

There are no physical buttons — the reset button underneath reboots the chip
without firmware seeing it, and the side power button is not wired to anything
yet. The bottom 36 pixels of the touchscreen are three zones, labelled on every
screen that uses them.

| Screen | Left third | Middle third |
|---|---|---|
| Dashboard | Cycle brightness: off → dim → normal → bright | Refresh now |
| PIN entry | Advance digit | Confirm digit |
| During boot | Hold both for 2s → factory reset | |

Brightness survives a reboot. "Off" really is off, and the device keeps running.

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
before this was fixed made 1,440 calls a day. Updating repairs them
automatically — a stored value below the floor is clamped up on the next boot.

## When something is wrong

The device is deliberately loud about not knowing things, rather than showing a
confident stale number.

| Status line | Meaning | What to do |
|---|---|---|
| `updated 12s ago` | Normal | Nothing |
| `no data: auth_failed` | Token rejected — usually expired | Re-run `claude setup-token`, factory reset, set up again |
| `no data: no_usage_h_200` | Authenticated, but this plan publishes no usage headers | Expected on Enterprise and API-billed accounts. Nothing to fix |
| `no data: http_-1` and similar | Network or TLS failure | Usually transient. Check WiFi |
| `reset unknown` under a bar | No reset time, or the clock has not synced | Should resolve within a minute of boot |
| `--` instead of a percentage | No data at all this session | See the status line |

**Known gap:** a failed fetch currently replaces the last good numbers rather
than keeping them with a staleness note. Good clients keep the last reading and
mark it stale. Worth fixing.

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
