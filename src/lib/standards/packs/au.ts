import type { StandardsPack } from '../types';
import { INDICATIVE_DISCLAIMER } from '../types';
import { ratio } from '../units';

/** Australia — NCC 2022 Vol.2 + ABCB Housing Provisions (Class 1/10). */
export const AU_NSW: StandardsPack = {
  jurisdiction: { id:'AU-NSW', country:'AU', region:'NSW', label:'Australia — New South Wales',
    measure:'metric', climateZoneScheme:'NCC8', effectiveFrom:'2023-05-01',
    certifierRequired:true, certifierLabel:'Registered building surveyor / certifier; NatHERS-accredited assessor for energy' },
  codes: {
    energy:{name:'NCC 2022 Vol.2 Part H6 + NatHERS', edition:'2022 Amd 2'},
    ventilation:{name:'NCC F6 / AS 1668.2', edition:'AS 1668.2:2024'},
    lighting:{name:'AS/NZS 1680', edition:'1680.0:2009 / 1680.1:2006'},
    acoustic:{name:'NCC F7 + Spec 28', edition:'2022'},
    electrical:{name:'AS/NZS 3000', edition:'2018'},
    access:{name:'AS 1428.1 / NCC H8 Livable Housing', edition:'2021'},
    structural:{name:'AS/NZS 1170 / AS 1684.2 / AS 2870', edition:'1170.2:2021'},
  },
  thermalTarget:'ratingStars',
  minOpenableAreaRatio: ratio(5,100),          // HP 10.6.2 — 5% of floor area
  minDaylightGlazingRatio: ratio(10,100),      // HP 10.4.2 — 10% of floor area
  minCeilingHeight:{ habitable:2.4, nonHabitable:2.1, stair:2.0 },
  acoustic:{ partyWall:{descriptor:'Rw+Ctr', min:50}, floor:{descriptor:'Rw+Ctr', min:50},
             impact:{descriptor:'Ln,w+Ci', max:62} },
  illuminance:{ living:160, kitchen:320, bed:100, bath:200, study:320, hall:80,
                laundry:240, garage:120, store:80, outdoor:0 },
  envelope:null,                                // AU uses NatHERS star rating, not elemental targets here
  ventilationRates:{ bath:25, ensuite:25, laundry:20, kitchen:50 },
  checks: [
    {id:'ceil.hab', title:'Habitable ceiling height', discipline:'geometry', clause:'NCC 2022 HP 10.3.1',
     pathway:['prescriptive'], severity:'blocker', rationale:'Habitable rooms require 2.4 m minimum.'},
    {id:'ceil.nonhab', title:'Non-habitable ceiling height', discipline:'geometry', clause:'NCC 2022 HP 10.3.1',
     pathway:['prescriptive'], severity:'major', rationale:'Bath/laundry/WC/hall require 2.1 m.'},
    {id:'light.nat', title:'Natural light area', discipline:'daylight', clause:'NCC 2022 HP 10.4.2',
     pathway:['prescriptive'], severity:'blocker', rationale:'Glazing ≥10% of room floor area.'},
    {id:'vent.nat', title:'Natural ventilation openable area', discipline:'ventilation', clause:'NCC 2022 HP 10.6.2',
     pathway:['prescriptive'], severity:'blocker', rationale:'Openable area ≥5% of room floor area.'},
    {id:'vent.mech', title:'Mechanical exhaust to wet areas', discipline:'ventilation', clause:'NCC 2022 HP 10.6 / 10.8.2',
     pathway:['prescriptive'], severity:'major', rationale:'Exhaust discharged outdoors, not to roof space.'},
    {id:'stair.rg', title:'Stair riser & going', discipline:'egress', clause:'NCC 2022 HP Table 11.2.2a',
     pathway:['prescriptive'], severity:'blocker', rationale:'R 115–190, G 240–355, 2R+G 550–700.'},
    {id:'stair.head', title:'Stair headroom', discipline:'egress', clause:'NCC 2022 HP 11.2',
     pathway:['prescriptive'], severity:'blocker', rationale:'2.0 m clear over the nosing line.'},
    {id:'bal.height', title:'Balustrade height', discipline:'egress', clause:'NCC 2022 HP 11.3',
     pathway:['prescriptive'], severity:'blocker', rationale:'1000 mm to floors, 865 mm above stair nosing, where fall >1 m.'},
    {id:'garage.sep', title:'Garage to dwelling separation', discipline:'fire', clause:'NCC 2022 HP 9.3',
     pathway:['prescriptive'], severity:'major', rationale:'FRL 60/60/60 or 10 mm fire-grade board; 35 mm solid-core self-closing door.'},
    {id:'access.door', title:'Doorway clear width (Livable Housing)', discipline:'access', clause:'NCC 2022 H8D3',
     pathway:['prescriptive'], severity:'major', rationale:'≥820 mm clear opening on the accessible path.'},
    {id:'access.corridor', title:'Corridor width (Livable Housing)', discipline:'access', clause:'NCC 2022 H8D4',
     pathway:['prescriptive'], severity:'major', rationale:'≥1000 mm on the accessible path.'},
    {id:'plan.coverage', title:'Site coverage', discipline:'planning', clause:'Local DCP / NSW Codes SEPP',
     pathway:['prescriptive'], severity:'major', rationale:'Site coverage within the planning envelope.'},
  ],
  notes: [
    'NCC 2025 adopted from 1 May 2026 in VIC/WA/ACT/TAS; NSW remains on NCC 2022 Amd 2.',
    'Building Ministers have frozen residential NCC changes to mid-2029.',
    'NCC Table 13.2.3 elemental R-values depend on climate zone AND roof solar absorptance — a single per-zone constant is invalid.',
  ],
  disclaimer: INDICATIVE_DISCLAIMER,
};
