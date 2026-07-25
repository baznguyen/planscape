'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { roomById, WALLS } from '@/lib/model/building';
import {
  systemsForRegion, searchColours, customColour, normaliseHex, lrvFromHex, type Colour,
} from '@/lib/model/colours';
import { SCOPE_ORDER, scopeArea, paintQuantity, roomsOnWall, type PaintScope } from '@/lib/model/paint';

const SCOPE_LABEL: Record<PaintScope, string> = {
  wall: 'Wall', room: 'Room', floorLevel: 'Level', facade: 'Facade', house: 'House',
};

/**
 * A deck of 2,000 swatches is only usable if you can cut it down, so the grid
 * is paged rather than dumped. 180 at a time is about four screens of thumb —
 * enough to browse, few enough that scrolling stays smooth on a phone.
 */
const PAGE = 180;

/**
 * Paint and wallpaper.
 *
 * Scope first, then colour — because that is the decision order. Deciding you
 * are repainting the whole facade and then choosing the colour is one action;
 * picking a colour and then applying it forty times is not.
 */
export default function PaintTab() {
  const s = useStore();
  const [scope, setScope] = useState<PaintScope>('room');
  const [systemId, setSystemId] = useState('dulux');
  const file = useRef<HTMLInputElement>(null);
  const [repeat, setRepeat] = useState(0.7);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [custom, setCustom] = useState({ hex: '#d8cfc0', name: '', code: '' });

  // AU project, so the local systems sort first
  const systems = systemsForRegion('AU');
  const system = systems.find(x => x.id === systemId) ?? systems[0];

  const matches = useMemo(() => searchColours(system.colours, q), [system, q]);
  const page = matches.slice(0, shown);

  const room = s.selectedRoom ? roomById(s.selectedRoom) : null;
  // a wall scope needs a wall; use one bounding the selected room
  const wallsHere = room ? WALLS.filter(w => w.floor === room.floor && roomsOnWall(w).includes(room.id)) : [];
  const [wallIdx, setWallIdx] = useState(0);
  // A new room has a different number of walls, so a stale index printed
  // "Wall 6 of 2" while the buttons operated on wall 2.
  useEffect(() => { setWallIdx(0); }, [room?.id]);
  const idx = Math.min(wallIdx, Math.max(0, wallsHere.length - 1));
  const wall = wallsHere[idx];

  const targetId =
    scope === 'wall' ? (wall?.id ?? '') :
    scope === 'room' ? (room?.id ?? '') :
    scope === 'floorLevel' ? String(s.floor) : '';

  const needsTarget = scope === 'room' || scope === 'wall';
  const ready = !needsTarget || !!targetId;
  const area = ready ? scopeArea(scope, targetId) : 0;
  const qty = paintQuantity(area);

  const apply = (c: Colour, systemName = system.id) => {
    if (!ready) return;
    s.addPaint({
      scope, targetId, side: scope === 'facade' ? 'external' : 'internal',
      colour: { ...c, system: systemName },
    });
  };
  const customHex = normaliseHex(custom.hex);
  const applyCustom = () => {
    const c = customColour(custom.hex, custom.name, custom.code);
    if (c) apply(c, 'custom');
  };
  const upload = (f: File | null) => {
    if (!f || !ready) return;
    const rd = new FileReader();
    rd.onload = () => s.addPaint({
      scope, targetId, side: scope === 'facade' ? 'external' : 'internal',
      wallpaper: { name: f.name.replace(/\.[^.]+$/, ''), image: String(rd.result), repeatM: repeat },
    });
    rd.readAsDataURL(f);
  };

  return (
    <div className="tbBody">
      <div className="sec">Apply to</div>
      <div className="tbTabs sm wrap">
        {SCOPE_ORDER.map(sc => (
          <button key={sc} className={scope === sc ? 'on' : ''} onClick={() => setScope(sc)}>
            {SCOPE_LABEL[sc]}</button>
        ))}
      </div>

      {scope === 'room' && !room && <div className="mini hint">Tap a room first</div>}
      {scope === 'wall' && !room && <div className="mini hint">Tap a room, then pick its wall</div>}
      {scope === 'wall' && wallsHere.length > 0 && (
        <>
          <div className="sec">Wall {idx + 1} of {wallsHere.length}</div>
          <div className="tbTabs sm">
            <button onClick={() => setWallIdx(i => Math.max(0, i - 1))}>‹</button>
            <button className="on">{wall?.id}</button>
            <button onClick={() => setWallIdx(i => Math.min(wallsHere.length - 1, i + 1))}>›</button>
          </div>
        </>
      )}

      {ready && (
        <div className="mini">{area.toFixed(1)} m² · {qty.litres} L · {qty.tins4L} × 4 L at 2 coats</div>
      )}

      <div className="sec">Colour system</div>
      <div className="tbTabs sm wrap">
        {systems.map(sy => (
          <button key={sy.id} className={systemId === sy.id ? 'on' : ''}
            onClick={() => { setSystemId(sy.id); setShown(PAGE); }}>
            {sy.name}{sy.region === 'AU' || sy.region === 'NZ' ? ' •' : ''}</button>
        ))}
      </div>
      <div className="mini hint">{system.note}</div>

      <div className="sec">Custom colour</div>
      <div className="cust">
        <span className="cchip" style={{ background: customHex ?? '#3a3a3a' }}>
          {customHex && <em style={{ color: lrvFromHex(customHex) > 45 ? '#22262b' : '#f4f4f2' }}>
            {lrvFromHex(customHex)}</em>}
        </span>
        <input type="color" value={customHex ?? '#d8cfc0'}
          onChange={e => setCustom(v => ({ ...v, hex: e.target.value }))} />
        <input className="txt" placeholder="#d8cfc0 or rgb(216,207,192)" value={custom.hex}
          onChange={e => setCustom(v => ({ ...v, hex: e.target.value }))} />
      </div>
      <div className="cust">
        <input className="txt" placeholder="Code" value={custom.code}
          onChange={e => setCustom(v => ({ ...v, code: e.target.value }))} />
        <input className="txt" placeholder="Name" value={custom.name}
          onChange={e => setCustom(v => ({ ...v, name: e.target.value }))} />
      </div>
      <button className="btn" onClick={applyCustom} disabled={!ready || !customHex}>
        {customHex ? `Apply custom · LRV ${lrvFromHex(customHex)}` : 'Enter a hex or rgb() value'}</button>

      <div className="sec">
        {system.name} · {matches.length}{q ? ` of ${system.colours.length}` : ''} · LRV drives the lighting model
      </div>
      <input className="txt find" placeholder="Search code, name, or lrv&gt;60" value={q}
        onChange={e => { setQ(e.target.value); setShown(PAGE); }} />
      <div className="tbGrid wide">
        {page.map(c => (
          <button key={c.code} className={`swatch tall ${c.approx ? 'aprx' : ''}`} style={{ background: c.hex }}
            data-tip={`${c.name} · ${c.code} · LRV ${c.lrv}${c.approx ? ' (indicative)' : ''}`}
            onClick={() => apply(c)} disabled={!ready}>
            <em style={{ color: c.lrv > 45 ? '#22262b' : '#f4f4f2' }}>{c.lrv}</em>
          </button>
        ))}
      </div>
      {matches.length > shown && (
        <button className="btn" onClick={() => setShown(n => n + PAGE)}>
          Show {Math.min(PAGE, matches.length - shown)} more</button>
      )}
      {!matches.length && <div className="mini hint">Nothing matches “{q}”.</div>}
      {system.partial && (
        <div className="mini hint">Curated subset — this brand’s full deck is proprietary. Any other
          code goes in above under Custom, where the LRV is computed from the hex.</div>
      )}
      {system.id === 'ncs' && (
        <div className="mini hint">Notation-valid across the standard space. Swatch and LRV are
          indicative; a supplier will interpolate unless the code is a licensed standard sample.</div>
      )}

      <div className="sec">Wallpaper</div>
      <input ref={file} type="file" accept="image/*" hidden
        onChange={e => { upload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      <label className="mini rangeRow">Repeat {repeat.toFixed(2)} m
        <input type="range" min={0.2} max={2} step={0.05} value={repeat}
          onChange={e => setRepeat(+e.target.value)} />
      </label>
      <button className="btn" onClick={() => file.current?.click()} disabled={!ready}>
        Upload a wallpaper…</button>

      {s.paints.length > 0 && (
        <>
          <div className="sec">Applied · {s.paints.length}</div>
          {s.paints.map(p => (
            <button key={p.id} className="rowbtn" onClick={() => s.removePaint(p.id)}>
              <span>
                <i className="dot" style={{ background: p.colour?.hex ?? '#8b95a3' }} />
                {SCOPE_LABEL[p.scope]}{p.targetId ? ` ${p.targetId}` : ''}
              </span>
              <b>{p.colour?.name ?? p.wallpaper?.name ?? '—'}</b>
            </button>
          ))}
          <button className="btn" onClick={() => s.clearPaints()}>Strip all paint</button>
        </>
      )}
    </div>
  );
}
