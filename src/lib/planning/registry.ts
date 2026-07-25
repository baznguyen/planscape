import type { PlanningPack, Parcel, Entitlement } from './types';
import { NSW_PLANNING } from './nsw';
import { ENG_PLANNING } from './england';
export const PLANNING_PACKS: PlanningPack[] = [NSW_PLANNING, ENG_PLANNING];
export function resolvePlanning(country: string, region?: string): PlanningPack | null {
  return PLANNING_PACKS.find(p => p.country === country && (!region || p.region === region))
      ?? PLANNING_PACKS.find(p => p.country === country) ?? null;
}
export function assessParcel(parcel: Parcel): { pack: PlanningPack | null; entitlements: Entitlement[] } {
  const pack = resolvePlanning(parcel.country, parcel.region);
  return { pack, entitlements: pack ? pack.assess(parcel) : [] };
}
