# Testing

Three harnesses, because there are three different questions and no one of them
answers another. This is the most important paragraph in the document:

* **`npm test`** — is the physics right? Pure functions, no browser.
* **`npm run views`** — did the picture change? Nine screenshots, hashed.
* **`npm run uat`** — does the control reach the action, and can a person hit it?
  Real pointer events at seven viewport sizes.

Each one has, at least once, passed a bug the other two caught. The placement
race passed the screenshot harness perfectly, because the picture really was
identical — that was the bug. The 31 × 25 px icon buttons passed both the
screenshot harness and every state assertion, because the state was correct and
the picture was the picture that shipped last time.

Plus **Redline**, the drafting review, which runs inside the app and answers a
fourth question: is the model faithful to the drawing?

---

## `npm test` — solvers and standards

```bash
npm test                     # node --test tests/*.mjs
```

`tests/solvers.test.mjs`, `tests/standards.test.mjs` and
`tests/planning.test.mjs`. They run against compiled solvers:

```bash
npx tsc --outDir dist-test --module commonjs --target ES2020 \
        --moduleResolution node --skipLibCheck --esModuleInterop \
        src/lib/model/*.ts src/lib/solvers/*.ts
node --test tests/solvers.test.mjs
```

The solvers are deliberately pure — no React, no store, no DOM — so a physics
regression is a two-line test rather than a browser session.

---

## `npm run views` — the screenshot harness

```bash
npm run views                # compare against the committed baseline
node tools/views.mjs --base  # re-baseline, only when the change was intended
```

Nine views: both floors in overview, plan, street, street at night, eye level,
the dimension overlay, and two mobile. Each is captured and hashed; the baseline
lives in `tools/views/baseline.json` and is committed. The PNGs are gitignored.

**A changed hash is a question, not a failure.** Open the PNG in `tools/views/`,
decide whether the change was intended, then re-baseline.

This exists because street view renders a *different set of geometry* from walk
and plan view — `interior` is false, so floors, walls, ceilings and furniture
unmount. Every check that existed before it measured the 2D UI or the ground
floor interior, so the elevation drifted, unseen, for three commits.

---

## `npm run uat` — the interaction harness

```bash
npm run uat                  # everything, seven viewports
node tools/uat.mjs --only=paint
node tools/uat.mjs --head    # keep the browser open on failure
```

Scenarios drive every control with a **real pointer event at real screen
coordinates** and then assert the **result against the store** — `speakers` went
from 0 to 1, not "a chip appeared". Nothing calls a store action directly,
because "the action works when called" is not the claim under test; "the control
reaches the action" is.

The store exposes a read-only seam at `window.__sitescape` for exactly this,
including a `project(x, y, z)` that returns where a world point lands on screen.
That is what lets the harness check the plan overlay's registration numerically
instead of by eye.

### Viewports

| tag | size | pointer | runs |
|---|---|---|---|
| desktop | 1400 × 900 | fine | everything |
| laptop | 1280 × 720 | fine | responsive + mobile-tagged |
| tabletP | 820 × 1180 | coarse | responsive + mobile-tagged |
| tabletL | 1180 × 820 | coarse | responsive + mobile-tagged |
| phone | 390 × 844 | coarse | responsive + mobile-tagged |
| phoneL | 844 × 390 | coarse | responsive + mobile-tagged |
| phoneSm | 320 × 568 | coarse | responsive + mobile-tagged |

### The layout pass

Beyond "does it work", every visible control is measured and must:

* be **fully on screen** — nothing runs off the side;
* clear the **minimum hit target** for the pointer in use — 36 px under a
  finger, 24 under a mouse. AS/ISO 9241-411 and the mobile platform guidelines
  land between 7 and 10 mm for a finger; 36 px is 9.5 mm at the nominal 96 dpi
  of a CSS pixel, at the top of that band without turning a dense professional
  tool into a phone app;
* not make the page scroll sideways;
* leave every sheet closable, with its close control on screen and the sheet no
  taller than the window.

That pass found the top-rail icons at 31 × 25 and the month select at 14 px
tall. Neither a screenshot diff nor a state assertion can see a hit target.

### Writing a scenario

```js
{ name: 'place-speaker', mobile: true, run: async (p, c, size) => {
    await openTools(p);
    await tap(p, '.tbItem', 0);                 // real mouse click at real px
    await tapCanvas(p, 0.5, 0.55);              // a point on the 3D canvas
    const s = await state(p);                   // read window.__sitescape
    c.is(s.counts.speakers, 1, 'the speaker was added');
    c.is(s.placing, null, 'and the tool disarmed');
  }},
```

Tag `mobile: true` to run at the small sizes, `responsive: true` to run at all
of them.

**`locator.click()` does not work here.** The canvas repaints continuously so
Playwright's actionability check never settles and every click times out. The
`tap()` helper scrolls the element into view, reads its bounding box, refuses if
it is off-screen after scrolling, and dispatches `page.mouse.click`.

Three of this suite's own early failures were the harness lying rather than the
app breaking: a locator matching several elements, a click on a control below
the fold of a scrolling sheet whose bounding box was off-screen, and a button
whose `aria-label` correctly changes once you are standing inside the building.
**A test that lies costs more than no test.**

---

## Redline — the drafting review

Runs in the app under the Report tab, and from the shell:

```bash
cat > r.mts <<'EOF'
const { runDraftingRules } = await import('./src/lib/review/draftingRules.ts');
for (const f of runDraftingRules())
  console.log(f.severity.padEnd(9), f.rule.padEnd(30), f.title);
EOF
npx tsx ./r.mts && rm r.mts
```

What it checks is in `HANDOVER.md` §5. The rule that makes it worth having is
the scale pass: every wall and every room against the line SK1 actually draws,
using `src/lib/model/sheetLines.ts` (generated by `tools/planwalls.py --ts`).

Two terminal equivalents, for when you want numbers rather than findings:

```bash
python3 tools/walldiff.py  samples/<sheet>.pdf --worst 12
python3 tools/planwalls.py samples/<sheet>.pdf --page 1 --ox 172.60 --oz 593.10
```

---

## What a full pre-commit run looks like

```bash
npm run check     # build + uat + views
npm test
# and Redline, if you touched anything under src/lib/model or src/lib/review
```

Do not ship a `major` or `critical` Redline finding unless it is written into
the source as a flagged `INFERENCE` with the reasoning. Search the codebase for
`INFERENCE` to see the two that currently exist and the standard they are held
to.
