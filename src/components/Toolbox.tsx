'use client';
import { useRef, useState } from 'react';
import { useStore, type ItemKind, type Surface } from '@/store/useStore';
import { ROOMS, roomById } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import PaintTab from './PaintTab';
import ReviewSection from './ReviewPanel';

import { ASSETS, assetsIn } from '@/lib/model/assets';
import { ASSET_ICON } from './ui/icons';

const GROUPS: { group: string; category: Parameters<typeof assetsIn>[0] }[] = [
  { group: 'Audio', category: 'audio' },
  { group: 'Lighting', category: 'lighting' },
  { group: 'Climate', category: 'climate' },
  { group: 'Network', category: 'network' },
];
const KIND: Record<string, ItemKind> = {
  audio: 'speaker', lighting: 'light', network: 'ap', climate: 'heater', furniture: 'furniture',
};

/**
 * Finishes are filtered by what each material declares it may be applied to,
 * so brickwork is never offered as a ceiling lining and carpet is never offered
 * as a wall. If a plan's own schedule is loaded it narrows this further.
 */
function finishChoices(surface: Surface): string[] {
  return Object.values(MATERIALS)
    .filter(m => m.appliesTo?.includes(surface))
    .map(m => m.id);
}

export default function Toolbox() {
  const s = useStore();
  const open = s.drawer === 'tools';
  const [tab, setTab] = useState<'place' | 'finish' | 'paint' | 'check'>('place');
  const [surface, setSurface] = useState<Surface>('floor');
  const file = useRef<HTMLInputElement>(null);

  const target = s.selectedRoom ?? s.hoverRoom;
  const room = target ? roomById(target) : null;
  const placed = [...s.items, ...s.speakers, ...s.aps.filter(a => a.asset), ...s.lights.filter(l => l.asset)];

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
        {/* one drawer holds everything, so nothing can stack on anything else */}
        <div className="tbTabs wrap">
          <button className={tab === 'place' ? 'on' : ''} onClick={() => setTab('place')}>Add</button>
          <button className={tab === 'finish' ? 'on' : ''} onClick={() => setTab('finish')}>Finish</button>
          <button className={tab === 'paint' ? 'on' : ''} onClick={() => setTab('paint')}>Paint</button>
          <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>Check</button>
        </div>

        {tab === 'place' && (
          <div className="tbBody">
            {s.placeError && (
              <div className="mini warn" onClick={() => s.clearPlaceError()}>{s.placeError}</div>
            )}
            {s.placing
              ? <div className="mini armed"><b>{s.placing.type}</b> — tap the floor
                  <button className="lnk" onClick={() => s.setPlacing(null)}>cancel</button></div>
              : <div className="mini hint">Tap an item, then tap the floor</div>}
            {GROUPS.map(g => (
              <div key={g.group}>
                <div className="sec">{g.group}</div>
                <div className="tbGrid">
                  {assetsIn(g.category).map(a => (
                    <button key={a.id}
                      className={`tbItem ${s.placing?.type === a.id ? 'on' : ''}`}
                      data-tip={`${a.label} · ${a.mount.replace('-', ' ')}`}
                      onClick={() => {
                        const arm = s.placing?.type === a.id ? null : { kind: KIND[a.category], type: a.id };
                        s.setPlacing(arm);
                        if (arm) s.setDrawer(null);   // get out of the way of the tap
                      }}>
                      <i>{ASSET_ICON[a.id] ?? a.icon}</i>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {room && (
              <>
                <div className="sec">{room.name} lighting</div>
                <button className="btn" onClick={() => s.autoLightRoom(room.id)}>
                  Auto-design to AS/NZS 1680</button>
                <button className="btn" onClick={() => s.toggleRoomLights(room.id)}>
                  Toggle room lights</button>
              </>
            )}
            {/* Everything the user placed, not just the thermal items — a speaker or
                an AP that only exists in the 3D view can be neither seen nor removed
                without a right-click, which does not exist on a phone. */}
            {placed.length > 0 && (
              <>
                <div className="sec">Placed · {placed.length}</div>
                {placed.map(i => {
                  const label = ASSETS.find(a => a.id === (i as any).asset)?.label
                    ?? (i as any).type ?? (i as any).name;
                  const toggleable = 'on' in i;
                  return (
                    <button key={i.id} className={`rowbtn ${(i as any).on ? 'open' : ''}`}
                      onClick={() => toggleable
                        ? s.updateItem(i.id, { on: !(i as any).on })
                        : s.removeItem(i.id)}>
                      <span>{label}</span>
                      <b>{toggleable ? ((i as any).on ? 'on' : 'off') : 'remove'}</b>
                    </button>
                  );
                })}
                <button className="btn" onClick={() => s.clearPlaced()}>Clear all</button>
              </>
            )}
          </div>
        )}

        {tab === 'paint' && <PaintTab />}

        {tab === 'check' && <div className="tbBody"><ReviewSection /></div>}

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
                  {finishChoices(surface).map(m => {
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
                  onChange={e => { upload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
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
