/**
 * Paint colour systems.
 *
 * Every colour carries an LRV (Light Reflectance Value, 0-100). That is the
 * point of storing colours here rather than as hex strings on a component:
 * LRV is the surface reflectance the lighting solver already needs, so painting
 * a room charcoal genuinely drops its illuminance and pushes the utilisation
 * factor down. A colour picker that does not feed the physics is decoration.
 *
 * On hex values: a screen hex is an approximation of a physical paint chip.
 * Metamerism, gamut and sheen mean the drawdown governs, never the monitor.
 * The codes are what a painter orders from; the hex is for on-screen preview.
 */

export type ColourRegion = 'AU' | 'NZ' | 'EU' | 'US' | 'INT';

export interface Colour {
  code: string;
  name: string;
  hex: string;
  /** Light Reflectance Value, 0 = black, 100 = white. Drives surface reflectance. */
  lrv: number;
}
export interface ColourSystem {
  id: string;
  name: string;
  region: ColourRegion;
  /** what a spec writer calls it */
  note: string;
  colours: Colour[];
}

const c = (code: string, name: string, hex: string, lrv: number): Colour => ({ code, name, hex, lrv });

export const COLOUR_SYSTEMS: ColourSystem[] = [
  {
    id: 'dulux', name: 'Dulux', region: 'AU',
    note: 'The default residential specification in Australia and New Zealand.',
    colours: [
      c('SW1H1', 'Vivid White', '#f6f4ef', 88),
      c('W01A1', 'Natural White', '#f2eee3', 84),
      c('PG1C2', 'Antique White U.S.A.', '#efe9d9', 80),
      c('SN1F2', 'Whisper White', '#f0efe8', 83),
      c('PN1F2', 'Lexicon Quarter', '#f1f2ef', 85),
      c('SN4D4', 'Terrace White', '#e5e2d8', 76),
      c('SN2F4', 'Grey Pail', '#d9d8d0', 68),
      c('SN1D4', 'Tranquil Retreat', '#cfd0c9', 62),
      c('PN1G6', 'Milton Moon', '#b9bbb6', 49),
      c('SN3E7', 'Colorbond Dune', '#b6ada0', 44),
      c('PN1A9', 'Western Myall', '#8f8a80', 29),
      c('SN2H8', 'Blue Gum', '#7d8a8c', 26),
      c('PN1H9', 'Domino', '#565553', 11),
      c('SN1H9', 'Klute', '#3f4143', 7),
      c('PN1B9', 'Monument', '#323233', 6),
    ],
  },
  {
    id: 'resene', name: 'Resene', region: 'NZ',
    note: 'Specified widely across New Zealand and eastern Australia.',
    colours: [
      c('W01', 'Alabaster', '#f7f4ef', 89),
      c('W28', 'Black White', '#eeeae1', 82),
      c('N42', 'Rice Cake', '#efe9dc', 81),
      c('N56', 'Half Tea', '#ded5c4', 70),
      c('N65', 'Truffle', '#c8bfae', 55),
      c('BR52', 'Half Sandstone', '#d4c8b4', 62),
      c('G59', 'Grey Olive', '#a09a86', 35),
      c('B58', 'Half Baltic Sea', '#767a7c', 21),
      c('N24', 'Gravel', '#4c4a47', 9),
      c('N17', 'Nero', '#2b2a28', 4),
    ],
  },
  {
    id: 'ral', name: 'RAL Classic', region: 'EU',
    note: 'European powder-coat and joinery standard; the code IS the colour.',
    colours: [
      c('RAL 9010', 'Pure white', '#f1ece1', 84),
      c('RAL 9016', 'Traffic white', '#f4f8f4', 88),
      c('RAL 9001', 'Cream', '#e9e0d2', 78),
      c('RAL 7035', 'Light grey', '#d7d7d7', 66),
      c('RAL 7047', 'Telegrey 4', '#c8c8c7', 58),
      c('RAL 7038', 'Agate grey', '#b5b8b1', 47),
      c('RAL 7030', 'Stone grey', '#8b8c7a', 28),
      c('RAL 7016', 'Anthracite grey', '#383e42', 6),
      c('RAL 9005', 'Jet black', '#0a0a0a', 3),
      c('RAL 8017', 'Chocolate brown', '#442f29', 5),
    ],
  },
  {
    id: 'ncs', name: 'NCS', region: 'INT',
    note: 'Natural Colour System — perceptual, not pigment-based. Code encodes blackness, chromaticness and hue.',
    colours: [
      c('S 0500-N', 'White', '#f3f3f0', 87),
      c('S 1002-Y', 'Off white', '#eeece3', 81),
      c('S 2005-Y20R', 'Warm light grey', '#d9d2c4', 67),
      c('S 3005-Y20R', 'Greige', '#c1b9aa', 51),
      c('S 4005-B20G', 'Cool mid grey', '#9aa19f', 35),
      c('S 6005-B20G', 'Slate', '#66706e', 17),
      c('S 8000-N', 'Near black', '#2f2f2f', 5),
    ],
  },
  {
    id: 'pantone', name: 'Pantone', region: 'INT',
    note: 'Brand and interior accent work. Pantone is a printing system, so a paint match is an approximation both ways.',
    colours: [
      c('11-0601 TCX', 'Bright White', '#f4f4f2', 89),
      c('11-4300 TCX', 'Cloud Dancer', '#f0eee9', 85),
      c('12-0304 TCX', 'Whisper White', '#ebe7de', 80),
      c('14-1108 TCX', 'Sand Dollar', '#decdbe', 66),
      c('16-1516 TCX', 'Rose Tan', '#d19c97', 42),
      c('17-1230 TCX', 'Mocha Mousse', '#a47864', 24),
      c('18-4148 TCX', 'Dresden Blue', '#0076a5', 14),
      c('19-4052 TCX', 'Classic Blue', '#0f4c81', 8),
      c('18-0135 TCX', 'Forest Green', '#2e5f34', 9),
      c('19-4005 TCX', 'Black', '#2b2b2b', 4),
    ],
  },
  {
    id: 'benjaminmoore', name: 'Benjamin Moore', region: 'US',
    note: 'North American residential specification.',
    colours: [
      c('OC-117', 'Simply White', '#f4f1e4', 91.7),
      c('OC-17', 'White Dove', '#f0ede3', 85.4),
      c('HC-172', 'Revere Pewter', '#ccc6b8', 55.1),
      c('AF-100', 'Pashmina', '#c3b7a5', 47.2),
      c('2124-40', 'Coventry Gray', '#a8a99f', 40.0),
      c('HC-166', 'Kendall Charcoal', '#67665e', 13.4),
      c('2131-10', 'Black Beauty', '#2b2c2e', 3.9),
    ],
  },
  {
    id: 'sherwin', name: 'Sherwin-Williams', region: 'US',
    note: 'North American residential specification.',
    colours: [
      c('SW 7005', 'Pure White', '#eeebe4', 84),
      c('SW 7008', 'Alabaster', '#eeeae0', 82),
      c('SW 7015', 'Repose Gray', '#ccc9c0', 58),
      c('SW 7029', 'Agreeable Gray', '#d1c7b8', 60),
      c('SW 7048', 'Urbane Bronze', '#54504a', 8),
      c('SW 6258', 'Tricorn Black', '#2f2f30', 3),
    ],
  },
];

export const systemById = (id: string) => COLOUR_SYSTEMS.find(s => s.id === id);
export const findColour = (systemId: string, code: string) =>
  systemById(systemId)?.colours.find(x => x.code === code);

/**
 * Sort systems so the ones local to the project come first. A NSW job should
 * open on Dulux, not on RAL.
 */
export function systemsForRegion(region: ColourRegion): ColourSystem[] {
  const rank = (s: ColourSystem) =>
    s.region === region ? 0 : s.region === 'INT' ? 1 : 2;
  return [...COLOUR_SYSTEMS].sort((a, b) => rank(a) - rank(b));
}

/** LRV is a percentage; the solvers want a 0-1 reflectance. */
export const lrvToReflectance = (lrv: number) => Math.max(0.02, Math.min(0.95, lrv / 100));
