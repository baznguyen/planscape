/** Illuminance via the lumen method, with UF derived from room index + real surface reflectances. */
import { ROOMS, roomArea, roomHeight, roomById } from '../model/building';
import { assetById } from '../model/assets';
import type { Room } from '../model/building';
import { MATERIALS } from '../model/materials';

/** AS/NZS 1680 maintained illuminance targets (lux). */
export const LUX_TARGET: Record<string, number> = {
  living: 160, kitchen: 320, bed: 100, bath: 200, study: 320,
  hall: 80, laundry: 240, garage: 120, store: 80, outdoor: 0,
};
export const LTYPES = {
  down:  { id:'down',  label:'Downlight',   lm: 900, W: 10, beam: 38, mount:'ceiling', bulbs:1 },
  pend:  { id:'pend',  label:'Pendant',     lm: 800, W: 9,  beam: 60, mount:'drop',    bulbs:3 },
  strip: { id:'strip', label:'LED strip',   lm: 600, W: 8,  beam: 110,mount:'ceiling', bulbs:1 },
  floor: { id:'floor', label:'Floor lamp',  lm: 700, W: 8,  beam: 90, mount:1.5,       bulbs:1 },
  table: { id:'table', label:'Table lamp',  lm: 400, W: 6,  beam: 90, mount:0.62,      bulbs:1 },
  wall:  { id:'wall',  label:'Wall light',  lm: 450, W: 6,  beam: 70, mount:1.8,       bulbs:1 },
  track: { id:'track', label:'Track spot',  lm: 650, W: 7,  beam: 24, mount:'ceiling', bulbs:1 },
} as const;
export type LightType = keyof typeof LTYPES;
export interface Light {
  id: string; type: LightType; floor: 0|1; room: string;
  x: number; z: number; y: number;
  on: boolean; kelvin: number; rgb: string | null; dim: number; bulbs: number;
  /** catalogue id, when the light came from the asset library */
  asset?: string;
}
/** UF table for a typical direct LED luminaire at reference reflectances (0.70/0.50/0.20). */
const UF_TABLE: [number, number][] = [
  [0.60,0.38],[0.80,0.46],[1.00,0.52],[1.25,0.57],[1.50,0.61],
  [2.00,0.66],[2.50,0.69],[3.00,0.71],[4.00,0.74],[5.00,0.76],
];
export function roomIndex(r: Room, workPlane = 0.75): number {
  const L = r.x1 - r.x0, W = r.z1 - r.z0;
  const Hm = Math.max(0.4, roomHeight(r) - workPlane);
  return (L * W) / (Hm * (L + W));
}
export function utilisationFactor(r: Room): number {
  const RI = roomIndex(r);
  let uf = UF_TABLE[0][1];
  for (let i = 0; i < UF_TABLE.length - 1; i++) {
    const [a, ua] = UF_TABLE[i], [b, ub] = UF_TABLE[i + 1];
    if (RI >= a && RI <= b) { uf = ua + ((RI - a) / (b - a)) * (ub - ua); break; }
    if (RI > UF_TABLE[UF_TABLE.length - 1][0]) uf = UF_TABLE[UF_TABLE.length - 1][1];
  }
  // adjust for the room's ACTUAL surface reflectances
  const rc = MATERIALS[r.ceilMat].rho, rf = MATERIALS[r.floorMat].rho, rw = MATERIALS.studWall.rho;
  const factor = 1 + 0.35 * (rc - 0.70) + 0.45 * (rw - 0.50) + 0.15 * (rf - 0.20);
  return Math.max(0.15, Math.min(0.9, uf * factor));
}
export const MAINTENANCE = 0.8;
/** Perceived-brightness square law: a 50% dial reads ~50% bright but is 25% output. */
export const dimToOutput = (dial: number) => dial * dial;
/** Warm-dim: LED shifts toward candlelight as it dims. */
export const warmDim = (dial: number) => Math.max(1800, Math.round(1800 + 900 * Math.sqrt(Math.max(dial, 0.02))));
export function roomIlluminance(
  r: Room, lights: Light[],
  /** mean wall reflectance once paint is applied; omit to use the material default */
  wallRho?: number,
): { lux: number; target: number; lumens: number; uf: number; watts: number } {
  const A = roomArea(r);
  let lm = 0, W = 0;
  for (const l of lights) {
    if (l.room !== r.id || !l.on) continue;
    // a catalogue fitting carries its own datasheet figures; fall back to the
    // generic type table for auto-designed luminaires
    const spec = l.asset ? assetById(l.asset)?.light : undefined;
    const lmEach = spec?.lumens ?? LTYPES[l.type]?.lm ?? 800;
    const wEach = spec?.watts ?? LTYPES[l.type]?.W ?? 10;
    lm += lmEach * l.bulbs * l.dim;
    W += wEach * l.bulbs * l.dim;
  }
  let uf = utilisationFactor(r);
  // A dark wall really does cost you light. Scale the utilisation factor by the
  // painted reflectance against the 0.5 the UF table assumes for walls.
  if (wallRho !== undefined) uf *= Math.max(0.55, Math.min(1.25, 0.55 + wallRho * 0.9));
  return { lux: (lm * uf * MAINTENANCE) / A, target: LUX_TARGET[r.use] ?? 100, lumens: lm, uf, watts: W };
}
/** Beam pool diameter and centre illuminance for one luminaire. */
export function beamPool(l: Light, floorY = 0) {
  const spec = l.asset ? assetById(l.asset)?.light : undefined;
  const t = LTYPES[l.type] ?? { lm: 800, W: 10, beam: 90 };
  const beam = ((spec?.beamDeg ?? t.beam) * Math.PI) / 180;
  const h = Math.max(0.4, l.y - floorY - 0.0);
  const d = 2 * h * Math.tan(beam / 2);
  const omega = 2 * Math.PI * (1 - Math.cos(beam / 2));
  const E = (t.lm * l.bulbs * l.dim) / omega / (h * h);
  return { diameter: d, lux: E };
}
/** Auto-design a downlight grid that hits the AS/NZS 1680 target. */
export function autoDesign(r: Room, floorYOffset = 0): Light[] {
  const A = roomArea(r), H = roomHeight(r);
  const target = LUX_TARGET[r.use] ?? 100;
  const uf = utilisationFactor(r);
  const need = Math.max(1, Math.ceil((target * A) / (LTYPES.down.lm * uf * MAINTENANCE)));
  const L = r.x1 - r.x0, W = r.z1 - r.z0;
  const nx = Math.max(1, Math.round(Math.sqrt((need * L) / W)));
  const nz = Math.max(1, Math.ceil(need / nx));
  const mx = Math.min(0.9, L / (nx * 2)), mz = Math.min(0.9, W / (nz * 2));
  const out: Light[] = [];
  let i = 0;
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    out.push({
      id: `${r.id}_d${i++}`, type: 'down', floor: r.floor, room: r.id,
      x: r.x0 + mx + (L - 2 * mx) * (nx === 1 ? 0.5 : a / (nx - 1)),
      z: r.z0 + mz + (W - 2 * mz) * (nz === 1 ? 0.5 : b / (nz - 1)),
      y: H - 0.06, on: true, kelvin: 3000, rgb: null, dim: 1, bulbs: 1,
    });
  }
  if (r.use === 'kitchen') {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    for (let k = 0; k < 3; k++) out.push({
      id: `${r.id}_p${k}`, type: 'pend', floor: r.floor, room: r.id,
      x: cx - 0.9 + k * 0.9, z: cz + 1.0, y: H - 0.95,
      on: true, kelvin: 2700, rgb: null, dim: 1, bulbs: 3,
    });
  }
  return out;
}
export const AMBIENCE = [
  { name:'Morning', lux:200, kelvin:3500, dim:1.00, exposure:1.00 },
  { name:'Day',     lux:150, kelvin:4000, dim:0.80, exposure:1.05 },
  { name:'Evening', lux:120, kelvin:2700, dim:0.65, exposure:0.95 },
  { name:'Dinner',  lux:80,  kelvin:2500, dim:0.50, exposure:0.90 },
  { name:'Movie',   lux:25,  kelvin:2200, dim:0.22, exposure:0.80 },
  { name:'Night',   lux:6,   kelvin:1900, dim:0.10, exposure:0.72 },
];
export function kelvinToRgb(k: number): [number, number, number] {
  const t = k / 100; let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v: number) => Math.max(0, Math.min(255, v || 0)) / 255;
  return [c(r), c(g), c(b)];
}
