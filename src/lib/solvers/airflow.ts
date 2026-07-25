/** Natural ventilation: wind-driven cross flow + buoyancy stack, from OPEN apertures only. */
import { ROOMS, ALL_OPENINGS, roomVolume, roomHeight } from '../model/building';
import type { Room, Opening } from '../model/building';
import { openArea } from './thermal';
import { outdoorTemp } from './sun';

/** Sydney prevailing wind FROM-bearing (deg) and mean speed (m/s) by month. */
export const WIND = [
  [45,4.6],[45,4.4],[70,4.0],[110,3.4],[250,3.1],[250,3.3],
  [250,3.6],[250,3.9],[20,4.1],[35,4.3],[45,4.6],[45,4.8],
] as const;
export const seasonOf = (m: number) =>
  [11,0,1].includes(m) ? 'Summer' : [2,3,4].includes(m) ? 'Autumn' : [5,6,7].includes(m) ? 'Winter' : 'Spring';

export interface RoomAirflow {
  room: string; ach: number; flow: number; openArea: number;
  cross: boolean; effectiveness: string;
}
export function analyseAirflow(month: number, minutes: number, openIds: Set<string>, Tin: Record<string, number>): RoomAirflow[] {
  const [, v] = WIND[month];
  const Tout = outdoorTemp(month, minutes);
  return ROOMS.filter(r => !r.outdoor && !r.void).map(r => {
    const ext = ALL_OPENINGS.filter(o => (o.a === r.id || o.b === r.id) &&
      (o.a === null || o.b === null) && openIds.has(o.id));
    const A = ext.reduce((s, o) => s + openArea(o), 0);
    const orients = new Set(ext.map(o => o.orient));
    const cross = orients.size > 1;
    const Cd = 0.6, SHIELD = 0.35, dCp = cross ? 1.0 : 0.15;
    const Qw = Cd * (cross ? A / 2 : A) * v * SHIELD * Math.sqrt(dCp);
    const dT = Math.abs((Tin[r.id] ?? Tout) - Tout);
    const dh = Math.max(0.6, roomHeight(r) * 0.5);
    const Qs = Cd * (A / 2) * Math.sqrt((2 * 9.81 * dh * dT) / (Tout + 273.15));
    const Q = Math.min(Math.sqrt(Qw * Qw + Qs * Qs), (60 * roomVolume(r)) / 3600);
    const ach = (Q * 3600) / roomVolume(r);
    return {
      room: r.id, ach, flow: Q, openArea: A, cross,
      effectiveness: A === 0 ? 'Sealed' : ach < 2 ? 'Poor' : ach < 5 ? 'Adequate' : ach < 12 ? 'Good' : 'Very high',
    };
  });
}
/** Openable-area compliance: NCC 10.6 requires 5% of floor area openable. */
export function ventCompliance(r: Room, openIds: Set<string>) {
  const all = ALL_OPENINGS.filter(o => (o.a === r.id || o.b === r.id) && (o.a === null || o.b === null));
  const possible = all.reduce((s, o) => s + openArea(o), 0);
  const required = (r.x1 - r.x0) * (r.z1 - r.z0) * 0.05;
  return { possible, required, pass: possible >= required };
}
