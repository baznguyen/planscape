import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePack, PACKS, listJurisdictions } from '../dist-test/standards/registry.js';
import { ratio, ratioValue, formatRatio, toComparableTotalRSI, toRSI, toSIU, toMetres, RSI_PER_R } from '../dist-test/standards/units.js';
import { validate } from '../dist-test/validation/engine.js';
import { buildVeRegister } from '../dist-test/ve/engine.js';
import { LEVERS } from '../dist-test/ve/levers.js';
import { autoDesign } from '../dist-test/solvers/lighting.js';
import { ROOMS } from '../dist-test/model/building.js';

test('jurisdiction resolves by country + region + date', () => {
  const au = resolvePack('AU', 'NSW');
  assert.equal(au.jurisdiction.id, 'AU-NSW');
  assert.equal(resolvePack('GB', 'ENG').jurisdiction.id, 'GB-ENG');
  assert.equal(resolvePack('US').jurisdiction.id, 'US-IRC');
  assert.equal(resolvePack('ZZ'), null, 'unknown country must not silently fall back');
  // date awareness: before the pack is effective it must not resolve
  assert.equal(resolvePack('AU', 'NSW', new Date('2020-01-01')), null);
});

test('every pack requires a licensed certifier and carries the disclaimer', () => {
  for (const p of PACKS) {
    assert.equal(p.jurisdiction.certifierRequired, true, `${p.jurisdiction.id} must require a certifier`);
    assert.match(p.disclaimer, /not a certification/i);
    assert.ok(p.jurisdiction.certifierLabel.length > 10);
  }
});

test('dimensional predicates keep exact rationals (UK 1/20, not 5%)', () => {
  const gb = resolvePack('GB', 'ENG');
  assert.deepEqual(gb.minOpenableAreaRatio, ratio(1, 20));
  assert.equal(formatRatio(gb.minOpenableAreaRatio), '1/20 (5.0%)');
  const au = resolvePack('AU', 'NSW');
  assert.equal(formatRatio(au.minOpenableAreaRatio), '5%');
  // and they evaluate to the same number without being stored the same way
  assert.ok(Math.abs(ratioValue(gb.minOpenableAreaRatio) - ratioValue(au.minOpenableAreaRatio)) < 1e-9);
});

test('unit conversions are correct and R-basis is not silently coerced', () => {
  assert.ok(Math.abs(toRSI({ value: 20, unit: 'hft2F/Btu', basis: 'cavity' }) - 20 * RSI_PER_R) < 1e-9);
  assert.ok(Math.abs(toSIU({ value: 0.30, unit: 'Btu/hft2F' }) - 1.70348) < 1e-3);
  assert.ok(Math.abs(toMetres({ value: 7, unit: 'ft' }) - 2.1336) < 1e-4);
  // cavity R is NOT comparable to an assembly total-R -> must refuse
  assert.equal(toComparableTotalRSI({ value: 20, unit: 'hft2F/Btu', basis: 'cavity' }), null);
  assert.ok(toComparableTotalRSI({ value: 2.8, unit: 'm2K/W', basis: 'total' }) > 0);
});

test('acoustic descriptors are carried, never coerced across jurisdictions', () => {
  const d = PACKS.map(p => p.acoustic?.partyWall?.descriptor).filter(Boolean);
  assert.ok(d.includes('Rw+Ctr'), 'AU uses Rw+Ctr');
  assert.ok(d.includes('DnT,w+Ctr'), 'UK uses DnT,w+Ctr');
  assert.ok(d.includes('STC'), 'US uses STC');
  assert.equal(new Set(d).size, d.length, 'descriptors must remain distinct, not normalised');
});

test('validation produces clause-referenced findings', () => {
  const pack = resolvePack('AU', 'NSW');
  const lights = ROOMS.filter(r => !r.outdoor && !r.void).flatMap(r => autoDesign(r));
  const rep = validate(pack, lights);
  assert.ok(rep.findings.length > 20, `expected a full schedule, got ${rep.findings.length}`);
  for (const f of rep.findings) {
    assert.ok(f.clause && f.clause.length > 3, `finding ${f.checkId} has no clause reference`);
    assert.ok(['pass','fail','review','na'].includes(f.status));
  }
  assert.match(rep.disclaimer, /not a certification/i);
  // ceiling heights in this model are 2.72 / 2.59 so habitable height must pass
  const ceil = rep.findings.filter(f => f.checkId === 'ceil.hab');
  assert.ok(ceil.length > 0 && ceil.every(f => f.status === 'pass'), 'ceiling heights should pass');
});

test('same model, different jurisdiction, different requirement', () => {
  const lights = [];
  const au = validate(resolvePack('AU','NSW'), lights);
  const us = validate(resolvePack('US'), lights);
  const auLight = au.findings.find(f => f.checkId === 'light.nat' && f.roomName === 'Living');
  const usLight = us.findings.find(f => f.checkId === 'light.nat' && f.roomName === 'Living');
  assert.ok(auLight && usLight);
  assert.notEqual(auLight.required, usLight.required, 'AU 10% vs US 8% must differ');
  assert.match(auLight.clause, /NCC/);
  assert.match(usLight.clause, /IRC/);
});

test('VE register expires levers by phase and blocks unsafe ones', () => {
  const pack = resolvePack('AU','NSW');
  const rep = validate(pack, []);
  const design = buildVeRegister(850000, 'design', rep);
  const constr = buildVeRegister(850000, 'construction', rep);
  assert.ok(design.options.length > constr.options.length,
    'levers must expire as the project progresses');
  assert.ok(design.totalHi > design.totalLo && design.totalLo > 0);
  // guard: with no lights supplied the daylight/vent checks are marginal, so any
  // lever risking them must be excluded from the recommended set
  const glaz = design.options.find(o => o.id === 've.glazing');
  assert.ok(glaz, 'glazing lever must exist');
  if (glaz.blockedBy.length) assert.equal(glaz.recommended, false,
    'a lever that risks a failing check must not be recommended');
  assert.ok(design.basis.some(b => /not a certification/i.test(b)));
});

test('every VE lever declares trade-off, dependencies and resistance', () => {
  for (const l of LEVERS) {
    assert.ok(l.tradeOff.length > 10, `${l.id} needs a stated trade-off`);
    assert.ok(Array.isArray(l.dependencies), `${l.id} needs a dependency list`);
    assert.ok(['low','medium','high'].includes(l.customerResistance));
    assert.ok(l.savingPctHi >= l.savingPctLo);
  }
});
