import type { StandardsPack } from '../types';
import { INDICATIVE_DISCLAIMER } from '../types';
import { ratio } from '../units';

/** England — Approved Documents. Note purge ventilation is a RATIONAL (1/20), not a percentage. */
export const GB_ENG: StandardsPack = {
  jurisdiction:{ id:'GB-ENG', country:'GB', region:'ENG', label:'United Kingdom — England',
    measure:'metric', climateZoneScheme:'SAP21', effectiveFrom:'2022-06-15',
    certifierRequired:true, certifierLabel:'Local Authority Building Control or Registered Building Control Approver' },
  codes:{
    energy:{name:'Approved Document L', edition:'2021 (2023 amendment); AD L 2026 in force 24 Mar 2027'},
    ventilation:{name:'Approved Document F + AD O (overheating)', edition:'2021'},
    lighting:{name:'BS EN 12464-1 / BS EN 17037', edition:'12464-1:2021'},
    acoustic:{name:'Approved Document E', edition:'2003 (amended 2015)'},
    electrical:{name:'BS 7671', edition:'2018 + A4:2026'},
    access:{name:'Approved Document M', edition:'2015 (2024 update)'},
    structural:{name:'Approved Document A + Eurocodes/UK NA', edition:'—'},
  },
  thermalTarget:'elementalRU',
  minOpenableAreaRatio: ratio(1,20),          // AD F purge ventilation — exact rational
  minDaylightGlazingRatio: null,               // no daylight area requirement in AD L
  minCeilingHeight:{ habitable:2.3, nonHabitable:2.1, stair:2.0 },  // NDSS 2.5 m over 75% GIA where adopted
  acoustic:{ partyWall:{descriptor:'DnT,w+Ctr', min:45}, impact:{descriptor:"L'nT,w", max:62} },
  illuminance:{ living:150, kitchen:300, bed:100, bath:200, study:500, hall:100,
                laundry:300, garage:100, store:100, outdoor:0 },
  envelope:{ 'ENG':{ wall:{value:0.26,unit:'W/m2K'}, roof:{value:0.16,unit:'W/m2K'},
                     glazing:{value:1.60,unit:'W/m2K'} } },
  ventilationRates:{ bath:15, ensuite:15, laundry:30, kitchen:30 },
  checks:[
    {id:'vent.purge', title:'Purge ventilation openable area', discipline:'ventilation', clause:'AD F 2021 Table 1.3',
     pathway:['prescriptive'], severity:'blocker', rationale:'1/20 of floor area (1/10 if the opening is 15–30°).'},
    {id:'ceil.hab', title:'Habitable ceiling height', discipline:'geometry', clause:'NDSS / AD K',
     pathway:['prescriptive'], severity:'major', rationale:'2.3 m; NDSS requires 2.5 m over 75% of GIA where adopted.'},
    {id:'stair.rg', title:'Stair riser & going', discipline:'egress', clause:'AD K 2013',
     pathway:['prescriptive'], severity:'blocker', rationale:'Rise 150–220, going 220–300, max pitch 42°.'},
    {id:'thermal.fabric', title:'Limiting fabric U-values', discipline:'thermal', clause:'AD L 2021 Table 4.1',
     pathway:['elemental'], severity:'major', rationale:'Roof 0.16, wall 0.26, floor 0.18, window 1.60 W/m²K.'},
    {id:'acoustic.party', title:'Party wall sound insulation', discipline:'acoustic', clause:'AD E 2003 Table 1a',
     pathway:['prescriptive'], severity:'blocker', rationale:'DnT,w+Ctr ≥45 dB airborne; L\'nT,w ≤62 dB impact.'},
    {id:'overheat', title:'Overheating risk', discipline:'thermal', clause:'AD O 2021',
     pathway:['prescriptive','performance'], severity:'major', rationale:'Limit solar gains and provide a means of removing heat.'},
  ],
  notes:[
    'AD L 2026 published 24 Mar 2026, in force 24 Mar 2027 — transition window applies.',
    'AD F purge ventilation is an exact rational (1/20), not 5%.',
    'Acoustic descriptor is DnT,w+Ctr (field measured) — not comparable with AU Rw+Ctr or US STC.',
  ],
  disclaimer: INDICATIVE_DISCLAIMER,
};
