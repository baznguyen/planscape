#!/usr/bin/env python3
"""
Export the floor plans from the PDF as ink-only PNGs for the on-screen overlay.

public/plans/ground.png and first.png are what PlanSheet.tsx lays over the
model. They are the drawing itself, not a trace of it — see PLANS.md for why
that distinction is the whole point.

Two things matter here beyond "render the page":

*Paper is knocked out.* An overlay you can see the model through has to be ink
on transparency, not black on white at 40% opacity — the second one greys the
render underneath and makes every colour decision a lie. Alpha comes from how
dark the pixel is, with a gain so that the thin 0.1 mm linework survives instead
of fading to a suggestion.

*The crop is fixed and recorded.* meta.json carries the PDF rectangle and the
dpi, because the overlay's registration constants are expressed in PDF points
and are meaningless without knowing which part of the page the bitmap covers.
Re-export with a different crop and you must move the origins with it.

    python3 tools/planimages.py samples/SK1.pdf
"""
import argparse
import json
import os
import sys

# The plan area of the sheet, in PDF points, excluding the title block and the
# notes column. Both floor plans sit in the same place on their own sheets.
CROP = (150, 180, 1120, 700)
PAGES = {'ground': 1, 'first': 2}
DPI = 220
# Paper is not pure white and the linework is not pure black. Everything at or
# above this level is treated as paper; the gain pulls the mid greys of a thin
# line up to full opacity rather than letting them wash out.
PAPER = 232
GAIN = 1.5
INK = (18, 22, 28)


def export(pdf, out_dir):
    import fitz                                        # PyMuPDF, local tooling only
    import numpy as np
    from PIL import Image

    doc = fitz.open(pdf)
    meta = {}
    os.makedirs(out_dir, exist_ok=True)
    for name, page in PAGES.items():
        pm = doc[page].get_pixmap(clip=fitz.Rect(*CROP), dpi=DPI)
        img = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, pm.n)
        grey = img[:, :, :3].mean(axis=2)
        alpha = np.clip((PAPER - grey) * GAIN, 0, 255).astype(np.uint8)
        rgba = np.zeros((pm.height, pm.width, 4), dtype=np.uint8)
        rgba[:, :, 0], rgba[:, :, 1], rgba[:, :, 2] = INK
        rgba[:, :, 3] = alpha
        path = os.path.join(out_dir, f'{name}.png')
        Image.fromarray(rgba, 'RGBA').save(path, optimize=True)
        meta[name] = {'pdf': list(CROP), 'px': [pm.width, pm.height], 'dpi': DPI}
        print(f'{path}  {pm.width}x{pm.height}')
    with open(os.path.join(out_dir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf')
    p.add_argument('--out', default='public/plans')
    a = p.parse_args()
    try:
        export(a.pdf, a.out)
    except ImportError as e:
        print(f'{e}\nneeds: pip install --break-system-packages pymupdf pillow numpy', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
