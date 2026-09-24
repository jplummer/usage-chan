# Living with Usage-Chan

*Living document. Updated whenever behaviour or configuration changes — if this drifts from what the device does, that is a bug in the document. Last checked against the firmware on 2026-09-22.*

The device is meant to be glanced at, not operated. Most days you should not touch it. This covers the times you do.

## What is on screen

Two columns that fill from the bottom, and three circles down the right-hand side.

**Fill is what's left.** Each bar empties downward as you spend, so its bottom edge is exhaustion. Both bars keep the same height in every state, so the screen doesn't twitch at the moment it has something to say.

**The wide column is the window that will stop you.** The server names the binding limit in every response, and that window gets the wide column and the headline. Most of the time it's the five-hour window; the seven-day one takes over when the server says so. The thin column is the other window. The seven-day bar is divided into sevenths – a scale for reading the diamond, not days of the week, because the window doesn't start at midnight.

**The diamond is your pace** – where an even burn would have you right now. A word beside it says how far off you are: `well behind`, `a bit behind`, `on pace`, `a bit ahead`, or `well ahead`. Behind is dim, however little remains; ahead takes the warning colors, and the bar's fill color follows the same reading. There's no "you are at 60%" warning, because being at 60% with time to spare is fine and being at 60% early is not.

**The headline changes meaning as the window closes.** With 40% or more left it's the budget (`62% left`), and the reset time sits at the bottom as a footnote. Below 40% they swap: the reset time becomes the headline, because the question has changed from *should I start this?* to *should I wait?* Below 12% the footnote says `nearly out`, and at zero it says `out`.

**Extra usage turns the bar into a vessel.** When your plan bills past the quota, the wide column draws an outline holding whatever the extra-usage allowance has left, and a mark straddles the bar's bottom edge: `$` while you're paying, a red X when you're blocked. The headline says `paying`, `near cap`, or `blocked`; a blocked bar gives the reason underneath when the server sends one; and the footnote shows when the allowance resets, which is the first of the month. The diamond on this bar is still measured against the base window, so it sits in the wrong place for now – see `plan.md`.

**The circles are menu, signal, and refresh.** The menu circle opens the menu, though a tap anywhere does too. The signal circle is WiFi strength. The refresh circle is a ring that fills clockwise as the next fetch comes due, and it turns into a spinner while one is in flight. A failed fetch shows an X for five seconds, then the countdown returns in the warning color and stays that way until a fetch succeeds.

> The utilization figures come straight from Anthropic; so does the answer to
> which window is binding. If they disagree with `claude /usage`, believe
> `claude /usage` and please open an issue.

**Reset times show as durations until a timezone is set.** `tzMin` defaults to 0, which is a legitimate offset rather than a marker for "unknown", so a wall clock would silently render seven or eight hours wrong. Nothing can choose a timezone yet — that arrives with the menu, and the clocks light up then.

## The controls

The board's physical buttons are reset (which reboots the chip without firmware seeing it) and soft power (not wired to anything yet), so everything happens on the panel. Two input styles coexist:

**The dashboard reads taps anywhere.** Tap the screen to open the menu; tap outside the menu rows to close it.

| Menu row | Does |
|---|---|
| Brightness | Five dots at the right end of the row; tap one |
| Refresh interval | Nothing yet |
| Network | Nothing yet |
| Control panel | Nothing yet |

Four rows rather than five, because 34-pixel rows were too small to hit reliably — this panel is around 160 px/inch, so that is about 5.4mm against the 7mm a fingertip wants. The version moved into the menu header, which is where an "About" row was headed anyway.

**PIN entry is a keypad.** Ten keys in the usual phone layout, with backspace at bottom right. Four dots fill as digits land and no digit is ever shown; the fourth digit submits, so there's no confirm key. A wrong PIN locks entry for a minute, and the lockout doubles with each failure, up to an hour. Ten wrong PINs wipe the stored credentials.

**Factory reset still uses touch zones:** hold the bottom-left and bottom-middle thirds of the screen (the bottom 36 pixels) for two seconds while the device boots. Nothing on screen marks them anymore.

Brightness is chosen from five dots, the live one filled, and the choice survives a reboot. There is no off. Earlier firmware had one, and because brightness is persisted, a device that stored it booted dark forever with no visible way back: indistinguishable from broken hardware. The lowest dot is dim, not dark.

The brightness picked in the setup portal is no longer honoured — it writes the old 0–3 scale, which this firmware ignores in favour of the dots. The first boot after flashing comes up at the middle dot.

> **If your screen is dark and the device seems alive**, it is from firmware
> before the fix. Flash the current firmware, which comes up visible.

> **Changed.** Refresh-now used to be a button. It is not currently reachable —
> the poll runs on its own five-minute schedule and the menu row is inert. Given
> that Anthropic's usage surfaces rate-limit hard and manual refreshes make that
> worse, this is not urgent to restore.

## Configuration

Everything is set once through the setup portal. **There is currently no way to change a setting without a factory reset**, apart from brightness. That is the largest gap in the product today and the LAN settings panel is the fix — see `plan.md`, phase 1.5.

| Setting | Range | Changeable now? |
|---|---|---|
| Brightness | five dots | Yes, in the menu |
| Refresh interval | 2–15 min, default 5 | No — but a stored value from before the floor moved is treated as stale and falls back to the 5-minute default, so no re-provision is needed to get there |
| WiFi credentials | | Only via the recovery portal, after three failed connects |
| Token | | No. Factory reset only |
| PIN | | No. Factory reset only |
| Device name | | No |

## Why five minutes

Two independent reasons, and they agree.

**It cannot show you more.** The 5-hour window is 300 minutes long. Even at a burn rate that would exhaust the whole thing, a whole-percent number moves once every three minutes. The 7-day window moves 1% per 100 minutes. Polling faster measures noise. The countdowns don't need polling at all — they are computed locally from a stored reset time, which is why the screen updates every second between fetches.

**The server does not like it.** Anthropic's usage surfaces rate-limit hard. The most widely used desktop client polls on a fixed five-minute cadence with no setting to change it, locks itself out for five minutes after a 429, and warns users in its own interface that manual refreshes make things worse.

Every poll is also a real API call, so the monitor spends a sliver of the budget it reports on. Not much — a `max_tokens: 1` call is roughly ten tokens — but the device is part of the measurement, which is a reason to sample politely.

Earlier firmware shipped a 60-second default by accident: `config.h` said 120 but the setup portal had 60 pre-selected, and the portal won. Devices set up before the fix made 1,440 calls a day.

**Flashing the new firmware repairs them**, and your token, PIN and WiFi survive it. A stored interval outside the current range is treated as stale — a value written against a schema that no longer exists is not information — so it falls back to the default rather than clamping to the nearest legal number, which would have left a device at 2 minutes that nobody chose. There is no over-the-air update, so this means a USB-C cable. Getting all the way to 300s needs a re-provision, which today means a factory reset.

## When something is wrong

The device is deliberately loud about not knowing things, rather than showing a confident stale number, and it says so in proportion to how much it doesn't know.

**One failed fetch changes almost nothing.** The numbers stay in plain view – they were true when they arrived and are still worth reading. The refresh circle shows an X for five seconds, then counts down to the next attempt in the warning color until a fetch succeeds.

**Two conditions veil the screen**, because they can't get better on their own: WiFi down for more than 10 seconds, or three failed fetches in a row with WiFi up. A dimming layer goes over the dashboard with a panel on top saying `no network` or `API not answering`, and how old the readings behind it are. The numbers stay visible through it, and the menu still works.

| What you see | Meaning | What to do |
|---|---|---|
| Refresh X, then a warning-colored countdown | A fetch failed; the next one is scheduled | Nothing, unless it persists |
| `no network` veil | WiFi down for more than 10 seconds | Check WiFi |
| `API not answering` veil | Three failed fetches in a row with WiFi up | Usually transient. If it lasts, the token may have expired – see below |
| `--` as the headline | No data at all this session | Wait for the first fetch, then check WiFi and token |
| No reset time on a bar | No reset time yet, or the clock hasn't synced | Should resolve within a minute of boot. NTP retries with backoff |

**The screen doesn't say why a fetch failed yet.** The reason goes to the serial log as a `[FETCH]` line. `auth_failed` means the token was rejected, usually because it expired: re-run `claude setup-token`, factory reset, and set up again. `no_usage_h_200` means the plan publishes no usage headers, which is expected on Enterprise and API-billed accounts. `http_-1` is a network or TLS failure. Showing the reason on the device belongs in the menu.

A fetch takes about **2.7 seconds**, measured on hardware, and runs on the second core, so the screen stays live throughout, including touch.

## Things it deliberately does not show

Not oversights — these are decisions, recorded in `docs/design-decisions.md`.

**Dollars, and token counts per day.** Not available to a standalone device at any price. Those figures are computed by reading Claude Code's session logs on your Mac and multiplying by a pricing table; no Anthropic endpoint has them. Desktop tools that show them are reading `~/.claude/projects/**/*.jsonl`.

**Context window fullness for the chat you are in.** A real need, and outside what any device off your machine can see.

**A face, expressions, or servo movement.** Phase 2. The functional device comes first.

## Getting back to a clean state

Hold the bottom-left and bottom-middle thirds of the screen for two seconds during boot – nothing on screen marks them. Wipes WiFi credentials, the encrypted token, and preferences. The firmware stays. You will need your token again.
