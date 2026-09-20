#!/bin/sh
# Flash the device, tolerating the ESP32-S3 native-USB re-enumeration flake.
# The ROM bootloader and the application present different USB devices, so the
# port can vanish mid-handshake. Retry a few times before believing a failure.
cd "$(dirname "$0")/.." || exit 1
PIO="$HOME/.local/bin/pio"
LOG=/tmp/uc_upload.log

# A running `pio device monitor` holds the port, and every upload then fails
# with "Invalid head of packet" or "multiple access on port". That cost four
# failed flashes before anyone looked at lsof. Say so instead of retrying.
if pgrep -f "device monitor" > /dev/null 2>&1; then
  echo "A pio device monitor is holding the serial port. Quit it first."
  exit 1
fi
: > "$LOG"
i=1
while [ "$i" -le 4 ]; do
  echo "=== attempt $i ===" >> "$LOG"
  if "$PIO" run -e stackchan -t upload >> "$LOG" 2>&1; then
    echo "UPLOAD OK on attempt $i"
    exit 0
  fi
  i=$((i + 1))
  sleep 3
done
echo "UPLOAD FAILED after 4 attempts"
exit 0
