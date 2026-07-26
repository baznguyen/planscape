/**
 * Where a piece of furniture is allowed to stand.
 *
 * The renderer used to answer that question with arithmetic on the room
 * rectangle — "put the curtain at z0 + 0.14", "put the second car at centre
 * + 1.45" — and never asked whether the result was inside the building, on a
 * wall that exists, or clear of the door. It produced, all at once:
 *
 *   · a curtain hanging in mid-air across the open-plan boundary between the
 *     kitchen and the family room, where the drawing marks an 11,280 clear span
 *     and there is deliberately no wall at all. It read as a free-standing
 *     partition, and it was the single most obviously wrong thing in the render;
 *   · two cars nose to tail down the length of a double garage, the front one
 *     projecting 770 mm through the closed panel lift door;
 *   · a breakfast island and an overhead cabinet run in a 1.7 m servery,
 *     because the servery's `use` is "kitchen" and the joinery keyed off `use`.
 *
 * None of that is a modelling error — the model is fine. It is the fit-out
 * inventing anchors. So the anchors are tested here instead, against three
 * questions a person would ask without thinking about it:
 *
 *   1. is the whole piece inside the room;
 *   2. is anything it needs to lean on actually there;
 *   3. can you still open the door.
 */
import { ROOMS, WALLS, ALL_OPENINGS, type Room, type Opening } from './building';
import { doorZones, blockedFraction } from './clearance';

export interface Foot { x0: number; x1: number; z0: number; z1: number }

/** Footprint of a piece centred at (x, z), rotated ry, w along its own X. */
export function foot(x: number, z: number, w: number, d: number, ry = 0): Foot {
  const swap = Math.abs(Math.abs(Math.sin(ry))) > 0.5;    // 90° or 270°
  const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
}

/** How far the footprint pokes outside the room, in metres, on its worst side. */
export function overhang(f: Foot, r: Room): number {
  return Math.max(r.x0 - f.x0, f.x1 - r.x1, r.z0 - f.z0, f.z1 - r.z1, 0);
}

/**
 * Slide a footprint back inside the room rather than dropping the piece.
 *
 * A car that does not fit a garage is a modelling question; a car that fits but
 * has been centred badly is an arithmetic one, and the second is much more
 * common. Returns null only when the piece genuinely cannot fit.
 */
export function nudgeInside(x: number, z: number, w: number, d: number, ry: number, r: Room,
                            margin = 0.05): { x: number; z: number } | null {
  const f = foot(x, z, w, d, ry);
  const fw = f.x1 - f.x0, fd = f.z1 - f.z0;
  if (fw > r.x1 - r.x0 - margin * 2 || fd > r.z1 - r.z0 - margin * 2) return null;
  return {
    x: Math.min(Math.max(x, r.x0 + margin + fw / 2), r.x1 - margin - fw / 2),
    z: Math.min(Math.max(z, r.z0 + margin + fd / 2), r.z1 - margin - fd / 2),
  };
}

/**
 * Is there a wall within reach of this point, running the way the piece faces?
 *
 * Anything that leans on something — a curtain, a robe, a bench, a wall-hung
 * television, a bedhead — needs one. An open-plan boundary is a line on a room
 * schedule, not a surface, and hanging joinery on it is what produced the
 * phantom partition.
 */
export function wallBehind(x: number, z: number, floor: 0 | 1, ry: number, reach = 0.45): boolean {
  // the piece's back faces -Z in its own frame, so its outward normal is
  // (sin ry, cos ry) rotated into the world
  const nx = Math.sin(ry), nz = Math.cos(ry);
  for (const w of WALLS) {
    if (w.floor !== floor) continue;
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
    const px = w.x1 + t * dx, pz = w.z1 + t * dz;
    if (Math.hypot(x - px, z - pz) > reach) continue;
    // the wall has to run across the way the piece faces, not along with it
    const ux = dx / Math.sqrt(L2), uz = dz / Math.sqrt(L2);
    if (Math.abs(ux * nx + uz * nz) < 0.5) return true;
  }
  return false;
}

/** The windows and glazed doors that light a room — where curtains belong. */
export function glazingFor(r: Room): Opening[] {
  return ALL_OPENINGS.filter(o =>
    o.floor === r.floor && (o.kind === 'window' || o.kind === 'slider') &&
    (o.a === r.id || o.b === r.id));
}

/**
 * The one test every anchor goes through: inside the room, clear of the door
 * swings, and — when the piece needs it — backed by a wall.
 */
export function anchorOk(x: number, z: number, w: number, d: number, ry: number,
                         r: Room, opts: { needsWall?: boolean } = {}): boolean {
  const f = foot(x, z, w, d, ry);
  if (overhang(f, r) > 0.06) return false;
  if (blockedFraction(f, doorZones(r.floor)) >= 0.06) return false;
  if (opts.needsWall && !wallBehind(x, z, r.floor, ry)) return false;
  return true;
}

/** Every non-void room a footprint intrudes into, other than its own. */
export function intrudesInto(f: Foot, r: Room): Room[] {
  return ROOMS.filter(o => o.id !== r.id && o.floor === r.floor && !o.void &&
    Math.min(f.x1, o.x1) - Math.max(f.x0, o.x0) > 0.05 &&
    Math.min(f.z1, o.z1) - Math.max(f.z0, o.z0) > 0.05);
}
