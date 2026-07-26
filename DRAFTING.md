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

## Check what the occupant experiences, not the data structure you have

The circulation check passed while four rooms had no way in.

It worked on the declared graph — door records naming two rooms, plus shared
room boundaries. A graph like that says two spaces are connected because an
object says so. It cannot see a 1.35 m wall stub standing across the middle of
the corridor, because the stub is not in the graph; it is in the geometry.

`circulation/walkable` in `draftingRules.ts` replaces the assumption with a
measurement: flood a 100 mm grid outward from the front door (and from the head
of the stair upstairs) using the same `standable()` predicate the walkthrough
camera obeys, then ask which rooms the flood reached. It immediately found that
`fi_12` sealed the east end of the first floor landing, which is the only route
to the primary suite, its robe, its ensuite and bedroom 4.

Two lessons worth keeping:

**A wall crossing a declared room is a contradiction, and one of the two is
wrong.** The landing rectangle ran through to x = 21,500; the stub sat at
19,500. Both cannot be right. The room rectangle is what the certified areas
depend on, so the stub is read as a jamb and the gap beside it as a cased
opening — recorded as an inference in `building.ts`, not as a measured
dimension, and flagged for confirmation against sheet SK1.

**A cupboard is not a room you walk into.** The first version of the rule
flagged the 640 mm linen press, because a 260 mm body radius does not fit
inside it. Correct, and useless. Anything under a 900 mm clear width is now
checked at its door instead of inside it.

## Movement is a model, not a camera transform

"I don't want to see underneath the floor plan" was not a rendering fault. The
walkthrough added a step vector to the camera with no test at all, so holding
forward walked you through the external wall, off the site disc and into the
fog — and on the first floor it left you hovering two storeys up over the
garden, looking at the underside of a slab nothing was ever meant to see.

`walkable.ts` states the two rules a person actually obeys: stay on the slab,
and keep a body's clearance from any wall unless you are in a doorway.

The subtlety that took two attempts: **do not test against room rectangles.**
This house is largely open plan — the kitchen, family and dining spaces run
together, exactly as the drawing shows — so a containment test built on room
rectangles erects an invisible wall on every shared edge. The first version
confined the walker to two spaces out of twenty-seven. Test against the walls,
because the walls are what stop you.

The second subtlety: room rectangles are taken to the wall FACES, so between
two rooms either side of a partition there is a 110-150 mm strip belonging to
neither — the threshold you stand on as you pass through the opening. Without a
tolerance for it, every doorway in the house is a wall.

## Labels belong to the scene, not to the page

The measurement overlay's labels were DOM elements, and every problem with it
followed from that one decision. They sat in the page's stacking context, so
they painted over the header, the rail and the walk pad. They captured the
pointer, so a drag beginning on a label did not orbit the model. And they had
no idea what any other label was doing, so thirty of them piled into an
unreadable heap the moment you stood inside the building.

They are now canvas-textured sprites drawn with the dimension lines, depth-test
off so the string still floats above the render, and de-cluttered every frame
in screen space: project, sort best-first, hide anything whose box lands on a
box already accepted. External wall dimensions outrank room names, which outrank
internal walls — a drawing is readable because a draftsman leaves labels out.

## Verify the whole model, not the thing you just changed

The elevation had a 300 mm slot running the full length of the house and nobody
noticed for three commits.

`Face()` in `Exterior.tsx` drew storey 0 from FFL 0 to FCL 2.740 and storey 1
from FFL 3.040 to FCL 5.630. Nothing at all drew the floor structure between
them — so from the street you could see daylight straight through the building
at first floor level. The soffit compounded it: drawn as a full plate rather
than a ring, it hung a 28 m ceiling slab at 5.55, which is BELOW the first floor
ceiling at 5.63, so it sliced through the head of every external wall.

Both are ordinary modelling mistakes. The interesting failure is the process
one: every check that existed measured either the 2D UI (the overlap detector)
or the ground floor interior (the peer review, the walkability flood). Street
view renders a DIFFERENT set of geometry from walk and plan view — `interior`
is false, so Floors, Walls, Ceilings and Furniture unmount and only the facade
massing shows. Nothing looked at it, so it drifted.

`tools/views.mjs` is the answer: nine fixed views — both floors, plan, street,
street at night, eye level, dimensions, and two mobile — hashed and compared on
every run. A changed hash is not a failure; it is a question. Open the PNG,
confirm the change was intended, and re-baseline with `--base`.

The rule this encodes: **a model is not verified by checking the thing you just
changed.** Geometry that only one camera can see will break, quietly, in the
direction nobody is looking.

## A screenshot cannot tell you whether a button works

"I can't add an asset" was real, intermittent, and passed every check I had.

The cause was a stale closure. `Floors()` read `placing` from its render scope
and decided, on click, whether the tap was a placement or a room selection.
Arming an asset closes the sheet and mounts the placement plane — and if the tap
on the model arrived before that mesh had re-rendered with the new value,
`placing` was still null in the closure. So the tap SELECTED THE ROOM instead of
placing, called `stopPropagation` so the catcher plane never saw it, and left
the asset armed with no error. Tap again and it worked.

That is the worst shape a bug can have: intermittent, silent, and invisible to
a picture-diff, because the picture really was identical. `tools/views.mjs`
passed it every time.

Two fixes, one of them structural.

**Read state at event time, not from the closure.** Any handler that branches on
store state now calls `useStore.getState()` inside the handler. A render closure
is a snapshot; an event is a moment. When those two disagree the user loses.

**`tools/uat.mjs`.** Thirty-four scenarios across desktop and phone that drive
every control with a real pointer event and then assert the RESULT against the
store — `speakers` went 0 → 1, not "a chip appeared". Two rules keep it honest:
nothing calls a store action directly, because "the action works when called" is
not the claim under test — "the control reaches the action" is; and every
assertion reads state, never appearance.

It immediately found three more:

- **A wall-mounted asset refused any tap more than 3 m from a wall.** In an
  open-plan house that makes the middle of the living space untappable. The
  distance was never the question — a wall mount snaps to the nearest wall.
- **The refusal was invisible.** `placeError` rendered only inside the Add tab,
  and arming an asset closes that sheet. The one message explaining why nothing
  happened was behind the panel the user had just dismissed.
- **The Paint tab opened on Room scope with no room selected**, which disables
  every colour control on it — swatches, custom entry, all of it — behind one
  small grey line of hint text.

The harness also has to be honest about itself. Three of its early failures were
its own: a locator that matched several elements, a click on an element below
the fold of a scrolling sheet whose bounding box was off-screen, and a button
whose aria-label correctly changes once you are inside the building. A test that
lies costs more than no test.
