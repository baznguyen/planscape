/**
 * Transient lumped-capacitance (RC) thermal model — one node per room.
 *   C dT/dt = Qsolar + Qinternal + Qfabric + Qinter + Qvent + Qhvac
 * Every term reads material properties, so changing a wall build-up, a floor
 * finish, or opening a window immediately changes the room temperature.
 */
import { ROOMS, WALLS, ALL_OPENINGS, GEOM, roomArea, roomVolume, roomHeight, envelopeOf, roomById } from '../model/building';
import type { Room, Opening } from '../model/building';
import { MATERIALS, FIXTURES, AIR } from '../model/materials';
import { solarState, surfaceIrradiance, outdoorTemp, shadingFactor, type SolarState } from './sun';

export interface ThermalCtx {
  month: number; minutes: number;
  openIds: Set<string>;
  lightingW: Record<string, number>;
  hvacOn: boolean; setpointCool: number; setpointHeat: number;
  windSpeed: number;      // m/s
  occupancyScale: number; // 0-1
}
export type ThermalState = Record<string, number>;

/** Effective thermal capacitance of a room (J/K): fabric mass + air + furniture. */
export function roomCapacitance(r: Room): number {
  const A = roomArea(r), H = roomHeight(r);
  const fm = MATERIALS[r.floorMat], cm = MATERIALS[r.ceilMat];
  let C = fm.kappa * 1000 * A + cm.kappa * 1000 * A;       // kJ/m2K -> J/K
  const perim = 2 * ((r.x1 - r.x0) + (r.z1 - r.z0));
  C += MATERIALS.studWall.kappa * 1000 * perim * H * 0.5;   // half of each shared wall
  C += AIR.rhoCp * roomVolume(r);
  C += r.fixtures.length * 25000;                            // furniture mass ~25 kJ/K each
  return C;
}
/** Openable free area of an opening in m2 when open. */
export const openArea = (o: Opening) => o.w * o.h * o.openableFrac;

/** Ventilation volume flow into a room from its OPEN external apertures (m3/s). */
export function ventilationFlow(r: Room, ctx: ThermalCtx, Tin: number, Tout: number): number {
  const ext = ALL_OPENINGS.filter(o => o.floor === r.floor && (o.a === r.id || o.b === r.id) &&
    (o.a === null || o.b === null) && ctx.openIds.has(o.id));
  if (!ext.length) return 0.0;
  const A = ext.reduce((s, o) => s + openArea(o), 0);
  const orients = new Set(ext.map(o => o.orient));
  const Cd = 0.6;
  // Local wind speed at the opening is far below the met free-stream: apply a
  // terrain/shielding coefficient for suburban exposure (AS 1170.2 cat. 3).
  const SHIELD = 0.35;
  const cross = orients.size > 1;
  const dCp = cross ? 1.0 : 0.15;
  const Qwind = Cd * (cross ? A / 2 : A) * ctx.windSpeed * SHIELD * Math.sqrt(dCp);
  // stack driven
  const dT = Math.abs(Tin - Tout);
  const dh = Math.max(0.6, roomHeight(r) * 0.5);
  const Qstack = Cd * (A / 2) * Math.sqrt((2 * 9.81 * dh * dT) / (Tout + 273.15));
  const Q = Math.sqrt(Qwind * Qwind + Qstack * Qstack);
  // Above ~60 ACH the room is effectively at outdoor conditions; the exact
  // figure is meaningless and the lumped model is out of its valid range.
  const maxQ = (60 * roomVolume(r)) / 3600;
  return Math.min(Q, maxQ);
}
/** Conductance (W/K) between two rooms through shared walls + any open door. */
export function interRoomUA(a: Room, b: Room, ctx: ThermalCtx): number {
  const shared = ALL_OPENINGS.filter(o =>
    (o.a === a.id && o.b === b.id) || (o.a === b.id && o.b === a.id));
  if (!shared.length) return 0;
  let ua = 0;
  for (const o of shared) {
    if (ctx.openIds.has(o.id) || o.kind === 'cased') {
      // open doorway: convective exchange, treat as large effective UA
      ua += AIR.rhoCp * 0.045 * openArea(o);
    } else {
      ua += MATERIALS[o.mat].U * o.w * o.h;
    }
  }
  ua += MATERIALS.studWall.U * 4;   // residual conduction through the shared wall
  return ua;
}
export function initialState(ctx: ThermalCtx): ThermalState {
  const T0 = outdoorTemp(ctx.month, ctx.minutes);
  const s: ThermalState = {};
  for (const r of ROOMS) s[r.id] = r.outdoor ? T0 : T0 + 1.5;
  return s;
}
export interface RoomThermalBreakdown {
  T: number; qSolar: number; qInternal: number; qFabric: number;
  qVent: number; qInter: number; qHvac: number; ach: number;
}
/** Advance the whole model by dt seconds. Returns new state + per-room breakdown. */
/** Largest stable explicit-Euler step for the stiffest room (CFL-style guard). */
export function maxStableStep(ctx: ThermalCtx): number {
  let worst = Infinity;
  for (const r of ROOMS) {
    if (r.outdoor || r.void) continue;
    let ua = 4;
    for (const o of ROOMS) if (o.id !== r.id && !o.outdoor && !o.void) ua += interRoomUA(r, o, ctx);
    for (const seg of envelopeOf(r)) ua += MATERIALS[seg.wall.mat].U * seg.area;
    ua += AIR.rhoCp * (0.35 * roomVolume(r)) / 3600;
    // purpose-provided ventilation dominates stiffness when windows are open
    ua += AIR.rhoCp * ventilationFlow(r, ctx, 30, 22);
    worst = Math.min(worst, roomCapacitance(r) / Math.max(ua, 1));
  }
  return Math.max(5, worst * 0.35);
}
/** Public entry: splits dt into stable sub-steps so the model cannot oscillate. */
export function stepThermal(state: ThermalState, ctx: ThermalCtx, dt: number) {
  const hMax = maxStableStep(ctx);
  const n = Math.max(1, Math.min(400, Math.ceil(dt / hMax)));
  const h = dt / n;
  let out = stepOnce(state, ctx, h);
  for (let i = 1; i < n; i++) out = stepOnce(out.state, ctx, h);
  return out;
}
function stepOnce(state: ThermalState, ctx: ThermalCtx, dt: number) {
  const Tout = outdoorTemp(ctx.month, ctx.minutes);
  const sun = solarState(ctx.month, ctx.minutes);
  const next: ThermalState = {};
  const detail: Record<string, RoomThermalBreakdown> = {};
  for (const r of ROOMS) {
    if (r.outdoor || r.void) { next[r.id] = Tout; continue; }
    const T = state[r.id] ?? Tout;
    const A = roomArea(r), H = roomHeight(r);
    // ---- fabric (opaque external) ----
    let qFabric = 0;
    for (const seg of envelopeOf(r)) {
      const m = MATERIALS[seg.wall.mat];
      const glassA = ALL_OPENINGS.filter(o => o.wallId === seg.wall.id && (o.a === r.id || o.b === r.id))
        .reduce((s, o) => s + o.w * o.h, 0);
      const opaque = Math.max(0, seg.area - glassA);
      // sol-air temperature bump on the opaque skin
      const I = surfaceIrradiance(sun, seg.wall.orient);
      const solAir = Tout + (0.6 * I) / 20;
      qFabric += m.U * opaque * (solAir - T);
    }
    // roof or intermediate floor
    if (r.floor === 1) qFabric += MATERIALS.roofR40.U * A * ((Tout + (0.7 * surfaceIrradiance(sun, 'H')) / 20) - T);
    else qFabric += MATERIALS.slabOnGround.U * A * ((Tout - 3) - T);   // ground is damped
    // ---- glazing: conduction + solar gain ----
    let qSolar = 0;
    for (const o of ALL_OPENINGS) {
      if (o.floor !== r.floor) continue;
      if (o.a !== r.id && o.b !== r.id) continue;
      if (o.a !== null && o.b !== null) continue;    // internal
      const isOpen = ctx.openIds.has(o.id);
      const m = MATERIALS[isOpen ? 'openAperture' : o.mat];
      const area = o.w * o.h;
      const I = surfaceIrradiance(sun, o.orient);
      const sh = shadingFactor(sun, o.orient, r.fixtures.includes('curtain'));
      qSolar += area * (m.shgc ?? 0) * I * sh;
      if (!isOpen) qFabric += m.U * area * (Tout - T);
    }
    // ---- internal gains ----
    let qInternal = ctx.lightingW[r.id] ?? 0;
    for (const f of r.fixtures) qInternal += (FIXTURES[f]?.gainW ?? 0) * ctx.occupancyScale;
    qInternal += r.occupants * FIXTURES.person.gainW * ctx.occupancyScale;
    // ---- ventilation ----
    const V = ventilationFlow(r, ctx, T, Tout);
    const qVent = AIR.rhoCp * V * (Tout - T);
    const infil = (0.35 * roomVolume(r)) / 3600;   // 0.35 ACH background infiltration
    const qInfil = AIR.rhoCp * infil * (Tout - T);
    // ---- inter-room ----
    let qInter = 0;
    for (const o of ROOMS) {
      if (o.id === r.id || o.outdoor || o.void) continue;
      const ua = interRoomUA(r, o, ctx);
      if (ua > 0) qInter += ua * ((state[o.id] ?? Tout) - T);
    }
    // ---- HVAC ----
    let qHvac = 0;
    if (ctx.hvacOn && r.use !== 'garage' && r.use !== 'store') {
      const cap = 120 * A;                       // W of available capacity
      if (T > ctx.setpointCool) qHvac = -Math.min(cap, 350 * (T - ctx.setpointCool) * A * 0.1);
      else if (T < ctx.setpointHeat) qHvac = Math.min(cap, 350 * (ctx.setpointHeat - T) * A * 0.1);
    }
    const Q = qSolar + qInternal + qFabric + qVent + qInfil + qInter + qHvac;
    const C = roomCapacitance(r);
    let Tn = T + (Q / C) * dt;
    if (!isFinite(Tn)) Tn = T;
    next[r.id] = Math.max(-10, Math.min(70, Tn));
    detail[r.id] = {
      T: next[r.id], qSolar, qInternal, qFabric, qVent: qVent + qInfil, qInter, qHvac,
      ach: ((V + infil) * 3600) / roomVolume(r),
    };
  }
  return { state: next, detail, Tout, sun };
}
/** Run the model from a cold start so the display isn't showing a transient. */
export function settle(ctx: ThermalCtx, hours = 48, stepMin = 10): ThermalState {
  let s = initialState(ctx);
  const steps = (hours * 60) / stepMin;
  const c = { ...ctx };
  for (let i = 0; i < steps; i++) {
    c.minutes = (ctx.minutes - (steps - i) * stepMin + 1440 * 10) % 1440;
    s = stepThermal(s, c, stepMin * 60).state;
  }
  return s;
}
