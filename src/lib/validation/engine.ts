/**
 * Build validation. Runs a jurisdiction's checks against the building model.
 * Output is a clause-referenced schedule — research finding: QSs and certifiers
 * will not accept a plain-English opinion without the clause reference.
 */
import { ROOMS, ALL_OPENINGS, roomArea, roomHeight, GEOM, type Room } from '../model/building';
import type { StandardsPack } from '../standards/types';
import { ratioValue, formatRatio } from '../standards/units';
import { openArea } from '../solvers/thermal';
import { roomIlluminance } from '../solvers/lighting';
import type { Light } from '../solvers/lighting';

export type Status = 'pass' | 'fail' | 'review' | 'na';
export interface Finding {
  checkId: string; title: string; clause: string; status: Status;
  discipline: string; severity: string;
  roomId?: string; roomName?: string;
  measured?: string; required?: string; note?: string;
}
export interface ValidationReport {
  jurisdiction: string; generatedAt: string;
  findings: Finding[];
  summary: { pass: number; fail: number; review: number; blockers: number };
  disclaimer: string;
}
const habitable = (r: Room) => ['living','kitchen','bed','study'].includes(r.use);

export function validate(pack: StandardsPack, lights: Light[] = []): ValidationReport {
  const F: Finding[] = [];
  const push = (f: Finding) => F.push(f);
  const def = (id: string) => pack.checks.find(c => c.id === id);

  for (const r of ROOMS) {
    if (r.outdoor || r.void) continue;
    const A = roomArea(r), H = roomHeight(r);
    const ext = ALL_OPENINGS.filter(o => (o.a === r.id || o.b === r.id) && (o.a === null || o.b === null));
    const glazed = ext.filter(o => o.kind === 'window' || o.kind === 'slider');

    // ---- ceiling height ----
    const dHab = def('ceil.hab'), dNon = def('ceil.nonhab');
    if (habitable(r) && dHab) {
      const need = pack.minCeilingHeight.habitable;
      push({ checkId:dHab.id, title:dHab.title, clause:dHab.clause, discipline:dHab.discipline,
        severity:dHab.severity, roomId:r.id, roomName:r.name,
        status: H >= need ? 'pass' : 'fail',
        measured:`${H.toFixed(2)} m`, required:`≥ ${need.toFixed(2)} m` });
    } else if (!habitable(r) && dNon) {
      const need = pack.minCeilingHeight.nonHabitable;
      push({ checkId:dNon.id, title:dNon.title, clause:dNon.clause, discipline:dNon.discipline,
        severity:dNon.severity, roomId:r.id, roomName:r.name,
        status: H >= need ? 'pass' : 'fail',
        measured:`${H.toFixed(2)} m`, required:`≥ ${need.toFixed(2)} m` });
    }
    // ---- natural light ----
    const dLight = def('light.nat');
    if (dLight && pack.minDaylightGlazingRatio && habitable(r)) {
      const glazArea = glazed.reduce((s,o)=>s+o.w*o.h,0);
      const need = ratioValue(pack.minDaylightGlazingRatio) * A;
      push({ checkId:dLight.id, title:dLight.title, clause:dLight.clause, discipline:dLight.discipline,
        severity:dLight.severity, roomId:r.id, roomName:r.name,
        status: glazArea >= need ? 'pass' : 'fail',
        measured:`${glazArea.toFixed(2)} m²`,
        required:`≥ ${need.toFixed(2)} m² (${formatRatio(pack.minDaylightGlazingRatio)} of ${A.toFixed(1)} m²)` });
    }
    // ---- natural ventilation (openable) ----
    const dVent = def('vent.nat') ?? def('vent.purge');
    if (dVent && pack.minOpenableAreaRatio && (habitable(r) || r.use === 'bath')) {
      const openable = ext.reduce((s,o)=>s+openArea(o),0);
      const need = ratioValue(pack.minOpenableAreaRatio) * A;
      push({ checkId:dVent.id, title:dVent.title, clause:dVent.clause, discipline:dVent.discipline,
        severity:dVent.severity, roomId:r.id, roomName:r.name,
        status: openable >= need ? 'pass' : (ext.length ? 'fail' : 'review'),
        measured:`${openable.toFixed(2)} m²`,
        required:`≥ ${need.toFixed(2)} m² (${formatRatio(pack.minOpenableAreaRatio)} of ${A.toFixed(1)} m²)`,
        note: ext.length ? undefined : 'No external opening — mechanical ventilation required.' });
    }
    // ---- mechanical exhaust to wet areas ----
    const dMech = def('vent.mech');
    if (dMech && (r.use === 'bath' || r.use === 'laundry' || r.use === 'kitchen')) {
      const need = pack.ventilationRates[r.use] ?? 0;
      push({ checkId:dMech.id, title:dMech.title, clause:dMech.clause, discipline:dMech.discipline,
        severity:dMech.severity, roomId:r.id, roomName:r.name, status:'review',
        required:`${need} L/s discharged outdoors`,
        note:'Fan schedule not modelled — confirm exhaust is ducted to outdoor air, not roof space.' });
    }
    // ---- illuminance (design guidance, not a code mandate in most jurisdictions) ----
    if (lights.length && habitable(r)) {
      const res = roomIlluminance(r, lights);
      const target = pack.illuminance[r.use] ?? res.target;
      push({ checkId:'light.artificial', title:'Maintained illuminance', clause:pack.codes.lighting.name,
        discipline:'daylight', severity:'advisory', roomId:r.id, roomName:r.name,
        status: res.lux >= target * 0.85 ? 'pass' : 'review',
        measured:`${res.lux.toFixed(0)} lx`, required:`${target} lx` });
    }
  }
  // ---- whole-of-building checks ----
  const dCov = def('plan.coverage');
  if (dCov) {
    const footprint = GEOM.LEN * GEOM.WID, site = 609;
    const cov = (footprint / site) * 100;
    push({ checkId:dCov.id, title:dCov.title, clause:dCov.clause, discipline:dCov.discipline,
      severity:dCov.severity, status: cov <= 60 ? 'pass':'review',
      measured:`${cov.toFixed(1)}%`, required:'per local DCP (commonly ≤50–60%)',
      note:'Planning overlay not fetched — verify against the live planning layer for this lot.' });
  }
  const dAcc = def('access.corridor');
  if (dAcc) {
    push({ checkId:dAcc.id, title:dAcc.title, clause:dAcc.clause, discipline:dAcc.discipline,
      severity:dAcc.severity, status:'review', required:'≥1000 mm on the accessible path',
      note:'Corridor widths require the circulation path to be traced — not yet automated.' });
  }
  const summary = {
    pass: F.filter(f=>f.status==='pass').length,
    fail: F.filter(f=>f.status==='fail').length,
    review: F.filter(f=>f.status==='review').length,
    blockers: F.filter(f=>f.status==='fail' && f.severity==='blocker').length,
  };
  return { jurisdiction: pack.jurisdiction.label, generatedAt: new Date().toISOString(),
    findings: F, summary, disclaimer: pack.disclaimer };
}
