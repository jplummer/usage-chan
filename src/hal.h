/*
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 Jon Plummer
 *
 * Hardware abstraction for the Stack-Chan (CoreS3). Keeps the same function
 * names as claude-usage-stick's hal.h so the vendored files and main.cpp read
 * the same way, but there is only one board behind it.
 */
#pragma once
#include <stdint.h>
#include <M5Unified.h>

// M5.Display is the real panel. ui.cpp draws into a PSRAM sprite and pushes it
// here in one go, so nothing flickers mid-frame.
#define lcd M5.Display

void halInit();
void halUpdate();

// A / B / C are the left, middle and right thirds of the bottom touch strip.
// See TOUCH_BTN_H in config.h for why the strip has to exist at all.
bool halBtnAWasPressed();
bool halBtnBWasPressed();
bool halBtnCWasPressed();
bool halBtnAIsPressed();
bool halBtnBIsPressed();

int  halBatPercent();
void halSetBrightness(uint8_t level);   // 0..3, mapped to panel 0/48/128/255

// Brightness has a trap in it: level 0 is a dark backlight and the value is
// persisted, so a stored 0 boots dark forever with no visible way back. These
// two keep "off" reachable without letting it become permanent.
uint8_t halNextBrightness(uint8_t level);   // cycles 1->2->3->1, never 0
uint8_t halBootBrightness(uint8_t stored);  // a stored 0 comes up visible
