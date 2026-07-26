# Decisions and lessons

The reasoning behind choices that look arbitrary from outside, and the bugs that
taught them. Kept because the next person will otherwise re-derive them at the
same cost.

Format: what happened, what it cost, what changed. Newest first within each
section.

---

## Reading drawings

### Do not fit a scale you can look up

The plan overlay's first version fitted the scale against the model envelope and
got 28.65 pt/m. The sheet is plotted at 1:100, so one metre is one centimetre of
paper, which is exactly **28.3465 PostScript points**. A 1% error — 300 mm across
the length of the house — and every mismatch it caused would have been blamed on
the model rather than on the ruler that invented it.

Two labelled features confirmed the true figure independently: the panel lift
door measures 136.35 pt against its "4,810" label, and the numbered stair treads
sit at a 7.087 pt pitch against a 250 mm going. Two features agreeing to four
significant figures is a scale you can rely on.

**Rule:** take the scale from the plot. Confirm against something the drawing
dimensions for you. Never fit against the thing you are trying to check.

### A transcription cannot check a transcription

`planTrace.ts` was built as an independent check on `building.ts`. It carried the
same wrong wall in the entry, because it came from the same reading. The model
and the trace agreed, the review passed, and the wall was still not on the sheet.

**Rule:** the drawing is the reference; the model is under test. `planwalls.py`
and `walldiff.py` exist so the checker reads the drawing rather than somebody's
notes about it.

### Register every page separately

The two floor plans in this set are drawn 5.93 pt apart in x and 24.43 pt in y
on their own sheets. Assuming a shared origin put the first floor overlay most
of a metre out.

Register a second page against a feature that is physically the same object in
both. Numbered stair treads are ideal — they appear on both plans and the
numbering removes any ambiguity about which tread is which.

### Orientation cannot be reasoned about, only asserted

The plan overlay was printed upside down, north for south, and it was **not**
obvious: the building happens to sit near the middle of the crop, so the ink
still landed on the house. Only the text reading backwards gave it away, and the
first attempt to fix it made it worse because the reasoning was wrong in both
directions.

What settled it: painting coloured markers into the texture at known model
coordinates, rendering, and comparing where they landed against the live
camera's own projection of those same world points. Two-pixel agreement, no
argument.

**Rule:** for anything with a handedness — texture orientation, winding order,
axis conventions — assert it against a landmark rather than deriving it. The
`project()` seam on `window.__sitescape` exists for this.

### A wall modelled straight where the drawing steps hides inside its own average

`walldiff.py` matches each model wall against **one** measured line. `gw_n` was
modelled as a single run at z = 11 across the whole building; the drawing steps
at x ≈ 17.9, with the main house at z 9.45 and only the laundry-and-garage block
at z 10.85. The tool matched the garage's line and reported a comfortable
100 mm, while the living and family rooms were 1.5 m too deep.

**Rule:** split a run before trusting its number. Redline's
`scale/wall-off-sheet` finding — a wall with *nothing* on its axis — is the one
designed to catch this class.

---

## Rules and tolerances

### A tolerance that encodes one building's construction breaks on the next

Three places shared a 350 mm tolerance: the window generator, the
opening-abuts-room rule, and one other. 350 mm is a brick veneer wall, used as a
box to grow a point by.

The moment a room was corrected to sit 390 mm off its external wall — a change
that made the model **more** accurate — every window on that wall lit nothing,
two bedrooms silently lost all of their glazing, and the natural light rule went
from pass to major.

**Rule:** prefer a test that asks the real question. Probe inward from the wall
and see which room you land in. Measure the distance from the opening to the
room rectangle rather than growing the rectangle.

### Three questions about a door beside a stair

The first door-landing rule asked "is the landing inside a flight's footprint"
and flagged two doors, both wrongly. A point under a rising flight can be three
different things and only one is a defect:

* the flight is at floor level there — you are at the foot of it, which is where
  the plan intends you to stand;
* the flight is high overhead — you walk underneath, which is what the space
  beside every straight flight is for;
* the flight is in between — you step onto a tread or put your head through the
  stringer.

Flights belonging to the floor below do not occupy this floor's space at all;
where they break through it they leave a void, and a void is not a room, so the
"no floor on either side" test already catches a door opening into one.

### Test against the model, not against a number you once observed

A UAT assertion read `openCount > 40`. It started failing the day window
generation was rewritten to place one window per room instead of one every
3.2 m — a change that made the model better and left 38 openable things instead
of 41. A hard-coded count does not test "open all opens everything", it tests
"the building has not changed", which is not the claim.

The store now exposes `openable` and `alwaysOpen` so the assertion can be
relative.

### Redline refusing a commit is the system working

Correcting the service block sealed seven rooms off from the rest of the house.
The circulation rule caught it before anything shipped. The fix — a cased
opening under a beam — is marked `INFERENCE` in the source with the reasoning
written out, because the sheet shows that stretch open with no door symbol and
a kitchen you can only enter through a linen press is not a plan, but it still
wants confirming.

**Rule:** a `major` finding either gets fixed or gets written into the source as
a flagged inference. It never gets silenced.

---

## Rendering and fit-out

### Furniture must not invent anchors

The fit-out did arithmetic on the room rectangle — "curtain at z0 + 0.14",
"second car at centre + 1.45" — and never asked whether the result was inside
the room, on a wall that exists, or clear of the door. In one render that
produced, simultaneously:

* a curtain hanging in mid-air across the open-plan boundary between the kitchen
  and the family room, where the drawing's 11,280 clear span means there is no
  wall at all. It read as a free-standing partition and was the most obviously
  wrong thing in the render — and nothing in the model had put it there;
* two cars nose to tail down a double garage, the front one 770 mm through a
  shut panel lift door, because the offset was applied along the axis you drive
  down. A double garage is double because two cars park abreast, and the 4,810
  door says so;
* a breakfast island and overhead cabinets in a 1.7 m servery, because the
  joinery keyed off `use === 'kitchen'` and a servery's use is kitchen.

All three are now tested in `src/lib/model/fitout.ts`: containment, door
clearance, and — when the piece leans on something — a wall actually being there.
Kitchen joinery follows the room's fixture schedule rather than its use.

### A curtain belongs to a window

Related, and its own point: a curtain with no window behind it is not a curtain.
They are placed on glazing now, drawn as two drapes at the reveals rather than a
slab across the opening, because a slab is what made the misplaced one read as a
wall.

### Landscape gaps come from the model

The boundary hedge ran straight across the mouth of the driveway. It now takes
its gaps from the garage door's own width plus a manoeuvring margin, and from
the entry — so they stay right when the plan changes. Nobody drawing this by
hand would hedge across a crossover; the openings are what say where it stops.

### Semi-transparent means transparent

The first pass at "semi-transparent label chips" used 58% opacity, which is a
pale card with the render faintly behind it. At 30% it reads as a tint over the
building. With a dozen chips on screen the difference is whether you can see the
model at all.

### An overlay that shows everything shows nothing

146 plan notes drawn at once turns the render into the drawing, which you
already have. Notes are pins carrying one clipped line, de-cluttered in screen
space best-first, ranked so what survives at a distance is what matters. Tapping
opens one in full.

---

## Testing

### A screenshot cannot tell you whether a button works

The placement race — an asset silently failing to place, intermittently —
**passed the screenshot harness perfectly**, because the picture really was
identical. That was the bug.

### A state assertion cannot tell you whether a control is reachable

The top-rail icons were 31 × 25 CSS px. Fine under a mouse, a miss under a
thumb. The state was correct and the picture was the picture that shipped last
time, so both existing harnesses passed.

`tools/uat.mjs` now measures every visible control at seven viewport sizes
against a minimum hit target — 36 px for a finger, 24 for a mouse — plus
off-screen, sideways-scroll and sheet-closability checks.

### Verify the whole model, not the thing you just changed

Street view renders a **different set of geometry**: `interior` is false, so
floors, walls, ceilings and furniture unmount. Every check that existed measured
the 2D UI or the ground floor interior, so an open slot running the full length
of the elevation — 300 mm of undrawn floor structure you could see daylight
through — drifted for three commits.

`tools/views.mjs` captures nine views including street, street at night, and two
mobile.

### A test that lies costs more than no test

Three of the UAT suite's own early failures were the harness breaking rather
than the app: a locator matching several elements, a click on a control below
the fold of a scrolling sheet whose bounding box was off-screen, and a button
whose `aria-label` correctly changes once you are standing inside the building.
Fix the harness first; a suite you have learned to ignore is worse than none.

---

## Environment

### `pkill -f` kills the agent's own shell

`pkill -f next` matches the pattern in the agent's command line too. Use
`ps -ef | grep "[n]ext" | awk '{print $2}' | xargs -r kill -9`.

### A stale server will serve an old build and lie to you

More than one confusing hour was spent debugging a fix that was never being
served. After a rebuild, confirm the served CSS hash matches disk.

### Playwright cannot click a continuously repainting canvas

`locator.click()` waits for actionability, which never settles. Read the
bounding box and dispatch `page.mouse.click`.

---

## Licensing traps met along the way

Recorded so nobody re-discovers them:

| library | trap |
|---|---|
| PyMuPDF | AGPL. Fine as a workstation tool producing committed data; not linkable into the app. pdfminer.six (MIT) is the fallback, and preserves Form XObjects as `LTFigure` if symbol instancing ever matters. |
| DocLayout-YOLO | AGPL despite an Apache model card |
| CAGE | MIT **plus Commons Clause** — not open source |
| ezdxf `odafc` | shells out to a non-commercial ODA binary |
| Qwen2.5-VL-3B | non-commercial, while 7B and 32B are Apache |

Also: the widely-copied ralcolor.com RAL hex set is demonstrably wrong (mean RGB
distance ~21 from the colorimetric values). `src/lib/model/colourData.ts` uses
the colorimetric set. NCS has no public exact notation→sRGB formula; `ncs.ts`
implements the canonical open approximation and the UI says the swatches are
indicative.
