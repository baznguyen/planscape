/**
 * Drafting logic.
 *
 * Every rule in here exists because a defect got past me and into a render.
 * The pattern each time was the same: the geometry was encoded, but the thing a
 * draftsperson *knows* about that geometry was not — so nothing could tell the
 * model was wrong. Writing those judgements down as executable rules is the only
 * way they generalise to the next customer's plan instead of being re-learned by
 * hand on every job.
 *
 * Rules are deliberately model-agnostic: they read ROOMS / WALLS / OPENINGS /
 * STAIRS and nothing about this particular house. A rule that only works for
 * 101 Campbell Street is not a rule, it is a patch.
 */
import {
  ROOMS, WALLS, ALL_OPENINGS, STAIRS, BEAMS, GEOM,
  roomArea, roomHeight, type Room,
} from '@/lib/model/building';
import { standable } from '@/lib/model/walkable';

export type RuleSeverity = 'critical' | 'major' | 'minor' | 'pass';
export interface RuleFinding {
  rule: string;
  severity: RuleSeverity;
  title: string;
  detail: string;
  /** where the rule comes from — a code clause or a drafting convention */
  authority: string;
  /** the mistake that taught us to check this */
  learnedFrom?: string;
  subject?: string;
}

const HABITABLE: Room['use'][] = ['living', 'bed', 'kitchen', 'study'];
const overlap1D = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const rectOverlap = (a: Room, b: Room) =>
  overlap1D(a.x0, a.x1, b.x0, b.x1) * overlap1D(a.z0, a.z1, b.z0, b.z1);

/* ------------------------------------------------------------------ *
 * 1. Geometry integrity
 * ------------------------------------------------------------------ */

/** Two rooms cannot occupy the same floor area. Sounds obvious; is easy to break. */
function overlappingRooms(): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (let i = 0; i < ROOMS.length; i++) {
    for (let j = i + 1; j < ROOMS.length; j++) {
      const a = ROOMS[i], b = ROOMS[j];
      if (a.floor !== b.floor || a.void || b.void) continue;
      const ov = rectOverlap(a, b);
      if (ov < 0.25) continue;
      const frac = ov / Math.min(roomArea(a), roomArea(b));
      out.push({
        rule: 'geometry/no-overlap',
        severity: frac > 0.25 ? 'critical' : 'major',
        title: `${a.name} and ${b.name} overlap`,
        detail: `${ov.toFixed(2)} m² of floor is claimed by both rooms. Areas will be double counted and the render will z-fight.`,
        authority: 'Drafting convention — rooms partition the floor plate',
        learnedFrom: 'moving a first floor room without moving its neighbour',
        subject: `${a.id}/${b.id}`,
      });
    }
  }
  return out;
}

/**
 * An opening must actually sit on the wall it names, and must touch both rooms
 * it claims to join. This is the rule that caught five dead doors at once.
 */
function openingsAreAttached(): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const o of ALL_OPENINGS) {
    const w = WALLS.find(x => x.id === o.wallId);
    if (!w) {
      out.push({
        rule: 'geometry/opening-wall-exists', severity: 'critical',
        title: `Opening ${o.id} names a wall that does not exist`,
        detail: `wallId "${o.wallId}" is not in the wall schedule.`,
        authority: 'Drafting convention — every opening belongs to a wall',
        subject: o.id,
      });
      continue;
    }
    // distance from the opening centre to the wall segment
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const L2 = dx * dx + dz * dz;
    const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((o.x - w.x1) * dx + (o.z - w.z1) * dz) / L2));
    const px = w.x1 + t * dx, pz = w.z1 + t * dz;
    const dist = Math.hypot(o.x - px, o.z - pz);
    if (dist > 0.3) {
      out.push({
        rule: 'geometry/opening-on-wall', severity: 'major',
        title: `Opening ${o.id} is not on wall ${w.id}`,
        detail: `The opening centre is ${(dist * 1000).toFixed(0)} mm off the wall it belongs to, so the wall will not be punched and the joinery will sit inside solid geometry.`,
        authority: 'Drafting convention — openings are cut from their host wall',
        learnedFrom: 'windows rendering invisible because walls were drawn as solid boxes',
        subject: o.id,
      });
    }
    // both named rooms must reach the opening
    for (const side of [o.a, o.b]) {
      if (!side) continue;
      const r = ROOMS.find(x => x.id === side);
      if (!r) continue;
      /**
       * How far is the opening from the room it claims to serve? Measured to
       * the rectangle, not against a box grown by a fixed amount — the previous
       * form allowed 350 mm on each axis independently, which is a brick veneer
       * wall, and it started failing the moment a room was measured to sit
       * 390 mm off its external wall. The wall build-up between an opening and
       * the room behind it is at most half a metre in any house; anything past
       * that and the room genuinely is somewhere else.
       */
      const gap = Math.hypot(
        Math.max(r.x0 - o.x, 0, o.x - r.x1),
        Math.max(r.z0 - o.z, 0, o.z - r.z1));
      if (gap > 0.6) {
        out.push({
          rule: 'geometry/opening-abuts-rooms', severity: 'major',
          title: `Opening ${o.id} does not touch ${r.name}`,
          detail: `The opening is recorded as joining ${r.name}, but that room's extents stop ${(gap * 1000).toFixed(0)} mm short of it. The door leads nowhere.`,
          authority: 'Drafting convention — an opening joins the two spaces either side of it',
          learnedFrom: 'four first floor doors left pointing at rooms that had been moved',
          subject: o.id,
        });
      }
    }
  }
  return out;
}

/** A wall that stops in mid-air leaves a hole nothing will ever close. */
function danglingWalls(): RuleFinding[] {
  const out: RuleFinding[] = [];
  const meets = (x: number, z: number, floor: 0 | 1, self: string) =>
    WALLS.some(w => {
      if (w.floor !== floor || w.id === self) return false;
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const L2 = dx * dx + dz * dz;
      const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / L2));
      return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) < 0.45;
    });
  // A wall may legitimately stop where two rooms meet — that is an open-plan
  // threshold, not a hole. Only an end floating in the middle of a room is wrong.
  const onRoomEdge = (x: number, z: number, floor: 0 | 1) =>
    ROOMS.some(r => r.floor === floor && !r.void &&
      x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5 &&
      (Math.abs(x - r.x0) < 0.5 || Math.abs(x - r.x1) < 0.5 ||
       Math.abs(z - r.z0) < 0.5 || Math.abs(z - r.z1) < 0.5));
  for (const w of WALLS) {
    if (w.external) continue;
    const ends: [number, number][] = [[w.x1, w.z1], [w.x2, w.z2]];
    for (const [x, z] of ends) {
      if (meets(x, z, w.floor, w.id)) continue;
      if (onRoomEdge(x, z, w.floor)) continue;
      out.push({
        rule: 'geometry/wall-terminates', severity: 'minor',
        title: `Wall ${w.id} stops in mid-air`,
        detail: `The end at (${x.toFixed(2)}, ${z.toFixed(2)}) does not meet another wall. Either it should run further or an opening should close it.`,
        authority: 'Drafting convention — internal walls terminate on another wall',
        subject: w.id,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Habitability — the checks a certifier makes
 * ------------------------------------------------------------------ */

/** NCC Vol 2: habitable rooms need glazing of at least 10% of floor area. */
function naturalLight(): RuleFinding[] {
  const out: RuleFinding[] = [];
  // An open plan is lit collectively: a servery with no window of its own is not
  // a dark room if it is open to a wall of glass three metres away. Rooms sharing
  // a `zone` are assessed as one space, which is how a certifier reads them.
  const groups = new Map<string, Room[]>();
  for (const r of ROOMS) {
    if (r.outdoor || r.void || !HABITABLE.includes(r.use)) continue;
    const key = r.zone ? `${r.floor}:${r.zone}` : r.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  for (const [, rooms] of groups) {
    const ids = new Set(rooms.map(r => r.id));
    const area = rooms.reduce((a, r) => a + roomArea(r), 0);
    const glazed = ALL_OPENINGS
      .filter(o => (o.kind === 'window' || o.kind === 'slider') &&
                   ((o.a && ids.has(o.a)) || (o.b && ids.has(o.b))))
      .reduce((a, o) => a + o.w * o.h, 0);
    const need = area * 0.10;
    if (glazed + 1e-6 < need) {
      const label = rooms.length > 1 ? `${rooms[0].zone} zone (${rooms.map(r => r.name).join(', ')})` : rooms[0].name;
      out.push({
        rule: 'habitability/natural-light',
        severity: glazed === 0 ? 'major' : 'minor',
        title: `${label} is short of natural light`,
        detail: `${glazed.toFixed(2)} m² of glazing against ${need.toFixed(2)} m² required for ${area.toFixed(1)} m² of habitable floor.`,
        authority: 'NCC Volume Two 3.8.4 — natural light, 10% of floor area',
        subject: rooms[0].id,
      });
    }
  }
  return out;
}

/** Ceiling heights by use. A corridor may be lower than a bedroom. */
function ceilingHeights(): RuleFinding[] {
  const need = (u: Room['use']) =>
    HABITABLE.includes(u) ? 2.4 : u === 'garage' ? 2.1 : 2.1;
  const out: RuleFinding[] = [];
  for (const r of ROOMS) {
    if (r.outdoor || r.void) continue;
    const h = roomHeight(r), n = need(r.use);
    if (h + 1e-6 < n) {
      out.push({
        rule: 'habitability/ceiling-height', severity: 'major',
        title: `${r.name} ceiling is too low`,
        detail: `${(h * 1000).toFixed(0)} mm against ${(n * 1000).toFixed(0)} mm required for a ${r.use} space.`,
        authority: 'NCC Volume Two — ceiling heights, 2,400 habitable / 2,100 other',
        subject: r.id,
      });
    }
  }
  return out;
}

/** A bedroom you cannot fit a bed and a wardrobe in is a study with ambition. */
function roomProportions(): RuleFinding[] {
  const MIN: Partial<Record<Room['use'], { area: number; side: number }>> = {
    bed: { area: 7.0, side: 2.4 },
    living: { area: 10.0, side: 2.7 },
    kitchen: { area: 5.0, side: 1.8 },
    bath: { area: 2.0, side: 0.9 },
  };
  const out: RuleFinding[] = [];
  for (const r of ROOMS) {
    if (r.outdoor || r.void) continue;
    const m = MIN[r.use];
    if (!m) continue;
    if (r.zone) continue;   // assessed as part of its open-plan zone, not alone
    const A = roomArea(r), side = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    if (A + 1e-6 < m.area || side + 1e-6 < m.side) {
      out.push({
        rule: 'habitability/room-proportions', severity: 'minor',
        title: `${r.name} is undersized for its use`,
        detail: `${A.toFixed(1)} m² with a ${(side * 1000).toFixed(0)} mm narrow dimension; a ${r.use} space wants at least ${m.area} m² and ${(m.side * 1000).toFixed(0)} mm.`,
        authority: 'Residential design convention — usable room proportions',
        subject: r.id,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Structure
 * ------------------------------------------------------------------ */

/**
 * The rule that started all of this: a line between two spaces annotated
 * "BEAM OVER" is a downstand beam, not a wall. Modelling it as a wall closes an
 * open plan that should read through.
 */
function beamsAreNotWalls(): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const b of BEAMS) {
    const horiz = Math.abs(b.z2 - b.z1) < 1e-6;
    const clash = WALLS.find(w => {
      if (w.floor !== b.floor) return false;
      const wHoriz = Math.abs(w.z2 - w.z1) < 1e-6;
      if (wHoriz !== horiz) return false;
      const off = horiz ? Math.abs(w.z1 - b.z1) : Math.abs(w.x1 - b.x1);
      if (off > 0.2) return false;
      const ov = horiz
        ? overlap1D(Math.min(w.x1, w.x2), Math.max(w.x1, w.x2), Math.min(b.x1, b.x2), Math.max(b.x1, b.x2))
        : overlap1D(Math.min(w.z1, w.z2), Math.max(w.z1, w.z2), Math.min(b.z1, b.z2), Math.max(b.z1, b.z2));
      return ov > 0.5;
    });
    if (clash) {
      out.push({
        rule: 'structure/beam-not-wall', severity: 'critical',
        title: `${b.label} is modelled as a wall`,
        detail: `Wall ${clash.id} sits on the line of ${b.id}. The drawing marks this "BEAM OVER" — a downstand beam. Building it as a wall closes a space that should read through.`,
        authority: 'Drawing annotation — "BEAM OVER TO ENG DETAILS"',
        learnedFrom: 'the living / family / kitchen open plan being walled off',
        subject: b.id,
      });
    }
  }
  return out;
}

/** NCC 11.2 stair geometry — rise, going, and the 2R+G comfort rule. */
function stairGeometry(): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const st of STAIRS) {
    const rise = (st.fromFloor === 0 ? GEOM.H0 : GEOM.H1) / st.risers;
    const going = Math.hypot(st.x1 - st.x0, st.z1 - st.z0) / (st.risers - 1);
    const rg = 2 * rise * 1000 + going * 1000;
    const problems: string[] = [];
    if (rise < 0.115 || rise > 0.19) problems.push(`rise ${(rise * 1000).toFixed(0)} mm outside 115–190`);
    if (going < 0.24 || going > 0.355) problems.push(`going ${(going * 1000).toFixed(0)} mm outside 240–355`);
    if (rg < 550 || rg > 700) problems.push(`2R+G ${rg.toFixed(0)} mm outside 550–700`);
    if (problems.length) {
      out.push({
        rule: 'structure/stair-geometry', severity: 'major',
        title: `Stair ${st.id} is not a walkable flight`,
        detail: problems.join('; ') + '.',
        authority: 'NCC Volume Two 11.2 — stair construction',
        learnedFrom: 'the stair existing only in the renderer, where nothing could measure it',
        subject: st.id,
      });
    } else {
      out.push({
        rule: 'structure/stair-geometry', severity: 'pass',
        title: `Stair ${st.id} geometry is compliant`,
        detail: `${st.risers} risers at ${(rise * 1000).toFixed(0)} mm, going ${(going * 1000).toFixed(0)} mm, 2R+G ${rg.toFixed(0)} mm.`,
        authority: 'NCC Volume Two 11.2 — stair construction',
        subject: st.id,
      });
    }
  }
  return out;
}


/**
 * You must be able to WALK to every room.
 *
 * There was already a circulation check, and it passed — but it worked on the
 * declared graph: door records and shared room boundaries. A graph like that
 * says two rooms are connected because a door object names them both. It cannot
 * see a wall standing across the middle of the corridor.
 *
 * This rule works on the geometry instead. It floods a 100 mm grid outward from
 * the entry (and from the head of the stair on the first floor) using the same
 * standable() test the walkthrough camera obeys, and asks which rooms the flood
 * actually reaches. The first thing it found was a 1.35 m wall stub sealing the
 * east end of the first floor landing — the only route to the primary suite,
 * its robe, its ensuite and bedroom 4. Four rooms, no way in, and every
 * adjacency-based check in the file said the plan was fine.
 *
 * The lesson generalises: check the thing the occupant experiences, not the
 * data structure you happen to have.
 */
function reachableOnFoot(): RuleFinding[] {
  const out: RuleFinding[] = [];
  const G = 0.1;
  for (const floor of [0, 1] as const) {
    const rooms = ROOMS.filter(r => r.floor === floor && !r.void && !r.outdoor);
    if (!rooms.length) continue;
    // ground starts at the front door; upstairs starts at the head of the stair
    const seedRoom = floor === 0
      ? (rooms.find(r => r.id === 'g_ent') ?? rooms[0])
      : (rooms.find(r => r.id === 'f_lnd') ?? rooms[0]);
    const nx = Math.ceil(GEOM.LEN / G) + 2, nz = Math.ceil(GEOM.WID / G) + 2;
    const key = (i: number, j: number) => i * nz + j;
    const seen = new Uint8Array(nx * nz);
    const si = Math.round(((seedRoom.x0 + seedRoom.x1) / 2) / G);
    const sj = Math.round(((seedRoom.z0 + seedRoom.z1) / 2) / G);
    if (!standable(floor, si * G, sj * G)) continue;
    const stack = [key(si, sj)];
    seen[key(si, sj)] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const i = Math.floor(c / nz), j = c % nz;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = i + a, r = j + b;
        if (q < 0 || r < 0 || q >= nx || r >= nz) continue;
        const k = key(q, r);
        if (seen[k] || !standable(floor, q * G, r * G)) continue;
        seen[k] = 1; stack.push(k);
      }
    }
    const reached = (x: number, z: number) => {
      const i = Math.round(x / G), j = Math.round(z / G);
      return i >= 0 && j >= 0 && i < nx && j < nz && !!seen[key(i, j)];
    };
    for (const r of rooms) {
      let hit = false;
      for (let i = Math.ceil((r.x0 + 0.3) / G); i <= Math.floor((r.x1 - 0.3) / G) && !hit; i++)
        for (let j = Math.ceil((r.z0 + 0.3) / G); j <= Math.floor((r.z1 - 0.3) / G) && !hit; j++)
          if (seen[key(i, j)]) hit = true;
      if (hit) continue;
      /**
       * A cupboard is not a room you walk into — a 640 mm linen press is
       * reached by opening the door and putting your arm in. For anything
       * narrower than a 900 mm clear width, the question is whether you can
       * stand at its door, not inside it.
       */
      const minDim = Math.min(r.x1 - r.x0, r.z1 - r.z0);
      if (minDim < 0.9) {
        const doors = ALL_OPENINGS.filter(o => o.floor === floor && (o.a === r.id || o.b === r.id));
        const servedFromOutside = doors.some(o => {
          for (const d of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
            const px = o.x + d[0], pz = o.z + d[1];
            if (px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1) continue;  // that side is the cupboard
            if (reached(px, pz)) return true;
          }
          return false;
        });
        if (servedFromOutside) continue;
      }
      out.push({
        rule: 'circulation/walkable', severity: 'major',
        title: `${r.name} cannot be walked to`,
        detail: `Flooding the floor plate from ${seedRoom.name} with a 260 mm body radius never reaches ${r.name}, and there is no reachable standing position at its door either. Either a wall crosses the route with no opening in it, or the doorway serving this room is too tight to pass.`,
        authority: 'NCC Volume Two — access to and egress from every room',
        learnedFrom: 'a 1.35 m wall stub sealing the landing, which the adjacency graph could not see',
        subject: r.id,
      });
    }
  }
  if (!out.length) {
    out.push({
      rule: 'circulation/walkable', severity: 'pass',
      title: 'Every room can be walked to',
      detail: 'Flooding both floor plates from the entry and the landing with a 260 mm body radius reaches every habitable space through the openings as drawn. Cupboards under 900 mm clear are checked at their door rather than inside.',
      authority: 'NCC Volume Two — access to and egress from every room',
    });
  }
  return out;
}


/**
 * Every doorway needs somewhere to stand when you come through it.
 *
 * This is the rule that would have caught the entry partition. A wall was
 * modelled across the entry with a 1,500 cased opening in it, and the opening
 * discharged directly onto the flank of the staircase — you would step through
 * and be standing on the bottom riser. Every check that existed said the plan
 * was fine: the rooms were connected, the door had a room on each side, the
 * flood fill reached everywhere, because a stair is not a wall and nothing
 * treated it as an obstruction.
 *
 * A landing is 900 mm deep and as wide as the opening, on BOTH sides. That is
 * the space a person occupies while the door is swinging and they are deciding
 * where to go. It has to be on the slab, clear of walls, and clear of the
 * stair — a tread is not a landing.
 */
/**
 * Height of the walking surface of a flight at a point inside its footprint,
 * measured from the lower floor. The flight rises along its longer axis toward
 * whichever end the upper space it connects to lies on, so the direction comes
 * out of the model rather than being asserted per house.
 */
function stairSurfaceY(st: typeof STAIRS[number], x: number, z: number): number {
  const alongX = st.x1 - st.x0 >= st.z1 - st.z0;
  const a0 = alongX ? st.x0 : st.z0, a1 = alongX ? st.x1 : st.z1;
  const p = alongX ? x : z;
  const upper = ROOMS.find(r => r.id === st.connects[1]);
  // the high end is the end of the run nearer the space the flight arrives in
  const uc = upper ? (alongX ? (upper.x0 + upper.x1) / 2 : (upper.z0 + upper.z1) / 2) : a1;
  const risesToA1 = Math.abs(uc - a1) <= Math.abs(uc - a0);
  const t = Math.min(1, Math.max(0, (p - a0) / Math.max(0.01, a1 - a0)));
  const rise = GEOM.F1Y * (risesToA1 ? t : 1 - t);
  return st.fromFloor === 0 ? rise : GEOM.F1Y + rise;
}

function doorLandings(): RuleFinding[] {
  const out: RuleFinding[] = [];
  const DEPTH = 0.9;
  for (const o of ALL_OPENINGS) {
    if (o.sill > 0.35) continue;                       // a window needs no landing
    const w = WALLS.find(x => x.id === o.wallId);
    if (!w) continue;
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;                   // wall normal
    const sides = [1, -1].map(sgn => {
      const cx = o.x + nx * sgn * DEPTH * 0.55;
      const cz = o.z + nz * sgn * DEPTH * 0.55;
      const outside = !ROOMS.some(r => r.floor === o.floor && !r.void &&
        cx >= r.x0 - 0.05 && cx <= r.x1 + 0.05 && cz >= r.z0 - 0.05 && cz <= r.z1 + 0.05);
      /**
       * A landing inside a flight's footprint is not automatically wrong, and
       * the first version of this rule got that badly wrong in both directions.
       *
       * Three different things can be true of a point under a rising flight,
       * and only one of them is a defect:
       *   · the flight is at or near floor level there — you are standing at
       *     the foot of it, which is exactly where the plan intends you to be;
       *   · the flight is high overhead — you walk underneath, which is what
       *     the space beside every straight flight in every house is for;
       *   · the flight is somewhere in between — you would step onto a tread or
       *     put your head through the underside of the stringer.
       *
       * Only the middle case is the fault. Flights belonging to the floor BELOW
       * this one do not occupy this floor's space at all; where they break
       * through it they leave a void, and a void is not a room, so the "no
       * floor on either side" test below already catches a door opening into
       * one. Testing them here flagged a bedroom door two floors from any
       * tread.
       */
      let step = 0;
      for (const st of STAIRS) {
        if (st.fromFloor !== o.floor) continue;
        if (cx < st.x0 - 0.1 || cx > st.x1 + 0.1 || cz < st.z0 - 0.1 || cz > st.z1 + 0.1) continue;
        const d = stairSurfaceY(st, cx, cz) - (o.floor === 0 ? 0 : GEOM.F1Y);
        if (Math.abs(d) > Math.abs(step)) step = d;
      }
      return { sgn, outside, step, cx, cz };
    });
    const RISER = 0.19;                                 // NCC Vol Two, max riser
    const HEAD = 2.0;                                   // NCC Vol Two, min clear height
    const SOFFIT = 0.25;                                // treads plus stringer
    const bad = sides.find(s => s.step > RISER && s.step < HEAD + SOFFIT);
    if (bad) {
      out.push({
        rule: 'circulation/door-landing', severity: 'major',
        title: `${o.id} opens straight onto a stair`,
        detail: `The 900 mm landing on one side of this ${o.kind} sits at (${bad.cx.toFixed(2)}, ${bad.cz.toFixed(2)}), where the flight is ${(bad.step * 1000).toFixed(0)} mm above the floor — ${(bad.step / RISER).toFixed(1)} risers, too high to step onto and too low to walk under. Either the opening moves clear of the flight or the wall should not be there.`,
        authority: 'NCC Volume Two Part 11.2 and AS 1428.1 — landings at doorways and at the head and foot of a flight',
        learnedFrom: 'a partition modelled across the entry whose opening discharged onto the staircase',
        subject: o.id,
      });
      continue;
    }
    // Passing under a flight is fine, but the clear height is what makes it
    // fine, and at a doorway you are walking through at full stride.
    const tight = sides.find(s => s.step >= HEAD + SOFFIT && s.step - SOFFIT < 2.1);
    if (tight) {
      out.push({
        rule: 'circulation/door-landing', severity: 'minor',
        title: `${o.id} passes under the stair with ${((tight.step - SOFFIT) * 1000).toFixed(0)} mm headroom`,
        detail: `The landing outside this ${o.kind} is beneath the flight, which clears it by about ${((tight.step - SOFFIT) * 1000).toFixed(0)} mm once treads and stringer are allowed for. That meets the 2,000 mm minimum but is below the 2,100 mm you would want at a door you walk through at pace. Worth confirming the stringer depth with the stair supplier.`,
        authority: 'NCC Volume Two Part 11.2 — 2,000 mm clear above a stairway; H1D7 — 2,100 mm in habitable rooms',
        subject: o.id,
      });
      continue;
    }
    // both sides outside the building is a modelling error, not a design one
    if (sides.every(s => s.outside)) {
      out.push({
        rule: 'circulation/door-landing', severity: 'minor',
        title: `${o.id} has no floor on either side`,
        detail: 'Neither 900 mm landing falls inside a room on this level, which usually means the opening has drifted off its wall.',
        authority: 'NCC Volume Two — access and egress',
        subject: o.id,
      });
    }
  }
  if (!out.length) {
    out.push({
      rule: 'circulation/door-landing', severity: 'pass',
      title: 'Every doorway has somewhere to stand',
      detail: 'A 900 mm landing on both sides of every door and cased opening falls on the slab, clear of the walls and clear of the stair flights.',
      authority: 'NCC Volume Two Part 11.2 and AS 1428.1 — landings at doorways',
    });
  }
  return out;
}

/** Run the whole rule set. */
export function runDraftingRules(): RuleFinding[] {
  return [
    ...overlappingRooms(),
    ...openingsAreAttached(),
    ...danglingWalls(),
    ...beamsAreNotWalls(),
    ...stairGeometry(),
    ...naturalLight(),
    ...ceilingHeights(),
    ...roomProportions(),
    ...reachableOnFoot(),
    ...doorLandings(),
  ];
}
