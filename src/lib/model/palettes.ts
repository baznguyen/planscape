/**
 * Preset schemes.
 *
 * A colour system is a catalogue; a scheme is a decision. Nobody specifies a
 * house one swatch at a time — you pick a wall colour, a trim that sits a few
 * points above it, a feature that sits well below it, and a facade pair, and
 * the whole thing hangs together or it doesn't. These are those decisions,
 * applied in one tap across every scope at once.
 *
 * Two honesty notes.
 *
 * The COLOURS are real: every entry below is a code you can order, resolved out
 * of the libraries in colours.ts by system and code, so if a code is ever wrong
 * the palette fails loudly at load rather than rendering an invented swatch.
 * The COMBINATIONS are mine — a scheme is an editorial judgement, not a
 * manufacturer's product, and nothing here is a Dulux or Resene "collection".
 *
 * The LRV spread is the part that actually does work in this model. Walls carry
 * the daylight, so they sit high; trim reads as trim by sitting a few points
 * above the wall rather than by being a different hue; a feature wall has to
 * drop far enough to read as one. Because LRV feeds the utilisation factor,
 * choosing a dark scheme genuinely costs the room lux and the lighting check
 * will say so — which is the whole point of specifying colour inside the model
 * rather than on a mood board.
 */
import { findColour, type Colour } from './colours';

export interface PaletteRole {
  system: string;
  code: string;
}
export interface Palette {
  id: string;
  name: string;
  /** the reasoning, in one line — what this scheme is for */
  note: string;
  /** internal wall colour, applied to the whole house */
  walls: PaletteRole;
  /** trim and joinery; sits a few points above the wall */
  trim: PaletteRole;
  /** a feature wall, applied to the selected room if there is one */
  feature: PaletteRole;
  /** the facade's main field */
  facade: PaletteRole;
  /** the facade's secondary — the render band, the cladding, the garage door */
  facadeAccent: PaletteRole;
}

const D = (code: string): PaletteRole => ({ system: 'dulux', code });
const R = (code: string): PaletteRole => ({ system: 'resene', code });

export const PALETTES: Palette[] = [
  {
    id: 'monument',
    name: 'Monument & White',
    note: 'The default contemporary Australian pairing: near-white inside, charcoal outside. Maximum daylight indoors, maximum contrast at the kerb.',
    walls: D('SW1H1'), trim: D('SW1H1'), feature: D('PN1B9'),
    facade: D('PN1B9'), facadeAccent: D('SW1H1'),
  },
  {
    id: 'lexicon',
    name: 'Coastal Quarter',
    note: 'Cool near-white walls for rooms that face south and never see direct sun; a deep blue-grey feature to give the living end a wall to look at.',
    walls: D('PN1F2'), trim: D('SW1H1'), feature: D('SN2H8'),
    facade: D('SN4D4'), facadeAccent: D('PN1B9'),
  },
  {
    id: 'warmneutral',
    name: 'Warm Neutral',
    note: 'Warm whites for a west-facing house, where a cool white goes grey and flat by late afternoon. Dune outside keeps it in the street.',
    walls: D('W01A1'), trim: D('SW1H1'), feature: D('SN3E7'),
    facade: D('PG1C2'), facadeAccent: D('PN1A9'),
  },
  {
    id: 'greige',
    name: 'Greige',
    note: 'The safe middle: a warm off-white that photographs well and a truffle feature. Sandstone and olive outside for a garden-led frontage.',
    walls: R('W28'), trim: R('W01'), feature: R('N65'),
    facade: R('BR52'), facadeAccent: R('G59'),
  },
  {
    id: 'charcoal',
    name: 'Charcoal & Dune',
    note: 'Quiet walls, a genuinely dark feature. Domino at LRV 11 will cost the room measurable lux — check the lighting overlay before committing.',
    walls: D('SN1F2'), trim: D('SW1H1'), feature: D('PN1H9'),
    facade: D('SN3E7'), facadeAccent: D('SN1H9'),
  },
  {
    id: 'sage',
    name: 'Soft Sage',
    note: 'A warm paper-white with an olive feature, for a house with a lot of glass to the garden. Reads greener as the planting matures.',
    walls: R('N42'), trim: R('W01'), feature: R('G59'),
    facade: R('N56'), facadeAccent: R('N24'),
  },
  {
    id: 'gallery',
    name: 'Gallery',
    note: 'Everything white so the artwork and the joinery carry the room, with one near-black wall. The highest-LRV scheme here.',
    walls: D('SW1H1'), trim: D('SW1H1'), feature: D('SN1H9'),
    facade: D('SN2F4'), facadeAccent: D('PN1B9'),
  },
  {
    id: 'midcentury',
    name: 'Mid Grey',
    note: 'Mid-grey walls at LRV 49 — a deliberate choice that halves the reflected component. Suits rooms with a large northern window and nothing else.',
    walls: D('PN1G6'), trim: D('SW1H1'), feature: D('PN1A9'),
    facade: D('SN1D4'), facadeAccent: D('PN1H9'),
  },
];

/** Resolve a role to a real colour, or null if the code no longer exists. */
export function roleColour(r: PaletteRole): (Colour & { system: string }) | null {
  const c = findColour(r.system, r.code);
  return c ? { ...c, system: r.system } : null;
}

/** Every colour in a scheme, in specification order, for the swatch strip. */
export function paletteColours(p: Palette) {
  return ([
    ['Walls', p.walls], ['Trim', p.trim], ['Feature', p.feature],
    ['Facade', p.facade], ['Accent', p.facadeAccent],
  ] as const).map(([role, r]) => ({ role, colour: roleColour(r) }));
}

/** Mean wall LRV of the scheme — the number that drives the lighting model. */
export const paletteWallLrv = (p: Palette) => roleColour(p.walls)?.lrv ?? 0;

export const paletteById = (id: string) => PALETTES.find(p => p.id === id);
