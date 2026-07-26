'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { GEOM } from '@/lib/model/building';
import { LEVELS, ROOF, riseFor } from '@/lib/model/facade';

const C = {
  sheet: '#b4b9bd',        // Colorbond roof sheet
  fascia: '#9aa0a5',       // Colorbond fascia and gutter
  soffit: '#efece6',       // fibre cement eaves lining, paint finish
  capping: '#a8aeb3',
  render: '#efece4',
  solar: '#1e2a35',
};

/**
 * A hipped roof plane set over a rectangular plate.
 *
 * Built from four trapezoids rather than a box, because the whole point of
 * drawing the roof from the elevations is that the pitch and the ridge are real
 * — a flat slab hides exactly the thing the elevations are there to fix.
 */
function HipRoof({
  x0, x1, z0, z1, eaveY, pitchDeg, overhang, colour = C.sheet,
}: {
  x0: number; x1: number; z0: number; z1: number;
  eaveY: number; pitchDeg: number; overhang: number; colour?: string;
}) {
  const geo = useMemo(() => {
    const ax0 = x0 - overhang, ax1 = x1 + overhang;
    const az0 = z0 - overhang, az1 = z1 + overhang;
    const spanZ = az1 - az0, spanX = ax1 - ax0;
    // hip along the long axis; the ridge sits over the centre line of the short span
    const alongX = spanX >= spanZ;
    const halfSpan = (alongX ? spanZ : spanX) / 2;
    const rise = halfSpan * riseFor(pitchDeg);
    const ridgeY = eaveY + rise;
    const inset = halfSpan;                       // 45 degree hip ends in plan
    const rx0 = alongX ? ax0 + inset : (ax0 + ax1) / 2;
    const rx1 = alongX ? ax1 - inset : (ax0 + ax1) / 2;
    const rz0 = alongX ? (az0 + az1) / 2 : az0 + inset;
    const rz1 = alongX ? (az0 + az1) / 2 : az1 - inset;

    const v: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
    const A = [ax0, eaveY, az0], B = [ax1, eaveY, az0];
    const D = [ax1, eaveY, az1], E = [ax0, eaveY, az1];
    const R0 = [rx0, ridgeY, rz0], R1 = [rx1, ridgeY, rz1];
    // two main planes and two hip ends
    tri(A, B, R1); tri(A, R1, R0);
    tri(E, R0, R1); tri(E, R1, D);
    tri(A, R0, E);
    tri(B, D, R1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, [x0, x1, z0, z1, eaveY, pitchDeg, overhang]);

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={colour} roughness={0.62} metalness={0.25}
        side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Skillion — one plane falling from a high side to a low side. */
function Skillion({
  x0, x1, z0, z1, lowY, pitchDeg, fallAlong = 'x', colour = C.sheet,
}: {
  x0: number; x1: number; z0: number; z1: number;
  lowY: number; pitchDeg: number; fallAlong?: 'x' | 'z'; colour?: string;
}) {
  const geo = useMemo(() => {
    const run = fallAlong === 'x' ? x1 - x0 : z1 - z0;
    const hi = lowY + run * riseFor(pitchDeg);
    const p = fallAlong === 'x'
      ? [[x0, hi, z0], [x1, lowY, z0], [x1, lowY, z1], [x0, hi, z1]]
      : [[x0, hi, z0], [x1, hi, z0], [x1, lowY, z1], [x0, lowY, z1]];
    const v = [...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, [x0, x1, z0, z1, lowY, pitchDeg, fallAlong]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={colour} roughness={0.62} metalness={0.25} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Colorbond fascia, quad gutter and the fibre cement soffit under the eave. */
function Eave({ x0, x1, z0, z1, y, overhang }: {
  x0: number; x1: number; z0: number; z1: number; y: number; overhang: number;
}) {
  const ax0 = x0 - overhang, ax1 = x1 + overhang, az0 = z0 - overhang, az1 = z1 + overhang;
  const runs: { p: [number, number, number]; w: number; d: number }[] = [
    { p: [(ax0 + ax1) / 2, y, az0], w: ax1 - ax0, d: 0.06 },
    { p: [(ax0 + ax1) / 2, y, az1], w: ax1 - ax0, d: 0.06 },
    { p: [ax0, y, (az0 + az1) / 2], w: 0.06, d: az1 - az0 },
    { p: [ax1, y, (az0 + az1) / 2], w: 0.06, d: az1 - az0 },
  ];
  // The soffit is the underside of the OVERHANG — a ring, not a plate. Drawn as a
  // full plate it became a 28 m ceiling slab hanging at 5.55, which is BELOW the
  // first floor ceiling at 5.63, so it sliced through the head of every external
  // wall and read from the street as a dark slot under the roof.
  const sy = y - 0.03;
  const soffits: { p: [number, number, number]; w: number; d: number }[] = [
    { p: [(ax0 + ax1) / 2, sy, az0 + overhang / 2], w: ax1 - ax0, d: overhang },
    { p: [(ax0 + ax1) / 2, sy, az1 - overhang / 2], w: ax1 - ax0, d: overhang },
    { p: [ax0 + overhang / 2, sy, (az0 + az1) / 2], w: overhang, d: az1 - az0 - overhang * 2 },
    { p: [ax1 - overhang / 2, sy, (az0 + az1) / 2], w: overhang, d: az1 - az0 - overhang * 2 },
  ];
  return (
    <group>
      {soffits.map((s, i) => (
        <mesh key={`sf${i}`} position={s.p} receiveShadow>
          <boxGeometry args={[s.w, 0.02, s.d]} />
          <meshStandardMaterial color={C.soffit} roughness={0.95} />
        </mesh>
      ))}
      {runs.map((r, i) => (
        <group key={i}>
          <mesh position={[r.p[0], y - ROOF.fasciaDepthM / 2, r.p[2]]} castShadow>
            <boxGeometry args={[r.w, ROOF.fasciaDepthM, r.d]} />
            <meshStandardMaterial color={C.fascia} roughness={0.5} metalness={0.3} />
            <Edges color="#6f757a" threshold={25} />
          </mesh>
          <mesh position={[r.p[0], y - ROOF.fasciaDepthM - ROOF.gutterDepthM / 2 + 0.02, r.p[2]]}>
            <boxGeometry args={[r.w + 0.02, ROOF.gutterDepthM, r.d + 0.02]} />
            <meshStandardMaterial color={C.fascia} roughness={0.45} metalness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The whole roof, from the elevation sheets.
 *
 * Main hip at 12.6° over the first floor plate, a parapet to the street with the
 * 5° sheet hidden behind it, 20° over the single-storey rear and the alfresco,
 * and a 2° trim deck over the balcony.
 */
export default function Roof() {
  const F1 = { x0: 6.6, x1: 27.58, z0: 0.72, z1: 10.28 };
  const eaveY = LEVELS.firstFcl + 0.10;
  const parapetTop = LEVELS.firstFcl + ROOF.parapetRiseM;

  return (
    <group>
      {/* main hip over the first floor */}
      <HipRoof {...F1} eaveY={eaveY} pitchDeg={ROOF.mainPitchDeg} overhang={ROOF.eaveOverhangM} />
      <Eave {...F1} y={eaveY} overhang={ROOF.eaveOverhangM} />

      {/* street parapet with Colorbond capping, and the 5 degree sheet behind it */}
      <mesh position={[F1.x1 + 0.06, LEVELS.firstFcl + ROOF.parapetRiseM / 2, (F1.z0 + F1.z1) / 2]}
        castShadow receiveShadow>
        <boxGeometry args={[0.24, ROOF.parapetRiseM, F1.z1 - F1.z0 + 0.5]} />
        <meshStandardMaterial color={C.render} roughness={0.85} />
        <Edges color="#2b2b29" threshold={20} />
      </mesh>
      <mesh position={[F1.x1 + 0.06, parapetTop + ROOF.cappingThickM / 2, (F1.z0 + F1.z1) / 2]}>
        <boxGeometry args={[0.32, ROOF.cappingThickM, F1.z1 - F1.z0 + 0.58]} />
        <meshStandardMaterial color={C.capping} roughness={0.45} metalness={0.4} />
      </mesh>
      <Skillion x0={F1.x1 - 3.2} x1={F1.x1} z0={F1.z0} z1={F1.z1}
        lowY={LEVELS.firstFcl + 0.06} pitchDeg={ROOF.behindParapetDeg} fallAlong="x" />

      {/* single-storey rear: 20 degrees, falling away from the two-storey wall */}
      <Skillion x0={0} x1={6.6} z0={2.9} z1={7.8}
        lowY={LEVELS.groundFcl + 0.16} pitchDeg={ROOF.rearPitchDeg} fallAlong="z" />
      <Eave x0={0} x1={6.6} z0={2.9} z1={7.8} y={LEVELS.groundFcl + 0.16} overhang={0.25} />

      {/* trim deck over the balcony, 2 degrees */}
      <Skillion x0={25.9} x1={27.7} z0={2.9} z1={6.1}
        lowY={LEVELS.firstFcl + 0.02} pitchDeg={ROOF.trimDeckDeg} fallAlong="x" />

      {/* whirly bird and the solar array the elevation notes at ~6.6 kW */}
      <group position={[16.5, eaveY + 0.85, 7.4]}>
        <mesh castShadow><cylinderGeometry args={[0.17, 0.17, 0.24, 14]} />
          <meshStandardMaterial color={C.fascia} metalness={0.5} roughness={0.35} /></mesh>
        <mesh position={[0, 0.16, 0]}><coneGeometry args={[0.19, 0.12, 14]} />
          <meshStandardMaterial color={C.fascia} metalness={0.5} roughness={0.3} /></mesh>
      </group>
      {Array.from({ length: 4 }).map((_, r) => Array.from({ length: 4 }).map((_, cIdx) => (
        <mesh key={`${r}${cIdx}`} castShadow
          position={[11.4 + cIdx * 1.75, eaveY + 0.34 + r * 0.02, 2.6 + r * 1.08]}
          rotation={[-(ROOF.mainPitchDeg * Math.PI) / 180, 0, 0]}>
          <boxGeometry args={[1.65, 0.035, 1.0]} />
          <meshStandardMaterial color={C.solar} roughness={0.28} metalness={0.5} />
        </mesh>
      )))}
    </group>
  );
}
