/**
 * The building model for Lot 43B, 101 Campbell Street, Fairfield East.
 * Geometry verified against the plan's dimension chains:
 *   6500 + 11280 + 8150 + 2130 + 80 = 28,140 mm overall
 *   front setback 9.300 + 28.140 + rear 7.972 = 45.412 m = lot depth
 * Envelope 28.14 x 11.00 m; first floor 21.64 x 9.56 m offset 6.5 m from rear.
 */
import { MATERIALS as MAT } from './materials';

export type Orient = 'N' | 'S' | 'E' | 'W' | 'H';   // H = horizontal (roof/floor)
export type Use = 'living'|'kitchen'|'bed'|'bath'|'study'|'hall'|'laundry'|'garage'|'store'|'outdoor';

export interface Room {
  id: string; name: string; floor: 0 | 1;
  x0: number; x1: number; z0: number; z1: number;
  use: Use;
  floorMat: string; ceilMat: string;
  fixtures: string[];
  occupants: number;
  outdoor?: boolean; void?: boolean; skylight?: boolean;
  tour?: boolean;
  /** rooms sharing a zone are one continuous volume with no dividing wall */
  zone?: string;
}
/** A downstand beam: reads as structure on the plan, must NOT be modelled as a wall. */
export interface Beam {
  id: string; floor: 0 | 1;
  x1: number; z1: number; x2: number; z2: number;
  /** depth of the downstand below the ceiling (m) */
  drop: number;
  label: string;
}
export interface Wall {
  id: string; floor: 0 | 1;
  x1: number; z1: number; x2: number; z2: number;
  mat: string;
  external: boolean;
  orient: Orient;
}
export type OpeningKind = 'window' | 'door' | 'slider' | 'garage' | 'cased';
export interface Opening {
  id: string; floor: 0 | 1; wallId: string;
  /** centre position on plan */
  x: number; z: number;
  /** clear width & height (m) */
  w: number; h: number;
  /** sill height (m) */
  sill: number;
  kind: OpeningKind;
  mat: string;
  /** fraction of the area that can actually open (awning 0.45, slider 0.5, door 0.9) */
  openableFrac: number;
  /** which two rooms it connects; null = outside */
  a: string | null; b: string | null;
  orient: Orient;
  /** default state */
  defaultOpen: boolean;
}

export const SITE = { lat: -33.8686, lon: 150.9648, tz: 10, groundAzimuthOffset: 0 };
export const GEOM = { LEN: 28.14, WID: 11.0, H0: 2.72, H1: 2.59, F1Y: 3.05, WT: 0.11 };

const R = (
  id:string,name:string,floor:0|1,x0:number,x1:number,z0:number,z1:number,
  use:Use,floorMat:string,fixtures:string[],occupants=0,extra:Partial<Room>={}
):Room => ({id,name,floor,x0,x1,z0,z1,use,floorMat,ceilMat:'ceilingPlaster',fixtures,occupants,...extra});

export const ROOMS: Room[] = [
  // ---- ground ----
  R('g_alf','Alfresco',0,0,6.5,3.1,7.6,'outdoor','timberFloor',['dining','sofa'],0,{outdoor:true}),
  // --- open-plan core: LIVING / FAMILY-DINING / KITCHEN / MEALS are ONE volume on the
  // plan (an 11,280 clear span). The line the drawing shows between them is
  // "BEAM OVER TO ENG DETAILS" — a downstand beam, not a wall. See BEAMS below.
  R('g_liv','Living',0,6.7,11.7,5.6,10.9,'living','timberFloor',['sofa','sofa','rug','tv','curtain'],2,{tour:true,zone:'open'}),
  R('g_fam','Family & Dining',0,11.7,17.7,5.6,10.9,'living','timberFloor',['dining','sofa','rug','curtain'],3,{tour:true,zone:'open'}),
  R('g_mea','Meals',0,6.7,11.6,0.1,5.6,'living','timberFloor',['dining','sofa','curtain'],2,{tour:true,zone:'open'}),
  R('g_kit','Kitchen',0,11.6,16.0,0.1,5.6,'kitchen','timberFloor',['island','fridge','oven','bench'],2,{tour:true,zone:'open'}),
  R('g_wip','Walk-in Pantry',0,16.0,17.7,0.1,2.8,'store','ceramicTile',['robe']),
  R('g_srv','Servery',0,16.0,17.7,2.8,5.6,'kitchen','timberFloor',['bench'],0,{zone:'open'}),
  R('g_pdr','Powder',0,17.91,20.09,5.6,7.42,'bath','ceramicTile',['bath']),
  R('g_lin','Linen',0,17.91,18.55,7.42,9.56,'store','ceramicTile',[]),
  R('g_wil','Walk-in Linen',0,18.55,20.09,7.42,9.56,'store','ceramicTile',['robe']),
  R('g_ldy','Laundry',0,17.91,20.09,9.56,10.81,'laundry','ceramicTile',['bath']),
  // Garage sized to the certified schedule: 32.80 m2 (5,990 x 5,480 internal).
  R('g_gar','Double Garage',0,20.09,25.93,5.13,10.81,'garage','slabOnGround',['car','car'],0,{tour:true}),
  R('g_gst','Guest Bedroom',0,17.9,21.4,0.22,2.92,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('g_en2','Ensuite 2',0,21.4,23.0,0.22,1.95,'bath','ceramicTile',['bath']),
  R('g_bd5','Bedroom 5',0,23.0,25.9,0.22,2.92,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('g_hal','Hall',0,17.85,23.9,2.92,5.13,'hall','timberFloor',[]),
  R('g_ent','Entry Foyer',0,23.9,25.93,2.92,5.13,'hall','ceramicTile',[],0,{tour:true}),
  R('g_por','Porch',0,25.93,28.03,3.5,6.5,'outdoor','ceramicTile',[],0,{outdoor:true}),
  // ---- first ----
  R('f_sit','Sitting Room',1,6.8,11.5,0.9,5.0,'living','carpet',['sofa','rug','tv','curtain'],2,{tour:true}),
  R('f_void','Void',1,6.8,11.5,5.2,10.1,'living','timberFloor',[],0,{void:true}),
  R('f_std','Study',1,11.7,15.0,0.9,4.4,'study','timberFloor',['desk','robe','curtain'],1,{tour:true}),
  R('f_bd2','Bedroom 2',1,11.7,16.2,6.35,10.1,'bed','carpet',['bed','robe','desk','curtain'],1,{tour:true}),
  R('f_wr2','WIR 2',1,16.4,18.4,6.35,7.9,'store','carpet',['robe']),
  R('f_bth','Bathroom',1,16.4,19.0,7.9,10.1,'bath','ceramicTile',['bath'],0,{tour:true,skylight:true}),
  R('f_bd4','Bedroom 4',1,19.2,23.4,6.35,10.1,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('f_lnd','Landing',1,13.0,21.5,4.4,6.35,'hall','timberFloor',[],0,{skylight:true}),
  R('f_pri','Principal Suite',1,19.6,24.0,0.9,4.2,'bed','carpet',['bed','rug','curtain'],2,{tour:true}),
  R('f_wr1','WIR 1',1,19.6,21.6,0.9,2.4,'store','carpet',['robe']),
  R('f_ens','Ensuite',1,21.8,24.0,0.9,2.6,'bath','ceramicTile',['bath'],0,{tour:true,skylight:true}),
  R('f_bal','Balcony',1,24.2,25.4,3.0,6.7,'outdoor','timberFloor',[],0,{outdoor:true,tour:true}),
];

const W = (id:string,floor:0|1,x1:number,z1:number,x2:number,z2:number,mat:string,external:boolean,orient:Orient):Wall =>
  ({id,floor,x1,z1,x2,z2,mat,external,orient});

export const WALLS: Wall[] = [
  // ground external shell — long axis runs rear(x=0) to street(x=28.14); +Z = north
  W('gw_s',0,6.6,0,28.03,0,'brickVeneerR20',true,'S'),
  W('gw_n',0,6.6,11,28.03,11,'brickVeneerR20',true,'N'),
  W('gw_e1',0,28.03,0,28.03,3.5,'brickVeneerR20',true,'E'),
  W('gw_e2',0,28.03,6.5,28.03,11,'brickVeneerR20',true,'E'),
  W('gw_w',0,6.6,0,6.6,11,'brickVeneerR20',true,'W'),
  // ground internal
  W('gi_1',0,25.93,3.5,25.93,3.9,'studWall',false,'E'),
  W('gi_2',0,25.93,5.3,25.93,6.5,'studWall',false,'E'),
  // NOTE: there is deliberately NO wall at x=11.6 or z=5.7 — the plan's 11,280 clear
  // span makes Living/Family-Dining/Kitchen/Meals a single open-plan volume.
  W('gi_5',0,16.0,0.1,16.0,2.8,'studWall',false,'E'),
  W('gi_6',0,16.0,2.8,17.7,2.8,'studWall',false,'N'),
  W('gi_7',0,17.78,0,17.78,2.92,'studWall',false,'E'),
  W('gi_8',0,17.78,5.6,17.78,11,'studWallAcoustic',false,'E'),
  W('gi_9',0,17.85,2.92,25.93,2.92,'studWall',false,'N'),
  W('gi_10',0,20.09,5.13,20.09,11,'studWallAcoustic',false,'E'),
  W('gi_11',0,17.85,7.42,20.09,7.42,'studWall',false,'N'),
  W('gi_18',0,17.85,9.56,20.09,9.56,'studWall',false,'N'),
  W('gi_12',0,20.09,5.13,25.93,5.13,'studWallAcoustic',false,'N'),
  W('gi_19',0,18.55,7.42,18.55,9.56,'studWall',false,'E'),
  W('gi_13',0,21.4,0.22,21.4,2.92,'studWall',false,'E'),
  W('gi_14',0,23.0,0.22,23.0,2.92,'studWall',false,'E'),
  W('gi_15',0,21.4,1.95,23.0,1.95,'studWall',false,'N'),
  W('gi_16',0,23.9,3.0,23.9,5.13,'studWall',false,'E'),
  // first external shell
  W('fw_s',1,6.6,0.72,25.4,0.72,'renderClad',true,'S'),
  W('fw_n',1,6.6,10.28,25.4,10.28,'renderClad',true,'N'),
  W('fw_e1',1,25.4,0.72,25.4,3.0,'renderClad',true,'E'),
  W('fw_e2',1,25.4,6.7,25.4,10.28,'renderClad',true,'E'),
  W('fw_w',1,6.6,0.72,6.6,10.28,'renderClad',true,'W'),
  // first internal
  W('fi_1',1,24.1,0.72,24.1,3.0,'studWall',false,'E'),
  W('fi_2',1,24.1,6.7,24.1,10.28,'studWall',false,'E'),
  W('fi_3',1,11.6,0.9,11.6,5.0,'studWall',false,'E'),
  W('fi_4',1,6.8,5.1,11.6,5.1,'studWall',false,'N'),
  W('fi_5',1,11.6,5.1,11.6,10.28,'studWall',false,'E'),
  W('fi_6',1,11.7,4.4,15.1,4.4,'studWall',false,'N'),
  W('fi_7',1,15.1,0.72,15.1,4.5,'studWall',false,'E'),
  W('fi_8',1,16.3,5.1,16.3,10.28,'studWallAcoustic',false,'E'),
  W('fi_9',1,16.3,7.9,19.1,7.9,'studWallAcoustic',false,'N'),
  W('fi_10',1,19.1,7.9,19.1,10.28,'studWallAcoustic',false,'E'),
  W('fi_11',1,13.0,6.35,21.5,6.35,'studWall',false,'N'),
  W('fi_12',1,19.5,4.3,19.5,6.35,'studWall',false,'E'),
  W('fi_13',1,19.5,4.3,24.1,4.3,'studWallAcoustic',false,'N'),
  W('fi_14',1,19.5,0.72,19.5,4.3,'studWallAcoustic',false,'E'),
  W('fi_15',1,19.6,2.45,21.7,2.45,'studWall',false,'N'),
  W('fi_16',1,21.7,0.72,21.7,2.45,'studWall',false,'E'),
  W('fi_17',1,18.4,6.35,18.4,7.9,'studWall',false,'E'),
];

export interface Stair {
  id: string; fromFloor: 0 | 1;
  x0: number; x1: number; z0: number; z1: number;
  width: number; risers: number;
  /** the two spaces it joins */
  connects: [string, string];
}
/** Straight flight against the north side of the hall, under the first floor landing. */
export const STAIRS: Stair[] = [
  { id:'st_1', fromFloor:0, x0:20.45, x1:23.85, z0:4.05, z1:5.10, width:1.05, risers:14,
    connects:['g_hal','f_lnd'] },
];

/** Downstand beams the plan marks "BEAM OVER TO ENG DETAILS". Rendered as soffits. */
export const BEAMS: Beam[] = [
  { id:'b_open_ns', floor:0, x1:6.7,  z1:5.6, x2:17.7, z2:5.6,  drop:0.34, label:'Beam over — open plan' },
  { id:'b_kit_ew',  floor:0, x1:11.6, z1:0.1, x2:11.6, z2:5.6,  drop:0.28, label:'Beam over — kitchen bulkhead' },
  { id:'b_gar',     floor:0, x1:19.94,z1:8.0, x2:25.93,z2:8.0,  drop:0.30, label:'Beam over — garage' },
];

const O = (
  id:string,floor:0|1,wallId:string,x:number,z:number,w:number,h:number,sill:number,
  kind:OpeningKind,mat:string,openableFrac:number,a:string|null,b:string|null,orient:Orient,defaultOpen=false
):Opening => ({id,floor,wallId,x,z,w,h,sill,kind,mat,openableFrac,a,b,orient,defaultOpen});

/** Windows are auto-distributed along external walls; doors/sliders are explicit. */
export const OPENINGS: Opening[] = [
  // ground doors
  O('d_entry',0,'gw_e1',28.03,5.0,1.1,2.34,0,'door','doorSolid',0.9,'g_ent',null,'E'),
  O('d_alf',0,'gw_w',6.6,5.35,3.6,2.15,0,'slider','glazingSingle',0.5,'g_mea',null,'W'),
  O('d_gar',0,'gw_e2',28.03,8.6,4.81,2.143,0,'garage','garageDoor',0.9,'g_gar',null,'E'),
  O('d_g1',0,'gi_9',19.62,2.92,0.9,2.34,0,'door','doorSolid',0.9,'g_hal','g_gst','N'),
  O('d_g2',0,'gi_9',24.6,2.92,0.9,2.34,0,'door','doorSolid',0.9,'g_ent','g_bd5','N'),
  O('d_g3',0,'gi_13',21.4,1.2,0.8,2.34,0,'door','doorSolid',0.9,'g_gst','g_en2','E'),
  O('d_g4',0,'gi_11',19.4,7.42,0.82,2.34,0,'door','doorSolid',0.9,'g_pdr','g_wil','N'),
  O('d_g4b',0,'gi_18',19.4,9.56,0.82,2.34,0,'door','doorSolid',0.9,'g_wil','g_ldy','N'),
  O('d_g4c',0,'gi_19',18.55,8.5,0.82,2.34,0,'door','doorSolid',0.9,'g_wil','g_lin','E'),
  O('d_g4d',0,'gi_8',17.78,6.4,0.9,2.34,0,'door','doorSolid',0.9,'g_fam','g_pdr','E'),
  O('d_g5',0,'gi_10',20.09,6.6,0.85,2.34,0,'door','doorSolid',0.9,'g_gar','g_pdr','E'),
  O('d_g6',0,'gi_12',22.5,5.13,2.4,2.34,0,'door','doorSolid',0.9,'g_gar','g_hal','N'),
  O('d_g8',0,'gi_5',16.0,1.6,0.85,2.34,0,'door','doorSolid',0.9,'g_kit','g_wip','E'),
  O('d_g9',0,'gi_16',23.9,4.6,1.5,2.34,0,'cased','openAperture',1,'g_ent','g_hal','E',true),
  // first doors
  O('d_bal',1,'fw_e1',25.4,4.85,2.2,2.15,0,'slider','glazingSingle',0.5,'f_pri',null,'E'),
  O('d_f1',1,'fi_3',11.6,3.6,0.9,2.34,0,'door','doorSolid',0.9,'f_sit','f_std','E'),
  O('d_f2',1,'fi_6',13.4,4.4,0.9,2.34,0,'door','doorSolid',0.9,'f_std','f_lnd','N'),
  O('d_f3',1,'fi_11',13.9,6.35,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_bd2','N'),
  O('d_f4',1,'fi_9',17.6,7.9,0.8,2.34,0,'door','doorSolid',0.9,'f_wr2','f_bth','N'),
  O('d_f5',1,'fi_13',21.0,4.3,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_pri','N'),
  O('d_f6',1,'fi_11',20.3,6.35,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_bd4','N'),
  O('d_f7',1,'fi_16',21.7,1.6,0.7,2.34,0,'door','doorSolid',0.9,'f_wr1','f_ens','E'),
  O('d_f8',1,'fi_15',20.5,2.45,0.8,2.34,0,'door','doorSolid',0.9,'f_pri','f_wr1','N'),
  O('d_f9',1,'fi_8',16.3,7.0,0.72,2.34,0,'door','doorSolid',0.9,'f_bd2','f_wr2','E'),
];

/** Auto-generate awning/sliding windows along every external wall. */
export function generateWindows(): Opening[] {
  const out: Opening[] = [];
  const doorX = new Set(OPENINGS.map(o => o.wallId + ':' + o.x.toFixed(1) + ':' + o.z.toFixed(1)));
  for (const w of WALLS) {
    if (!w.external) continue;
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz);
    if (L < 2.0) continue;
    const n = Math.max(1, Math.floor(L / 3.2)), gap = L / n;
    for (let i = 0; i < n; i++) {
      const t = (gap * (i + 0.5)) / L;
      const x = w.x1 + dx * t, z = w.z1 + dz * t;
      // skip if a door already occupies this stretch
      let clash = false;
      for (const o of OPENINGS) if (o.wallId === w.id && Math.hypot(o.x - x, o.z - z) < (o.w / 2 + 0.9)) clash = true;
      if (clash) continue;
      const room = ROOMS.find(r => r.floor === w.floor && !r.outdoor && !r.void &&
        x >= r.x0 - 0.35 && x <= r.x1 + 0.35 && z >= r.z0 - 0.35 && z <= r.z1 + 0.35);
      if (room && ['store','garage','laundry'].includes(room.use)) continue;
      out.push(O(`win_${w.id}_${i}`, w.floor, w.id, x, z, 1.4, 1.25, 0.9,
        'window', 'glazingSingle', 0.45, room ? room.id : null, null, w.orient));
    }
  }
  return out;
}

export const ALL_OPENINGS: Opening[] = [...OPENINGS, ...generateWindows()];

export const roomById = (id: string) => ROOMS.find(r => r.id === id);
export const wallById = (id: string) => WALLS.find(w => w.id === id);
export const roomArea = (r: Room) => (r.x1 - r.x0) * (r.z1 - r.z0);
export const roomHeight = (r: Room) => (r.floor === 0 ? GEOM.H0 : GEOM.H1);
export const roomVolume = (r: Room) => roomArea(r) * roomHeight(r);
export const roomCentre = (r: Room) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
export function roomAt(floor: 0|1, x: number, z: number) {
  return ROOMS.find(r => r.floor === floor && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}
/** External wall area facing a room, by orientation, minus its glazing */
export function envelopeOf(room: Room) {
  const H = roomHeight(room);
  const walls = WALLS.filter(w => w.floor === room.floor && w.external).filter(w => {
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    const nearX = mx >= room.x0 - 0.4 && mx <= room.x1 + 0.4;
    const nearZ = mz >= room.z0 - 0.4 && mz <= room.z1 + 0.4;
    if (Math.abs(w.x1 - w.x2) < 0.01) return Math.abs(w.x1 - room.x0) < 0.5 || Math.abs(w.x1 - room.x1) < 0.5;
    if (Math.abs(w.z1 - w.z2) < 0.01) return (Math.abs(w.z1 - room.z0) < 0.5 || Math.abs(w.z1 - room.z1) < 0.5) && nearX;
    return nearX && nearZ;
  });
  const segs = walls.map(w => {
    // overlap length of this wall with the room footprint
    const horiz = Math.abs(w.z1 - w.z2) < 0.01;
    const lo = horiz ? Math.max(Math.min(w.x1, w.x2), room.x0) : Math.max(Math.min(w.z1, w.z2), room.z0);
    const hi = horiz ? Math.min(Math.max(w.x1, w.x2), room.x1) : Math.min(Math.max(w.z1, w.z2), room.z1);
    return { wall: w, len: Math.max(0, hi - lo), area: Math.max(0, hi - lo) * H };
  }).filter(s => s.len > 0.05);
  return segs;
}
export { MAT };
