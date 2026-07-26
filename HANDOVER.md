# SiteScape — engineering handover

Written for whoever picks this up next, in VS Code or Claude Code, with no
memory of how it got here. It covers what the thing is, what state it is
actually in, what is known to be wrong, and what to do next.

---

## 1. What the product is

A drawing set goes in. A navigable, material-aware 3D model comes out, with
every discipline solved over the same geometry — so a change to a wall build-up,
a floor finish, a paint colour or an opened window changes the thermal, acoustic,
lighting, airflow, HVAC and WiFi results together instead of one at a time.

Who it is for: builders, designers and clients looking at a set of preliminary
plans and trying to answer questions the drawings do not answer. *Will that room
be hot in February? Can I hear the TV from the kitchen? Where do the downlights
go? Does WiFi reach bedroom 4? What does Colorbond Dune actually look like on
that facade at four in the afternoon?*

What makes it more than a viewer is the review layer. **Redline** reads the model
the way a senior architect reads somebody's drawing, and says where it is wrong —
including whether the model is faithful to the sheet it came from.

The subject building is real: Firstyle Homes "Grantham 36.9 Pristine MkII", job
5792-25, sheet SK1, Lot 43B / 101 Campbell Street, Fairfield East NSW 2165,
client H. Nguyen, 609 m² site. The plan set is committed at `samples/`.

---

## 2. Tech stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js App Router | 14.2.35 | Static shell, one client page; nothing needs SSR |
| Language | TypeScript | 5.5.3 | Strict; the model is the type system's main job |
| 3D | React Three Fiber + drei | 8.16.8 / 9.108.4 | Declarative three.js that survives React re-renders |
| Renderer | three.js | 0.160.1 | Pinned — drei is version-sensitive |
| State | Zustand | 4.5.4 | One flat store, no context tree, easy to expose for tests |
| Solar | suncalc | 1.9.0 | Solar position; irradiance and shading are ours |
| Tests | `node --test` | built in | No framework; the solvers are pure functions |
| E2E / UAT | Playwright | (dev only, not a dependency) | Real pointer events against a running build |
| Plan reading | Python + PyMuPDF, Pillow, NumPy | `tools/requirements.txt` | Vector PDF extraction; local tooling, never bundled |
| DB | Prisma + Postgres | schema only | Scaffolded, **not wired up** — see §6 |
| Host | Railway | — | Nixpacks build from GitHub `main` |

No CSS framework. `src/app/globals.css` is hand-written and is the single source
of the visual language. No component library — `src/components/ui/Sheet.tsx` is
the one popup shape and everything else follows it.

---

## 3. How it is put together

```
src/lib/model/      the building, and everything derived from the drawing
  building.ts       ROOMS, WALLS, ALL_OPENINGS, STAIRS, BEAMS, GEOM  ← the model
  materials.ts      every build-up: U value, kappa, alpha @125/500/2k, Rw,
                    RF attenuation per band, reflectance, SHGC
  sheetLines.ts     GENERATED — wall faces measured off SK1, in model metres
  planNotes.ts      GENERATED — the 146 written notes on the sheet, positioned
  planTrace.ts      an independent hand transcription (kept as a second opinion)
  colours.ts        colour systems; LRV computed per BS 8493 from sRGB
  fitout.ts         where a piece of furniture is allowed to stand
  walkable.ts       where a person can stand; drives the walkthrough and a rule
  clearance.ts      door swing zones
  mounting.ts       where a placed asset attaches (ceiling / wall / floor)

src/lib/solvers/    pure functions, no React, individually unit-testable
  sun.ts            solar position, clear-sky irradiance, eave and blind shading
  thermal.ts        transient lumped-capacitance RC, one node per room
  acoustics.ts      Sabine/Eyring RT60, room modes, transmission loss, SPL
  lighting.ts       lux from luminaire IES-ish cones plus daylight
  airflow.ts        buoyancy-driven cross ventilation
  hvac.ts           sensible load and duty
  rf.ts             per-band WiFi path loss through real wall attenuations

src/lib/review/     Redline
  draftingRules.ts  geometry, habitability, circulation, SCALE
  circulation.ts    reachability primitives
  assetRules.ts     rules about things the user has placed
  peerReview.ts     runs everything and scores it

src/lib/standards/  AU / GB / US code packs behind one interface
src/lib/planning/   NSW and England planning-control packs
src/lib/ve/         value-engineering levers

src/components/     the 3D scene and the UI
  Scene.tsx         the R3F canvas: floors, walls, openings, ceilings, overlays
  Exterior.tsx      street view massing, landscape, neighbours
  Roof.tsx          roof forms
  Furniture.tsx     fit-out; asks fitout.ts whether a piece may stand anywhere
  Dimensions.tsx    measurement overlay, screen-space de-cluttered
  Notations.tsx     the drawing's written notes as interactive pins
  PlanSheet.tsx     the actual sheet, laid over the model at true scale
  Ui.tsx            header, layers sheet, time bar, toasts
  Toolbox.tsx       add / paint / report

src/store/useStore.ts   all app state, plus the read-only `window.__sitescape`
                        test seam that the UAT asserts against

tools/              the harnesses and the plan readers (see TESTING.md, PLANS.md)
```

Data flows one way: `building.ts` → solvers → components. Nothing in
`components/` computes physics and nothing in `solvers/` knows about React.

---

## 4. The plan-reading method

This is the part that is genuinely novel and the part most likely to be
misunderstood, so it has its own document: **`PLANS.md`**. The short version:

* Take the scale from the **plot**, not from a fit against the model. 1:100 means
  one metre is exactly 28.3465 pt. Fitting against the model produced 28.65 —
  a 1% error, 300 mm across the house, and it would have been blamed on the
  model rather than on the ruler.
* Register **each page separately**. The two floor plans in this set are drawn
  5.93 pt apart in x and 24.43 pt in y on their own sheets.
* Walls are already exact line segments in a vector PDF. No OCR.
  `tools/planwalls.py` extracts them; a pair of lines 60–350 mm apart is one
  wall drawn as its two faces, a gap in a span is a doorway, and a run of three
  or more at a regular pitch is tile hatch.
* `tools/plannotes.py` lifts the written notes with their positions, because
  half of what a drawing tells a builder is text and none of it survives into a
  model made of rooms and walls.

---

## 5. Redline

The review has a name because you should be able to ask what it checked, and a
reviewer that is nobody in particular ends up checking nothing in particular.

It always runs, in order:

1. **Geometry integrity** — overlapping rooms, openings that name a wall that
   does not exist or a room that does not reach them, walls ending in mid-air.
2. **Habitability** — natural light against 10% of floor area, ceiling heights
   by use, room proportions.
3. **Circulation** — can every room be reached on foot (a 100 mm grid flood over
   `standable()`), does every doorway have a 900 mm landing, and — the subtle
   one — is a landing under a rising flight at floor level, at head height, or
   in the band between where you would step onto a tread.
4. **Scale** — every wall and every room against the line SK1 actually draws.

The scale bands are what a draftsperson would say over your shoulder: under
60 mm is a centreline against a face; 60–250 mm is a wall thickness that has
drifted; past 250 mm the wall is not where the drawing puts it. A wall with
*nothing* on its axis is its own finding, and is usually more interesting — it
means the model has invented a wall, or has run one straight through a step the
drawing makes. That is exactly how the north wall error would have been caught.

Redline has already refused a commit: correcting the service block sealed seven
rooms off from the rest of the house, and it said so.

---

## 6. Honest state of the build

### Correct and verified

* Ground floor geometry: worst wall 200 mm off the sheet, most inside 40 mm.
* The staircase — 18 risers at 169 over a 250 going, x 18.40–22.67, z 3.04–4.09 —
  recovered from the numbered treads and riser lines on both sheets.
* Entry, hall, bedroom 5, guest bedroom, ensuite 2, garage.
* The service block: PDR, L'DRY, LINEN, WIL and the laundry lobby, all measured.
* The plan overlay's registration and orientation, verified numerically by
  painting markers into the texture at known model coordinates and comparing
  against the live camera's own projection.
* Fit-out containment — nothing is drawn outside its room or through a door.

### Known wrong

| What | How wrong | Notes |
|---|---|---|
| **First floor geometry** | up to 3.7 m | Not a constant offset, so it cannot be nudged. Needs the same wall-by-wall pass the ground floor has had. `f_hea` is a stop-gap so the stair arrives somewhere. |
| **Street-view massing** | the envelope is one rectangle | `Exterior.tsx` hard-codes `{x0:6.6, x1:28.03, z0:0, z1:WID}`. The north wall now steps, so the west end reads too deep. Wants rebuilding from the elevation sheets. |
| **Fixture positions** | heuristic, not measured | Kitchen island, WIP bench, bathroom fittings are placed by rule of thumb. The sheet labels them (`900 ELEC CT`, `DW SPACE`, `V 900`, `900 SHR`, `TUB`) with positions already extracted in `planNotes.ts`. |
| **Prisma / Postgres** | scaffolded, not wired | `prisma/schema.prisma` exists; nothing reads or writes it. There is no persistence: reload loses placed assets and paint. |
| **`planTrace.ts`** | superseded | Kept as an independent second opinion, but `sheetLines.ts` is now the better reference. Decide whether to retire it. |

### Deliberate inferences (flagged in source)

Two openings are marked `INFERENCE` in `building.ts` with the reasoning written
out: `o_f12` (a first-floor landing opening) and `o_g9` (the opening that lets
the open-plan core reach the hall). Both need confirming against the sheet
before anything is built from them. Search the source for `INFERENCE`.

---

## 7. Roadmap

See `ROADMAP.md` for the full backlog with rationale. The order that matters:

1. **First floor re-measure.** Everything else on that level is downstream of it.
2. **Fixture schedule from the drawing.** Replaces the heuristic fit-out with
   measured positions, and generalises to the next customer's plans.
3. **Facade from the elevations.** Street view rebuilt from the elevation sheets
   — roof lines, materials, window positions — instead of an extruded box.
4. **Per-elevation 3D views.** A button per side, since the drawing set has them.
5. **Persistence.** Wire up Prisma so a session survives a reload, then sharing.
6. **Multi-plan ingestion.** Everything above is currently one building. The
   tooling generalises; the constants do not yet.

---

## 8. Operational notes

* **Deploy:** Railway project `arch-engine`, id `bd57ac58-411e-4b1f-85e8-5960a364d62a`,
  environment `production` `f27def06-5a6e-4b29-9ede-da333f37a921`. It builds from
  GitHub `main` (`baznguyen/planscape`) with Nixpacks; health check at
  `/api/health`. Push to `main` and it deploys in about 90 seconds.
* **No secrets** are required to run locally. `npm install && npm run dev`.
* **The Python tools are optional** for running the app and required for changing
  the geometry. `pip install -r tools/requirements.txt`.

---

## 9. The five lessons this codebase paid for

Written out because each cost real time and none of them is obvious.

1. **A transcription cannot check a transcription.** If the model and the trace
   came from the same reading they agree with each other and both are wrong.
2. **Do not fit a scale you can look up.** The plot scale is printed on the
   sheet. Fitting produced a 1% error that looked like a model fault.
3. **A tolerance that encodes one building's construction breaks on the next.**
   Prefer a test that asks the real question — probe inward from the wall and
   see which room you land in, rather than growing a rectangle by 350 mm.
4. **A screenshot cannot tell you whether a button works, and a state assertion
   cannot tell you whether it is reachable.** Three harnesses, three questions:
   did the picture change, does the control reach the action, and is the control
   big enough to hit at seven viewport sizes.
5. **Verify the whole model, not the thing you just changed.** Street view
   renders a *different geometry set* from walk and plan view; the elevation
   drifted through three commits because every check looked at the interior.
