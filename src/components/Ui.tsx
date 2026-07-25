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
import { AMB_ICONS, OVERLAY_ICON } from './ui/icons';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const OVERLAYS: [OverlayKey, string][] = [
  ['thermal','Thermal — live heat map'], ['dims','Dimensions & areas'],
  ['light','Lighting — lux & beams'], ['audio','Acoustics — SPL waves'],
  ['air','Natural airflow'], ['hvac','Air conditioning'],
  ['wifi','WiFi coverage'],
  ['plan','Drawing overlay — dashed wall lines'],
];
/** Compact ambience presets: an icon carries the mood, the tooltip carries the numbers. */

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
  // The clock reads and writes `minutes` itself, so listing it as a dependency
  // tore the loop down and rebuilt it on every single frame. Read the current
  // value from the store instead and let the effect live as long as playback does.
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      const simSeconds = dt * 60 * useStore.getState().speed;
      useStore.setState(st => ({ minutes: (st.minutes + simSeconds / 60) % 1440 }));
      useStore.getState().tickThermal(simSeconds);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

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
            aria-label={VIEW_TIP[v]} aria-pressed={s.view === v}
            onClick={() => s.setView(v)}>{VIEW_ICON[v]}</button>)}</div>
        <div className="seg ico">{([0,1] as const).map(f =>
          <button key={f} className={s.floor === f ? 'on' : ''} data-tip={f ? 'First floor' : 'Ground floor'}
            aria-label={f ? 'First floor' : 'Ground floor'} aria-pressed={s.floor === f}
            onClick={() => s.setFloor(f)}>{f ? I.first : I.ground}</button>)}</div>
        <div className="seg ico">
          <button className={s.showRoof ? 'on' : ''} data-tip="Roof & ceilings"
            aria-label="Roof and ceilings" aria-pressed={s.showRoof}
            onClick={() => s.setShowRoof(!s.showRoof)}>{I.roof}</button>
          <button data-tip="Reset the view" aria-label="Reset the view"
            onClick={s.resetView}>{I.reset}</button>
        </div>
        {/* Ambience is a control, not a read-out, so it wears the same segmented
            grouping as the view and floor toggles rather than its own chrome. */}
        <div className="seg ico">{AMBIENCE.map((a, i) =>
          <button key={a.name} className={s.ambience === i ? 'on' : ''}
            data-tip={`${a.name} · ${a.lux} lx · ${a.kelvin}K`}
            aria-label={`${a.name} lighting preset`} aria-pressed={s.ambience === i}
            onClick={() => s.applyAmbience(i)}>{AMB_ICONS[i] ?? I.roof}</button>)}</div>
      </header>

      <button className="railToggle" onClick={() => s.setDrawer('rail')} aria-label="Overlays">
        {railOpen ? '✕' : '☰'}</button>
      <aside className={`rail ${railOpen ? 'open' : ''}`}>
        <div className="cap">Layers</div>
        {OVERLAYS.map(([k, tip]) =>
          <button key={k} className={`ib ${s.overlays[k] ? 'on' : ''}`} data-tip={tip}
            aria-label={tip} aria-pressed={s.overlays[k]}
            onClick={() => s.toggleOverlay(k)}>{OVERLAY_ICON[k]}</button>)}
        <div className="cap" style={{ marginTop: 10 }}>Doors</div>
        <button className="ib" data-tip={`Open everything (${openCount} open)`}
          aria-label="Open every door and window"
          onClick={() => s.setAllOpenings(true)}>{OVERLAY_ICON.openAll}</button>
        <button className="ib" data-tip="Close everything" aria-label="Close every door and window"
          onClick={() => s.setAllOpenings(false)}>{OVERLAY_ICON.closeAll}</button>
        <button className={`ib ${s.hvacOn ? 'on' : ''}`} data-tip="Air conditioning on/off"
          aria-label="Air conditioning" aria-pressed={s.hvacOn}
          onClick={() => s.setHvac(!s.hvacOn)}>{OVERLAY_ICON.hvac}</button>
      </aside>

      <div className="statStrip">
        <span><i>Outdoor</i><b>{s.outdoorT.toFixed(1)} °C</b></span>
        <span><i>Season</i><b>{seasonOf(s.month)} · {WIND[s.month][0]}°</b></span>
        <span><i>Sun</i><b>{((sun.alt * 180) / Math.PI).toFixed(0)}°</b></span>
        <span><i>Open</i><b>{openCount}/{ALL_OPENINGS.filter(o=>o.kind!=='cased').length}</b></span>
        <span><i>Floor</i><b>{s.floor ? 'First' : 'Ground'}</b></span>
      </div>

      <Toolbox />
      <WalkPad />

      <footer className="bar sun">
        <button className="play" aria-label={s.playing ? 'Pause the time lapse' : 'Play the time lapse'}
          onClick={s.togglePlay}>{s.playing ? '❚❚' : '▶'}</button>
        <select value={s.month} aria-label="Month" onChange={e => s.setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
        <span className="clock">{fmt(s.minutes)}</span>
        <input type="range" min={0} max={1439} step={5} value={Math.round(s.minutes)} aria-label="Time of day"
          onChange={e => { s.setMinutes(+e.target.value); s.tickThermal(600); }} />
        <span className="rd">{sun.isDay ? `☀ ${sun.ghi.toFixed(0)} W/m²` : '☾ night'} · {s.outdoorT.toFixed(1)}°C</span>
      </footer>
    </>
  );
}
