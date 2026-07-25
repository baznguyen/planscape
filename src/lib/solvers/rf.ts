/** WiFi coverage: RSSI = EIRP - FSPL - Σ(material attenuation along the ray). */
import { WALLS, ALL_OPENINGS, ROOMS, roomAt } from '../model/building';
import type { RfBand } from '../model/materials';
import { MATERIALS, FIXTURES } from '../model/materials';

export const FSPL_K: Record<RfBand, number> = { '2.4': 40.19, '5': 47.26, '6': 48.01 };
export const TX_EIRP: Record<RfBand, number> = { '2.4': 20, '5': 23, '6': 23 };
export const RSSI_BANDS: [number, string, string][] = [
  [-50, 'Excellent', '#2f8f5f'], [-60, 'Good', '#6fb04a'],
  [-67, 'Usable', '#d2a520'], [-75, 'Marginal', '#d97a2b'], [-999, 'Unusable', '#c4564a'],
];
export interface AP { id: string; name: string; floor: 0 | 1; x: number; z: number; band: RfBand }
export const DEFAULT_APS: AP[] = [
  { id: 'ap1', name: 'AP 1 — Ground rear', floor: 0, x: 9.5, z: 5.5, band: '5' },
  { id: 'ap2', name: 'AP 2 — Ground front', floor: 0, x: 21.5, z: 5.1, band: '5' },
  { id: 'ap3', name: 'AP 3 — First floor', floor: 1, x: 16.5, z: 5.4, band: '5' },
];
function segIntersect(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  const r1 = (bx-ax), r2 = (by-ay), s1 = (dx-cx), s2 = (dy-cy);
  const den = r1*s2 - r2*s1;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx-ax)*s2 - (cy-ay)*s1) / den;
  const u = ((cx-ax)*r2 - (cy-ay)*r1) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
/** Attenuation (dB) along a straight ray, summing every wall/opening it crosses. */
export function pathLossObstacles(
  x1:number, z1:number, x2:number, z2:number, floor:0|1, band:RfBand, openIds:Set<string>
): number {
  let db = 0;
  for (const w of WALLS) {
    if (w.floor !== floor) continue;
    if (!segIntersect(x1, z1, x2, z2, w.x1, w.z1, w.x2, w.z2)) continue;
    // if an opening on this wall is on the ray and open, the ray passes freely
    const via = ALL_OPENINGS.find(o => o.wallId === w.id &&
      segIntersect(x1, z1, x2, z2, o.x - 0.001, o.z - 0.001, o.x + 0.001, o.z + 0.001));
    if (via && (openIds.has(via.id) || via.kind === 'cased')) continue;
    db += MATERIALS[w.mat].rf[band];
  }
  // furniture in the rooms along the way
  const mid = roomAt(floor, (x1 + x2) / 2, (z1 + z2) / 2);
  if (mid) for (const f of mid.fixtures) db += (FIXTURES[f]?.rfDb ?? 0) * 0.35;
  return db;
}
export function rssiAt(
  aps: AP[], x: number, z: number, floor: 0 | 1, band: RfBand, openIds: Set<string>
): { rssi: number; ap: AP | null } {
  let best = -999, bestAp: AP | null = null;
  for (const ap of aps) {
    const d2 = Math.hypot(x - ap.x, z - ap.z);
    const sameFloor = ap.floor === floor;
    const d = Math.max(1, Math.hypot(d2, sameFloor ? 0 : 3.05));
    const fspl = 20 * Math.log10(d) + FSPL_K[band];
    let obst = sameFloor
      ? pathLossObstacles(ap.x, ap.z, x, z, floor, band, openIds)
      : MATERIALS.timberFloor.rf[band] + pathLossObstacles(ap.x, ap.z, x, z, ap.floor, band, openIds) * 0.5;
    const v = TX_EIRP[band] - fspl - obst - 3;
    if (v > best) { best = v; bestAp = ap; }
  }
  return { rssi: best, ap: bestAp };
}
export const rssiLabel = (v: number) => RSSI_BANDS.find(b => v >= b[0]) ?? RSSI_BANDS[RSSI_BANDS.length - 1];
