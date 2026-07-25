import type { PlanningPack, Parcel, Entitlement, Control, RuleHit } from './types';

/** NSW residential zones — Standard Instrument LEP. */
const ZONE_BASE: Record<string, { label: string; dwelling: boolean; dual: boolean; multi: boolean }> = {
  R1:{label:'General Residential', dwelling:true,  dual:true,  multi:true},
  R2:{label:'Low Density Residential', dwelling:true, dual:true, multi:false},
  R3:{label:'Medium Density Residential', dwelling:true, dual:true, multi:true},
  R4:{label:'High Density Residential', dwelling:true, dual:true, multi:true},
  R5:{label:'Large Lot Residential', dwelling:true, dual:false, multi:false},
  RU5:{label:'Village', dwelling:true, dual:true, multi:true},
  MU1:{label:'Mixed Use', dwelling:false, dual:false, multi:true},
  E1:{label:'Local Centre', dwelling:false, dual:false, multi:false},
  C4:{label:'Environmental Living', dwelling:true, dual:false, multi:false},
};
/** Codes SEPP / Housing SEPP numeric controls. */
const SEC = { minLotCdc:450, maxGfa:60, gfaPctOfPrincipal:5, maxHeight:8.5, rearSetback:3.0, sideSetback:0.9 };
const DUAL = { minLot:400, minWidth:12, maxHeight:8.5, landscapedMinusM2:100, landscapedPct:50 };

export const NSW_PLANNING: PlanningPack = {
  id:'AU-NSW-PLAN', country:'AU', region:'NSW', label:'New South Wales — LEP + SEPP stack',
  system:'binding-zoning', instrument:'Standard Instrument LEP + State Environmental Planning Policies',
  parcelBinding:true,
  dataSources:[
    {name:'NSW Principal Planning Layers (zone, FSR, HOB, min lot, heritage)', auth:'open',
     url:'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Principal_Planning_Layers/MapServer'},
    {name:'NSW Cadastre (Lot/DP)', auth:'open',
     url:'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer'},
    {name:'Bushfire Prone Land', auth:'open',
     url:'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Fire/BFPL/MapServer'},
    {name:'NSW Planning Portal APIs (DA/CDC/s10.7)', auth:'key',
     url:'https://www.planningportal.nsw.gov.au/API'},
  ],
  caveats:[
    'The Standard Instrument fixes zone NAMES; the land use table is per-council LEP. Permissibility must be resolved per LGA, then overridden by SEPP.',
    'Secondary dwellings are enabled by the Housing SEPP, not the LEP land use table.',
    'Dual occupancy permitted with consent in R2 statewide since 1 Jul 2024 (excludes Blue Mountains, Hawkesbury, Wollondilly, Bathurst) and is NOT CDC-eligible under the Low Rise Housing Diversity Code.',
    'Overlays (heritage, bushfire, flood, acid sulfate) can remove the complying-development pathway entirely.',
    'Indicative only — obtain a s10.7 planning certificate and confirm against the gazetted instrument.',
  ],
  assess(p: Parcel): Entitlement[] {
    const z = p.zoneCode ? ZONE_BASE[p.zoneCode] : undefined;
    const out: Entitlement[] = [];
    const overlays = p.overlays ?? [];
    const overlayBlocks = overlays.filter(o => /heritage|flood|bushfire|acid/i.test(o));

    // ---------- secondary dwelling (granny flat) ----------
    {
      const stack: RuleHit[] = [
        {level:'state', instrument:'SEPP (Housing) 2021 Ch.3 Pt.1', effect:'enables',
         note:'Secondary dwellings are permitted wherever a dwelling house is permitted — this overrides the council land use table.'},
        {level:'local', instrument:`${p.lga ?? 'Council'} LEP land use table`, effect:'informs',
         note:'Confirms a dwelling house is permissible in the zone.'},
      ];
      const principal = p.existingDwellingGfaM2 ?? 0;
      const gfaCap = Math.min(SEC.maxGfa, Math.max(SEC.maxGfa, (principal * SEC.gfaPctOfPrincipal) / 100));
      const controls: Control[] = [
        {key:'minLot', label:'Minimum lot size (CDC pathway)', required:SEC.minLotCdc, unit:'m²',
         actual:p.areaM2, pass:p.areaM2 >= SEC.minLotCdc,
         note:'DA pathway may still be available on smaller lots subject to the LEP minimum.'},
        {key:'maxGfa', label:'Maximum floor area', required:gfaCap, unit:'m²',
         note:'Greater of 60 m² or 5% of the principal dwelling, capped at 60 m².'},
        {key:'height', label:'Maximum height', required:SEC.maxHeight, unit:'m',
         actual:p.maxHeightM, pass:(p.maxHeightM ?? SEC.maxHeight) >= 0},
        {key:'subdiv', label:'Separate title', note:'Prohibited — a secondary dwelling cannot be subdivided or separately titled.'},
      ];
      const blockers: string[] = [];
      if (!z) blockers.push('Zone not resolved — fetch the zoning layer for this parcel.');
      else if (!z.dwelling) blockers.push(`A dwelling house is not permitted in ${p.zoneCode}, so a secondary dwelling cannot rely on the Housing SEPP.`);
      if (overlayBlocks.length) stack.push({level:'overlay', instrument:overlayBlocks.join(', '), effect:'restricts',
        note:'Overlay present — the complying development pathway may be unavailable; a DA is likely required.'});
      const cdcOk = p.areaM2 >= SEC.minLotCdc && !overlayBlocks.length && !!z?.dwelling;
      out.push({
        devType:'secondary', label:'Secondary dwelling (granny flat)',
        likelihood: blockers.length ? 'prohibited' : (cdcOk ? 'as-of-right' : 'permitted-with-consent'),
        pathway: blockers.length ? undefined : (cdcOk ? 'CDC — Codes SEPP' : 'DA — Housing SEPP'),
        controls, stack, blockers,
        notes:[
          'Rentable to a third party in NSW; cannot be separately titled.',
          'No additional off-street parking space is required.',
          'BASIX certificate required (secondary dwelling is a dedicated project type).',
        ],
      });
    }
    // ---------- dual occupancy ----------
    {
      const stack: RuleHit[] = [
        {level:'state', instrument:'SEPP (Housing) Amendment (Dual Occupancies) 2024', clause:'commenced 1 Jul 2024',
         effect:'enables', note:'Dual occupancy permitted with consent in R2 statewide (excl. Blue Mountains, Hawkesbury, Wollondilly, Bathurst).'},
        {level:'state', instrument:'Codes SEPP Pt 3B — Low Rise Housing Diversity Code', effect:'enables',
         note:'CDC pathway where the lot meets the Code; the 2024 R2 reform itself is NOT CDC-eligible.'},
      ];
      const landscaped = p.areaM2 * (DUAL.landscapedPct/100) - DUAL.landscapedMinusM2;
      const controls: Control[] = [
        {key:'minLot', label:'Minimum lot size', required:DUAL.minLot, unit:'m²', actual:p.areaM2, pass:p.areaM2 >= DUAL.minLot},
        {key:'width', label:'Minimum lot width', required:DUAL.minWidth, unit:'m', actual:p.frontageM,
         pass: p.frontageM === undefined ? undefined : p.frontageM >= DUAL.minWidth},
        {key:'height', label:'Maximum height', required:DUAL.maxHeight, unit:'m'},
        {key:'landscape', label:'Landscaped area', required:Math.max(0, landscaped), unit:'m²',
         note:'50% of the parent lot less 100 m².'},
        {key:'subdiv', label:'Subdivision', note:'Permitted (Torrens or strata) under the LRHD Code — unlike a secondary dwelling.'},
      ];
      const blockers: string[] = [];
      if (!z) blockers.push('Zone not resolved.');
      else if (!z.dual) blockers.push(`Dual occupancy is not permitted in ${p.zoneCode} (${z.label}).`);
      if (p.areaM2 < DUAL.minLot) blockers.push(`Lot is ${p.areaM2} m²; ${DUAL.minLot} m² required.`);
      out.push({
        devType:'dual', label:'Dual occupancy',
        likelihood: blockers.length ? 'prohibited' : 'permitted-with-consent',
        pathway: blockers.length ? undefined : 'CDC (LRHD Code) or DA',
        controls, stack, blockers,
        notes:['Front setback varies with lot size: 3 m (200–300 m²), 4.5 m (>300–900), 6.5 m (>900–1,500), 10 m (>1,500).'],
      });
    }
    // ---------- multi dwelling ----------
    {
      const blockers: string[] = [];
      if (!z) blockers.push('Zone not resolved.');
      else if (!z.multi) blockers.push(`Multi dwelling housing is not permitted in ${p.zoneCode}.`);
      out.push({
        devType:'multi', label:'Multi dwelling housing',
        likelihood: blockers.length ? 'prohibited' : 'permitted-with-consent',
        pathway: blockers.length ? undefined : 'DA',
        controls:[
          {key:'minLot', label:'Typical minimum lot (manor house / terrace)', required:600, unit:'m²', actual:p.areaM2, pass:p.areaM2>=600},
          {key:'fsr', label:'Floor space ratio', actual:p.fsr, note:'From the LEP FSR map layer.'},
        ],
        stack:[{level:'state', instrument:'Housing SEPP Ch.6 — Low and Mid-Rise Housing (Stage 2, 28 Feb 2025)', effect:'enables',
          note:'Uplift within ~800 m of nominated centres and stations in Greater Sydney, Central Coast, Hunter and Illawarra.'}],
        blockers, notes:[],
      });
    }
    return out;
  },
};
/** BASIX — NSW only. No API exists; this records the obligation and the target. */
export function basixObligation(p: Parcel, projectCostAud?: number) {
  const applies = true;
  return {
    applies,
    instrument:'SEPP (Sustainable Buildings) 2022 + EP&A Regulation 2021',
    triggers:['New dwellings', 'Alterations & additions ≥ A$50,000', 'Pools > 40,000 L'],
    triggered: projectCostAud === undefined ? 'unknown' : (projectCostAud >= 50000 ? 'yes' : 'no'),
    thermalTarget:'7 stars NatHERS (uplift effective 1 Oct 2023)',
    energyTarget:'Tightened 1 Oct 2023 for a further 7–11% emissions reduction',
    waterTarget:'Unchanged for houses at the 2023 uplift',
    dataGap:'There is NO BASIX API. Targets vary by dwelling class and postcode and are only resolved by the basix.nsw.gov.au calculator — treat as a calculator integration, not a lookup.',
  };
}
