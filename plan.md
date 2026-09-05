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
always was, which is why the manual toggles in issue 199 changed nothing. The
real cause: these units ship an **ILI9342E** panel, both variants answer the ID
read with 0xE3, and M5GFX before 0.2.27 sent ILI9342C init commands to it.

`M5.begin()` is sufficient on **M5GFX >= 0.2.27**. M5GFX is pinned separately
from M5Unified in `platformio.ini` because M5Unified's own floor is only
`>= 0.2.10`, which resolves to a version that renders nothing. Full write-up in
`docs/display-notes.md`.

Not verified on hardware. Diagnosis order for a black first boot is in that doc.

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

### 2026-09-04 — First flash succeeded
Booted, provisioned, drawing live bars. The M5GFX >= 0.2.27 diagnosis holds on
real hardware, which was the one thing that could only be confirmed here.

Rough edge found in use: getting the token into the captive portal is awkward,
because joining the device's AP means leaving the network the token is on. It
worked, but it's the worst moment in the setup and worth a fix — see parked
ideas.

## Parked ideas
- **Ease the token handoff.** Joining the setup AP drops your phone or laptop off the internet, so the token has to be already copied before you switch networks. A QR code on the device pointing at `http://192.168.4.1`, and a note on the setup page telling you to copy the token first, would cover most of the pain
- **Use `M5.BtnPWR`.** A real physical input sitting unused. "Refresh now" fits it, and would free the middle touch zone
- **A real PIN keypad.** Four digits at one-tap-per-increment is up to 36 taps. A 320x240 touchscreen can show ten targets; it just needs raw touch coordinates rather than the three-button abstraction
- **Token expiry.** `claude setup-token` tokens last a year. The device should say so before it stops working, not after — the 401 path already reports `auth_failed`, but a countdown from a stored issue date would be kinder
- **Sleep or dim on a schedule.** A lit 320x240 panel on a nightstand at 2am is a lot
- **Poll less when idle.** Utilization that hasn't moved in an hour doesn't need a 2-minute poll, and every poll spends the budget it reports on

### 2026-09-04 — Numbers verified against a second source
Readings agree with openUsage running on the Mac. That closes the question of
whether the undocumented response headers mean what every project assumes they
mean: two independent readers, same numbers.

Still worth a few days of watching. A single agreeing sample says the parse is
right; it doesn't say the headers will keep arriving, which is what the visible
failure state exists for.

### 2026-09-04 — Published
Public repo, MIT, warts and all.

## Open questions
- Nothing blocking. Next real work is phase 2, or the parked ideas above
