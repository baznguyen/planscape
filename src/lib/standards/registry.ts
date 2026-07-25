import type { StandardsPack } from './types';
import { AU_NSW } from './packs/au';
import { GB_ENG } from './packs/gb';
import { US_IRC } from './packs/us';

/**
 * Research finding: the real key is (country, region, effectiveDate) — not country.
 * AU is on two different NCC editions by state right now; Canada provinces lag NBC
 * by 1–3 years; US AHJs lag NEC/IECC by years. Overlapping transition windows are
 * normal, so resolution must be date-aware.
 */
export const PACKS: StandardsPack[] = [AU_NSW, GB_ENG, US_IRC];

export function resolvePack(country: string, region?: string, on: Date = new Date()): StandardsPack | null {
  const iso = on.toISOString().slice(0, 10);
  const candidates = PACKS.filter(p =>
    p.jurisdiction.country === country &&
    (region ? p.jurisdiction.region === region || !p.jurisdiction.region : true) &&
    p.jurisdiction.effectiveFrom <= iso &&
    (!p.jurisdiction.effectiveTo || p.jurisdiction.effectiveTo >= iso));
  if (!candidates.length) return null;
  // most specific (has region) and most recently effective wins
  candidates.sort((a, b) =>
    (b.jurisdiction.region ? 1 : 0) - (a.jurisdiction.region ? 1 : 0) ||
    b.jurisdiction.effectiveFrom.localeCompare(a.jurisdiction.effectiveFrom));
  return candidates[0];
}
export const listJurisdictions = () => PACKS.map(p => p.jurisdiction);
/** Climate data source that works ANYWHERE with no API key (PVGIS TMY -> EPW). */
export const climateUrl = (lat: number, lon: number) =>
  `https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=${lat}&lon=${lon}&outputformat=epw`;
