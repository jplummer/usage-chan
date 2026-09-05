# Why the screen works, and what we thought was wrong

`plan.md` carried a warning: M5GFX issue 199 reports a black screen on a
CoreS3-based Stack-Chan, and the guess was that the panel needs an LCD reset
through the AW9523 GPIO expander that `M5.begin()` never fires. That guess was
wrong, and the real cause is worth writing down, because the fix is a version
pin and not code.

## What issue 199 actually says

[m5stack/M5GFX#199](https://github.com/m5stack/M5GFX/issues/199), against an
OpenELAB Kickstarter Stack-Chan with a CoreS3 core:

- Backlight comes on.
- M5GFX autodetects the board and reports the right panel ID (0xE3, ILI9342)
  and the right dimensions (320x240).
- `fillScreen()` paints nothing.
- The stock firmware the unit shipped with works, so the hardware is fine.

The reporter tried a manual AW9523 reset (register 0x03, bit 1), an explicit
`init()` after `M5.begin()`, forcing brightness to 255, and rotation and write
cycles. None of it helped. Nobody posted a fix; the issue is diagnosis only.

## Why the AW9523 theory was a dead end

It was already being done. In `M5GFX/src/M5GFX.cpp`, `Panel_M5StackCoreS3`
overrides `rst_control()` to drive LCD_RST through exactly that pin:

```cpp
void rst_control(bool level) override
{
  static constexpr uint8_t lcd_rst_bit = 1 << 1; // AW9523B P1_1
  uint8_t bits = level ? lcd_rst_bit : 0;
  uint8_t mask = level ? ~0 : ~ lcd_rst_bit;
  lgfx::i2c::writeRegister8(i2c_port, aw9523_i2c_addr, 0x03, bits, mask, i2c_freq);
}
```

The reset was never missing, which is why toggling it by hand changed nothing.

## The actual cause

These units ship an **ILI9342E** panel where M5GFX assumed an **ILI9342C**.
Both answer the panel-ID read with 0xE3, so autodetection looks correct and
reports the right size — and then the driver sends the C variant's
initialisation list to an E variant, which accepts it and displays nothing.
Backlight on, correct geometry, no pixels. Exactly the reported symptom.

M5GFX 0.2.27 added `Panel_M5StackCoreS3::initPanelByTouchVersion()`, which
identifies the panel indirectly. The FT5x06 touch controller's firmware ID
tracks the panel it was paired with: `0x10` is a C, `0x12` is an E. On an E it
sends a different command list (`getIli9342EInitCommands()`), and the display
comes up.

Two versions matter, established by fetching `src/M5GFX.cpp` at each release
tag and grepping:

| M5GFX version | What changed |
|---|---|
| < 0.2.22 | No `board_M5StackChan` at all. Stack-Chan is detected as a plain CoreS3. |
| 0.2.22 | `board_M5StackChan` (board ID 27) added; detected via the GC0308 camera plus an M5IOE1 expander at I2C 0x6F reporting firmware >= 0x04. |
| 0.2.27 | `initPanelByTouchVersion()` added. **This is the black-screen fix.** |
| 0.2.28 | Current release, and what this project pins. |

## What that means for this project

`M5.begin()` is sufficient. There is no reset sequence to write, and
`hal.cpp` deliberately does not attempt one.

The requirement moved into `platformio.ini`, where M5GFX is pinned separately
from M5Unified:

```ini
m5stack/M5GFX@^0.2.28
m5stack/M5Unified@^0.2.21
```

The separate pin is the whole point. M5Unified 0.2.21's own manifest only asks
for `M5GFX >= 0.2.10`, so resolving M5GFX through M5Unified alone can legally
land on a version that renders nothing. The official
[StackChan-BSP](https://github.com/m5stack/StackChan-BSP) has the same shape of
dependency — it declares `"M5GFX": "*"` and its `begin()` does nothing to the
display beyond calling `M5.begin()`, which is the second confirmation that no
special init code exists anywhere.

## Caveat

This is read from source, not from a bench. Nobody has run it on Jon's
particular unit yet. If the screen is black on first flash, the diagnosis order
is:

1. Read the serial log. M5GFX logs `[Autodetect] board_M5StackChan` (or
   `board_M5StackCoreS3`) at `CORE_DEBUG_LEVEL=3`, which `platformio.ini` sets.
   `hal.cpp` prints the same thing plus the panel dimensions.
2. Confirm the resolved M5GFX version in the build output's dependency graph.
   It must be 0.2.27 or newer.
3. If it says `M5StackChan` at 320x240 on M5GFX 0.2.28 and the screen is still
   black, then this diagnosis is wrong and issue 199 has a second cause. Post
   the touch controller's FIRMID — `hal.cpp` can read it at I2C 0x38, register
   0xA6 — because that value is what selects the init list.

## Unrelated, but same family of problem

CoreS3 has no physical buttons. M5Unified still gives you `M5.BtnA/B/C`, and it
synthesises them from touches in a strip along the bottom of the panel — but
the strip's height defaults to `0`, which puts it at `y >= 240` on a 240-pixel
display. Off screen. The buttons exist, update, and never fire.

`hal.cpp` calls `M5.setTouchButtonHeight(TOUCH_BTN_H)` to give the strip a real
36 pixels, and every screen in `ui.cpp` draws a labelled row there so the user
can see where the invisible buttons are.
