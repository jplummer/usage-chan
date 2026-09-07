# Usage-Chan

A Stack-Chan that shows how much of your Claude rate-limit budget is left.

It sits on a desk, polls `api.anthropic.com` every five minutes, and answers one
question: *can I start this now, or should I wait?* No host computer, no org API
key, no Mac daemon relaying over Bluetooth. The device does it alone.

The bar is the **window**, not the budget. Its right edge is both exhaustion and
reset — you race toward it either way, and the only question is which arrives
first. A diamond marks where an even burn would have you, so the gap between the
diamond and the bar's edge is the whole reading: behind pace is calm however
little remains, ahead of pace is worth knowing.

The seven-day window is one quiet line underneath, growing into a full bar only
when the server says it is the limit that will actually stop you.

No face and no servo yet. `plan.md` has the phases, and `docs/design-decisions.md`
has the reasoning — including the behavioural research that argued against
several things this device used to do.

## Hardware

An M5Stack CoreS3 — ESP32-S3, 16MB flash, 8MB PSRAM, 320x240 IPS touch — which
is the standard Stack-Chan core. It works on a bare CoreS3 too; the servos,
LEDs and touch pads that make a CoreS3 a Stack-Chan go unused in phase 1.

The two physical buttons are reset and soft power, neither of which is a
general-purpose input. The bottom 36 pixels of the touchscreen act as three
buttons instead, and every screen labels them so you can see where they are.
[`docs/hardware-notes.md`](docs/hardware-notes.md) has the rest of the face,
including what the three Grove connectors are.

## How the numbers get here

One POST to `/v1/messages` with `max_tokens: 1`, authenticated with a Claude
Code OAuth token. The answer is in the response headers, not the body:

```
anthropic-ratelimit-unified-5h-utilization
anthropic-ratelimit-unified-5h-reset
anthropic-ratelimit-unified-7d-utilization
anthropic-ratelimit-unified-7d-reset
```

This is undocumented. It is not a published contract, and it can change without
notice, though it has held steady across every project that has tried it. When
the headers stop arriving the dashboard says `no data:` and the reason, rather
than leaving yesterday's bars up.

Each poll is itself an API call, so the monitor spends a sliver of the budget it
reports on. Two minutes is the default interval.

## Setup

1. Get a token on your Mac. It's good for a year.

   ```bash
   claude setup-token
   ```

2. Build and flash. See [`docs/flashing.md`](docs/flashing.md), which covers
   what lands on the device and what it overwrites.

   The full walk-through is [`docs/setup.md`](docs/setup.md); the short version
   follows.

3. On first boot the device has no config, so it opens its own WiFi network —
   `UsageChan-XXXX`, with the password shown on screen. Join it from a phone or
   laptop; the captive portal opens at `http://192.168.4.1`. Enter your WiFi
   details, paste the token, and pick a 4-digit PIN.

   **Copy the token to your clipboard before you join that network.** Joining
   the device's AP drops you off the internet, so anything you still needed to
   look up is out of reach until you're done. This is the awkward moment in the
   setup.

   The token never goes into the source, into a build flag, or over a cable. It
   is typed into that page once and stored AES-256-GCM encrypted in flash.

4. The device reboots and asks for the PIN. It asks at every boot: the PIN is
   the decryption key and is not stored anywhere, so forgetting it means a
   factory reset and a fresh token.

## Using it

**Tap anywhere on the dashboard** to open the menu; tap outside its rows to
close. PIN entry and boot still use three zones along the bottom 36 pixels,
labelled on the screens that use them.

| Screen | Left third | Middle third |
|---|---|---|
| PIN entry | next digit | confirm digit |
| Boot | hold both for 2s → factory reset | |

## Layout

```
src/
  main.cpp          boot order, PIN loop, WiFi, poll timer
  hal.cpp/.h        CoreS3 bring-up, touch buttons, battery, brightness
  ui.cpp/.h         every screen, drawn into a PSRAM sprite
  config.h          constants
  api.*             ─┐
  crypto.*           │  vendored from claude-usage-stick, MIT, unmodified
  provision.*        │  except for an added SPDX header
  settings.*         │
  certs.*            │
  app_state.h       ─┘
docs/
  setup.md          first-time setup, start to finish
  using.md          living with it: controls, config, failure states
  design-decisions.md  what this is for, and why it isn't other things
  data-inventory.md what the device can and cannot ever know
  display-notes.md  why the screen is black on old library versions
  hardware-notes.md buttons, Grove ports, what's actually on the face
  flashing.md       what gets written to the device, and how
  attribution.md    which file came from where
```

## Two things worth knowing before you build

**The M5GFX version is load-bearing.** Anything older than 0.2.27 gives you a
lit backlight and no pixels on this board, and M5Unified will happily resolve
one of those if you let it. `platformio.ini` pins M5GFX separately for that
reason. The full story, including why the AW9523 reset everyone reaches for is
a red herring, is in [`docs/display-notes.md`](docs/display-notes.md).

**It runs, and the numbers are right.** Flashed to a real Stack-Chan, connects,
draws live bars, and agrees with openUsage reading the same account from a Mac.
The M5GFX version pin is doing its job.

It is also a weekend hobby project by someone who does this for fun. There is no
support, and the API behaviour it depends on is undocumented and could stop
working without warning.

## License

MIT, same as everything it's built on. See [`LICENSE`](LICENSE) and
[`docs/attribution.md`](docs/attribution.md).

Standing on: **claude-usage-stick** by [@oauramos](https://github.com/oauramos)
for the whole approach — direct HTTPS from an ESP32, PIN-encrypted token in
flash, captive-portal setup — and M5Stack's **M5GFX** and **M5Unified** for the
board support.
