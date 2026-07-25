/**
 * Where you are allowed to stand.
 *
 * The walkthrough used to add a step vector to the camera with no test at all,
 * so holding forward for ten seconds put you through the external wall, off the
 * site disc and into the fog — and on the first floor it left you hovering two
 * storeys up over the garden, looking down at the underside of a slab that was
 * never meant to be seen. That is the whole of the "I don't want to see
 * underneath the floor plan" complaint: not a rendering fault, a movement one.
 *
 * The rule is not "stay inside a room". This is a mostly open-plan house, and
 * most of the boundaries between its rooms are not walls at all — the kitchen,
 * family and dining spaces run together, exactly as the drawing shows. Test
 * against ROOM RECTANGLES and you build invisible walls on every shared edge;
 * the first version of this file did that and confined you to two spaces.
 *
 * So the real rule is the physical one:
 *
 *   1. Stay on the slab — inside the union of the rooms on this level.
 *   2. Keep a body's clearance from any WALL, unless you are in a doorway.
 *
 * Rule 2 deliberately ignores whether a door is currently swung open. Every
 * opening starts closed in this model, and a walkthrough that traps you in the
 * entry until you have hunted down the door toggles is a worse lie than a door
 * you walk through. The openings overlay is where you reason about what is
 * open; this is where you reason about where the holes in the walls are.
 */
import { ROOMS, WALLS, ALL_OPENINGS, type Wall } from './building';

/** Shoulder clearance. Enough never to clip a reveal, small enough to fit an 820 door. */
export const BODY_R = 0.26;
/** A doorway you can pass through: full height opening, not a window. */
const isDoorway = (sill: number) => sill <= 0.35;

/**
 * Inside the union of this level's rooms — i.e. there is slab under you.
 *
 * The tolerance is a wall thickness, not a rounding allowance. Room rectangles
 * are taken to the FACES of the walls, so between two rooms either side of a
 * partition there is a 110-150 mm strip belonging to neither: the threshold you
 * are standing on as you pass through the opening. Without the tolerance every
 * doorway in the house is a wall.
 */
const SLAB_TOL = 0.13;
export function onSlab(floor: 0 | 1, x: number, z: number): boolean {
  for (const r of ROOMS) {
    if (r.floor !== floor || r.void) continue;
    if (x >= r.x0 - SLAB_TOL && x <= r.x1 + SLAB_TOL &&
        z >= r.z0 - SLAB_TOL && z <= r.z1 + SLAB_TOL) return true;
  }
  return false;
}

/** Perpendicular distance from a point to a wall segment. */
function distToWall(w: Wall, x: number, z: number): number {
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
  const L2 = dx * dx + dz * dz;
  const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
  return Math.hypot(x - (w.x1 + dx * t), z - (w.z1 + dz * t));
}

/** Is there a doorway in this wall at that point, wide enough to walk through? */
function holeNear(w: Wall, x: number, z: number, slack = 0): boolean {
  for (const o of ALL_OPENINGS) {
    if (o.wallId !== w.id || !isDoorway(o.sill)) continue;
    if (Math.hypot(o.x - x, o.z - z) <= o.w / 2 + slack) return true;
  }
  return false;
}

/** Can a person stand here? */
export function standable(floor: 0 | 1, x: number, z: number): boolean {
  if (!onSlab(floor, x, z)) return false;
  for (const w of WALLS) {
    if (w.floor !== floor) continue;
    if (distToWall(w, x, z) >= BODY_R) continue;
    // close to a wall — only allowed if that is where the doorway is
    if (!holeNear(w, x, z, 0.05)) return false;
  }
  return true;
}

/**
 * The move you actually get. Try the whole step; if it is blocked, slide along
 * whichever axis is still free, which is what stops you sticking to a wall you
 * brush at an angle.
 */
export function resolveStep(
  floor: 0 | 1, x: number, z: number, dx: number, dz: number,
): { x: number; z: number; moved: boolean } {
  if (standable(floor, x + dx, z + dz)) return { x: x + dx, z: z + dz, moved: true };
  if (dx !== 0 && standable(floor, x + dx, z)) return { x: x + dx, z, moved: true };
  if (dz !== 0 && standable(floor, x, z + dz)) return { x, z: z + dz, moved: true };
  return { x, z, moved: false };
}

/** Nearest standing point on the slab, for recovering a camera that is off it. */
export function nearestOnPlate(floor: 0 | 1, x: number, z: number): { x: number; z: number } {
  let best = { x, z }, bestD = Infinity;
  for (const r of ROOMS) {
    if (r.floor !== floor || r.void || r.outdoor) continue;
    const cx = Math.min(Math.max(x, r.x0 + BODY_R + 0.05), r.x1 - BODY_R - 0.05);
    const cz = Math.min(Math.max(z, r.z0 + BODY_R + 0.05), r.z1 - BODY_R - 0.05);
    if (!standable(floor, cx, cz)) continue;
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
  }
  return best;
}

/** Kept for callers that only need "is there floor under this point". */
export const onPlate = standable;
