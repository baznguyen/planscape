/**
 * Automated UAT.
 *
 * The screenshot harness in views.mjs answers "did the picture change". It
 * cannot answer "does the button work" — and a placement flow that silently
 * stopped adding anything to the model passed a green screenshot run, because
 * the picture was identical, which was exactly the bug.
 *
 * So this drives every control with a real pointer event and then asserts the
 * RESULT against the store. Two rules make it trustworthy:
 *
 *   1. Every action is a real click at real screen coordinates. Nothing calls a
 *      store action directly, because "the action works when called" is not the
 *      claim under test — "the control reaches the action" is.
 *   2. Every scenario asserts state, not appearance. `placing` cleared and
 *      `speakers` went from 0 to 1, not "a chip appeared".
 *
 * Playwright's own locator.click() is unusable here: the 3D canvas repaints
 * continuously, so its actionability check never settles and every click times
 * out. Hence tap(), which reads the box and dispatches a real mouse click.
 *
 *   node tools/uat.mjs              run everything at both sizes
 *   node tools/uat.mjs --only=paint run scenarios whose name matches
 *   node tools/uat.mjs --head       keep the browser open on failure
 */
import { chromium } from 'playwright';

/**
 * The server to drive. Defaults to :3000, which is what `npm run dev` and
 * `npm start` serve — the old default of :3111 was a scratch port from one
 * machine, and it meant the harness could not find a server that was plainly
 * running. Override with SITESCAPE_URL to point at a preview deployment.
 */
const URL = process.env.SITESCAPE_URL ?? 'http://localhost:3000/';
const only = (process.argv.find(a => a.startsWith('--only=')) ?? '').split('=')[1];

/* ------------------------------------------------------------------ *
 * harness
 * ------------------------------------------------------------------ */
const state = p => p.evaluate(() => window.__sitescape.get());

async function tap(p, sel, nth = 0) {
  // nth applies whether a string or a locator was handed in — a locator that
  // resolves to several elements is Playwright's "strict mode violation", and
  // silently taking .first() would hide a real ambiguity.
  let loc = typeof sel === 'string' ? p.locator(sel) : sel;
  if ((await loc.count()) > 1 || nth > 0) loc = loc.nth(nth);
  // The sheets scroll. An element below the fold still has a bounding box —
  // one whose coordinates are off-screen — so clicking it lands on whatever
  // happens to be at those pixels instead. Scroll first, then read the box.
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(120);
  const box = await loc.boundingBox({ timeout: 8000 });
  if (!box) throw new Error(`not visible: ${typeof sel === 'string' ? sel : 'locator'}[${nth}]`);
  const vp = p.viewportSize();
  if (box.y < 0 || box.y > vp.height || box.x < 0 || box.x > vp.width) {
    throw new Error(`off-screen after scroll: ${typeof sel === 'string' ? sel : 'locator'}[${nth}]`);
  }
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(340);
}
/** Tap a point on the 3D canvas, in fractions of the viewport. */
async function tapCanvas(p, fx, fy) {
  const vp = p.viewportSize();
  await p.mouse.click(Math.round(vp.width * fx), Math.round(vp.height * fy));
  await p.waitForTimeout(420);
}
const seg = (p, i) => p.locator('.top .seg.ico').nth(i).locator('button');
const openTools = async p => {
  if ((await state(p)).drawer !== 'tools') await tap(p, '.toolTab');
  await p.waitForTimeout(350);
};
const closeSheet = async p => {
  if ((await state(p)).drawer !== null) await tap(p, '.sheet.open .sheetX');
  await p.waitForTimeout(300);
};
const tab = async (p, name) => {
  const b = p.locator('.sheet.open .tbTabs button', { hasText: name }).first();
  await tap(p, b);
  await p.waitForTimeout(350);
};


/* ------------------------------------------------------------------ *
 * layout audit
 *
 * "Does the button work" is not the whole of UAT. A control that works
 * perfectly and sits four pixels off the right edge of a phone, or that renders
 * 14 px tall under a thumb, is still broken — and neither a screenshot diff nor
 * a state assertion will say so, because the state is correct and the picture
 * is the same picture that shipped last time.
 *
 * So this pass measures the interface itself, at every size, and asserts the
 * things a designer would check by hand: nothing runs off the edge, nothing is
 * too small to hit, and every panel can be closed by the control that closes it.
 * ------------------------------------------------------------------ */
const audit = p => p.evaluate(() => {
  const seen = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const name = (el) =>
    el.getAttribute('aria-label') || (el.className && String(el.className).split(' ')[0]) ||
    (el.textContent || '').trim().slice(0, 20) || el.tagName.toLowerCase();
  const controls = [];
  for (const el of document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')) {
    if (!seen(el)) continue;
    if (el.type === 'range' || el.type === 'color' || el.type === 'file') continue;
    const r = el.getBoundingClientRect();
    controls.push({ id: name(el), x: Math.round(r.x), y: Math.round(r.y),
                    w: Math.round(r.width), h: Math.round(r.height) });
  }
  return {
    controls,
    scrollW: document.documentElement.scrollWidth,
    W: window.innerWidth, H: window.innerHeight,
  };
});

/**
 * Minimum hit target. AS/ISO 9241-411 and the mobile platform guidelines all
 * land between 7 and 10 mm for a finger; at the nominal 96 dpi of a CSS pixel
 * that is 26 to 38 px, so 36 sits at the top of the band without turning a
 * dense professional tool into a phone app. A mouse is far more precise, so a
 * fine pointer gets 24 — enough to catch a control that has collapsed, not
 * enough to demand phone-sized chrome on a 1400 px window.
 */
const minTap = size => (size.touch ? 36 : 24);

/** Every control that is on screen must be fully on screen, and big enough. */
function checkLayout(c, a, size, where) {
  const MIN = minTap(size);
  const off = a.controls.filter(k => k.x < -1 || k.x + k.w > a.W + 1);
  c.is(off.map(k => `${k.id}@${k.x}+${k.w}`), [], `${where}: nothing runs off the side of a ${a.W} px viewport`);
  const small = a.controls.filter(k => Math.min(k.w, k.h) < MIN);
  c.is(small.map(k => `${k.id}=${k.w}x${k.h}`), [], `${where}: every control is at least ${MIN} px on its short side`);
  c.is(a.scrollW <= a.W + 1, true, `${where}: the page does not scroll sideways (${a.scrollW} vs ${a.W})`);
}

class Check {
  constructor(name) { this.name = name; this.fails = []; }
  is(got, want, what) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) this.fails.push(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  ok(cond, what) { if (!cond) this.fails.push(what); }
  gt(got, than, what) { if (!(got > than)) this.fails.push(`${what}: ${got} is not > ${than}`); }
}

/* ------------------------------------------------------------------ *
 * scenarios
 * ------------------------------------------------------------------ */
const SCENARIOS = [

  { name: 'boot', mobile: true, run: async (p, c) => {
    const s = await state(p);
    c.is(s.view, 'walk', 'opens in walk view');
    c.is(s.floor, 0, 'opens on the ground floor');
    c.is(s.drawer, null, 'opens with no sheet');
    c.gt(s.thermalRooms, 20, 'thermal settled on load');
    c.gt(s.counts.aps, 0, 'seeded access points present');
  }},

  { name: 'views', mobile: true, run: async (p, c) => {
    await tap(p, seg(p, 0), 1);
    c.is((await state(p)).view, 'plan', 'plan view');
    await tap(p, seg(p, 0), 2);
    c.is((await state(p)).view, 'street', 'street view');
    const s = await state(p);
    c.is(s.eyeLevel, false, 'street view clears eye level');
    await tap(p, seg(p, 0), 0);
    c.is((await state(p)).view, 'walk', 'back to walk');
  }},

  { name: 'floors', mobile: true, run: async (p, c) => {
    await tap(p, seg(p, 1), 1);
    c.is((await state(p)).floor, 1, 'first floor');
    await tap(p, seg(p, 1), 0);
    c.is((await state(p)).floor, 0, 'ground floor');
  }},

  { name: 'roof-and-reset', run: async (p, c) => {
    const before = (await state(p)).showRoof;
    await tap(p, seg(p, 2), 0);
    c.is((await state(p)).showRoof, !before, 'roof toggles');
    await tap(p, seg(p, 2), 0);
    await tap(p, seg(p, 2), 1);
    c.ok(true, 'reset does not throw');
  }},

  { name: 'ambience', mobile: true, run: async (p, c) => {
    for (const i of [0, 2, 5]) {
      await tap(p, seg(p, 3), i);
      c.is((await state(p)).ambience, i, `ambience ${i} applies`);
    }
  }},

  { name: 'overlays', mobile: true, run: async (p, c) => {
    await tap(p, '.railToggle');
    const n = await p.locator('.sheet.open .tileGrid').first().locator('.tile').count();
    c.is(n, 9, 'nine overlay toggles');
    for (let i = 0; i < n; i++) {
      const tile = p.locator('.sheet.open .tileGrid').first().locator('.tile').nth(i);
      const label = (await tile.innerText()).trim().replace(/\s+/g, ' ');
      await tap(p, tile);
      const on = Object.values((await state(p)).overlays).filter(Boolean).length;
      c.is(on, i + 1, `"${label}" switches on`);
    }
    for (let i = 0; i < n; i++) await tap(p, p.locator('.sheet.open .tileGrid').first().locator('.tile').nth(i));
    c.is(Object.values((await state(p)).overlays).filter(Boolean).length, 0, 'all switch off again');
    await closeSheet(p);
  }},

  { name: 'openings', run: async (p, c) => {
    await tap(p, '.railToggle');
    const g = p.locator('.sheet.open .tileGrid').nth(1);
    await tap(p, g.locator('.tile').nth(0));
    /**
     * Assert against the model, not against a number I once observed.
     *
     * This was `> 40`, and it started failing the day window generation was
     * rewritten to place one window per room instead of one every 3.2 m — a
     * change that made the model better and left 38 openable things instead of
     * 41. A hard-coded count does not test "open all opens everything", it
     * tests "the building has not changed", which is not the claim.
     */
    const opened = (await state(p)).openCount;
    c.is(opened, (await state(p)).openable, 'open all opens every openable thing');
    c.gt(opened, 10, 'and there are openings to open');
    await tap(p, g.locator('.tile').nth(1));
    const shut = await state(p);
    c.is(shut.openCount, shut.alwaysOpen,
      'close all closes everything that has a leaf to close');
    await tap(p, g.locator('.tile').nth(2));
    c.is((await state(p)).hvacOn, true, 'air conditioning toggles on');
    await tap(p, g.locator('.tile').nth(2));
    c.is((await state(p)).hvacOn, false, 'and off');
    await closeSheet(p);
  }},

  { name: 'room-selection', run: async (p, c) => {
    await tapCanvas(p, 0.5, 0.55);
    const s = await state(p);
    c.ok(s.selectedRoom !== null, 'tapping the model selects a room');
  }},

  /* ---- the one the user reported ---- */
  { name: 'place-speaker', mobile: true, run: async (p, c) => {
    const before = (await state(p)).counts;
    await openTools(p);
    await tab(p, 'Add');
    // arm the first audio tile
    await tap(p, '.sheet.open .tbItem', 0);
    const armed = await state(p);
    c.ok(armed.placing !== null, 'tapping a tile arms it');
    c.is(armed.drawer, null, 'arming closes the sheet so the model is tappable');

    await tapCanvas(p, 0.5, 0.55);
    const after = await state(p);
    c.is(after.placeError, null, `no placement error (${after.placeError})`);
    c.is(after.placing, null, 'placing cleared after the tap');
    c.gt(after.counts.speakers, before.speakers, 'A SPEAKER WAS ADDED');
  }},

  { name: 'place-downlight', mobile: true, run: async (p, c) => {
    const before = (await state(p)).counts;
    await openTools(p);
    await tab(p, 'Add');
    await tap(p, '.sheet.open .tbItem', 5);          // first lighting tile
    c.ok((await state(p)).placing !== null, 'downlight arms');
    await tapCanvas(p, 0.45, 0.58);
    const after = await state(p);
    c.is(after.placeError, null, `no placement error (${after.placeError})`);
    c.gt(after.counts.lights, before.lights, 'A DOWNLIGHT WAS ADDED');
  }},

  { name: 'place-heater', mobile: true, run: async (p, c) => {
    const before = (await state(p)).counts;
    await openTools(p);
    await tab(p, 'Add');
    await tap(p, '.sheet.open .tbItem', 10);         // first climate tile
    await tapCanvas(p, 0.5, 0.55);
    const after = await state(p);
    c.is(after.placeError, null, `no placement error (${after.placeError})`);
    c.gt(after.counts.items, before.items, 'A HEATER WAS ADDED');
  }},

  { name: 'place-ap', mobile: true, run: async (p, c) => {
    const before = (await state(p)).counts;
    await openTools(p);
    await tab(p, 'Add');
    await tap(p, '.sheet.open .tbItem', 13);         // first network tile
    await tapCanvas(p, 0.5, 0.55);
    const after = await state(p);
    c.is(after.placeError, null, `no placement error (${after.placeError})`);
    c.gt(after.counts.aps, before.aps, 'AN ACCESS POINT WAS ADDED');
  }},

  { name: 'placed-list-and-clear', run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Add');
    await tap(p, '.sheet.open .tbItem', 0);
    await tapCanvas(p, 0.5, 0.55);
    c.gt((await state(p)).counts.speakers, 0, 'the speaker placed before checking the list');
    await openTools(p);
    await tab(p, 'Add');
    const rows = await p.locator('.sheet.open .rowbtn').count();
    c.gt(rows, 0, 'placed items appear in the list');
    const clear = p.locator('.sheet.open .btn', { hasText: 'Clear all' }).first();
    c.ok(await clear.count() > 0, 'a clear-all control exists');
    await tap(p, clear);
    const s = await state(p);
    c.is(s.counts.speakers, 0, 'clear all removes the speakers');
    c.is(s.counts.items, 0, 'clear all removes the items');
    await closeSheet(p);
  }},

  { name: 'place-outside-refuses', run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Add');
    await tap(p, '.sheet.open .tbItem', 0);
    await tapCanvas(p, 0.06, 0.9);                  // the lawn
    const s = await state(p);
    c.ok(s.placeError !== null || s.counts.speakers === 0,
      'a tap off the slab is refused rather than filed into a random room');
    await openTools(p);
    const cancel = p.locator('.sheet.open .lnk');
    if (await cancel.count()) await tap(p, cancel.first());
    await closeSheet(p);
  }},

  { name: 'paint-scheme', mobile: true, run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Paint');
    const n = await p.locator('.sheet.open .scheme').count();
    c.gt(n, 4, 'preset schemes are listed');
    await tap(p, '.sheet.open .scheme', 1);
    const s = await state(p);
    c.gt(s.counts.paints, 0, 'a scheme applies paint');
    c.ok(s.palette !== null, 'the applied scheme is recorded');
    await closeSheet(p);
  }},

  { name: 'paint-systems-and-search', run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Paint');
    const sys = p.locator('.sheet.open .tbTabs.sm.wrap').nth(1).locator('button');
    const count = await sys.count();
    c.gt(count, 5, 'every colour system is offered');
    for (let i = 0; i < count; i++) {
      await tap(p, sys.nth(i));
      const swatches = await p.locator('.sheet.open .swatch.tall').count();
      const name = (await sys.nth(i).innerText()).trim();
      c.gt(swatches, 0, `${name} renders swatches`);
    }
    await p.locator('.sheet.open .txt.find').fill('lrv>80');
    await p.waitForTimeout(400);
    c.gt(await p.locator('.sheet.open .swatch.tall').count(), 0, 'lrv search returns results');
    await p.locator('.sheet.open .txt.find').fill('');
    await closeSheet(p);
  }},

  { name: 'paint-custom-colour', run: async (p, c) => {
    const before = (await state(p)).counts.paints;
    await openTools(p);
    await tab(p, 'Paint');
    const dis = await p.locator('.sheet.open .btn', { hasText: 'Apply custom' }).first()
      .getAttribute('disabled').catch(() => null);
    c.is(dis, null, 'custom colour is applicable without hunting for a room first');
    await p.locator('.sheet.open .cust .txt').first().fill('#334455');
    await p.waitForTimeout(300);
    const btn = p.locator('.sheet.open .btn', { hasText: 'Apply custom' }).first();
    c.ok(await btn.count() > 0, 'the custom apply button appears');
    await tap(p, btn);
    c.gt((await state(p)).counts.paints, before, 'a custom colour applies');
    await closeSheet(p);
  }},

  { name: 'paint-strip', run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Paint');
    await tap(p, '.sheet.open .scheme', 0);          // apply something to strip
    c.gt((await state(p)).counts.paints, 0, 'paint applied first');
    const strip = p.locator('.sheet.open .btn', { hasText: 'Strip all paint' }).first();
    if (await strip.count()) {
      await tap(p, strip);
      c.is((await state(p)).counts.paints, 0, 'strip removes every assignment');
    } else c.fails.push('no strip-all control while paint is applied');
    await closeSheet(p);
  }},

  { name: 'finishes', run: async (p, c) => {
    await tapCanvas(p, 0.5, 0.55);                  // select a room first
    await openTools(p);
    await tab(p, 'Finish');
    const body = (await p.locator('.sheet.open .tbBody').innerText()).trim();
    c.ok(!/Tap a room first/i.test(body), 'a selected room reaches the finishes tab');
    const sw = p.locator('.sheet.open .swatch');
    c.gt(await sw.count(), 0, 'finishes are offered');
    await tap(p, sw.first());
    c.ok(true, 'applying a finish does not throw');
    await closeSheet(p);
  }},

  { name: 'review', mobile: true, run: async (p, c) => {
    await openTools(p);
    await tab(p, 'Check');
    const txt = await p.locator('.sheet.open .tbBody').innerText();
    c.ok(/\d+(\.\d+)?\s*\/\s*10/.test(txt), 'the review reports a score');
    c.ok(/NCC|AS\s?\d|Housing Provisions|drawing/i.test(txt), 'findings cite an authority');
    await closeSheet(p);
  }},

  { name: 'walkthrough', run: async (p, c) => {
    await tap(p, '.walkPad button[aria-label="Stand inside at eye level"]');
    c.is((await state(p)).eyeLevel, true, 'eye level engages');
    const fwd = p.locator('.walkPad button[aria-label="Forward"]');
    const box = await fwd.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(1400); await p.mouse.up();
    await p.waitForTimeout(300);
    c.ok(true, 'holding forward does not throw');
    // the label flips once you are inside, which is correct behaviour
    await tap(p, '.walkPad button[aria-label="Back to overview"]');
    c.is((await state(p)).eyeLevel, false, 'eye level disengages');
  }},

  { name: 'timelapse', run: async (p, c) => {
    const t0 = (await state(p)).minutes;
    await tap(p, '.sun .play');
    c.is((await state(p)).playing, true, 'play starts');
    await p.waitForTimeout(2200);
    const t1 = (await state(p)).minutes;
    c.ok(t1 !== t0, `the clock advances (${t0} -> ${t1})`);
    await tap(p, '.sun .play');
    c.is((await state(p)).playing, false, 'pause stops');
    await p.locator('.sun select').selectOption('6');
    await p.waitForTimeout(700);
    c.is((await state(p)).month, 6, 'month changes');
  }},

  { name: 'sheets-exclusive', mobile: true, run: async (p, c) => {
    await tap(p, '.toolTab');
    c.is((await state(p)).drawer, 'tools', 'tools sheet opens');
    c.is(await p.locator('.railToggle').count(), 0, 'the other launcher stands down');
    await tap(p, '.sheet.open .sheetX');
    c.is((await state(p)).drawer, null, 'close button closes it');
    await tap(p, '.railToggle');
    c.is((await state(p)).drawer, 'rail', 'layers sheet opens');
    c.is(await p.locator('.toolTab').count(), 0, 'and the other launcher stands down');
    await tap(p, '.sheet.open .sheetX');
  }},

  { name: 'labels-present', mobile: true, run: async (p, c) => {
    const caps = await p.locator('.segCap').allInnerTexts();
    c.gt(caps.length, 3, 'the header groups are captioned');
    await openTools(p);
    await tab(p, 'Add');
    const tiles = p.locator('.sheet.open .tbItem');
    const n = await tiles.count();
    let unlabelled = 0;
    for (let i = 0; i < n; i++) {
      const t = (await tiles.nth(i).innerText()).trim();
      if (!t) unlabelled++;
    }
    c.is(unlabelled, 0, `every asset tile carries a name (${n} tiles)`);
    await closeSheet(p);
  }},

  /* ---------------- responsive / UI-UX -------------------------- */
  { name: 'layout: the overview fits its viewport', responsive: true,
    run: async (p, c, size) => {
      checkLayout(c, await audit(p), size, 'overview');
    }},

  { name: 'layout: every sheet fits and can be closed', responsive: true,
    run: async (p, c, size) => {
      for (const open of [
        { what: 'tools', go: async () => tap(p, '.toolTab') },
        { what: 'rail', go: async () => tap(p, '.railToggle') },
      ]) {
        await closeSheet(p);
        await open.go();
        await p.waitForTimeout(400);
        c.is((await state(p)).drawer !== null, true, `${open.what}: opens`);
        const a = await audit(p);
        checkLayout(c, a, size, open.what);
        // A sheet you cannot dismiss is a trap, and the close control moved to
        // the left of the head — so assert it is on screen, not merely present.
        const x = p.locator('.sheet.open .sheetX');
        const box = await x.boundingBox().catch(() => null);
        c.is(!!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width, true,
          `${open.what}: the close control is on screen`);
        const sheet = await p.locator('.sheet.open').boundingBox().catch(() => null);
        c.is(!!sheet && sheet.height <= size.height + 1, true,
          `${open.what}: the sheet is no taller than the window`);
        await closeSheet(p);
        c.is((await state(p)).drawer, null, `${open.what}: closes`);
      }
    }},

  { name: 'layout: the toolbox tabs all fit', responsive: true,
    run: async (p, c, size) => {
      await openTools(p);
      for (const t of ['Add', 'Paint', 'Report']) {
        await tab(p, t).catch(() => {});
        await p.waitForTimeout(250);
        checkLayout(c, await audit(p), size, `tools/${t}`);
      }
      await closeSheet(p);
    }},

  { name: 'layout: the canvas owns the window', responsive: true,
    run: async (p, c, size) => {
      const box = await p.locator('canvas').first().boundingBox();
      c.is(!!box && Math.abs(box.width - size.width) < 2, true,
        `canvas spans the viewport width (${box && Math.round(box.width)} of ${size.width})`);
      c.is(!!box && box.height > size.height * 0.6, true,
        'canvas takes most of the height');
    }},
];

/* ------------------------------------------------------------------ *
 * runner
 * ------------------------------------------------------------------ */
const SIZES = [
  { tag: 'desktop', width: 1400, height: 900, full: true },
  { tag: 'laptop', width: 1280, height: 720 },
  { tag: 'tabletP', width: 820, height: 1180, touch: true },
  { tag: 'tabletL', width: 1180, height: 820, touch: true },
  { tag: 'phone', width: 390, height: 844, touch: true },
  { tag: 'phoneL', width: 844, height: 390, touch: true },
  { tag: 'phoneSm', width: 320, height: 568, touch: true },
];

const run = async () => {
  const browser = await chromium.launch({
    /**
     * Let Playwright find its own browser. This used to hard-code
     * /opt/pw-browsers/chromium, which is a path that exists on exactly one
     * machine — so both harnesses failed on a fresh clone with an
     * executable-not-found error that looks like a Playwright bug rather than a
     * checked-in absolute path. `npx playwright install chromium` puts it where
     * the library expects; PW_CHROMIUM is there for sandboxes that pre-stage one.
     */
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  });
  let total = 0, failed = 0;
  const report = [];

  for (const size of SIZES) {
    for (const sc of SCENARIOS) {
      if (only && !sc.name.includes(only)) continue;
      if (!size.full && !(sc.mobile || sc.responsive)) continue;
      const page = await browser.newPage({
        viewport: { width: size.width, height: size.height },
        hasTouch: !!size.touch, isMobile: !!size.touch && size.width < 900,
        deviceScaleFactor: size.touch ? 2 : 1,
      });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
      page.on('console', m => {
        if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text());
      });
      const c = new Check(sc.name);
      try {
        await page.goto(URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await sc.run(page, c, size);
      } catch (e) {
        c.fails.push(`threw: ${String(e).split('\n')[0]}`);
      }
      for (const e of errs) c.fails.push(`console: ${e}`);
      total++;
      const bad = c.fails.length > 0;
      if (bad) {
        failed++;
        await page.screenshot({ path: `/tmp/uat-fail-${size.tag}-${sc.name}.png` });
      }
      const line = `${bad ? 'FAIL' : 'pass'}  ${size.tag.padEnd(7)} ${sc.name}`;
      console.log(line);
      for (const f of c.fails) console.log(`        · ${f}`);
      report.push({ size: size.tag, name: sc.name, fails: c.fails });
      await page.close();
    }
  }
  await browser.close();
  console.log(`\n${total - failed}/${total} scenarios passed`);
  if (failed) { console.log('screenshots of failures in /tmp/uat-fail-*.png'); process.exit(1); }
};

run().catch(e => { console.error(e); process.exit(1); });
