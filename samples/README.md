# Sample plan set

`5792-25 - Prelim Plan SK1 Lot 43B Campbell Street Fairfield East.pdf`

Firstyle Homes "Grantham 36.9 Pristine MkII" — job 5792-25, sheet SK1,
Lot 43B / 101 Campbell Street, Fairfield East NSW 2165, client H. Nguyen,
609 m² site. Nine pages: site plan, ground floor, first floor, elevations and
details.

This is the reference for everything in `src/lib/model/`. It is committed
because the model is meaningless without it — you cannot check a transcription
against anything except the thing it was transcribed from.

## Registration

Plotted at **1:100**, so one metre is exactly **28.3465 PostScript points**.
Confirmed independently by two labelled features: the panel lift door measures
136.35 pt against its "4,810" label, and the numbered stair treads sit at a
7.087 pt pitch against a 250 mm going.

Each page has its own origin. Do not assume they share one.

| floor | page (0-based) | ox | oz |
|---|---|---|---|
| ground | 1 | 172.60 | 593.10 |
| first | 2 | 166.67 | 568.67 |

`pdfX = ox + 28.3465 × modelX` and `pdfY = oz − 28.3465 × modelZ`.

The first floor plan is drawn 5.93 pt west and 24.43 pt north of the ground
floor plan on its own sheet. That offset was measured from the stair tread
numbers the two sheets have in common — treads 2 through 6 appear on both, and
the numbering removes any ambiguity about which tread is which.

## Working with it

```bash
# wall lines, in model metres
python3 tools/planwalls.py "samples/5792-25 - Prelim Plan SK1 Lot 43B Campbell Street Fairfield East.pdf" \
        --page 1 --ox 172.60 --oz 593.10 --window 14,22,4,11

# every model wall against the line the sheet draws
python3 tools/walldiff.py "samples/5792-25 - Prelim Plan SK1 Lot 43B Campbell Street Fairfield East.pdf" --worst 15

# regenerate the overlay images and the written-note dataset
python3 tools/planimages.py "samples/..." --out public/plans
python3 tools/plannotes.py  "samples/..." > src/lib/model/planNotes.ts
```

Reading the wall output: a pair of lines 60–350 mm apart is **one wall drawn as
its two faces**; a gap in a span is a **doorway** (measure the jambs off it); a
run of three or more at a regular 0.30 pitch is **tile hatch**, not walls.

Full method in [`../PLANS.md`](../PLANS.md).

## Copyright

This drawing is the property of Firstyle Homes and is reproduced here solely as
the working reference for this project. Do not redistribute.
