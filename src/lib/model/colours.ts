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
 *
 * Three kinds of library sit here, and the difference is worth being blunt
 * about because it changes what you can promise a client:
 *
 *   Complete and colorimetric — RAL Classic (216) and Pantone TCX (274) are
 *   carried in full, from published tabulations, with LRV computed from hex.
 *
 *   Complete and generated — NCS is generated across the whole standard
 *   notation space (~1,800 codes), because the code IS the definition. The
 *   swatch is an approximation and is flagged as such.
 *
 *   Deliberately partial — the paint-brand fan decks (Dulux, Resene, Benjamin
 *   Moore, Sherwin-Williams) are proprietary. They cannot be reproduced in
 *   full and will not be padded with invented codes. What is here is a curated
 *   set with published LRVs; anything else goes in through Custom, where you
 *   type the code, the name and the hex, and the LRV is computed.
 */
import { RAL_CLASSIC, PANTONE_TCX, type ColourTuple } from './colourData';
import { ncsGrid } from './ncs';

export type ColourRegion = 'AU' | 'NZ' | 'EU' | 'US' | 'INT';

export interface Colour {
  code: string;
  name: string;
  hex: string;
  /** Light Reflectance Value, 0 = black, 100 = white. Drives surface reflectance. */
  lrv: number;
  /** true when the swatch and its LRV are derived, not measured. */
  approx?: boolean;
}
export interface ColourSystem {
  id: string;
  name: string;
  region: ColourRegion;
  /** what a spec writer calls it */
  note: string;
  /** the library is a curated subset, not the whole deck */
  partial?: boolean;
  colours: Colour[];
}

const c = (code: string, name: string, hex: string, lrv: number): Colour => ({ code, name, hex, lrv });

/**
 * LRV from a hex triplet, done properly.
 *
 * The sRGB inverse EOTF is PIECEWISE — a linear toe below 0.04045 and a 2.4
 * power above it. Using a plain gamma 2.2 instead, which is the common
 * shortcut, is wrong by several points in exactly the dark greys where the
 * lighting model is most sensitive. Luminance then uses the BT.709 primaries,
 * which is what CIE Y is under a D65 sRGB assumption; LRV is CIE Y by
 * definition in BS 8493.
 */
export function lrvFromHex(hex: string): number {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 50;
  const ch = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = ch.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2];
  return Math.round(y * 1000) / 10;
}

/** Normalise whatever the user typed into #rrggbb, or null if it is not a colour. */
export function normaliseHex(input: string): string | null {
  const t = input.trim().toLowerCase();
  const m3 = t.match(/^#?([0-9a-f]{3})$/);
  if (m3) return '#' + m3[1].split('').map(x => x + x).join('');
  const m6 = t.match(/^#?([0-9a-f]{6})$/);
  if (m6) return '#' + m6[1];
  const rgb = t.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/);
  if (rgb) {
    const v = [1, 2, 3].map(i => Math.max(0, Math.min(255, parseInt(rgb[i], 10))));
    return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return null;
}

/** A one-off colour the user typed in. LRV is computed, never guessed. */
export function customColour(hexInput: string, name?: string, code?: string): Colour | null {
  const hex = normaliseHex(hexInput);
  if (!hex) return null;
  return {
    code: code?.trim() || hex.toUpperCase(),
    name: name?.trim() || 'Custom',
    hex,
    lrv: lrvFromHex(hex),
    approx: true,
  };
}

const fromTuples = (t: ColourTuple[]): Colour[] =>
  t.map(([code, name, hex, lrv]) => ({ code, name, hex, lrv }));

/** NCS is ~1,800 entries; build it once, on first use, not at import. */
let ncsCache: Colour[] | null = null;
function ncsColours(): Colour[] {
  if (!ncsCache) {
    ncsCache = ncsGrid().map(x => ({ ...x, lrv: lrvFromHex(x.hex), approx: true }));
  }
  return ncsCache;
}

export const COLOUR_SYSTEMS: ColourSystem[] = [
  {
    id: 'dulux', name: 'Dulux', region: 'AU',
    note: 'The default residential specification in Australia and New Zealand. Fan-deck subset — the full Dulux Colour Atlas is proprietary; enter any other code under Custom.',
    partial: true,
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
    note: 'Specified widely across New Zealand and eastern Australia. Fan-deck subset — enter any other code under Custom.',
    partial: true,
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
    id: 'benjaminmoore', name: 'Benjamin Moore', region: 'US',
    note: 'North American residential specification. Fan-deck subset — enter any other code under Custom.',
    partial: true,
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
    note: 'North American residential specification. Fan-deck subset — enter any other code under Custom.',
    partial: true,
    colours: [
      c('SW 7005', 'Pure White', '#eeebe4', 84),
      c('SW 7008', 'Alabaster', '#eeeae0', 82),
      c('SW 7015', 'Repose Gray', '#ccc9c0', 58),
      c('SW 7029', 'Agreeable Gray', '#d1c7b8', 60),
      c('SW 7048', 'Urbane Bronze', '#54504a', 8),
      c('SW 6258', 'Tricorn Black', '#2f2f30', 3),
    ],
  },
  {
    id: 'ral', name: 'RAL Classic', region: 'EU',
    note: 'European powder-coat and joinery standard; the code IS the colour. All 216 carried, from the colorimetric tabulation.',
    colours: fromTuples(RAL_CLASSIC),
  },
  {
    id: 'pantone', name: 'Pantone', region: 'INT',
    note: 'Fashion, Home + Interiors (TCX). A printing and textile system, so a paint match is an approximation both ways.',
    colours: fromTuples(PANTONE_TCX),
  },
  {
    id: 'ncs', name: 'NCS', region: 'INT',
    note: 'Natural Colour System — the code states blackness, chromaticness and hue. Generated across the whole standard notation space; swatches are indicative, not certified samples.',
    get colours() { return ncsColours(); },
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

/**
 * Free-text search over a library. Matches code or name, and understands a
 * bare LRV bound such as "lrv>60", because "give me anything above 60" is how
 * a specifier actually narrows a deck when daylight is the constraint.
 */
export function searchColours(list: Colour[], q: string): Colour[] {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  const bound = t.match(/^lrv\s*([<>])\s*(\d{1,3})$/);
  if (bound) {
    const n = +bound[2];
    return bound[1] === '>' ? list.filter(x => x.lrv > n) : list.filter(x => x.lrv < n);
  }
  const parts = t.split(/\s+/);
  return list.filter(x => {
    const hay = `${x.code} ${x.name}`.toLowerCase();
    return parts.every(p => hay.includes(p));
  });
}

/** LRV is a percentage; the solvers want a 0-1 reflectance. */
export const lrvToReflectance = (lrv: number) => Math.max(0.02, Math.min(0.95, lrv / 100));
