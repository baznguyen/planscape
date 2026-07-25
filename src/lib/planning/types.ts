/**
 * Property entitlement model.
 *
 * Research finding that drives this design: "zone -> permitted: true" is WRONG
 * for most of the world.
 *  - England confers no right from a designation at all (discretionary system).
 *  - Germany has no Bebauungsplan over ~60-70% of settled land, and that absence
 *    is itself a legal regime (BauGB s34), not missing data.
 *  - In NSW the controlling rule is frequently a State policy that OVERRIDES the
 *    council land-use table (secondary dwellings come from the Housing SEPP).
 * So entitlement is resolved as a STACK (national -> state -> local -> overlay
 * -> site specific), and the answer is a likelihood + the tests that apply, not
 * a boolean.
 */
export type PlanningSystem = 'binding-zoning' | 'discretionary' | 'hybrid';
export type Likelihood = 'as-of-right' | 'permitted-with-consent' | 'discretionary' | 'prohibited' | 'unknown' | 'no-plan';
export type RuleLevel = 'national' | 'state' | 'local' | 'overlay' | 'site';

export interface DevelopmentType {
  id: string; label: string;
  /** what an investor actually asks */
  question: string;
}
export const DEV_TYPES: DevelopmentType[] = [
  { id:'secondary',  label:'Secondary dwelling (granny flat)', question:'Can I add a granny flat?' },
  { id:'dual',       label:'Dual occupancy',                   question:'Can I build two dwellings?' },
  { id:'multi',      label:'Multi dwelling housing',           question:'Can I build townhouses?' },
  { id:'subdivide',  label:'Subdivision',                      question:'Can I split the title?' },
  { id:'addition',   label:'Alterations & additions',          question:'Can I extend?' },
];
export interface RuleHit {
  level: RuleLevel;
  instrument: string;      // e.g. 'SEPP (Housing) 2021 Ch.3 Pt.1'
  clause?: string;
  effect: 'enables' | 'restricts' | 'prohibits' | 'informs';
  note: string;
}
export interface Control {
  key: string; label: string;
  required?: number; unit?: string;
  actual?: number;
  pass?: boolean;
  note?: string;
}
export interface Entitlement {
  devType: string; label: string;
  likelihood: Likelihood;
  pathway?: string;              // 'CDC' | 'DA' | 'Permitted development' | ...
  controls: Control[];
  stack: RuleHit[];
  blockers: string[];
  notes: string[];
}
export interface Parcel {
  id?: string;                   // Lot/DP, APN, Title No, Chiban — never a shared key
  country: string; region?: string; lga?: string;
  address?: string;
  areaM2: number;
  frontageM?: number;
  zoneCode?: string;             // key on (jurisdiction, instrument, zoneCode)
  zoneLabel?: string;
  minLotSizeM2?: number;
  maxHeightM?: number;
  fsr?: number;
  overlays?: string[];           // heritage, bushfire, flood, acid sulfate, ...
  existingDwellingGfaM2?: number;
}
export interface PlanningPack {
  id: string; country: string; region?: string; label: string;
  system: PlanningSystem;
  instrument: string;
  /** parcel-level and legally binding? */
  parcelBinding: boolean;
  dataSources: { name: string; url: string; auth: 'open'|'key'|'paid' }[];
  assess(parcel: Parcel): Entitlement[];
  caveats: string[];
}
