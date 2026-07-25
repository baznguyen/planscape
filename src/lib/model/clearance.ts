/**
 * Door and circulation keep-clear zones.
 *
 * Shared deliberately: the renderer uses it to decide where furniture may go,
 * and the reviewer uses the same function to check nothing ended up in the way.
 * A wardrobe standing in front of a door is a defect a human reviewer spots
 * instantly — this is what lets the model spot it too.
 */
import { ALL_OPENINGS, WALLS, type Opening } from './building';

export interface Zone {
  x0: number; x1: number; z0: number; z1: number;
  floor: 0 | 1;
  label: string;
}

/** Clear depth a door needs in front of it, both sides. */
export const DOOR_CLEAR_DEPTH = 0.92;
/** Little extra beyond the leaf so a swing does not clip a corner. */
const SIDE_PAD = 0.06;

/** A rectangle in front of and behind every door and cased opening. */
export function doorZones(floor: 0 | 1): Zone[] {
  const out: Zone[] = [];
  for (const o of ALL_OPENINGS) {
    if (o.floor !== floor) continue;
    if (o.kind === 'window') continue;              // nothing swings, sill is high
    const wall = WALLS.find(w => w.id === o.wallId);
    if (!wall) continue;
    const horizontal = Math.abs(wall.z1 - wall.z2) < 1e-6;
    const half = o.w / 2 + SIDE_PAD;
    if (horizontal) {
      // wall runs along x, so the swing eats z on both sides
      out.push({
        x0: o.x - half, x1: o.x + half,
        z0: o.z - DOOR_CLEAR_DEPTH, z1: o.z + DOOR_CLEAR_DEPTH,
        floor, label: `${o.id} swing`,
      });
    } else {
      out.push({
        x0: o.x - DOOR_CLEAR_DEPTH, x1: o.x + DOOR_CLEAR_DEPTH,
        z0: o.z - half, z1: o.z + half,
        floor, label: `${o.id} swing`,
      });
    }
  }
  return out;
}

export const overlaps = (
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number },
) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

/** How much of a footprint sits inside any zone, as a fraction of its area. */
export function blockedFraction(
  fp: { x0: number; x1: number; z0: number; z1: number }, zones: Zone[],
): number {
  const area = Math.max(1e-6, (fp.x1 - fp.x0) * (fp.z1 - fp.z0));
  let worst = 0;
  for (const z of zones) {
    const w = Math.max(0, Math.min(fp.x1, z.x1) - Math.max(fp.x0, z.x0));
    const d = Math.max(0, Math.min(fp.z1, z.z1) - Math.max(fp.z0, z.z0));
    worst = Math.max(worst, (w * d) / area);
  }
  return worst;
}

/** The opening whose keep-clear zone a footprint intrudes on, if any. */
export function blockingOpening(
  fp: { x0: number; x1: number; z0: number; z1: number }, floor: 0 | 1,
): { opening: Opening; fraction: number } | null {
  const zones = doorZones(floor);
  let best: { opening: Opening; fraction: number } | null = null;
  for (const z of zones) {
    const w = Math.max(0, Math.min(fp.x1, z.x1) - Math.max(fp.x0, z.x0));
    const d = Math.max(0, Math.min(fp.z1, z.z1) - Math.max(fp.z0, z.z0));
    if (w <= 0 || d <= 0) continue;
    const area = Math.max(1e-6, (fp.x1 - fp.x0) * (fp.z1 - fp.z0));
    const frac = (w * d) / area;
    const id = z.label.split(' ')[0];
    const opening = ALL_OPENINGS.find(o => o.id === id);
    if (!opening) continue;
    if (!best || frac > best.fraction) best = { opening, fraction: frac };
  }
  return best;
}
