/**
 * Material property database.
 * One entry per physical build-up; every discipline solver reads from here so a
 * change of wall/floor finish propagates to thermal, acoustic, RF and lighting.
 *
 * Sources: NCC 2022 Vol.2 / ABCB Housing Provisions (U-values), AS/NZS 4859.1,
 * ISO 354 published absorption tables (alpha), ITU-R P.2040 + measured RF
 * surveys (attenuation), CIBSE/IES (reflectance).
 */
export type Band = 125 | 500 | 2000;
export type RfBand = '2.4' | '5' | '6';

export interface Material {
  id: string; label: string;
  U: number;      // W/m2K whole build-up incl. surface films
  kappa: number;  // kJ/m2K areal heat capacity (thermal mass / lag)
  alpha: Record<Band, number>;
  Rw: number;     // weighted sound reduction index dB
  rf: Record<RfBand, number>; // attenuation dB
  rho: number;    // visible reflectance 0-1
  shgc?: number; tvis?: number;
  colour: string;
  /**
   * Surfaces this build-up may legitimately be specified on. A finishes picker
   * that offers brickwork as a ceiling lining is not a picker, it is a trap.
   */
  appliesTo?: ('floor' | 'wall' | 'ceiling' | 'facade')[];
}
const M = (m: Material) => m;

export const MATERIALS: Record<string, Material> = {
  brickVeneerR20: M({ id:'brickVeneerR20', label:'Brick veneer + R2.0 batts',
    U:0.51, kappa:155, alpha:{125:0.03,500:0.02,2000:0.04}, Rw:45,
    rf:{'2.4':10,'5':15,'6':18}, rho:0.55, colour:'#e6d9c8', appliesTo:['wall','facade'] }),
  brickVeneerBare: M({ id:'brickVeneerBare', label:'Brick veneer, uninsulated',
    U:1.70, kappa:155, alpha:{125:0.03,500:0.02,2000:0.04}, Rw:45,
    rf:{'2.4':10,'5':15,'6':18}, rho:0.55, colour:'#dfd0bb', appliesTo:['wall','facade'] }),
  renderClad: M({ id:'renderClad', label:'Render / grid-panel cladding + R2.5',
    U:0.44, kappa:42, alpha:{125:0.10,500:0.06,2000:0.05}, Rw:40,
    rf:{'2.4':7,'5':11,'6':13}, rho:0.70, colour:'#f2efe8', appliesTo:['wall','facade'] }),
  studWall: M({ id:'studWall', label:'Plasterboard stud wall (internal)',
    U:1.80, kappa:22, alpha:{125:0.29,500:0.05,2000:0.09}, Rw:36,
    rf:{'2.4':3,'5':5,'6':6}, rho:0.72, colour:'#ffffff', appliesTo:['wall'] }),
  studWallAcoustic: M({ id:'studWallAcoustic', label:'Acoustic wall (insulated, 2 layers)',
    U:0.90, kappa:26, alpha:{125:0.30,500:0.08,2000:0.10}, Rw:50,
    rf:{'2.4':4,'5':7,'6':8}, rho:0.72, colour:'#fbfbf9', appliesTo:['wall'] }),
  slabOnGround: M({ id:'slabOnGround', label:'Concrete slab on ground (waffle)',
    U:0.60, kappa:211, alpha:{125:0.01,500:0.02,2000:0.02}, Rw:55,
    rf:{'2.4':20,'5':30,'6':34}, rho:0.30, colour:'#cfd0d1', appliesTo:['floor'] }),
  timberFloor: M({ id:'timberFloor', label:'Timber-look flooring on joists',
    U:1.10, kappa:28, alpha:{125:0.15,500:0.10,2000:0.07}, Rw:45,
    rf:{'2.4':8,'5':13,'6':15}, rho:0.30, colour:'#d8c39a', appliesTo:['floor'] }),
  carpet: M({ id:'carpet', label:'Carpet + underlay',
    U:1.05, kappa:26, alpha:{125:0.08,500:0.30,2000:0.60}, Rw:46,
    rf:{'2.4':8,'5':13,'6':15}, rho:0.28, colour:'#d8d0c0', appliesTo:['floor'] }),
  ceramicTile: M({ id:'ceramicTile', label:'Ceramic tile',
    U:1.15, kappa:60, alpha:{125:0.01,500:0.02,2000:0.02}, Rw:48,
    rf:{'2.4':8,'5':12,'6':14}, rho:0.45, colour:'#dbe4ea', appliesTo:['floor','wall'] }),
  roofR40: M({ id:'roofR40', label:'Colorbond roof + R4.0 ceiling batts',
    U:0.24, kappa:18, alpha:{125:0.20,500:0.06,2000:0.08}, Rw:42,
    rf:{'2.4':35,'5':42,'6':45}, rho:0.78, colour:'#b9bec3' }),
  ceilingPlaster: M({ id:'ceilingPlaster', label:'Plasterboard ceiling (square set)',
    U:1.60, kappa:20, alpha:{125:0.29,500:0.05,2000:0.09}, Rw:36,
    rf:{'2.4':3,'5':5,'6':6}, rho:0.80, colour:'#f7f6f2', appliesTo:['ceiling'] }),
  glazingSingle: M({ id:'glazingSingle', label:'Single glazed, aluminium frame',
    U:5.70, kappa:8, alpha:{125:0.35,500:0.04,2000:0.02}, Rw:28,
    rf:{'2.4':2,'5':4,'6':5}, rho:0.10, shgc:0.75, tvis:0.80, colour:'#bfe0ec' }),
  glazingDouble: M({ id:'glazingDouble', label:'Double glazed, thermally broken',
    U:2.80, kappa:10, alpha:{125:0.30,500:0.04,2000:0.02}, Rw:33,
    rf:{'2.4':4,'5':7,'6':9}, rho:0.11, shgc:0.47, tvis:0.70, colour:'#cfe8f2' }),
  glazingLowE: M({ id:'glazingLowE', label:'Low-E double glazed',
    U:2.10, kappa:10, alpha:{125:0.30,500:0.04,2000:0.02}, Rw:34,
    rf:{'2.4':25,'5':32,'6':36}, rho:0.12, shgc:0.34, tvis:0.62, colour:'#d6ecef' }),
  doorSolid: M({ id:'doorSolid', label:'Solid core door',
    U:2.20, kappa:14, alpha:{125:0.14,500:0.06,2000:0.10}, Rw:30,
    rf:{'2.4':3,'5':6,'6':7}, rho:0.35, colour:'#cbb593' }),
  garageDoor: M({ id:'garageDoor', label:'Panel lift garage door',
    U:4.00, kappa:12, alpha:{125:0.10,500:0.06,2000:0.08}, Rw:22,
    rf:{'2.4':22,'5':28,'6':31}, rho:0.30, colour:'#c2a074' }),
  openAperture: M({ id:'openAperture', label:'Open aperture',
    U:999, kappa:0, alpha:{125:1,500:1,2000:1}, Rw:0,
    rf:{'2.4':0,'5':0,'6':0}, rho:0, shgc:0.9, tvis:1, colour:'#00000000' }),
};

export interface Fixture {
  id: string; label: string;
  A: Record<Band, number>;  // absorption area m2-sabins per item
  rfDb: number;             // extra dB when a ray intersects it
  blocksAir: boolean;
  gainW: number;            // sensible internal heat gain W
}
export const FIXTURES: Record<string, Fixture> = {
  sofa:   {id:'sofa',   label:'Sofa (3 seat)',    A:{125:0.60,500:1.10,2000:1.30}, rfDb:1.5, blocksAir:true,  gainW:0},
  bed:    {id:'bed',    label:'Bed + mattress',   A:{125:0.55,500:1.00,2000:1.20}, rfDb:1.5, blocksAir:true,  gainW:0},
  rug:    {id:'rug',    label:'Rug',              A:{125:0.10,500:0.55,2000:0.90}, rfDb:0,   blocksAir:false, gainW:0},
  curtain:{id:'curtain',label:'Curtains (draped)',A:{125:0.14,500:0.55,2000:0.70}, rfDb:0.5, blocksAir:false, gainW:0},
  robe:   {id:'robe',   label:'Robe / joinery',   A:{125:0.20,500:0.30,2000:0.35}, rfDb:4,   blocksAir:true,  gainW:0},
  tv:     {id:'tv',     label:'TV',               A:{125:0.05,500:0.08,2000:0.10}, rfDb:6,   blocksAir:false, gainW:120},
  fridge: {id:'fridge', label:'Refrigerator',     A:{125:0.10,500:0.12,2000:0.14}, rfDb:8,   blocksAir:true,  gainW:150},
  oven:   {id:'oven',   label:'Oven / cooktop',   A:{125:0.08,500:0.10,2000:0.12}, rfDb:8,   blocksAir:true,  gainW:400},
  dining: {id:'dining', label:'Dining setting',   A:{125:0.25,500:0.45,2000:0.55}, rfDb:1,   blocksAir:true,  gainW:0},
  desk:   {id:'desk',   label:'Desk + chair',     A:{125:0.18,500:0.30,2000:0.38}, rfDb:1,   blocksAir:true,  gainW:80},
  bath:   {id:'bath',   label:'Bath / sanitary',  A:{125:0.02,500:0.02,2000:0.03}, rfDb:2,   blocksAir:true,  gainW:0},
  laundry:{id:'laundry',label:'Trough + washer/dryer', A:{125:0.15,500:0.25,2000:0.30}, rfDb:6, blocksAir:true, gainW:50},
  car:    {id:'car',    label:'Car',              A:{125:0.30,500:0.40,2000:0.45}, rfDb:12,  blocksAir:true,  gainW:0},
  person: {id:'person', label:'Occupant',         A:{125:0.25,500:0.42,2000:0.46}, rfDb:3,   blocksAir:false, gainW:75},
};

export const AIR = { rho: 1.2, cp: 1005, rhoCp: 1206 };
export const C_SOUND = 343;
export const SOLAR_CONST = 1367;
