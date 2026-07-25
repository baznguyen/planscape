import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessParcel, resolvePlanning } from '../dist-test/planning/registry.js';
import { basixObligation } from '../dist-test/planning/nsw.js';
import { routeVariation, notifyList, nextRef } from '../dist-test/collab/routing.js';
import { resolveFinish, paintQuantity } from '../dist-test/collab/finishes.js';

const CAMPBELL = { country:'AU', region:'NSW', lga:'Fairfield', areaM2:609, frontageM:13.411,
  zoneCode:'R2', existingDwellingGfaM2:284.47, overlays:[] };

test('NSW: 609 m2 R2 lot supports a granny flat as complying development', () => {
  const { pack, entitlements } = assessParcel(CAMPBELL);
  assert.equal(pack.system, 'binding-zoning');
  const sec = entitlements.find(e => e.devType === 'secondary');
  assert.equal(sec.likelihood, 'as-of-right');
  assert.match(sec.pathway, /CDC/);
  const lot = sec.controls.find(c => c.key === 'minLot');
  assert.equal(lot.pass, true, '609 m2 exceeds the 450 m2 CDC minimum');
  assert.equal(sec.controls.find(c => c.key === 'maxGfa').required, 60);
  // the rule stack must show the SEPP overriding the council table
  assert.ok(sec.stack.some(s => s.level === 'state' && /SEPP \(Housing\)/i.test(s.instrument)));
});

test('NSW: dual occupancy permitted in R2 since the 2024 reform', () => {
  const { entitlements } = assessParcel(CAMPBELL);
  const dual = entitlements.find(e => e.devType === 'dual');
  assert.equal(dual.likelihood, 'permitted-with-consent');
  assert.equal(dual.blockers.length, 0);
  assert.ok(dual.stack.some(s => /Dual Occupancies\) 2024/.test(s.instrument)));
  // and unlike a granny flat, it CAN be subdivided
  assert.match(dual.controls.find(c => c.key === 'subdiv').note, /Permitted/);
});

test('NSW: a small lot loses the CDC pathway and dual occupancy entirely', () => {
  const small = { ...CAMPBELL, areaM2: 380 };
  const { entitlements } = assessParcel(small);
  assert.equal(entitlements.find(e => e.devType === 'secondary').likelihood, 'permitted-with-consent');
  assert.equal(entitlements.find(e => e.devType === 'dual').likelihood, 'prohibited');
});

test('NSW: overlays remove the complying-development pathway', () => {
  const { entitlements } = assessParcel({ ...CAMPBELL, overlays:['Heritage conservation area'] });
  const sec = entitlements.find(e => e.devType === 'secondary');
  assert.equal(sec.likelihood, 'permitted-with-consent');
  assert.ok(sec.stack.some(s => s.level === 'overlay'));
});

test('England is discretionary — no designation grants a dwelling', () => {
  const eng = resolvePlanning('GB','ENG');
  assert.equal(eng.system, 'discretionary');
  assert.equal(eng.parcelBinding, false);
  const { entitlements } = assessParcel({ country:'GB', region:'ENG', areaM2:400, overlays:[] });
  const annexe = entitlements.find(e => e.devType === 'secondary');
  assert.equal(annexe.likelihood, 'as-of-right');
  assert.match(annexe.pathway, /Permitted Development/);
  // but it is NOT a separate dwelling — that is the structural difference
  assert.match(annexe.controls.find(c => c.key === 'use').note, /ancillary/i);
  const sep = entitlements.find(e => e.devType === 'subdivide');
  assert.equal(sep.likelihood, 'discretionary', 'England cannot return a boolean permission');
});

test('England: an Article 4 direction withdraws permitted development', () => {
  const { entitlements } = assessParcel({ country:'GB', region:'ENG', areaM2:400, overlays:['Article 4 Direction'] });
  assert.equal(entitlements.find(e => e.devType === 'secondary').likelihood, 'discretionary');
});

test('BASIX obligation is recorded with its data gap stated', () => {
  const b = basixObligation(CAMPBELL, 80000);
  assert.equal(b.triggered, 'yes', 'over the A$50,000 alteration threshold');
  assert.match(b.thermalTarget, /7 stars/);
  assert.match(b.dataGap, /NO BASIX API/);
  assert.equal(basixObligation(CAMPBELL, 20000).triggered, 'no');
});

test('variations route to the correct trade and notify second-order trades', () => {
  assert.equal(routeVariation('lighting'), 'ELECTRICIAN');
  assert.equal(routeVariation('tiling'), 'TILER');
  assert.equal(routeVariation('structural'), 'ENGINEER');
  assert.equal(routeVariation('something-unmapped'), 'BUILDER');
  const n = notifyList('lighting');
  assert.ok(n.includes('ELECTRICIAN') && n.includes('BUILDER') && n.includes('PAINTER'),
    'a lighting change drags the painter through ceiling make-good');
  assert.equal(nextRef(7), 'VAR-007');
});

test('finish resolution: most specific scope wins', () => {
  const A = [
    { id:'a1', finishId:'white',   kind:'WALL', scope:'house' },
    { id:'a2', finishId:'sage',    kind:'WALL', scope:'room',    targetId:'g_liv' },
    { id:'a3', finishId:'charcoal',kind:'WALL', scope:'surface', targetId:'gw_n' },
  ];
  assert.equal(resolveFinish(A,'WALL',{ roomId:'g_kit' }).finishId, 'white');
  assert.equal(resolveFinish(A,'WALL',{ roomId:'g_liv' }).finishId, 'sage');
  assert.equal(resolveFinish(A,'WALL',{ roomId:'g_liv', surfaceId:'gw_n' }).finishId, 'charcoal');
  const q = paintQuantity(48);
  assert.equal(q.coats, 2);
  assert.ok(q.litres > 6.8 && q.litres < 7.0, `48 m2 x2 coats at 14 m2/L = ${q.litres} L`);
  assert.equal(q.tins4L, 2);
});
