'use client';
import { useRef, useState } from 'react';
import { useStore, type ItemKind, type Surface } from '@/store/useStore';
import { ROOMS, roomById } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import PaintTab from './PaintTab';
import ReviewSection from './ReviewPanel';

import { ASSETS, assetsIn } from '@/lib/model/assets';
import { ASSET_ICON } from './ui/icons';
import Sheet from './ui/Sheet';

const GROUPS: { group: string; category: Parameters<typeof assetsIn>[0] }[] = [
  { group: 'Audio', category: 'audio' },
  { group: 'Lighting', category: 'lighting' },
  { group: 'Climate', category: 'climate' },
  { group: 'Network', category: 'network' },
];
/**
 * Short names for the tiles. The full label is right ("In-ceiling speaker 6.5\"")
 * but it will not fit under a 60 px tile, and a tile with no text at all is
 * unreadable on a phone — there are no tooltips on touch, so an icon-only grid
 * of fifteen items is fifteen guesses. Two words each, full label on the title.
 */
const SHORT: Record<string, string> = {
  spk_ceiling: 'In-ceiling', spk_wall: 'In-wall', spk_surround: 'Surround',
  spk_bookshelf: 'Bookshelf', sub: 'Subwoofer',
  dl_wide: 'Downlight 90°', dl_narrow: 'Downlight 36°', pendant: 'Pendant',
  lamp_floor: 'Floor lamp', lamp_table: 'Table lamp',
  heater_panel: 'Panel heater', heater_radiant: 'Radiant', vent_ceiling: 'A/C vent',
  ap_ceiling: 'AP ceiling', ap_wall: 'AP wall',
};
const TAB_TITLE: Record<'place' | 'finish' | 'paint' | 'check', string> = {
  place: 'Add to the model', finish: 'Finishes', paint: 'Paint & colour', check: 'Drawing review',
};
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
      {/* The sheet has its own close button now, so the launcher only exists
          while the sheet is shut. Two close buttons on one surface is the kind
          of thing that made the old layout feel like three apps at once. */}
      {s.drawer === null && (
        <button className="toolTab" onClick={() => s.setDrawer('tools')}
          data-tip="Add & finish" aria-label="Open the tools">✚</button>
      )}

      <Sheet open={open} title={TAB_TITLE[tab]} onClose={() => s.setDrawer(null)} className="toolbox">
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
              ? <div className="mini armed">
                  <b>{ASSETS.find(a => a.id === s.placing!.type)?.label ?? s.placing.type}</b>
                  {' — tap the floor to place it '}
                  <button className="lnk" onClick={() => s.setPlacing(null)}>cancel</button></div>
              : <div className="mini hint">Tap an item, then tap the floor</div>}
            {GROUPS.map(g => (
              <div key={g.group}>
                <div className="sec">{g.group}</div>
                <div className="tbGrid">
                  {assetsIn(g.category).map(a => (
                    <button key={a.id}
                      className={`tbItem lbl ${s.placing?.type === a.id ? 'on' : ''}`}
                      title={`${a.label} · ${a.mount.replace('-', ' ')}`}
                      aria-label={`${a.label}, mounts to ${a.mount.replace('-', ' ')}`}
                      onClick={() => {
                        const arm = s.placing?.type === a.id ? null : { kind: KIND[a.category], type: a.id };
                        s.setPlacing(arm);
                        if (arm) s.setDrawer(null);   // get out of the way of the tap
                      }}>
                      <i>{ASSET_ICON[a.id] ?? a.icon}</i>
                      <span>{SHORT[a.id] ?? a.label}</span>
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
                      <button key={m} className={`swatch ${on ? 'on' : ''}`} title={mat.label}
                        aria-label={mat.label}
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
      </Sheet>
    </>
  );
}
