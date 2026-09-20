#!/usr/bin/env python3
"""Reset the board and print its boot output. Partial — read the caveat.

`pio device monitor` wants a TTY, so it is useless over a remote shell. This
is not, and it does capture the early boot: ROM chatter, PSRAM, M5GFX
autodetect, and the `[HAL]` line at about 660ms.

    build/venv/bin/python tools/readboot.py [port] [seconds]

**What it cannot do, measured 2026-09-20.** It stops at `[HAL]`, every time.
CoreS3 uses the ESP32-S3's *native* USB: the ROM bootloader and the
application present different USB devices. On macOS the /dev node keeps its
name across that switch -- it does not disappear and come back, which an
earlier version of this file assumed -- but a handle opened before the switch
goes stale at exactly the moment the application takes the bus, and a handle
opened after it receives nothing at all. Closing and reopening does not help:
the open itself toggles DTR/RTS and resets the board, so a retry loop just
reboots the device over and over, each cycle dying at `[HAL]` again.

So anything the firmware prints after ~660ms -- WiFi, the fetch, and the
`[CAP]` overage capture block, which is the reason this file exists -- is not
reachable this way. `pio run -t upload -t monitor` does not reach it either,
and worse than expected: a monitor handed the port that way printed nothing at
all for seven minutes, missing the five-minute poll line as well as the boot.
It is attached to the wrong side of the switch and stays there.

What does work is an interactive `pio device monitor` in a real terminal,
already attached, across a reset. Until something better exists, reading the
`[CAP]` block is a keyboard job:

    pio device monitor -e stackchan      # then press the reset button

Left here because the early-boot half is genuinely useful for display and
autodetect problems, and because the measurement above is worth not
rediscovering.
"""
import sys, time, serial

port = sys.argv[1] if len(sys.argv) > 1 else '/dev/cu.usbmodem1101'
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0

s = serial.Serial(port, 115200, timeout=0.2)
s.dtr = False            # IO0 high: run the app, do not enter the bootloader
s.rts = True             # EN low  -> reset
time.sleep(0.12)
s.rts = False            # EN high -> run

buf = bytearray()
deadline = time.time() + secs
while time.time() < deadline:
    buf += s.read(4096)
s.close()

sys.stdout.write(buf.decode('utf-8', 'replace'))
sys.stdout.write('\n[readboot] early boot only -- see this file\'s docstring\n')
