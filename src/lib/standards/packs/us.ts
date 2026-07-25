import type { StandardsPack } from '../types';
import { INDICATIVE_DISCLAIMER } from '../types';
import { ratio } from '../units';

/** United States — IRC/IECC baseline. Imperial: note ft/in and R = hft2F/Btu. */
export const US_IRC: StandardsPack = {
  jurisdiction:{ id:'US-IRC', country:'US', label:'United States — IRC / IECC baseline',
    measure:'imperial', climateZoneScheme:'IECC', effectiveFrom:'2024-01-01',
    certifierRequired:true, certifierLabel:'State-licensed registered design professional (architect / PE), wet-stamped; permit by AHJ' },
  codes:{
    energy:{name:'IECC / ASHRAE 90.1', edition:'IECC 2024; 90.1-2025'},
    ventilation:{name:'ASHRAE 62.2', edition:'2025 (IMC 2024 cites 62.1-2022)'},
    lighting:{name:'IES RP-1 (non-mandatory) + IECC C405 LPD', edition:'RP-1-22'},
    acoustic:{name:'IBC §1206', edition:'2024'},
    electrical:{name:'NEC (NFPA 70)', edition:'2026 (most states on 2023)'},
    access:{name:'ADA 2010 + ICC A117.1', edition:'A117.1-2017'},
    structural:{name:'ASCE 7', edition:'7-22'},
  },
  thermalTarget:'elementalRU',
  minOpenableAreaRatio: ratio(4,100),      // IRC R303.1 — 4% of floor area
  minDaylightGlazingRatio: ratio(8,100),   // IRC R303.1 — 8% of floor area
  minCeilingHeight:{ habitable:2.134, nonHabitable:2.032, stair:2.032 },  // 7 ft / 6 ft 8 in, stored in metres
  acoustic:{ partyWall:{descriptor:'STC', min:50}, impact:{descriptor:'IIC', max:0} },  // IIC is a minimum 50; see notes
  illuminance:{ living:150, kitchen:300, bed:100, bath:200, study:400, hall:100,
                laundry:300, garage:100, store:100, outdoor:0 },
  envelope:{
    '4A':{ wall:{value:20,unit:'hft2F/Btu',basis:'cavity'}, roof:{value:49,unit:'hft2F/Btu',basis:'cavity'},
           glazing:{value:0.32,unit:'Btu/hft2F'} },
    '5A':{ wall:{value:20,unit:'hft2F/Btu',basis:'cavity'}, roof:{value:60,unit:'hft2F/Btu',basis:'cavity'},
           glazing:{value:0.30,unit:'Btu/hft2F'} },
  },
  ventilationRates:{ bath:25, ensuite:25, laundry:0, kitchen:50 },
  checks:[
    {id:'light.nat', title:'Natural light area', discipline:'daylight', clause:'IRC R303.1',
     pathway:['prescriptive'], severity:'blocker', rationale:'Glazing ≥8% of floor area.'},
    {id:'vent.nat', title:'Natural ventilation openable area', discipline:'ventilation', clause:'IRC R303.1',
     pathway:['prescriptive'], severity:'blocker', rationale:'Openable ≥4% of floor area.'},
    {id:'ceil.hab', title:'Habitable ceiling height', discipline:'geometry', clause:'IRC R305.1',
     pathway:['prescriptive'], severity:'blocker', rationale:'7 ft (2134 mm) minimum.'},
    {id:'stair.rg', title:'Stair riser & run', discipline:'egress', clause:'IRC R311.7',
     pathway:['prescriptive'], severity:'blocker', rationale:'Max riser 7¾ in, min tread 10 in.'},
    {id:'thermal.fabric', title:'Envelope R-values by climate zone', discipline:'thermal', clause:'IECC 2024 R402.1.3',
     pathway:['elemental','prescriptive'], severity:'major', rationale:'Cavity + continuous insulation by IECC zone.'},
    {id:'acoustic.party', title:'Dwelling separation', discipline:'acoustic', clause:'IBC 2024 §1206',
     pathway:['prescriptive'], severity:'blocker', rationale:'STC 50 lab / 45 field; IIC 50.'},
  ],
  notes:[
    'IECC 2024 renumbered: R402.1.2 = max assembly U-factors (primary), R402.1.3 = R-value alternative.',
    'US R-values are cavity + continuous ("ci") and are NOT comparable with AU total-R or NZ construction-R.',
    'California is a separate code universe (Title 24 2025, 16 climate zones) — do not conflate with IECC zones.',
    'State/AHJ adoption of NEC and IECC lags publication by years; always resolve by AHJ.',
  ],
  disclaimer: INDICATIVE_DISCLAIMER,
};
