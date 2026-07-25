/** Sabine/Eyring RT60 from actual surface materials, furniture and open apertures. */
import { ROOMS, WALLS, ALL_OPENINGS, roomArea, roomHeight, roomVolume, roomById } from '../model/building';
import type { Room, Opening } from '../model/building';
import { MATERIALS, FIXTURES, C_SOUND, type Band } from '../model/materials';

export const BANDS: Band[] = [125, 500, 2000];

export interface RoomAcoustics {
  V: number; S: number;
  A: Record<Band, number>;      // total absorption m2 sabins
  rt60: Record<Band, number>;
  rt60Mid: number;
  schroeder: number;
  modes: { f: number; type: string; n: [number, number, number] }[];
  target: [number, number];
}
/** Absorption of every bounding surface, furniture item and open aperture. */
export function absorption(r: Room, openIds: Set<string>): Record<Band, number> {
  const A = roomArea(r), H = roomHeight(r);
  const perim = 2 * ((r.x1 - r.x0) + (r.z1 - r.z0));
  const wallArea = perim * H;
  const fm = MATERIALS[r.floorMat], cm = MATERIALS[r.ceilMat], wm = MATERIALS.studWall;
  const out = {} as Record<Band, number>;
  for (const b of BANDS) {
    let a = fm.alpha[b] * A + cm.alpha[b] * A + wm.alpha[b] * wallArea;
    for (const f of r.fixtures) a += FIXTURES[f]?.A[b] ?? 0;
    a += r.occupants * FIXTURES.person.A[b];
    // openings: closed uses its own material, open is a perfect absorber (alpha=1)
    for (const o of ALL_OPENINGS) {
      if (o.a !== r.id && o.b !== r.id) continue;
      const area = o.w * o.h;
      const isOpen = openIds.has(o.id) || o.kind === 'cased';
      const m = MATERIALS[isOpen ? 'openAperture' : o.mat];
      a += (m.alpha[b] - wm.alpha[b]) * area;   // replace the wall it displaces
    }
    out[b] = Math.max(a, 0.5);
  }
  return out;
}
export function roomModes(r: Room, limit = 220) {
  const L = r.x1 - r.x0, W = r.z1 - r.z0, H = roomHeight(r);
  const out: { f: number; type: string; n: [number, number, number] }[] = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 3; c++) {
    if (!a && !b && !c) continue;
    const f = (C_SOUND / 2) * Math.sqrt((a / L) ** 2 + (b / W) ** 2 + (c / H) ** 2);
    if (f > limit) continue;
    const deg = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
    out.push({ f, type: deg === 1 ? 'axial' : deg === 2 ? 'tangential' : 'oblique', n: [a, b, c] });
  }
  return out.sort((x, y) => x.f - y.f).slice(0, 12);
}
export function analyseRoom(r: Room, openIds: Set<string>): RoomAcoustics {
  const V = roomVolume(r), A2 = roomArea(r), H = roomHeight(r);
  const perim = 2 * ((r.x1 - r.x0) + (r.z1 - r.z0));
  const S = 2 * A2 + perim * H;
  const A = absorption(r, openIds);
  const rt60 = {} as Record<Band, number>;
  for (const b of BANDS) {
    const abar = A[b] / S;
    // Eyring is more accurate in absorbent rooms; fall back to Sabine when abar is small
    rt60[b] = abar < 0.2 ? (0.161 * V) / A[b] : (0.161 * V) / (-S * Math.log(1 - Math.min(abar, 0.98)));
  }
  const rt = rt60[500];
  return {
    V, S, A, rt60, rt60Mid: rt,
    schroeder: 2000 * Math.sqrt(rt / V),
    modes: roomModes(r),
    target: V < 60 ? [0.3, 0.5] : [0.4, 0.6],
  };
}
/** Sound transmission from a source room to a neighbour, dB reduction. */
export function transmissionLoss(from: Room, to: Room, openIds: Set<string>): number {
  const shared = ALL_OPENINGS.filter(o =>
    (o.a === from.id && o.b === to.id) || (o.a === to.id && o.b === from.id));
  let openA = 0, closedTerm = 0;
  const wallA = 6;
  for (const o of shared) {
    const area = o.w * o.h;
    if (openIds.has(o.id) || o.kind === 'cased') openA += area;
    else closedTerm += area * Math.pow(10, -MATERIALS[o.mat].Rw / 10);
  }
  closedTerm += wallA * Math.pow(10, -MATERIALS.studWall.Rw / 10);
  const tau = (openA * 1.0 + closedTerm) / (wallA + shared.reduce((s, o) => s + o.w * o.h, 0));
  return -10 * Math.log10(Math.max(tau, 1e-9));
}
/** Free-field complex pressure sum for speaker interference. */
export function splField(
  spks: { x: number; z: number; y: number; db: number }[],
  freq: number, x: number, z: number, earH = 1.2
): number {
  const k = (2 * Math.PI * freq) / C_SOUND;
  let re = 0, im = 0;
  for (const s of spks) {
    const A = Math.pow(10, (s.db - 86) / 20);
    const d = Math.max(0.35, Math.hypot(x - s.x, z - s.z, earH - s.y));
    re += (A * Math.cos(-k * d)) / d;
    im += (A * Math.sin(-k * d)) / d;
  }
  return 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-6));
}
