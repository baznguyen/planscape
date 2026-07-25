'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { traceForFloor } from '@/lib/model/planTrace';
import { BEAMS, GEOM } from '@/lib/model/building';
import { useStore } from '@/store/useStore';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/**
 * The architect's wall lines, dashed, floating just above the floor.
 * This is drawn from planTrace.ts — an independent transcription of the drawing —
 * so laying it over the model is a real check, not the model checking itself.
 */
export default function PlanOverlay() {
  const { floor, overlays } = useStore();

  const layers = useMemo(() => {
    const segs = traceForFloor(floor);
    const build = (list: typeof segs, y: number) => {
      const pts: THREE.Vector3[] = [];
      for (const s of list) {
        pts.push(new THREE.Vector3(s.x1, y, s.z1), new THREE.Vector3(s.x2, y, s.z2));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      // computeLineDistances needs the per-vertex distance attribute for dashes
      const d: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        d.push(0, pts[i].distanceTo(pts[i + 1]));
      }
      g.setAttribute('lineDistance', new THREE.Float32BufferAttribute(d, 1));
      return g;
    };
    const y = yOf(floor) + 1.42;   // waist height: reads clearly over furniture
    return {
      external: build(segs.filter(s => s.kind === 'external'), y),
      internal: build(segs.filter(s => s.kind === 'internal'), y),
      open: build(segs.filter(s => s.kind === 'open'), y),
      beams: build(
        BEAMS.filter(b => b.floor === floor).map(b => ({ ...b, kind: 'beam' as const, note: '' })),
        y),
    };
  }, [floor]);

  if (!overlays.plan) return null;
  // depthTest off so the trace stays legible through walls — it is a check layer,
  // it is not meant to be occluded by the thing it is checking.
  return (
    <group renderOrder={40}>
      <lineSegments geometry={layers.external} frustumCulled={false}>
        <lineDashedMaterial color="#1b2733" dashSize={0.34} gapSize={0.2}
          transparent opacity={0.95} depthTest={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={layers.internal} frustumCulled={false}>
        <lineDashedMaterial color="#2f6db5" dashSize={0.22} gapSize={0.16}
          transparent opacity={0.9} depthTest={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={layers.open} frustumCulled={false}>
        <lineDashedMaterial color="#7d8794" dashSize={0.12} gapSize={0.18}
          transparent opacity={0.7} depthTest={false} fog={false} />
      </lineSegments>
      <lineSegments geometry={layers.beams} frustumCulled={false}>
        <lineDashedMaterial color="#c2622f" dashSize={0.5} gapSize={0.14}
          transparent opacity={0.85} depthTest={false} fog={false} />
      </lineSegments>
    </group>
  );
}

/** Downstand beams, so the plan's "BEAM OVER" reads as structure rather than a wall. */
export function Beams() {
  const { floor, showRoof } = useStore();
  const H = floor === 0 ? GEOM.H0 : GEOM.H1;
  if (!showRoof) return null;
  return <>{BEAMS.filter(b => b.floor === floor).map(b => {
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
    const L = Math.hypot(dx, dz);
    return (
      <mesh key={b.id} castShadow
        position={[(b.x1 + b.x2) / 2, yOf(floor) + H - b.drop / 2, (b.z1 + b.z2) / 2]}
        rotation={[0, -Math.atan2(dz, dx), 0]}>
        <boxGeometry args={[L, b.drop, 0.26]} />
        <meshStandardMaterial color="#e9e6df" roughness={0.9} />
      </mesh>
    );
  })}</>;
}
