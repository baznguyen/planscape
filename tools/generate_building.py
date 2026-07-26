#!/usr/bin/env python3
"""
Draft building.ts from the plan PDF, instead of a human typing it by hand.

Why this exists
----------------
planwalls.py and plannotes.py already read the sheet correctly — vector line
segments and positioned text, in model metres, straight out of the PDF. The
actual source of most geometry defects this project has shipped was never the
PDF-reading step; it was the step after it, where a person reads that tool
output and hand-types Wall/Room/Opening literals into building.ts. That is
where a wall gets the wrong id, a room's east edge gets typed as the wrong
face, an opening lands on the wrong wall.

This tool closes that gap for the parts of the job that are pure geometry —
wall centerlines, room rectangles, opening positions — and refuses to guess
at the parts that are not. `Room.use`, `fixtures`, `zone`, `Opening.kind`
when no schedule code is nearby: none of that is recoverable from line
geometry or raw text alone, so every one of those fields is either filled
from a small lookup table and tagged INFERENCE, or left for a human to fill
in, exactly like the two existing INFERENCE comments already in building.ts.

The output is a DRAFT, never a direct overwrite of building.ts. building.ts
stays the hand-maintained file (per this repo's CLAUDE.md); a human reads the
draft alongside it, trusts the geometry (it is sheet-derived), and resolves
every flagged item against the actual PDF before merging anything in. A
transcription cannot check a transcription — this tool proposes from the
sheet, but the sheet is still what a human checks the proposal against, not
the proposal itself.

Usage
-----
    python3 tools/generate_building.py <sheet.pdf> --floor 0 > draft_g0.ts

Everything below `high` confidence is also written to stderr as a report, so
a reviewer knows exactly what to double-check instead of trusting the draft
uniformly.
"""
import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, f'{name}.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pw = _load('planwalls')
pn = _load('plannotes')

WT_DEFAULT = 0.11          # GEOM.WT, building.ts:63 — assumed thickness for a single-face wall
SNAP_DEDUPE = 0.06         # matches merge()'s own joint, planwalls.py
SNAP_BORDER = 0.05         # matches wall_lines()'s own pairing floor
SNAP_JUNCTION_SOFT = 0.15
SNAP_JUNCTION_HARD = 0.45  # matches danglingWalls()'s tolerance, draftingRules.ts:159
MIN_CELL_AREA = 1.0        # m² — smaller than this and it's not a room (e.g. a balustrade slice)


# --------------------------------------------------------------------------
# 1a. Wall network — centerline + thickness from face pairs, confidence-scored
# --------------------------------------------------------------------------

def _filtered_candidates(table, min_len=0.9):
    """The length+hatch filter wall_lines() already does, factored out so the
    pairing step below and the orphan report can both see it."""
    keys = sorted(table)
    lengths = {k: sum(b - a for a, b in table[k]) for k in keys}
    out = {}
    for i, k in enumerate(keys):
        if lengths[k] < min_len:
            continue
        hatch = False
        for j in range(max(0, i - 2), min(len(keys), i + 3) - 1):
            if j + 2 >= len(keys):
                break
            d1 = keys[j + 1] - keys[j]
            d2 = keys[j + 2] - keys[j + 1]
            if 0.2 < d1 < 0.45 and abs(d1 - d2) < 0.04 and k in keys[j:j + 3]:
                hatch = True
                break
        if not hatch:
            out[k] = table[k]
    return out, lengths


def _overlap(spans1, spans2):
    lo = max(min(a for a, _ in spans1), min(a for a, _ in spans2))
    hi = min(max(b for _, b in spans1), max(b for _, b in spans2))
    return max(0.0, hi - lo)


def _intersect_spans(spans1, spans2):
    """Span the two faces actually share — a face that outruns its partner is
    a jog, not a longer wall (Bedroom 5's east wall does exactly this)."""
    out = []
    for a1, b1 in spans1:
        for a2, b2 in spans2:
            lo, hi = max(a1, a2), min(b1, b2)
            if hi > lo:
                out.append((round(lo, 2), round(hi, 2)))
    return sorted(out)


class WallSegment:
    __slots__ = ('axis', 'at', 'thickness', 'spans', 'confidence', 'reason')

    def __init__(self, axis, at, thickness, spans, confidence, reason):
        self.axis, self.at, self.thickness = axis, at, thickness
        self.spans, self.confidence, self.reason = spans, confidence, reason

    def __repr__(self):
        return f'<Wall {self.axis}@{self.at:.3f} t={self.thickness*1000:.0f}mm {self.confidence} {self.spans}>'


def wall_segments(table, axis, min_len=0.9):
    """
    Centerline+thickness wall segments from a schedule() table, confidence-
    scored. Never silently drops a candidate that survived the length/hatch
    filter — an unpaired one is either promoted at `medium` confidence (only
    when it connects to something already accepted) or reported as an
    unresolved orphan, never merged into the wall set uninspected.
    """
    cand, lengths = _filtered_candidates(table, min_len)
    keys = sorted(cand)
    used = set()
    segs = []

    # Greedy nearest-first pairing — fixes wall_lines()'s `any(...)` ambiguity,
    # which can't disambiguate a key with more than one technically-qualifying
    # partner.
    pairs = []
    for k in keys:
        if k in used:
            continue
        best = None
        for k2 in keys:
            if k2 == k or k2 in used:
                continue
            gap = abs(k2 - k)
            if not (SNAP_BORDER < gap < 0.35):
                continue
            ov = _overlap(cand[k], cand[k2])
            if ov <= 0.6 * min(lengths[k], lengths[k2]):
                continue
            if best is None or gap < best[0]:
                best = (gap, k2)
        if best:
            pairs.append((k, best[1]))
            used.add(k)
            used.add(best[1])

    for k1, k2 in pairs:
        centerline = (k1 + k2) / 2
        spans = _intersect_spans(cand[k1], cand[k2])
        if not spans:
            continue
        segs.append(WallSegment(axis, centerline, abs(k2 - k1), spans, 'high',
                                 f'paired faces at {k1:.3f}/{k2:.3f}'))

    # Orphans: passed length+hatch but found no partner. Only promote one that
    # connects (within snap tolerance) to an already-accepted centerline on
    # THIS axis — i.e. it visibly continues a wall run rather than sitting in
    # isolation. Anything else stays out of the wall set and goes in the report
    # instead of being guessed into existence.
    accepted_at = [s.at for s in segs]
    orphans = []
    for k in keys:
        if k in used:
            continue
        touches = any(abs(k - a) < 0.02 for a in accepted_at)  # collinear continuation
        if touches:
            segs.append(WallSegment(axis, k, WT_DEFAULT, cand[k], 'medium',
                                     f'unpaired, continues an accepted run at {k:.3f}'))
        else:
            orphans.append((k, cand[k], lengths[k]))
    return segs, orphans


# --------------------------------------------------------------------------
# 1b. Cells -> rectangular rooms (grid + union-find; Room is axis-aligned only)
# --------------------------------------------------------------------------

def _dedupe(coords, tol=SNAP_DEDUPE):
    coords = sorted(coords)
    out = []
    for c in coords:
        if out and c - out[-1] < tol:
            out[-1] = (out[-1] + c) / 2
        else:
            out.append(c)
    return out


class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def _covers(segs, at, lo, hi, coverage=0.6):
    """Does a wall segment actually AT `at` run the [lo,hi] border, covering >= `coverage`?"""
    for s in segs:
        if abs(s.at - at) >= SNAP_BORDER:
            continue
        for a, b in s.spans:
            if max(0, min(hi, b) - max(lo, a)) >= coverage * (hi - lo):
                return True
    return False


def reconstruct_rooms(h_segs, v_segs, envelope):
    """
    xs/zs from wall centerlines; for every pair of adjacent cells, merge them
    (open-plan boundary, no wall) unless a wall segment covers >=60% of the
    shared border (mirrors wall_lines()'s own 60% overlap threshold). A cell
    that doesn't close into a clean bounding rectangle is rejected, not
    forced — that's the WIR2/hatch-obscured case, and it should fall back to
    manual entry rather than emit something wrong.
    """
    ex0, ex1, ez0, ez1 = envelope
    xs = _dedupe([ex0, ex1] + [s.at for s in v_segs if ex0 <= s.at <= ex1])
    zs = _dedupe([ez0, ez1] + [s.at for s in h_segs if ez0 <= s.at <= ez1])
    if len(xs) < 2 or len(zs) < 2:
        return [], []

    nx, nz = len(xs) - 1, len(zs) - 1
    def idx(i, j):
        return i * nz + j
    uf = UnionFind(nx * nz)
    cells = [(xs[i], xs[i + 1], zs[j], zs[j + 1]) for i in range(nx) for j in range(nz)]

    for i in range(nx):
        for j in range(nz):
            # merge across a border (open-plan boundary) unless a wall AT that
            # exact coordinate actually covers the shared edge
            if i + 1 < nx:
                x0, x1, z0, z1 = cells[idx(i, j)]
                if not _covers(v_segs, x1, z0, z1):
                    uf.union(idx(i, j), idx(i + 1, j))
            if j + 1 < nz:
                x0, x1, z0, z1 = cells[idx(i, j)]
                if not _covers(h_segs, z1, x0, x1):
                    uf.union(idx(i, j), idx(i, j + 1))

    groups = {}
    for i in range(nx):
        for j in range(nz):
            groups.setdefault(uf.find(idx(i, j)), []).append(cells[idx(i, j)])

    rooms, rejected = [], []
    for members in groups.values():
        x0 = min(c[0] for c in members); x1 = max(c[1] for c in members)
        z0 = min(c[2] for c in members); z1 = max(c[3] for c in members)
        area = (x1 - x0) * (z1 - z0)
        if area < MIN_CELL_AREA:
            continue
        # does the bbox equal the union of members with no notch?
        covered = sum((c[1] - c[0]) * (c[3] - c[2]) for c in members)
        if abs(covered - area) > 0.05 * area:
            rejected.append({'bbox': (x0, x1, z0, z1), 'reason': 'non-rectangular union — notch or hatch-obscured border'})
            continue
        zoned = len(members) > 1
        rooms.append({'x0': round(x0, 2), 'x1': round(x1, 2), 'z0': round(z0, 2), 'z1': round(z1, 2),
                       'zoned': zoned, 'confidence': 'high' if not zoned else 'medium'})
    return rooms, rejected


# --------------------------------------------------------------------------
# 1c. Room labels + openings
# --------------------------------------------------------------------------

def room_labels(pdf, floor):
    """plannotes.py filters ROOM_WORDS blocks out; this is that same
    extraction with the filter inverted, so a room name can seed a cell."""
    import fitz
    doc = fitz.open(pdf)
    reg = pw.REGISTRATION[floor]
    page, ox, oz = reg
    out = []
    for b in doc[page].get_text('blocks'):
        text = ' '.join(b[4].split())
        if text.upper() not in pn.ROOM_WORDS:
            continue
        x = ((b[0] + b[2]) / 2 - ox) / pw.PT_PER_M
        z = (oz - (b[1] + b[3]) / 2) / pw.PT_PER_M
        out.append({'text': text, 'x': round(x, 2), 'z': round(z, 2)})
    return out


def match_labels(rooms, labels):
    for r in rooms:
        hits = [l for l in labels if r['x0'] <= l['x'] <= r['x1'] and r['z0'] <= l['z'] <= r['z1']]
        if not hits:
            r['name'] = 'UNLABELLED'
            r['label_confidence'] = 'low'
        elif len(hits) == 1:
            r['name'] = hits[0]['text']
            r['label_confidence'] = 'high'
        else:
            r['name'] = hits[0]['text']
            r['label_confidence'] = 'medium'
            r['label_note'] = f'{len(hits)} labels in this cell: {[h["text"] for h in hits]}'
    return rooms


OPENING_PREFIX = {'AW': 'window', 'CSD': 'door', 'ASD': 'slider', 'GD': 'garage', 'AS': 'window', 'AF': 'window'}


def classify_opening(gap_mid, notes, external):
    near = [n for n in notes if n['kind'] == 'opening' and
            abs(n['x'] - gap_mid[0]) < 1.0 and abs(n['z'] - gap_mid[1]) < 1.0]
    if near:
        text = near[0]['text'].upper()
        for prefix, kind in OPENING_PREFIX.items():
            if text.startswith(prefix):
                return kind, 'high', f'matched schedule code "{near[0]["text"]}"'
    width = None  # caller fills in from the gap width for the fallback message
    return ('slider' if external else 'door'), 'low', 'no nearby schedule code — width/context fallback, UNCONFIRMED'


def find_openings(segs, notes, external):
    """A gap between consecutive merged spans on one centerline is a doorway
    (the existing convention — planwalls.py's own docstring)."""
    out = []
    for s in segs:
        spans = sorted(s.spans)
        for (a0, b0), (a1, b1) in zip(spans, spans[1:]):
            gap = a1 - b0
            if not (0.5 < gap < 5.0):
                continue
            mid = b0 + gap / 2
            gap_mid = (mid, s.at) if s.axis == 'v' else (s.at, mid)
            kind, conf, reason = classify_opening(gap_mid, notes, external)
            out.append({'axis': s.axis, 'at': s.at, 'mid': round(mid, 2), 'width': round(gap, 2),
                        'kind': kind, 'confidence': conf, 'reason': reason})
    return out


# --------------------------------------------------------------------------
# 1d. Domain-only fields — lookup table, every guess flagged
# --------------------------------------------------------------------------

# Normalized ROOM_WORDS text -> typical use/fixtures for an Australian
# residential drawing. Deliberately small and conservative — anything not
# here ships as UNLABELLED-equivalent (use left blank, INFERENCE-tagged).
ROOM_DEFAULTS = {
    'LIVING': ('living', ['sofa', 'rug', 'tv', 'curtain']),
    'FAMILY': ('living', ['dining', 'sofa', 'rug', 'curtain']),
    'DINING': ('living', ['dining', 'curtain']),
    'MEALS': ('living', ['dining', 'curtain']),
    'KITCHEN': ('kitchen', ['island', 'fridge', 'oven', 'bench']),
    'STUDY': ('study', ['desk', 'curtain']),
    'GUEST': ('bed', ['bed', 'curtain']),
    'BED': ('bed', ['bed', 'curtain']),
    'BED 2': ('bed', ['bed', 'desk', 'curtain']),
    'BED 4': ('bed', ['bed', 'curtain']),
    'BED 5': ('bed', ['bed', 'curtain']),
    'SITTING ROOM': ('living', ['sofa', 'rug', 'tv', 'curtain']),
    'PRINCIPAL SUITE': ('bed', ['bed', 'rug', 'curtain']),
    'BALCONY': ('outdoor', []),
    'BATH': ('bath', ['bath']),
    'ENS': ('bath', ['bath']),
    'ENS 1': ('bath', ['bath']),
    'ENS 2': ('bath', ['bath']),
    'WIR': ('store', ['robe']),
    'WIR 1': ('store', ['robe']),
    'WIR 2': ('store', ['robe']),
    'WIL': ('store', ['robe']),
    'ROBE': ('store', ['robe']),
    'LAUNDRY': ('laundry', ['laundry']),
    "L'DRY": ('laundry', ['laundry']),
    'GARAGE': ('garage', ['car']),
    'DOUBLE GARAGE': ('garage', ['car', 'car']),
    'ENTRY': ('hall', []),
    'PORCH': ('outdoor', []),
    'HALL': ('hall', []),
    'PANTRY': ('store', []),
    'WIP': ('store', []),
    'PDR': ('bath', ['bath']),
    'POWDER': ('bath', ['bath']),
    'ALCOVE': ('hall', []),
    'ALFRESCO': ('outdoor', ['dining', 'sofa']),
}


def apply_domain_defaults(room):
    key = room['name'].upper()
    default = ROOM_DEFAULTS.get(key)
    if default:
        room['use'], room['fixtures'] = default
        room['domain_confidence'] = 'medium'
        room['domain_reason'] = f'lookup table match on "{room["name"]}"'
    else:
        room['use'], room['fixtures'] = None, []
        room['domain_confidence'] = 'low'
        room['domain_reason'] = 'no lookup table entry — needs a human use/fixtures call'
    return room


# --------------------------------------------------------------------------
# 1e. Output — draft .ts fragment + confidence report on stderr
# --------------------------------------------------------------------------

def emit_draft(floor, rooms, h_segs, v_segs, openings, orphans_h, orphans_v):
    lines = [f'// DRAFT for floor {floor} — generated by tools/generate_building.py, NOT auto-merged.',
             '// Geometry is sheet-derived; every INFERENCE/UNCONFIRMED/UNLABELLED tag needs a human',
             '// to resolve against the actual PDF before this becomes part of building.ts.', '']
    lines.append('// ---- rooms ----')
    for i, r in enumerate(rooms):
        tag = []
        if r['label_confidence'] != 'high':
            tag.append(f"UNLABELLED/AMBIGUOUS name (confidence {r['label_confidence']})")
        if r['domain_confidence'] != 'high':
            tag.append(f"INFERENCE: use/fixtures — {r['domain_reason']}")
        if r.get('zoned'):
            tag.append('zoned — open-plan merge, no dividing wall found')
        if tag:
            lines.append('/**')
            for t in tag:
                lines.append(f' * {t}')
            lines.append(' */')
        use = r['use'] or 'UNKNOWN'
        fixtures = json.dumps(r['fixtures'])
        lines.append(
            f"R('g{i}','{r['name']}',{floor},{r['x0']},{r['x1']},{r['z0']},{r['z1']},"
            f"'{use}','TODO_FLOOR_MAT',{fixtures}),")
    lines.append('')
    lines.append('// ---- walls ----')
    for axis, segs in (('h', h_segs), ('v', v_segs)):
        for s in segs:
            if s.confidence != 'high':
                lines.append(f'/** {s.confidence.upper()} CONFIDENCE: {s.reason} */')
            spans = ','.join(f'{a}-{b}' for a, b in s.spans)
            if axis == 'h':
                lines.append(f"// H wall at z={s.at:.3f} thickness={s.thickness*1000:.0f}mm spans=[{spans}]")
            else:
                lines.append(f"// V wall at x={s.at:.3f} thickness={s.thickness*1000:.0f}mm spans=[{spans}]")
    lines.append('')
    lines.append('// ---- openings (gaps in wall runs) ----')
    for o in openings:
        conf = '' if o['confidence'] == 'high' else f" -- {o['confidence'].upper()}: {o['reason']}"
        lines.append(f"// {o['axis']}@{o['at']:.3f} mid={o['mid']} width={o['width']}m kind={o['kind']}{conf}")
    return '\n'.join(lines) + '\n'


def emit_report(floor, rooms, orphans_h, orphans_v, rejected_cells):
    lines = [f'=== floor {floor} confidence report ===']
    low_rooms = [r for r in rooms if r['label_confidence'] != 'high' or r['domain_confidence'] != 'high']
    lines.append(f'{len(rooms)} rooms reconstructed, {len(low_rooms)} need review:')
    for r in low_rooms:
        lines.append(f"  {r['name']:20} ({r['x0']},{r['z0']})-({r['x1']},{r['z1']})  "
                      f"label={r['label_confidence']} domain={r['domain_confidence']}")
    if rejected_cells:
        lines.append(f'{len(rejected_cells)} cell(s) could not close into a room — fall back to manual entry:')
        for c in rejected_cells:
            lines.append(f"  bbox={c['bbox']}  {c['reason']}")
    if orphans_h or orphans_v:
        lines.append(f'{len(orphans_h)+len(orphans_v)} unpaired line(s) survived length/hatch filtering but '
                      f'found no partner and no accepted-run continuation — inspect the sheet at these coordinates:')
        for k, spans, length in orphans_h:
            lines.append(f'  H z={k:.3f}  len={length:.2f}  spans={spans}')
        for k, spans, length in orphans_v:
            lines.append(f'  V x={k:.3f}  len={length:.2f}  spans={spans}')
    return '\n'.join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf')
    p.add_argument('--floor', type=int, required=True, choices=[0, 1])
    p.add_argument('--window', default='-1,29,-1,12', help='x0,x1,z0,z1 in metres — the building envelope')
    a = p.parse_args()
    try:
        import fitz
    except ImportError:
        print('needs PyMuPDF: pip install --break-system-packages pymupdf', file=sys.stderr)
        return 1
    win = tuple(float(v) for v in a.window.split(','))
    page, ox, oz = pw.REGISTRATION[a.floor]
    doc = fitz.open(a.pdf)
    H, V = pw.schedule(doc[page], ox, oz, win)
    h_segs, orphans_h = wall_segments(H, 'h')
    v_segs, orphans_v = wall_segments(V, 'v')

    envelope = (win[0], win[1], win[2], win[3])
    rooms, rejected = reconstruct_rooms(h_segs, v_segs, envelope)
    labels = room_labels(a.pdf, a.floor)
    rooms = match_labels(rooms, labels)
    rooms = [apply_domain_defaults(r) for r in rooms]

    notes = pn.notes(a.pdf)
    notes = [n for n in notes if n['floor'] == a.floor]
    openings_h = find_openings(h_segs, notes, external=False)
    openings_v = find_openings(v_segs, notes, external=False)

    print(emit_draft(a.floor, rooms, h_segs, v_segs, openings_h + openings_v, orphans_h, orphans_v))
    print(emit_report(a.floor, rooms, orphans_h, orphans_v, rejected), file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
