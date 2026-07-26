#!/usr/bin/env python3
"""
Read walls off the plan sheet instead of off a transcription.

Why this exists
---------------
Every geometry defect this project has shipped came from the same place: the
model was checked against another thing I had typed. A transcription cannot
check a transcription — when both are wrong they agree, and the review passes.
The drawing is the only authority, so the checker has to read the drawing.

A vector PDF makes that tractable without any OCR at all. Architectural sheets
are plotted at a stated scale, walls are drawn as pairs of parallel straight
lines a wall thickness apart, and every one of those lines is in the file as an
exact line segment. Extract the segments, cluster them by axis, convert to
metres, and you have a wall schedule you can diff against the model.

Establishing the scale
----------------------
Do NOT fit the scale against the model — that is the transcription checking the
transcription again, and on this job it produced 28.65 pt/m when the truth was
28.3465, a 1% error that put the overlay 300 mm out across the house and would
have been blamed on the model.

Take the scale from the plot instead. A sheet plotted at 1:100 puts one metre on
one centimetre of paper, and one centimetre is exactly 28.3465 PostScript
points. Confirm it against something the drawing dimensions for you — here the
panel lift door measures 136.35 pt against its "4,810" label (28.346 pt/m) and
the numbered stair treads sit at a 7.087 pt pitch against a 250 mm going
(28.348 pt/m). Two independent features agreeing to four figures is a scale you
can rely on.

Establishing the origin
-----------------------
Per page, and never assume two pages share one. The ground and first floor plans
of this set are drawn 5.93 pt apart in x and 24.43 pt in y on their own sheets.
Register a second page against a feature that is physically the same object in
both — the numbered stair treads are ideal, because they appear on both plans
and their numbering removes any ambiguity about which tread is which.

Usage
-----
    python3 tools/planwalls.py <sheet.pdf> --page 1 --ox 172.60 --oz 593.10
    python3 tools/planwalls.py <sheet.pdf> --page 2 --ox 166.67 --oz 568.67 \
        --window 16,27,0,7.5

Output is a wall schedule in model metres: every straight run long enough to be
a wall, with the span it covers. Gaps in a span are doorways.
"""
import argparse, sys

PT_PER_M = 28.3465          # 1:100 — one metre is one centimetre of paper
# (page index, pdf x of model x=0, pdf y of model z=0) per floor — see PLANS.md.
# Also the source of truth for walldiff.py/plannotes.py's copies of this dict.
REGISTRATION = {0: (1, 172.60, 593.10), 1: (2, 166.67, 568.67)}


def segments(page):
    """Every straight line on the page, including rectangle edges."""
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] == 'l':
                yield it[1].x, it[1].y, it[2].x, it[2].y
            elif it[0] == 're':
                r = it[1]
                yield r.x0, r.y0, r.x1, r.y0
                yield r.x1, r.y0, r.x1, r.y1
                yield r.x1, r.y1, r.x0, r.y1
                yield r.x0, r.y1, r.x0, r.y0


def merge(spans, joint=0.06, least=0.25):
    """Collapse collinear runs; drop anything too short to be a wall."""
    out = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1] + joint:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(round(a, 2), round(b, 2)) for a, b in out if b - a > least]


def schedule(page, ox, oz, win, s=PT_PER_M, tol=0.3, run=2.5):
    """{axis: {coordinate: [(from, to), ...]}} in model metres."""
    x0, x1, z0, z1 = win
    H, V = {}, {}
    for ax, ay, bx, by in segments(page):
        if abs(by - ay) < tol and abs(bx - ax) > run:
            z = round((oz - (ay + by) / 2) / s, 2)
            a, b = sorted(((ax - ox) / s, (bx - ox) / s))
            if b > x0 and a < x1 and z0 < z < z1:
                H.setdefault(z, []).append((a, b))
        if abs(bx - ax) < tol and abs(by - ay) > run:
            x = round(((ax + bx) / 2 - ox) / s, 2)
            a, b = sorted(((oz - ay) / s, (oz - by) / s))
            if x0 < x < x1 and b > z0 and a < z1:
                V.setdefault(x, []).append((a, b))
    return ({k: m for k, v in H.items() if (m := merge(v))},
            {k: m for k, v in V.items() if (m := merge(v))})


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf')
    p.add_argument('--page', type=int, help='0-based page index')
    p.add_argument('--ox', type=float, help='pdf x of model x=0, in points')
    p.add_argument('--oz', type=float, help='pdf y of model z=0, in points')
    p.add_argument('--scale', type=float, default=PT_PER_M, help='points per metre')
    p.add_argument('--window', default='0,30,0,12', help='x0,x1,z0,z1 in metres')
    p.add_argument('--ts', action='store_true',
                    help='emit src/lib/model/sheetLines.ts (all floors, via REGISTRATION) instead of a schedule')
    a = p.parse_args()
    try:
        import fitz                                   # PyMuPDF, local tooling only
    except ImportError:
        print('needs PyMuPDF: pip install --break-system-packages pymupdf', file=sys.stderr)
        return 1
    win = tuple(float(v) for v in a.window.split(','))
    if a.ts:
        body, n = emit_ts(a.pdf, REGISTRATION, win)
        print(body, end='')
        print(f'// {n} sheet lines', file=sys.stderr)
        return 0
    if a.page is None or a.ox is None or a.oz is None:
        p.error('--page, --ox and --oz are required unless --ts is given')
    H, V = schedule(fitz.open(a.pdf)[a.page], a.ox, a.oz, win, a.scale)
    print('# walls running east-west   (z : x spans; a gap in a span is a doorway)')
    for z in sorted(H):
        print(f'  z={z:6.2f}  {H[z]}')
    print('# walls running north-south (x : z spans)')
    for x in sorted(V):
        print(f'  x={x:6.2f}  {V[x]}')
    return 0


# ---------------------------------------------------------------------------
# Emit the measured lines as a TypeScript dataset, so the in-app reviewer can
# check the model against the sheet at runtime instead of only in a terminal.
# ---------------------------------------------------------------------------
TS_HEAD = '''/**
 * Wall lines measured off SK1, in model metres.
 *
 * GENERATED by tools/planwalls.py --ts — do not edit by hand; re-run the tool.
 *
 * This is what lets Redline answer "is it to scale" with a number instead of an
 * opinion. Every wall in the model is matched against the line the drawing puts
 * on the same axis over the same stretch, and anything past tolerance is a
 * finding. A pair of entries a wall thickness apart is one wall drawn as its two
 * faces; a gap in a span is a doorway.
 */
export interface SheetLine {
  floor: 0 | 1;
  /** 'h' runs east-west and `at` is z; 'v' runs north-south and `at` is x */
  axis: 'h' | 'v';
  at: number;
  spans: [number, number][];
}

export const SHEET_LINES: SheetLine[] = '''


def wall_lines(table, min_len=0.9):
    """
    Keep the lines that are plausibly WALLS and drop the tiling.

    Two signatures separate them. A wall is drawn as its two faces, so it comes
    as a PAIR of parallel lines 60-350 mm apart covering the same stretch. Tile
    and brick hatch comes as a RUN of three or more lines at a regular pitch. A
    dataset that keeps the hatch makes the scale check toothless, because with
    lines every 300 mm any wall in the model finds something within tolerance.
    """
    keys = sorted(table)
    lengths = {k: sum(b - a for a, b in table[k]) for k in keys}
    def overlap(k1, k2):
        s1, s2 = table[k1], table[k2]
        lo = max(min(a for a, _ in s1), min(a for a, _ in s2))
        hi = min(max(b for _, b in s1), max(b for _, b in s2))
        return max(0.0, hi - lo)
    out = {}
    for i, k in enumerate(keys):
        if lengths[k] < min_len:
            continue
        # part of a regular run of three or more? that is hatch
        hatch = False
        for j in range(max(0, i - 2), min(len(keys), i + 3) - 1):
            if j + 2 >= len(keys):
                break
            d1 = keys[j + 1] - keys[j]
            d2 = keys[j + 2] - keys[j + 1]
            if 0.2 < d1 < 0.45 and abs(d1 - d2) < 0.04 and k in keys[j:j + 3]:
                hatch = True
                break
        if hatch:
            continue
        # paired with a face 60-350 mm away covering the same stretch?
        paired = any(k2 != k and 0.05 < abs(k2 - k) < 0.35 and
                     overlap(k, k2) > 0.6 * min(lengths[k], lengths[k2])
                     for k2 in keys if lengths[k2] >= min_len)
        if paired:
            out[k] = table[k]
    return out


def emit_ts(pdf, registration, window):
    import fitz
    doc = fitz.open(pdf)
    rows = []
    for floor, (page, ox, oz) in registration.items():
        H, V = schedule(doc[page], ox, oz, window)
        H, V = wall_lines(H), wall_lines(V)
        for at, spans in sorted(H.items()):
            rows.append({'floor': floor, 'axis': 'h', 'at': at, 'spans': spans})
        for at, spans in sorted(V.items()):
            rows.append({'floor': floor, 'axis': 'v', 'at': at, 'spans': spans})
    import json
    body = ',\n  '.join(json.dumps(r) for r in rows)
    return TS_HEAD + '[\n  ' + body + ',\n];\n', len(rows)


if __name__ == '__main__':
    raise SystemExit(main())
