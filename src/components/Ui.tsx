'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStore, type OverlayKey } from '@/store/useStore';
import { ROOMS, ALL_OPENINGS, roomArea, roomById } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import { analyseRoom } from '@/lib/solvers/acoustics';
import { roomIlluminance, AMBIENCE, LUX_TARGET } from '@/lib/solvers/lighting';
import { systemSummary, roomLoad } from '@/lib/solvers/hvac';
import { analyseAirflow, WIND, seasonOf, ventCompliance } from '@/lib/solvers/airflow';
import { rssiAt, rssiLabel } from '@/lib/solvers/rf';
import { outdoorTemp, solarState } from '@/lib/solvers/sun';
import { roomWallReflectance } from '@/lib/model/paint';
import Toolbox from './Toolbox';
import ReviewSection from './ReviewPanel';
import WalkPad from './WalkPad';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const OVERLAYS: [OverlayKey, string, string][] = [
  ['thermal','Thermal — live heat map','🌡'], ['dims','Dimensions & areas','📐'],
  ['light','Lighting — lux & beams','💡'], ['audio','Acoustics — SPL waves','🔊'],
  ['air','Natural airflow','💨'], ['hvac','Air conditioning','❄'],
  ['wifi','WiFi coverage','📶'], ['elec','Electrical','⚡'],
  ['plan','Drawing overlay — dashed wall lines','📄'],
];
/** Compact ambience presets: an icon carries the mood, the tooltip carries the numbers. */
const AMB_ICON = ['🌅','🌞','🌇','🍽','🎬','🌙'];

/* Inline SVG so the toggles read as drawings, not emoji. 16px, currentColor. */
const I = {
  walk: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="1.6" /><path d="M11 21l1.6-5.2L10 13l.8-4.4 3.2-1 2.6 2.6 2.4 1" />
    <path d="M10.8 8.6L7.6 10 6 13.4" /><path d="M12.6 15.8L16 21" /></svg>),
  plan: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 10h9M12 3v18M12 15h9" /></svg>),
  street: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-7 9 7" /><path d="M5.5 9.6V20h13V9.6" /><path d="M10 20v-5h4v5" /></svg>),
  ground: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinejoin="round">
    <rect x="3" y="13" width="18" height="7" rx="1" /><path d="M3 10h18" opacity=".35" /></svg>),
  first: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="7" rx="1" /><path d="M3 14h18" opacity=".35" /></svg>),
  roof: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12L12 4l10 8" /><path d="M6 12v8h12v-8" opacity=".4" /></svg>),
  reset: (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="6.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>),
};
const VIEW_ICON = { walk: I.walk, plan: I.plan, street: I.street } as const;
const VIEW_TIP = { walk: 'Walkthrough', plan: 'Plan view', street: 'Street view' } as const;

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(Math.floor(m % 60)).padStart(2,'0')}`;

export default function Ui() {
  const s = useStore();
  const [panelOpen, setPanelOpen] = useState(true);
  const railOpen = s.drawer === 'rail';
  useEffect(() => { s.resettleThermal(); /* eslint-disable-next-line */ }, []);
  // Start collapsed on phones so the model, not the read-out, owns the first screen.
  // Set after mount to keep server and client markup identical.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches) setPanelOpen(false);
  }, []);
  // Opening the overlay drawer on a phone should not leave it fighting the panel for space.
  useEffect(() => {
    if (railOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches) setPanelOpen(false);
  }, [railOpen]);
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      const simSeconds = dt * 60 * s.speed;
      const nm = (s.minutes + simSeconds / 60) % 1440;
      useStore.setState({ minutes: nm });
      useStore.getState().tickThermal(simSeconds);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, s.speed, s.minutes]);

  const sun = solarState(s.month, s.minutes);
  const openCount = ALL_OPENINGS.filter(o => s.openIds.has(o.id) && o.kind !== 'cased').length;
  const sel = s.selectedRoom ? roomById(s.selectedRoom) : null;

  return (
    <>
      <header className="bar top">
        <div className="brand"><b>SiteScape</b>
          <span title="101 Campbell St, Fairfield East · 28.14 × 11.0 m">101 Campbell St, Fairfield East</span></div>
        <div className="grow" />
        <div className="seg ico">{(['walk','plan','street'] as const).map(v =>
          <button key={v} className={s.view === v ? 'on' : ''} data-tip={VIEW_TIP[v]}
            onClick={() => s.setView(v)}>{VIEW_ICON[v]}</button>)}</div>
        <div className="seg ico">{([0,1] as const).map(f =>
          <button key={f} className={s.floor === f ? 'on' : ''} data-tip={f ? 'First floor' : 'Ground floor'}
            onClick={() => s.setFloor(f)}>{f ? I.first : I.ground}</button>)}</div>
        <button className={`ib ${s.showRoof ? 'on' : ''}`} data-tip="Roof & ceilings"
          onClick={() => s.setShowRoof(!s.showRoof)}>{I.roof}</button>
        <button className="ib" data-tip="Reset the view" onClick={s.resetView}>{I.reset}</button>
        {/* ambience lives on the same row as the roof toggle: it is a control, not a read-out */}
        <div className="ambInline">{AMBIENCE.map((a, i) =>
          <button key={a.name} className={`amb ${s.ambience === i ? 'on' : ''}`}
            data-tip={`${a.name} · ${a.lux} lx · ${a.kelvin}K`}
            onClick={() => s.applyAmbience(i)}>{AMB_ICON[i] ?? '💡'}</button>)}</div>
      </header>

      <button className="railToggle" onClick={() => s.setDrawer('rail')} aria-label="Overlays">
        {railOpen ? '✕' : '☰'}</button>
      <aside className={`rail ${railOpen ? 'open' : ''}`}>
        <div className="cap">Overlays</div>
        {OVERLAYS.map(([k, tip, icon]) =>
          <button key={k} className={`ib ${s.overlays[k] ? 'on' : ''}`} data-tip={tip}
            onClick={() => s.toggleOverlay(k)}>{icon}</button>)}
        <div className="cap" style={{ marginTop: 10 }}>Openings</div>
        <button className="ib" data-tip={`Open everything (${openCount} open)`} onClick={() => s.setAllOpenings(true)}>⇱</button>
        <button className="ib" data-tip="Close everything" onClick={() => s.setAllOpenings(false)}>⇲</button>
        <button className={`ib ${s.hvacOn ? 'on' : ''}`} data-tip="Air conditioning on/off" onClick={() => s.setHvac(!s.hvacOn)}>❄</button>
      </aside>

      <div className="statStrip">
        <span><i>Outdoor</i><b>{s.outdoorT.toFixed(1)} °C</b></span>
        <span><i>Season</i><b>{seasonOf(s.month)} · {WIND[s.month][0]}°</b></span>
        <span><i>Sun</i><b>{((sun.alt * 180) / Math.PI).toFixed(0)}°</b></span>
        <span><i>Open</i><b>{openCount}/{ALL_OPENINGS.filter(o=>o.kind!=='cased').length}</b></span>
        <span><i>Floor</i><b>{s.floor ? 'First' : 'Ground'}</b></span>
      </div>

      {/* the detail panel only appears when there is something to detail */}
      <section className={`panel ${panelOpen ? '' : 'collapsed'}`}>
        <button className="ph" onClick={() => setPanelOpen(o => !o)}>
          <span>{sel ? sel.name : 'Analysis'}</span>
          <i>{panelOpen ? '−' : '+'}</i>
        </button>
        <div className="pb">
          {sel ? <RoomPanel id={sel.id} />
            : <div className="mini">Tap a room in the scene for its full analysis.</div>}
          <ReviewSection />
        </div>
      </section>

      <Toolbox />
      <WalkPad />

      <footer className="bar sun">
        <button className="play" onClick={s.togglePlay}>{s.playing ? '❚❚' : '▶'}</button>
        <select value={s.month} onChange={e => s.setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
        <span className="clock">{fmt(s.minutes)}</span>
        <input type="range" min={0} max={1439} step={5} value={Math.round(s.minutes)}
          onChange={e => { s.setMinutes(+e.target.value); s.tickThermal(600); }} />
        <span className="rd">{sun.isDay ? `☀ ${sun.ghi.toFixed(0)} W/m²` : '☾ night'} · {s.outdoorT.toFixed(1)}°C</span>
      </footer>
    </>
  );
}
function RoomPanel({ id }: { id: string }) {
  const s = useStore();
  const r = roomById(id)!;
  // painted walls change the utilisation factor, so a dark room really does
  // read fewer lux here
  const rho = roomWallReflectance(s.paints, r.id, 0.5);
  const lux = roomIlluminance(r, s.lights, rho);
  const ac = analyseRoom(r, s.openIds);
  const load = roomLoad(r, s.month, s.minutes);
  const vent = ventCompliance(r, s.openIds);
  const air = analyseAirflow(s.month, s.minutes, s.openIds, s.thermal).find(a => a.room === id);
  const rf = rssiAt(s.aps, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.floor, s.rfBand, s.openIds);
  const lbl = rssiLabel(rf.rssi);
  const t = s.thermal[id], d = s.thermalDetail[id];
  const ops = ALL_OPENINGS.filter(o => (o.a === id || o.b === id) && o.kind !== 'cased');
  return (
    <>
      <div className="sec">{r.name} — {roomArea(r).toFixed(1)} m²</div>
      {t !== undefined && <div className="stat"><span>Temperature</span><b>{t.toFixed(1)} °C</b></div>}
      {d && <>
        <div className="stat"><span>Solar gain</span><b>{d.qSolar.toFixed(0)} W</b></div>
        <div className="stat"><span>Fabric</span><b>{d.qFabric.toFixed(0)} W</b></div>
        <div className="stat"><span>Ventilation</span><b>{d.qVent.toFixed(0)} W · {d.ach.toFixed(1)} ACH</b></div>
        <div className="stat"><span>Internal gains</span><b>{d.qInternal.toFixed(0)} W</b></div>
      </>}
      <div className="stat"><span>Illuminance</span><b className={lux.lux >= lux.target * 0.85 ? 'ok' : 'wn'}>
        {lux.lux.toFixed(0)} / {lux.target} lx</b></div>
      <div className="stat"><span>Wall reflectance</span><b>{(rho * 100).toFixed(0)}% LRV</b></div>
      <div className="stat"><span>RT60 @500 Hz</span><b className={ac.rt60Mid <= ac.target[1] ? 'ok' : 'wn'}>
        {ac.rt60Mid.toFixed(2)} s</b></div>
      <div className="stat"><span>Cooling load</span><b>{load.totalKw.toFixed(2)} kW · {load.outlets}×Ø{(load.outletDia*1000).toFixed(0)}</b></div>
      <div className="stat"><span>WiFi</span><b style={{ color: lbl[2] }}>{rf.rssi.toFixed(0)} dBm {lbl[1]}</b></div>
      <div className="stat"><span>Openable area (NCC 5%)</span><b className={vent.pass ? 'ok' : 'bd'}>
        {vent.possible.toFixed(2)} / {vent.required.toFixed(2)} m²</b></div>
      <div className="stat"><span>Ventilation</span><b>{air ? `${air.effectiveness}${air.cross ? ' · cross' : ''}` : '—'}</b></div>
      <div className="sec">Finishes</div>
      <div className="mini">Floor: <b>{MATERIALS[r.floorMat].label}</b> · U {MATERIALS[r.floorMat].U} · α₅₀₀ {MATERIALS[r.floorMat].alpha[500]} · ρ {MATERIALS[r.floorMat].rho}</div>
      <div className="sec">Openings — click to open / close</div>
      {ops.map(o => <button key={o.id} className={`rowbtn ${s.openIds.has(o.id) ? 'open' : ''}`}
        onClick={() => { s.toggleOpening(o.id); s.tickThermal(600); }}>
        <span>{o.kind} {o.w.toFixed(2)}×{o.h.toFixed(2)} m</span>
        <b>{s.openIds.has(o.id) ? 'OPEN' : 'closed'}</b></button>)}
      <div className="sec">Lighting</div>
      <button className="btn" onClick={() => s.autoLightRoom(id)}>Auto-design to AS/NZS 1680</button>
      <button className="btn" onClick={() => s.toggleRoomLights(id)}>Toggle room lights</button>
    </>
  );
}
