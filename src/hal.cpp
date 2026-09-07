/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 */
#include "hal.h"
#include "config.h"
#include <Arduino.h>

void halInit() {
    auto cfg = M5.config();

    // Everything below is deliberate, not boilerplate. Defaults are noted where
    // they differ, because the wrong value here is a silent failure, not a
    // compile error.
    cfg.clear_display  = true;
    cfg.output_power   = false;  // don't power the Grove/bus rail; nothing is attached
    cfg.internal_imu   = false;  // no tilt features in phase 1
    cfg.internal_rtc   = true;   // used for the reset countdowns after the NTP sync
    cfg.internal_spk   = false;  // phase 3 (voice) turns this on; it costs I2S setup
    cfg.internal_mic   = false;  // ditto
    cfg.external_speaker.module_display = false;

    M5.begin(cfg);

    // The whole display story for this board lives in docs/display-notes.md.
    // Short version: M5.begin() IS sufficient, but only on M5GFX >= 0.2.27,
    // which is pinned in platformio.ini. Older versions send ILI9342C init
    // commands to what is actually an ILI9342E panel and you get a lit but
    // blank screen. Nothing extra is needed here — no manual AW9523 reset.
    // The log line below is the cheap way to confirm the board was identified;
    // it should read "M5StackChan" on a Stack-Chan and "M5StackCoreS3" on a
    // bare CoreS3. Either one renders fine.
    // M5Unified exposes the detected board only as an enum, so name the three
    // values this project can legitimately see and report the raw number for
    // anything else. Anything else means autodetect went somewhere unexpected
    // and the panel config is not to be trusted.
    const char* boardName;
    switch (M5.getBoard()) {
        case m5gfx::board_t::board_M5StackChan:     boardName = "M5StackChan";     break;
        case m5gfx::board_t::board_M5StackCoreS3:   boardName = "M5StackCoreS3";   break;
        case m5gfx::board_t::board_M5StackCoreS3SE: boardName = "M5StackCoreS3SE"; break;
        default:                                    boardName = "UNEXPECTED";      break;
    }
    Serial.printf("[HAL] board=%s (%d) panel=%dx%d\n",
                  boardName, (int)M5.getBoard(), lcd.width(), lcd.height());

    // The board's two physical buttons are not BtnA/BtnB. Reset (underneath)
    // pulls the chip's EN line and firmware never sees it; power (side) arrives
    // as M5.BtnPWR through the AXP2101. M5Unified synthesises BtnA/B/C from
    // touches in a strip at the bottom of the panel instead — but the strip's
    // height defaults to zero, which places it at y >= 240, one pixel past the
    // last row of a 240-pixel display. Without this call the buttons are real
    // objects that never fire, which looks exactly like broken touch.
    M5.setTouchButtonHeight(TOUCH_BTN_H);

    halSetBrightness(DEFAULT_BRIGHTNESS);
}

void halUpdate() {
    M5.update();
}

bool halBtnAWasPressed() { return M5.BtnA.wasPressed(); }
bool halBtnBWasPressed() { return M5.BtnB.wasPressed(); }
bool halBtnCWasPressed() { return M5.BtnC.wasPressed(); }
bool halBtnAIsPressed()  { return M5.BtnA.isPressed(); }
bool halBtnBIsPressed()  { return M5.BtnB.isPressed(); }

int halBatPercent() {
    // AXP2101 reports the gauge directly; -1 means it could not be read, and
    // the UI hides the battery readout rather than drawing a lie.
    int p = M5.Power.getBatteryLevel();
    return (p < 0 || p > 100) ? -1 : p;
}

void halSetBrightness(uint8_t level) {
    static const uint8_t table[4] = {0, 48, 128, 255};
    lcd.setBrightness(table[level > 3 ? 3 : level]);
}

// Level 0 is a genuinely off backlight, and brightness is persisted — so a
// device that stores 0 boots dark, every time, with no visible way back. That
// is indistinguishable from broken hardware.
//
// There is no "off" in this product. It is a desk device for working hours, and
// a screen you cannot see is a screen that is not doing its job. Level 0 stays
// in the table only so an old stored value maps to something.
uint8_t halNextBrightness(uint8_t level) {
    return (level >= 3 || level == 0) ? 1 : (uint8_t)(level + 1);
}

uint8_t halBootBrightness(uint8_t stored) {
    // Whatever is in NVS, come up visible.
    return stored == 0 ? 2 : stored;
}
