# Setting up usage-chan

*Living document. Updated whenever the setup flow changes — if this drifts from
what the device does, that is a bug in the document. Last checked against
firmware 0.1.0.*

Setup happens once. It takes about five minutes, and four of those are waiting
for things to reboot.

## Before you start

**Copy your token to the clipboard first.** This is the awkward part of the
current flow and the reason it is called out here rather than buried in step 3.
Setting up the device means joining a WiFi network it creates, which drops you
off the internet — so anything you still need to look up is out of reach until
you are finished.

On your Mac:

```bash
claude setup-token
```

That prints a token beginning `sk-ant-oat01-`. It is good for a year. Copy it.

> **Known rough edge.** We intend to remove this step by asking for the token
> *after* the device is on your home network, so you never have to prepare
> anything in advance. See `plan.md`, phase 1.5. Until then, copy first.

You will also invent a **4-digit PIN** during setup. It is the encryption key
for the token, it is never stored anywhere, and the device asks for it at every
boot. Forgetting it means a factory reset and a fresh token.

## 1. Flash the firmware

See [`flashing.md`](flashing.md), which covers what gets written and what it
overwrites. Short version:

```bash
~/.local/bin/pio run -t upload
```

**There is no over-the-air update.** Every firmware change means a USB-C cable.
Settings survive a reflash — NVS sits between the written regions and is not
touched — so updating an already-configured device does not mean setting it up
again.

## 2. Join the device's network

On first boot the device has no configuration, so it creates its own WiFi
network and shows the details on screen:

- **Network:** `UsageChan-XXXX`, where XXXX comes from the device's MAC address
- **Password:** eight characters, shown on screen, different for every device

Join it from a phone or laptop. A captive portal should open by itself. If it
does not, go to **http://192.168.4.1**.

## 3. Fill in the form

| Field | Notes |
|---|---|
| SSID | Your home network. **2.4 GHz only** — the ESP32 has no 5 GHz radio |
| Password | Leave empty for an open network |
| OAuth token | The `sk-ant-oat01-` string you copied |
| Encryption PIN | Exactly four digits |
| Refresh interval | Default 5 minutes. See "Why five minutes" in [`using.md`](using.md) |
| Screen brightness | Changeable later |
| Device name | Cosmetic today; will become the device's `.local` hostname when the LAN panel lands |

Submit. The device encrypts the token with your PIN, writes both to flash, and
reboots.

## 4. Enter the PIN

The device asks for the PIN at every boot, including this one.

There are no physical buttons for this. The bottom 36 pixels of the touchscreen
are three buttons, labelled on screen:

- **Left third** — advance the current digit
- **Middle third** — confirm and move to the next digit

Four digits, then it connects, syncs the clock, and fetches.

If NTP is slow the boot continues anyway and keeps retrying in the background,
so a stubborn network delays the countdowns rather than wedging the device.

> **Known rough edge.** Worst case this is 36 taps. The LAN panel will let you
> type the PIN in a browser instead, which also unlocks the device.

## 5. Check it

Two bars, two countdowns, a status line reading "updated Ns ago". Cross-check
the numbers against `claude /usage` on your Mac, or OpenUsage if you run it.

## When setup goes wrong

| What you see | What it means |
|---|---|
| Black screen, backlight on | Library version problem, not your fault. See [`display-notes.md`](display-notes.md) |
| Nothing on the serial monitor | CoreS3 uses native USB, so the port only appears once firmware runs. An empty monitor means it did not get that far — re-run the upload and watch for an esptool error |
| "WIFI FAILED", then the setup network reappears | Wrong password, or a 5 GHz network. The device falls back to a WiFi-only portal that keeps your token |
| `no data: auth_failed` | Token rejected. Most likely expired — tokens last a year |
| `no data: no_usage_h_200` | Authenticated fine, but this plan does not publish usage headers. Real on Enterprise and API-billed accounts |
| Wrong PIN | Lockout doubles from 60s. **Ten wrong attempts wipes the credentials** |

## Starting over

Hold the **bottom-left and bottom-middle** of the screen for two seconds during
boot. That wipes stored settings — WiFi, token, preferences — and returns you to
step 2. The firmware is untouched.
