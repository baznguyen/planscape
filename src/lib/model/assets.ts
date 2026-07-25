/**
 * Asset catalogue.
 *
 * Every asset carries the engineering metadata its discipline needs, so placing
 * one changes the analysis rather than just adding a box to the render. Figures
 * are from manufacturer datasheets and published standards — provenance is on
 * each entry, and where a figure is a trade convention rather than a standard it
 * says so, because the two get treated differently by the review rules.
 *
 * Normalisation note: loudspeaker sensitivity is published at 2.83 V/1 m by most
 * brands and at 1 W/1 m by some. At 4 ohms 2.83 V is 2 W, so the two differ by
 * 3 dB. Everything below is stored as dB SPL @ 1 W / 1 m.
 */

/** Which surface an asset attaches to. This drives placement, not just looks. */
export type Mount =
  | 'floor'             // stands on the floor
  | 'wall'              // fixed to a wall face, at mountHeight
  | 'ceiling'           // surface mounted to the ceiling
  | 'ceiling-recessed'  // cut into the ceiling, flush
  | 'pendant'           // suspended below the ceiling
  | 'bench';            // sits on a benchtop

export interface AudioSpec {
  /** dB SPL @ 1 W / 1 m, normalised */
  sensitivityDb: number;
  /** dB SPL @ 1 m at rated power */
  maxSplDb: number;
  freqLoHz: number;
  freqHiHz: number;
  /** nominal -6 dB coverage, degrees */
  dispersionH: number;
  dispersionV: number;
  /** nominal power handling, W */
  powerW: number;
  isSub: boolean;
  /**
   * Below ~80 Hz a source is far smaller than a wavelength, so each boundary
   * couples coherently and adds 6 dB, not 3. Only true for subs.
   */
  boundaryGainDbPerSurface: number;
}
export interface LightSpec {
  lumens: number;
  /** full beam angle, degrees */
  beamDeg: number;
  /** circuit power, W — this is what the NCC density limit counts */
  watts: number;
  cri: number;
  cctOptions: number[];
  cutoutMm?: number;
  /** spacing-to-height ratio this beam suits */
  shr: number;
}
export type RfBandKey = '2.4' | '5' | '6';
export interface RfSpec {
  gainDbi: Record<RfBandKey, number>;
  /**
   * Conducted power per band. It has to be per band because the ACMA ceilings
   * differ and the antenna gain differs — a single figure that clears 6 GHz
   * breaches 5 GHz, which is exactly what a real AP avoids by backing off in
   * each regulatory domain.
   */
  txDbm: Record<RfBandKey, number>;
}
export interface ThermalSpec {
  outputKw: number;
  /** m² the manufacturer rates it for */
  coverageM2: number;
  kind: 'convection' | 'radiant';
}

export interface AssetSpec {
  id: string;
  label: string;
  category: 'audio' | 'lighting' | 'network' | 'climate' | 'furniture';
  mount: Mount;
  /** metres above this level's floor; ignored for ceiling mounts */
  mountHeight?: number;
  /** drop below the ceiling for a pendant */
  dropM?: number;
  size: { w: number; h: number; d: number };
  icon: string;
  audio?: AudioSpec;
  light?: LightSpec;
  rf?: RfSpec;
  thermal?: ThermalSpec;
  /** where the numbers came from */
  source: string;
}

/* ------------------------------------------------------------------ *
 * ACMA Radiocommunications (LIPD) Class Licence 2025 (F2025L01047),
 * Schedule 1 Part 8. These are hard regulatory ceilings on EIRP.
 * ------------------------------------------------------------------ */
export const EIRP_LIMIT_DBM: Record<RfBandKey, number> = {
  '2.4': 36,   // item 7, 4 W, but peak PSD <= 25 mW/3 kHz constrains real gear far below
  '5': 23,     // items 10/11, 200 mW, indoor only, 5150-5350
  '6': 24,     // item 13 LPI, 250 mW, indoor only, 5925-6585
};
/** NCC 2022 Vol 2 s13.7.6 — illumination power density for a Class 1 dwelling. */
export const NCC_LIGHTING_DENSITY_W_M2 = 4;
/** Trade convention, not a standard: temperate-climate heating sizing. */
export const HEATING_W_PER_M2 = 100;
/** ITU-R BS.775 5.1 azimuths from the listening position, degrees. */
export const BS775_ANGLES = {
  centre: 0, front: 30, surroundMin: 100, surroundMax: 120,
  /** EBU Tech 3276 / ITU-R BS.1116 seated ear height */
  earHeightM: 1.2,
};

const A = (a: AssetSpec) => a;

export const ASSETS: AssetSpec[] = [
  /* ---------------- audio ---------------- */
  A({
    id: 'spk_ceiling', label: 'In-ceiling speaker 6.5"', category: 'audio',
    mount: 'ceiling-recessed', size: { w: 0.208, h: 0.115, d: 0.208 }, icon: '🔈',
    audio: { sensitivityDb: 89, maxSplDb: 106, freqLoHz: 50, freqHiHz: 20000,
      dispersionH: 100, dispersionV: 100, powerW: 35, isSub: false, boundaryGainDbPerSurface: 3 },
    source: 'Klipsch CDT-5650-C II, Sonance VP66R, KEF Ci200RR-THX datasheets; 208 mm cut-out, 115 mm depth typical',
  }),
  A({
    id: 'spk_wall', label: 'In-wall speaker 6.5"', category: 'audio',
    mount: 'wall', mountHeight: 1.2, size: { w: 0.185, h: 0.28, d: 0.092 }, icon: '🔉',
    audio: { sensitivityDb: 90, maxSplDb: 106, freqLoHz: 50, freqHiHz: 20000,
      dispersionH: 90, dispersionV: 60, powerW: 40, isSub: false, boundaryGainDbPerSurface: 3 },
    source: 'Klipsch R-5650-W II, B&W CWM663, Sonance VP66; depth 92 mm set by the 89 mm stud bay. Height 1.2 m = EBU Tech 3276 seated ear height',
  }),
  A({
    id: 'spk_surround', label: 'Surround speaker (high)', category: 'audio',
    mount: 'wall', mountHeight: 1.8, size: { w: 0.18, h: 0.3, d: 0.28 }, icon: '🔊',
    audio: { sensitivityDb: 87, maxSplDb: 107, freqLoHz: 50, freqHiHz: 25000,
      dispersionH: 80, dispersionV: 60, powerW: 60, isSub: false, boundaryGainDbPerSurface: 3 },
    source: 'KEF Q150, Q Acoustics 3020i, SVS Prime Bookshelf. 1.8 m AFF is installer convention (~610 mm above ear), not a standard',
  }),
  A({
    id: 'spk_bookshelf', label: 'Bookshelf speaker', category: 'audio',
    mount: 'floor', mountHeight: 0.9, size: { w: 0.18, h: 0.3, d: 0.28 }, icon: '🎵',
    audio: { sensitivityDb: 87, maxSplDb: 108, freqLoHz: 50, freqHiHz: 25000,
      dispersionH: 80, dispersionV: 60, powerW: 80, isSub: false, boundaryGainDbPerSurface: 3 },
    source: 'KEF Q150 108 dB max SPL; typical 300x180x280 mm',
  }),
  A({
    id: 'sub', label: 'Subwoofer 12"', category: 'audio',
    mount: 'floor', size: { w: 0.38, h: 0.45, d: 0.42 }, icon: '📢',
    audio: { sensitivityDb: 0, maxSplDb: 114, freqLoHz: 20, freqHiHz: 120,
      dispersionH: 360, dispersionV: 360, powerW: 325, isSub: true, boundaryGainDbPerSurface: 6 },
    source: 'SVS SB-1000 Pro 325 W / 20 Hz; KEF Kube 12 MIE 114 dB. Sensitivity in dB/W/m is not published for powered subs — the amp is integral. +6 dB per boundary is the coherent image-source case, correct below 80 Hz',
  }),

  /* ---------------- lighting ---------------- */
  A({
    id: 'dl_wide', label: 'Downlight 90° wide', category: 'lighting',
    mount: 'ceiling-recessed', size: { w: 0.11, h: 0.055, d: 0.11 }, icon: '💡',
    light: { lumens: 900, beamDeg: 90, watts: 10, cri: 82, cctOptions: [3000, 4000, 5700], cutoutMm: 90, shr: 1.3 },
    source: 'Atom AT9020 TRI, Martec Blitz, Clipsal TPDL1C3 — 90 mm cut-out is the de-facto AU size',
  }),
  A({
    id: 'dl_narrow', label: 'Downlight 36° narrow', category: 'lighting',
    mount: 'ceiling-recessed', size: { w: 0.11, h: 0.094, d: 0.11 }, icon: '🔦',
    light: { lumens: 1050, beamDeg: 36, watts: 13, cri: 80, cctOptions: [3000, 4000, 5000], cutoutMm: 90, shr: 0.7 },
    source: 'Domus DEEP DOM21732, 36° beam. Narrow beams need tighter spacing: SHR 0.5-0.8',
  }),
  A({
    id: 'pendant', label: 'Pendant', category: 'lighting',
    mount: 'pendant', dropM: 1.75, size: { w: 0.28, h: 0.3, d: 0.28 }, icon: '🔆',
    light: { lumens: 1150, beamDeg: 120, watts: 10, cri: 90, cctOptions: [2700, 3000, 4000], shr: 1.4 },
    source: 'Philips 10 W CRI90 E27 = 1150 lm. Hung 700-750 mm above a dining top, 600-800 mm above a bench — convention, not regulated',
  }),
  A({
    id: 'lamp_floor', label: 'Floor lamp', category: 'lighting',
    mount: 'floor', size: { w: 0.36, h: 1.55, d: 0.36 }, icon: '🕯',
    light: { lumens: 1700, beamDeg: 120, watts: 14.5, cri: 90, cctOptions: [2700, 3000], shr: 1.4 },
    source: 'Philips 14.5 W = 1700 lm; 1470-1630 mm overall height typical',
  }),
  A({
    id: 'lamp_table', label: 'Table lamp', category: 'lighting',
    mount: 'bench', size: { w: 0.26, h: 0.42, d: 0.26 }, icon: '🪔',
    light: { lumens: 700, beamDeg: 120, watts: 6, cri: 90, cctOptions: [2700, 3000], shr: 1.4 },
    source: 'Philips 6 W CRI90 = 700 lm',
  }),

  /* ---------------- network ---------------- */
  A({
    id: 'ap_ceiling', label: 'WiFi AP (ceiling)', category: 'network',
    mount: 'ceiling', size: { w: 0.22, h: 0.04, d: 0.22 }, icon: '📶',
    rf: { gainDbi: { '2.4': 4, '5': 6, '6': 5.8 }, txDbm: { '2.4': 17, '5': 16, '6': 18 } },
    source: 'UniFi U7 Pro antenna gains. Transmit power set per band to sit under each ACMA EIRP ceiling: 21 / 22 / 23.8 dBm EIRP against 36 / 23 / 24',
  }),
  A({
    id: 'ap_wall', label: 'WiFi AP (wall)', category: 'network',
    mount: 'wall', mountHeight: 2.2, size: { w: 0.14, h: 0.2, d: 0.04 }, icon: '📡',
    rf: { gainDbi: { '2.4': 3, '5': 5, '6': 5 }, txDbm: { '2.4': 18, '5': 17, '6': 18 } },
    source: 'UniFi U6-Lite / in-wall class gains',
  }),

  /* ---------------- climate ---------------- */
  A({
    id: 'heater_panel', label: 'Panel heater 2.0 kW', category: 'climate',
    mount: 'wall', mountHeight: 0.35, size: { w: 0.9, h: 0.4, d: 0.1 }, icon: '🔥',
    thermal: { outputKw: 2.0, coverageM2: 20, kind: 'convection' },
    source: 'Nobo / Noirot panel range: 2.0 kW rated to 20 m², i.e. the 100 W/m² trade convention',
  }),
  A({
    id: 'heater_radiant', label: 'Radiant heater 1.2 kW', category: 'climate',
    mount: 'ceiling', size: { w: 0.3, h: 0.08, d: 0.3 }, icon: '🌡',
    thermal: { outputKw: 1.2, coverageM2: 6, kind: 'radiant' },
    source: 'Ventair Sahara 2 x 600 W. Radiant is spot comfort heating, so coverage is a comfort footprint not a room load',
  }),
  A({
    id: 'vent_ceiling', label: 'A/C ceiling vent', category: 'climate',
    mount: 'ceiling', size: { w: 0.5, h: 0.05, d: 0.34 }, icon: '🌬',
    source: 'Ducted supply diffuser; the plan notes two A/C units ducted to ceiling vents',
  }),
];

export const assetById = (id: string) => ASSETS.find(a => a.id === id);
export const assetsIn = (c: AssetSpec['category']) => ASSETS.filter(a => a.category === c);

/** Sound power a speaker actually produces at a distance, given its own spec. */
export function speakerSplAt(spec: AudioSpec, watts: number, distM: number, boundaries: number) {
  const d = Math.max(0.5, distM);
  const base = spec.isSub
    // a powered sub has no dB/W/m figure; work back from its rated max SPL
    ? spec.maxSplDb
    : spec.sensitivityDb + 10 * Math.log10(Math.max(0.1, watts));
  return base - 20 * Math.log10(d) + boundaries * spec.boundaryGainDbPerSurface;
}
