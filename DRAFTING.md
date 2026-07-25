# Drafting logic

How SiteScape decides whether a 3D model is faithful to the drawing it came from.

Every rule in `src/lib/review/` exists because a defect got past review and into a
render. The pattern was the same each time: the geometry was encoded, but the
judgement a draftsperson makes about that geometry was not — so nothing in the
system could tell the model was wrong. Writing those judgements down as executable
rules is the only thing that makes them generalise to the next customer's plan
instead of being re-learned by hand on every job.

## The rule: the drawing is the reference, the model is under test

`src/lib/model/planTrace.ts` is an independent transcription of the architect's
sheets. It is never derived from `WALLS`. If it were, overlaying it on the model
would prove nothing — the model would be marking its own homework. Everything in
the review measures the model against that trace and against the certified
`DEVELOPMENT CALCULATIONS` block printed on the site plan.

## Reading a drawing

**A line between two spaces is not necessarily a wall.** The living / family /
kitchen space here was walled off for weeks because the drawing shows a line
between them. That line is annotated `BEAM OVER TO ENG DETAILS` — a downstand
beam. Two things distinguish it from a wall, and both are checkable:

- the dimension chain across it is continuous (an `11,280` clear span with no
  tick marks inside it), and
- the annotation says so.

Downstand beams live in `BEAMS` and render as ceiling soffits. Rule
`structure/beam-not-wall` fails if a wall ever sits on a beam line.

**Certified areas are ground truth.** The site plan's area schedule is signed.
When the model and the schedule disagree, the model is wrong. Ground floor,
first floor, garage, alfresco, porch and balcony are each checked to 2%.

**Measure the sheet, don't eyeball it.** Reading dimensions off a raster by eye
put the garage 10% under and the service band at half its width. The reliable
method, in `scripts/` terms:

1. Render the PDF page at 300 dpi.
2. Threshold to black (`< 110`).
3. Sum dark pixels down columns and across rows, but **only over bands strictly
   inside the building** — otherwise the dimension chains outside the envelope
   dominate the vote and every peak is a leader line.
4. Merge adjacent columns within ~8 px into one wall line.
5. Anchor the scale on the facades: north-to-south is the known overall width.
   For these sheets that gives 0.11608 px/mm at 300 dpi.

Doing this on the ground floor produced wall lines at x = 17,915 / 18,552 /
20,094 / 21,584 / 22,954 / 23,514 / 25,806 and z = 2,908 / 5,133 / 7,420 / 9,560,
and on the first floor showed the floor plate runs to x = 27.58, not 25.40 —
which was the entire first-floor area deficit.

## Rules currently enforced

`src/lib/review/draftingRules.ts` — generalised, model-agnostic:

| Rule | What it catches |
| --- | --- |
| `geometry/no-overlap` | Two rooms claiming the same floor. Areas double-count, the render z-fights. |
| `geometry/opening-wall-exists` | An opening naming a wall that isn't in the schedule. |
| `geometry/opening-on-wall` | An opening off its host wall — the wall never gets punched, so the joinery hides inside solid geometry. This is why windows were invisible. |
| `geometry/opening-abuts-rooms` | A door whose recorded rooms don't reach it. Caught five dead doors at once. |
| `geometry/wall-terminates` | A wall stopping in mid-air. Tolerant of open-plan thresholds, where two rooms meeting *is* the doorway. |
| `structure/beam-not-wall` | A downstand beam modelled as a wall. |
| `structure/stair-geometry` | NCC 11.2: rise 115–190, going 240–355, 2R+G 550–700. |
| `habitability/natural-light` | NCC 3.8.4, 10% of floor area. Pooled across an open-plan `zone` — a servery open to a wall of glass is not a dark room. |
| `habitability/ceiling-height` | 2,400 habitable, 2,100 other. |
| `habitability/room-proportions` | A bedroom too narrow to hold a bed and a robe. Skipped for zoned rooms. |

`src/lib/review/circulation.ts`:

| Rule | What it catches |
| --- | --- |
| reachability | Any room you cannot walk to from the front door. The graph spans doors, stairs **and unwalled shared boundaries** — in an open plan the absence of a wall is the doorway and no opening record exists. |
| corridor width | A corridor too narrow to pass a fixed obstruction. The staircase was eating a 1,500 corridor down to 200 mm of clear space. |
| door clear width | AS 1428.1 820 mm, scoped to doors **between circulation and a habitable room**. Applied naively it flags the 720 cavity sliders into robes, which the drawing specifies correctly. |
| door swing | A door with nowhere to open into. |

`src/lib/model/clearance.ts` is shared deliberately: the renderer uses the
keep-clear zones to decide where furniture may stand, and the reviewer uses the
same function to check nothing ended up in the way. That is what stops a wardrobe
being drawn across a doorway.

## Things that are only true because someone modelled them

Geometry that lives only in the renderer cannot be reasoned about. The staircase
was drawn in `Furniture.tsx` and nowhere else, so no check could see that it
blocked the corridor. It is now `STAIRS` in the model and the renderer draws from
that record. The same applies to beams. **If a check should be able to see it, it
belongs in `src/lib/model/`, not in a component.**

## Current state

16 checks, 16 clean, 10.0 / 10 against the issued drawing.
