'use client';
import { useRef, useState } from 'react';
import { useStore, type ItemKind, type Surface } from '@/store/useStore';
import { ROOMS, roomById } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';

interface Tool { kind: ItemKind; type: string; icon: string; label: string }

const CATALOGUE: { group: string; tools: Tool[] }[] = [
  { group: 'Furniture', tools: [
    { kind:'furniture', type:'sofa',   icon:'🛋', label:'Sofa' },
    { kind:'furniture', type:'bed',    icon:'🛏', label:'Bed' },
    { kind:'furniture', type:'dining', icon:'🍽', label:'Dining table' },
    { kind:'furniture', type:'desk',   icon:'🗄', label:'Desk' },
    { kind:'furniture', type:'island', icon:'🧱', label:'Island bench' },
    { kind:'furniture', type:'robe',   icon:'🚪', label:'Robe' },
  ]},
  { group: 'Lighting', tools: [
    { kind:'light', type:'downlight', icon:'💡', label:'Downlight' },
    { kind:'light', type:'pendant',   icon:'🔆', label:'Pendant' },
    { kind:'light', type:'floor',     icon:'🕯', label:'Floor lamp' },
    { kind:'light', type:'table',     icon:'🪔', label:'Table lamp' },
  ]},
  { group: 'Climate', tools: [
    { kind:'heater', type:'panel heater', icon:'🔥', label:'Heater 2.4 kW' },
    { kind:'vent',   type:'ceiling vent', icon:'🌬', label:'A/C vent' },
  ]},
  { group: 'Audio', tools: [
    { kind:'speaker', type:'satellite', icon:'🔊', label:'Satellite' },
    { kind:'speaker', type:'subwoofer', icon:'📢', label:'Subwoofer' },
  ]},
  { group: 'Network', tools: [
    { kind:'ap', type:'ceiling AP', icon:'📶', label:'WiFi access point' },
  ]},
];

/** Catalogue finishes offered per surface, drawn from the material database. */
const FINISH_CHOICES: Record<Surface, string[]> = {
  floor: ['timberFloor', 'ceramicTile', 'carpet', 'slabOnGround'],
  wall: ['studWall', 'brickVeneerR20', 'renderClad'],
  ceiling: ['ceilingPlaster'],
};

export default function Toolbox() {
  const s = useStore();
  const open = s.drawer === 'tools';
  const [tab, setTab] = useState<'place' | 'finish'>('place');
  const [surface, setSurface] = useState<Surface>('floor');
  const file = useRef<HTMLInputElement>(null);

  const target = s.selectedRoom ?? s.hoverRoom;
  const room = target ? roomById(target) : null;
  const placed = s.items.length + s.speakers.length + s.aps.length;

  const upload = (f: File | null) => {
    if (!f || !room) return;
    const rd = new FileReader();
    rd.onload = () => s.setFinish(room.id, surface, {
      name: f.name.replace(/\.[^.]+$/, ''), image: String(rd.result),
    });
    rd.readAsDataURL(f);
  };

  return (
    <>
      <button className={`toolTab ${open ? 'on' : ''}`} onClick={() => s.setDrawer('tools')}
        data-tip="Add & finish">{open ? '✕' : '✚'}</button>

      <section className={`toolbox ${open ? 'open' : ''}`}>
        <div className="tbTabs">
          <button className={tab === 'place' ? 'on' : ''} onClick={() => setTab('place')}>Add</button>
          <button className={tab === 'finish' ? 'on' : ''} onClick={() => setTab('finish')}>Finishes</button>
        </div>

        {tab === 'place' && (
          <div className="tbBody">
            {s.placing
              ? <div className="mini armed"><b>{s.placing.type}</b> — tap the floor
                  <button className="lnk" onClick={() => s.setPlacing(null)}>cancel</button></div>
              : <div className="mini hint">Tap an item, then tap the floor</div>}
            {CATALOGUE.map(g => (
              <div key={g.group}>
                <div className="sec">{g.group}</div>
                <div className="tbGrid">
                  {g.tools.map(t => (
                    <button key={t.kind + t.type}
                      className={`tbItem ${s.placing?.type === t.type ? 'on' : ''}`}
                      data-tip={t.label}
                      onClick={() => s.setPlacing(
                        s.placing?.type === t.type ? null : { kind: t.kind, type: t.type })}>
                      <i>{t.icon}</i>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {s.items.length > 0 && (
              <>
                <div className="sec">Placed · {placed}</div>
                {s.items.map(i => (
                  <button key={i.id} className={`rowbtn ${i.on ? 'open' : ''}`}
                    onClick={() => s.updateItem(i.id, { on: !i.on })}>
                    <span>{i.type}</span>
                    <b>{i.on ? 'on' : 'off'}</b>
                  </button>
                ))}
                <button className="btn" onClick={() => s.items.forEach(i => s.removeItem(i.id))}>
                  Clear all</button>
              </>
            )}
          </div>
        )}

        {tab === 'finish' && (
          <div className="tbBody">
            {!room
              ? <div className="mini hint">Tap a room first</div>
              : <>
                <div className="sec">{room.name}</div>
                <div className="tbTabs sm">
                  {(['floor','wall','ceiling'] as Surface[]).map(sf => (
                    <button key={sf} className={surface === sf ? 'on' : ''}
                      onClick={() => setSurface(sf)}>{sf}</button>
                  ))}
                </div>
                <div className="sec">Schedule</div>
                <div className="tbGrid wide">
                  {FINISH_CHOICES[surface].map(m => {
                    const mat = MATERIALS[m];
                    if (!mat) return null;
                    const on = s.finishes[room.id]?.[surface]?.material === m;
                    return (
                      <button key={m} className={`swatch ${on ? 'on' : ''}`} data-tip={mat.label}
                        style={{ background: mat.colour }}
                        onClick={() => s.setFinish(room.id, surface,
                          { name: mat.label, material: m, colour: mat.colour })} />
                    );
                  })}
                </div>
                <div className="sec">Upload</div>
                <input ref={file} type="file" accept="image/*" hidden
                  onChange={e => upload(e.target.files?.[0] ?? null)} />
                <button className="btn" onClick={() => file.current?.click()}>Choose image…</button>
                {s.finishes[room.id]?.[surface] && (
                  <>
                    <div className="mini">{s.finishes[room.id]![surface]!.name}</div>
                    <button className="btn" onClick={() => s.setFinish(room.id, surface, null)}>Reset</button>
                  </>
                )}
              </>}
          </div>
        )}
      </section>
    </>
  );
}
