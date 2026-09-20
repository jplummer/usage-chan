#!/usr/bin/env python3
"""Turn the icon PNGs exported from Figma into device and simulator data.

    python3 tools/icons2c.py

Reads every PNG in design/icons/ and writes:

    src/icons.h          packed 1-bit rows, for LovyanGFX
    docs/sim/icons.js    the same bits, for the simulator

**Why this exists.** Every icon before this one was translated by hand: read
the ellipse radii out of Figma, guess a predicate, render it, diff it against
the real thing, adjust, repeat. That cost an hour an icon and it re-cost it
every time a shape moved by a pixel. The pictures are not parametric -- nobody
is going to want a 43%-thick wifi wave at runtime -- so carrying the parameters
bought nothing and charged a translation step for it. This deletes the step.
Figma is the source; the build is a command.

**What stays hand-drawn.** Anything driven by a live value: the countdown
wedge, which is a continuous fraction, and the spinner, which is one dot
rotated eight ways. A bitmap per frame would work for the spinner and would be
a worse thing to edit than one radius.

**Threshold, not anti-aliasing.** One ink colour, one bit. The screen is pixel
art on purpose -- see the note in docs/sim/lgfx.js -- and a 2-bit alpha channel
would quadruple the data to soften edges nobody wants softened. The threshold
sits midway between the frame's background and its ink, in LINEAR light rather
than sRGB, which is the difference between the two export paths agreeing
exactly and disagreeing by 3%. See lum() for the measurement.

Frames are 40x40 with the icon's 32x32 box inset by 4, matching the control
column's circles. The inset is cropped here so the device never carries the
margin.
"""
import base64, glob, os, re, struct, sys, zlib

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRCDIR = os.path.join(ROOT, 'design', 'icons')
INSET, SIZE = 4, 32


def read_png(path):
    """Minimal PNG reader. Enough for what Figma exports: 8-bit RGB or RGBA,
    no interlacing. Deliberately not Pillow -- this script has to run from a
    bare checkout without a venv, the way fonts2ttf.py conspicuously does not.
    """
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path + ': not a PNG'
    off, idat, w = 8, [], None
    while off < len(data):
        (n,) = struct.unpack('>I', data[off:off + 4])
        kind = data[off + 4:off + 8]
        chunk = data[off + 8:off + 8 + n]
        if kind == b'IHDR':
            w, h, depth, color = struct.unpack('>IIBB', chunk[:10])
            assert depth == 8, path + ': only 8-bit channels'
            assert chunk[12] == 0, path + ': interlaced'
        elif kind == b'IDAT':
            idat.append(chunk)
        elif kind == b'IEND':
            break
        off += 12 + n
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    # decompressobj rather than decompress(): Figma's PNGs have arrived here
    # with a stale adler checksum more than once, and the pixel data has always
    # been intact. Verified against the frames, not trusted.
    raw = zlib.decompressobj().decompress(b''.join(idat))
    stride = w * ch
    out = bytearray(h * stride)
    pos = 0
    for y in range(h):
        filt = raw[pos]; pos += 1
        row = raw[pos:pos + stride]; pos += stride
        base = y * stride
        for x in range(stride):
            a = out[base + x - ch] if x >= ch else 0
            b = out[base - stride + x] if y else 0
            c = out[base - stride + x - ch] if (y and x >= ch) else 0
            v = row[x]
            if   filt == 1: v += a
            elif filt == 2: v += b
            elif filt == 3: v += (a + b) >> 1
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                v += a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            out[base + x] = v & 0xFF
    return w, h, ch, out


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lum(px, i, ch):
    """Luminance in LINEAR light, not sRGB.

    This matters more than it sounds. A renderer computes an antialiased edge
    pixel as coverage in linear light and then encodes it to sRGB, so comparing
    the encoded value against a midpoint asks the wrong question and answers it
    differently depending on the renderer's gamma handling. Measured 2026-09-20:
    the same eight frames exported through Figma's plugin API and through its
    REST API disagreed by up to 36 pixels out of 1024 when thresholded in sRGB,
    and by zero when thresholded in linear light. One of those numbers means the
    pipeline is trustworthy.
    """
    if ch <= 2:
        return _srgb_to_linear(px[i])
    return (_srgb_to_linear(px[i]) * 0.3 +
            _srgb_to_linear(px[i + 1]) * 0.59 +
            _srgb_to_linear(px[i + 2]) * 0.11)


def bits(path):
    """The 32x32 box as a list of rows of booleans."""
    w, h, ch, px = read_png(path)
    # The frame's own background is whatever sits in its corner; ink is the
    # brightest thing in the box. Threshold halfway between, by luminance.
    bg = lum(px, 0, ch)
    ink = max(lum(px, ((INSET + y) * w + INSET + x) * ch, ch)
              for y in range(SIZE) for x in range(SIZE))
    cut = (bg + ink) / 2.0
    return [[lum(px, ((INSET + y) * w + INSET + x) * ch, ch) > cut
             for x in range(SIZE)] for y in range(SIZE)]


def pack(rows):
    """One uint32 per row, bit 31 leftmost. 32 px is exactly a word, which is
    why the box is 32 and not 33."""
    return [sum(1 << (31 - x) for x in range(SIZE) if row[x]) for row in rows]


def ident(slug):
    return 'ICON_' + re.sub(r'[^A-Za-z0-9]+', '_', slug).upper()


def main():
    paths = sorted(glob.glob(os.path.join(SRCDIR, '*.png')))
    if not paths:
        sys.exit('no PNGs in ' + SRCDIR)

    icons = []
    for p in paths:
        slug = os.path.splitext(os.path.basename(p))[0]
        icons.append((slug, pack(bits(p))))

    banner = ('/* Generated by tools/icons2c.py from design/icons/*.png.\n'
              ' * Do not edit: edit the Figma frame, re-export, re-run.\n'
              ' * %d icons, %d bytes.\n */\n' % (len(icons), len(icons) * SIZE * 4))

    h = [banner, '#pragma once\n#include <stdint.h>\n\n',
         '#define ICON_W %d\n#define ICON_H %d\n\n' % (SIZE, SIZE)]
    for slug, words in icons:
        h.append('static const uint32_t %s[ICON_H] = {\n' % ident(slug))
        for i in range(0, SIZE, 4):
            h.append('    ' + ' '.join('0x%08Xu,' % w for w in words[i:i + 4]) + '\n')
        h.append('};\n\n')
    open(os.path.join(ROOT, 'src', 'icons.h'), 'w').write(''.join(h))

    j = [banner.replace('/*', '//').replace(' *', '//').replace('//', '//', 1),
         '(function () {\n  window.ICONS = {\n']
    for slug, words in icons:
        j.append("    '%s': [%s],\n" % (slug, ','.join(str(w) for w in words)))
    j.append('  };\n  window.ICON_W = %d; window.ICON_H = %d;\n})();\n' % (SIZE, SIZE))
    open(os.path.join(ROOT, 'docs', 'sim', 'icons.js'), 'w').write(''.join(j))

    for slug, words in icons:
        lit = sum(bin(w).count('1') for w in words)
        print('%-16s %4d lit px' % (slug, lit))
    print('\nsrc/icons.h and docs/sim/icons.js written (%d icons, %d bytes on the device)'
          % (len(icons), len(icons) * SIZE * 4))


if __name__ == '__main__':
    main()
