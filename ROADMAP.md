# Roadmap

Ordered by what unblocks what, not by what is most fun. Each item says why it
sits where it does, because the order is the argument.

---

## Now — the first floor re-measure

**Why first:** Redline reports first-floor walls up to 3.7 m off the sheet, and
not by a constant, so it cannot be nudged. Every other first-floor item — the
principal suite, the ensuite fittings, WIR 1, the landing balustrade, the
first-floor elevation — is downstream of geometry that is currently wrong. Doing
fixtures before walls is decorating a room that is in the wrong place.

**How:** the same pass the ground floor has had, documented in `PLANS.md`.

```bash
python3 tools/planwalls.py "samples/5792-25 - Prelim Plan SK1 ....pdf" \
        --page 2 --ox 166.67 --oz 568.67 --window 6,28,0,11
python3 tools/walldiff.py  "samples/..." --floor 1 --worst 20
```

Work wall by wall. Read a pair of lines 60–350 mm apart as one wall; read a gap
in a span as a doorway and measure the jambs off it; ignore runs at a regular
0.30 pitch (tile hatch). Update `building.ts`, re-run Redline, and expect it to
refuse the model at least once for connectivity — that is the rule working.

**Done when:** `scale/wall-position` and `scale/room-extents` report nothing
above `minor` on floor 1, and `npm run views` shows a first-floor plan that
overlays the sheet cleanly.

**Watch out for:** the first floor sheet has its own registration
(ox 166.67, oz 568.67). The two pages are 5.93 pt apart in x and 24.43 in y.
Do not reuse the ground floor origin.

---

## Next — the fixture schedule, read from the drawing

**Why:** the kitchen island, the WIP bench, the bathroom fittings and the
laundry are all placed by rule of thumb today, and it shows. The user's words
were "kitchen islands and layout need to be exact". More importantly this is the
piece that generalises: a heuristic fit-out cannot be right on the next
customer's plan, and a fixture schedule read off the sheet can.

**How:** the data is already extractable. `tools/plannotes.py` pulls the labels
with positions — this set gives, on the ground floor alone:

| label | model position | what it is |
|---|---|---|
| `900 ELEC CT 900 OVEN` | 12.72, 1.22 | cooktop and oven in the back bench |
| `WALL OVEN + M/W PROV` | 14.85, 0.75 | wall oven and microwave |
| `DW SPACE` | 13.33, 2.36 | dishwasher — so the island runs through here |
| `REF.` ×2 | 14.85 / 15.76, ~2.8 | fridge alcoves |
| `V 900` | 16.04, 7.98 | 900 vanity in the PDR |
| `900 SHR` | 17.39, 8.63 | 900 shower |
| `TUB` | 18.29, 8.66 | laundry tub |
| `W.M. PROV` / `DRYER PROV` | 18.3, 9.8–10.2 | washer and dryer positions |
| `V 1500 SB` | 22.79, 1.24 | 1500 vanity, single bowl, ensuite 2 |
| `NICHE` | 17.30 / 22.49 | shower niches |

Build `src/lib/model/fixtures.ts` from that — a typed schedule of `{ id, floor,
kind, x, z, w, d, orient, source }` — and have `Furniture.tsx` place from the
schedule first, falling back to the heuristic only where the sheet says nothing.
Then add a Redline rule: a room whose `use` implies a fixture (a bathroom needs
a basin; a kitchen needs a cooktop) and has none in the schedule is a finding.

**Done when:** the island sits where the sheet draws it with its double bowl,
cooktop, oven and dishwasher; the WIP has its bench and sink; and every bathroom
renders its actual fittings.

---

## Then — the facade, from the elevation sheets

**Why:** street view is an extruded box today. `Exterior.tsx` hard-codes a single
rectangle for the envelope, which was already a simplification and is now wrong,
because the north wall steps. The drawing set has four elevations with roof
lines, cladding bands, window positions and materials — none of it used.

**How:** the elevations are pages of the same PDF and the same extraction
applies, with two differences: the vertical axis is RL rather than plan z, and
the interesting lines are rooflines and cladding boundaries rather than walls.
Register each elevation against the FFL and FCL notes already on the sheet
(`FFL RL 16,490 AHD`, `FFL RL 19,530 AHD`, `GARAGE FFL 16,320 AHD` — all three
are in `planNotes.ts`), then extract the roof profile as a polyline.

`src/lib/model/facade.ts` already has `LEVELS`, `CLADDING` and `CLADDING_BANDS`;
this replaces their hand-entered values with measured ones and turns the massing
into a polygon.

**Done when:** street view matches the elevation sheet — roof pitch and
overhangs, the porch, the balcony, the cantilever, and cladding where the
elevation puts it.

---

## Then — per-elevation 3D views

A button per side (north / south / east / west), snapping the camera to an
orthographic-ish elevation and showing the plan notes for that face. Cheap once
the facade is right, and near-useless before it. The `Notations` overlay already
lifts to the eaves in street view for exactly this.

---

## Then — persistence and sharing

`prisma/schema.prisma` exists and nothing uses it. Today a reload loses every
placed asset, every paint decision and every calibration. The order:

1. Serialise the session (assets, paints, finishes, palette, plan calibration).
2. Save and restore against Postgres on Railway.
3. Share by link, read-only.
4. Export: a PDF of the review plus a schedule of placed items.

---

## Then — more than one building

Everything above is one house. What generalises today: the extraction tools, the
review rules (they read `ROOMS`/`WALLS`/`OPENINGS` and nothing about this
address), the solvers, the standards and planning packs. What does not: the
registration constants, the room schedule, and the fixture schedule — all of
which are currently source files rather than data.

The shape of the work: an upload flow that takes a PDF, detects the plot scale
(the title block usually states it), registers each page, extracts walls and
notes, proposes a room schedule from the enclosed regions, and asks a human to
confirm the handful it is unsure about. Redline then runs against the result.
That is the product.

---

## Backlog — smaller, unblocked, worth doing when convenient

* **Overlay legends.** Two overlays currently render nothing recognisable
  without one.
* **Room selection feedback.** Tapping a room selects it; nothing says so.
* **Per-room analysis output.** The solvers produce more than the UI shows.
* **Undo.** Placing is destructive-ish and there is no way back.
* **True orthographic plan view.** "Plan view" is currently an isometric.
* **Walk-pad turn control.** Movement is one-thumb; turning is not.
* **Retire `planTrace.ts`** or state clearly that it is a second opinion.
* **`GEOM.WID` is load-bearing** in `Exterior.tsx` and now under-describes the
  building. Fold it into a proper envelope polygon.

---

## Explicitly not doing yet

* **Cost estimation.** Tempting and shallow without a real materials schedule.
* **Structural analysis.** The beams are annotations, not members.
* **Multi-user editing.** No persistence yet; collaboration is two steps away.
* **Mobile-native.** The web build already works down to 320 px, tested.
