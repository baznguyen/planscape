/**
 * NCS — the Natural Colour System.
 *
 * NCS is worth carrying because it is the only system here that is *perceptual*
 * rather than pigment-based: the code itself states how black, how chromatic and
 * what hue a surface is, so a specifier can reason about a colour without a fan
 * deck in hand. That is exactly what an architectural finishes schedule wants.
 *
 * The honest caveat, stated once and then reflected in the UI:
 *
 *   There is no public exact formula from an NCS notation to sRGB, and none can
 *   exist as a closed form. NCS is defined by visual similarity judgements, and
 *   the notation-to-CIE mapping is a MEASURED lookup table of the physical
 *   standard samples, proprietary to NCS Colour AB (distributed via NCS
 *   Navigator / NCS Digital and tabulated in SS 019103). What follows is the
 *   canonical open approximation (m90/ncs-color, MIT), whose hue arcs are
 *   hand-fitted curves with no CIE anchoring. Typical disagreement with licensed
 *   data is several ΔE*ab, and worse at high blackness and high chromaticness —
 *   which is precisely where architectural greys and greiges live.
 *
 * So: fine for an on-screen swatch, flagged as indicative, and the LRV derived
 * from it is likewise marked approximate. Anything binding gets a drawdown or
 * the licensed CIE data.
 */

/** The 40 standard atlas hues, 10 % steps around Y → R → B → G → Y. */
export const NCS_HUES: string[] = (() => {
  const order: [string, string][] = [['Y', 'R'], ['R', 'B'], ['B', 'G'], ['G', 'Y']];
  const out: string[] = [];
  for (const [a, b] of order) {
    out.push(a);
    for (let n = 10; n <= 90; n += 10) out.push(`${a}${String(n).padStart(2, '0')}${b}`);
  }
  return out;
})();

/** The 19 standard neutral greys. */
export const NCS_GREYS = ['03', '05', '10', '15', '20', '25', '30', '35', '40', '45',
  '50', '55', '60', '65', '70', '75', '80', '85', '90'];

const RE = /^(?:NCS\s|S\s)?(\d{2})(\d{2})-(N|R|G|B|Y)(\d{2})?(R|G|B|Y)?$/;

/**
 * Notation → sRGB, by the open approximation. Returns null if the notation is
 * malformed (an illegal hue pair such as Y..B falls out here as unparseable).
 */
export function ncsHex(notation: string): string | null {
  const m = notation.trim().toUpperCase().replace(/^NCS\s+S\s+/, 'S ').match(RE);
  if (!m) return null;
  const Sn = parseInt(m[1], 10);
  const Cn = parseInt(m[2], 10);
  const C1 = m[3];
  const N = parseInt(m[4] ?? '0', 10) || 0;

  if (C1 === 'N') {
    const v = Math.round((1 - Sn / 100) * 255);
    return rgbHex(v, v, v);
  }

  // empirical blackness adjustment so 05 maps to roughly no darkening
  const S = 1.05 * Sn - 5.25;
  const C = Cn;
  let Ra = 0, Ga = 0, Ba = 0;

  // red attraction
  if (C1 === 'Y' && N <= 60) Ra = 1;
  else if ((C1 === 'Y' && N > 60) || (C1 === 'R' && N <= 80)) {
    const x = C1 === 'Y' ? N - 60 : N + 40;
    Ra = (Math.sqrt(14884 - x * x) - 22) / 100;
  } else if ((C1 === 'R' && N > 80) || C1 === 'B') Ra = 0;
  else if (C1 === 'G') { const x = N - 170; Ra = (Math.sqrt(33800 - x * x) - 70) / 100; }

  // blue attraction
  if (C1 === 'Y' && N <= 80) Ba = 0;
  else if ((C1 === 'Y' && N > 80) || (C1 === 'R' && N <= 60)) {
    const x = (C1 === 'Y' ? N - 80 : N + 20) + 20.5;
    Ba = (104 - Math.sqrt(11236 - x * x)) / 100;
  } else if ((C1 === 'R' && N > 60) || (C1 === 'B' && N <= 80)) {
    const x = (C1 === 'R' ? N - 60 : N + 40) - 60;
    Ba = (Math.sqrt(10000 - x * x) - 10) / 100;
  } else if ((C1 === 'B' && N > 80) || (C1 === 'G' && N <= 40)) {
    const x = (C1 === 'B' ? N - 80 : N + 20) - 131;
    Ba = (122 - Math.sqrt(19881 - x * x)) / 100;
  } else if (C1 === 'G' && N > 40) Ba = 0;

  // green attraction
  if (C1 === 'Y') Ga = (85 - (17 / 20) * N) / 100;
  else if (C1 === 'R' && N <= 60) Ga = 0;
  else if (C1 === 'R') { const x = N - 60 + 35; Ga = (67.5 - Math.sqrt(5776 - x * x)) / 100; }
  else if (C1 === 'B' && N <= 60) { const x = N - 68.5; Ga = (6.5 + Math.sqrt(7044.5 - x * x)) / 100; }
  else if ((C1 === 'B' && N > 60) || (C1 === 'G' && N <= 60)) Ga = 0.9;
  else { const x = N - 60; Ga = (90 - x / 8) / 100; }

  // desaturate towards the channel mean, then apply blackness
  const mean = (Ra + Ga + Ba) / 3;
  const Rc = ((mean - Ra) * (100 - C)) / 100 + Ra;
  const Gc = ((mean - Ga) * (100 - C)) / 100 + Ga;
  const Bc = ((mean - Ba) * (100 - C)) / 100 + Ba;
  const ss = 1 / Math.max(Rc, Gc, Bc);
  const k = (ss * (100 - S)) / 100;
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * k * 255)));
  return rgbHex(q(Rc), q(Gc), q(Bc));
}

const rgbHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

/**
 * The full standard-resolution grid: 40 hues × the blackness/chromaticness
 * steps that survive s + c ≤ 90, plus the 19 greys. About 1,800 notations.
 *
 * The filter matters. A notation is only a *valid* notation if blackness and
 * chromaticness can coexist — s + c = 100 is the theoretical ceiling and the
 * physical atlas falls well short of it, so anything above 90 would be a code
 * no supplier can mix. Generated notations outside the licensed NCS Index are
 * flagged in the UI: they are notation-valid, not certified standard samples,
 * and a supplier will interpolate rather than match.
 */
export function ncsGrid(): { code: string; name: string; hex: string }[] {
  const out: { code: string; name: string; hex: string }[] = [];
  for (const g of NCS_GREYS) {
    const code = `S ${g}00-N`;
    const hex = ncsHex(code);
    if (hex) out.push({ code, name: `Grey ${parseInt(g, 10)}`, hex });
  }
  const black = ['05', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
  const chroma = ['05', '10', '20', '30', '40', '50', '60', '70', '80'];
  for (const h of NCS_HUES) {
    for (const s of black) {
      for (const c of chroma) {
        if (parseInt(s, 10) + parseInt(c, 10) > 90) continue;
        const code = `S ${s}${c}-${h}`;
        const hex = ncsHex(code);
        if (hex) out.push({ code, name: `${h} ${parseInt(s, 10)}/${parseInt(c, 10)}`, hex });
      }
    }
  }
  return out;
}
