import type { PlanningPack, Parcel, Entitlement } from './types';
/**
 * England has NO ZONING. A designation confers no right; everything is a
 * discretionary judgement against the Local Plan + NPPF, with a narrow set of
 * as-of-right Permitted Development rights under the GPDO. The same schema
 * therefore cannot answer "permitted: true" here — it answers likelihood + tests.
 */
export const ENG_PLANNING: PlanningPack = {
  id:'GB-ENG-PLAN', country:'GB', region:'ENG', label:'England — discretionary planning',
  system:'discretionary', instrument:'Local Plan + NPPF; GPDO 2015 (as amended)',
  parcelBinding:false,
  dataSources:[
    {name:'planning.data.gov.uk (local plans, Article 4, conservation areas)', auth:'open',
     url:'https://www.planning.data.gov.uk/entity.geojson?dataset=conservation-area'},
    {name:'HM Land Registry INSPIRE polygons', auth:'open', url:'https://use-land-property-data.service.gov.uk/'},
    {name:'Environment Agency flood', auth:'open', url:'https://environment.data.gov.uk/flood-monitoring/doc/reference'},
  ],
  caveats:[
    'There is no zoning in England. No designation grants a right to develop; each application is judged on its planning merits.',
    'Permitted Development rights (GPDO) are the only as-of-right pathway, and an Article 4 Direction can remove them.',
    'A GPDO Class E outbuilding or annexe must remain ANCILLARY to the main house — it is not a separate dwelling and cannot be let independently.',
  ],
  assess(p: Parcel): Entitlement[] {
    const a4 = (p.overlays ?? []).some(o => /article 4|conservation|listed/i.test(o));
    return [
      { devType:'secondary', label:'Annexe / outbuilding (not a separate dwelling)',
        likelihood: a4 ? 'discretionary' : 'as-of-right',
        pathway: a4 ? 'Full planning application' : 'Permitted Development — GPDO Sch.2 Pt.1 Class E',
        controls:[
          {key:'coverage', label:'Max coverage of curtilage', required:50, unit:'%',
           note:'Total of all outbuildings and extensions.'},
          {key:'height', label:'Max height (dual pitched, >2 m from boundary)', required:4.0, unit:'m'},
          {key:'heightNear', label:'Max height within 2 m of a boundary', required:2.5, unit:'m'},
          {key:'use', label:'Use', note:'Must remain incidental/ancillary to the enjoyment of the dwellinghouse.'},
        ],
        stack:[
          {level:'national', instrument:'GPDO 2015 Sch.2 Pt.1 Class E', effect:'enables',
           note:'As-of-right for an incidental outbuilding, subject to limits.'},
          ...(a4 ? [{level:'overlay' as const, instrument:'Article 4 Direction / conservation area / listed building',
            effect:'restricts' as const, note:'Permitted development rights withdrawn or curtailed — full application required.'}] : []),
        ],
        blockers: [],
        notes:['An independent dwelling requires full planning permission and is judged on merits — there is no equivalent of the NSW granny flat entitlement.'],
      },
      { devType:'subdivide', label:'Creation of a separate dwelling',
        likelihood:'discretionary', pathway:'Full planning application',
        controls:[{key:'nds', label:'Nationally Described Space Standard', required:37, unit:'m²',
          note:'1b1p minimum GIA where the NDSS is adopted locally.'}],
        stack:[{level:'local', instrument:'Local Plan + NPPF', effect:'informs',
          note:'Assessed on amenity, parking, overlooking, character and housing mix.'}],
        blockers:[], notes:['Outcome cannot be predicted from a designation — only a likelihood based on policy fit and precedent.'],
      },
    ];
  },
};
