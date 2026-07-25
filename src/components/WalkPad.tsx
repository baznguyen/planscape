'use client';
import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';

type Dir = 'fwd' | 'back' | 'left' | 'right';
const VEC: Record<Dir, [number, number]> = {
  fwd: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1],
};

/**
 * Movement pad for the walkthrough.
 *
 * Held rather than tapped, so a thumb can hold forward and the other hand can
 * drag to look — the two gestures never fight. Keyboard WASD / arrows drive the
 * same state on desktop.
 */
export default function WalkPad() {
  const view = useStore(s => s.view);
  const setWalkInput = useStore(s => s.setWalkInput);
  const eyeLevel = useStore(s => s.eyeLevel);
  const toggleEyeLevel = useStore(s => s.toggleEyeLevel);
  // held directions, so pressing two at once moves diagonally
  const held = useRef<Set<Dir>>(new Set());

  const apply = () => {
    let f = 0, s = 0;
    held.current.forEach(d => { f += VEC[d][0]; s += VEC[d][1]; });
    setWalkInput(Math.max(-1, Math.min(1, f)), Math.max(-1, Math.min(1, s)));
  };
  const press = (d: Dir) => { held.current.add(d); apply(); };
  const release = (d: Dir) => { held.current.delete(d); apply(); };

  useEffect(() => {
    const map: Record<string, Dir> = {
      w: 'fwd', arrowup: 'fwd', s: 'back', arrowdown: 'back',
      a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
    };
    const down = (e: KeyboardEvent) => {
      const d = map[e.key.toLowerCase()];
      if (!d) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault(); press(d);
    };
    const up = (e: KeyboardEvent) => { const d = map[e.key.toLowerCase()]; if (d) release(d); };
    // a lost focus must not leave the camera sliding forever
    const blur = () => { held.current.clear(); apply(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      held.current.clear(); setWalkInput(0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { held.current.clear(); setWalkInput(0, 0); }, [view, setWalkInput]);

  if (view === 'plan') return null;

  const btn = (d: Dir, glyph: string, cls: string, label: string) => (
    <button className={`pad ${cls}`} aria-label={label}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(d); }}
      onPointerUp={() => release(d)}
      onPointerCancel={() => release(d)}
      onPointerLeave={() => release(d)}
      onContextMenu={e => e.preventDefault()}>{glyph}</button>
  );

  return (
    <div className="walkPad">
      {btn('fwd', '▲', 'up', 'Forward')}
      {btn('left', '◀', 'lf', 'Left')}
      <button className={`pad mid ${eyeLevel ? 'on' : ''}`} onClick={toggleEyeLevel}
        aria-label={eyeLevel ? 'Back to overview' : 'Stand inside at eye level'}>
        {eyeLevel ? '⌂' : '🚶'}</button>
      {btn('right', '▶', 'rt', 'Right')}
      {btn('back', '▼', 'dn', 'Back')}
    </div>
  );
}
