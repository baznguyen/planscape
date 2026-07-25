'use client';
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ROOMS, GEOM } from '@/lib/model/building';
import { assetById } from '@/lib/model/assets';
import { resolveMount } from '@/lib/model/mounting';
import { useStore } from '@/store/useStore';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

export function roomAt(floor: 0 | 1, x: number, z: number): string | null {
  const hit = ROOMS.find(r => r.floor === floor && !r.void &&
    x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  return hit?.id ?? null;
}

/* ------------------------------------------------------------------ *
 * Geometry. Each asset is drawn the way it actually mounts — a recessed
 * downlight is a trim ring and a lens flush with the plasterboard, an
 * in-wall speaker is a shallow baffle in the wall face, a sub is a box
 * standing on the floor. The mount type decides the form.
 * ------------------------------------------------------------------ */

const Grille = ({ r, seg = 20 }: { r: number; seg?: number }) => (
  <mesh rotation={[Math.PI / 2, 0, 0]}>
    <cylinderGeometry args={[r, r, 0.012, seg]} />
    <meshStandardMaterial color="#d8dade" roughness={0.85} />
  </mesh>
);

function CeilingSpeaker({ r }: { r: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh><cylinderGeometry args={[r, r, 0.02, 24]} />
        <meshStandardMaterial color="#eceef1" roughness={0.8} /></mesh>
      <mesh position={[0, -0.012, 0]}><cylinderGeometry args={[r * 0.8, r * 0.8, 0.008, 24]} />
        <meshStandardMaterial color="#c9ccd1" roughness={0.95} /></mesh>
      <mesh position={[0, -0.02, 0]}><sphereGeometry args={[r * 0.18, 12, 8]} />
        <meshStandardMaterial color="#8f959c" metalness={0.4} roughness={0.4} /></mesh>
    </group>
  );
}
function WallSpeaker({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#eceef1" roughness={0.85} /></mesh>
      <mesh position={[0, -h * 0.16, d / 2 + 0.004]}>
        <cylinderGeometry args={[w * 0.36, w * 0.36, 0.008, 20]} />
        <meshStandardMaterial color="#b9bec4" roughness={0.95} /></mesh>
      <mesh position={[0, h * 0.3, d / 2 + 0.004]}>
        <sphereGeometry args={[w * 0.12, 12, 8]} />
        <meshStandardMaterial color="#8f959c" metalness={0.4} roughness={0.4} /></mesh>
    </group>
  );
}
function BoxSpeaker({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#2c3138" roughness={0.72} /></mesh>
      <mesh position={[0, -h * 0.14, d / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[w * 0.34, w * 0.34, 0.01, 20]} />
        <meshStandardMaterial color="#15181c" /></mesh>
      <mesh position={[0, h * 0.28, d / 2 + 0.005]}>
        <sphereGeometry args={[w * 0.11, 12, 8]} />
        <meshStandardMaterial color="#3c4249" metalness={0.5} roughness={0.35} /></mesh>
    </group>
  );
}
function Sub({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#22262b" roughness={0.6} /></mesh>
      <mesh position={[0, 0, d / 2 + 0.006]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[w * 0.38, w * 0.38, 0.012, 24]} />
        <meshStandardMaterial color="#101215" roughness={0.9} /></mesh>
      {[-1, 1].map(sx => [-1, 1].map(sz => (
        <mesh key={`${sx}${sz}`} position={[sx * w * 0.4, -h / 2 - 0.015, sz * d * 0.4]}>
          <cylinderGeometry args={[0.018, 0.018, 0.03, 8]} />
          <meshStandardMaterial color="#4a5057" /></mesh>
      )))}
    </group>
  );
}
function Downlight({ recessed }: { recessed: boolean }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh><cylinderGeometry args={[0.055, 0.055, 0.014, 20]} />
        <meshStandardMaterial color="#f2f3f5" roughness={0.5} metalness={0.2} /></mesh>
      <mesh position={[0, -0.009, 0]}><cylinderGeometry args={[0.042, 0.042, 0.006, 20]} />
        <meshStandardMaterial color="#fff8ea" emissive="#ffe6b0" emissiveIntensity={recessed ? 1.4 : 0.9} /></mesh>
    </group>
  );
}
function Pendant({ drop }: { drop: number }) {
  return (
    <group>
      <mesh position={[0, drop / 2, 0]}><cylinderGeometry args={[0.006, 0.006, drop, 6]} />
        <meshStandardMaterial color="#3a3f45" /></mesh>
      <mesh castShadow><coneGeometry args={[0.14, 0.2, 20, 1, true]} />
        <meshStandardMaterial color="#2f343a" side={THREE.DoubleSide} roughness={0.6} /></mesh>
      <mesh position={[0, -0.09, 0]}><sphereGeometry args={[0.045, 12, 8]} />
        <meshStandardMaterial color="#fff6e2" emissive="#ffdf9e" emissiveIntensity={1.2} /></mesh>
    </group>
  );
}
function FloorLamp({ h }: { h: number }) {
  return (
    <group>
      <mesh position={[0, -h / 2 + 0.01, 0]}><cylinderGeometry args={[0.17, 0.18, 0.02, 20]} />
        <meshStandardMaterial color="#4a5057" metalness={0.5} roughness={0.4} /></mesh>
      <mesh><cylinderGeometry args={[0.012, 0.012, h, 10]} />
        <meshStandardMaterial color="#6d747b" metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, h / 2 - 0.09, 0]}><coneGeometry args={[0.17, 0.22, 22, 1, true]} />
        <meshStandardMaterial color="#efe9dd" side={THREE.DoubleSide} /></mesh>
    </group>
  );
}
function TableLamp({ h }: { h: number }) {
  return (
    <group>
      <mesh position={[0, -h / 2 + 0.02, 0]}><cylinderGeometry args={[0.09, 0.1, 0.04, 16]} />
        <meshStandardMaterial color="#5b6169" /></mesh>
      <mesh><cylinderGeometry args={[0.014, 0.014, h * 0.6, 10]} />
        <meshStandardMaterial color="#7d848c" /></mesh>
      <mesh position={[0, h / 2 - 0.08, 0]}><coneGeometry args={[0.13, 0.18, 18, 1, true]} />
        <meshStandardMaterial color="#f2ece1" side={THREE.DoubleSide} /></mesh>
    </group>
  );
}
function Ap({ wall }: { wall: boolean }) {
  return wall ? (
    <group>
      <mesh castShadow><boxGeometry args={[0.14, 0.2, 0.04]} />
        <meshStandardMaterial color="#f3f5f7" roughness={0.5} /></mesh>
      <mesh position={[0, -0.06, 0.022]}><boxGeometry args={[0.04, 0.006, 0.004]} />
        <meshStandardMaterial color="#5da9d8" emissive="#3f8fc4" emissiveIntensity={0.8} /></mesh>
    </group>
  ) : (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.11, 0.11, 0.035, 26]} />
        <meshStandardMaterial color="#f3f5f7" roughness={0.5} /></mesh>
      <mesh position={[0, -0.021, 0]}><torusGeometry args={[0.045, 0.005, 8, 24]} />
        <meshStandardMaterial color="#5da9d8" emissive="#3f8fc4" emissiveIntensity={0.8} /></mesh>
    </group>
  );
}
function PanelHeater({ on, w, h, d }: { on: boolean; w: number; h: number; d: number }) {
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#e6e9ec" roughness={0.45} metalness={0.2} /></mesh>
      {[-0.3, -0.1, 0.1, 0.3].map(f => (
        <mesh key={f} position={[f * w, 0, d / 2 + 0.004]}>
          <boxGeometry args={[w * 0.12, h * 0.72, 0.006]} />
          <meshStandardMaterial color={on ? '#e2703a' : '#c3c8cd'}
            emissive={on ? '#c0391a' : '#000000'} emissiveIntensity={on ? 0.85 : 0} />
        </mesh>
      ))}
      {on && <pointLight color="#ff8a4c" intensity={0.45} distance={3.2} position={[0, 0, 0.3]} />}
    </group>
  );
}
function RadiantHeater({ on }: { on: boolean }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh><boxGeometry args={[0.3, 0.06, 0.3]} />
        <meshStandardMaterial color="#eceef1" /></mesh>
      {[-0.07, 0.07].map(o => (
        <mesh key={o} position={[o, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.24, 12]} />
          <meshStandardMaterial color={on ? '#ff8347' : '#b6bbc1'}
            emissive={on ? '#e0431a' : '#000000'} emissiveIntensity={on ? 1.3 : 0} />
        </mesh>
      ))}
    </group>
  );
}
function Vent() {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh><boxGeometry args={[0.5, 0.05, 0.34]} />
        <meshStandardMaterial color="#e8ebee" /></mesh>
      {[-0.1, 0, 0.1].map(z => (
        <mesh key={z} position={[0, -0.03, z]}><boxGeometry args={[0.46, 0.015, 0.04]} />
          <meshStandardMaterial color="#9aa3ac" /></mesh>
      ))}
    </group>
  );
}

/** Draw whatever the catalogue says this is. */
function AssetMesh({ assetId, on }: { assetId: string; on: boolean }) {
  const spec = assetById(assetId);
  if (!spec) return null;
  const { w, h, d } = spec.size;
  switch (spec.id) {
    case 'spk_ceiling': return <CeilingSpeaker r={w / 2} />;
    case 'spk_wall': return <WallSpeaker w={w} h={h} d={d} />;
    case 'spk_surround':
    case 'spk_bookshelf': return <BoxSpeaker w={w} h={h} d={d} />;
    case 'sub': return <Sub w={w} h={h} d={d} />;
    case 'dl_wide':
    case 'dl_narrow': return <Downlight recessed />;
    case 'pendant': return <Pendant drop={spec.dropM ?? 1.6} />;
    case 'lamp_floor': return <FloorLamp h={h} />;
    case 'lamp_table': return <TableLamp h={h} />;
    case 'ap_ceiling': return <Ap wall={false} />;
    case 'ap_wall': return <Ap wall />;
    case 'heater_panel': return <PanelHeater on={on} w={w} h={h} d={d} />;
    case 'heater_radiant': return <RadiantHeater on={on} />;
    case 'vent_ceiling': return <Vent />;
    default:
      return <mesh castShadow><boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#b9bec4" /></mesh>;
  }
}

/** Everything the user has dropped in, drawn where its mount actually puts it. */
export default function Placed() {
  const { floor, items, speakers, aps, lights, removeItem, updateItem } = useStore();
  const base = yOf(floor);
  return (
    <>
      {items.filter(i => i.floor === floor).map(i => (
        <group key={i.id} position={[i.x, base + i.y, i.z]} rotation={[0, i.rot, 0]}
          onClick={e => { e.stopPropagation(); updateItem(i.id, { on: !i.on }); }}
          onContextMenu={e => { e.stopPropagation(); removeItem(i.id); }}>
          <AssetMesh assetId={i.asset || i.type} on={i.on} />
        </group>
      ))}
      {speakers.filter(s => s.floor === floor).map(s => (
        <group key={s.id} position={[s.x, s.y, s.z]}
          rotation={[0, resolveMount(assetById(s.asset ?? 'spk_bookshelf')!, floor, s.x, s.z).rot, 0]}
          onContextMenu={e => { e.stopPropagation(); removeItem(s.id); }}>
          <AssetMesh assetId={s.asset ?? 'spk_bookshelf'} on />
        </group>
      ))}
      {aps.filter(a => a.floor === floor).map(a => (
        <group key={a.id} position={[a.x, base + (floor === 0 ? GEOM.H0 : GEOM.H1) - 0.03, a.z]}
          onContextMenu={e => { e.stopPropagation(); removeItem(a.id); }}>
          <AssetMesh assetId={a.asset ?? 'ap_ceiling'} on />
        </group>
      ))}
      {/* catalogue luminaires get their real fitting drawn; auto-designed ones do not */}
      {lights.filter(l => l.floor === floor && l.asset).map(l => (
        <group key={l.id} position={[l.x, base + l.y, l.z]}
          onContextMenu={e => { e.stopPropagation(); removeItem(l.id); }}>
          <AssetMesh assetId={l.asset!} on={l.on} />
        </group>
      ))}
    </>
  );
}

/**
 * Invisible catcher plane. While something is armed this turns a tap into a
 * placement — the mount resolver then decides what surface it lands on.
 */
export function PlacementPlane() {
  const { floor, placing, placeAt, setPlacing } = useStore();
  const geom = useMemo(() => new THREE.PlaneGeometry(GEOM.LEN + 8, GEOM.WID + 8), []);
  if (!placing) return null;
  const spec = assetById(placing.type);
  const where = spec?.mount === 'wall' ? 'a wall' : spec?.mount.startsWith('ceiling') || spec?.mount === 'pendant'
    ? 'the ceiling above' : 'the floor';
  return (
    <>
      <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]}
        position={[GEOM.LEN / 2, yOf(floor) + 0.08, GEOM.WID / 2]}
        onClick={e => {
          e.stopPropagation();
          const { x, z } = e.point;
          // No fallback room. A tap on the apron outside the building used to be
          // filed into the living room, so a heater dropped on the lawn heated
          // g_liv and the reviewer flagged it forever.
          placeAt(floor, x, z, roomAt(floor, x, z));
        }}
        onPointerMissed={() => setPlacing(null)}>
        <meshBasicMaterial transparent opacity={0.06} color="#b8873f" depthWrite={false} />
      </mesh>
      {/* Below every UI layer and inert to the pointer: this is a caption, and a
          caption must never cover the button you are reaching for or eat a drag. */}
      <Html position={[GEOM.LEN / 2, yOf(floor) + 1.9, -1.6]} center zIndexRange={[8, 0]}
        style={{ pointerEvents: 'none' }}>
        <div className="placeHint">
          <b>{spec?.label ?? placing.type}</b> · mounts to {where}
        </div>
      </Html>
    </>
  );
}
