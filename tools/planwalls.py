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
    p.add_argument('--page', type=int, required=True, help='0-based page index')
    p.add_argument('--ox', type=float, required=True, help='pdf x of model x=0, in points')
    p.add_argument('--oz', type=float, required=True, help='pdf y of model z=0, in points')
    p.add_argument('--scale', type=float, default=PT_PER_M, help='points per metre')
    p.add_argument('--window', default='0,30,0,12', help='x0,x1,z0,z1 in metres')
    a = p.parse_args()
    try:
        import fitz                                   # PyMuPDF, local tooling only
    except ImportError:
        print('needs PyMuPDF: pip install --break-system-packages pymupdf', file=sys.stderr)
        return 1
    win = tuple(float(v) for v in a.window.split(','))
    H, V = schedule(fitz.open(a.pdf)[a.page], a.ox, a.oz, win, a.scale)
    print('# walls running east-west   (z : x spans; a gap in a span is a doorway)')
    for z in sorted(H):
        print(f'  z={z:6.2f}  {H[z]}')
    print('# walls running north-south (x : z spans)')
    for x in sorted(V):
        print(f'  x={x:6.2f}  {V[x]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
