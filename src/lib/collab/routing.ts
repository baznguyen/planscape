/** Which trade owns a variation. A lighting change goes to the electrician. */
export type Trade = 'BUILDER'|'ELECTRICIAN'|'PLUMBER'|'HVAC'|'CARPENTER'|'TILER'|'PAINTER'
  |'GLAZIER'|'LANDSCAPER'|'JOINER'|'INTERIOR_DESIGNER'|'ENGINEER'|'OTHER';

export const DISCIPLINE_TO_TRADE: Record<string, Trade> = {
  lighting:'ELECTRICIAN', electrical:'ELECTRICIAN', power:'ELECTRICIAN', data:'ELECTRICIAN',
  plumbing:'PLUMBER', sanitary:'PLUMBER', hotwater:'PLUMBER', drainage:'PLUMBER',
  hvac:'HVAC', ventilation:'HVAC', aircon:'HVAC',
  acoustics:'BUILDER', insulation:'BUILDER', structural:'ENGINEER', slab:'ENGINEER', framing:'CARPENTER',
  tiling:'TILER', waterproofing:'TILER', paint:'PAINTER', render:'PAINTER',
  glazing:'GLAZIER', windows:'GLAZIER', doors:'CARPENTER',
  joinery:'JOINER', kitchen:'JOINER', robes:'JOINER',
  finishes:'INTERIOR_DESIGNER', furniture:'INTERIOR_DESIGNER', landscape:'LANDSCAPER',
};
export const routeVariation = (discipline: string): Trade =>
  DISCIPLINE_TO_TRADE[discipline.toLowerCase()] ?? 'BUILDER';
/** Everyone notified when a variation moves — including second-order trades. */
export function notifyList(discipline: string, extra: Trade[] = []): Trade[] {
  const primary = routeVariation(discipline);
  const set = new Set<Trade>([primary, 'BUILDER', ...extra]);
  if (primary === 'ELECTRICIAN') set.add('PAINTER');
  if (primary === 'PLUMBER') set.add('TILER');
  if (primary === 'GLAZIER') set.add('CARPENTER');
  return [...set];
}
export const nextRef = (n: number) => `VAR-${String(n).padStart(3, '0')}`;
