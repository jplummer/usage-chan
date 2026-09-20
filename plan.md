# Usage-Chan — Claude usage monitor on a Stack-Chan

*Read down from the top. Where things stand, then what is open, then what is settled, then the background, then the archive. New work goes near the top; finished work moves to the bottom rather than being deleted. Keep it that way.*

---

## Where this is now

**2026-09-20.** The device has been running live since 2026-09-04 and the numbers are trustworthy. The work since has been the display, and it has moved a long way.

The dashboard is **vertical**: two bottom-anchored columns, a thin one for the 7-day window and a wide one for the 5-hour, with fill meaning *what is left* and the bottom edge meaning exhaustion. A diamond marks where an even burn would have you, and a word beside it names the gap — `well ahead` through `well behind`. `docs/sim/` is the spec for all of it: `screens.js` is a line-for-line port of `src/ui.cpp`, so a disagreement between them is a finding rather than a nuisance.

**Extra usage now shows.** An inner-stroked vessel holds whatever the overage allowance has left, a `$` or a red `X` token straddles the bar's end edge, and the big caption carries the state word. The blocked case is buildable today. The paying case is not fully — it needs numbers whose behaviour past the wall nobody has captured.

**Figma now tells the truth about type.** `tools/fonts2ttf.py` generates 12 TTFs from the device's own glyph bitmaps, em-normalised so one size in Figma works for every face. Layouts are drawn at 1x, where a coordinate is a device pixel.

Three things landed on 2026-09-20 that change what happens next. The overage headers arrive on *ordinary* responses, so "in overage" is `unified-status: rejected`, not the presence of a header — that bug is fixed. The first header set seen past the wall now pins itself to NVS and prints at every boot, so the capture no longer needs a console attached at the moment it happens. And a live header set says `overage-reset` is **2026-10-01 00:00 UTC** — the first of the month. The extra-usage allowance is a monthly billing window sharing no edge with either window the dashboard draws, which means the diamond is in the wrong place on the overage bar.

The control column is real. Menu bars at the top, a four-state signal glyph in the middle, and a refresh indicator at the bottom that counts down to the next attempt, spins while one is running, and shows a struck-out circle for five seconds after one fails. The top glyph is the dashboard's only touch target. A failed attempt marks the circle for five seconds and leaves the countdown warn-coloured until something succeeds. Two treatments are still undecided — spinner bars or dots, ghosted or absent signal bands — and both are in `explore.html` section 7.

The pictures now come from `design/icons/*.png` through `tools/icons2c.py` rather than from geometry fitted by hand, so changing one is an export and a command.

Nothing is blocked. The next few moves are small and listed below.

---

## Open tasks

### Next up

- **Tune the control column.** The glyphs are on the device and the colour is one constant, `C_CTRL`. Decide bars or dots, ghosted or absent, and how far down `C_CTRL` should go.
- **Decide what colour a failure is.** The countdown after a failure is warn-coloured now, but the mark and the spinner still draw in `C_CTRL` — so the announcement is quieter than the condition it announces. One constant either way.
- **Confirm the `[CAP]` line with your own eyes.** The dump fix is flashed and the device is running it, but the block prints in the first two seconds of boot and nothing remote can read that window (see the settled entry below). `pio device monitor -e stackchan`, then press reset.
- **Fix the diamond on the overage bar.** It is placed by the base window's elapsed fraction, and the bar underneath it is filling against a month. Either derive the monthly elapsed fraction (the reset is the first of the month, so the start is the first of the previous one) or retire the diamond while overage is drawing.
- **Decide the sub-12% headline word.** `nearly out` is 116px in a 102px slot. `explore.html` section 5 offers `very low` (96px), `low` (40px), or keeping the number.
- **Decide what to do about `tools/readboot.py`.** Run now, and it does not do the job it was written for — it reaches `[HAL]` and stops. Docstring rewritten to say so. Keep it for early-boot problems, or delete it.
- Optional cleanup: `drawWindowBar`, `drawSevenDayBar` and `drawPaceCaption` are defined in `ui.cpp` and never called — about 140 lines of dead code.

### Phase 1.5 – make it livable

Phase 1 works but is awkward to live with. Everything here is about the parts you touch, not the parts that compute.

It has grown into four tracks. They are listed in build order, and the ordering is mostly forced by dependency rather than preference.

- Track A, on-device polish – refresh clock · menu with statuses and legend · PIN screen rework · timezone. Depends on nothing; in progress.
- Track B, setup, the cheap half – QR to join the AP · "copy your token first" warning · drop claude-usage-stick branding from reworked screens. Depends on nothing.
- Track C, LAN panel – settings, token replacement, PIN in a browser, and deferred token entry, which is the expensive half of setup. Depends on nothing, but it is the big one.
- Track D, follow-ons – OTA · Claude service status · currency symbol. Depends on C for OTA; status wants its own fetch path.

**Where the setup rework sits, since it keeps getting asked:** split across B and C. The cheap half is B and needs nothing — a QR code to join the network, and one sentence telling you to copy your token before you leave the internet. The expensive half is *asking for the token after the device is on your WiFi*, and that is really the LAN panel wearing a different hat, so it lands with C.

Track A is currently in flight and is deliberately independent of all of it.

#### Port the LAN settings panel

claude-usage-stick already has this, in `panel.cpp` and `panel_html.h` (~1,100 lines, MIT). It was dropped when reducing to the single-screen path, and it is the single largest win available.

It serves a control panel over the home WiFi at `http://<devicename>.local` or the IP. The login is the same 4-digit PIN, and logging in **also unlocks the device**, so you type the PIN in a browser instead of tapping a digit up to 36 times. It carries brightness, refresh interval, timezone, device name, screen flip, WiFi switching, and a factory reset armed by typing `ERASE`.

The part that matters most: it can **replace the stored token without a factory reset** — it re-encrypts, swaps live, and test-drives the new token against the API for a verified/failed verdict. That closes the token-expiry problem, which otherwise arrives in a year as a dead device.

Porting cost is mostly the parts of `panel.cpp` that reference upstream's carousel, history and news screens, none of which exist here. The panel needs `panelService()` pumped from `loop()` and from inside every blocking boot wait.

#### Drop the inherited branding
`provision.cpp` still presents itself as claude-usage-stick: the page title, the `<h1>`, and a footer reading *"Claude Usage Stick · made by @oauramos"*.

That was accurate while the page was his, unmodified. It is already slightly untrue and will be plainly untrue once the page is reworked.

**Correct the claim, keep the credit.** The footer should say the page is *based on* claude-usage-stick by @oauramos rather than that it *is* claude-usage-stick. Stripping the attribution while keeping the work would be the wrong fix; so is leaving a page that misrepresents whose product it is.

Applies to any screen we rework, not just this one.

#### Smooth out first setup

Four things went wrong in practice, in order of severity:

1. **Joining the setup AP drops you off the internet**, so the token has to already be on your clipboard before you switch networks. Nothing on screen or in the portal says so. This was the worst moment in the flow.
2. **The AP password has to be read off the screen and typed into a phone.**
3. **PIN entry is up to 36 taps** — ten per digit worst case, plus confirms.
4. **After setup, nothing tells you where the device is on the LAN.** Moot until the panel exists, then immediately relevant.

`M5GFX` has `lcd.qrcode()` built into `LGFXBase`, so a QR code costs no library and no meaningful flash. That makes fixes 2 and 4 nearly free:

- A **WiFi join QR** on the setup screen, encoding `WIFI:T:WPA;S:UsageChan-A3F2;P:K7M2QRST;;`. iOS and Android camera apps join a network directly from that format. Deletes the typing step.
- A **portal URL QR** for `http://192.168.4.1` once joined.
- A line at the top of the portal page: *copy your token before joining this network*. One sentence in `provision.cpp`'s HTML, and it is the cheapest fix of the four.
- Later, the device's LAN address as a QR on the dashboard, once there is something at that address worth reaching.

Fix 3 is largely solved by the panel (type the PIN in a browser), and fully solved by an on-screen keypad — see parked ideas.

### Phase 2 (optional) – Stack-Chan's own capabilities
- Swap the plain bars for a face through M5Stack-Avatar, expression driven by five-hour utilization and burn rate
- Consider the servo neck – a droop as the budget depletes. Servos are on a rail gated by the PY32 expander that phase 1 leaves off; StackChan-BSP's `setServoPowerEnabled()` is how it comes on
- The 12 RGB LEDs are a second display surface and cost almost nothing — a single ambient colour for 5h utilization, readable from across the room with the screen dark
- Worth doing once phase one has run clean for a while, not before

### Phase 3 – exceed
- Model health mascots pulled from status.claude.com, Mango's approach – public endpoint, no token, cheap to add
- Reuse Clawdmeter's mood algorithm (rate of change over a five-minute window) once phase two's face exists – not its art or fonts, which its own README flags as a licensing gray area
- Multiple screens cycled by button, ClaudeGauge-style, if one screen stops being enough
- **Voice.** CoreS3 has a mic and speaker, and M5Unified exposes both — no BSP needed. Realistic shape is record → ship audio to a service → play the answer, not on-device wake word plus STT. That is a much larger project than phase 1 and pulls in an API key, a second endpoint, and a real audio task. Design constraints it imposes are already honoured (see the decision log)
- Explicitly out of scope: dollar spend and Claude Code git or session analytics. That data lives in local logs and git history on the Mac, not anywhere the ESP32 can reach on its own – it would need a host relay like Clawdmeter's, which phase one deliberately avoids

### Stubs and IOUs

Things deliberately faked to keep moving, recorded so they are not mistaken for finished. Every entry here is a lie the device currently tells.

- Claude service status – pretends the menu reports "no service issues" without asking anyone. Needs the status-fetch design in `design-decisions.md`: detect with our own request outcomes, name with status.claude.com.
- Reset times – shown as durations, not wall clocks. Needs a timezone; `tzMin` defaults to 0, a real offset rather than a marker for unknown, so the clock stays gated behind `tzSet`.
- Menu rows – "Refresh interval", "Network" and "Control panel" do nothing. Needs track C, mostly.
- Extra usage – **now displayed** as of 2026-09-20: an inner-stroked vessel holding what the allowance has left, a token straddling the bar's end, and state words in the big caption. Rested on three assumptions; one is now measured and false – the overage window is monthly, so the diamond on that bar is misplaced. See *The overage display rested on three assumptions* in `docs/design-decisions.md`. The first header set seen past the wall now pins itself to NVS and prints at every boot, so the capture no longer depends on a console being attached at the moment it happens.
- Portal brightness – the setup portal offers a brightness choice. It writes the old 0–3 key, which the firmware ignores – needs that honoured, or the field dropped when the portal is reworked (track B).

### Parked ideas

#### Refresh as a visible, tappable object
**Half built, 2026-09-20 — the indicator ships, the tap does not.** The bottom circle of the control column fills clockwise as the interval runs down and turns into a spinner while the fetch is in flight.

What remains is the control: tap it to pull the next poll forward. That needs a path from a touch to `requestRefresh()` and a decision about what the indicator does while an out-of-turn fetch is running, which is the same spinner but arrived at differently.

Two things this earns beyond looking nice. It answers *is this thing alive* with no separate liveness indicator, which the "updated 47s ago" line it replaced did only weakly. And it makes the honest cost visible — every poll is a real API call that spends a sliver of the budget being displayed — by showing that a manual refresh consumes something that was filling up on its own.

Open question: whether it lives on screen, on `M5.BtnPWR`, or both. Both is probably right, since the physical button is the one input that does not put a fingerprint on the display.

#### The legend as the real bar, annotated
Rather than a diagram of a bar, show **the actual 5-hour bar with its actual current values**, and point at the pieces: this is your remaining budget, this diamond is where an even burn would have you, this edge is both running out and resetting.

The appeal is vérité — the thing being explained is the thing itself, at the values you are looking at right now, so there is no translation step between the legend and the display.

The risk is space. The bar is 288px wide on a 240px-tall screen, and leader lines to three or four callouts get cramped fast. Worth sketching before building; it either works immediately or it does not work at all.

#### A settings menu on the device
The panel needs a phone, and reaching for a phone to dim a screen you are sitting in front of is silly. **Decided: little or no menu-diving.** The menu is one screen carrying the statuses and the legend together, not a tree.

#### Over-the-air updates
The partition table already carries everything needed — `otadata` plus two 6.5 MB app slots, of which the 1.19 MB firmware uses 18% of one. Nothing uses them.

This matters more than it looks for a desk object. Every change today means unplugging the device, finding a USB-C cable, and carrying it to a computer, which is enough friction to stop small improvements from being worth making. It also means the fleet is exactly one device, forever, because nobody else will do that either.

Pairs naturally with the LAN panel: an authenticated upload endpoint there, or plain ArduinoOTA on the same network. The PIN already exists as a credential.

Caution worth stating up front: a bad OTA image on a device with no physical buttons and a screen that may not come up is the one way to make this thing genuinely hard to recover. The dual-slot layout is what protects against that, so any implementation must roll back on a failed boot rather than overwrite in place.

#### The week strip (backlog)
Seven segments, one per day, showing consumption per day with today in progress. It would answer the one question nothing else here can — *is this week unusual?* — and it is buildable: the device samples 7-day utilization every five minutes and discards every sample, where seven daily snapshots is 28 bytes of NVS. No API offers this, and the desktop tools that show a trend need your Mac's session logs, so it would be genuinely ours.

**Parked as too fragile for now.** The interesting work is not the strip, it is designing every way it degrades: a device flashed four days ago, a device that was unplugged for two of the seven days, a window that reset mid-sample, a boot with no clock so samples cannot be dated. Each needs a defined appearance, and getting any of them wrong produces a chart that lies. Worth doing deliberately later rather than accidentally now.

#### Currency symbol past the right edge
When extra-usage billing is active, a currency symbol sitting just **beyond the right edge of the 5-hour bar**. The geography already carries the meaning: the right edge is exhaustion, so a symbol past it says *past here, it costs money* without a word of explanation.

Reachable from the header probe we already make — `overage-status` and `overage-utilization` are in the same unified family, two more strings in `RL_HEADERS[]`. No second request.

#### A token that overlaps the end of the bar
The extra-usage marks ship as a `$` and an `X` in a strip the bar gives up at its own bottom — 20px the bar loses whenever overage is live, and the mark reads as a footnote sitting under the bar rather than as a statement about it.

Worth designing instead as a **token straddling the bar's end edge**, the way the parked currency-symbol idea put the symbol past the right edge of the horizontal bar. The edge is the thing the mark is talking about, so putting the mark on it says *this is what happens past here* with no strip and no height given up. Open questions are contrast — the token has to hold against the bar fill on one side and the background on the other, which probably means a background-coloured ring — and whether `$` and `X` stay legible at a size that doesn't swamp a 48px-wide bar.

#### On-device menu vs web panel — the split
Decided by what each can be trusted with. The on-device menu is unauthenticated, so it is **read-mostly**: status you can look at, one harmless control, and a pointer to the thing that does the rest. The web panel is PIN-gated, so it holds everything destructive or sensitive.

On the device, unauthenticated, so read-mostly:
- WiFi status
- Claude service status
- Brightness
- The key – what the colours and the diamond mean
- How to reach the web panel

In the web panel, PIN-gated, so it holds everything destructive or sensitive:
- WiFi network and password
- API token replacement
- PIN change
- Refresh interval
- Timezone, device name

The key is the interesting one: a legend for a display that deliberately has no labels on it. Somewhere to answer "what is the diamond?" once, without spending pixels on the dashboard answering it forever.

#### The rest

- **Ease the token handoff.** Joining the setup AP drops your phone or laptop off the internet, so the token has to be already copied before you switch networks. A QR code on the device pointing at `http://192.168.4.1`, and a note on the setup page telling you to copy the token first, would cover most of the pain
- **Use `M5.BtnPWR`.** A real physical input sitting unused. "Refresh now" fits it, and would free the middle touch zone
- **A real PIN keypad.** Four digits at one-tap-per-increment is up to 36 taps. A 320x240 touchscreen can show ten targets; it just needs raw touch coordinates rather than the three-button abstraction
- **Token expiry.** `claude setup-token` tokens last a year. Largely solved by the panel's token replacement; a countdown from a stored issue date would still warn before the device simply stops
- **Sleep or dim on a schedule.** A lit 320x240 panel on a nightstand at 2am is a lot
- **Respond to ambient light.** The CoreS3 carries an LTR-553 light and proximity sensor on its front panel, and M5Unified may already expose it. Auto-brightness would answer the schedule item above and the "dimmest dot is still too dim / too bright" tuning at once. Fancy, so it belongs to a polish pass, and it is unverified whether the Stack-Chan shell leaves the sensor uncovered
- **Poll less when idle.** Utilization that hasn't moved in an hour doesn't need a 2-minute poll, and every poll spends the budget it reports on

---

## Open questions

- **Does the overage allowance have a ceiling?** If extra usage is uncapped there is no denominator, the vessel has no length, and the right display is the uncapped fallback in `explore.html` section 4. The `allowed_warning` status implies a cap exists; nothing proves one.
- **Does `overage-utilization` climb past 1.0, and does `5h-utilization` peg at 1.0 past the wall or keep going?** The NVS capture exists to answer both. It answers them the next time this account crosses the wall.
- **Switch to `/api/oauth/usage`, or read both?** Reading both gives the Opus and Sonnet breakdown *and* `representative-claim`. Costs one extra request.
- **Does a `claude setup-token` token carry the `user:profile` scope** that `/api/oauth/usage` wants? Sources conflict, and two attempts to test returned 429 rather than an auth verdict — the test itself is rate-limited.
- **Terms of service.** Consumer terms prohibit automated access except via an API key; `claude setup-token` is Anthropic's own command for automation. See `docs/data-inventory.md`. Unresolved, and an account-owner call.
- **How does a timezone get onto the device?** Reset times are durations until it has one. `tzMin` defaults to 0 — a real offset, not a marker for unknown — so the wall clock stays gated behind `tzSet`. Track A or the LAN panel; not decided.
- **OTA: not yet.** The partitions are there and nothing uses them. See the parked entry for why it matters more than it looks.

---

## Settled

Decisions as they were made, newest first, so the reasoning survives the session. Display decisions live in `docs/design-decisions.md`; this log is the project-level ones.

### 2026-09-20 — Icons are exported, not translated
`tools/icons2c.py` turns the PNGs in `design/icons/` into `src/icons.h` and `docs/sim/icons.js` from one set of bits. Eight icons, 1024 bytes of flash. `tools/verify-icons.js` renders a real dashboard and compares the control column against the exported PNGs: zero differing pixels, against 1-2% for every icon that was fitted by hand.

The workflow is now: edit the frame, export it, run the tool, build. That is the answer to "what is easiest to work with" for anything headed for a lot of iteration. What stays hand-drawn is only what a live value drives — the countdown wedge and the spinner.

One sharp edge worth knowing: base64 through a chat window arrived corrupt twice, right length and one byte wrong. `curl` the asset URL instead.

### 2026-09-20 — The control column draws real glyphs
Menu bars, a four-state signal glyph and a refresh indicator that counts down, spins while fetching and shows a struck-out circle for five seconds after a failed attempt. All of it ported pixel-for-pixel from the 1x frames and checked against exported rasters: 136 differing pixels across nine icons, almost all of it single-pixel jitter on diagonal strokes.

Two decisions are still open and both are in `explore.html` section 7: bars or dots for the spinner, and ghosted or absent for the unlit signal bands. The device is running dots and ghosted.

`C_CTRL` now carries the column's colour, separately from `C_DIM`, so it can be taken down without dimming the pace words. Replacing the discs with glyphs already removed about five-sixths of the column's ink.

**And it found a bug.** Retries were scheduled from the last successful fetch, which only advances when a fetch works — so a failing device asked again on every pass of `loop()`, against an endpoint that rate-limits hard. Now scheduled from the last attempt, which is also what the ring counts down.

### 2026-09-20 — The refresh circle, and one touch target
The control column's third circle now shows the poll interval closing clockwise, and turns into an eight-spoke spinner while the fetch is happening. It replaces the `updated 47s ago` line, which cost a row and answered the age of the last reading rather than when the next one lands. The other half of *Refresh as a visible, tappable object* — the tap — still needs somewhere for a manual refresh to go.

The top circle opens the menu, on a 56x56 zone rather than the 32px circle it draws, and the rest of the dashboard is inert. Tap-anywhere made the circles look decorative and left no way for the other two to mean anything. Full reasoning in `docs/design-decisions.md`.

One thing that came out of building it: every circle in that column is now drawn by a per-pixel test rather than `fillCircle` or `fillRoundRect`, because a 32px circle has its centre on a pixel boundary and neither primitive can put it there. The first cut was a pixel off, which showed up as a full ring looking fatter than the discs beside it.

### 2026-09-20 — Boot output is not readable remotely
Measured while trying to confirm the `[CAP]` line without a keyboard. CoreS3's native USB means the ROM bootloader and the application are different USB devices. On macOS the `/dev` node keeps its name across the switch, so nothing looks wrong, but a handle opened before it goes stale the moment the application takes the bus and a handle opened after receives nothing. Opening the port at all toggles DTR/RTS and resets the board, so a reopen loop just reboots the device repeatedly, each cycle dying at the same `[HAL]` line. `pio run -t upload -t monitor` does not reach it either, and worse than expected: a monitor handed the port that way printed *nothing at all* for seven minutes, missing the five-minute poll line as well as the boot. It is attached to the wrong side of the switch and stays there.

What works is an interactive `pio device monitor` already attached across a reset. So reading the `[CAP]` block is a keyboard job, and any future diagnostic meant to be read remotely has to print somewhere other than early boot.

Worth knowing separately: a `pio device monitor` left running holds the port, and every upload then fails with *Invalid head of packet* or *multiple access on port*. That cost four failed flashes before anyone looked at `lsof`.

### 2026-09-20 — The overage capture is pinned, not printed
Printing is not logging. `Serial.printf` is a live stream out the USB port and this device sits on a desk with nothing attached, so "read the serial log next time" described a mechanism that did not exist. The first header set seen while `unified-status` is `rejected` now pins to NVS under `ovcap`, as **raw strings** — the open questions are about the format itself, so parsing before storing would discard the evidence — and never overwrites. Every boot prints what is pinned or says nothing has been captured.

### 2026-09-20 — Figma gets the device's real fonts
Simulated type in Figma was lying by enough to hide overflows, and the screen is small enough that a 14px lie is the whole problem. `tools/fonts2ttf.py` builds 12 TTFs straight from the glyph bitmaps in `docs/sim/fonts.js`, em normalised to 100 device pixels for every face so one Figma size works everywhere. Three LovyanGFX-vs-TTF discrepancies remain, all bounded at 2px or less and documented. Layouts moved to 1x at the same time — pixel art at this size is not hard, and a coordinate that is a device pixel removes a translation step.

### 2026-09-20 — Vertical, and the bar means what is left
The horizontal layout ran out of room constantly; horizontal bars and horizontal text compete for the same 320px. Vertical columns give the text its own half of the screen. The grammar that falls out of it — **fill is what is available**, bottom edge is exhaustion — is the useful part, and it is what showed that the shipped solid overage fill said the opposite of what it meant.

### 2026-09-05 — `/api/oauth/usage` throttles before it authenticates
An unauthenticated request returns **429** with `retry-after: 784`, where `/v1/messages` returns 401 for the same. Pre-auth throttling behind Cloudflare suggests an IP-keyed limiter — inferred, not proven — which would mean a desktop monitor and this device share one bucket. Staying on the header probe for now.

### 2026-09-05 — Poll rate cut to 5 minutes
Was effectively 60s: `config.h` said 120 but the portal shipped 60 pre-selected and the portal won, so provisioned devices made 1,440 calls a day. Now 300s default, 120s floor, 900s ceiling. The floor repairs existing devices on next boot via the clamp in `settingsLoad()`.

### 2026-09-05 — Strategy settled, and two living docs started
**An ambient indicator that can be looked at directly for more detail, meant to help decide how to continue working.** Chan-ness is icing. Dollar and token totals are out — they answer a different question, and half of them are unreachable anyway. Captured in `docs/design-decisions.md`.

`docs/setup.md` and `docs/using.md` are **living documents**, updated with every change that touches setup or day-to-day use. They exist to be inspected for process intelligibility, not just to inform — if a step reads badly there, that is a finding.

### 2026-09-05 — Data surface inventoried
`docs/data-inventory.md`. The finding that matters: `GET /api/oauth/usage` returns the same windows plus Opus and Sonnet weeklies, **at no inference cost**, where the current `/v1/messages` probe spends a sliver of the budget it reports on. Endpoint existence confirmed here (429 unauthenticated, vs 404 for a fabricated path).

Not switching yet. Two things to settle first: the utilization scale differs (0–100 there, 0–1 in the headers) and would silently produce 100x-wrong gauges if the parser moved unchanged, and the JSON schema is actively moving in a way the header set is not.

### 2026-09-04 — Replace Stack-Chan's brain, but don't burn the bridge
Phase 1 depends on M5Unified and M5GFX only. StackChan-BSP is a driver library, not a brain, and adding it later is a one-line `lib_deps` change — there is no architectural lock-in either way, so there is nothing to decide early.

What *is* decided: don't fork Stack-Chan's official firmware. `stack-chan/stack-chan` is a Moddable/JavaScript runtime and `ciniml/stackchan-idf` is bare ESP-IDF; either would mean giving up claude-usage-stick's C++ entirely. Not worth it for what the BSP offers, which is drivers we can call directly when we want them.

Two carry-forwards for the voice idea (see phase 3): `ui.cpp` composes into a sprite and pushes once, with no blocking calls, so audio can own a task later without fighting the renderer. And PSRAM stays on — the framebuffer needs 150 KB of it now, audio buffers will need more.

### 2026-09-04 — Vendored files stay byte-identical
Only an SPDX header was added. Keeps `diff` against upstream readable so fixes can be pulled cheaply. Cost: `settings.h` carries four fields this project never reads. Worth it.

### 2026-09-04 — License: MIT throughout
Considered PolyForm Noncommercial first and it would have worked legally, but two things argued against it: it isn't OSI-approved, so GitHub won't badge the project as open source and some people won't contribute to it, and the MIT grant on the vendored files can't be narrowed anyway. Publishing a near-derivative of an MIT project under stricter terms also reads as ungenerous. MIT everywhere, both copyright lines in `LICENSE`, `docs/attribution.md` as the map.

### 2026-09-04 — No A/B/C buttons, and the virtual ones are off-screen
The board has two physical buttons — reset underneath and soft power on the side — but neither is a general input. Reset pulls the chip's EN line and firmware never sees it; power arrives as `M5.BtnPWR` via the PMIC. M5Unified synthesises `BtnA/B/C` from a touch strip at the bottom of the panel, but the strip height defaults to 0, placing it at `y >= 240` on a 240-pixel display. The buttons exist and never fire. `hal.cpp` calls `M5.setTouchButtonHeight(36)`, and every screen draws a labelled row there.

`M5.BtnPWR` is a real unused input, short-press only (a long hold cuts power below firmware). `docs/hardware-notes.md` has it and the Grove port map.

### 2026-09-04 — The black screen was a version problem, not a reset problem
The plan's hypothesis was wrong. The AW9523 LCD reset is already in M5GFX and always was, which is why the manual toggles in issue 199 changed nothing.

Corrected 2026-09-05: issue 199 is answered by the M5GFX maintainers, and their diagnosis is a version *pairing* mismatch (M5GFX >= 0.2.21 with M5Unified <= 0.2.14, giving backlight-off). This project separately found the ILI9342E init-list route added in 0.2.27, which is real in the source but not proven to be what anyone hit. `docs/display-notes.md` now separates the two honestly.

What holds regardless: pin M5GFX explicitly rather than resolving it through M5Unified, whose manifest requires only `>= 0.2.10`. Verified working on hardware with 0.2.28 / 0.2.21.

### 2026-09-04 — Board and toolchain
CoreS3 confirmed. PlatformIO env `stackchan`, board `m5stack-cores3`, one env only — upstream's eight-board `-DBOARD_*` matrix buys nothing here. PlatformIO installed via pipx, so `pio` is at `~/.local/bin/pio`.

---

## Background

### Goal
Turn an already-owned Stack-Chan (M5Stack CoreS3) into a standalone desk device that shows Claude Code usage against the five-hour and seven-day rate-limit windows, with no host computer and no org-level API key.

### How the data works

*Superseded in part — see `docs/data-inventory.md` for the full surface, including a second endpoint that costs no inference.* One minimal request to api.anthropic.com/v1/messages, max_tokens set to one, authenticated with a Claude Code OAuth token from `claude setup-token`. The response headers carry the live numbers: anthropic-ratelimit-unified-5h-utilization, -7d-utilization, and their matching -reset fields. This is undocumented behavior, not a published contract, but it's consistent across half a dozen independent projects. Build in a visible failure state for the day a response comes back without them.

### Prior art
- **claude-usage-stick** (github.com/oauramos/claude-usage-stick) – standalone ESP32, direct HTTPS to api.anthropic.com, PIN-encrypted OAuth token in flash, captive-portal WiFi setup. This is the base to build on.
- **Clawdmeter** (github.com/HermannBjorgvin/Clawdmeter) – same header trick, but relayed over BLE from a Mac or PC daemon. Worth its mood-animation algorithm (rate of change of usage over a five-minute window, bucketed into a mood group that picks the splash animation), not its architecture or its Anthropic-owned mascot art.
- **ClaudeGauge** (github.com/dorofino/ClaudeGauge) – dollar spend and Claude Code git analytics through a Vercel proxy, needed because the ESP32 can't reach claude.ai's web app directly (a Cloudflare fingerprint block, not a problem with api.anthropic.com itself). Spend tracking is low value on a Max plan; skip that layer. Worth its idea of multiple screens cycled by a button.
- **M5Stack-Avatar** (github.com/meganetaaan/m5stack-avatar) – the face-rendering library Stack-Chan's expressions are built on. Not needed until phase two.
- **StackChan-BSP** (github.com/m5stack/StackChan-BSP) – M5Stack's official Arduino board support package. Not a firmware: a driver library for the servo bus, the 12 RGB LEDs, the capacitive touch pads, the INA226 current sensor and NFC. MIT. Relevant from phase two on; see the decision log.

---

## Done

### Phase 1 – match claude-usage-stick
- [x] PlatformIO project on `m5stack-cores3`, git initialised
- [x] Display gotcha researched before writing any UI code (`docs/display-notes.md`)
- [x] `api.cpp`, `crypto.cpp`, `provision.cpp` vendored — plus `settings.*`, `certs.*`, `app_state.h`, which those three need to build
- [x] New `hal.cpp` and `ui.cpp` for this hardware, M5GFX for the display
- [x] Five-hour and seven-day bars, reset countdowns, visible failure state
- [x] Compiles (1.19 MB, 18% of the app slot)
- [x] Flash it — `docs/flashing.md`. Stock firmware backup skipped by choice
- [x] Get a token with `claude setup-token`, set it through the captive portal
- [x] **It works.** Live usage bars on the device, first flash
- [x] Numbers cross-checked against openUsage on the Mac — they agree
- [x] Run it for a few real days and watch for drift, or for the headers going away

### Milestones

#### 2026-09-04 — First flash succeeded
Booted, provisioned, drawing live bars. The M5GFX >= 0.2.27 diagnosis holds on real hardware, which was the one thing that could only be confirmed here.

Rough edge found in use: getting the token into the captive portal is awkward, because joining the device's AP means leaving the network the token is on. It worked, but it's the worst moment in the setup and worth a fix — see parked ideas.

#### 2026-09-04 — Numbers verified against a second source
Readings agree with openUsage running on the Mac. That closes the question of whether the undocumented response headers mean what every project assumes they mean: two independent readers, same numbers.

Still worth a few days of watching. A single agreeing sample says the parse is right; it doesn't say the headers will keep arriving, which is what the visible failure state exists for.

#### 2026-09-04 — Published
Public repo, MIT, warts and all.

