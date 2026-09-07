# usage-chan — Claude usage monitor on a Stack-Chan

## Goal
Turn an already-owned Stack-Chan (M5Stack CoreS3) into a standalone desk device
that shows Claude Code usage against the five-hour and seven-day rate-limit
windows, with no host computer and no org-level API key.

## Prior art
- **claude-usage-stick** (github.com/oauramos/claude-usage-stick) – standalone ESP32, direct HTTPS to api.anthropic.com, PIN-encrypted OAuth token in flash, captive-portal WiFi setup. This is the base to build on.
- **Clawdmeter** (github.com/HermannBjorgvin/Clawdmeter) – same header trick, but relayed over BLE from a Mac or PC daemon. Worth its mood-animation algorithm (rate of change of usage over a five-minute window, bucketed into a mood group that picks the splash animation), not its architecture or its Anthropic-owned mascot art.
- **ClaudeGauge** (github.com/dorofino/ClaudeGauge) – dollar spend and Claude Code git analytics through a Vercel proxy, needed because the ESP32 can't reach claude.ai's web app directly (a Cloudflare fingerprint block, not a problem with api.anthropic.com itself). Spend tracking is low value on a Max plan; skip that layer. Worth its idea of multiple screens cycled by a button.
- **M5Stack-Avatar** (github.com/meganetaaan/m5stack-avatar) – the face-rendering library Stack-Chan's expressions are built on. Not needed until phase two.
- **StackChan-BSP** (github.com/m5stack/StackChan-BSP) – M5Stack's official Arduino board support package. Not a firmware: a driver library for the servo bus, the 12 RGB LEDs, the capacitive touch pads, the INA226 current sensor and NFC. MIT. Relevant from phase two on; see the decision log.

## How the data works

*Superseded in part — see `docs/data-inventory.md` for the full surface,
including a second endpoint that costs no inference.*
One minimal request to api.anthropic.com/v1/messages, max_tokens set to one, authenticated with a Claude Code OAuth token from `claude setup-token`. The response headers carry the live numbers: anthropic-ratelimit-unified-5h-utilization, -7d-utilization, and their matching -reset fields. This is undocumented behavior, not a published contract, but it's consistent across half a dozen independent projects. Build in a visible failure state for the day a response comes back without them.

---

## Decision log

Written as decisions get made, so the reasoning survives the session.

### 2026-09-04 — Board and toolchain
CoreS3 confirmed. PlatformIO env `stackchan`, board `m5stack-cores3`, one env
only — upstream's eight-board `-DBOARD_*` matrix buys nothing here. PlatformIO
installed via pipx, so `pio` is at `~/.local/bin/pio`.

### 2026-09-04 — The black screen was a version problem, not a reset problem
The plan's hypothesis was wrong. The AW9523 LCD reset is already in M5GFX and
always was, which is why the manual toggles in issue 199 changed nothing.

Corrected 2026-09-05: issue 199 is answered by the M5GFX maintainers, and their
diagnosis is a version *pairing* mismatch (M5GFX >= 0.2.21 with M5Unified
<= 0.2.14, giving backlight-off). This project separately found the ILI9342E
init-list route added in 0.2.27, which is real in the source but not proven to
be what anyone hit. `docs/display-notes.md` now separates the two honestly.

What holds regardless: pin M5GFX explicitly rather than resolving it through
M5Unified, whose manifest requires only `>= 0.2.10`. Verified working on
hardware with 0.2.28 / 0.2.21.

### 2026-09-04 — No A/B/C buttons, and the virtual ones are off-screen
The board has two physical buttons — reset underneath and soft power on the side
— but neither is a general input. Reset pulls the chip's EN line and firmware
never sees it; power arrives as `M5.BtnPWR` via the PMIC. M5Unified synthesises
`BtnA/B/C` from a touch strip at the bottom of the panel, but the strip height
defaults to 0, placing it at `y >= 240` on a 240-pixel display. The buttons
exist and never fire. `hal.cpp` calls `M5.setTouchButtonHeight(36)`, and every
screen draws a labelled row there.

`M5.BtnPWR` is a real unused input, short-press only (a long hold cuts power
below firmware). `docs/hardware-notes.md` has it and the Grove port map.

### 2026-09-04 — License: MIT throughout
Considered PolyForm Noncommercial first and it would have worked legally, but
two things argued against it: it isn't OSI-approved, so GitHub won't badge the
project as open source and some people won't contribute to it, and the MIT grant
on the vendored files can't be narrowed anyway. Publishing a near-derivative of
an MIT project under stricter terms also reads as ungenerous. MIT everywhere,
both copyright lines in `LICENSE`, `docs/attribution.md` as the map.

### 2026-09-04 — Vendored files stay byte-identical
Only an SPDX header was added. Keeps `diff` against upstream readable so fixes
can be pulled cheaply. Cost: `settings.h` carries four fields this project never
reads. Worth it.

### 2026-09-04 — Replace Stack-Chan's brain, but don't burn the bridge
Phase 1 depends on M5Unified and M5GFX only. StackChan-BSP is a driver library,
not a brain, and adding it later is a one-line `lib_deps` change — there is no
architectural lock-in either way, so there is nothing to decide early.

What *is* decided: don't fork Stack-Chan's official firmware. `stack-chan/stack-chan`
is a Moddable/JavaScript runtime and `ciniml/stackchan-idf` is bare ESP-IDF;
either would mean giving up claude-usage-stick's C++ entirely. Not worth it for
what the BSP offers, which is drivers we can call directly when we want them.

Two carry-forwards for the voice idea (see phase 3): `ui.cpp` composes into a
sprite and pushes once, with no blocking calls, so audio can own a task later
without fighting the renderer. And PSRAM stays on — the framebuffer needs 150 KB
of it now, audio buffers will need more.

---

### 2026-09-04 — First flash succeeded
Booted, provisioned, drawing live bars. The M5GFX >= 0.2.27 diagnosis holds on
real hardware, which was the one thing that could only be confirmed here.

Rough edge found in use: getting the token into the captive portal is awkward,
because joining the device's AP means leaving the network the token is on. It
worked, but it's the worst moment in the setup and worth a fix — see parked
ideas.

### 2026-09-04 — Numbers verified against a second source
Readings agree with openUsage running on the Mac. That closes the question of
whether the undocumented response headers mean what every project assumes they
mean: two independent readers, same numbers.

Still worth a few days of watching. A single agreeing sample says the parse is
right; it doesn't say the headers will keep arriving, which is what the visible
failure state exists for.

### 2026-09-04 — Published
Public repo, MIT, warts and all.

---

## Phase 1 – match claude-usage-stick
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
- [ ] Run it for a few real days and watch for drift, or for the headers going away

## Phase 1.5 – make it livable

Phase 1 works but is awkward to live with. Everything here is about the parts
you touch, not the parts that compute. Ordered by how much pain each removes
per hour of work.

### Port the LAN settings panel

claude-usage-stick already has this, in `panel.cpp` and `panel_html.h` (~1,100
lines, MIT). It was dropped when reducing to the single-screen path, and it is
the single largest win available.

It serves a control panel over the home WiFi at `http://<devicename>.local` or
the IP. The login is the same 4-digit PIN, and logging in **also unlocks the
device**, so you type the PIN in a browser instead of tapping a digit up to
36 times. It carries brightness, refresh interval, timezone, device name,
screen flip, WiFi switching, and a factory reset armed by typing `ERASE`.

The part that matters most: it can **replace the stored token without a factory
reset** — it re-encrypts, swaps live, and test-drives the new token against the
API for a verified/failed verdict. That closes the token-expiry problem, which
otherwise arrives in a year as a dead device.

Porting cost is mostly the parts of `panel.cpp` that reference upstream's
carousel, history and news screens, none of which exist here. The panel needs
`panelService()` pumped from `loop()` and from inside every blocking boot wait.

### Smooth out first setup

Four things went wrong in practice, in order of severity:

1. **Joining the setup AP drops you off the internet**, so the token has to
   already be on your clipboard before you switch networks. Nothing on screen
   or in the portal says so. This was the worst moment in the flow.
2. **The AP password has to be read off the screen and typed into a phone.**
3. **PIN entry is up to 36 taps** — ten per digit worst case, plus confirms.
4. **After setup, nothing tells you where the device is on the LAN.** Moot until
   the panel exists, then immediately relevant.

`M5GFX` has `lcd.qrcode()` built into `LGFXBase`, so a QR code costs no library
and no meaningful flash. That makes fixes 2 and 4 nearly free:

- A **WiFi join QR** on the setup screen, encoding
  `WIFI:T:WPA;S:UsageChan-A3F2;P:K7M2QRST;;`. iOS and Android camera apps join a
  network directly from that format. Deletes the typing step.
- A **portal URL QR** for `http://192.168.4.1` once joined.
- A line at the top of the portal page: *copy your token before joining this
  network*. One sentence in `provision.cpp`'s HTML, and it is the cheapest fix
  of the four.
- Later, the device's LAN address as a QR on the dashboard, once there is
  something at that address worth reaching.

Fix 3 is largely solved by the panel (type the PIN in a browser), and fully
solved by an on-screen keypad — see parked ideas.

## Phase 2 (optional) – Stack-Chan's own capabilities
- Swap the plain bars for a face through M5Stack-Avatar, expression driven by five-hour utilization and burn rate
- Consider the servo neck – a droop as the budget depletes. Servos are on a rail gated by the PY32 expander that phase 1 leaves off; StackChan-BSP's `setServoPowerEnabled()` is how it comes on
- The 12 RGB LEDs are a second display surface and cost almost nothing — a single ambient colour for 5h utilization, readable from across the room with the screen dark
- Worth doing once phase one has run clean for a while, not before

## Phase 3 – exceed
- Model health mascots pulled from status.claude.com, Mango's approach – public endpoint, no token, cheap to add
- Reuse Clawdmeter's mood algorithm (rate of change over a five-minute window) once phase two's face exists – not its art or fonts, which its own README flags as a licensing gray area
- Multiple screens cycled by button, ClaudeGauge-style, if one screen stops being enough
- **Voice.** CoreS3 has a mic and speaker, and M5Unified exposes both — no BSP needed. Realistic shape is record → ship audio to a service → play the answer, not on-device wake word plus STT. That is a much larger project than phase 1 and pulls in an API key, a second endpoint, and a real audio task. Design constraints it imposes are already honoured (see the decision log)
- Explicitly out of scope: dollar spend and Claude Code git or session analytics. That data lives in local logs and git history on the Mac, not anywhere the ESP32 can reach on its own – it would need a host relay like Clawdmeter's, which phase one deliberately avoids

## Parked ideas

### Refresh as a visible, tappable object
Make the poll interval legible instead of invisible. A small indicator that ebbs
away as the interval runs down, becomes a spinner while the fetch is in flight,
and refills when it completes. The same object is the refresh control: tap it to
pull the next poll forward.

Two things this earns beyond looking nice. It answers *is this thing alive* with
no separate liveness indicator, which the current "updated 47s ago" line does
only weakly. And it makes the honest cost visible — every poll is a real API
call that spends a sliver of the budget being displayed — by showing that a
manual refresh consumes something that was filling up on its own.

Open question: whether it lives on screen, on `M5.BtnPWR`, or both. Both is
probably right, since the physical button is the one input that does not put a
fingerprint on the display.

### A settings menu on the device
The panel needs a phone, and reaching for a phone to dim a screen you are
sitting in front of is silly. A button-opened menu covering brightness, refresh
interval, and a manual refresh would cover the common tweaks locally. Reads as
complementary to the panel, not competing with it.

### Over-the-air updates
The partition table already carries everything needed — `otadata` plus two 6.5 MB
app slots, of which the 1.19 MB firmware uses 18% of one. Nothing uses them.

This matters more than it looks for a desk object. Every change today means
unplugging the device, finding a USB-C cable, and carrying it to a computer,
which is enough friction to stop small improvements from being worth making.
It also means the fleet is exactly one device, forever, because nobody else will
do that either.

Pairs naturally with the LAN panel: an authenticated upload endpoint there, or
plain ArduinoOTA on the same network. The PIN already exists as a credential.

Caution worth stating up front: a bad OTA image on a device with no physical
buttons and a screen that may not come up is the one way to make this thing
genuinely hard to recover. The dual-slot layout is what protects against that,
so any implementation must roll back on a failed boot rather than overwrite in
place.

### The week strip (backlog)
Seven segments, one per day, showing consumption per day with today in progress.
It would answer the one question nothing else here can — *is this week unusual?*
— and it is buildable: the device samples 7-day utilization every five minutes
and discards every sample, where seven daily snapshots is 28 bytes of NVS. No
API offers this, and the desktop tools that show a trend need your Mac's session
logs, so it would be genuinely ours.

**Parked as too fragile for now.** The interesting work is not the strip, it is
designing every way it degrades: a device flashed four days ago, a device that
was unplugged for two of the seven days, a window that reset mid-sample, a boot
with no clock so samples cannot be dated. Each needs a defined appearance, and
getting any of them wrong produces a chart that lies. Worth doing deliberately
later rather than accidentally now.

### The rest

- **Ease the token handoff.** Joining the setup AP drops your phone or laptop off the internet, so the token has to be already copied before you switch networks. A QR code on the device pointing at `http://192.168.4.1`, and a note on the setup page telling you to copy the token first, would cover most of the pain
- **Use `M5.BtnPWR`.** A real physical input sitting unused. "Refresh now" fits it, and would free the middle touch zone
- **A real PIN keypad.** Four digits at one-tap-per-increment is up to 36 taps. A 320x240 touchscreen can show ten targets; it just needs raw touch coordinates rather than the three-button abstraction
- **Token expiry.** `claude setup-token` tokens last a year. Largely solved by the panel's token replacement; a countdown from a stored issue date would still warn before the device simply stops
- **Sleep or dim on a schedule.** A lit 320x240 panel on a nightstand at 2am is a lot
- **Poll less when idle.** Utilization that hasn't moved in an hour doesn't need a 2-minute poll, and every poll spends the budget it reports on

### 2026-09-05 — Data surface inventoried
`docs/data-inventory.md`. The finding that matters: `GET /api/oauth/usage`
returns the same windows plus Opus and Sonnet weeklies, **at no inference
cost**, where the current `/v1/messages` probe spends a sliver of the budget it
reports on. Endpoint existence confirmed here (429 unauthenticated, vs 404 for
a fabricated path).

Not switching yet. Two things to settle first: the utilization scale differs
(0–100 there, 0–1 in the headers) and would silently produce 100x-wrong gauges
if the parser moved unchanged, and the JSON schema is actively moving in a way
the header set is not.

### 2026-09-05 — Strategy settled, and two living docs started
**An ambient indicator that can be looked at directly for more detail, meant to
help decide how to continue working.** Chan-ness is icing. Dollar and token
totals are out — they answer a different question, and half of them are
unreachable anyway. Captured in `docs/design-decisions.md`.

`docs/setup.md` and `docs/using.md` are **living documents**, updated with every
change that touches setup or day-to-day use. They exist to be inspected for
process intelligibility, not just to inform — if a step reads badly there, that
is a finding.

### 2026-09-05 — Poll rate cut to 5 minutes
Was effectively 60s: `config.h` said 120 but the portal shipped 60 pre-selected
and the portal won, so provisioned devices made 1,440 calls a day. Now 300s
default, 120s floor, 900s ceiling. The floor repairs existing devices on next
boot via the clamp in `settingsLoad()`.

### 2026-09-05 — `/api/oauth/usage` throttles before it authenticates
An unauthenticated request returns **429** with `retry-after: 784`, where
`/v1/messages` returns 401 for the same. Pre-auth throttling behind Cloudflare
suggests an IP-keyed limiter — inferred, not proven — which would mean a desktop
monitor and this device share one bucket. Staying on the header probe for now.

## Open questions
- **Switch to `/api/oauth/usage`, or read both?** Reading both gives Opus and
  Sonnet breakdown *and* `representative-claim`. Costs one extra request
- **Terms of service.** Consumer terms prohibit automated access except via an
  API key; `claude setup-token` is Anthropic's own command for automation. See
  `docs/data-inventory.md`. Unresolved, and an account-owner call
- Next build work: phase 1.5, starting with the two cheap setup fixes
