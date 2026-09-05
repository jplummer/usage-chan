# Where the code came from

The whole project is MIT. So is everything it borrows, which keeps the story
short: the only obligation anywhere is to carry the copyright notices, and
`LICENSE` carries both — Jon Plummer for the code written here, oauramos for
the files listed below. This file is the map of which file came from where, so
the credit is legible rather than buried in a header.

## Vendored from claude-usage-stick (MIT, © 2026 oauramos)

Copied verbatim. Every one carries an `SPDX-License-Identifier: MIT` header
naming its origin. Upstream's own license text is kept at
[`LICENSES/MIT-claude-usage-stick.txt`](../LICENSES/MIT-claude-usage-stick.txt).

| File | What it does |
|---|---|
| `src/api.cpp`, `src/api.h` | The one HTTPS POST to `api.anthropic.com/v1/messages` and the four rate-limit response headers it reads back |
| `src/crypto.cpp`, `src/crypto.h` | AES-256-GCM token encryption, key derived from the 4-digit PIN salted with the chip MAC |
| `src/provision.cpp`, `src/provision.h` | The captive portal: SoftAP, DNS catch-all, setup form, writes to NVS, reboots |
| `src/settings.cpp`, `src/settings.h` | NVS reads and writes, the timezone helper, the hostname slug |
| `src/certs.cpp`, `src/certs.h` | Root CA bundle for the TLS connection |
| `src/app_state.h` | The handful of globals shared between `main.cpp` and the portal |

**Nothing in these files was changed** beyond prepending the SPDX header. That
is deliberate: it keeps a future `diff` against upstream readable, so a fix or a
header-name change over there can be pulled in cheaply.

Two consequences of leaving them alone. `settings.h` still declares fields this
project never reads (`uiMode`, `dwellS`, `scrMask`, `mdlMask` — the carousel and
mascot settings from upstream's larger UI); they cost a few bytes of NVS and
buy a clean diff. And `provision.cpp` still serves upstream's setup page, still
credited to @oauramos in its footer, which is correct — that page is his work.

## Written for this project (© 2026 Jon Plummer, MIT)

| File | What it does |
|---|---|
| `src/main.cpp` | Boot order, PIN loop, WiFi, poll timer, button handling |
| `src/hal.cpp`, `src/hal.h` | CoreS3 bring-up, the touch-button strip, battery, brightness |
| `src/ui.cpp`, `src/ui.h` | Every screen, drawn into a PSRAM sprite |
| `src/config.h` | Constants, rewritten from upstream's eight-board version |

`main.cpp` follows the shape of upstream's `main.cpp` — boot phases, the PIN
retry-and-lockout loop, the AP credential generator. That structure is upstream's
idea even where the code is retyped, and the file says so in its header.

## Libraries, resolved at build time by PlatformIO

Not vendored; nothing of theirs is in this repo. All MIT, so none of them
constrains the license here.

| Library | License |
|---|---|
| [M5GFX](https://github.com/m5stack/M5GFX) | MIT, © 2021 M5Stack |
| [M5Unified](https://github.com/m5stack/M5Unified) | MIT, © M5Stack |
| [ArduinoJson](https://github.com/bblanchon/ArduinoJson) | MIT |
| Arduino core for ESP32 | LGPL-2.1 |

The Arduino ESP32 core is the one non-MIT item. LGPL-2.1 attaches to the core
itself, not to sketches built against it, which is the ordinary and intended
arrangement for every Arduino project. It does not reach this project's license.

## The upstream repos under `reference/`

`reference/` holds full clones of claude-usage-stick, M5GFX, M5Unified and
StackChan-BSP, kept for reading. It is in `.gitignore` and is not part of this
repository. To recreate it:

```bash
mkdir -p reference && cd reference
git clone --depth 1 https://github.com/oauramos/claude-usage-stick.git
git clone --depth 1 https://github.com/m5stack/M5GFX.git
git clone --depth 1 https://github.com/m5stack/M5Unified.git
git clone --depth 1 https://github.com/m5stack/StackChan-BSP.git
```
