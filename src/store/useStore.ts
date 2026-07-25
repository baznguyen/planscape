'use client';
import { create } from 'zustand';
import { ROOMS, ALL_OPENINGS, type Room } from '@/lib/model/building';
import { autoDesign, type Light, AMBIENCE, warmDim } from '@/lib/solvers/lighting';
import { settle, stepThermal, type ThermalState, type ThermalCtx, type RoomThermalBreakdown } from '@/lib/solvers/thermal';
import { WIND } from '@/lib/solvers/airflow';
import { DEFAULT_APS, type AP } from '@/lib/solvers/rf';

export type OverlayKey = 'dims'|'thermal'|'light'|'audio'|'air'|'hvac'|'wifi'|'elec';
export type ViewMode = 'walk' | 'plan' | 'street';

export interface Speaker { id:string; type:string; floor:0|1; room:string; x:number; z:number; y:number; db:number }

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
}
const seedLights = (): Light[] => {
  const out: Light[] = [];
  for (const id of ['g_liv','g_fam','g_kit','g_mea','g_ent','g_hal','f_pri','f_bd2','f_lnd','f_bth'])
    { const r = ROOMS.find(x=>x.id===id); if (r) out.push(...autoDesign(r)); }
  return out;
};
const ctxOf = (s: Partial<S>): ThermalCtx => ({
  month: s.month!, minutes: s.minutes!, openIds: s.openIds!,
  lightingW: (s.lights ?? []).reduce((a, l) => {
    if (l.on) a[l.room] = (a[l.room] ?? 0) + 10 * l.bulbs * l.dim; return a;
  }, {} as Record<string, number>),
  hvacOn: s.hvacOn!, setpointCool: s.setpointCool!, setpointHeat: s.setpointHeat!,
  windSpeed: WIND[s.month!][1], occupancyScale: 1,
});
export const useStore = create<S>((set, get) => ({
  view: 'walk', floor: 0, month: 0, minutes: 900, playing: false, speed: 9,
  overlays: { dims:false, thermal:false, light:false, audio:false, air:false, hvac:false, wifi:false, elec:false },
  openIds: new Set(ALL_OPENINGS.filter(o => o.defaultOpen || o.kind === 'cased').map(o => o.id)),
  lights: seedLights(), ambience: -1,
  speakers: [], acFreq: 80, acRoom: null,
  aps: DEFAULT_APS, rfBand: '5',
  hvacOn: false, setpointCool: 24, setpointHeat: 20,
  thermal: {}, thermalDetail: {}, outdoorT: 25,
  selectedRoom: null, hoverRoom: null, showRoof: true, fov: 72,

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
}));
