#!/usr/bin/env python3
"""Turn the device's bitmap faces into TrueType files, for designing in Figma.

Figma cannot open the panel's fonts, so type set there has always been a guess
at what the device would do with it — and the guess ran optimistic. A headline
that measures 205px on the panel got designed into a 129px slot, and nothing in
the design tool said otherwise until the sim rendered it clipped.

These carry the device's own glyphs and, more to the point, its exact advance
widths. A string that fits in Figma fits on the panel.

Every face is built with an em of exactly 100 device pixels, so one size covers
all of them: set 100 for device scale, 200 on a 2x canvas. There is no other
number to type — the face is the size.

The digit in the family name is the source face's point label, kept so it lines
up with what ui.cpp asks for. It is not a size and not a pixel height: DejaVu 9
stands 10px tall, Sans 9 stands 18px.

    python3 tools/fonts2ttf.py                  # -> build/fonts/
    python3 tools/fonts2ttf.py ~/Library/Fonts  # install

Reads docs/sim/fonts.js, which tools/fonts2js.py generates from M5GFX. Run that
first if the faces have changed.

fontTools is the only dependency, and Homebrew's Python will not install into
itself. Rather than make that anyone's problem, the first run builds a venv
under build/ and re-runs itself in there. One download, then never again.
"""
import base64, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_JS = os.path.join(ROOT, 'docs/sim/fonts.js')
VENV = os.path.join(ROOT, 'build/venv')


def bootstrap():
    try:
        import fontTools  # noqa: F401
        return
    except ImportError:
        pass
    if os.environ.get('FONTS2TTF_BOOTSTRAPPED'):
        sys.exit('fontTools is still missing after building %s.\n'
                 'Delete that directory and run again.' % VENV)
    py = os.path.join(VENV, 'bin', 'python3')
    if not os.path.exists(py):
        print('fontTools not installed. Building a venv at build/venv, once.')
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])
        subprocess.check_call([py, '-m', 'pip', 'install', '--quiet', 'fonttools'])
    os.environ['FONTS2TTF_BOOTSTRAPPED'] = '1'
    os.execv(py, [py, os.path.abspath(__file__)] + sys.argv[1:])


bootstrap()

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPEM = 1000          # units per em
PX = UPEM // 100     # units per device pixel: em == 100px, so 10

# What each face is called in a font picker. The number is the pixel size the
# face actually is, which is the thing worth knowing while placing it.
FAMILY = {
    'Font2':              'UsageChan Font2',
    'FreeSans9pt7b':      'UsageChan Sans 9',
    'FreeSans12pt7b':     'UsageChan Sans 12',
    'FreeSans18pt7b':     'UsageChan Sans 18',
    'FreeSans24pt7b':     'UsageChan Sans 24',
    'FreeSansBold9pt7b':  'UsageChan Sans Bold 9',
    'FreeSansBold12pt7b': 'UsageChan Sans Bold 12',
    'FreeSansBold18pt7b': 'UsageChan Sans Bold 18',
    'FreeSansBold24pt7b': 'UsageChan Sans Bold 24',
    'DejaVu9':            'UsageChan DejaVu 9',
    'DejaVu12':           'UsageChan DejaVu 12',
    'DejaVu18':           'UsageChan DejaVu 18',
}


def load_faces():
    src = open(FONTS_JS, encoding='utf-8').read()
    body = re.search(r'window\.LGFX_FONTS\s*=\s*(\{.*\});\s*$', src, re.S).group(1)
    faces = json.loads(body)
    for f in faces.values():
        key = 'bitmap' if f['type'] == 'gfx' else 'rows'
        f[key] = base64.b64decode(f[key])
    return faces


def gfx_metrics(f):
    """Baseline and height exactly as LGFXBase computes them, so the TTF's line
    box matches what fontHeight() reports in the sim."""
    above = below = 0
    for _, _, h, _, _, yo in f['glyphs']:
        above = max(above, -yo)
        below = max(below, h + yo)
    return above, above + below


def gfx_glyph(f, code):
    """Set pixels, advance, and placement for one glyph. Bits run MSB first and
    continuously across rows — no per-row byte padding. See _drawGfx in lgfx.js."""
    g = f['glyphs'][code - f['first']]
    off, w, h, xadv, xo, yo = g
    pix, bit = set(), off * 8
    for row in range(h):
        for col in range(w):
            if f['bitmap'][bit >> 3] & (0x80 >> (bit & 7)):
                pix.add((col, row))
            bit += 1
    return pix, xadv, xo, yo


def bmp_glyph(f, code):
    """Font2: fixed 16 rows, per-row byte padding, and the last column of every
    glyph is spacing rather than ink. See _drawBmp in lgfx.js."""
    i = code - 0x20
    fw = f['widths'][i]
    bpr = (fw + 6) >> 3
    addr = sum(((f['widths'][k] + 6) >> 3) * f['height'] for k in range(i))
    pix = set()
    for row in range(f['height']):
        for col in range(fw - 1):
            if f['rows'][addr + row * bpr + (col >> 3)] & (0x80 >> (col & 7)):
                pix.add((col, row))
    return pix, fw, 0, -f['baseline']


def rectangles(pix):
    """Merge set pixels into as few rectangles as the rows allow: horizontal
    runs first, then vertically where a run repeats unchanged. Adjacent
    rectangles union cleanly under nonzero winding, so overlap is not a
    problem — this is only here to keep the contour count sane."""
    rows = {}
    for x, y in pix:
        rows.setdefault(y, []).append(x)
    runs = {}
    for y, xs in rows.items():
        out = []
        for x in sorted(xs):
            if out and x == out[-1][1]:
                out[-1] = (out[-1][0], x + 1)
            else:
                out.append((x, x + 1))
        runs[y] = set(out)

    rects, open_runs = [], {}
    for y in range(min(runs) if runs else 0, (max(runs) + 2) if runs else 0):
        here = runs.get(y, set())
        for run in list(open_runs):
            if run not in here:
                rects.append((run[0], run[1], open_runs.pop(run), y))
        for run in here:
            open_runs.setdefault(run, y)
    return rects


def outline(pix, xo, yo):
    """Rectangles to a TrueType contour each, clockwise in y-up font units.

    A pixel in row r sits between baseline offsets -(yo + r) and -(yo + r + 1);
    yo is the Adafruit yOffset, the distance from the baseline down to the top
    of the glyph bitmap."""
    pen = TTGlyphPen(None)
    for x0, x1, y0, y1 in rectangles(pix):
        left, right = (xo + x0) * PX, (xo + x1) * PX
        top, bottom = -(yo + y0) * PX, -(yo + y1) * PX
        pen.moveTo((left, bottom))
        pen.lineTo((left, top))
        pen.lineTo((right, top))
        pen.lineTo((right, bottom))
        pen.closePath()
    return pen.glyph()


def build(name, f, outdir):
    if f['type'] == 'gfx':
        baseline, height = gfx_metrics(f)
        codes = range(max(0x20, f['first']), min(0x7E, f['last']) + 1)
        read = gfx_glyph
    else:
        baseline, height = f['baseline'], f['height']
        codes = range(0x20, 0x7F)
        read = bmp_glyph

    order, cmap, glyphs, metrics = ['.notdef'], {}, {}, {}
    glyphs['.notdef'] = TTGlyphPen(None).glyph()
    metrics['.notdef'] = (8 * PX, 0)

    for code in codes:
        gname = 'uni%04X' % code
        pix, xadv, xo, yo = read(f, code)
        order.append(gname)
        cmap[code] = gname
        glyphs[gname] = outline(pix, xo, yo)
        # Left side bearing follows the ink, not the advance: an xOffset below
        # zero means the glyph reaches back over the one before it.
        lsb = (xo + min((x for x, _ in pix), default=0)) * PX if pix else 0
        metrics[gname] = (xadv * PX, lsb)

    family = FAMILY.get(name, 'UsageChan ' + name)
    ps = family.replace(' ', '') + '-Regular'
    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=baseline * PX,
                             descent=-(height - baseline) * PX,
                             lineGap=0)
    fb.setupNameTable({
        'familyName': family,
        'styleName': 'Regular',
        'uniqueFontIdentifier': ps,
        'fullName': family,
        'psName': ps,
        'version': '1.0',
        'manufacturer': 'Generated by tools/fonts2ttf.py from the device faces',
        'description': '%s, %dpx em at size 100. Advance widths match the panel '
                       'exactly.' % (name, height),
    })
    fb.setupOS2(sTypoAscender=baseline * PX,
                sTypoDescender=-(height - baseline) * PX,
                sTypoLineGap=0,
                usWinAscent=baseline * PX,
                usWinDescent=(height - baseline) * PX,
                sCapHeight=baseline * PX,
                achVendID='UCHN')
    fb.setupPost()

    path = os.path.join(outdir, ps.replace('-', '') + '.ttf')
    fb.save(path)
    return path, family, height


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build/fonts')
    outdir = os.path.expanduser(outdir)
    os.makedirs(outdir, exist_ok=True)
    faces = load_faces()
    print('%-22s %-26s %-7s %s' % ('device face', 'Figma family', 'is', 'file'))
    for name in faces:
        path, family, height = build(name, faces[name], outdir)
        print('%-22s %-26s %2dpx    %s' % (name, family, height, path))
    print('\nHeights above are what the face measures on the panel, not a size '
          'to type.\nIn Figma always set 100 for device scale, 200 on a 2x canvas.')


if __name__ == '__main__':
    main()
