import type { AcousticDescriptor, Pathway, RValue, Ratio, UValue } from './units';

export type MeasureSystem = 'metric' | 'imperial';
/** The compliance target metric is itself jurisdiction-typed. */
export type ThermalTargetKind =
  | 'elementalRU'      // AU/NZ/UK/US/CA — per-element R or U
  | 'ETTV'             // Singapore — envelope thermal transfer value W/m2
  | 'UA_plus_BEI'      // Japan — UA (W/m2K) + primary energy ratio
  | 'referenceBuilding'// Germany/EU — % of a notional reference building
  | 'ratingStars';     // AU NatHERS star rating + Whole-of-Home

export interface Jurisdiction {
  id: string;                 // 'AU-NSW', 'US-CA', 'GB-ENG'
  country: string; region?: string;
  label: string;
  measure: MeasureSystem;
  climateZoneScheme: string | null;  // 'NCC8', 'IECC', 'CA-T24-16', 'JP8', null
  effectiveFrom: string; effectiveTo?: string;
  certifierRequired: true;    // research: ALL jurisdictions require licensed sign-off
  certifierLabel: string;
}
export interface CheckDef {
  id: string; title: string;
  discipline: 'daylight'|'ventilation'|'thermal'|'acoustic'|'egress'|'geometry'|'fire'|'access'|'structure'|'planning';
  clause: string;             // the citable clause, e.g. 'NCC 2022 HP 10.4.2'
  pathway: Pathway[];         // which pathways this check applies under
  severity: 'blocker'|'major'|'minor'|'advisory';
  rationale: string;
}
export interface StandardsPack {
  jurisdiction: Jurisdiction;
  codes: Record<string, { name: string; edition: string }>;
  thermalTarget: ThermalTargetKind;
  /** dimensional predicates as exact rationals */
  minOpenableAreaRatio: Ratio | null;
  minDaylightGlazingRatio: Ratio | null;
  minCeilingHeight: { habitable: number; nonHabitable: number; stair: number };  // metres
  /** acoustic requirement carried WITH its descriptor; never coerced */
  acoustic: { partyWall?: { descriptor: AcousticDescriptor; min: number };
              floor?: { descriptor: AcousticDescriptor; min: number };
              impact?: { descriptor: AcousticDescriptor; max: number } } | null;
  /** maintained illuminance targets, lux, by room use */
  illuminance: Record<string, number>;
  /** envelope targets keyed by climate zone; null when the pack uses another metric */
  envelope: Record<string, { wall?: RValue|UValue; roof?: RValue|UValue; glazing?: UValue; shgc?: number }> | null;
  ventilationRates: Record<string, number>;  // L/s by space
  checks: CheckDef[];
  notes: string[];
  /** Non-negotiable disclaimer surfaced on every report. */
  disclaimer: string;
}
export const INDICATIVE_DISCLAIMER =
  'Indicative design review only — not a certification. Every jurisdiction in this ' +
  'system requires a licensed professional to certify compliance. Figures are ' +
  'planning-grade and must be verified against the primary code text before use.';
