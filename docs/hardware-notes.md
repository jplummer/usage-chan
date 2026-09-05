# What's on the CoreS3 face

Pin assignments below are read from M5Unified's own tables
(`src/M5Unified.cpp`, `_pin_table_i2c_ex_in` / `_pin_table_port_bc` /
`_pin_table_port_de`), for `board_M5StackChan` specifically — which carries the
same values as `board_M5StackCoreS3`.

## Buttons

Two physical buttons, neither of which is `BtnA`.

| Button | Where | Firmware sees it? |
|---|---|---|
| Reset | Bottom edge | **No.** Wired to the ESP32-S3 EN line. It reboots the chip; no code runs to observe it |
| Power | Left side | **Yes**, as `M5.BtnPWR`, read from the AXP2101 PMIC's key-state register — not as a GPIO |

`M5.BtnPWR` reports a short press as `clicked` and anything longer as `hold`.
Only the short press is safe to use: a long hold cuts power at the PMIC, below
anything firmware can intercept.

That leaves it as a genuinely useful third input, and the one that doesn't put a
fingerprint on the screen. Nothing uses it yet. An obvious fit is "refresh now",
which would free the middle touch zone.

`BtnA`/`BtnB`/`BtnC` are not hardware at all — they're the left, middle and
right thirds of a 36-pixel strip at the bottom of the touch panel. See
`docs/display-notes.md` for why that strip has to be created explicitly.

## Connectors

The three four-pin HY2.0 headers are M5Stack's Grove-compatible ports. Colour
coding is standard across their range, so the red one with the logic icons is
Port A.

| Port | Colour | Pins | What it's for |
|---|---|---|---|
| A | Red | SDA `GPIO2`, SCL `GPIO1` | External I2C. The logic icons are SDA/SCL |
| B | Black | `GPIO8`, `GPIO9` | GPIO / ADC / DAC |
| C | Blue | `GPIO18`, `GPIO17` | UART |

Two things worth knowing:

- **Port A is a separate I2C bus from the internal one.** The AXP2101 PMIC, the
  AW9523 expander, the FT5x06 touch controller and the panel all live on the
  internal bus at SCL `GPIO11` / SDA `GPIO12`. Nothing you plug into Port A can
  collide with them.
- **Port C and "Port D/E" are the same physical connector.** M5Unified's Port D/E
  table gives `18, 17` for Port E, which is Port C's pin pair under a second
  name used by some modules. There is one connector, not two.

Also on the face: a microSD slot (SPI, CS on `GPIO4`, sharing the display's SPI
bus) and the USB-C port, which is native USB on this chip rather than a UART
bridge. That's why the serial port shows up as `/dev/cu.usbmodem*` and not
`usbserial`, and why it only appears once firmware is running.

## Relevance later

The mic and speaker are on-board and reachable through M5Unified (`M5.Mic`,
`M5.Speaker`); `hal.cpp` leaves both off in phase 1 because initialising I2S
isn't free. The servo bus, the 12 RGB LEDs and the capacitive touch pads are
Stack-Chan additions behind the PY32 expander, reachable through
[StackChan-BSP](https://github.com/m5stack/StackChan-BSP) when phase 2 wants them.
