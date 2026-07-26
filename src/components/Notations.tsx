'use client';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GEOM } from '@/lib/model/building';
import { PLAN_NOTES, type NoteKind, type PlanNote } from '@/lib/model/planNotes';
import { useStore } from '@/store/useStore';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/**
 * The drawing's written notes, over the model.
 *
 * A room label tells you what a space is called. It does not tell you that the
 * ceiling steps down because there is a beam over, that the garage slab is
 * 170 mm lower than the house, that the balustrade is 1,025 high, or that the
 * timber landing at the back door is only built if it is required. All of that
 * is on the sheet as text, all of it changes what gets built, and none of it
 * reaches a model made of rooms and walls.
 *
 * On the interaction, which is the whole design problem here. There are 146
 * notes on this set. The first version drew them all and the render vanished
 * under its own annotation — which is a fair description of why nobody enjoys
 * reading a construction drawing, and not something to reproduce. So:
 *
 *   · notes are pins, not paragraphs. Closed, a pin carries one clipped line
 *     and a colour bar saying what it is about;
 *   · they de-clutter every frame in screen space, best-first, exactly the way
 *     the dimension strings do. A drawing is readable because a draftsman
 *     leaves things out, not because everything is present;
 *   · what survives at a distance is the important stuff — structure and levels
 *     outrank a window schedule code — so zooming in is what reveals detail,
 *     the same gesture you would use on paper;
 *   · tapping a pin opens it in full and keeps it open, and an open pin never
 *     loses a clash.
 *
 * The type is a mono face in colours used nowhere else in the app, so a plan
 * note never reads as something the app is saying.
 */

/** One colour per kind, chosen to sit apart from the render's warm greys. */
const INK: Record<NoteKind, string> = {
  opening: '#0e8ad8',
  level: '#00897b',
  structure: '#d2185f',
  safety: '#c85a00',
  service: '#6a3fd0',
  joinery: '#0f7a3d',
  note: '#3b4250',
};
/** Who wins a clash. A stepdown changes the slab; a window code does not. */
const RANK: Record<NoteKind, number> = {
  level: 600, structure: 560, safety: 520, note: 420,
  joinery: 360, service: 300, opening: 200,
};
const MONO = '"SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

type Painted = { tex: THREE.Texture; w: number; h: number };
const cache = new Map<string, Painted>();

function chip(note: PlanNote, open: boolean): Painted {
  const key = `${note.id}|${open}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const DPR = 2;
  const c = document.createElement('canvas').getContext('2d')!;
  const font = (px: number, weight = 600) => `${weight} ${px}px ${MONO}`;
  const size = open ? 13 : 11.5;
  const maxChars = open ? 30 : 15;
  const lines: string[] = [];
  if (open) {
    let line = '';
    for (const word of note.text.split(' ')) {
      if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
  } else {
    lines.push(note.text.length > maxChars ? note.text.slice(0, maxChars - 1) + '…' : note.text);
  }
  c.font = font(size);
  const tw = Math.max(...lines.map(l => c.measureText(l).width));
  const lh = Math.round(size * 1.35);
  const w = Math.ceil(tw + 20), h = Math.ceil(lines.length * lh + 10);
  c.canvas.width = w * DPR; c.canvas.height = h * DPR;
  c.scale(DPR, DPR);
  // ~70% transparent when closed: a tint over the building, not a card on it.
  // An open note is being read, so it earns a solid ground.
  c.fillStyle = open ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.30)';
  c.strokeStyle = INK[note.kind];
  c.lineWidth = open ? 1.6 : 1.1;
  const r = 4;
  c.beginPath();
  c.moveTo(r, 0.6); c.arcTo(w - 0.6, 0.6, w - 0.6, h - 0.6, r);
  c.arcTo(w - 0.6, h - 0.6, 0.6, h - 0.6, r); c.arcTo(0.6, h - 0.6, 0.6, 0.6, r);
  c.arcTo(0.6, 0.6, w - 0.6, 0.6, r); c.closePath();
  c.fill(); c.stroke();
  c.fillStyle = INK[note.kind];
  c.fillRect(0.6, 0.6, 3, h - 1.2);
  c.font = font(size, open ? 650 : 600);
  c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, 9, 6 + lh / 2 + i * lh));
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const painted = { tex, w, h };
  cache.set(key, painted);
  return painted;
}

export default function Notations() {
  const on = useStore(s => s.overlays.notes);
  const floor = useStore(s => s.floor);
  const view = useStore(s => s.view);
  const kinds = useStore(s => s.noteKinds);
  const [open, setOpen] = useState<string | null>(null);

  /**
   * Height. On a plan the notes float just above head height on the level you
   * are looking at, clear of the joinery. Looking at the elevation there is no
   * "level", so they lift to the eaves and sit against the facade — which is
   * what the notes that matter in that view (beams over, cantilevers, the line
   * of dwelling over, the capping) are describing anyway.
   */
  const y = view === 'street' ? GEOM.F1Y + 2.4 : yOf(floor) + 2.1;

  const shown = useMemo(() => PLAN_NOTES.filter(n =>
    kinds[n.kind] !== false && (view === 'street' || n.floor === floor)), [floor, kinds, view]);
  const painted = useMemo(() => shown.map(n => chip(n, open === n.id)), [shown, open]);

  const group = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const g = group.current;
    if (!g || !on) return;
    const H = size.height;
    const k = 2 / (H * camera.projectionMatrix.elements[5]);
    const taken: number[][] = [];
    const order = g.children
      .map((child, i) => {
        const n = shown[i];
        p.set(n.x, y, n.z);
        v.copy(p).project(camera);
        return { child, n, i, ndc: { x: v.x, y: v.y, z: v.z }, dist: camera.position.distanceTo(p) };
      })
      .filter(o => o.ndc.z > -1 && o.ndc.z < 1 && o.dist < 60)
      .sort((a, b) => {
        const ao = open === a.n.id ? 1e6 : 0, bo = open === b.n.id ? 1e6 : 0;
        return (bo + RANK[b.n.kind]) - (ao + RANK[a.n.kind]) || (a.dist - b.dist);
      });

    for (const o of g.children) o.visible = false;
    for (const o of order) {
      const { w, h } = painted[o.i];
      const sx = (o.ndc.x * 0.5 + 0.5) * size.width;
      const sy = (-o.ndc.y * 0.5 + 0.5) * H;
      // a little breathing room, or the pins tile edge to edge and read as a wall
      const box = [sx - w / 2 - 3, sy - h / 2 - 3, sx + w / 2 + 3, sy + h / 2 + 3];
      if (taken.some(t => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box);
      o.child.visible = true;
      (o.child as THREE.Sprite).scale.set(w * k, h * k, 1);
    }
  });

  if (!on) return null;
  return (
    <group ref={group} renderOrder={47}>
      {shown.map((n, i) => (
        <sprite key={n.id} position={[n.x, y, n.z]} renderOrder={open === n.id ? 49 : 48}
          onClick={e => { e.stopPropagation(); setOpen(o => (o === n.id ? null : n.id)); }}>
          <spriteMaterial map={painted[i].tex} sizeAttenuation={false}
            depthTest={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}
