# Adds --no-stub to the esptool upload command.
#
# Why: on CoreS3 the flasher stub loads and runs, then esptool never hears from
# it again —
#     Stub running...
#     A fatal error occurred: Unable to verify flash chip connection
#                             (No serial data received.).
# The stub re-initialises the ESP32-S3's native USB peripheral when it takes
# over, and esptool 4.5.1 does not reliably survive that handover. Skipping the
# stub means talking to the ROM bootloader, which is already running and cannot
# fail to hand over.
#
# Cost: slower. The ROM has no compression (write_flash -z is a stub feature),
# so the full image is written uncompressed.
#
# This must be a POST script. builder/main.py sets UPLOADERFLAGS with
# env.Replace(), so anything a pre: script prepends is discarded. And it must be
# Prepend, not Append: --no-stub is a global esptool option and has to appear
# before the write_flash subcommand.
# The -z removal is not cosmetic. esptool decides compression like this
# (cmds.py:315-320):
#
#     # -> if either --compress or --no-compress is set, honour that
#     # -> otherwise, set --compress unless --no-stub is set
#     if args.compress is None and not args.no_compress:
#         args.compress = not args.no_stub
#
# PlatformIO passes -z explicitly, so the explicit flag wins and compression
# would be attempted anyway — the one branch esptool's own default is designed
# to avoid. Dropping -z lets that default apply and matches the command this
# was verified with.
Import("env")

flags = [f for f in env.get("UPLOADERFLAGS", []) if f != "-z"]
env.Replace(UPLOADERFLAGS=["--no-stub"] + flags)
print("upload: --no-stub, compression off (see scripts/no_stub.py)")
