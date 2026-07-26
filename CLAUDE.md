# Working on SiteScape

Instructions for Claude Code (and for anyone else) working in this repository.
Read this first; it is short on purpose. The long-form reasoning lives in
`HANDOVER.md`, `ARCHITECTURE.md`, `PLANS.md` and `DRAFTING.md`.

---

## What this is

SiteScape turns a set of architectural drawings into a navigable 3D model, and
then runs discipline solvers over that model — thermal, acoustic, lighting,
airflow, HVAC, WiFi — so that changing a wall build-up or opening a window
changes every number at once.

The current subject building is a real one: Firstyle Homes "Grantham 36.9
Pristine MkII", job 5792-25 sheet SK1, Lot 43B / 101 Campbell Street, Fairfield
East NSW 2165. The plan set is in `samples/`. Everything in `src/lib/model/` is
that building.

---

## The one rule that matters

**A transcription cannot check a transcription.**

Every geometry defect that has reached a render came from checking the model
against something else somebody had typed. The trace agreed with the model, the
review passed, and the staircase was still a metre from where the drawing put
it. The drawing is the reference; the model is the thing under test.

Practically, that means: before you change a number in `src/lib/model/building.ts`,
measure it off the sheet. `tools/planwalls.py` will give you the wall lines in
model metres. `tools/walldiff.py` will tell you how far off you are. Do not fit
the scale against the model — take it from the plot (this set is 1:100, so one
metre is exactly 28.3465 PostScript points). `PLANS.md` explains the method.

---

## First run

```bash
npm run setup     # npm install + the chromium build Playwright drives
npm run dev       # http://localhost:3000
pip install -r tools/requirements.txt   # only needed to change geometry
```

`npm run setup` rather than `npm install` because the UAT and screenshot
harnesses need a browser binary, and `npm install` does not fetch one.

---

## Before you commit

```bash
npm run build          # must compile
npm test               # unit tests for the solvers and standards packs
npm run uat            # every control, driven with real pointer events, 7 viewports
npm run views          # nine screenshots, hashed against a committed baseline
```

`npm run check` runs build + uat + views together.

A changed view hash is a **question, not a failure**: open the PNG in
`tools/views/`, confirm the change was intended, then re-baseline with
`node tools/views.mjs --base` and commit the new `baseline.json`.

Redline — the drafting review in `src/lib/review/draftingRules.ts` — runs inside
the app, but you can run it from the shell:

```bash
cat > /tmp/r.mts <<'EOF'
const { runDraftingRules } = await import('./src/lib/review/draftingRules.ts');
for (const f of runDraftingRules()) console.log(f.severity.padEnd(9), f.rule.padEnd(28), f.title);
EOF
cp /tmp/r.mts ./r.mts && npx tsx ./r.mts; rm r.mts
```

Do not ship a commit where Redline reports anything at `major` or `critical`
that you have not either fixed or written down as a flagged INFERENCE in the
source, with the reasoning.

---

## Environment gotchas

These have each cost an hour. They are not obvious.

**Playwright `locator.click()` times out on this app.** The 3D canvas repaints
continuously, so the actionability check never settles. Use `boundingBox()` plus
`page.mouse.click(x, y)` — `tools/uat.mjs` has a `tap()` helper that does this
correctly, including scrolling a sheet before reading the box.

**`NODE_ENV=production` in your shell will break the build in a way that points
nowhere near the cause.** npm reads it, sets `omit=dev`, and skips
devDependencies — so `typescript` never installs, Next cannot read
`tsconfig.json`, the `@/*` path aliases stop resolving, and you get
`Module not found: Can't resolve '@/components/Ui'`. The repo `.npmrc` sets
`omit=` to neutralise it. If you still see it, check `npm config get omit`.

**Never `pkill -f next`** in an agent shell — the pattern matches the agent's own
shell and kills it. Use:

```bash
ps -ef | grep "[n]ext" | awk '{print $2}' | xargs -r kill -9
```

**A stale `next start` will serve an old build and lie to you.** After a rebuild,
confirm the served CSS hash matches disk before trusting a screenshot:

```bash
curl -s http://localhost:3000/ | grep -o '/_next/static/css/[^"]*' | head -1
ls .next/static/css/
```

**React render closures are snapshots; events are moments.** Any handler that
branches on store state must read `useStore.getState()` inside the handler, not
close over the value. A placement bug that took a day to find was exactly this.

**The Python tools need PyMuPDF, Pillow and NumPy** — see
`tools/requirements.txt`. They are local tooling only and are never bundled.

---

## House style

Comments explain **why**, and specifically why the obvious alternative is wrong.
There is a lot of that in this codebase and it is deliberate: most of the hard
parts here are hard because a reasonable-looking approach fails for a reason you
cannot see from the code. If you fix a bug, leave behind the sentence that would
have prevented it.

Commit messages do the same. Read `git log` — they are the design history.

Prefer a test that asks the real question over a tolerance. Three places in this
codebase once shared a 350 mm tolerance (a brick veneer wall, used as a box to
grow a point by); the moment a room was measured to sit 390 mm off its external
wall, two bedrooms silently lost all of their glazing. A tolerance that encodes
one building's construction breaks on the next.

---

## Where things are

| I want to… | Look in |
|---|---|
| change the building geometry | `src/lib/model/building.ts` |
| add a physics solver | `src/lib/solvers/` (pure functions, no React) |
| add a review rule | `src/lib/review/draftingRules.ts` |
| change what's drawn in 3D | `src/components/Scene.tsx` and its children |
| change UI chrome | `src/components/Ui.tsx`, `src/app/globals.css` |
| add state | `src/store/useStore.ts` (Zustand; also holds the test seam) |
| read the drawing | `tools/planwalls.py`, `tools/plannotes.py` |
| check the model against the drawing | `tools/walldiff.py`, or Redline's scale rules |

---

## Deploying

The Mac pushes; Railway builds from GitHub `main`. See `DEPLOY.md`.
