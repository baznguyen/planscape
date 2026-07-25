'use client';
import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOMS, ALL_OPENINGS, WALLS, GEOM, roomCentre, roomHeight } from '@/lib/model/building';
import { WIND } from '@/lib/solvers/airflow';
import { outdoorTemp } from '@/lib/solvers/sun';
import { useStore } from '@/store/useStore';
import { tempColour } from './Scene';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);
const N = 520;                       // streamline dashes in flight
const LIFE = 4.6;                    // seconds before a dash is recycled

interface Source {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  temp: number;
  spread: number;
}

/**
 * Animated airflow.
 *
 * Every dash is a real advected parcel: it is born at a source (an open opening,
 * an air-conditioning vent or a heater), carries the temperature of the air at
 * that source, and is coloured by it. Buoyancy lifts warm parcels and drops cold
 * ones, so heater plumes rise and A/C supply air falls the way they actually do.
 *
 * Instanced boxes rather than gl.POINTS or GL lines: point size and line width are
 * both driver-clamped, and a stretched box gives the streak shape for free.
 */
export default function Airflow() {
  const { floor, overlays, month, minutes, openIds, hvacOn, setpointCool, setpointHeat, items, thermal } = useStore();
  const mesh = useRef<THREE.InstancedMesh>(null);

  const Tout = outdoorTemp(month, minutes);
  // ambient the buoyancy term is measured against
  const meanT = useMemo(() => {
    const v = Object.values(thermal);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Tout;
  }, [thermal, Tout]);

  // ---- sources ------------------------------------------------------------------
  const sources = useMemo<Source[]>(() => {
    const [bearing, speed] = WIND[month];
    // meteorological bearing = where the wind comes FROM
    const rad = ((bearing + 180) * Math.PI) / 180;
    const wind = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad)).normalize();
    const out: Source[] = [];

    // 1. open windows, doors and sliders — infiltration driven by wind pressure
    for (const o of ALL_OPENINGS) {
      if (o.floor !== floor) continue;
      if (!openIds.has(o.id)) continue;
      if (o.kind === 'cased') continue;
      const wall = WALLS.find(w => w.id === o.wallId);
      const external = wall?.external ?? false;
      // outward normal of the wall this opening sits in
      let n = new THREE.Vector3(1, 0, 0);
      if (wall) {
        const dx = wall.x2 - wall.x1, dz = wall.z2 - wall.z1;
        n = new THREE.Vector3(-dz, 0, dx).normalize();
      }
      // windward faces blow in, leeward faces draw out
      const facing = n.dot(wind);
      const dir = external ? (facing < 0 ? n.clone().multiplyScalar(-1) : n.clone()) : n.clone();
      const v = Math.max(0.35, Math.abs(facing)) * speed * (external ? 0.42 : 0.22);
      const temp = external ? Tout : (thermal[o.a ?? ''] ?? Tout);
      out.push({
        x: o.x, y: yOf(floor) + o.sill + o.h * 0.5, z: o.z,
        vx: dir.x * v, vy: 0, vz: dir.z * v,
        temp, spread: o.w * 0.45,
      });
    }

    // 2. air-conditioning supply. The plan notes two A/C units ducted to ceiling
    //    vents, so supply air enters at ceiling level and falls.
    if (hvacOn) {
      for (const r of ROOMS) {
        if (r.floor !== floor || r.outdoor || r.void) continue;
        if (r.use === 'garage' || r.use === 'store') continue;
        const c = roomCentre(r);
        const roomT = thermal[r.id] ?? 24;
        // cooling below the cool setpoint, heating above the heat setpoint
        const cooling = roomT > setpointCool;
        const supply = cooling ? setpointCool - 8 : setpointHeat + 12;
        out.push({
          x: c.x, y: yOf(r.floor) + roomHeight(r) - 0.15, z: c.z,
          vx: 0, vy: cooling ? -0.55 : -0.2, vz: 0,
          temp: supply, spread: 0.5,
        });
      }
    }

    // 3. user-placed heaters — a warm buoyant plume off the top of the unit
    for (const it of items) {
      if (it.floor !== floor || !it.on) continue;
      if (it.kind === 'heater') {
        out.push({
          x: it.x, y: yOf(floor) + 0.45, z: it.z,
          vx: 0, vy: 0.62 + it.power * 0.1, vz: 0,
          temp: 34 + it.power * 6, spread: 0.35,
        });
      } else if (it.kind === 'vent') {
        out.push({
          x: it.x, y: it.y || yOf(floor) + 2.5, z: it.z,
          vx: 0, vy: -0.5, vz: 0,
          temp: hvacOn ? setpointCool - 8 : (thermal[it.room] ?? 24), spread: 0.4,
        });
      }
    }
    return out;
  }, [floor, month, openIds, hvacOn, setpointCool, setpointHeat, items, thermal, Tout]);

  // ---- particle pool ------------------------------------------------------------
  const pool = useMemo(() => ({
    pos: new Float32Array(N * 3),
    vel: new Float32Array(N * 3),
    age: new Float32Array(N),
    temp: new Float32Array(N),
  }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  const respawn = (i: number, jitterAge: boolean) => {
    if (!sources.length) { pool.age[i] = -1; return; }
    const s = sources[(Math.floor(i * 2654435761) >>> 0) % sources.length];
    pool.pos[i * 3] = s.x + (rand(i * 3 + 1) - 0.5) * s.spread;
    pool.pos[i * 3 + 1] = s.y + (rand(i * 3 + 2) - 0.5) * s.spread * 0.6;
    pool.pos[i * 3 + 2] = s.z + (rand(i * 3 + 3) - 0.5) * s.spread;
    pool.vel[i * 3] = s.vx; pool.vel[i * 3 + 1] = s.vy; pool.vel[i * 3 + 2] = s.vz;
    pool.temp[i] = s.temp;
    pool.age[i] = jitterAge ? rand(i) * LIFE : 0;
  };

  // cheap deterministic hash so the field does not reshuffle every render
  const rand = (n: number) => {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };

  useLayoutEffect(() => {
    for (let i = 0; i < N; i++) respawn(i, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  useFrame((_, dtRaw) => {
    const im = mesh.current;
    if (!im || !overlays.air) return;
    const dt = Math.min(dtRaw, 0.06);
    const yBase = yOf(floor);
    const ceil = yBase + (floor === 0 ? GEOM.H0 : GEOM.H1);

    for (let i = 0; i < N; i++) {
      if (pool.age[i] < 0) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); continue; }
      pool.age[i] += dt;
      if (pool.age[i] > LIFE) respawn(i, false);

      const k = i * 3;
      // buoyancy: warm parcels rise, cold parcels sink. 1/300 ~ 1/T in kelvin.
      const dT = pool.temp[i] - meanT;
      pool.vel[k + 1] += (dT / 300) * 9.81 * dt * 0.5;
      // drag towards a gentle terminal speed so streaks stay readable
      pool.vel[k] *= 1 - 0.55 * dt;
      pool.vel[k + 1] *= 1 - 0.85 * dt;
      pool.vel[k + 2] *= 1 - 0.55 * dt;

      pool.pos[k] += pool.vel[k] * dt;
      pool.pos[k + 1] += pool.vel[k + 1] * dt;
      pool.pos[k + 2] += pool.vel[k + 2] * dt;

      // bounce off floor and ceiling, and recycle anything that leaves the envelope
      if (pool.pos[k + 1] < yBase + 0.08) { pool.pos[k + 1] = yBase + 0.08; pool.vel[k + 1] *= -0.25; }
      if (pool.pos[k + 1] > ceil - 0.06) { pool.pos[k + 1] = ceil - 0.06; pool.vel[k + 1] *= -0.25; }
      if (pool.pos[k] < -2 || pool.pos[k] > GEOM.LEN + 2 ||
          pool.pos[k + 2] < -2 || pool.pos[k + 2] > GEOM.WID + 2) respawn(i, false);

      // orient the dash along its velocity and stretch it by speed
      const vx = pool.vel[k], vy = pool.vel[k + 1], vz = pool.vel[k + 2];
      const sp = Math.hypot(vx, vy, vz);
      dummy.position.set(pool.pos[k], pool.pos[k + 1], pool.pos[k + 2]);
      if (sp > 1e-4) dummy.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(vx / sp, vy / sp, vz / sp));
      const fade = Math.sin((pool.age[i] / LIFE) * Math.PI);   // fade in and out
      dummy.scale.set(0.16 + sp * 0.5, 0.032, 0.032);
      dummy.scale.multiplyScalar(0.35 + fade);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.copy(tempColour(pool.temp[i]));
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  if (!overlays.air) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined as any, undefined as any, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.85} depthWrite={false} />
    </instancedMesh>
  );
}
