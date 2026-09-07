# Flashing

This has been run on hardware and worked on the first upload. Read it anyway
before flashing a second device.

## What is about to be written

A build produces four artifacts, and `pio run -t upload` writes all four:

| Offset | Artifact | Size | What it is |
|---|---|---|---|
| `0x0000` | `bootloader.bin` | ~15 KB | ESP32-S3 second-stage bootloader |
| `0x8000` | `partitions.bin` | 3 KB | The partition table, from `default_16MB.csv` |
| `0xe000` | `boot_app0.bin` | 8 KB | OTA selector, points at the first app slot |
| `0x10000` | `firmware.bin` | ~1.19 MB | usage-chan |

The app is 18% of its 6.5 MB slot, so a face and a servo driver in phase 2 fit
without touching the partition table.

## What is about to be erased

**Everything already on the device.** A Stack-Chan ships with M5Stack's own
firmware in flash, and this overwrites it. It also overwrites the partition
table, which means any data that firmware kept — calibration, settings, its own
NVS — goes with it.

Two things follow from that:

- **Back the stock firmware up first if you might want it back.** The command is
  below: a 16 MB read, about two minutes. It is the only way to get the shipped
  image again if M5Stack ever stops publishing it. *Skipped on this device by
  choice* — if M5Stack drops support the stock firmware isn't much use anyway,
  and none of it was compelling enough to keep the unit in a drawer for.
- **Servos are unpowered under this firmware.** `hal.cpp` sets
  `cfg.output_power = false` and never touches the PY32 expander that gates the
  servo rail, so the neck goes limp and stays limp. It does not fight, and
  nothing is being driven against a stop. Position it by hand if you like.

Nothing here writes eFuses, changes flash encryption, or touches secure boot.
All of those are one-way; none is involved.

## Back up the stock firmware first

Plug in over USB-C and find the port:

```bash
ls /dev/cu.usbmodem*
```

CoreS3 uses native USB, so it appears as `usbmodem`, not `usbserial`. Read the
whole chip — substitute the port you found:

```bash
~/.local/bin/pio pkg exec -p tool-esptoolpy -- esptool.py --chip esp32s3 --port /dev/cu.usbmodem101 --baud 1500000 read_flash 0x0 0x1000000 stock-stackchan-backup.bin
```

`pio pkg exec` runs esptool inside PlatformIO's own environment. Calling
`esptool.py` directly with the system `python3` fails on a missing `serial`
module, because pyserial lives in PlatformIO's virtualenv, not yours.

Keep that file somewhere other than this repo — it is 16 MB and `.gitignore`
does not cover it. To restore it later:

```bash
~/.local/bin/pio pkg exec -p tool-esptoolpy -- esptool.py --chip esp32s3 --port /dev/cu.usbmodem101 --baud 1500000 write_flash 0x0 stock-stackchan-backup.bin
```

## Flash

`pio` was installed with pipx, so it lives in `~/.local/bin`. Either add that to
your PATH or call it by full path.

Compile without writing anything, to confirm the toolchain is fine:

```bash
~/.local/bin/pio run
```

Then upload:

```bash
~/.local/bin/pio run -t upload
```

CoreS3 resets into download mode on its own; no button holding. If it does not,
hold the power button on the left side for about 5 seconds to force a reset and
retry.

### If it fails at "Changing baud rate"

```
Stub running...
Changing baud rate to 1500000
A fatal error occurred: No serial data received.
```

**Nothing was written.** That failure happens after the stub loads into RAM and
before any flash write, so the device still holds its previous firmware. Reset
or power-cycle and it comes back.

The cause is a stale `upload_speed`. CoreS3 uses the ESP32-S3's **native USB** —
its port is `/dev/cu.usbmodem*`, not `usbserial`, because there is no UART
bridge chip. On native USB CDC the baud rate is fiction: no UART exists to
clock it, so the number is something both ends agree to ignore while data moves
at USB speed anyway. Asking esptool to renegotiate to 1.5 Mbaud asks the device
to do something meaningless, and it does not answer afterwards.

`platformio.ini` sets no `upload_speed` for exactly this reason. Removing it
costs nothing: the transfer was never limited by that number on this board.

Watch it boot:

```bash
~/.local/bin/pio device monitor
```

## What a good first boot looks like

This is what actually happened, not a prediction.

```
[Autodetect] board_M5StackChan
[HAL] board=M5StackChan (27) panel=320x240
```

Then the boot screen, then — because NVS is empty — the setup screen with an AP
name and password. That is the device working.

If the screen is black but the backlight is on, that is the failure
[`display-notes.md`](display-notes.md) is about; go read its diagnosis order
rather than guessing.

If the serial log is silent, `ARDUINO_USB_CDC_ON_BOOT=1` means the port only
appears once the firmware is running, so an empty monitor means it did not get
that far. Re-run the upload and watch for an esptool error.

## Getting back

Two ways out, in increasing severity:

- **Wrong PIN, or want to re-provision.** Hold the bottom-left and bottom-middle
  of the screen for 2 seconds during boot. That wipes NVS — WiFi credentials,
  encrypted token, preferences — and returns you to the setup portal. Flash is
  untouched.
- **Want the Stack-Chan back.** Restore the backup with the `write_flash`
  command above, or reflash M5Stack's published image.
