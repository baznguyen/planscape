/**
 * Value engineering engine.
 * Guard (research finding #1): a VE proposal must be re-validated — the output is
 * a *validated design*, not a cost delta. Anything that breaks a check is rejected.
 */
import { LEVERS, type Lever, type Phase } from './levers';
import type { ValidationReport } from '../validation/engine';

export interface VeOption extends Lever {
  savingLo: number; savingHi: number;   // dollars
  blockedBy: string[];                  // check ids that this would put at risk
  recommended: boolean;
}
export interface VeRegister {
  buildCost: number; phase: Phase;
  options: VeOption[];
  totalLo: number; totalHi: number;
  basis: string[];
}
/**
 * @param buildCost   contract sum or elemental cost plan total
 * @param phase       construction stage — levers expire as the job progresses
 * @param report      current validation report; checks already failing or at risk
 *                    disqualify any lever that touches them
 */
export function buildVeRegister(buildCost: number, phase: Phase, report: ValidationReport): VeRegister {
  const order: Phase[] = ['design','documentation','preconstruction','construction'];
  const phaseIdx = order.indexOf(phase);
  const marginal = new Set(report.findings
    .filter(f => f.status === 'fail' || f.status === 'review')
    .map(f => f.checkId));
  const options: VeOption[] = LEVERS
    .filter(l => order.indexOf(l.availableUntil) >= phaseIdx)
    .map(l => {
      const blockedBy = l.riskChecks.filter(c => marginal.has(c));
      return { ...l,
        savingLo: (buildCost * l.savingPctLo) / 100,
        savingHi: (buildCost * l.savingPctHi) / 100,
        blockedBy,
        recommended: blockedBy.length === 0 && l.customerResistance !== 'high' };
    })
    .sort((a, b) => b.savingHi - a.savingHi);
  const rec = options.filter(o => o.recommended);
  return {
    buildCost, phase, options,
    totalLo: rec.reduce((s, o) => s + o.savingLo, 0),
    totalHi: rec.reduce((s, o) => s + o.savingHi, 0),
    basis: [
      'Savings are planning-grade percentage ranges of contract sum, not quoted rates.',
      'Levers whose risk checks are currently failing or under review are excluded from the recommended total.',
      'Rates are not region- or date-stamped in this build — calibrate against a licensed rate library (Rawlinsons / Cordell / RSMeans / BCIS) before issuing.',
      'Second-order cross-trade costs are listed as dependencies and are NOT netted off.',
      'This is a design review, not a certification.',
    ],
  };
}
