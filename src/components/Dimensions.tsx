'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOMS, WALLS, GEOM, roomArea, roomCentre } from '@/lib/model/building';
import { useStore } from '@/store/useStore';
import { solarState } from '@/lib/solvers/sun';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/**
 * The measurement overlay.
 *
 * Two things were wrong with the first version, and both are the same mistake:
 * the labels were DOM elements.
 *
 * A DOM label sits in the page's stacking context, so it painted over the
 * header, the rail and the walk pad — a dimension for a wall behind you would
 * cover the button you were reaching for — and it captured the pointer, so a
 * drag that began on a label did not orbit the model. It also had no idea what
 * any other label was doing, so thirty of them piled into an unreadable heap
 * the moment you stood inside the building.
 *
 * So the labels are now part of the scene: canvas-textured sprites, drawn with
 * the lines, depth-test off so the whole string still floats above the render
 * the way a drawing overlay should, and de-cluttered every frame in screen
 * space. Nothing can reach the UI layer, nothing can eat a gesture, and what
 * survives the de-clutter is the set you can actually read.
 */

/* ------------------------------------------------------------------ *
 * Label textures. One canvas per distinct piece of text, cached, so a
 * re-render costs nothing and a repaint costs one upload.
 * ------------------------------------------------------------------ */
type Painted = { tex: THREE.CanvasTexture; w: number; h: number };
const texCache = new Map<string, Painted>();
const SS = 3;                                    // supersample for crisp text

function paint(key: string, draw: (c: CanvasRenderingContext2D) => void,
  wCss: number, hCss: number): Painted {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(wCss * SS); cv.height = Math.ceil(hCss * SS);
  const ctx = cv.getContext('2d')!;
  ctx.scale(SS, SS);
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const out = { tex, w: wCss, h: hCss };
  texCache.set(key, out);
  return out;
}

const F = (px: number, weight = 600) =>
  `${weight} ${px}px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`;

function roundRect(c: CanvasRenderingContext2D, x: number, y: number,
  w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A single dimension value, the way it reads on a drawing: bold, in mm. */
function dimLabel(mm: number, night: boolean): Painted {
  const text = mm.toLocaleString();
  return paint(`d|${text}|${night}`, c => {
    c.font = F(13, 700);
    const w = c.measureText(text).width + 14, h = 21;
    c.fillStyle = night ? 'rgba(14,20,32,.9)' : 'rgba(255,255,255,.95)';
    c.strokeStyle = night ? 'rgba(255,217,138,.6)' : 'rgba(184,135,63,.55)';
    c.lineWidth = 1.4;
    roundRect(c, 0.7, 0.7, w - 1.4, h - 1.4, 5);
    c.fill(); c.stroke();
    c.fillStyle = night ? '#ffe9bd' : '#1c2128';
    c.font = F(13, 700);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 0.5);
  }, measure(text, F(13, 700)) + 14, 21);
}

/** Name, area and overall size — what a room schedule would carry. */
function roomLabel(name: string, area: number, wide: number, deep: number, night: boolean): Painted {
  const l1 = name;
  const l2 = `${area.toFixed(1)} m²`;
  const l3 = `${wide.toFixed(2)} × ${deep.toFixed(2)} m`;
  const w = Math.max(measure(l1, F(12.5, 650)), measure(l2, F(14, 750)), measure(l3, F(10, 550))) + 18;
  const h = 50;
  return paint(`r|${l1}|${l2}|${l3}|${night}`, c => {
    c.fillStyle = night ? 'rgba(14,20,32,.9)' : 'rgba(255,255,255,.95)';
    c.strokeStyle = night ? 'rgba(255,217,138,.45)' : 'rgba(20,28,40,.25)';
    c.lineWidth = 1.4;
    roundRect(c, 0.7, 0.7, w - 1.4, h - 1.4, 6);
    c.fill(); c.stroke();
    c.textAlign = 'center';
    c.fillStyle = night ? '#ffe9bd' : '#1c2128';
    c.font = F(12.5, 650); c.fillText(l1, w / 2, 16);
    c.fillStyle = night ? '#ffd98a' : '#b8873f';
    c.font = F(14, 750); c.fillText(l2, w / 2, 32);
    c.fillStyle = night ? 'rgba(255,233,189,.7)' : 'rgba(28,33,40,.6)';
    c.font = F(10, 550); c.fillText(l3, w / 2, 44);
  }, w, h);
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx!.font = font;
  return measureCtx!.measureText(text).width;
}

/* ------------------------------------------------------------------ */

interface Lab {
  x: number; z: number;
  painted: Painted;
  /** higher wins a collision: external walls and big rooms are the ones you want */
  rank: number;
}

export default function Dimensions() {
  const floor = useStore(s => s.floor);
  const on = useStore(s => s.overlays.dims);
  const month = useStore(s => s.month);
  const minutes = useStore(s => s.minutes);
  const view = useStore(s => s.view);

  // Contrast against whatever the sky is doing. Gold-on-pale reads at midday and
  // vanishes at midnight, so the whole string inverts as the sun goes down.
  const alt = solarState(month, minutes).alt;
  const night = alt <= 0;
  const lineColour = night ? '#ffd98a' : '#8a5f1f';

  /**
   * Dimension lines: one string per wall, offset clear on the outward side,
   * with witness lines and the 45-degree architectural ticks. Keyed on the
   * floor alone — the previous version depended on a freshly filtered array,
   * so the memo never hit and it leaked a BufferGeometry on every store tick.
   */
  const geom = useMemo(() => {
    const y = yOf(floor) + 1.35;
    const cx = GEOM.LEN / 2, cz = GEOM.WID / 2;
    const pts: THREE.Vector3[] = [];
    const seg = (ax: number, az: number, bx: number, bz: number) =>
      pts.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz));
    for (const w of WALLS) {
      if (w.floor !== floor) continue;
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const L = Math.hypot(dx, dz);
      if (L < 0.45) continue;                       // too short to dimension legibly
      const ux = dx / L, uz = dz / L;
      let nx = -uz, nz = ux;
      const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const o = w.external ? 0.62 : 0.34;
      const ax = w.x1 + nx * o, az = w.z1 + nz * o;
      const bx = w.x2 + nx * o, bz = w.z2 + nz * o;
      seg(ax, az, bx, bz);
      seg(w.x1 + nx * 0.06, w.z1 + nz * 0.06, ax + nx * 0.1, az + nz * 0.1);
      seg(w.x2 + nx * 0.06, w.z2 + nz * 0.06, bx + nx * 0.1, bz + nz * 0.1);
      const t = 0.11;
      seg(ax - (ux + nx) * t, az - (uz + nz) * t, ax + (ux + nx) * t, az + (uz + nz) * t);
      seg(bx - (ux + nx) * t, bz - (uz + nz) * t, bx + (ux + nx) * t, bz + (uz + nz) * t);
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [floor]);
  useEffect(() => () => geom.dispose(), [geom]);

  /** Every candidate label, with the rank that decides who wins a clash. */
  const labels = useMemo<Lab[]>(() => {
    if (typeof document === 'undefined') return [];
    const cx = GEOM.LEN / 2, cz = GEOM.WID / 2;
    const out: Lab[] = [];
    for (const w of WALLS) {
      if (w.floor !== floor) continue;
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const L = Math.hypot(dx, dz);
      if (L < 0.45) continue;
      let nx = -dz / L, nz = dx / L;
      const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const o = (w.external ? 0.62 : 0.34) + 0.16;
      out.push({
        x: mx + nx * o, z: mz + nz * o,
        painted: dimLabel(Math.round(L * 1000), night),
        // Wall dimensions outrank room names, and external walls outrank
        // everything: they are what a builder sets out from, and they are the
        // thing that kept getting squeezed off the drawing.
        rank: (w.external ? 400 : 120) + L,
      });
    }
    for (const r of ROOMS) {
      if (r.floor !== floor || r.void) continue;
      const c = roomCentre(r);
      const A = roomArea(r);
      out.push({
        x: c.x, z: c.z,
        painted: roomLabel(r.name, A, r.x1 - r.x0, r.z1 - r.z0, night),
        rank: 200 + A / 10,               // room names sit between external and internal walls
      });
    }
    return out;
  }, [floor, night]);

  const group = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);

  /**
   * De-clutter, every frame, in screen space.
   *
   * Project each label, drop anything behind the camera or beyond legible
   * range, then walk the list best-first and hide anything whose box would
   * land on a box already accepted. That is the whole trick: a drawing is
   * readable because a draftsman leaves labels out, not because they are all
   * present.
   */
  useFrame(() => {
    const g = group.current;
    if (!g || !on) return;
    const H = size.height;
    const p11 = camera.projectionMatrix.elements[5];
    const y = yOf(floor) + 1.37;
    const taken: number[][] = [];
    const order = g.children
      .map((child, i) => {
        const l = labels[i];
        v.set(l.x, y, l.z).project(camera);
        const dist = camera.position.distanceTo(new THREE.Vector3(l.x, y, l.z));
        return { child, l, ndc: { x: v.x, y: v.y, z: v.z }, dist, i };
      })
      .filter(o => o.ndc.z > -1 && o.ndc.z < 1 && o.dist < 46)
      .sort((a, b) => (b.l.rank - a.l.rank) || (a.dist - b.dist));

    for (const o of order) o.child.visible = false;

    for (const o of order) {
      // constant screen size: with sizeAttenuation off the sprite scale is in
      // view units, so this is the conversion that pins it to pixels
      const k = 2 / (H * p11);
      const pw = o.l.painted.w, ph = o.l.painted.h;
      const sx = (o.ndc.x * 0.5 + 0.5) * size.width;
      const sy = (-o.ndc.y * 0.5 + 0.5) * H;
      const box = [sx - pw / 2, sy - ph / 2, sx + pw / 2, sy + ph / 2];
      let clash = false;
      for (const t of taken) {
        if (box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]) { clash = true; break; }
      }
      if (clash) continue;
      taken.push(box);
      o.child.visible = true;
      (o.child as THREE.Sprite).scale.set(pw * k, ph * k, 1);
    }
  });

  // Dimensions belong to the model, not to the empty lawn: in street view the
  // interior is not built, so a lattice of strings would hang in mid-air.
  if (!on || view === 'street') return null;
  const y = yOf(floor) + 1.35;

  return (
    <group renderOrder={45}>
      <lineSegments geometry={geom} frustumCulled={false}>
        <lineBasicMaterial color={lineColour} transparent opacity={1}
          depthTest={false} fog={false} toneMapped={false} />
      </lineSegments>
      <group ref={group}>
        {labels.map((l, i) => (
          <sprite key={i} position={[l.x, y + 0.02, l.z]} renderOrder={46}>
            <spriteMaterial map={l.painted.tex} sizeAttenuation={false}
              depthTest={false} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}
