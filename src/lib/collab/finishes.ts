/**
 * Finish assignment. Applying a finish is a MATERIAL change, so it must feed the
 * same solvers — repainting a room changes its reflectance (lighting), a tile
 * swap changes absorption (acoustics) and a cladding swap changes U (thermal).
 */
export type SurfaceKind = 'WALL'|'FLOOR'|'CEILING'|'JOINERY'|'FIXTURE'|'EXTERNAL';
export type Scope = 'surface'|'room'|'floor'|'house';
export interface FinishSpec {
  id: string; name: string; category: string;
  hexColor?: string; imageUrl?: string;
  unitCost?: number; unit?: 'm2'|'each'|'lm';
  /** physical properties — omitted values fall back to the base material */
  properties?: { rho?: number; alpha500?: number; U?: number; kappa?: number };
}
export interface Assignment { id:string; finishId:string; kind:SurfaceKind; scope:Scope; targetId?:string }
/** Resolve which assignment wins for a surface: most specific scope wins. */
const RANK: Record<Scope, number> = { house:0, floor:1, room:2, surface:3 };
export function resolveFinish(
  assignments: Assignment[], kind: SurfaceKind,
  ctx: { surfaceId?: string; roomId?: string; floor?: number }
): Assignment | null {
  let best: Assignment | null = null;
  for (const a of assignments) {
    if (a.kind !== kind) continue;
    const match =
      a.scope === 'house' ||
      (a.scope === 'floor' && a.targetId === String(ctx.floor)) ||
      (a.scope === 'room' && a.targetId === ctx.roomId) ||
      (a.scope === 'surface' && a.targetId === ctx.surfaceId);
    if (!match) continue;
    if (!best || RANK[a.scope] >= RANK[best.scope]) best = a;
  }
  return best;
}
/** Paint quantity for a repaint, with the standard two-coat allowance. */
export function paintQuantity(areaM2: number, coats = 2, spreadRateM2PerL = 14) {
  const litres = (areaM2 * coats) / spreadRateM2PerL;
  return { areaM2, coats, litres: Math.ceil(litres * 10) / 10, tins4L: Math.ceil(litres / 4) };
}
/** Cost a set of assignments so a fork can be priced. */
export function costFinishes(
  assignments: Assignment[], finishes: Record<string, FinishSpec>, areas: Record<string, number>
) {
  const lines = assignments.map(a => {
    const f = finishes[a.finishId];
    const area = areas[a.id] ?? 0;
    const cost = f?.unitCost ? (f.unit === 'each' ? f.unitCost : f.unitCost * area) : 0;
    return { assignmentId:a.id, finish:f?.name ?? a.finishId, kind:a.kind, scope:a.scope, area, cost };
  });
  return { lines, total: lines.reduce((s,l)=>s+l.cost, 0) };
}
