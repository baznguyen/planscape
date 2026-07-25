'use client';
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, GEOM } from '@/lib/model/building';
import { useStore } from '@/store/useStore';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/** Which room contains a plan point on this floor (null when it is outside). */
export function roomAt(floor: 0 | 1, x: number, z: number): string | null {
  const hit = ROOMS.find(r => r.floor === floor && !r.void &&
    x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  return hit?.id ?? null;
}

function Heater({ on }: { on: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.32, 0]}>
        <boxGeometry args={[0.72, 0.56, 0.18]} />
        <meshStandardMaterial color="#d9dde2" roughness={0.5} metalness={0.25} />
      </mesh>
      {[-0.24, -0.08, 0.08, 0.24].map(fx => (
        <mesh key={fx} position={[fx, 0.32, 0.1]}>
          <boxGeometry args={[0.06, 0.46, 0.03]} />
          <meshStandardMaterial color={on ? '#e2703a' : '#b9bfc6'}
            emissive={on ? '#c0391a' : '#000000'} emissiveIntensity={on ? 0.9 : 0} />
        </mesh>
      ))}
      <mesh position={[-0.3, 0.03, 0]}><boxGeometry args={[0.06, 0.06, 0.3]} />
        <meshStandardMaterial color="#8b939c" /></mesh>
      <mesh position={[0.3, 0.03, 0]}><boxGeometry args={[0.06, 0.06, 0.3]} />
        <meshStandardMaterial color="#8b939c" /></mesh>
      {on && <pointLight color="#ff8a4c" intensity={0.5} distance={3.4} position={[0, 0.4, 0.2]} />}
    </group>
  );
}
function Vent() {
  return (
    <group>
      <mesh><boxGeometry args={[0.5, 0.05, 0.34]} />
        <meshStandardMaterial color="#e8ebee" /></mesh>
      {[-0.1, 0, 0.1].map(z => (
        <mesh key={z} position={[0, -0.03, z]}><boxGeometry args={[0.46, 0.015, 0.04]} />
          <meshStandardMaterial color="#9aa3ac" /></mesh>
      ))}
    </group>
  );
}
function Speaker({ sub }: { sub: boolean }) {
  const s = sub ? 0.42 : 0.2;
  return (
    <group>
      <mesh castShadow><boxGeometry args={[s, s * 1.5, s * 0.8]} />
        <meshStandardMaterial color="#2c3138" roughness={0.7} /></mesh>
      <mesh position={[0, 0, s * 0.41]}>
        <cylinderGeometry args={[s * 0.32, s * 0.32, 0.02, 20]} />
        <meshStandardMaterial color="#15181c" />
      </mesh>
    </group>
  );
}
function Ap() {
  return (
    <group>
      <mesh castShadow><cylinderGeometry args={[0.13, 0.13, 0.04, 22]} />
        <meshStandardMaterial color="#f2f4f6" /></mesh>
      <mesh position={[0, -0.03, 0]}><cylinderGeometry args={[0.04, 0.04, 0.01, 12]} />
        <meshStandardMaterial color="#5da9d8" emissive="#3f8fc4" emissiveIntensity={0.7} /></mesh>
    </group>
  );
}

/** Everything the user has dropped in, plus their speakers and access points. */
export default function Placed() {
  const { floor, items, speakers, aps, removeItem, updateItem } = useStore();
  return (
    <>
      {items.filter(i => i.floor === floor).map(i => (
        <group key={i.id} position={[i.x, yOf(floor) + i.y, i.z]} rotation={[0, i.rot, 0]}
          onClick={e => { e.stopPropagation(); updateItem(i.id, { on: !i.on }); }}
          onContextMenu={e => { e.stopPropagation(); removeItem(i.id); }}>
          {i.kind === 'heater' && <Heater on={i.on} />}
          {i.kind === 'vent' && <Vent />}
        </group>
      ))}
      {speakers.filter(s => s.floor === floor).map(s => (
        <group key={s.id} position={[s.x, yOf(floor) + s.y, s.z]}
          onContextMenu={e => { e.stopPropagation(); removeItem(s.id); }}>
          <Speaker sub={s.type === 'subwoofer'} />
        </group>
      ))}
      {aps.filter(a => a.floor === floor).map(a => (
        <group key={a.id} position={[a.x, yOf(floor) + (floor === 0 ? GEOM.H0 : GEOM.H1) - 0.05, a.z]}
          onContextMenu={e => { e.stopPropagation(); removeItem(a.id); }}>
          <Ap />
        </group>
      ))}
    </>
  );
}

/**
 * Invisible catcher plane. While something is armed in the toolbox this sits over
 * the floor and turns a click into a placement at that exact plan position.
 */
export function PlacementPlane() {
  const { floor, placing, placeAt, setPlacing } = useStore();
  const geom = useMemo(() => new THREE.PlaneGeometry(GEOM.LEN + 8, GEOM.WID + 8), []);
  if (!placing) return null;
  return (
    <>
      <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]}
        position={[GEOM.LEN / 2, yOf(floor) + 0.02, GEOM.WID / 2]}
        onClick={e => {
          e.stopPropagation();
          const { x, z } = e.point;
          placeAt(floor, x, z, roomAt(floor, x, z) ?? 'g_liv');
        }}
        onPointerMissed={() => setPlacing(null)}>
        <meshBasicMaterial transparent opacity={0.06} color="#b8873f" depthWrite={false} />
      </mesh>
      <Html position={[GEOM.LEN / 2, yOf(floor) + 1.9, -1.6]} center zIndexRange={[30, 0]}>
        <div className="placeHint">
          Tap the floor to place <b>{placing.type}</b> · tap away to cancel
        </div>
      </Html>
    </>
  );
}
