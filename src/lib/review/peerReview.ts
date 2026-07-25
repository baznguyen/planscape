/**
 * Peer review — the "senior architect / draftsman" pass.
 *
 * Compares the 3D model against an INDEPENDENT trace of the architect's drawing
 * (planTrace.ts) and the certified DEVELOPMENT CALCULATIONS printed on the site
 * plan. Nothing here reads the model to decide what is correct: the drawing is
 * always the reference, the model is always the thing under test.
 *
 * Output is a scored, itemised report so a discrepancy is visible and auditable
 * rather than silently baked into the render.
 */
import { ROOMS, WALLS, BEAMS, GEOM, roomArea } from '@/lib/model/building';
import { PLAN_TRACE, CERTIFIED_AREAS, CERTIFIED_ENVELOPE, type TraceSeg } from '@/lib/model/planTrace';
import { analyseCirculation, CIRCULATION_RULES } from './circulation';
import { runDraftingRules } from './draftingRules';

export type Severity = 'pass' | 'minor' | 'major' | 'critical';
export interface Finding {
  id: string;
  discipline: 'geometry' | 'area' | 'structure' | 'envelope' | 'circulation' | 'habitability';
  severity: Severity;
  title: string;
  detail: string;
  /** drawing reference the reviewer checked against */
  reference: string;
  modelValue?: string;
  planValue?: string;
  /** signed deviation as a fraction, where meaningful */
  deviation?: number;
}
export interface ReviewReport {
  score: number;             // 0..10
  findings: Finding[];
  checked: number;
  passed: number;
  summary: string;
}

/** Tolerances. Residential setout is nominally +/-10 mm; drafting reads to ~50 mm. */
const POS_TOL = 0.09;        // m — a wall this far off is still "the same wall"
const POS_MAJOR = 0.35;      // m — beyond this the room reads wrong
const AREA_MINOR = 0.02;     // 2%
const AREA_MAJOR = 0.05;     // 5%

const segLen = (s: TraceSeg) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
const isHoriz = (s: { x1: number; z1: number; x2: number; z2: number }) => Math.abs(s.z2 - s.z1) < 1e-6;
const isVert = (s: { x1: number; z1: number; x2: number; z2: number }) => Math.abs(s.x2 - s.x1) < 1e-6;

/** Distance between two axis-aligned collinear-ish segments, plus their overlap. */
function compare(a: TraceSeg, w: { x1: number; z1: number; x2: number; z2: number }) {
  if (isHoriz(a) && isHoriz(w)) {
    const off = Math.abs(a.z1 - w.z1);
    const lo = Math.max(Math.min(a.x1, a.x2), Math.min(w.x1, w.x2));
    const hi = Math.min(Math.max(a.x1, a.x2), Math.max(w.x1, w.x2));
    return { off, overlap: Math.max(0, hi - lo) };
  }
  if (isVert(a) && isVert(w)) {
    const off = Math.abs(a.x1 - w.x1);
    const lo = Math.max(Math.min(a.z1, a.z2), Math.min(w.z1, w.z2));
    const hi = Math.min(Math.max(a.z1, a.z2), Math.max(w.z1, w.z2));
    return { off, overlap: Math.max(0, hi - lo) };
  }
  return null;
}

function areaFinding(
  id: string, title: string, model: number, plan: number, reference: string
): Finding {
  const dev = plan === 0 ? 0 : (model - plan) / plan;
  const a = Math.abs(dev);
  const severity: Severity = a <= AREA_MINOR ? 'pass' : a <= AREA_MAJOR ? 'minor' : a <= 0.12 ? 'major' : 'critical';
  return {
    id, discipline: 'area', severity, title,
    detail: severity === 'pass'
      ? `Within ${(AREA_MINOR * 100).toFixed(0)}% of the certified figure.`
      : `Model is ${dev > 0 ? 'larger' : 'smaller'} than the certified figure by ${(a * 100).toFixed(1)}%.`,
    reference,
    modelValue: `${model.toFixed(2)} m²`,
    planValue: `${plan.toFixed(2)} m²`,
    deviation: dev,
  };
}

export function runPeerReview(): ReviewReport {
  const findings: Finding[] = [];
  const sum = (pred: (r: (typeof ROOMS)[number]) => boolean) =>
    ROOMS.filter(pred).reduce((a, r) => a + roomArea(r), 0);

  // ---- 1. certified area schedule -------------------------------------------------
  const REF = 'Site plan, DEVELOPMENT CALCULATIONS block';
  findings.push(areaFinding('a_ground', 'Ground floor living area',
    sum(r => r.floor === 0 && !r.outdoor && r.use !== 'garage'), CERTIFIED_AREAS.groundLiving, REF));
  findings.push(areaFinding('a_first', 'First floor internal area',
    sum(r => r.floor === 1 && !r.outdoor && !r.void), CERTIFIED_AREAS.firstFloorInternal, REF));
  findings.push(areaFinding('a_garage', 'Double garage',
    sum(r => r.use === 'garage'), CERTIFIED_AREAS.garage, REF));
  findings.push(areaFinding('a_alfresco', 'Alfresco',
    sum(r => r.id === 'g_alf'), CERTIFIED_AREAS.alfresco, REF));
  findings.push(areaFinding('a_porch', 'Porch',
    sum(r => r.id === 'g_por'), CERTIFIED_AREAS.porch, REF));
  findings.push(areaFinding('a_balcony', 'Balcony',
    sum(r => r.id === 'f_bal'), CERTIFIED_AREAS.balcony, REF));

  // ---- 2. envelope ----------------------------------------------------------------
  const envCheck = (id: string, title: string, model: number, plan: number, ref: string): Finding => {
    const d = model - plan;
    const a = Math.abs(d);
    const severity: Severity = a <= 0.02 ? 'pass' : a <= 0.1 ? 'minor' : a <= 0.4 ? 'major' : 'critical';
    return {
      id, discipline: 'envelope', severity, title,
      detail: severity === 'pass' ? 'Matches the dimension chain.'
        : `Out by ${(d * 1000).toFixed(0)} mm against the chain.`,
      reference: ref, modelValue: `${model.toFixed(3)} m`, planValue: `${plan.toFixed(3)} m`,
      deviation: d / plan,
    };
  };
  findings.push(envCheck('e_len', 'Overall length', GEOM.LEN, CERTIFIED_ENVELOPE.groundLength,
    'Ground floor sheet, chain 6,500 + 11,280 + 8,150 + 2,130 + 80'));
  findings.push(envCheck('e_wid', 'Overall width', GEOM.WID, CERTIFIED_ENVELOPE.groundWidth,
    'Ground floor sheet, left vertical chain 11,000'));
  findings.push(envCheck('e_h0', 'Ground ceiling height', GEOM.H0, CERTIFIED_ENVELOPE.ceilingGround,
    'Elevations, FFL 16,490 to FCL 19,230'));
  findings.push(envCheck('e_h1', 'First floor ceiling height', GEOM.H1, CERTIFIED_ENVELOPE.ceilingFirst,
    'Elevations, FFL 19,530 to FCL 22,120'));

  // ---- 3. wall-by-wall against the traced plan ------------------------------------
  for (const seg of PLAN_TRACE) {
    if (seg.kind === 'beam' || seg.kind === 'open') continue;   // handled separately
    const candidates = WALLS.filter(w => w.floor === seg.floor);
    let best: { off: number; overlap: number } | null = null;
    for (const w of candidates) {
      const c = compare(seg, w);
      if (!c) continue;
      if (c.overlap < 0.25) continue;                     // not the same run
      if (!best || c.off < best.off) best = c;
    }
    const len = segLen(seg);
    if (!best) {
      findings.push({
        id: `w_missing_${seg.floor}_${seg.x1}_${seg.z1}`,
        discipline: 'geometry', severity: len > 2 ? 'critical' : 'major',
        title: `Wall on the drawing is not in the model`,
        detail: `A ${len.toFixed(2)} m ${seg.kind} wall is drawn here but the model has nothing on that line.`,
        reference: seg.note,
      });
    } else if (best.off > POS_MAJOR) {
      findings.push({
        id: `w_off_${seg.floor}_${seg.x1}_${seg.z1}`,
        discipline: 'geometry', severity: 'major',
        title: `Wall is out of position`,
        detail: `Nearest modelled wall is ${(best.off * 1000).toFixed(0)} mm off the drawn line.`,
        reference: seg.note, modelValue: `${(best.off * 1000).toFixed(0)} mm off`, planValue: 'on line',
      });
    } else if (best.off > POS_TOL) {
      findings.push({
        id: `w_min_${seg.floor}_${seg.x1}_${seg.z1}`,
        discipline: 'geometry', severity: 'minor',
        title: `Wall slightly out of position`,
        detail: `${(best.off * 1000).toFixed(0)} mm off the drawn line — within reading tolerance of the drawing but worth confirming on site.`,
        reference: seg.note,
      });
    }
  }

  // ---- 4. walls in the model that the drawing does not have -----------------------
  for (const w of WALLS) {
    if (w.external) continue;
    const segs = PLAN_TRACE.filter(s => s.floor === w.floor && s.kind !== 'beam' && s.kind !== 'open');
    const hit = segs.some(s => { const c = compare(s, w); return c && c.overlap > 0.25 && c.off <= POS_MAJOR; });
    if (hit) continue;
    const beam = BEAMS.filter(b => b.floor === w.floor)
      .some(b => { const c = compare({ ...b, kind: 'beam', note: '' } as TraceSeg, w); return c && c.overlap > 0.25 && c.off <= POS_TOL; });
    findings.push({
      id: `w_extra_${w.id}`,
      discipline: beam ? 'structure' : 'geometry',
      severity: beam ? 'critical' : 'major',
      title: beam
        ? `Structural beam modelled as a wall`
        : `Model has a wall the drawing does not`,
      detail: beam
        ? `${w.id} sits on a line the drawing marks "BEAM OVER" — a downstand beam. Modelling it as a wall closes an open-plan space that should read through.`
        : `${w.id} runs from (${w.x1}, ${w.z1}) to (${w.x2}, ${w.z2}) with no matching line on the drawing.`,
      reference: 'Ground/first floor sheet, wall lines',
    });
  }

  // ---- 5. beams must be beams -----------------------------------------------------
  for (const b of BEAMS) {
    const asWall = WALLS.filter(w => w.floor === b.floor)
      .some(w => { const c = compare({ ...b, kind: 'beam', note: '' } as TraceSeg, w); return c && c.overlap > 0.5 && c.off <= POS_TOL; });
    if (!asWall) {
      findings.push({
        id: `b_ok_${b.id}`, discipline: 'structure', severity: 'pass',
        title: `${b.label}`,
        detail: 'Drawn as a downstand beam, not a wall — the open-plan space reads through as it should.',
        reference: '"BEAM OVER TO ENG DETAILS"',
      });
    }
  }

  // ---- 6. circulation ------------------------------------------------------------
  // A model can pass every dimension check and still be unusable. This asks the
  // question a reviewer asks first: can you actually walk in and reach everything.
  const circ = analyseCirculation();
  const entryName = ROOMS.find(r => r.id === circ.entry)?.name ?? circ.entry;
  if (circ.unreachable.length === 0) {
    findings.push({
      id: 'c_reach', discipline: 'circulation', severity: 'pass',
      title: 'Every room is reachable from the front door',
      detail: `All ${circ.reachable.size} spaces connect back to ${entryName} through doors, open boundaries or the stair.`,
      reference: 'NCC Volume Two — access and egress',
    });
  } else {
    for (const r of circ.unreachable) {
      findings.push({
        id: `c_unreach_${r.id}`, discipline: 'circulation', severity: 'critical',
        title: `${r.name} cannot be reached from the front door`,
        detail: `No door, open boundary or stair connects ${r.name} back to ${entryName}. Either an opening is missing or a wall is closing the route.`,
        reference: 'NCC Volume Two — access and egress',
      });
    }
  }
  for (const p of circ.pinchPoints) {
    findings.push({
      id: `c_pinch_${p.room.id}`, discipline: 'circulation',
      severity: p.clear < p.required * 0.7 ? 'critical' : 'major',
      title: `${p.room.name} is too narrow to walk through`,
      detail: `${p.cause}, leaving ${(p.clear * 1000).toFixed(0)} mm clear. A corridor needs ${(p.required * 1000).toFixed(0)} mm to be usable.`,
      reference: `AS 1428.1 — circulation, ${(CIRCULATION_RULES.corridorWidth * 1000).toFixed(0)} mm corridor`,
      modelValue: `${(p.clear * 1000).toFixed(0)} mm`,
      planValue: `${(p.required * 1000).toFixed(0)} mm min`,
    });
  }
  for (const d of circ.blockedDoors) {
    findings.push({
      id: `c_block_${d.openingId}`, discipline: 'circulation', severity: 'major',
      title: `Door ${d.openingId} has nowhere to swing`,
      detail: d.detail,
      reference: 'AS 1428.1 — clear space at doorways',
    });
  }
  if (circ.blockedDoors.length === 0) {
    findings.push({
      id: 'c_swing', discipline: 'circulation', severity: 'pass',
      title: 'Every door has clear space to swing',
      detail: 'No door opens into a wall, a cupboard face or a fixture. Furniture is laid out around the swing zones rather than through them.',
      reference: 'AS 1428.1 — clear space at doorways',
    });
  }
  for (const d of circ.narrowDoors) {
    findings.push({
      id: `c_door_${d.openingId}`, discipline: 'circulation', severity: 'minor',
      title: `Door to ${d.room} is under the clear-width minimum`,
      detail: `${(d.width * 1000).toFixed(0)} mm clear where ${(d.required * 1000).toFixed(0)} mm is required to a habitable room.`,
      reference: 'AS 1428.1 — 820 mm clear door opening',
      modelValue: `${(d.width * 1000).toFixed(0)} mm`,
      planValue: `${(d.required * 1000).toFixed(0)} mm min`,
    });
  }

  // ---- 7. drafting logic ----------------------------------------------------------
  // Generalised rules, not tied to this plan. Each one is a judgement a
  // draftsperson makes automatically, written down so it applies to every job.
  for (const r of runDraftingRules()) {
    const disc: Finding['discipline'] =
      r.rule.startsWith('habitability') ? 'habitability'
      : r.rule.startsWith('structure') ? 'structure' : 'geometry';
    findings.push({
      id: `d_${r.rule}_${r.subject ?? ''}`,
      discipline: disc, severity: r.severity,
      title: r.title, detail: r.detail,
      reference: r.learnedFrom ? `${r.authority} · learned from ${r.learnedFrom}` : r.authority,
    });
  }

  const weight: Record<Severity, number> = { pass: 0, minor: 1, major: 4, critical: 9 };
  const penalty = findings.reduce((a, f) => a + weight[f.severity], 0);
  const checked = findings.length;
  const passed = findings.filter(f => f.severity === 'pass').length;
  // 10 is a clean sheet; every major costs roughly half a point.
  const score = Math.max(0, Math.min(10, 10 - penalty * 0.12));

  const crit = findings.filter(f => f.severity === 'critical').length;
  const maj = findings.filter(f => f.severity === 'major').length;
  const summary = crit === 0 && maj === 0
    ? 'No material departures from the drawing. Model is fit to issue.'
    : `${crit} critical and ${maj} major departures from the drawing need resolving before issue.`;

  const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2, pass: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, findings, checked, passed, summary };
}
