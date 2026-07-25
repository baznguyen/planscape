/**
 * Paint and wallpaper.
 *
 * A finish is applied to a SCOPE, not to a mesh. You paint the whole house, a
 * floor, a room, a facade or one wall, and the most specific assignment wins.
 * That is how a finishes schedule actually reads — "all internal walls Lexicon
 * Quarter, except the media room, which is Domino" — and it means repainting a
 * whole level is one entry rather than forty.
 */
import { WALLS, ROOMS, GEOM, roomArea, roomHeight, type Wall } from './building';
import { lrvToReflectance, type Colour } from './colours';

/** Ordered least to most specific. Later beats earlier. */
export const SCOPE_ORDER = ['house', 'facade', 'floorLevel', 'room', 'wall'] as const;
export type PaintScope = (typeof SCOPE_ORDER)[number];

export interface Wallpaper {
  name: string;
  /** data: URL of the uploaded swatch */
  image: string;
  /** real-world width of one repeat, metres */
  repeatM: number;
}
export interface PaintAssignment {
  id: string;
  scope: PaintScope;
  /** wall id, room id, floor number as a string; empty for house and facade */
  targetId: string;
  colour?: Colour & { system: string };
  wallpaper?: Wallpaper;
  /** which side — internal faces, external faces, or both */
  side: 'internal' | 'external' | 'both';
}

export interface SurfaceContext {
  wallId: string;
  /** every room this face could belong to — a wall bounds two */
  roomIds?: string[];
  floor: 0 | 1;
  external: boolean;
}

/**
 * Which assignment governs a given wall face. Most specific wins; among equals,
 * the one added last wins, so a later decision overrides an earlier one the way
 * a variation overrides the base spec.
 */
export function resolvePaint(
  assignments: PaintAssignment[], ctx: SurfaceContext,
): PaintAssignment | null {
  let best: PaintAssignment | null = null;
  let bestRank = -1;
  for (const a of assignments) {
    if (a.side === 'internal' && ctx.external) continue;
    if (a.side === 'external' && !ctx.external) continue;
    let match = false;
    switch (a.scope) {
      case 'house': match = true; break;
      case 'facade': match = ctx.external; break;
      case 'floorLevel': match = a.targetId === String(ctx.floor); break;
      case 'room': match = !!ctx.roomIds?.includes(a.targetId); break;
      case 'wall': match = a.targetId === ctx.wallId; break;
    }
    if (!match) continue;
    const rank = SCOPE_ORDER.indexOf(a.scope);
    if (rank >= bestRank) { best = a; bestRank = rank; }
  }
  return best;
}

/**
 * Rooms either side of a wall, in face order: index 0 is the +normal side,
 * index 1 the -normal side. Faces are painted independently, because a wall
 * between a white hallway and a charcoal media room is white on one side.
 */
export function roomsOnWall(w: Wall): (string | null)[] {
  const horiz = Math.abs(w.z2 - w.z1) < 1e-6;
  const mid = { x: (w.x1 + w.x2) / 2, z: (w.z1 + w.z2) / 2 };
  const probe = 0.3;
  const pts = horiz
    ? [{ x: mid.x, z: mid.z + probe }, { x: mid.x, z: mid.z - probe }]
    : [{ x: mid.x + probe, z: mid.z }, { x: mid.x - probe, z: mid.z }];
  const out: (string | null)[] = [];
  for (const p of pts) {
    const r = ROOMS.find(x => x.floor === w.floor && !x.void &&
      p.x >= x.x0 && p.x <= x.x1 && p.z >= x.z0 && p.z <= x.z1);
    out.push(r?.id ?? null);
  }
  return out;
}

/**
 * Mean wall reflectance for a room once paint is applied. This is what the
 * lighting solver consumes — painting a room dark has to cost you lux.
 */
export function roomWallReflectance(
  assignments: PaintAssignment[], roomId: string, fallback: number,
): number {
  const room = ROOMS.find(r => r.id === roomId);
  if (!room) return fallback;
  const faces = WALLS.filter(w => w.floor === room.floor && roomsOnWall(w).includes(roomId));
  if (!faces.length) return fallback;
  let total = 0, n = 0;
  for (const w of faces) {
    // the face this room sees is always an internal face
    const p = resolvePaint(assignments, {
      wallId: w.id, roomIds: [roomId], floor: w.floor, external: false,
    });
    // wallpaper is treated as a mid reflectance unless a colour is also set
    const rho = p?.colour ? lrvToReflectance(p.colour.lrv) : p?.wallpaper ? 0.45 : fallback;
    total += rho; n++;
  }
  return n ? total / n : fallback;
}

/** Paintable area of a scope, so a quantity can be priced. */
export function scopeArea(scope: PaintScope, targetId: string): number {
  if (scope === 'wall') {
    const w = WALLS.find(x => x.id === targetId);
    if (!w) return 0;
    // GEOM, not a literal: the ground storey was corrected to 2.74 and a stray
    // 2.72 here quoted different litres for a wall than for the room around it.
    const H = w.floor === 0 ? GEOM.H0 : GEOM.H1;
    return Math.hypot(w.x2 - w.x1, w.z2 - w.z1) * H * 2;   // both faces
  }
  if (scope === 'room') {
    const r = ROOMS.find(x => x.id === targetId);
    if (!r) return 0;
    const per = 2 * ((r.x1 - r.x0) + (r.z1 - r.z0));
    return per * roomHeight(r);
  }
  if (scope === 'floorLevel') {
    return ROOMS.filter(r => String(r.floor) === targetId && !r.outdoor && !r.void)
      .reduce((a, r) => a + 2 * ((r.x1 - r.x0) + (r.z1 - r.z0)) * roomHeight(r), 0);
  }
  if (scope === 'facade') {
    return WALLS.filter(w => w.external)
      .reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.z2 - w.z1) * (w.floor === 0 ? GEOM.H0 : GEOM.H1), 0);
  }
  // whole house, internal faces
  return ROOMS.filter(r => !r.outdoor && !r.void)
    .reduce((a, r) => a + 2 * ((r.x1 - r.x0) + (r.z1 - r.z0)) * roomHeight(r), 0);
}

/** Litres and 4 L tins for a scope at the usual two coats. */
export function paintQuantity(areaM2: number, coats = 2, spreadM2PerL = 14) {
  const litres = (areaM2 * coats) / spreadM2PerL;
  return { areaM2, coats, litres: Math.ceil(litres * 10) / 10, tins4L: Math.ceil(litres / 4) };
}

/** Rooms a scope covers, so the reviewer can re-check lighting after a repaint. */
export function roomsInScope(scope: PaintScope, targetId: string): string[] {
  if (scope === 'room') return [targetId];
  if (scope === 'floorLevel') return ROOMS.filter(r => String(r.floor) === targetId).map(r => r.id);
  if (scope === 'wall') {
    const w = WALLS.find(x => x.id === targetId);
    return w ? (roomsOnWall(w).filter(Boolean) as string[]) : [];
  }
  if (scope === 'house') return ROOMS.filter(r => !r.outdoor && !r.void).map(r => r.id);
  return [];
}
export { roomArea };
