/** Cooling / heating load from the actual fabric, glazing and solar gains. */
import { ROOMS, ALL_OPENINGS, roomArea, roomHeight, roomVolume, envelopeOf } from '../model/building';
import type { Room } from '../model/building';
import { MATERIALS, FIXTURES, AIR } from '../model/materials';
import { solarState, surfaceIrradiance, outdoorTemp, shadingFactor } from './sun';

export const DESIGN = { coolOutside: 35, coolInside: 24, heatOutside: 3, heatInside: 20, DF: 0.72, dT: 10 };
export const DUCT = { lpsPerKw: 55, outletMaxLps: 75, faceVel: 2.0 };

export interface RoomLoad {
  room: string; name: string;
  fabricW: number; glassW: number; solarW: number; ventW: number; internalW: number;
  totalKw: number; lps: number; outlets: number; outletDia: number; throwM: number;
}
export function roomLoadAt(r: Room, month: number, minutes: number): RoomLoad {
  const A = roomArea(r), H = roomHeight(r);
  const sun = solarState(month, minutes);
  const dT = DESIGN.coolOutside - DESIGN.coolInside;
  let fabricW = 0, glassW = 0, solarW = 0;
  for (const seg of envelopeOf(r)) {
    const glassA = ALL_OPENINGS.filter(o => o.wallId === seg.wall.id && (o.a === r.id || o.b === r.id))
      .reduce((s, o) => s + o.w * o.h, 0);
    const opaque = Math.max(0, seg.area - glassA);
    const I = surfaceIrradiance(sun, seg.wall.orient);
    fabricW += MATERIALS[seg.wall.mat].U * opaque * (dT + (0.6 * I) / 20);
  }
  fabricW += (r.floor === 1 ? MATERIALS.roofR40.U : MATERIALS.slabOnGround.U) * A * dT;
  for (const o of ALL_OPENINGS) {
    if (o.a !== r.id && o.b !== r.id) continue;
    if (o.a !== null && o.b !== null) continue;
    const m = MATERIALS[o.mat], area = o.w * o.h;
    glassW += m.U * area * dT;
    solarW += area * (m.shgc ?? 0) * surfaceIrradiance(sun, o.orient) * shadingFactor(sun, o.orient, false);
  }
  let internalW = r.occupants * FIXTURES.person.gainW;
  for (const f of r.fixtures) internalW += FIXTURES[f]?.gainW ?? 0;
  const ventW = AIR.rhoCp * ((0.35 * roomVolume(r)) / 3600) * dT;
  const totalW = fabricW + glassW + solarW + ventW + internalW;
  const totalKw = Math.max(0, totalW) / 1000;
  const lps = totalKw * DUCT.lpsPerKw;
  const outlets = Math.max(1, Math.min(4, Math.max(Math.ceil(lps / DUCT.outletMaxLps), Math.ceil(A / 14))));
  const per = lps / outlets;
  const outletDia = per > 60 ? 0.30 : per > 40 ? 0.25 : 0.20;
  const throwM = outletDia >= 0.30 ? 5.2 : outletDia >= 0.25 ? 4.0 : 3.0;
  return { room: r.id, name: r.name, fabricW, glassW, solarW, ventW, internalW, totalKw, lps, outlets, outletDia, throwM };
}
export function systemSummary(floor?: 0 | 1) {
  const rs = ROOMS.filter(r => !r.outdoor && !r.void && r.use !== 'garage' && r.use !== 'store' &&
    (floor === undefined || r.floor === floor));
  const loads = rs.map(r => roomLoad(r));
  const raw = loads.reduce((s, l) => s + l.totalKw, 0);
  const lps = loads.reduce((s, l) => s + l.lps, 0);
  return { loads, rawKw: raw, installedKw: raw * DESIGN.DF, lps };
}
export const EXHAUST = { bath: 25, ensuite: 25, laundry: 40, kitchen: 40 };

/** Design load = worst hour of the design day (blinds open, eaves only). */
export function roomLoad(r: Room, month = 0, minutes?: number): RoomLoad {
  if (minutes !== undefined) return roomLoadAt(r, month, minutes);
  let best = roomLoadAt(r, month, 9 * 60);
  for (let h = 9; h <= 18; h += 1) {
    const c = roomLoadAt(r, month, h * 60);
    if (c.totalKw > best.totalKw) best = c;
  }
  return best;
}
