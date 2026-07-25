/**
 * INDEPENDENT trace of the architect's drawing — deliberately NOT derived from
 * WALLS. This is the reference the 3D model is checked against, so it must be
 * transcribed from the drawing only.
 *
 * Source: Firstyle Homes "Grantham 36.9 Pristine MkII", job 5792-25, sheet SK1,
 * Lot 43B / 101 Campbell Street, Fairfield East NSW 2165, drawn 9/07/2026.
 * Ground floor: sheet 2 of 3. First floor: sheet 5 of 12.
 *
 * Coordinates are metres in the model frame: x runs rear (0) -> street (28.14),
 * z runs south (0) -> north (11.0).
 */

export interface TraceSeg {
  x1: number; z1: number; x2: number; z2: number;
  floor: 0 | 1;
  kind: 'external' | 'internal' | 'beam' | 'open';
  /** the dimension string on the drawing this segment was read from */
  note: string;
}

/** Certified areas from the DEVELOPMENT CALCULATIONS block on the site plan. */
export const CERTIFIED_AREAS = {
  groundLiving: 165.8,
  groundLivingInternal: 165.36,
  firstFloorInternal: 119.11,
  garage: 32.8,
  alfresco: 29.25,
  porch: 6.23,
  balcony: 4.44,
  totalFloor: 414.24,
  grossFloorArea: 284.47,
  siteArea: 609,
  floorSpaceRatio: 0.46,
} as const;

/** Overall envelope from the top/bottom dimension chains. */
export const CERTIFIED_ENVELOPE = {
  groundLength: 28.14,   // 6,500 + 11,280 + 8,150 + 2,130 + 80
  groundWidth: 11.0,
  firstLength: 21.64,    // 9,175 + 2,410 + 1,310 + 1,210 + 5,885 + 480 + 1,080 + 90
  firstWidth: 9.56,
  ceilingGround: 2.72,   // FFL 16,490 -> FCL 19,230
  ceilingFirst: 2.59,    // FFL 19,530 -> FCL 22,120
} as const;

const S = (
  floor: 0 | 1, kind: TraceSeg['kind'], x1: number, z1: number, x2: number, z2: number, note: string
): TraceSeg => ({ floor, kind, x1, z1, x2, z2, note });

export const PLAN_TRACE: TraceSeg[] = [
  // ---------------- ground floor shell ----------------
  S(0, 'external', 6.6, 0, 28.03, 0, 'south facade, chain 26,900 / 28,140'),
  S(0, 'external', 6.6, 11.0, 28.03, 11.0, 'north facade, chain 28,140'),
  S(0, 'external', 28.03, 0, 28.03, 3.5, 'street facade south of porch'),
  S(0, 'external', 28.03, 6.5, 28.03, 11.0, 'street facade north of porch'),
  S(0, 'external', 6.6, 0, 6.6, 11.0, 'rear wall, alfresco 6,500 clear'),
  // alfresco is roofed but open — posts only, so 'open': drawn on the overlay but
  // never checked as a wall.
  S(0, 'open', 0, 3.1, 0, 7.6, 'alfresco outer edge, 6,500 x 4,500'),
  S(0, 'open', 0, 3.1, 6.6, 3.1, 'alfresco south edge'),
  S(0, 'open', 0, 7.6, 6.6, 7.6, 'alfresco north edge'),

  // ---------------- ground floor internal ----------------
  // NB: the 11,280 clear span means NO wall inside the open-plan core.
  S(0, 'beam', 6.7, 5.6, 17.7, 5.6, '"BEAM OVER TO ENG DETAILS" — downstand, not a wall'),
  S(0, 'beam', 11.6, 0.1, 11.6, 5.6, '"BEAM OVER" / kitchen bulkhead — not a wall'),
  S(0, 'internal', 16.0, 0.1, 16.0, 2.8, 'WIP west wall, CSD 720 door'),
  S(0, 'internal', 16.0, 2.8, 17.7, 2.8, 'WIP north wall'),
  S(0, 'internal', 17.78, 0, 17.78, 3.6, 'guest wing west wall, chain 3,870'),
  S(0, 'internal', 17.78, 5.6, 17.78, 11.0, 'service band west wall, chain 220 + 2,070'),
  S(0, 'internal', 19.94, 5.3, 19.94, 11.0, 'garage west wall, chain 2,070 + 90'),
  S(0, 'internal', 17.85, 7.9, 19.94, 7.9, 'PDR / WIL divider'),
  S(0, 'internal', 17.85, 9.0, 19.94, 9.0, 'WIL / LDRY divider'),
  S(0, 'internal', 19.94, 5.3, 25.93, 5.3, 'garage south wall, area check 5,990 x 5,480'),
  S(0, 'internal', 17.85, 3.7, 25.93, 3.7, 'bedroom wing corridor wall'),
  S(0, 'internal', 21.4, 0.1, 21.4, 3.6, 'guest / ENS 2, chain 3,870 + 90'),
  S(0, 'internal', 23.0, 0.1, 23.0, 3.8, 'ENS 2 / BED 5, chain 1,850 + 90'),
  S(0, 'internal', 21.4, 1.95, 23.0, 1.95, 'ENS 2 north wall'),
  S(0, 'internal', 23.9, 3.9, 23.9, 5.3, 'entry / hall, 1,500 cased opening'),
  S(0, 'internal', 25.93, 3.5, 25.93, 3.9, 'porch return, south reveal'),
  S(0, 'internal', 25.93, 5.3, 25.93, 6.5, 'porch return, north reveal'),

  // ---------------- first floor shell ----------------
  S(1, 'external', 6.6, 0.72, 25.4, 0.72, 'first floor south, chain 21,640 / width 9,560'),
  S(1, 'external', 6.6, 10.28, 25.4, 10.28, 'first floor north'),
  S(1, 'external', 25.4, 0.72, 25.4, 3.0, 'first floor street wall south of balcony'),
  S(1, 'external', 25.4, 6.7, 25.4, 10.28, 'first floor street wall north of balcony'),
  S(1, 'external', 6.6, 0.72, 6.6, 10.28, 'first floor rear wall'),

  // ---------------- first floor internal ----------------
  S(1, 'internal', 11.6, 0.9, 11.6, 5.0, 'sitting room east wall, chain 4,850'),
  S(1, 'internal', 6.8, 5.1, 11.6, 5.1, 'sitting room north wall'),
  S(1, 'internal', 11.6, 5.1, 11.6, 10.28, 'BED 2 west wall, chain 8,610'),
  S(1, 'internal', 11.7, 4.5, 15.1, 4.5, 'study north wall, chain 3,850'),
  S(1, 'internal', 15.1, 0.72, 15.1, 4.5, 'study east wall'),
  S(1, 'internal', 16.3, 5.1, 16.3, 10.28, 'BED 2 east wall, chain 3,010'),
  S(1, 'internal', 16.3, 6.7, 19.1, 6.7, 'bathroom south wall'),
  S(1, 'internal', 19.1, 6.7, 19.1, 10.28, 'BED 4 west wall, chain 2,340 + 140'),
  S(1, 'internal', 15.2, 6.35, 21.5, 6.35, 'landing / stair void edge'),
  S(1, 'internal', 19.5, 4.3, 19.5, 6.35, 'principal suite west wall'),
  S(1, 'internal', 19.5, 4.3, 24.1, 4.3, 'principal suite north wall, chain 3,910'),
  S(1, 'internal', 19.5, 0.72, 19.5, 4.3, 'principal suite / study wall'),
  S(1, 'internal', 19.6, 2.45, 21.7, 2.45, 'WIR 1 north wall'),
  S(1, 'internal', 21.7, 0.72, 21.7, 2.45, 'WIR 1 / ENS wall'),
  S(1, 'internal', 24.1, 0.72, 24.1, 3.0, 'balcony threshold wall'),
  S(1, 'internal', 24.1, 6.7, 24.1, 10.28, 'BED 4 east wall'),
  S(1, 'internal', 18.4, 5.1, 18.4, 6.7, 'WIR 2 east wall'),
];

export const traceForFloor = (floor: 0 | 1) => PLAN_TRACE.filter(s => s.floor === floor);
