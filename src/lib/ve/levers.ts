/**
 * Value engineering lever library.
 * Research: elemental cost split for a detached AU house —
 * substructure 8–12%, frame+roof 12–18%, ext walls+cladding 10–14%,
 * windows/doors 6–9%, roof cover 4–6%, linings/finishes 12–16%,
 * joinery 8–12%, services 12–16%, prelims+margin 18–25%.
 */
export type Phase = 'design' | 'documentation' | 'preconstruction' | 'construction';
export interface Lever {
  id: string; title: string; element: string;
  savingPctLo: number; savingPctHi: number;
  tradeOff: string;
  /** checks this lever could break — VE output is re-validated against these */
  riskChecks: string[];
  /** other elements whose cost moves as a second-order effect */
  dependencies: string[];
  customerResistance: 'low' | 'medium' | 'high';
  availableUntil: Phase;
}
export const LEVERS: Lever[] = [
  { id:'ve.rect', title:'Rectangularise footprint (remove external corners)', element:'EW External Walls',
    savingPctLo:1, savingPctHi:2, tradeOff:'Facade articulation; may breach design guidelines',
    riskChecks:['plan.coverage'], dependencies:['SB Substructure','RF Roof'], customerResistance:'medium', availableUntil:'design' },
  { id:'ve.roofform', title:'Simplify roof form (hips/valleys → gable or skillion)', element:'RF Roof',
    savingPctLo:3, savingPctHi:6, tradeOff:'Streetscape appeal; resale in some markets',
    riskChecks:[], dependencies:['RF Roof','EW External Walls'], customerResistance:'high', availableUntil:'design' },
  { id:'ve.pitch', title:'Reduce roof pitch to ≤25° and eliminate valleys', element:'RF Roof',
    savingPctLo:0.5, savingPctHi:1.5, tradeOff:'Tile options limited; loses attic volume',
    riskChecks:[], dependencies:['RF Roof'], customerResistance:'low', availableUntil:'design' },
  { id:'ve.spans', title:'Design to standard truss/joist spans (≤6 m truss, ≤4.2 m joist)', element:'UF Upper Floors',
    savingPctLo:0.5, savingPctHi:2, tradeOff:'Constrains open-plan spans; avoids steel + crane',
    riskChecks:[], dependencies:['CL Columns','SB Substructure'], customerResistance:'medium', availableUntil:'design' },
  { id:'ve.cantilever', title:'Eliminate cantilevers / upper-floor overhangs', element:'UF Upper Floors',
    savingPctLo:1, savingPctHi:2, tradeOff:'Loses first-floor area over garage or porch',
    riskChecks:['plan.coverage'], dependencies:['RF Roof'], customerResistance:'medium', availableUntil:'design' },
  { id:'ve.stack', title:'Stack upper floor over lower load-bearing walls', element:'UF Upper Floors',
    savingPctLo:1, savingPctHi:3, tradeOff:'Reduces plan freedom on both levels',
    riskChecks:[], dependencies:['SB Substructure'], customerResistance:'medium', availableUntil:'design' },
  { id:'ve.wetwall', title:'Wet-wall stacking / single plumbing core', element:'PS Sanitary Plumbing',
    savingPctLo:1, savingPctHi:2, tradeOff:'Fixes bathroom and kitchen positions',
    riskChecks:['vent.mech'], dependencies:['WS Water Supply'], customerResistance:'low', availableUntil:'design' },
  { id:'ve.glazing', title:'Reduce glazing-to-floor ratio to 15–18%', element:'WW Windows',
    savingPctLo:1, savingPctHi:3, tradeOff:'Daylight and outlook; must not breach the daylight minimum',
    riskChecks:['light.nat','vent.nat'], dependencies:['AC Air Conditioning'], customerResistance:'high', availableUntil:'design' },
  { id:'ve.glazperf', title:'Specify glazing performance by orientation, not uniformly', element:'WW Windows',
    savingPctLo:0.5, savingPctHi:1.5, tradeOff:'Requires energy re-run; comfort varies by room',
    riskChecks:['thermal.fabric'], dependencies:['AC Air Conditioning'], customerResistance:'low', availableUntil:'documentation' },
  { id:'ve.cladding', title:'Brick veneer → lightweight cladding', element:'EW External Walls',
    savingPctLo:2, savingPctHi:4, tradeOff:'Acoustics, thermal mass, perceived quality, maintenance',
    riskChecks:['acoustic.party','thermal.fabric'], dependencies:['SB Substructure'], customerResistance:'high', availableUntil:'design' },
  { id:'ve.slab', title:'Waffle raft instead of stiffened raft slab', element:'SB Substructure',
    savingPctLo:1, savingPctHi:2.5, tradeOff:'Not valid on Class E/P, flood or high-termite sites',
    riskChecks:[], dependencies:[], customerResistance:'low', availableUntil:'documentation' },
  { id:'ve.cutfill', title:'Minimise cut/fill; avoid split-level', element:'SB Substructure',
    savingPctLo:1, savingPctHi:3, tradeOff:'Floor level relationship to street',
    riskChecks:['plan.coverage'], dependencies:['XP External Works'], customerResistance:'medium', availableUntil:'design' },
  { id:'ve.elec', title:'Electrical point reduction + circuit consolidation', element:'LP Electric Light & Power',
    savingPctLo:0.4, savingPctHi:1, tradeOff:'Lighting quality and future flexibility',
    riskChecks:['light.artificial'], dependencies:[], customerResistance:'medium', availableUntil:'preconstruction' },
  { id:'ve.hvac', title:'HVAC right-sizing + zone reduction (AFTER envelope is fixed)', element:'AC Air Conditioning',
    savingPctLo:0.5, savingPctHi:1.5, tradeOff:'Comfort in extremes; must follow glazing change, never precede it',
    riskChecks:[], dependencies:['WW Windows','EW External Walls'], customerResistance:'low', availableUntil:'preconstruction' },
  { id:'ve.finishes', title:'Finishes substitution (engineered stone → porcelain; tile to 1800 not full height)', element:'WF Wall Finishes',
    savingPctLo:1, savingPctHi:2.5, tradeOff:'Perceived quality — the highest customer-resistance lever',
    riskChecks:[], dependencies:['FT Fitments'], customerResistance:'high', availableUntil:'construction' },
  { id:'ve.prefab', title:'Prefabricated frames & trusses (optionally bathroom pods)', element:'PL Preliminaries',
    savingPctLo:1, savingPctHi:3, tradeOff:'Requires earlier design freeze and tolerance discipline',
    riskChecks:[], dependencies:['UF Upper Floors','RF Roof'], customerResistance:'low', availableUntil:'documentation' },
];
/** AIQS elemental cost plan structure (kept NRM-shaped as the superset). */
export const ELEMENTS = ['SB Substructure','CL Columns','UF Upper Floors','SC Staircases','RF Roof',
 'EW External Walls','WW Windows','ED External Doors','NW Internal Walls','ND Internal Doors',
 'WF Wall Finishes','FF Floor Finishes','CF Ceiling Finishes','FT Fitments','PF Sanitary Fixtures',
 'PS Sanitary Plumbing','WS Water Supply','AC Air Conditioning','VE Ventilation','FP Fire Protection',
 'LP Electric Light & Power','CM Communications','XP External Works','XS External Services','PL Preliminaries'];
