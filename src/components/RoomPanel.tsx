'use client';
import { useStore } from '@/store/useStore';
import { ALL_OPENINGS, roomArea, roomById } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import { analyseRoom } from '@/lib/solvers/acoustics';
import { roomIlluminance } from '@/lib/solvers/lighting';
import { roomLoad } from '@/lib/solvers/hvac';
import { analyseAirflow, ventCompliance } from '@/lib/solvers/airflow';
import { rssiAt, rssiLabel } from '@/lib/solvers/rf';
import { roomWallReflectance } from '@/lib/model/paint';

export default function RoomPanel({ id }: { id: string }) {
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
