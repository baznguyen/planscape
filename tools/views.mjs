/**
 * Visual regression: the renders must not drift.
 *
 * The reason this file exists: the interior got a lot of attention while the
 * street view quietly broke. Face() drew storey 0 up to FCL 2.740 and storey 1
 * from FFL 3.040, and nothing at all drew the 300 mm of floor structure between
 * them — so the elevation had an open slot running the length of the house and
 * nobody noticed, because every check that existed measured the 2D UI or the
 * ground floor interior.
 *
 * A model is not verified by checking the thing you just changed. It is
 * verified by looking at all of it, every time.
 *
 *   node tools/views.mjs                 capture the standard views
 *   node tools/views.mjs --base          re-baseline (only when a change is intended)
 *
 * Requires a running server (npm start) and `npx playwright install chromium`.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * The server to drive. Defaults to :3000, which is what `npm run dev` and
 * `npm start` serve — the old default of :3111 was a scratch port from one
 * machine, and it meant the harness could not find a server that was plainly
 * running. Override with SITESCAPE_URL to point at a preview deployment.
 */
const URL = process.env.SITESCAPE_URL ?? 'http://localhost:3000/';
const OUT = 'tools/views';
const BASE = 'tools/views/baseline.json';
const rebase = process.argv.includes('--base');

/** Every view a change could plausibly break, not just the one being worked on. */
const VIEWS = [
  { id: 'overview-ground', w: 1400, h: 900, steps: [] },
  { id: 'overview-first', w: 1400, h: 900, steps: [['floor', 1]] },
  { id: 'plan', w: 1400, h: 900, steps: [['view', 1]] },
  { id: 'street', w: 1400, h: 900, steps: [['view', 2]] },
  { id: 'street-night', w: 1400, h: 900, steps: [['view', 2], ['amb', 5]] },
  { id: 'eye-level', w: 1400, h: 900, steps: [['eye']] },
  { id: 'dims', w: 1400, h: 900, steps: [['overlay', 1]] },
  { id: 'mobile-home', w: 390, h: 844, steps: [] },
  { id: 'mobile-street', w: 390, h: 844, steps: [['view', 2]] },
];

const clickAt = async (p, loc) => {
  const b = await loc.boundingBox();
  if (!b) throw new Error('control not visible');
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
  const now = {};
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
  let failures = 0;

  for (const v of VIEWS) {
    const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3200);

    for (const [kind, n] of v.steps) {
      const grp = page.locator('.top .seg.ico');
      if (kind === 'view') await clickAt(page, grp.nth(0).locator('button').nth(n));
      if (kind === 'floor') await clickAt(page, grp.nth(1).locator('button').nth(n));
      if (kind === 'amb') await clickAt(page, grp.nth(3).locator('button').nth(n));
      if (kind === 'eye') await clickAt(page, page.locator('.walkPad button[aria-label="Stand inside at eye level"]'));
      if (kind === 'overlay') {
        await clickAt(page, page.locator('.railToggle'));
        await page.waitForTimeout(600);
        await clickAt(page, page.locator('.sheet.open .tile').nth(n));
        await page.waitForTimeout(400);
        await clickAt(page, page.locator('.sheet.open .sheetX'));
      }
      await page.waitForTimeout(1400);
    }
    await page.waitForTimeout(900);

    const buf = await page.screenshot({ path: `${OUT}/${v.id}.png` });
    const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
    now[v.id] = hash;

    const changed = base[v.id] && base[v.id] !== hash;
    const mark = !base[v.id] ? 'NEW ' : changed ? 'DIFF' : 'same';
    if (changed) failures++;
    console.log(`${mark}  ${v.id.padEnd(16)} ${hash}${errors.length ? '  ERRORS: ' + errors[0] : ''}`);
    if (errors.length) failures++;
    await page.close();
  }
  await browser.close();

  if (rebase || !existsSync(BASE)) {
    writeFileSync(BASE, JSON.stringify(now, null, 2) + '\n');
    console.log(`\nbaseline written · ${Object.keys(now).length} views`);
    return;
  }
  console.log(failures
    ? `\n${failures} view(s) changed or errored — open tools/views/*.png and confirm every one is intended, then re-run with --base`
    : '\nall views unchanged');
};

run().catch(e => { console.error(e); process.exit(1); });
