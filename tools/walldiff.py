#!/usr/bin/env python3
"""
Every wall in the model, against the line the sheet actually draws.

This is the check that should have existed from the first commit. Reviews were
comparing the model with a trace of the model, so the two agreed and the stair
was still a metre from where the drawing put it. Comparing the model with the
drawing takes the opinion out of it: for each wall, find the measured line on
the sheet that runs along the same axis and covers the same stretch, and print
how far apart they are.

Read the output as a triage list, not a pass/fail. A wall 30 mm off is the
difference between a centreline and a face; 200 mm is a wall thickness gone
astray and worth a look; a metre is a transcription error.

    python3 tools/walldiff.py samples/SK1.pdf
    python3 tools/walldiff.py samples/SK1.pdf --floor 1 --worst 20

Registration comes from PLANS.md and lives in REGISTRATION below. Re-plot the
set at a different scale and those are the four numbers that change.
"""
import argparse
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WINDOW = (-2, 30, -2, 13)


def model_walls(ts_path):
    """Parse the wall schedule straight out of building.ts."""
    src = open(ts_path).read()
    num = r"(-?[\d.]+)"
    return [(m[0], int(m[1]), *[float(v) for v in m[2:6]])
            for m in re.findall(r"W\('([\w]+)',(\d)," + ",".join([num] * 4), src)]


def nearest(table, coord, a, b, cover=0.4):
    """The measured line on this axis that best covers [a, b]."""
    best = None
    for c, spans in table.items():
        lo = min(s[0] for s in spans)
        hi = max(s[1] for s in spans)
        if max(0, min(b, hi) - max(a, lo)) < (b - a) * cover:
            continue
        d = abs(c - coord)
        if best is None or d < best[0]:
            best = (d, c)
    return best


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf')
    p.add_argument('--model', default=os.path.join(HERE, '..', 'src', 'lib', 'model', 'building.ts'))
    p.add_argument('--floor', type=int, default=None)
    p.add_argument('--worst', type=int, default=0, help='show only the N worst per floor')
    a = p.parse_args()
    try:
        import fitz
    except ImportError:
        print('needs PyMuPDF: pip install --break-system-packages pymupdf', file=sys.stderr)
        return 1
    spec = importlib.util.spec_from_file_location('pw', os.path.join(HERE, 'planwalls.py'))
    pw = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pw)

    doc = fitz.open(a.pdf)
    walls = model_walls(a.model)
    worst_seen = 0.0
    for floor, (page, ox, oz) in pw.REGISTRATION.items():
        if a.floor is not None and floor != a.floor:
            continue
        H, V = pw.schedule(doc[page], ox, oz, WINDOW)
        rows = []
        for wid, f, x1, z1, x2, z2 in walls:
            if f != floor:
                continue
            horiz = abs(z2 - z1) < abs(x2 - x1)
            coord = (z1 + z2) / 2 if horiz else (x1 + x2) / 2
            lo, hi = sorted((x1, x2) if horiz else (z1, z2))
            hit = nearest(H if horiz else V, coord, lo, hi)
            rows.append((hit[0] if hit else float('inf'), wid, coord, hit[1] if hit else None))
        rows.sort(reverse=True)
        if a.worst:
            rows = rows[:a.worst]
        print(f'=== floor {floor} — {len(rows)} walls, sheet page {page}')
        for d, wid, coord, c in rows:
            sheet = 'no matching line' if c is None else f'{c:7.2f}'
            off = '   —  ' if c is None else f'{d * 1000:5.0f} mm'
            print(f'  {wid:8}  model {coord:7.2f}   sheet {sheet}   off {off}')
            if c is not None:
                worst_seen = max(worst_seen, d)
    print(f'\nworst offset {worst_seen * 1000:.0f} mm', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
