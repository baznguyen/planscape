# Reading a plan set

Notes on getting geometry out of an architectural PDF and into the model
without inventing any of it. Written after a stair was modelled a metre north
and 1.2 m east of its real position, which put the garage door onto a tread and
walled the back of the house off from the entry — and which every review passed,
because every review compared the model against another thing I had typed.

## The rule

**A transcription cannot check a transcription.** If the model and the trace
came from the same reading, they agree with each other and both are wrong. Only
the sheet is the authority, so the checker has to read the sheet.

## Scale

Take it from the plot, not from a fit against the model.

A sheet plotted at 1:100 puts one metre on one centimetre of paper, and one
centimetre is exactly **28.3465 PostScript points**. 1:50 is 56.693, 1:200 is
14.173. Fitting the scale against the model envelope instead produced 28.65 on
this set — a 1% error, 300 mm across the length of the house, and it would have
been blamed on the model rather than on the overlay that invented it.

Confirm the figure against something the drawing dimensions for you. Two
independent features agreeing to four significant figures is enough:

| feature | measured | labelled | implies |
|---|---|---|---|
| panel lift door | 136.35 pt | 4,810 | 28.346 pt/m |
| stair tread pitch | 7.087 pt | 250 going | 28.348 pt/m |

## Origin

Per page, and never assume two pages share one. The ground and first floor plans
of this set sit 5.93 pt apart in x and 24.43 pt in y on their own sheets.

To register a second page, use a feature that is physically the same object in
both. Numbered stair treads are ideal: they appear on both plans, and the
numbering removes any ambiguity about which tread is which.

## Extraction

`tools/planwalls.py` does the mechanical part. Walls are drawn as pairs of
parallel straight lines a wall thickness apart, and every one of those lines is
in a vector PDF as an exact segment — no OCR involved. Cluster the segments by
axis, convert to metres, and merge collinear runs:

```
python3 tools/planwalls.py SK1.pdf --page 1 --ox 172.60 --oz 593.10 \
    --window 19,26,2.5,5.6
```

Reading the output:

* a horizontal entry at `z=3.02` and another at `z=3.09` covering the same x
  range is **one 90 mm stud wall**, centreline 3.055;
* a **gap in a span** is a doorway — measure the jambs off the gap;
* runs at a regular 0.30 pitch are **tile hatch**, not walls;
* riser lines show up as a picket of short parallel segments at the going pitch,
  which is how the stair was recovered here: 17 treads at 250, 18 risers over
  the 3,040 floor-to-floor, 169 mm each.

## Registration for the on-screen overlay

`src/components/PlanSheet.tsx` lays the rendered page over the model at the same
scale and origin, so any discrepancy is visible at a glance. Its constants are
the same two numbers per page. The calibration sliders in the Layers sheet exist
because the next plan set will be plotted differently — not as a substitute for
getting these right.

## Checking the model against the sheet

`tools/walldiff.py` runs the comparison that should have existed from the first
commit: every wall in `building.ts` against the line the drawing actually puts
there. It is the same idea as the overlay, expressed as numbers so it can be
read in a terminal and diffed between commits.

```
python3 tools/walldiff.py samples/SK1.pdf --worst 12
```

Read it as triage, not pass/fail:

| offset | what it usually means |
|---|---|
| under 60 mm | centreline versus face — fine |
| 100–250 mm | a wall thickness gone astray; worth a look |
| over 500 mm | a transcription error |

As it stands, the ground floor's worst wall is 200 mm out and most are inside
40 mm. The first floor's worst is 1,360 mm.

## The north wall steps

Worth writing down because it caught me: the main house's north wall is at
z ≈ 9.47 from the west end to x ≈ 17.9, and only the laundry and garage block
runs on to z ≈ 10.85. `gw_n` is modelled as one straight run at z = 11 across
the whole length, which is why walldiff matches it against the garage's line and
reports a comfortable-looking 100 mm — the tool compares a wall against ONE
measured line, so a wall modelled straight where the drawing steps will hide
inside its own average. Split the run before trusting the number.

## What is still open

The first floor of this set has not been re-measured. Registered against the
sheet at true 1:100 it is out by between 0.7 m and 2 m depending on which wall
you take, and not by a constant, so it cannot be nudged back into place — it
needs the same wall-by-wall pass the ground floor has now had. Until then treat
first floor room extents as indicative. `f_hea` in `building.ts` is a stop-gap
that gives the flight somewhere to arrive.
