/**
 * Circulation analysis.
 *
 * Answers the question a reviewer actually asks first: can a person get from the
 * front door to every room, and is the route wide enough to walk. Geometry that
 * looks right in a render can still be unusable — a staircase dropped into a
 * 1.5 m corridor leaves nowhere to walk past it, and nothing in an area or
 * wall-position check will ever notice.
 */
import { ROOMS, WALLS, ALL_OPENINGS, STAIRS, roomById, type Room } from '@/lib/model/building';
import { doorZones, DOOR_CLEAR_DEPTH } from '@/lib/model/clearance';

/** NCC / AS 1428.1 figures used below. */
export const CIRCULATION_RULES = {
  doorClearWidth: 0.82,      // clear opening to a habitable room
  corridorWidth: 1.0,        // clear width of a circulation corridor
  passingWidth: 0.9,         // clear width past a fixed obstruction
} as const;

export interface Link { a: string; b: string; via: string; width: number }

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Is a wall sitting on the boundary these two rooms share? */
function wallBetween(a: Room, b: Room, axis: 'x' | 'z', at: number, lo: number, hi: number) {
  return WALLS.some(w => {
    if (w.floor !== a.floor) return false;
    if (axis === 'x') {
      if (Math.abs(w.x1 - w.x2) > 1e-6) return false;          // must be a N-S wall
      if (Math.abs(w.x1 - at) > 0.2) return false;
      return overlap(Math.min(w.z1, w.z2), Math.max(w.z1, w.z2), lo, hi) > 0.4;
    }
    if (Math.abs(w.z1 - w.z2) > 1e-6) return false;            // must be an E-W wall
    if (Math.abs(w.z1 - at) > 0.2) return false;
    return overlap(Math.min(w.x1, w.x2), Math.max(w.x1, w.x2), lo, hi) > 0.4;
  });
}

/** Every way of getting from one space to another. */
export function buildLinks(): Link[] {
  const links: Link[] = [];
  // 1. explicit openings between two rooms
  for (const o of ALL_OPENINGS) {
    if (!o.a || !o.b) continue;
    links.push({ a: o.a, b: o.b, via: `${o.kind} ${(o.w * 1000).toFixed(0)} mm`, width: o.w });
  }
  // 2. rooms that simply share an open boundary — the open-plan case, where the
  //    absence of a wall IS the doorway and no opening record exists
  for (let i = 0; i < ROOMS.length; i++) {
    for (let j = i + 1; j < ROOMS.length; j++) {
      const a = ROOMS[i], b = ROOMS[j];
      if (a.floor !== b.floor || a.void || b.void) continue;
      let axis: 'x' | 'z' | null = null, at = 0, lo = 0, hi = 0;
      if (Math.abs(a.x1 - b.x0) < 0.25 || Math.abs(b.x1 - a.x0) < 0.25) {
        axis = 'x'; at = Math.abs(a.x1 - b.x0) < 0.25 ? (a.x1 + b.x0) / 2 : (b.x1 + a.x0) / 2;
        lo = Math.max(a.z0, b.z0); hi = Math.min(a.z1, b.z1);
      } else if (Math.abs(a.z1 - b.z0) < 0.25 || Math.abs(b.z1 - a.z0) < 0.25) {
        axis = 'z'; at = Math.abs(a.z1 - b.z0) < 0.25 ? (a.z1 + b.z0) / 2 : (b.z1 + a.z0) / 2;
        lo = Math.max(a.x0, b.x0); hi = Math.min(a.x1, b.x1);
      }
      if (!axis) continue;
      const shared = hi - lo;
      if (shared < 0.8) continue;
      if (wallBetween(a, b, axis, at, lo, hi)) continue;
      links.push({ a: a.id, b: b.id, via: `open to each other over ${shared.toFixed(2)} m`, width: shared });
    }
  }
  // 3. stairs
  for (const st of STAIRS) {
    links.push({ a: st.connects[0], b: st.connects[1], via: `stair ${(st.width * 1000).toFixed(0)} mm`, width: st.width });
  }
  return links;
}

export interface CirculationResult {
  reachable: Set<string>;
  unreachable: Room[];
  /** corridors whose remaining clear width is below the rule */
  pinchPoints: { room: Room; clear: number; required: number; cause: string }[];
  /** doors too narrow for the room they serve */
  narrowDoors: { openingId: string; room: string; width: number; required: number }[];
  /** doors whose keep-clear zone falls outside the rooms they join */
  blockedDoors: { openingId: string; detail: string }[];
  entry: string;
}

export function analyseCirculation(): CirculationResult {
  const links = buildLinks();
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (!adj.has(l.a)) adj.set(l.a, []);
    if (!adj.has(l.b)) adj.set(l.b, []);
    adj.get(l.a)!.push(l.b);
    adj.get(l.b)!.push(l.a);
  }
  // start at the room the front door opens into
  const front = ALL_OPENINGS.find(o => o.id === 'd_entry');
  const entry = front?.a ?? 'g_ent';
  const reachable = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (reachable.has(nx)) continue;
      reachable.add(nx); queue.push(nx);
    }
  }
  const unreachable = ROOMS.filter(r => !r.void && !r.outdoor && !reachable.has(r.id));

  // corridors: how much clear width is left once fixed obstructions are deducted
  const pinchPoints: CirculationResult['pinchPoints'] = [];
  for (const r of ROOMS) {
    if (r.use !== 'hall') continue;
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    let clear = Math.min(w, d);
    let cause = 'corridor width';
    for (const st of STAIRS) {
      const ov = overlap(r.x0, r.x1, st.x0, st.x1) * overlap(r.z0, r.z1, st.z0, st.z1);
      if (ov <= 0.2) continue;
      // the stair runs along the corridor, so it eats the short dimension
      const eaten = d < w ? overlap(r.z0, r.z1, st.z0, st.z1) : overlap(r.x0, r.x1, st.x0, st.x1);
      clear = Math.min(w, d) - eaten;
      cause = `staircase ${st.id} occupies ${eaten.toFixed(2)} m of the corridor`;
    }
    const required = cause === 'corridor width'
      ? CIRCULATION_RULES.corridorWidth : CIRCULATION_RULES.passingWidth;
    if (clear < required) pinchPoints.push({ room: r, clear, required, cause });
  }

  // Doors ON the circulation route. The clear-width rule is about getting into a
  // room from the corridor — it does not apply to a cavity slider between a
  // bedroom and its own robe, which the drawing quite correctly specifies at 720.
  const narrowDoors: CirculationResult['narrowDoors'] = [];
  const HABITABLE = ['bed', 'living', 'kitchen', 'study'];
  for (const o of ALL_OPENINGS) {
    if (o.kind !== 'door') continue;
    const ra = o.a ? roomById(o.a) : null;
    const rb = o.b ? roomById(o.b) : null;
    const fromCirculation = (x: Room | null | undefined) => !x || x.use === 'hall';
    const served = fromCirculation(ra) ? rb : fromCirculation(rb) ? ra : null;
    if (!served || !HABITABLE.includes(served.use)) continue;
    if (o.w + 1e-6 < CIRCULATION_RULES.doorClearWidth) {
      narrowDoors.push({ openingId: o.id, room: served.name, width: o.w, required: CIRCULATION_RULES.doorClearWidth });
    }
  }
  // A door needs floor on both sides to swing into. If its keep-clear zone lands
  // mostly outside every room, the door opens into a wall or a cupboard face.
  const blockedDoors: CirculationResult['blockedDoors'] = [];
  for (const z of doorZones(0).concat(doorZones(1))) {
    const id = z.label.split(' ')[0];
    const o = ALL_OPENINGS.find(x => x.id === id);
    if (!o || o.kind === 'garage') continue;
    const sides = [o.a, o.b].filter(Boolean) as string[];
    if (sides.length < 2) continue;                    // external door, outside is clear
    for (const sid of sides) {
      const r = roomById(sid);
      if (!r) continue;
      // depth of room available on this side of the opening, along the swing axis
      const horizontal = Math.abs(z.x1 - z.x0) > Math.abs(z.z1 - z.z0);
      const avail = horizontal
        ? Math.max(0, Math.min(r.z1, o.z + DOOR_CLEAR_DEPTH) - Math.max(r.z0, o.z - DOOR_CLEAR_DEPTH))
        : Math.max(0, Math.min(r.x1, o.x + DOOR_CLEAR_DEPTH) - Math.max(r.x0, o.x - DOOR_CLEAR_DEPTH));
      if (avail < DOOR_CLEAR_DEPTH * 0.55) {
        blockedDoors.push({ openingId: o.id,
          detail: `${r.name} gives only ${(avail * 1000).toFixed(0)} mm in front of ${o.id}; a door needs ${(DOOR_CLEAR_DEPTH * 1000).toFixed(0)} mm to swing.` });
      }
    }
  }
  return { reachable, unreachable, pinchPoints, narrowDoors, blockedDoors, entry };
}
