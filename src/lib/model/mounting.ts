/**
 * Mount resolution.
 *
 * A tap on the floor is a point in plan. What that means depends entirely on the
 * asset: a subwoofer stands where you tapped, a downlight goes in the ceiling
 * directly above it, and an in-wall speaker has to find the nearest wall, sit
 * flat against its inside face and turn to look into the room. Getting this
 * wrong is what makes a render look wrong even when the geometry is right.
 */
import { WALLS, ROOMS, GEOM, roomHeight, roomCentre, type Wall } from './building';
import type { AssetSpec, Mount } from './assets';

export interface Placement {
  x: number; z: number; y: number;
  /** rotation about Y so the asset faces into the room */
  rot: number;
  /** the wall it is fixed to, for wall mounts */
  wallId?: string;
  /** how many room boundaries it is coupled to — drives subwoofer boundary gain */
  boundaries: number;
  room: string | null;
  /** set when the asset could not be attached as its mount requires */
  problem?: string;
}

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/** Nearest point on a wall segment to a plan point. */
function projectOnWall(w: Wall, x: number, z: number) {
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
  const L2 = dx * dx + dz * dz;
  const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
  const px = w.x1 + t * dx, pz = w.z1 + t * dz;
  return { px, pz, dist: Math.hypot(x - px, z - pz), t };
}

export function roomAtPoint(floor: 0 | 1, x: number, z: number) {
  return ROOMS.find(r => r.floor === floor && !r.void &&
    x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ?? null;
}

/** How many of the room's own boundaries this point sits against, plus the floor. */
function boundaryCount(floor: 0 | 1, x: number, z: number, onFloor: boolean) {
  const r = roomAtPoint(floor, x, z);
  let n = onFloor ? 1 : 0;                     // the floor itself is a boundary
  if (!r) return n;
  const NEAR = 0.6;
  if (Math.abs(x - r.x0) < NEAR || Math.abs(x - r.x1) < NEAR) n++;
  if (Math.abs(z - r.z0) < NEAR || Math.abs(z - r.z1) < NEAR) n++;
  return n;
}

export function resolveMount(
  spec: AssetSpec, floor: 0 | 1, x: number, z: number,
): Placement {
  const base = yOf(floor);
  const room = roomAtPoint(floor, x, z);
  const H = room ? roomHeight(room) : (floor === 0 ? GEOM.H0 : GEOM.H1);
  const mount: Mount = spec.mount;

  if (mount === 'wall') {
    // snap to the nearest wall on this floor and face into the room
    let best: { w: Wall; p: ReturnType<typeof projectOnWall> } | null = null;
    for (const w of WALLS) {
      if (w.floor !== floor) continue;
      const p = projectOnWall(w, x, z);
      if (!best || p.dist < best.p.dist) best = { w, p };
    }
    if (!best || best.p.dist > 3.0) {
      return { x, z, y: base + (spec.mountHeight ?? 1.2), rot: 0, boundaries: 1, room: room?.id ?? null,
        problem: 'No wall within 3 m — a wall-mounted asset needs a wall to fix to.' };
    }
    const { w, p } = best;
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const L = Math.hypot(dx, dz) || 1;
    // wall normal, flipped to point at the room the user tapped in
    let nx = -dz / L, nz = dx / L;
    const target = room ? roomCentre(room) : { x, z };
    if ((target.x - p.px) * nx + (target.z - p.pz) * nz < 0) { nx = -nx; nz = -nz; }
    const off = GEOM.WT / 2 + spec.size.d / 2;
    return {
      x: p.px + nx * off, z: p.pz + nz * off,
      y: base + (spec.mountHeight ?? 1.2),
      rot: Math.atan2(nx, nz),
      wallId: w.id,
      boundaries: 2,                            // wall + floor plane reflection
      room: roomAtPoint(floor, p.px + nx * 0.3, p.pz + nz * 0.3)?.id ?? room?.id ?? null,
    };
  }

  if (mount === 'ceiling' || mount === 'ceiling-recessed') {
    const flush = mount === 'ceiling-recessed';
    return {
      x, z,
      y: base + H - (flush ? spec.size.h / 2 - 0.01 : spec.size.h / 2),
      rot: 0, boundaries: 1, room: room?.id ?? null,
      problem: room ? undefined
        : 'Nothing overhead here — a ceiling mount needs a room with a ceiling above the point.',
    };
  }

  if (mount === 'pendant') {
    return {
      x, z, y: base + H - (spec.dropM ?? 1.6), rot: 0, boundaries: 0, room: room?.id ?? null,
      problem: room ? undefined : 'A pendant needs a ceiling to hang from.',
    };
  }

  if (mount === 'bench') {
    return { x, z, y: base + 0.9 + spec.size.h / 2, rot: 0, boundaries: 1, room: room?.id ?? null };
  }

  // floor
  return {
    x, z,
    y: base + (spec.mountHeight ?? spec.size.h / 2),
    rot: 0,
    boundaries: boundaryCount(floor, x, z, true),
    room: room?.id ?? null,
  };
}
