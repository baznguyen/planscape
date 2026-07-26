# Architecture

How the pieces fit and, more usefully, why they are separated where they are.

---

## The shape of it

```
                        samples/*.pdf          ← the drawing set. The reference.
                             │
              tools/planwalls.py  plannotes.py  planimages.py
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
 sheetLines.ts         planNotes.ts        public/plans/*.png
 (measured walls)      (written notes)     (ink-only sheet images)
        │                    │                     │
        │                    │                     │
        │              ┌─────┴──────┐              │
        │              ▼            ▼              ▼
        │        Notations.tsx   Redline      PlanSheet.tsx
        │        (pins on the    (scale        (the sheet laid
        │         model)          rules)        over the model)
        │                    │
        └──────► Redline ◄───┘
                    ▲
                    │  reads and judges
                    │
            src/lib/model/building.ts        ← THE MODEL. Rooms, walls,
                    │                          openings, stairs, beams.
        ┌───────────┼───────────┬───────────────┐
        ▼           ▼           ▼               ▼
   materials.ts  solvers/   fitout.ts      components/
   (physics of   (thermal,  walkable.ts    (the 3D scene
    build-ups)    acoustic,  clearance.ts   and the UI)
                  light,     mounting.ts
                  air, RF)
```

Data flows one way. Nothing in `components/` computes physics; nothing in
`solvers/` knows React exists; nothing in `model/` imports from either.

---

## Why the model is a single flat file

`src/lib/model/building.ts` is one long array of rooms, one of walls, one of
openings. It could be split by floor, by zone, by discipline. It is not, and
should stay that way, for two reasons.

First, **every rule reads across it**. Redline asks "does this opening touch both
rooms it names", "can every room be reached from every other", "does this wall
have a line on the drawing". Those are whole-model questions, and splitting the
model turns each of them into an import graph problem.

Second, **it is the transcription**, and a transcription should read like the
drawing it came from. When you are checking `g_pdr` against the sheet you want
to see `g_lin` and `g_wil` on the next line, because that is how they appear on
the paper.

What does belong in separate files: anything *derived*. `sheetLines.ts` and
`planNotes.ts` are generated from the PDF and marked as such. `planTrace.ts` is
an independent second transcription, deliberately never derived from `WALLS`,
because a trace derived from the model would prove nothing.

---

## Why the solvers are pure

Every solver in `src/lib/solvers/` is a function from data to data. No React, no
store, no DOM. That is what makes `tests/solvers.test.mjs` a two-line assertion
per physical claim instead of a browser session, and it is why the thermal model
can sub-step adaptively without anybody worrying about render loops.

The cost is that state has to be threaded in from the store at the call site.
That is the right trade: the physics is the part that must stay correct across
years, and the plumbing is the part that will be rewritten.

---

## Why the store is one flat Zustand slice

`src/store/useStore.ts` holds all of it — view, floor, overlays, placed assets,
paints, finishes, ambience, time, plan calibration. No context tree, no slices,
no selectors library.

The reason is testability. At the bottom of that file is a read-only seam:

```ts
window.__sitescape = {
  get: () => ({ view, floor, drawer, placing, counts: {...}, overlays: {...}, ... }),
  project: (x, y, z) => [screenX, screenY],       // added by Rig() in Scene.tsx
}
```

The UAT harness asserts against that object after driving a real pointer event.
A nested store would mean a nested seam and a fragile one. `project()` exists
because the plan overlay's orientation cannot be checked from the model alone —
both are self-consistent when the sheet is printed upside down, which is exactly
how a garage came to be drawn over a bedroom and survive a reading.

**The rule that came out of this:** any event handler that branches on store
state must read `useStore.getState()` *inside the handler*. A render closure is
a snapshot; an event is a moment. When they disagree the user loses, silently —
which is precisely what the placement race was.

---

## Why the review is separate from the renderer

`src/lib/review/` never imports from `src/components/`. Redline reads `ROOMS`,
`WALLS`, `ALL_OPENINGS`, `STAIRS`, `BEAMS` and `SHEET_LINES`, and nothing about
this particular house. **A rule that only works for 101 Campbell Street is not a
rule, it is a patch.**

That constraint has teeth. When the fit-out was found to be placing furniture
outside rooms and through doors, the fix went into `src/lib/model/fitout.ts` —
model-layer, testable, reusable — rather than into `Furniture.tsx`, so the
reviewer can eventually read the same predicates.

---

## Why there is no CSS framework

`src/app/globals.css` is hand-written and is the visual language. One popup
shape (`src/components/ui/Sheet.tsx`), one icon language (`ui/icons.tsx`, all
line drawings in `currentColor`, never emoji), one set of hit-target minimums
under `@media (pointer: coarse)`.

The icon point is worth stating because it was learned the hard way: a 🔈 and a
🔉 differ by one bar and say nothing about *where the thing goes*, which is the
only property that matters when you are about to tap a floor and commit a
mounting decision. Every asset icon draws the item against its host surface — a
ceiling line above a recessed can, a wall line beside a flush-mount box — so the
mount logic is legible before you place anything.

---

## The overlay stack, and render order

Several things draw on top of the model, and the order matters:

| renderOrder | what | depth test |
|---|---|---|
| 38 | `PlanSheet` — the drawing itself | off |
| 44–46 | `Dimensions` — strings and chips | off |
| 47–49 | `Notations` — plan note pins | off |

All of them are de-cluttered in **screen space, every frame**: project, sort
best-first, and hide anything whose box lands on a box already accepted. That is
the whole trick, and it is borrowed from how drawings work — a drawing is
readable because a draftsperson leaves labels out, not because they are all
present.

Ranking is what makes it feel right rather than arbitrary. External wall
dimensions outrank room names outrank internal walls. For notes, a stepdown
changes the slab and a window schedule code does not, so levels and structure
outrank openings. What survives at a distance is what matters, and zooming in is
what reveals detail — the same gesture you would use on paper.

---

## Street view is a different model

This one has bitten twice and deserves its own heading.

When `view === 'street'`, `interior` is false and `Floors`, `Walls`, `Ceilings`
and `Furniture` **unmount**. What you see is the facade massing from
`Exterior.tsx` and `Roof.tsx`, which is a separate description of the same
building.

Consequences:

* a change to `building.ts` may not show in street view at all;
* a change to `facade.ts` will not show anywhere else;
* any verification that only looks at the interior will miss elevation defects
  entirely — which is what happened for three commits before `tools/views.mjs`
  existed.

The current massing is one hard-coded rectangle, and the north wall now steps,
so it is known-wrong. Rebuilding it from the elevation sheets is on the roadmap.

---

## Standards and planning packs

`src/lib/standards/` and `src/lib/planning/` are registries behind one interface,
with AU / GB / US and NSW / England packs. Nothing in the solvers hard-codes a
threshold; they ask the active pack. That is why the drafting rules can cite
"NCC Volume Two Part 11.2" in a finding rather than a magic number, and why the
same engine can, in principle, review a British house.

---

## Generated files

Never edit these by hand — regenerate them:

| file | generated by |
|---|---|
| `src/lib/model/sheetLines.ts` | `tools/planwalls.py --ts` |
| `src/lib/model/planNotes.ts` | `tools/plannotes.py` |
| `public/plans/*.png`, `meta.json` | `tools/planimages.py` |
| `tools/views/baseline.json` | `node tools/views.mjs --base` |

`.vscode/settings.json` marks the first two read-only in the editor, because
editing them by hand is how the model stops matching the drawing.
