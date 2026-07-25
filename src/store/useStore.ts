'use client';
import { create } from 'zustand';
import { ROOMS, ALL_OPENINGS, type Room } from '@/lib/model/building';
import { autoDesign, type Light, AMBIENCE, warmDim } from '@/lib/solvers/lighting';
import { settle, stepThermal, type ThermalState, type ThermalCtx, type RoomThermalBreakdown } from '@/lib/solvers/thermal';
import { WIND } from '@/lib/solvers/airflow';
import { DEFAULT_APS, type AP } from '@/lib/solvers/rf';

export type OverlayKey = 'dims'|'thermal'|'light'|'audio'|'air'|'hvac'|'wifi'|'elec'|'plan';
export type ViewMode = 'walk' | 'plan' | 'street';

export interface Speaker { id:string; type:string; floor:0|1; room:string; x:number; z:number; y:number; db:number }

/** Anything the user drops into the model by hand. */
export type ItemKind = 'furniture' | 'heater' | 'vent' | 'speaker' | 'ap' | 'light';
export interface PlacedItem {
  id: string; kind: ItemKind; type: string;
  floor: 0|1; room: string;
  x: number; z: number; y: number; rot: number;
  /** kW for a heater, W for a fan, dB for a speaker … */
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
    // a placed heater is a sensible gain in the room it sits in (kW -> W)
    for (const it of s.items ?? [])
      if (it.kind === 'heater' && it.on) w[it.room] = (w[it.room] ?? 0) + it.power * 1000;
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

  setView: v => set({ view: v, showRoof: v === 'plan' ? false : get().showRoof }),
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

  setPlacing: p => set({ placing: p }),
  /** Drop whatever is armed at a point on the floor. Routed to the right collection. */
  placeAt: (floor, x, z, room) => {
    const p = get().placing;
    if (!p) return;
    const id = `${p.kind}_${Math.round(x * 100)}_${Math.round(z * 100)}_${get().items.length}`;
    if (p.kind === 'light') {
      const H = floor === 0 ? 2.72 : 2.59;
      get().addLight({ id, type: p.type as any, floor, room, x, z, y: H - 0.02,
        on: true, kelvin: 3000, rgb: null, dim: 1,
        bulbs: p.type === 'pendant' ? 3 : p.type === 'floor' ? 2 : 1 });
    } else if (p.kind === 'speaker') {
      set(s => ({ speakers: [...s.speakers, {
        id, type: p.type, floor, room, x, z,
        y: p.type === 'subwoofer' ? 0.25 : 1.2,
        db: p.type === 'subwoofer' ? 95 : 88 }] }));
    } else if (p.kind === 'ap') {
      set(s => ({ aps: [...s.aps, {
        id, name: `AP ${s.aps.length + 1} — ${p.type}`, floor, x, z, band: get().rfBand }] }));
    } else {
      const power = p.kind === 'heater' ? 2.4 : p.kind === 'vent' ? 0 : 0;
      set(s => ({ items: [...s.items, {
        id, kind: p.kind, type: p.type, floor, room, x, z,
        y: p.kind === 'vent' ? (floor === 0 ? 2.6 : 2.45) : 0, rot: 0, power, on: true }] }));
    }
    // one click, one item — re-arm deliberately rather than dropping a trail
    set({ placing: null });
    if (p.kind === 'heater' || p.kind === 'vent') get().resettleThermal();
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
