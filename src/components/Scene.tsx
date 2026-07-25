'use client';
import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, WALLS, ALL_OPENINGS, GEOM, roomArea, roomHeight, roomCentre } from '@/lib/model/building';
import type { Room, Wall, Opening } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import { resolvePaint, roomsOnWall } from '@/lib/model/paint';
import { useStore } from '@/store/useStore';
import { solarState, surfaceIrradiance } from '@/lib/solvers/sun';
import { rssiAt, rssiLabel } from '@/lib/solvers/rf';
import { splField } from '@/lib/solvers/acoustics';
import { roomLoad } from '@/lib/solvers/hvac';
import { kelvinToRgb, beamPool } from '@/lib/solvers/lighting';
import { WIND } from '@/lib/solvers/airflow';
import Furniture from './Furniture';
import Exterior, { Garden } from './Exterior';
import PlanOverlay, { Beams } from './PlanOverlay';
import Airflow from './Airflow';
import Placed, { PlacementPlane } from './Placed';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);
/** Temperature -> colour ramp (blue 16C -> green 22 -> yellow 27 -> red 34+). */
export function tempColour(t: number): THREE.Color {
  const stops: [number, string][] = [[14,'#2b6cb0'],[20,'#38a3a5'],[24,'#57cc99'],[27,'#e9c46a'],[31,'#f4772e'],[36,'#c4372b']];
  if (t <= stops[0][0]) return new THREE.Color(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (t >= a && t <= b) return new THREE.Color(ca).lerp(new THREE.Color(cb), (t - a) / (b - a));
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}
/** Loads an uploaded swatch as a tiling texture. Cached so a re-render is free. */
const texCache = new Map<string, THREE.Texture>();
function swatch(url: string, repX: number, repY: number): THREE.Texture {
  const key = `${url}|${repX.toFixed(2)}|${repY.toFixed(2)}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(0.2, repX), Math.max(0.2, repY));
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
function Floors() {
  const { floor, overlays, thermal, setHover, setSelected, hoverRoom, finishes, placing, placeAt } = useStore();
  return <>{ROOMS.filter(r => r.floor === floor && !r.void).map(r => {
    const A = roomArea(r), c = roomCentre(r);
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const fin = finishes[r.id]?.floor;
    const base = fin?.colour ?? (fin?.material ? MATERIALS[fin.material]?.colour : undefined)
      ?? MATERIALS[r.floorMat].colour;
    const t = thermal[r.id];
    const col = overlays.thermal && t !== undefined ? tempColour(t).getStyle() : base;
    const map = !overlays.thermal && fin?.image ? swatch(fin.image, Math.max(1, w / 1.2), Math.max(1, d / 1.2)) : null;
    return (
      <mesh key={r.id} position={[c.x, yOf(r.floor) + 0.03, c.z]} receiveShadow
        onPointerOver={e => { e.stopPropagation(); setHover(r.id); }}
        onPointerOut={() => setHover(null)}
        onClick={e => {
          e.stopPropagation();
          // while something is armed the floor IS the placement target: it sits
          // above the catcher plane, so it would otherwise swallow every tap
          if (placing) placeAt(floor, e.point.x, e.point.z, r.id);
          else setSelected(r.id);
        }}>
        <boxGeometry args={[w, 0.06, d]} />
        <meshStandardMaterial color={map ? '#ffffff' : col} map={map} roughness={0.9}
          emissive={hoverRoom === r.id ? '#b8873f' : '#000000'} emissiveIntensity={hoverRoom === r.id ? 0.35 : 0} />
        <Edges color="#2b2b29" threshold={15} />
      </mesh>
    );
  })}</>;
}
function Walls() {
  const { floor, paints } = useStore();
  const H = floor === 0 ? GEOM.H0 : GEOM.H1;
  return <>{WALLS.filter(w => w.floor === floor).map(w => {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz);
    const ang = -Math.atan2(dz, dx), cx = (w.x1 + w.x2) / 2, cz = (w.z1 + w.z2) / 2;
    // Each face resolves on its own room, so a wall between a white hall and a
    // charcoal media room is white on one side and charcoal on the other.
    const rooms = roomsOnWall(w);
    const faceFinish = rooms.map(rid => {
      // "external" means THIS FACE looks outside — an external wall still has an
      // internal face, and a room-scoped colour has to reach it.
      const pa = resolvePaint(paints, {
        wallId: w.id, roomIds: rid ? [rid] : [], floor: w.floor,
        external: w.external && rid === null,
      });
      if (!pa) return null;
      return {
        hex: pa.colour?.hex,
        map: pa.wallpaper
          ? swatch(pa.wallpaper.image, L / pa.wallpaper.repeatM, H / pa.wallpaper.repeatM)
          : null,
      };
    });
    const col = MATERIALS[w.mat].colour;
    // project each opening onto the wall axis -> local offset from wall centre
    const ops = ALL_OPENINGS.filter(o => o.wallId === w.id).map(o => {
      const t = L < 1e-6 ? 0.5 : (((o.x - w.x1) * dx + (o.z - w.z1) * dz) / (L * L));
      return { o, u: (t - 0.5) * L, half: o.w / 2 };
    }).filter(e => Math.abs(e.u) <= L / 2 + 0.4).sort((a, b) => a.u - b.u);
    const parts: { w: number; h: number; y: number; u: number }[] = [];
    // full-height piers between openings
    let cursor = -L / 2;
    for (const e of ops) {
      const left = e.u - e.half;
      if (left > cursor + 0.02) parts.push({ w: left - cursor, h: H, y: H / 2, u: (cursor + left) / 2 });
      cursor = Math.max(cursor, e.u + e.half);
    }
    if (cursor < L / 2 - 0.02) parts.push({ w: L / 2 - cursor, h: H, y: H / 2, u: (cursor + L / 2) / 2 });
    // spandrel below the sill and above the head of each opening
    for (const e of ops) {
      const head = e.o.sill + e.o.h;
      if (e.o.sill > 0.02) parts.push({ w: e.o.w, h: e.o.sill, y: e.o.sill / 2, u: e.u });
      if (H - head > 0.02) parts.push({ w: e.o.w, h: H - head, y: (head + H) / 2, u: e.u });
    }
    return (
      <group key={w.id} position={[cx, yOf(w.floor), cz]} rotation={[0, ang, 0]}>
        {parts.map((pt, i) => (
          <group key={i}>
            <mesh position={[pt.u, pt.y, 0]} castShadow receiveShadow>
              <boxGeometry args={[pt.w, pt.h, GEOM.WT]} />
              <meshStandardMaterial color={col} roughness={0.95} />
              <Edges color="#2b2b29" threshold={15} />
            </mesh>
            {/* a paint skin on each face, 2 mm proud so it never z-fights */}
            {faceFinish.map((f, fi) => f && (
              <mesh key={fi} position={[pt.u, pt.y, (fi === 0 ? 1 : -1) * (GEOM.WT / 2 + 0.002)]}
                rotation={[0, fi === 0 ? 0 : Math.PI, 0]} receiveShadow>
                <planeGeometry args={[pt.w, pt.h]} />
                <meshStandardMaterial color={f.map ? '#ffffff' : (f.hex ?? col)} map={f.map}
                  roughness={0.93} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    );
  })}</>;
}
/** Doors/windows that visibly swing or slide when opened. */
function Openings() {
  const { floor, openIds, toggleOpening } = useStore();
  return <>{ALL_OPENINGS.filter(o => o.floor === floor).map(o => {
    const isOpen = openIds.has(o.id) || o.kind === 'cased';
    const m = MATERIALS[o.mat];
    const wall = WALLS.find(w => w.id === o.wallId);
    const horiz = wall ? Math.abs(wall.z1 - wall.z2) < 0.01 : false;
    const rot = horiz ? 0 : Math.PI / 2;
    if (o.kind === 'cased') return null;
    const swing = o.kind === 'door' ? (isOpen ? Math.PI / 2.2 : 0) : 0;
    const slide = (o.kind === 'slider' || o.kind === 'window') && isOpen ? o.w * o.openableFrac : 0;
    const H = o.kind === 'window' ? o.h : o.h;
    const yc = yOf(o.floor) + o.sill + H / 2;
    return (
      <group key={o.id} position={[o.x, yc, o.z]} rotation={[0, rot, 0]}
        onClick={e => { e.stopPropagation(); toggleOpening(o.id); }}>
        {/* leaf: hinged for doors, sliding for sliders/windows */}
        <group position={[o.kind === 'door' ? -o.w / 2 : 0, 0, 0]} rotation={[0, swing, 0]}>
          <mesh position={[o.kind === 'door' ? o.w / 2 : slide / 2, 0, 0]} castShadow>
            <boxGeometry args={[Math.max(0.05, o.w - slide), H, 0.05]} />
            <meshStandardMaterial color={m.colour} roughness={0.7}
              transparent={o.kind !== 'door' && o.kind !== 'garage'}
              opacity={o.kind === 'window' || o.kind === 'slider' ? 0.35 : 1} />
          </mesh>
        </group>
        {/* frame */}
        <mesh position={[0, H / 2 + 0.03, 0]}><boxGeometry args={[o.w + 0.12, 0.06, 0.13]} />
          <meshStandardMaterial color="#f4f2ee" /></mesh>
        <mesh position={[-o.w / 2 - 0.05, 0, 0]}><boxGeometry args={[0.06, H + 0.06, 0.13]} />
          <meshStandardMaterial color="#f4f2ee" /></mesh>
        <mesh position={[o.w / 2 + 0.05, 0, 0]}><boxGeometry args={[0.06, H + 0.06, 0.13]} />
          <meshStandardMaterial color="#f4f2ee" /></mesh>
      </group>
    );
  })}</>;
}
function Dimensions() {
  const { floor, overlays, month, minutes } = useStore();
  const walls = WALLS.filter(w => w.floor === floor);
  // Contrast against whatever the sky is doing. Gold-on-pale reads at midday and
  // vanishes at midnight, so the whole string inverts as the sun goes down.
  const alt = solarState(month, minutes).alt;
  const night = alt <= 0;
  const dusk = alt > 0 && alt < 0.18;
  const lineColour = night ? '#ffd98a' : dusk ? '#7a4a12' : '#8a5f1f';
  const chipClass = night ? 'dimChip night' : 'dimChip';
  /**
   * Proper dimension strings: one per wall, offset clear of the wall on the
   * outward side, with witness lines and ticks. Drawn with depthTest off at
   * waist height so the whole string floats over the render instead of being
   * swallowed by furniture and joinery.
   */
  const { geom, labels } = useMemo(() => {
    const y = yOf(floor) + 1.35;
    const cx = GEOM.LEN / 2, cz = GEOM.WID / 2;
    const pts: THREE.Vector3[] = [];
    const labs: { x: number; z: number; mm: number }[] = [];
    const seg = (ax: number, az: number, bx: number, bz: number) => {
      pts.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz));
    };
    for (const w of walls) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const L = Math.hypot(dx, dz);
      if (L < 0.45) continue;                       // too short to dimension legibly
      const ux = dx / L, uz = dz / L;
      // perpendicular, flipped so it always points away from the building centre
      let nx = -uz, nz = ux;
      const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const o = w.external ? 0.62 : 0.34;
      const ax = w.x1 + nx * o, az = w.z1 + nz * o;
      const bx = w.x2 + nx * o, bz = w.z2 + nz * o;
      seg(ax, az, bx, bz);                                        // dimension line
      seg(w.x1 + nx * 0.06, w.z1 + nz * 0.06, ax + nx * 0.1, az + nz * 0.1);   // witness
      seg(w.x2 + nx * 0.06, w.z2 + nz * 0.06, bx + nx * 0.1, bz + nz * 0.1);
      // 45-degree architectural ticks at each end
      const t = 0.11;
      seg(ax - (ux + nx) * t, az - (uz + nz) * t, ax + (ux + nx) * t, az + (uz + nz) * t);
      seg(bx - (ux + nx) * t, bz - (uz + nz) * t, bx + (ux + nx) * t, bz + (uz + nz) * t);
      labs.push({ x: (ax + bx) / 2 + nx * 0.16, z: (az + bz) / 2 + nz * 0.16, mm: Math.round(L * 1000) });
    }
    return { geom: new THREE.BufferGeometry().setFromPoints(pts), labels: labs, y };
  }, [floor, walls]);

  if (!overlays.dims) return null;
  const y = yOf(floor) + 1.35;
  return (
    <group renderOrder={45}>
      <lineSegments geometry={geom} frustumCulled={false}>
        <lineBasicMaterial color={lineColour} transparent opacity={night ? 1 : 0.95}
          depthTest={false} fog={false} toneMapped={false} />
      </lineSegments>
      {labels.map((l, i) => (
        <Html key={i} position={[l.x, y + 0.02, l.z]} center distanceFactor={17} zIndexRange={[14, 0]}>
          <div className={chipClass}>{l.mm.toLocaleString()}</div>
        </Html>
      ))}
      {ROOMS.filter(r => r.floor === floor && !r.void).map(r => {
        const c = roomCentre(r);
        return (
          <Html key={r.id} position={[c.x, y + 0.02, c.z]} center distanceFactor={15} zIndexRange={[13, 0]}>
            <div className={`${chipClass} area`}>{r.name}<b>{roomArea(r).toFixed(1)} m²</b>
              <i>{(r.x1 - r.x0).toFixed(2)} × {(r.z1 - r.z0).toFixed(2)} m</i></div>
          </Html>
        );
      })}
    </group>
  );
}
/** Area of overlap between two rooms in plan. */
function overlapArea(a: Room, b: { x0: number; x1: number; z0: number; z1: number }) {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const d = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  return w * d;
}
/**
 * Ceilings.
 *
 * Rendered whenever the camera is below ceiling level, and hidden the moment you
 * rise above the slab — so walking through gives you a real ceiling overhead, and
 * pulling up gives you the doll's-house cutaway without a toggle. A void on the
 * floor above punches its hole out, which is what makes the living room read as
 * the double-height space the drawing marks "VOID OVER".
 */
function Ceilings() {
  const { floor, showRoof, finishes } = useStore();
  const grp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const H = floor === 0 ? GEOM.H0 : GEOM.H1;
  const ceilY = yOf(floor) + H;
  const voids = ROOMS.filter(r => r.void && r.floor === (floor + 1 as 0 | 1));
  useFrame(() => {
    if (grp.current) grp.current.visible = camera.position.y < ceilY + 0.25;
  });
  if (!showRoof) return null;
  return (
    <group ref={grp}>
      {ROOMS.filter(r => r.floor === floor && !r.void && !r.outdoor).map(r => {
        const A = roomArea(r);
        const open = voids.reduce((a, v) => a + overlapArea(r, v), 0);
        if (open > A * 0.5) return null;               // double-height: no ceiling
        const c = roomCentre(r);
        const fin = finishes[r.id]?.ceiling;
        const col = fin?.colour ?? (fin?.material ? MATERIALS[fin.material]?.colour : undefined)
          ?? MATERIALS[r.ceilMat].colour;
        return (
          <mesh key={r.id} position={[c.x, ceilY - 0.03, c.z]} receiveShadow>
            <boxGeometry args={[r.x1 - r.x0, 0.06, r.z1 - r.z0]} />
            <meshStandardMaterial color={col} roughness={0.96} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}
/**
 * First-person movement. Translating the camera and the orbit target together
 * keeps look-around on the drag gesture while the pad drives position, which is
 * what makes it usable one-thumbed on a phone.
 */
function WalkMover() {
  const controls = useThree(s => s.controls) as any;
  const { camera } = useThree();
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Vector3(), []);
  const UP = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame((_, dtRaw) => {
    const st = useStore.getState();
    const { f, s: strafe } = st.walkInput;
    if (!controls || st.view === 'plan' || (f === 0 && strafe === 0)) return;
    fwd.subVectors(controls.target, camera.position); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    const d = 4.2 * Math.min(dtRaw, 0.05);
    step.set(0, 0, 0).addScaledVector(fwd, f * d).addScaledVector(right, strafe * d);
    camera.position.add(step);
    controls.target.add(step);
    controls.update();
  });
  return null;
}
/**
 * Camera vantage. Two modes: the doll's-house overview, and standing inside at
 * eye height. Eye level is what makes the pad a walkthrough rather than a pan —
 * horizontal movement alone can never drop you below the ceiling.
 */
const EYE = 1.62;
function TargetRig() {
  const controls = useThree(s => s.controls) as any;
  const { camera } = useThree();
  const { view, floor, resetNonce, eyeLevel } = useStore();
  useEffect(() => {
    if (!controls) return;
    const base = yOf(floor);
    if (eyeLevel && view !== 'plan') {
      // drop to standing height where you already are, keeping the current heading
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      dir.normalize();
      // if the overview left us outside the envelope, step in to the hall
      const inside = camera.position.x > 1 && camera.position.x < GEOM.LEN - 1 &&
                     camera.position.z > 1 && camera.position.z < GEOM.WID - 1;
      const px = inside ? camera.position.x : 14, pz = inside ? camera.position.z : 5.5;
      camera.position.set(px, base + EYE, pz);
      controls.target.set(px + dir.x * 4, base + EYE * 0.95, pz + dir.z * 4);
    } else if (view === 'street') {
      controls.target.set(20, 3, 5.5); camera.position.set(46, 7, 5.5);
    } else if (view === 'plan') {
      controls.target.set(14, base + 1, 5.5); camera.position.set(14, 26, 26);
    } else {
      controls.target.set(14, base + 1.2, 5.5); camera.position.set(14, base + 14, 22);
    }
    controls.update();
  }, [view, floor, resetNonce, eyeLevel, controls, camera]);
  return null;
}
function ThermalLabels() {
  const { floor, overlays, thermal, thermalDetail } = useStore();
  if (!overlays.thermal) return null;
  return <>{ROOMS.filter(r => r.floor === floor && !r.void && !r.outdoor).map(r => {
    const c = roomCentre(r), t = thermal[r.id];
    if (t === undefined) return null;
    const d = thermalDetail[r.id];
    return (
      <Html key={r.id} position={[c.x, yOf(r.floor) + 1.1, c.z]} center distanceFactor={16} zIndexRange={[10, 0]}>
        <div className="tempChip" style={{ background: tempColour(t).getStyle() }}
             onClick={() => useStore.getState().setSelected(r.id)}>
          <em>{r.name}</em>{t.toFixed(1)}°C
          {d && <span>{d.ach.toFixed(1)} ACH · {roomArea(r).toFixed(1)} m²</span>}
        </div>
      </Html>
    );
  })}</>;
}
/** Expanding wave rings shared by lighting / audio / hvac / wifi overlays. */
function Waves({ points, colour, maxR, speed = 0.6, count = 3 }:
  { points: { x: number; y: number; z: number }[]; colour: string; maxR: number; speed?: number; count?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current?.children.forEach((g, gi) => g.children.forEach((m, i) => {
      const mesh = m as THREE.Mesh;
      const ph = ((t * speed + i / count + gi * 0.13) % 1);
      const r = 0.15 + ph * maxR;
      mesh.scale.set(r, r, r);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - ph) * (1 - ph);
    }));
  });
  return <group ref={ref}>{points.map((p, i) => (
    <group key={i} position={[p.x, p.y, p.z]}>
      {Array.from({ length: count }).map((_, k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.96, 1, 40]} />
          <meshBasicMaterial color={colour} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  ))}</group>;
}
function LightingOverlay() {
  const { floor, overlays, lights } = useStore();
  if (!overlays.light) return null;
  const ls = lights.filter(l => l.floor === floor);
  return <>
    {ls.map(l => {
      const [r, g, b] = kelvinToRgb(l.kelvin);
      const col = l.rgb ?? new THREE.Color(r, g, b).getStyle();
      const pool = beamPool(l);
      return (
        <group key={l.id}>
          <mesh position={[l.x, yOf(floor) + l.y / 2, l.z]}>
            <coneGeometry args={[pool.diameter / 2, l.y, 20, 1, true]} />
            <meshBasicMaterial color={col} transparent opacity={l.on ? 0.1 : 0.02} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[l.x, yOf(floor) + 0.07, l.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[pool.diameter / 2, 26]} />
            <meshBasicMaterial color={col} transparent opacity={l.on ? 0.16 : 0.03} depthWrite={false} />
          </mesh>
        </group>
      );
    })}
    <Waves points={ls.filter(l => l.on).map(l => ({ x: l.x, y: yOf(floor) + 0.1, z: l.z }))}
      colour="#e8b45a" maxR={1.6} speed={0.45} count={2} />
  </>;
}
function HvacOverlay() {
  const { floor, overlays } = useStore();
  const pts = useMemo(() => {
    const out: { x: number; y: number; z: number; d: number; t: number }[] = [];
    for (const r of ROOMS.filter(x => x.floor === floor && !x.outdoor && !x.void && x.use !== 'garage' && x.use !== 'store')) {
      const L = roomLoad(r);
      const w = r.x1 - r.x0, d = r.z1 - r.z0, along = w >= d;
      for (let i = 0; i < L.outlets; i++) {
        const t = (i + 0.5) / L.outlets;
        out.push({
          x: along ? r.x0 + w * t : r.x0 + Math.min(1.2, w * 0.3),
          y: yOf(floor) + roomHeight(r) - 0.06,
          z: along ? r.z0 + Math.min(1.2, d * 0.3) : r.z0 + d * t,
          d: L.outletDia, t: L.throwM,
        });
      }
    }
    return out;
  }, [floor]);
  if (!overlays.hvac) return null;
  return <>
    {pts.map((p, i) => (
      <group key={i}>
        <mesh position={[p.x, p.y, p.z]}><cylinderGeometry args={[p.d / 2, p.d / 2, 0.05, 16]} />
          <meshStandardMaterial color="#cfd2d5" metalness={0.5} roughness={0.4} /></mesh>
        <mesh position={[p.x, p.y - (p.t * 0.28) / 2, p.z]} scale={[1, 0.28, 1]}>
          <coneGeometry args={[p.t * 0.34, p.t, 18, 1, true]} />
          <meshBasicMaterial color="#4aa8d8" transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    ))}
    <Waves points={pts.map(p => ({ x: p.x, y: p.y - 0.1, z: p.z }))} colour="#3f9fd0" maxR={2.6} speed={0.55} count={3} />
  </>;
}
function WifiOverlay() {
  const { floor, overlays, aps, rfBand, openIds } = useStore();
  const tex = useMemo(() => {
    const N = 56, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d')!, img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (GEOM.LEN * (i + 0.5)) / N, z = (GEOM.WID * (j + 0.5)) / N;
      const { rssi } = rssiAt(aps, x, z, floor, rfBand, openIds);
      const c = new THREE.Color(rssiLabel(rssi)[2]);
      const o = (j * N + i) * 4;
      img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 110;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; return t;
  }, [floor, aps, rfBand, openIds]);
  if (!overlays.wifi) return null;
  return <>
    <mesh position={[GEOM.LEN / 2, yOf(floor) + 0.1, GEOM.WID / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[GEOM.LEN, GEOM.WID]} />
      <meshBasicMaterial map={tex} transparent opacity={0.5} depthWrite={false} />
    </mesh>
    <Waves points={aps.filter(a => a.floor === floor).map(a => ({ x: a.x, y: yOf(floor) + 1.6, z: a.z }))}
      colour="#2f8fd8" maxR={9} speed={0.42} count={4} />
  </>;
}
function AudioOverlay() {
  const { floor, overlays, speakers, acFreq } = useStore();
  if (!overlays.audio || !speakers.length) return null;
  const sp = speakers.filter(s => s.floor === floor);
  return <Waves points={sp.map(s => ({ x: s.x, y: s.y, z: s.z }))}
    colour="#2f7fd0" maxR={Math.min(9, (343 / acFreq) * 3)} speed={0.5} count={4} />;
}
function RoomLights() {
  const { floor, lights } = useStore();
  const grouped = useMemo(() => {
    const m: Record<string, { x: number; z: number; lm: number; col: THREE.Color }> = {};
    for (const l of lights) {
      if (l.floor !== floor || !l.on) continue;
      const [r, g, b] = kelvinToRgb(l.kelvin);
      const c = l.rgb ? new THREE.Color(l.rgb) : new THREE.Color(r, g, b);
      const lm = 900 * l.bulbs * l.dim;
      if (!m[l.room]) m[l.room] = { x: 0, z: 0, lm: 0, col: new THREE.Color(0, 0, 0) };
      const e = m[l.room];
      e.x += l.x * lm; e.z += l.z * lm; e.lm += lm;
      e.col.add(c.multiplyScalar(lm));
    }
    return Object.entries(m).map(([room, e]) => ({
      room, x: e.x / e.lm, z: e.z / e.lm,
      intensity: Math.min(2.6, e.lm / 1200), col: e.col.multiplyScalar(1 / e.lm),
    }));
  }, [lights, floor]);
  return <>{grouped.slice(0, 10).map(g => (
    <pointLight key={g.room} position={[g.x, yOf(floor) + (floor ? GEOM.H1 : GEOM.H0) - 0.35, g.z]}
      intensity={g.intensity} distance={9} decay={2} color={g.col} />
  ))}</>;
}
const STAR_R = 300;
const STAR_N = 1800;
/**
 * Star field.
 * Deliberately NOT gl.POINTS: point-sprite size is clamped by several drivers
 * (and by software rasterisers) so the field silently disappears. Instanced
 * low-poly spheres always rasterise, at a predictable on-screen size.
 */
function StarField({ opacity }: { opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    // Deterministic (mulberry32) so the sky does not reshuffle between renders.
    let t = 0x9e3779b9;
    const rnd = () => {
      t |= 0; t = (t + 0x6d2b79f5) | 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    // Full sphere, not just the upper hemisphere: the default cameras look DOWN
    // at the model, so the horizon sits above the top of the frame and an
    // upper-hemisphere-only field would be entirely off-screen.
    return Array.from({ length: STAR_N }, () => {
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(1 - 2 * rnd());                    // uniform over the sphere
      const m = rnd();                                       // magnitude
      return {
        x: 14 + STAR_R * Math.sin(ph) * Math.cos(th),
        y: STAR_R * Math.cos(ph),
        z: 5.5 + STAR_R * Math.sin(ph) * Math.sin(th),
        s: 0.32 + m * m * m * 0.72,                          // few bright, many faint (~2-6 px)
      };
    });
  }, []);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    seeds.forEach((p, i) => {
      m.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  }, [seeds]);
  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, STAR_N]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      {/* fog={false} + toneMapped={false}: scene fog would flatten every star to the sky colour */}
      <meshBasicMaterial color="#ffffff" fog={false} toneMapped={false}
        transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
}
/** Moon disc + halo, riding the anti-solar point so it is up whenever the sun is down. */
function Moon({ sunAlt, sunAz, opacity }: { sunAlt: number; sunAz: number; opacity: number }) {
  const alt = -sunAlt * 0.82 + 0.12;          // roughly opposite the sun, a little higher
  const az = sunAz + Math.PI;
  const d = 285;
  const p: [number, number, number] = [
    14 + d * Math.cos(alt) * Math.sin(az),
    Math.max(18, d * Math.sin(alt)),
    5.5 + d * Math.cos(alt) * Math.cos(az),
  ];
  return (
    <group position={p}>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[3.1, 24, 18]} />
        <meshBasicMaterial color="#f2f4ef" fog={false} toneMapped={false} transparent opacity={opacity} />
      </mesh>
      {/* soft halo */}
      <mesh frustumCulled={false}>
        <sphereGeometry args={[6.4, 20, 14]} />
        <meshBasicMaterial color="#aebedd" fog={false} toneMapped={false}
          transparent opacity={opacity * 0.13} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}
function SkyDome() {
  const { month, minutes } = useStore();
  const s = solarState(month, minutes);
  const alt = s.alt;
  const day = new THREE.Color('#eef1f5'), gold = new THREE.Color('#f6d3a8'), night = new THREE.Color('#070c16');
  let bg: THREE.Color;
  if (alt > 0.28) bg = day;
  else if (alt > 0) bg = gold.clone().lerp(day, Math.min(1, alt / 0.28));
  else bg = new THREE.Color('#1d2740').lerp(night, Math.min(1, -alt / 0.18));
  const starOpacity = alt > 0 ? 0 : Math.min(0.95, -alt * 6);
  return (<>
    <color attach="background" args={[bg.getStyle()]} />
    <fog attach="fog" args={[bg.getStyle(), alt > 0 ? 70 : 40, alt > 0 ? 200 : 150]} />
    {starOpacity > 0.02 && <>
      <StarField opacity={starOpacity} />
      <Moon sunAlt={alt} sunAz={s.az} opacity={Math.min(1, starOpacity + 0.05)} />
    </>}
  </>);
}
function SunRig() {
  const { month, minutes } = useStore();
  const ref = useRef<THREE.DirectionalLight>(null);
  const s = solarState(month, minutes);
  useEffect(() => {
    if (!ref.current) return;
    const d = 60;
    const v = new THREE.Vector3(Math.cos(s.alt) * Math.sin(s.az), Math.sin(s.alt), Math.cos(s.alt) * Math.cos(s.az));
    ref.current.position.set(14 + v.x * d, Math.max(2, v.y * d), 5.5 + v.z * d);
    ref.current.intensity = s.isDay ? 0.4 + 1.3 * Math.min(1, s.alt / 0.6) : 0.05;
  }, [s.alt, s.az, s.isDay]);
  return <>
    <hemisphereLight intensity={s.isDay ? 0.55 : 0.05} groundColor={s.isDay ? '#dfe1dd' : '#0d1424'} />
    <ambientLight intensity={s.isDay ? 0.3 : 0.04} color={s.isDay ? '#ffffff' : '#93a6c4'} />
    <directionalLight ref={ref} castShadow shadow-mapSize={[2048, 2048]}>
      <orthographicCamera attach="shadow-camera" args={[-26, 26, 26, -26, 1, 160]} />
    </directionalLight>
  </>;
}
/** Reference aspect the framing was authored against (a normal desktop canvas). */
const REF_ASPECT = 1.6;
function Rig() {
  const { view, floor, fov } = useStore();
  const { camera, size } = useThree();
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    const base = view === 'plan' ? 55 : fov;
    const a = size.height > 0 ? size.width / size.height : REF_ASPECT;
    if (a >= REF_ASPECT) {
      c.fov = base;
    } else {
      // Portrait/narrow: widen the vertical FOV so the same horizontal extent of the
      // building still fits. Without this the 28 m frontage is cropped on a phone.
      const rad = (d: number) => (d * Math.PI) / 180;
      // 1.12 = a little breathing room so the frontage is not flush with the edge
      const hHalf = Math.atan(Math.tan(rad(base) / 2) * REF_ASPECT * 1.12);
      c.fov = Math.min(96, (2 * Math.atan(Math.tan(hHalf) / a) * 180) / Math.PI);
    }
    c.updateProjectionMatrix();
  }, [view, fov, camera, size.width, size.height]);
  return null;
}
export default function Scene() {
  const { view, floor, showRoof } = useStore();
  const interior = view !== 'street';
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [14, 26, 26], fov: 55, near: 0.05, far: 500 }}
      gl={{ antialias: true }}>
      <SkyDome />
      <Rig />
      <SunRig />
      <RoomLights />
      {/* Finite site disc, not an infinite plane: an infinite ground fills the whole
          frame at these camera pitches, which hides the sky (and therefore the stars)
          entirely. Street view supplies its own ground. */}
      {interior && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[14, yOf(floor) - 0.06, 5.5]} receiveShadow>
          <circleGeometry args={[34, 96]} /><meshStandardMaterial color="#dfe6d4" />
        </mesh>
      )}
      {interior && <><Floors /><Walls /><Ceilings /><Openings /><Beams /><Furniture /><Garden /><Placed /></>}
      <Exterior />
      <ThermalLabels />
      <Dimensions />
      <PlanOverlay />
      <PlacementPlane />
      <LightingOverlay /><HvacOverlay /><WifiOverlay /><AudioOverlay /><Airflow />
      <TargetRig />
      <WalkMover />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
