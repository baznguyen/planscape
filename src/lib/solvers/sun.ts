/** Solar position + clear-sky irradiance (Bird/Hottel simplified) for the site. */
import { SITE } from '../model/building';
import { SOLAR_CONST } from '../model/materials';
import type { Orient } from '../model/building';

export interface SolarState {
  alt: number; az: number;      // radians; az measured clockwise from North
  dni: number; dhi: number; ghi: number;
  isDay: boolean;
}
/** Bureau-style monthly mean max/min for western Sydney (Fairfield). */
export const CLIMATE = {
  tmax: [30.2,29.4,27.8,25.0,21.3,18.2,17.8,19.8,23.1,25.4,27.0,29.1],
  tmin: [18.4,18.5,16.6,12.4,9.1,6.4,5.2,6.0,9.0,11.9,14.6,16.8],
};
/**
 * Asymmetric diurnal profile: minimum at 06:00, maximum at 15:00.
 * Rise is a quarter-sine over 9 h; fall is a half-cosine over the remaining 15 h.
 */
export function outdoorTemp(month: number, minutes: number): number {
  const tx = CLIMATE.tmax[month], tn = CLIMATE.tmin[month];
  const span = tx - tn;
  const h = ((minutes / 60) % 24 + 24) % 24;
  if (h >= 6 && h <= 15) return tn + span * Math.sin((Math.PI / 2) * ((h - 6) / 9));
  const hp = h > 15 ? h : h + 24;                 // 15:00 -> 30:00 (06:00 next day)
  return tx - span * (1 - Math.cos((Math.PI * (hp - 15)) / 15)) / 2;
}
export function solarPosition(month: number, minutes: number): { alt: number; az: number } {
  const rad = Math.PI / 180;
  const dayOfYear = month * 30.4 + 15;
  const decl = 23.45 * rad * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  const hUTC = minutes / 60 - SITE.tz;
  const solarTime = hUTC + SITE.lon / 15;
  const H = (solarTime - 12) * 15 * rad;
  const L = SITE.lat * rad;
  const alt = Math.asin(Math.sin(L) * Math.sin(decl) + Math.cos(L) * Math.cos(decl) * Math.cos(H));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(L) - Math.tan(decl) * Math.cos(L));
  return { alt, az: (azS + Math.PI + 2 * Math.PI) % (2 * Math.PI) }; // 0 = North
}
export function solarState(month: number, minutes: number): SolarState {
  const { alt, az } = solarPosition(month, minutes);
  if (alt <= 0.01) return { alt, az, dni: 0, dhi: 0, ghi: 0, isDay: false };
  const am = 1 / Math.max(Math.sin(alt), 0.05);
  const dni = SOLAR_CONST * Math.pow(0.7, Math.pow(am, 0.678));
  const dhi = 0.12 * dni * Math.sin(alt) + 12;
  const ghi = dni * Math.sin(alt) + dhi;
  return { alt, az, dni, dhi, ghi, isDay: true };
}
/** Surface azimuth (rad from North) for each orientation. +Z is North, +X is East. */
export const ORIENT_AZ: Record<Orient, number> = {
  N: 0, E: Math.PI / 2, S: Math.PI, W: (3 * Math.PI) / 2, H: 0,
};
/** Total irradiance on a surface of the given orientation (W/m2). */
export function surfaceIrradiance(s: SolarState, orient: Orient, groundRefl = 0.2): number {
  if (!s.isDay) return 0;
  if (orient === 'H') return s.ghi;
  const gamma = ORIENT_AZ[orient];
  const cosInc = Math.cos(s.alt) * Math.cos(s.az - gamma);
  const beam = s.dni * Math.max(0, cosInc);
  const diffuse = s.dhi * 0.5;
  const reflected = s.ghi * groundRefl * 0.5;
  return beam + diffuse + reflected;
}

/**
 * Fraction of a window still in sun, given an eave overhang.
 * Uses the vertical shadow angle (profile angle) projected onto the facade.
 */
export function eaveSunlitFraction(
  s: SolarState, orient: Orient, projection = 0.45, headToEave = 0.45, winH = 1.25
): number {
  if (!s.isDay || orient === 'H') return 1;
  const gamma = ORIENT_AZ[orient];
  const dAz = Math.cos(s.az - gamma);
  if (dAz <= 0.01) return 1;                      // sun behind the facade: only diffuse anyway
  const profile = Math.atan(Math.tan(s.alt) / dAz);
  const shadow = projection * Math.tan(profile);  // vertical shadow drop below the eave
  const shaded = Math.max(0, shadow - headToEave);
  return Math.max(0, Math.min(1, 1 - shaded / winH));
}
/** Combined shading: eaves + internal blinds/curtains when the room has them. */
export function shadingFactor(s: SolarState, orient: Orient, hasCurtains: boolean): number {
  const eave = eaveSunlitFraction(s, orient);
  const blind = hasCurtains && s.isDay && s.alt > 0.15 ? 0.45 : 1;   // drawn during the day
  return eave * blind;
}
