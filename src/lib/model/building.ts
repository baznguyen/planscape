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
// H0 and F1Y are the surveyed RLs off the elevations: FFL 16,490 to FCL 19,230
// is 2,740, and FFL 19,530 is 3,040 above ground FFL.
export const GEOM = { LEN: 28.14, WID: 11.0, H0: 2.74, H1: 2.59, F1Y: 3.04, WT: 0.11 };

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
  R('g_liv','Living',0,6.7,11.7,5.6,9.33,'living','timberFloor',['sofa','sofa','rug','tv','curtain'],2,{tour:true,zone:'open'}),
  R('g_fam','Family & Dining',0,11.7,15.38,5.6,9.33,'living','timberFloor',['dining','sofa','rug','curtain'],3,{tour:true,zone:'open'}),
  R('g_mea','Meals',0,6.7,11.6,0.1,5.6,'living','timberFloor',['dining','sofa','curtain'],2,{tour:true,zone:'open'}),
  R('g_kit','Kitchen',0,11.6,15.38,0.1,5.13,'kitchen','timberFloor',['island','fridge','oven','bench'],2,{tour:true,zone:'open'}),
  R('g_wip','Walk-in Pantry',0,15.38,17.58,0.39,2.99,'store','ceramicTile',['robe']),
  R('g_srv','Servery',0,15.38,17.58,2.99,5.13,'kitchen','timberFloor',['bench'],0,{zone:'open'}),
  R('g_pdr','Powder',0,15.38,17.94,7.33,9.33,'bath','ceramicTile',['bath']),
  R('g_lin','Linen',0,15.38,17.05,5.21,7.33,'store','ceramicTile',[]),
  R('g_wil','Walk-in Linen',0,17.05,19.00,5.21,7.33,'store','ceramicTile',['robe']),
  // The lobby SK1 draws between the hall and the service rooms. Without it the
  // laundry and the walk-in linen have to be entered through each other, which
  // is how the model ended up with a door from the garage into the WIL.
  R('g_lob','Laundry Lobby',0,19.00,20.09,5.13,7.33,'hall','ceramicTile',[]),
  R('g_ldy','Laundry',0,17.94,20.04,7.33,10.74,'laundry','ceramicTile',['bath']),
  // Garage sized to the certified schedule: 32.80 m2 (5,990 x 5,480 internal).
  R('g_gar','Double Garage',0,20.09,25.93,5.13,10.81,'garage','slabOnGround',['car','car'],0,{tour:true}),
  R('g_gst','Guest Bedroom',0,17.9,21.54,0.39,3.00,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('g_en2','Ensuite 2',0,21.54,23.39,0.39,2.95,'bath','ceramicTile',['bath']),
  R('g_bd5','Bedroom 5',0,23.44,25.90,0.39,3.53,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('g_hal','Hall',0,17.85,23.44,3.00,5.13,'hall','timberFloor',[]),
  R('g_ent','Entry Foyer',0,23.44,25.90,3.53,5.13,'hall','ceramicTile',[],0,{tour:true}),
  R('g_por','Porch',0,25.93,28.03,3.5,6.5,'outdoor','ceramicTile',[],0,{outdoor:true}),
  // ---- first ----
  R('f_sit','Sitting Room',1,6.8,11.5,0.9,5.0,'living','carpet',['sofa','rug','tv','curtain'],2,{tour:true}),
  R('f_void','Void',1,6.8,11.5,5.2,10.1,'living','timberFloor',[],0,{void:true}),
  R('f_std','Study',1,11.7,15.0,0.9,5.0,'study','timberFloor',['desk','robe','curtain'],1,{tour:true}),
  R('f_bd2','Bedroom 2',1,11.7,16.2,6.35,10.1,'bed','carpet',['bed','robe','desk','curtain'],1,{tour:true}),
  R('f_wr2','WIR 2',1,16.4,18.4,6.35,7.9,'store','carpet',['robe']),
  R('f_bth','Bathroom',1,16.4,19.0,7.9,10.1,'bath','ceramicTile',['bath'],0,{tour:true,skylight:true}),
  R('f_bd4','Bedroom 4',1,19.2,25.9,6.35,10.1,'bed','carpet',['bed','robe','curtain'],1,{tour:true}),
  R('f_lnd','Landing',1,13.0,21.5,5.0,6.35,'hall','timberFloor',[],0,{skylight:true}),
  /**
   * The floor the flight actually arrives on. Once the stair was re-measured
   * onto its real line it climbed to first floor level at x 18,400 — and there
   * was no room there, so it finished in mid air. SK1 shows the landing running
   * on past the head of the flight to the study wall; this is that piece of it,
   * stopped at z 5,000 so it butts the corridor rather than overlapping it.
   *
   * It is a patch on a bigger problem, and worth saying so plainly: with the
   * ground floor now registered against the sheet at true 1:100, the first floor
   * transcription is visibly out — between 0.7 m and 2 m depending on which wall
   * you measure, and not by a constant, so it cannot be nudged back into place.
   * That level needs re-measuring the same way this one was, wall by wall,
   * before anything else on it should be trusted.
   */
  R('f_hea','Stair Head',1,15.35,18.39,3.05,5.0,'hall','timberFloor',[]),
  R('f_pri','Principal Suite',1,19.6,25.9,2.6,5.0,'bed','carpet',['bed','rug','curtain'],2,{tour:true}),
  R('f_wr1','WIR 1',1,19.6,21.6,0.9,2.4,'store','carpet',['robe']),
  R('f_ens','Ensuite',1,21.8,24.0,0.9,2.6,'bath','ceramicTile',['bath'],0,{tour:true,skylight:true}),
  R('f_bal','Balcony',1,26.05,27.53,3.0,6.0,'outdoor','timberFloor',[],0,{outdoor:true,tour:true}),
];

const W = (id:string,floor:0|1,x1:number,z1:number,x2:number,z2:number,mat:string,external:boolean,orient:Orient):Wall =>
  ({id,floor,x1,z1,x2,z2,mat,external,orient});

export const WALLS: Wall[] = [
  // ground external shell — long axis runs rear(x=0) to street(x=28.14); +Z = north
  W('gw_s',0,6.6,0,28.03,0,'brickVeneerR20',true,'S'),
  // The north wall STEPS. It runs at z 9,450 from the west end to x 17,900, and
  // only the laundry and garage block carries on north to z 10,850. Modelled as
  // one straight run at z 11,000 it stretched the living and family rooms 1.5 m
  // too deep and left the whole service block nowhere to sit — which is what put
  // the powder room on the wrong side of the linen press.
  W('gw_n1',0,6.6,9.45,17.90,9.45,'brickVeneerR20',true,'N'),
  W('gw_n2',0,17.90,9.45,17.90,10.90,'brickVeneerR20',true,'E'),
  W('gw_n3',0,17.90,10.90,28.03,10.90,'brickVeneerR20',true,'N'),
  W('gw_e1',0,28.03,0,28.03,3.5,'brickVeneerR20',true,'E'),
  W('gw_w',0,6.6,0,6.6,11,'brickVeneerR20',true,'W'),
  // ground internal
  W('gi_1',0,25.93,2.92,25.93,5.13,'studWall',false,'E'),
  // The garage's own street wall carries the panel lift door. East of it the
  // drawing marks "LINE OF DWELLING OVER" — driveway under the first floor
  // cantilever, not enclosed garage.
  W('gi_20',0,25.93,5.13,25.93,10.81,'brickVeneerR20',false,'E'),
  // NOTE: there is deliberately NO wall at x=11.6 or z=5.7 — the plan's 11,280 clear
  // span makes Living/Family-Dining/Kitchen/Meals a single open-plan volume.
  W('gi_5',0,15.38,0.39,15.38,2.99,'studWall',false,'E'),
  W('gi_6',0,15.38,2.99,17.58,2.99,'studWall',false,'N'),
  W('gi_7',0,17.58,0.39,17.58,2.99,'studWall',false,'E'),
  // The wall between the powder room and the laundry, measured at x 17,940 and
  // running from the linen wall right up to the north face.
  W('gi_8',0,17.94,7.33,17.94,10.74,'studWallAcoustic',false,'E'),
  // West wall of the whole service block: one run, z 3,270 to the north face.
  W('gi_21',0,15.38,3.27,15.38,9.33,'studWall',false,'E'),
  W('gi_22',0,17.05,5.21,17.05,7.33,'studWall',false,'E'),
  W('gi_23',0,19.00,5.21,19.00,7.33,'studWall',false,'E'),
  W('gi_24',0,15.38,5.13,19.03,5.13,'studWall',false,'N'),
  // Measured off SK1: this wall runs z 3,000 and stops at x 23,440, where a
  // north-south wall picks up and the boundary steps 530 north to serve
  // bedroom 5. Modelled as one straight run at z 2,920 all the way to the
  // east wall, it pushed the entry foyer 600 mm into the bedroom.
  W('gi_9',0,18.40,3.00,23.44,3.00,'studWall',false,'N'),
  W('gi_9b',0,23.44,3.53,25.93,3.53,'studWall',false,'N'),
  W('gi_9c',0,23.44,0.39,23.44,3.53,'studWall',false,'E'),
  W('gi_10',0,20.09,5.13,20.09,11,'studWallAcoustic',false,'E'),
  W('gi_11',0,15.38,7.33,20.04,7.33,'studWall',false,'N'),
  
  W('gi_12',0,20.09,5.13,25.93,5.13,'studWallAcoustic',false,'N'),
  W('gi_13',0,21.54,0.39,21.54,3.00,'studWall',false,'E'),
  W('gi_14',0,23.0,0.22,23.0,2.92,'studWall',false,'E'),
  W('gi_15',0,21.4,1.95,23.0,1.95,'studWall',false,'N'),
  /**
   * REMOVED — gi_16, a stud wall at x = 23,900 between the entry and the hall.
   *
   * It is not on the drawing. Sheet SK1 shows the ENTRY open to the west with
   * the stair's bottom riser starting directly off it; the only heavy linework
   * in that corner is the south wall to Bed 5 and the wall over the top. The
   * wall I had modelled put a partition across the front door's own landing and
   * discharged its opening straight onto the flank of the staircase — which is
   * what "how can anyone walk into the back of the house" was pointing at.
   *
   * planTrace.ts carried the same line, which is the honest lesson here: a
   * transcription cannot check a transcription. Only the sheet can, which is
   * what the plan-sheet underlay is for.
   */
  // first external shell
  W('fw_s',1,6.6,0.72,27.58,0.72,'renderClad',true,'S'),
  W('fw_n',1,6.6,10.28,27.58,10.28,'renderClad',true,'N'),
  W('fw_e1',1,27.58,0.72,27.58,3.0,'renderClad',true,'E'),
  W('fw_e2',1,27.58,6.0,27.58,10.28,'renderClad',true,'E'),
  W('fw_w',1,6.6,0.72,6.6,10.28,'renderClad',true,'W'),
  // first internal
  W('fi_1',1,25.95,0.72,25.95,5.0,'studWall',false,'E'),
  W('fi_2',1,25.95,6.0,25.95,10.28,'studWall',false,'E'),
  W('fi_3',1,11.6,0.9,11.6,5.0,'studWall',false,'E'),
  W('fi_4',1,6.8,5.1,11.6,5.1,'studWall',false,'N'),
  W('fi_5',1,11.6,5.1,11.6,10.28,'studWall',false,'E'),
  W('fi_6',1,11.7,5.0,15.1,5.0,'studWall',false,'N'),
  W('fi_7',1,15.1,0.72,15.1,4.5,'studWall',false,'E'),
  W('fi_8',1,16.3,6.35,16.3,10.28,'studWallAcoustic',false,'E'),
  W('fi_9',1,16.3,7.9,19.1,7.9,'studWallAcoustic',false,'N'),
  W('fi_10',1,19.1,7.9,19.1,10.28,'studWallAcoustic',false,'E'),
  W('fi_11',1,13.0,6.35,21.5,6.35,'studWall',false,'N'),
  W('fi_12',1,19.5,5.0,19.5,6.35,'studWall',false,'E'),
  W('fi_13',1,19.5,5.0,25.95,5.0,'studWallAcoustic',false,'N'),
  W('fi_14',1,19.5,0.72,19.5,5.0,'studWallAcoustic',false,'E'),
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
/**
 * Straight flight along the SOUTH side of the hall, rising west, under the
 * first floor landing void.
 *
 * Re-measured off SK1 rather than re-typed. The sheet is plotted at 1:100, so
 * one metre is exactly 28.3465 pt, and at that scale the drawing gives the
 * flight without any interpretation:
 *   · the treads are numbered — 1..6 on the ground floor sheet, 2..17 on the
 *     first floor sheet — and their number text sits at a dead-regular 7.087 pt
 *     pitch, which is a 250 mm going to three figures;
 *   · tread 1 centres on x 22.54 and tread 17 on x 18.53, so the run is 16
 *     goings and the 17th tread is followed by one more riser onto the landing:
 *     18 risers over the 3,040 floor-to-floor, or 169 mm each;
 *   · the riser lines span 29.77 pt in z — 1,050 mm — from z 3.04 to z 4.09.
 *
 * The previous figures had the flight a metre north and 1.2 m east of that,
 * jammed against the garage wall. That is what put a stair under the garage
 * door and left no way past it into the back of the house. It was never a
 * rendering fault; the model said so and the render drew what it was told.
 */
export const STAIRS: Stair[] = [
  { id:'st_1', fromFloor:0, x0:18.40, x1:22.67, z0:3.04, z1:4.09, width:1.05, risers:18,
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
  O('d_entry',0,'gi_1',25.93,4.4,1.1,2.34,0,'door','doorSolid',0.9,'g_ent',null,'E'),
  O('d_alf',0,'gw_w',6.6,5.35,3.6,2.15,0,'slider','glazingSingle',0.5,'g_mea',null,'W'),
  O('d_gar',0,'gi_20',25.93,8.3,4.81,2.143,0,'garage','garageDoor',0.9,'g_gar',null,'E'),
  // "CSD 720" — a 720 cavity slider, jambs at x 18.40 and x 19.12 on the sheet.
  // It has to be at that end: the flight runs the length of this wall, and only
  // at its top is there height to walk under. Modelled 860 mm east of there it
  // sat below the middle of the flight with 1.9 m of headroom.
  O('d_g1',0,'gi_9',18.76,3.00,0.72,2.34,0,'door','doorSolid',0.9,'g_hal','g_gst','N'),
  O('d_g2',0,'gi_9b',24.6,3.53,0.9,2.34,0,'door','doorSolid',0.9,'g_ent','g_bd5','N'),
  O('d_g3',0,'gi_13',21.54,1.2,0.8,2.34,0,'door','doorSolid',0.9,'g_gst','g_en2','E'),
  O('d_g4',0,'gi_11',19.44,7.33,0.82,2.34,0,'door','doorSolid',0.9,'g_lob','g_ldy','N'),
  O('d_g4b',0,'gi_11',18.56,7.33,0.87,2.34,0,'door','doorSolid',0.9,'g_wil','g_ldy','N'),
  // LINEN opens to the family room through the 1,700 the sheet dimensions, with
  // the two 820 leaves it labels. It is a press, not a room you walk through.
  O('d_g4c',0,'gi_21',15.38,6.27,1.70,2.34,0,'cased','doorSolid',1,'g_fam','g_lin','E'),
  /**
   * INFERENCE, flagged as one: the open-plan core has to reach the hall.
   *
   * Redline refused the model without it — seven rooms unreachable, which is the
   * rule doing exactly its job. On SK1 the wall at x 15,400 reads as continuous
   * from z 3,270 north, and the servery strip between it and the hall is drawn
   * open, with "BEAM OVER TO ENG DETAILS" across it and no door symbol anywhere.
   * A kitchen you can only enter through a linen press is not a plan, so the
   * likeliest reading is that this stretch is a cased opening under that beam and
   * the line is the lintel. Confirm against the sheet before it is built from.
   */
  O('o_g9',0,'gi_21',15.38,4.20,1.60,2.34,0,'cased','doorSolid',1,'g_kit','g_srv','E'),
  // The powder room is entered off the laundry lobby end of the hall, not from
  // the family room — there is no opening in the family room's east wall.
  O('d_g4d',0,'gi_11',16.60,7.33,0.87,2.34,0,'door','doorSolid',0.9,'g_lin','g_pdr','N'),
  // SK1 shows NO door between the garage and the service rooms — the garage's
  // only way into the house is the 820 to the hall. What was modelled here read
  // in the render as a door from the walk-in linen straight into the garage.
  // The lobby is reached from the hall, through the 1,010 gap the sheet leaves
  // in the wall at z 5,130.
  O('o_g5',0,'gi_24',19.03,5.13,1.01,2.34,0,'cased','doorSolid',1,'g_hal','g_lob','N'),
  // Garage to hall. SK1 labels this "820" and draws a single swinging leaf; the
  // jambs measure to x 20.17 and x 21.03 at 1:100. It had been carrying a 2.4 m
  // cased opening at x 22.5 — three times the width, two metres out of position,
  // and discharging onto the staircase. A 2.4 m opening could not be right in
  // any case: NCC Vol Two requires the garage/dwelling connection to be a
  // self-closing solid-core doorset, which is what "820" on the sheet means.
  O('d_g6',0,'gi_12',20.60,5.13,0.86,2.34,0,'door','doorSolid',0.9,'g_gar','g_hal','N'),
  O('d_g8',0,'gi_5',15.38,1.6,0.72,2.34,0,'door','doorSolid',0.9,'g_kit','g_wip','E'),
  // first doors
  O('d_bal',1,'fi_1',25.95,3.6,2.2,2.15,0,'slider','glazingSingle',0.5,'f_pri','f_bal','E'),
  O('d_f1',1,'fi_3',11.6,3.6,0.9,2.34,0,'door','doorSolid',0.9,'f_sit','f_std','E'),
  O('d_f2',1,'fi_6',13.4,5.0,0.9,2.34,0,'door','doorSolid',0.9,'f_std','f_lnd','N'),
  O('d_f3',1,'fi_11',13.9,6.35,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_bd2','N'),
  O('d_f4',1,'fi_9',17.6,7.9,0.8,2.34,0,'door','doorSolid',0.9,'f_wr2','f_bth','N'),
  O('d_f5',1,'fi_13',21.0,5.0,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_pri','N'),
  O('d_f6',1,'fi_11',20.3,6.35,0.9,2.34,0,'door','doorSolid',0.9,'f_lnd','f_bd4','N'),
  /**
   * fi_12 is a 1.35 m stub across the landing at x = 19,500. As drawn it sealed
   * the east end of the landing, which is the ONLY way into the primary suite,
   * its robe, its ensuite and bedroom 4 — four rooms with no route to the stair.
   * A hallway does not stop dead in front of four doors, and the landing
   * rectangle itself runs through to 21,500, so the stub reads as a jamb and
   * the gap between it and fi_13 as a cased opening. Modelled as one, 1,200
   * wide. INFERENCE, not a measured dimension: confirm against sheet SK1.
   * The walkability rule in draftingRules.ts is what found this.
   */
  O('o_f12',1,'fi_12',19.5,5.7,1.2,2.34,0,'cased','doorSolid',1,'f_lnd','f_lnd','E'),
  O('d_f7',1,'fi_16',21.7,1.6,0.7,2.34,0,'door','doorSolid',0.9,'f_wr1','f_ens','E'),
  O('d_f8',1,'fi_15',20.5,2.45,0.8,2.34,0,'door','doorSolid',0.9,'f_pri','f_wr1','N'),
  O('d_f9',1,'fi_8',16.3,7.0,0.72,2.34,0,'door','doorSolid',0.9,'f_bd2','f_wr2','E'),
];

/**
 * Windows, one per room per external wall it fronts.
 *
 * The first version of this marched along each external wall at a fixed 3.2 m
 * pitch and asked which room happened to be near each mark. That is backwards.
 * A window belongs to a room — a draftsperson places it where the room needs
 * light and where the furniture will let it sit, not on a grid — and a pitch
 * that ignores rooms will give one bedroom two windows and the next none. It
 * did exactly that: Bedroom 5 fell between two marks and was modelled with no
 * glazing at all.
 *
 * So: for every external wall, find the rooms whose frontage touches it, and
 * give each one window centred on its own stretch of that wall, sized towards
 * the 10% of floor area the NCC asks for and bounded by the frontage available.
 * These are still generated openings, not the schedule off SK1 (AW 0409, AS
 * 0627 and the rest) — but they are now wrong in a way that is proportionate
 * rather than arbitrary.
 */
export function generateWindows(): Opening[] {
  const out: Opening[] = [];
  const HEAD = 1.25, SILL = 0.9, REVEAL = 0.3;
  for (const w of WALLS) {
    if (!w.external) continue;
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz);
    if (L < 2.0) continue;
    const ux = dx / L, uz = dz / L;                     // along the wall
    const nx = -uz, nz = ux;                            // across it
    let i = 0;
    for (const r of ROOMS) {
      if (r.floor !== w.floor || r.outdoor || r.void) continue;
      if (['store', 'garage', 'laundry'].includes(r.use)) continue;
      // project the room's corners onto the wall: how much of it does it front,
      // and how far off the wall line does its nearest face sit?
      let t0 = Infinity, t1 = -Infinity, off = Infinity;
      for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) {
        t0 = Math.min(t0, (cx - w.x1) * ux + (cz - w.z1) * uz);
        t1 = Math.max(t1, (cx - w.x1) * ux + (cz - w.z1) * uz);
        off = Math.min(off, Math.abs((cx - w.x1) * nx + (cz - w.z1) * nz));
      }
      // 600 mm covers any residential wall build-up; beyond that the room is
      // simply not on this wall
      if (off > 0.6) continue;
      /**
       * Place it in the free part of the frontage, not the middle of it.
       *
       * The first version put the window at the midpoint and then threw it away
       * if a modelled door was anywhere near. On this house the alfresco slider
       * is 3.6 m wide and straddles two rooms, so it suppressed the living
       * room's only west window entirely — the room ended up with glazing on one
       * orientation, no cross ventilation, and no way to tell from the model
       * that anything was missing. A wide door belonging to the room next door
       * should not deny this room its glass; it should just move it along the
       * wall, which is what a draftsperson does.
       */
      let free: [number, number][] = [[Math.max(t0, REVEAL), Math.min(t1, L - REVEAL)]];
      for (const o of OPENINGS) {
        if (o.wallId !== w.id) continue;
        const ot = (o.x - w.x1) * ux + (o.z - w.z1) * uz;
        const lo = ot - o.w / 2 - 0.3, hi = ot + o.w / 2 + 0.3;
        free = free.flatMap(([s0, s1]) =>
          hi <= s0 || lo >= s1 ? [[s0, s1] as [number, number]]
            : [[s0, Math.min(s1, lo)] as [number, number],
               [Math.max(s0, hi), s1] as [number, number]]);
      }
      const [a, b] = free.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best),
                                 [0, -1] as [number, number]);
      if (b - a < 1.2) continue;                        // no clear run for a window
      const t = (a + b) / 2;
      const x = w.x1 + ux * t, z = w.z1 + uz * t;
      // sized towards 10% of the floor, capped by the frontage on offer
      const want = ((r.x1 - r.x0) * (r.z1 - r.z0) * 0.11) / HEAD;
      const width = Math.min(Math.max(want, 0.9), b - a - 0.4, 3.0);
      out.push(O(`win_${w.id}_${i++}`, w.floor, w.id, x, z, width, HEAD, SILL,
        'window', 'glazingSingle', 0.45, r.id, null, w.orient));
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
