#!/usr/bin/env python3
"""Collapse esptool's per-block progress into one line.

Why this is needed. esptool's print_overwrite() rewrites its line in place only
when stdout is a TTY; PlatformIO runs it through a pipe, so it falls back to one
newline per block. Normally that is tolerable, but this project uses --no-stub
(the flasher stub does not survive the handover on CoreS3's native USB), and the
ROM bootloader writes in 1KB blocks rather than the stub's larger ones. 1.19MB
of firmware is therefore about 1,170 lines of "Writing at 0x...".

This runs esptool as a subprocess and rewrites those lines as they arrive.
Everything else passes through untouched, including the exit code.

Our own stdout is piped too — PlatformIO captures it — so isatty() is False here
for the same reason it is False for esptool. Writing the spinner to stdout would
just reproduce the problem one layer up. Instead the spinner goes to /dev/tty,
the controlling terminal, which is reachable however stdout was redirected.

Degrades on purpose: with no controlling terminal — a CI runner, a build hook —
carriage returns would be noise, so it prints a short line every 10% instead.
Either way the wall of text is gone.
"""
import re
import subprocess
import sys
import time

# Moon phases. Eight frames is enough to read as motion, and they are legible at
# any terminal font size, which most spinner glyphs are not.
FRAMES = "🌑🌒🌓🌔🌕🌖🌗🌘"

# Redraw about eight times a second. esptool emits roughly 1,170 blocks in under
# eleven seconds, so advancing a frame per block would run at ~109fps: not a
# spinner, a flicker — and 109 terminal writes a second for no benefit. At 8fps
# the eight moons complete one cycle per second, which reads as motion.
REDRAW_INTERVAL = 0.125

# Below this many blocks a file is written faster than anyone can read about it
# — the bootloader and partition table are 15 and 3 blocks, done in a tenth of a
# second. Reporting on them is clutter, and the "Wrote N bytes" line already
# confirms they happened. Only the firmware, at ~1,165 blocks, is worth watching.
MIN_BLOCKS = 30
WRITING = re.compile(r"^Writing at 0x[0-9a-f]+\.\.\. \((\d+) %\)\s*$")


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: upload_filter.py <command> [args...]", file=sys.stderr)
        return 2

    proc = subprocess.Popen(
        sys.argv[1:],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        errors="replace",
    )

    # Not sys.stdout: that is a pipe to PlatformIO. /dev/tty is the terminal the
    # user is actually looking at, and opening it fails cleanly when there is
    # none — which is the signal to fall back to periodic lines.
    try:
        tty_out = open("/dev/tty", "w")
    except OSError:
        tty_out = None
    tty = tty_out is not None
    frame = 0
    last_draw = 0.0
    last_decade = -1
    blocks = 0
    active = False   # a progress line is currently occupying the cursor's row

    assert proc.stdout is not None
    for line in proc.stdout:
        m = WRITING.match(line)
        if not m:
            # Any other output ends the progress line and prints normally.
            if active and tty:
                tty_out.write("\r\033[K")
                tty_out.flush()
                active = False
            # Each written file restarts progress at 0%. Without this reset the
            # first file leaves last_decade at 10 and every later file — the
            # 1.19MB firmware included — reports nothing at all.
            last_decade = -1
            blocks = 0
            sys.stdout.write(line)
            sys.stdout.flush()
            continue

        pct = int(m.group(1))
        blocks += 1
        if blocks < MIN_BLOCKS:
            continue
        if tty:
            now = time.monotonic()
            # 100% always draws, so the bar never stops one frame short.
            if now - last_draw < REDRAW_INTERVAL and pct < 100:
                active = True
                continue
            last_draw = now
            frame = (frame + 1) % len(FRAMES)
            tty_out.write(f"\r\033[K  {FRAMES[frame]}  writing… {pct:3d}%")
            tty_out.flush()
            active = True
        elif pct // 10 > last_decade:
            last_decade = pct // 10
            print(f"  writing… {last_decade * 10}%", flush=True)

    if active and tty:
        tty_out.write("\r\033[K")
        tty_out.flush()
    if tty_out:
        tty_out.close()

    return proc.wait()


if __name__ == "__main__":
    sys.exit(main())
