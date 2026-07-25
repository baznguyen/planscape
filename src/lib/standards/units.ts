/**
 * Typed quantities. Research finding: a bare number is ALWAYS wrong for building
 * codes. "R-value" is four different quantities depending on jurisdiction, and
 * dimensional predicates are exact rationals in JP (1/7, 1/20) and DE (1/8) but
 * percentages elsewhere. Every value therefore carries unit + basis.
 */
export type LengthUnit = 'm' | 'mm' | 'ft' | 'in';
export type AreaUnit = 'm2' | 'ft2';
export type UUnit = 'W/m2K' | 'Btu/hft2F';
export type RUnit = 'm2K/W' | 'hft2F/Btu';
/** How an R-value is defined — never comparable across bases without conversion. */
export type RBasis = 'total' | 'cavity' | 'continuous' | 'effective' | 'construction';
/** Acoustic single-number descriptors. Research: NEVER coerce these to one scale. */
export type AcousticDescriptor =
  | 'Rw' | 'Rw+Ctr' | 'DnT,w' | 'DnT,w+Ctr' | 'R\'w' | 'STC' | 'ASTC' | 'IIC'
  | 'L\'nT,w' | 'Ln,w+Ci' | 'L\'n,w' | 'Dr' | 'Lr';
/** Compliance pathway. A pass/fail boolean is wrong; checks are pathway-scoped. */
export type Pathway = 'prescriptive' | 'performance' | 'relative' | 'elemental';

export interface Quantity<U extends string = string> { value: number; unit: U }
export interface RValue { value: number; unit: RUnit; basis: RBasis }
export interface UValue { value: number; unit: UUnit }
/** Exact rational so 1/7 never becomes 14.2857%. */
export interface Ratio { num: number; den: number }
export const ratio = (num: number, den: number): Ratio => ({ num, den });
export const ratioValue = (r: Ratio) => r.num / r.den;
export const percentToRatio = (pct: number): Ratio => ({ num: pct, den: 100 });
export const formatRatio = (r: Ratio) =>
  r.den === 100 ? `${r.num}%` : `${r.num}/${r.den} (${((r.num / r.den) * 100).toFixed(1)}%)`;

export const M_PER_FT = 0.3048;
export const RSI_PER_R = 0.1761101838;      // hft2F/Btu -> m2K/W
export const U_SI_PER_IP = 5.678263337;     // Btu/hft2F -> W/m2K

export const toMetres = (q: Quantity<LengthUnit>): number => {
  switch (q.unit) { case 'm': return q.value; case 'mm': return q.value / 1000;
    case 'ft': return q.value * M_PER_FT; case 'in': return (q.value * M_PER_FT) / 12; }
};
export const toM2 = (q: Quantity<AreaUnit>): number =>
  q.unit === 'm2' ? q.value : q.value * M_PER_FT * M_PER_FT;
export const toSIU = (u: UValue): number =>
  u.unit === 'W/m2K' ? u.value : u.value * U_SI_PER_IP;
export const toRSI = (r: RValue): number =>
  r.unit === 'm2K/W' ? r.value : r.value * RSI_PER_R;
/**
 * Convert an R-value to a comparable metric total-R. Returns null when the
 * conversion is NOT defensible (cavity/continuous R excludes air films and
 * framing, so it cannot be compared with an assembly total-R).
 */
export function toComparableTotalRSI(r: RValue): number | null {
  const rsi = toRSI(r);
  if (r.basis === 'total' || r.basis === 'effective') return rsi;
  return null;
}
export function describeR(r: RValue): string {
  const b = { total: 'total assembly', cavity: 'cavity only', continuous: 'continuous insulation',
    effective: 'effective (framing-adjusted)', construction: 'construction R (excl. films)' }[r.basis];
  return `R${r.value} ${r.unit} — ${b}`;
}
