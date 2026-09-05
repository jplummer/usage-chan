# The black screen, and what is actually known about it

`plan.md` started with a warning: M5GFX issue 199 reports a black screen on a
CoreS3-based Stack-Chan, and the guess was that the panel needs an LCD reset
through the AW9523 GPIO expander that `M5.begin()` never fires. That guess was
wrong. What replaced it is less tidy than a single root cause, so this file
separates what is established from what is inference.

## Established

**The AW9523 reset was never missing.** `Panel_M5StackCoreS3` in
`M5GFX/src/M5GFX.cpp` overrides `rst_control()` to drive LCD_RST through exactly
that pin:

```cpp
void rst_control(bool level) override
{
  static constexpr uint8_t lcd_rst_bit = 1 << 1; // AW9523B P1_1
  uint8_t bits = level ? lcd_rst_bit : 0;
  uint8_t mask = level ? ~0 : ~ lcd_rst_bit;
  lgfx::i2c::writeRegister8(i2c_port, aw9523_i2c_addr, 0x03, bits, mask, i2c_freq);
}
```

That is why toggling it by hand — which the issue reporter tried — changes
nothing. Any explanation involving a missing reset is a dead end.

**Two version boundaries**, from fetching `src/M5GFX.cpp` at each release tag:

| Version | Change |
|---|---|
| 0.2.21 | `board_M5StackChan` (board ID 27) added |
| 0.2.27 | `Panel_M5StackCoreS3::initPanelByTouchVersion()` added |

**Pinning both libraries current works.** Verified on hardware: a Stack-Chan
CoreS3 with M5GFX 0.2.28 and M5Unified 0.2.21 boots, renders, and runs. Plain
`M5.begin()` is sufficient; `hal.cpp` attempts no reset sequence.

## What the M5GFX maintainers say

[Issue 199](https://github.com/m5stack/M5GFX/issues/199) is answered, by
lovyan03 (the LovyanGFX author) and ainyan03. Their diagnosis is a **version
pairing mismatch**: M5GFX 0.2.21 introduced the StackChan board ID, M5Unified
0.2.14 and earlier don't recognise it, and the result is that `M5.begin()`
leaves the backlight off while the panel and drawing keep working. Their fix is
to update both libraries together.

They know their own code. Treat this as the primary explanation.

## What this project additionally found

M5GFX 0.2.27 added `initPanelByTouchVersion()`, which identifies the panel
indirectly: the FT5x06 touch controller's firmware ID tracks the panel it was
paired with, `0x10` for an ILI9342**C** and `0x12` for an ILI9342**E**, and on
an E it sends a different init list (`getIli9342EInitCommands()`). Both variants
answer the panel-ID read with 0xE3, so autodetection reports the right geometry
either way.

That is a real mechanism, present in the source, and a plausible second route to
a blank panel: right dimensions, backlight on, wrong initialisation commands, no
pixels.

**It is not established that this is what anyone actually hit.** The maintainers
describe the symptom as backlight *off*; the reporter described the backlight as
*on*. Those are different failures, and updating both libraries fixes either, so
nobody had to tell them apart. This device went from nothing to working in a
single step that changed several variables at once, which proves the fix and
proves nothing about the cause.

## The practical advice, which holds either way

Pin M5GFX explicitly rather than letting it resolve through M5Unified:

```ini
lib_deps =
    m5stack/M5GFX@^0.2.28
    m5stack/M5Unified@^0.2.21
```

The maintainers' advice is to keep the two updated as a pair. The package
metadata does not enforce that — M5Unified 0.2.21's manifest requires only
`M5GFX >= 0.2.10`, so a build that declares M5Unified alone can resolve an
M5GFX from either side of both boundaries above without ever asking for an old
one. An explicit pin closes that gap.

## If the screen is black anyway

1. Read the serial log. M5GFX logs `[Autodetect] board_M5StackChan` at
   `CORE_DEBUG_LEVEL=3`, which `platformio.ini` sets, and `hal.cpp` prints the
   same plus the panel dimensions.
2. Check the build output's dependency graph for the resolved versions of
   **both** libraries, not just one.
3. If the backlight is off, that matches the maintainers' diagnosis — check the
   M5Unified version first.
4. If the backlight is on and the geometry is right, that matches the
   ILI9342E route — read the touch controller's firmware ID at I2C `0x38`,
   register `0xA6`. `0x12` means an E panel, and the init list is what selects.

## Unrelated, same family of problem

CoreS3 has physical buttons, just not A/B/C ones: reset underneath, wired to the
chip's EN line and invisible to firmware, and soft power on the side, which
arrives as `M5.BtnPWR` through the PMIC. M5Unified synthesises `BtnA/B/C` from
touches in a strip along the bottom of the panel — but the strip's height
defaults to `0`, which puts it at `y >= 240` on a 240-pixel display. Off screen.
The buttons exist, update, and never fire.

`hal.cpp` calls `M5.setTouchButtonHeight(TOUCH_BTN_H)` to give the strip a real
36 pixels, and every screen draws a labelled row there. See
`docs/hardware-notes.md`.
