'use client';
import { create } from 'zustand';
import { ROOMS, ALL_OPENINGS, type Room } from '@/lib/model/building';
import { autoDesign, type Light, AMBIENCE, warmDim } from '@/lib/solvers/lighting';
import { settle, stepThermal, type ThermalState, type ThermalCtx, type RoomThermalBreakdown } from '@/lib/solvers/thermal';
import { WIND } from '@/lib/solvers/airflow';
import { DEFAULT_APS, type AP } from '@/lib/solvers/rf';
import { assetById } from '@/lib/model/assets';
import { resolveMount } from '@/lib/model/mounting';

export type OverlayKey = 'dims'|'thermal'|'light'|'audio'|'air'|'hvac'|'wifi'|'elec'|'plan';
export type ViewMode = 'walk' | 'plan' | 'street';

export interface Speaker { id:string; type:string; floor:0|1; room:string; x:number; z:number; y:number; db:number;
  /** catalogue id and coupled surface count, for the SPL solver */
  asset?:string; boundaries?:number }

/** Anything the user drops into the model by hand. */
export type ItemKind = 'furniture' | 'heater' | 'vent' | 'speaker' | 'ap' | 'light';
export interface PlacedItem {
  id: string; kind: ItemKind; type: string;
  /** id in the asset catalogue — carries the engineering metadata */
  asset: string;
  floor: 0|1; room: string;
  x: number; z: number; y: number; rot: number;
  /** how many surfaces it is coupled to; drives subwoofer boundary gain */
  boundaries: number;
  wallId?: string;
  /** kW for a heater */
  power: number;
  on: boolean;
}
/** A finish applied to a room surface — either a catalogue material or an uploaded image. */
export interface Finish {
  name: string;
  /** id in MATERIALS, when chosen from the catalogue */
  material?: string;
  /** data: URL of an uploaded swatch */
  image?: string;
  colour?: string;
}
export type Surface = 'floor' | 'wall' | 'ceiling';

interface S {
  view: ViewMode; floor: 0|1;
  month: number; minutes: number; playing: boolean; speed: number;
  overlays: Record<OverlayKey, boolean>;
  openIds: Set<string>;
  lights: Light[]; ambience: number;
  speakers: Speaker[]; acFreq: number; acRoom: string | null;
  aps: AP[]; rfBand: '2.4'|'5'|'6';
  hvacOn: boolean; setpointCool: number; setpointHeat: number;
  thermal: ThermalState; thermalDetail: Record<string, RoomThermalBreakdown>;
  outdoorT: number;
  selectedRoom: string | null; hoverRoom: string | null;
  showRoof: boolean; fov: number;
  items: PlacedItem[];
  placing: { kind: ItemKind; type: string } | null;
  /** first-person movement input: forward and strafe, each -1..1 */
  walkInput: { f: number; s: number };
  /** bumped to ask the camera rig to return to the view's default vantage */
  resetNonce: number;
  /** true = standing inside at eye height; false = doll's-house overview */
  eyeLevel: boolean;
  /** only one floating drawer at a time — they share the same corner on a phone */
  drawer: 'rail' | 'tools' | 'review' | null;
  finishes: Record<string, Partial<Record<Surface, Finish>>>;
  setView:(v:ViewMode)=>void; setFloor:(f:0|1)=>void;
  setMonth:(m:number)=>void; setMinutes:(m:number)=>void; togglePlay:()=>void;
  toggleOverlay:(k:OverlayKey)=>void;
  toggleOpening:(id:string)=>void; setAllOpenings:(open:boolean)=>void;
  autoLightRoom:(roomId:string)=>void; updateLight:(id:string,p:Partial<Light>)=>void;
  removeLight:(id:string)=>void; addLight:(l:Light)=>void;
  applyAmbience:(i:number)=>void; toggleRoomLights:(roomId:string)=>void;
  setSpeakers:(s:Speaker[])=>void; setAcFreq:(f:number)=>void; setAcRoom:(r:string|null)=>void;
  setHvac:(on:boolean)=>void;
  tickThermal:(dtSeconds:number)=>void; resettleThermal:()=>void;
  setSelected:(id:string|null)=>void; setHover:(id:string|null)=>void;
  setShowRoof:(b:boolean)=>void; setFov:(n:number)=>void;
  setPlacing:(p:{kind:ItemKind;type:string}|null)=>void;
  placeAt:(floor:0|1,x:number,z:number,room:string)=>void;
  updateItem:(id:string,p:Partial<PlacedItem>)=>void; removeItem:(id:string)=>void;
  setFinish:(roomId:string,surface:Surface,f:Finish|null)=>void;
  clearFinishes:(roomId?:string)=>void;
  setWalkInput:(f:number,s:number)=>void; resetView:()=>void; toggleEyeLevel:()=>void;
  setDrawer:(d:'rail'|'tools'|'review'|null)=>void;
}
const seedLights = (): Light[] => {
  const out: Light[] = [];
  for (const id of ['g_liv','g_fam','g_kit','g_mea','g_ent','g_hal','f_pri','f_bd2','f_lnd','f_bth'])
    { const r = ROOMS.find(x=>x.id===id); if (r) out.push(...autoDesign(r)); }
  return out;
};
const ctxOf = (s: Partial<S>): ThermalCtx => ({
  month: s.month!, minutes: s.minutes!, openIds: s.openIds!,
  lightingW: (() => {
    const w: Record<string, number> = {};
    for (const l of s.lights ?? []) if (l.on) w[l.room] = (w[l.room] ?? 0) + 10 * l.bulbs * l.dim;
    // A placed heater is a sensible gain in the room it sits in (kW -> W), but a
    // real heater has a thermostat: once the room is at the heating setpoint it
    // cuts out. Without this the room runs away to 50 C, which is a model
    // artefact, not a design outcome.
    for (const it of s.items ?? []) {
      if (it.kind !== 'heater' || !it.on) continue;
      const T = (s.thermal ?? {})[it.room];
      const set = s.setpointHeat ?? 20;
      if (T !== undefined && T > set + 0.5) continue;      // thermostat satisfied
      w[it.room] = (w[it.room] ?? 0) + it.power * 1000;
    }
    return w;
  })(),
  hvacOn: s.hvacOn!, setpointCool: s.setpointCool!, setpointHeat: s.setpointHeat!,
  windSpeed: WIND[s.month!][1], occupancyScale: 1,
});
export const useStore = create<S>((set, get) => ({
  view: 'walk', floor: 0, month: 0, minutes: 900, playing: false, speed: 9,
  overlays: { dims:false, thermal:false, light:false, audio:false, air:false, hvac:false, wifi:false, elec:false, plan:false },
  openIds: new Set(ALL_OPENINGS.filter(o => o.defaultOpen || o.kind === 'cased').map(o => o.id)),
  lights: seedLights(), ambience: -1,
  speakers: [], acFreq: 80, acRoom: null,
  aps: DEFAULT_APS, rfBand: '5',
  hvacOn: false, setpointCool: 24, setpointHeat: 20,
  thermal: {}, thermalDetail: {}, outdoorT: 25,
  selectedRoom: null, hoverRoom: null, showRoof: true, fov: 72,
  items: [], placing: null, finishes: {},
  walkInput: { f: 0, s: 0 }, resetNonce: 0, eyeLevel: false, drawer: null,

  setView: v => set({ view: v, showRoof: v === 'plan' ? false : get().showRoof,
    eyeLevel: v === 'plan' ? false : get().eyeLevel }),
  setFloor: f => set({ floor: f }),
  setMonth: m => { set({ month: m }); get().resettleThermal(); },
  setMinutes: m => set({ minutes: m }),
  togglePlay: () => set(s => ({ playing: !s.playing })),
  toggleOverlay: k => set(s => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  toggleOpening: id => { const n = new Set(get().openIds); n.has(id) ? n.delete(id) : n.add(id);
    set({ openIds: n }); get().resettleThermal(); },
  setAllOpenings: open => { set({ openIds: open
    ? new Set(ALL_OPENINGS.map(o => o.id))
    : new Set(ALL_OPENINGS.filter(o => o.kind === 'cased').map(o => o.id)) });
    get().resettleThermal(); },
  autoLightRoom: roomId => { const r = ROOMS.find(x => x.id === roomId); if (!r) return;
    set(s => ({ lights: [...s.lights.filter(l => l.room !== roomId), ...autoDesign(r)] })); },
  updateLight: (id, p) => set(s => ({ lights: s.lights.map(l => l.id === id ? { ...l, ...p } : l) })),
  removeLight: id => set(s => ({ lights: s.lights.filter(l => l.id !== id) })),
  addLight: l => set(s => ({ lights: [...s.lights, l] })),
  applyAmbience: i => { const a = AMBIENCE[i];
    set(s => ({ ambience: i, lights: s.lights.map(l => ({
      ...l, on: true, dim: a.dim * a.dim, rgb: null,
      kelvin: Math.round(a.kelvin * 0.5 + warmDim(a.dim) * 0.5) })) })); },
  toggleRoomLights: roomId => set(s => { const any = s.lights.some(l => l.room === roomId && l.on);
    return { lights: s.lights.map(l => l.room === roomId ? { ...l, on: !any } : l) }; }),
  setSpeakers: sp => set({ speakers: sp }),
  setAcFreq: f => set({ acFreq: f }),
  setAcRoom: r => set({ acRoom: r }),
  setHvac: on => { set({ hvacOn: on }); get().resettleThermal(); },
  tickThermal: dt => { const s = get();
    const { state, detail, Tout } = stepThermal(s.thermal, ctxOf(s), dt);
    set({ thermal: state, thermalDetail: detail, outdoorT: Tout }); },
  resettleThermal: () => { const s = get();
    const st = settle(ctxOf(s), 36, 15);
    const { state, detail, Tout } = stepThermal(st, ctxOf(s), 600);
    set({ thermal: state, thermalDetail: detail, outdoorT: Tout }); },
  setSelected: id => set({ selectedRoom: id }),
  setHover: id => set({ hoverRoom: id }),
  setShowRoof: b => set({ showRoof: b }),
  setFov: n => set({ fov: n }),

  setWalkInput: (f, s2) => set({ walkInput: { f, s: s2 } }),
  resetView: () => set(st => ({ resetNonce: st.resetNonce + 1, eyeLevel: false })),
  toggleEyeLevel: () => set(st => ({ eyeLevel: !st.eyeLevel })),
  setDrawer: d => set(st => ({ drawer: st.drawer === d ? null : d })),

  setPlacing: p => set({ placing: p }),
  /** Drop whatever is armed at a point on the floor. Routed to the right collection. */
  placeAt: (floor, x, z, room) => {
    const p = get().placing;
    if (!p) return;
    const spec = assetById(p.type);
    if (!spec) return;
    // resolve the mount before anything else: a wall speaker snaps to the wall,
    // a downlight goes into the ceiling above the tap, a sub stays on the floor
    const m = resolveMount(spec, floor, x, z);
    const id = `${spec.id}_${Math.round(m.x * 100)}_${Math.round(m.z * 100)}_${Date.now() % 100000}`;
    const where = m.room ?? room;
    if (spec.category === 'lighting') {
      get().addLight({ id, type: spec.id as any, floor, room: where, x: m.x, z: m.z, y: m.y,
        on: true, kelvin: spec.light?.cctOptions[0] ?? 3000, rgb: null, dim: 1,
        bulbs: spec.id === 'pendant' ? 3 : 1, asset: spec.id });
    } else if (spec.category === 'audio') {
      set(s2 => ({ speakers: [...s2.speakers, {
        id, type: spec.id, floor, room: where, x: m.x, z: m.z, y: m.y,
        db: spec.audio?.maxSplDb ?? 90, asset: spec.id, boundaries: m.boundaries }] }));
    } else if (spec.category === 'network') {
      set(s2 => ({ aps: [...s2.aps, {
        id, name: spec.label, floor, x: m.x, z: m.z, band: get().rfBand, asset: spec.id }] }));
    } else {
      set(s2 => ({ items: [...s2.items, {
        id, kind: p.kind, type: spec.id, asset: spec.id, floor, room: where,
        x: m.x, z: m.z, y: m.y - (floor === 0 ? 0 : 3.05), rot: m.rot,
        boundaries: m.boundaries, wallId: m.wallId,
        power: spec.thermal?.outputKw ?? 0, on: true }] }));
    }
    set({ placing: null });
    if (spec.thermal) get().resettleThermal();
  },
  updateItem: (id, p) => { set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...p } : i) }));
    get().resettleThermal(); },
  removeItem: id => { set(s => ({
    items: s.items.filter(i => i.id !== id),
    speakers: s.speakers.filter(x => x.id !== id),
    aps: s.aps.filter(x => x.id !== id),
    lights: s.lights.filter(x => x.id !== id),
  })); get().resettleThermal(); },
  setFinish: (roomId, surface, f) => set(s => {
    const cur = { ...(s.finishes[roomId] ?? {}) };
    if (f) cur[surface] = f; else delete cur[surface];
    return { finishes: { ...s.finishes, [roomId]: cur } };
  }),
  clearFinishes: roomId => set(s => {
    if (!roomId) return { finishes: {} };
    const n = { ...s.finishes }; delete n[roomId]; return { finishes: n };
  }),
}));
