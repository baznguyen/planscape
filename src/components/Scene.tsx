'use client';
import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, WALLS, ALL_OPENINGS, GEOM, roomArea, roomHeight, roomCentre } from '@/lib/model/building';
import type { Room, Wall, Opening } from '@/lib/model/building';
import { MATERIALS } from '@/lib/model/materials';
import { useStore } from '@/store/useStore';
import { solarState, surfaceIrradiance } from '@/lib/solvers/sun';
import { rssiAt, rssiLabel } from '@/lib/solvers/rf';
import { splField } from '@/lib/solvers/acoustics';
import { roomLoad } from '@/lib/solvers/hvac';
import { kelvinToRgb, beamPool } from '@/lib/solvers/lighting';
import { WIND } from '@/lib/solvers/airflow';

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
function Floors() {
  const { floor, overlays, thermal, setHover, setSelected, hoverRoom } = useStore();
  return <>{ROOMS.filter(r => r.floor === floor && !r.void).map(r => {
    const A = roomArea(r), c = roomCentre(r);
    const base = MATERIALS[r.floorMat].colour;
    const t = thermal[r.id];
    const col = overlays.thermal && t !== undefined ? tempColour(t).getStyle() : base;
    return (
      <mesh key={r.id} position={[c.x, yOf(r.floor) + 0.03, c.z]} receiveShadow
        onPointerOver={e => { e.stopPropagation(); setHover(r.id); }}
        onPointerOut={() => setHover(null)}
        onClick={e => { e.stopPropagation(); setSelected(r.id); }}>
        <boxGeometry args={[r.x1 - r.x0, 0.06, r.z1 - r.z0]} />
        <meshStandardMaterial color={col} roughness={0.9}
          emissive={hoverRoom === r.id ? '#b8873f' : '#000000'} emissiveIntensity={hoverRoom === r.id ? 0.35 : 0} />
        <Edges color="#2b2b29" threshold={15} />
      </mesh>
    );
  })}</>;
}
function Walls() {
  const { floor, showRoof } = useStore();
  return <>{WALLS.filter(w => w.floor === floor).map(w => {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, L = Math.hypot(dx, dz);
    const H = floor === 0 ? GEOM.H0 : GEOM.H1;
    return (
      <mesh key={w.id} castShadow receiveShadow
        position={[(w.x1 + w.x2) / 2, yOf(w.floor) + H / 2, (w.z1 + w.z2) / 2]}
        rotation={[0, -Math.atan2(dz, dx), 0]}>
        <boxGeometry args={[L, H, GEOM.WT]} />
        <meshStandardMaterial color={MATERIALS[w.mat].colour} roughness={0.95} />
        <Edges color="#2b2b29" threshold={15} />
      </mesh>
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
function ThermalLabels() {
  const { floor, overlays, thermal, thermalDetail } = useStore();
  if (!overlays.thermal) return null;
  return <>{ROOMS.filter(r => r.floor === floor && !r.void && !r.outdoor).map(r => {
    const c = roomCentre(r), t = thermal[r.id];
    if (t === undefined) return null;
    const d = thermalDetail[r.id];
    return (
      <Html key={r.id} position={[c.x, yOf(r.floor) + 1.1, c.z]} center distanceFactor={16} zIndexRange={[10, 0]}>
        <div className="tempChip" style={{ background: tempColour(t).getStyle() }}>
          {t.toFixed(1)}°C
          {d && <span>{d.ach.toFixed(1)} ACH</span>}
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
function AirOverlay() {
  const { floor, overlays, month, openIds } = useStore();
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i*3] = Math.random()*GEOM.LEN; p[i*3+1] = 0.4+Math.random()*2.0; p[i*3+2] = Math.random()*GEOM.WID; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g;
  }, []);
  const dir = useMemo(() => {
    const [bearing] = WIND[month]; const rad = ((bearing + 180) * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad)).normalize();
  }, [month]);
  useFrame((_, dt) => {
    if (!overlays.air || !ref.current) return;
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const sp = dt * 3.0 * (openIds.size > 3 ? 1 : 0.25);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dir.x * sp, z = p.getZ(i) + dir.z * sp;
      if (x > GEOM.LEN) x = 0; if (x < 0) x = GEOM.LEN;
      if (z > GEOM.WID) z = 0; if (z < 0) z = GEOM.WID;
      p.setX(i, x); p.setZ(i, z);
    }
    p.needsUpdate = true;
  });
  if (!overlays.air) return null;
  return <points ref={ref} geometry={geo} position={[0, yOf(floor), 0]}>
    <pointsMaterial color="#3f9fd0" size={0.12} transparent opacity={0.8} />
  </points>;
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
    <hemisphereLight intensity={s.isDay ? 0.55 : 0.12} groundColor="#dfe1dd" />
    <ambientLight intensity={s.isDay ? 0.3 : 0.1} />
    <directionalLight ref={ref} castShadow shadow-mapSize={[2048, 2048]}>
      <orthographicCamera attach="shadow-camera" args={[-26, 26, 26, -26, 1, 160]} />
    </directionalLight>
  </>;
}
function Rig() {
  const { view, floor, fov } = useStore();
  const { camera } = useThree();
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.fov = view === 'plan' ? 55 : fov; c.updateProjectionMatrix();
  }, [view, fov, camera]);
  return null;
}
export default function Scene() {
  const { view, floor, showRoof } = useStore();
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [14, 26, 26], fov: 55, near: 0.05, far: 500 }}
      gl={{ antialias: true }}>
      <color attach="background" args={['#eef1f5']} />
      <fog attach="fog" args={['#eef1f5', 70, 200]} />
      <Rig />
      <SunRig />
      <RoomLights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[14, yOf(floor) - 0.06, 5.5]} receiveShadow>
        <planeGeometry args={[160, 160]} /><meshStandardMaterial color="#dfe6d4" />
      </mesh>
      <Floors /><Walls /><Openings />
      <ThermalLabels />
      <LightingOverlay /><HvacOverlay /><WifiOverlay /><AudioOverlay /><AirOverlay />
      <OrbitControls target={[14, yOf(floor) + 1, 5.5]} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
