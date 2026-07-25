/**
 * The external envelope, taken off the elevation sheets.
 *
 * Levels are read from the RL annotations, which are the most reliable numbers
 * on the whole drawing set — they are surveyed heights, not scaled dimensions.
 * The vertical scale was established from the label positions on sheet 5:
 * FCL 22,120 at y=133.0 pt and FFL 16,490 at y=292.6 pt gives 0.028349 pt/mm,
 * which agrees with the 1:100 scale of the floor plans.
 *
 * Everything below is stated relative to the ground floor finished level
 * (RL 16,490), because that is what the 3D model uses as y = 0.
 */

/** Reduced levels straight off the elevations, in metres from ground FFL. */
export const LEVELS = {
  /** natural ground level, RL 15,932 */
  ngl: -0.558,
  /** garage slab is 170 down, matching the "170mm STEPDOWN" note on the plan */
  garageFfl: -0.170,
  groundFfl: 0,
  /** RL 19,230 */
  groundFcl: 2.740,
  /** RL 19,530 — 300 mm of floor structure over the ground ceiling */
  firstFfl: 3.040,
  /** RL 22,120 */
  firstFcl: 5.630,
  /** FRL 22,883 on the street elevation */
  ridgeFront: 6.393,
  /** RL 23,296 on the site plan, noted there as 7,364 above NGL */
  ridgeMain: 6.806,
  /** the 8.5 m envelope measured from NGL */
  maxHeightPlane: 7.942,
} as const;

/**
 * Roof pitches, all annotated on the elevations. The main 12.6° is the one that
 * matters: a hip over the 9.56 m wide first floor plate gives a half-span rise
 * of 4.78 × tan(12.6°) = 1.068 m, which lands the ridge at 6.80 — within 6 mm
 * of the surveyed 6.806. That agreement is the check that the roof form is
 * right, not just the pitch number.
 */
export const ROOF = {
  mainPitchDeg: 12.6,
  /** over the single-storey rear and the alfresco */
  rearPitchDeg: 20,
  /** the low-pitch sheet hidden behind the street parapet */
  behindParapetDeg: 5,
  /** trim deck over the balcony */
  trimDeckDeg: 2,
  eaveOverhangM: 0.45,
  fasciaDepthM: 0.19,
  gutterDepthM: 0.115,
  /** parapet upstand above the first floor ceiling, with Colorbond capping */
  parapetRiseM: 0.62,
  cappingThickM: 0.06,
} as const;

export type Elevation = 'A' | 'B' | 'C' | 'D';
/**
 * Which face each elevation sheet looks at. A and B are the long sides, C and D
 * the ends; the street is east in the model frame.
 */
export const ELEVATION_FACE: Record<Elevation, 'N' | 'S' | 'E' | 'W'> = {
  A: 'E', B: 'W', C: 'S', D: 'N',
};

export type CladdingId =
  | 'faceBrick' | 'renderFirst' | 'renderSecond'
  | 'gridPanelFirst' | 'gridPanelSecond' | 'verticalClad';

/** The elevation KEY block, which is the finishes schedule for the outside. */
export const CLADDING: Record<CladdingId, { label: string; colour: string; rho: number }> = {
  faceBrick:       { label: 'Face brick as selected',                          colour: '#d9c9b4', rho: 0.42 },
  renderFirst:     { label: 'Render to brickwork, paint finish (first)',       colour: '#efece4', rho: 0.74 },
  renderSecond:    { label: 'Render to brickwork, paint finish (second)',      colour: '#ded8cc', rho: 0.64 },
  gridPanelFirst:  { label: 'Grid panel system cladding, paint (first)',       colour: '#f3f1eb', rho: 0.76 },
  gridPanelSecond: { label: 'Grid panel system cladding, paint (second)',      colour: '#cfcabf', rho: 0.58 },
  verticalClad:    { label: '150 wide vertical cladding, paint as selected',   colour: '#e8e4da', rho: 0.70 },
};

/**
 * Where each cladding runs. Bands are given as a fraction of the storey height
 * so they survive a change of ceiling height, which is exactly what happened
 * when the ground floor was corrected from 2.72 to 2.74.
 */
export interface CladdingBand {
  face: 'N' | 'S' | 'E' | 'W';
  storey: 0 | 1;
  material: CladdingId;
  /** along-face extent as a fraction, 0 = start of the run */
  from: number; to: number;
}
export const CLADDING_BANDS: CladdingBand[] = [
  // ground floor is face brick right around
  { face: 'N', storey: 0, material: 'faceBrick', from: 0, to: 1 },
  { face: 'S', storey: 0, material: 'faceBrick', from: 0, to: 1 },
  { face: 'W', storey: 0, material: 'faceBrick', from: 0, to: 1 },
  { face: 'E', storey: 0, material: 'faceBrick', from: 0, to: 1 },
  // first floor is render with grid-panel feature bands, and vertical cladding
  // to the street where the elevation shows the 150 wide boards
  { face: 'N', storey: 1, material: 'renderFirst', from: 0, to: 1 },
  { face: 'S', storey: 1, material: 'renderFirst', from: 0, to: 1 },
  { face: 'W', storey: 1, material: 'gridPanelFirst', from: 0, to: 1 },
  { face: 'E', storey: 1, material: 'gridPanelSecond', from: 0, to: 0.45 },
  { face: 'E', storey: 1, material: 'verticalClad', from: 0.45, to: 1 },
];

/** Roof pitch as a rise per metre of run. */
export const riseFor = (deg: number) => Math.tan((deg * Math.PI) / 180);

/** Ridge height for a hip or gable over a given span at a given pitch. */
export const ridgeFor = (eaveY: number, spanM: number, deg: number) =>
  eaveY + (spanM / 2) * riseFor(deg);
