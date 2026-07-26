# SiteScape

Turns a set of architectural drawings into a navigable, material-aware 3D model,
and runs every discipline over the same geometry — so changing a wall build-up, a
floor finish, a paint colour or an opened window changes the thermal, acoustic,
lighting, airflow, HVAC and WiFi results together.

The subject building is real: Firstyle Homes "Grantham 36.9 Pristine MkII", job
5792-25 sheet SK1, Lot 43B / 101 Campbell Street, Fairfield East NSW 2165. The
plan set is in [`samples/`](samples/).

---

## Run it

```bash
npm run setup                  # install + the chromium the test harnesses drive
npm run dev                    # http://localhost:3000
npm run build && npm start
```

Changing the geometry also needs the plan readers:

```bash
pip install -r tools/requirements.txt
```

No secrets, no services, no database required to run.

---

## Check it

```bash
npm test        # solvers and standards — pure functions, no browser
npm run views   # nine screenshots, hashed against a committed baseline
npm run uat     # every control, real pointer events, seven viewport sizes
npm run check   # build + uat + views
```

Three harnesses because there are three questions, and no one of them answers
another: *is the physics right*, *did the picture change*, *does the control
reach the action and can a person hit it*. [`TESTING.md`](TESTING.md) explains
which bug each one caught that the others missed.

A fourth question — *is the model faithful to the drawing?* — is answered by
**Redline**, the drafting review in `src/lib/review/draftingRules.ts`.

---

## Read it

| document | what's in it |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Start here. Working instructions, environment gotchas, house style. |
| [`HANDOVER.md`](HANDOVER.md) | Full engineering handover: stack, state of the build, what's known wrong. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the pieces fit and why they're separated where they are. |
| [`PLANS.md`](PLANS.md) | How to read a plan set: scale, registration, extraction. |
| [`DRAFTING.md`](DRAFTING.md) | The drafting judgements encoded as rules, and the defects that taught them. |
| [`DECISIONS.md`](DECISIONS.md) | Every non-obvious choice, with the bug that caused it. |
| [`ROADMAP.md`](ROADMAP.md) | What's next, in the order that unblocks the most. |
| [`TESTING.md`](TESTING.md) | The three harnesses in detail. |
| [`DEPLOY.md`](DEPLOY.md) | Railway. |
| [`docs/PHYSICS.md`](docs/PHYSICS.md) | What each solver computes, what the tests prove, and the limits. |

---

## The one rule

**A transcription cannot check a transcription.**

Every geometry defect that has reached a render came from checking the model
against something else somebody had typed — the trace agreed with the model, the
review passed, and the staircase was still a metre from where the drawing put it.

The drawing is the reference. The model is under test. `tools/planwalls.py`
reads wall lines straight out of the vector PDF in model metres,
`tools/walldiff.py` reports how far each modelled wall sits from the line the
sheet actually draws, and `src/components/PlanSheet.tsx` lays the rendered sheet
over the model at true scale so the two can be read together.

---

## How openings propagate

Opening a window or a door changes, in the same frame:

| discipline | effect |
|---|---|
| thermal | a ventilation flow term appears; solar gain switches to an open aperture |
| acoustics | the aperture becomes a perfect absorber (α = 1), so RT60 drops |
| airflow | cross-ventilation is detected when apertures face different orientations |
| RF | the ray no longer pays that wall's attenuation |
| HVAC | the infiltration load changes |

That is the whole idea of the app in one table: one model, every discipline, one
edit.

---

## Stack

Next.js 14 (App Router) · TypeScript · React Three Fiber + three.js · Zustand ·
`node --test` · Playwright for UAT · Python + PyMuPDF for plan reading ·
Railway for hosting. Full versions and rationale in
[`HANDOVER.md`](HANDOVER.md#2-tech-stack).
