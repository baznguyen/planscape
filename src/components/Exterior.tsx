'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { GEOM, ALL_OPENINGS, WALLS } from '@/lib/model/building';
import { LEVELS, CLADDING, CLADDING_BANDS } from '@/lib/model/facade';
import Roof from './Roof';
import { useStore } from '@/store/useStore';

const M = { brick:'#e6d9c8', render:'#f2efe8', clad:'#e2ddd2', roof:'#b9bec3', wood:'#c2a074',
  glass:'#bfe0ec', metal:'#cfd2d5', grass:'#9cc76f', road:'#b0b3b6', path:'#d6d3cb',
  bed:'#8a7a52', hedge:'#74ab55', trunk:'#b59a74', water:'#5bb4d0', ghost:'#ccd1d6' };

const Box = ({ w,h,d,c,p,r,info,edge=true,soft=false,transparent=false,opacity=1 }:
  { w:number;h:number;d:number;c:string;p:[number,number,number];r?:[number,number,number];info?:string;edge?:boolean;soft?:boolean;transparent?:boolean;opacity?:number }) => (
  <mesh position={p} rotation={r} castShadow receiveShadow userData={info?{info}:undefined}>
    <boxGeometry args={[w,h,d]}/><meshStandardMaterial color={c} roughness={0.85} transparent={transparent} opacity={opacity}/>
    {edge && <Edges color={soft?'#777a7e':'#2b2b29'} threshold={20}/>}
  </mesh>);
/**
 * Context buildings. Shown quiet rather than ghosted: at 0.28 opacity with
 * depthWrite off, every internal edge of every neighbour showed through every
 * other one and the street read as a lattice of glass boxes — which looks like
 * a rendering fault, not a drafting convention. Solid, pale and desaturated
 * says "not the subject" without saying "broken".
 */
const Ghost = ({ w,h,d,p,r }: { w:number;h:number;d:number;p:[number,number,number];r?:[number,number,number] }) => (
  <mesh position={p} rotation={r} castShadow receiveShadow>
    <boxGeometry args={[w,h,d]}/>
    <meshStandardMaterial color={M.ghost} roughness={1} transparent opacity={0.92}/>
    <Edges color="#9aa0a6" threshold={26}/>
  </mesh>);
const Tree = ({ x,z,h=5.5 }: { x:number;z:number;h?:number }) => (
  <group position={[x,0,z]}>
    <mesh position={[0,h*0.21,0]} castShadow><cylinderGeometry args={[0.13,0.17,h*0.42,10]}/>
      <meshStandardMaterial color={M.trunk} roughness={1}/></mesh>
    <mesh position={[0,h*0.56,0]} castShadow><icosahedronGeometry args={[h*0.36,0]}/>
      <meshStandardMaterial color="#6fa84e" roughness={1}/></mesh>
  </group>);
const Neighbour = ({ x,z,w,d,h,ry }: { x:number;z:number;w:number;d:number;h:number;ry?:number }) => (
  <group position={[x,0,z]} rotation={[0,ry??0,0]}>
    <Ghost w={w} h={h} d={d} p={[0,h/2,0]}/>
    <Ghost w={w+0.3} h={0.25} d={d+0.3} p={[0,h+0.12,0]}/>
    <Ghost w={w*0.6} h={h*0.5} d={d*0.6} p={[0,h+0.3,0]}/>
  </group>);

/** The subject dwelling as built massing, with the plan's real facade materials. */
/**
 * The subject dwelling, built from the elevation sheets.
 *
 * Storeys are set by the surveyed RLs rather than by a nominal ceiling height,
 * cladding comes from the elevation KEY block, and every opening is the one in
 * the model's own schedule — so a window moved on the plan moves on the facade
 * too, instead of the two drifting apart.
 */
function Subject() {
  const { LEN, WID } = GEOM;
  const F1 = { x0: 6.6, x1: 27.58, z0: 0.72, z1: 10.28 };
  const g = CLADDING;

  /** One storey of one face, in its scheduled cladding. */
  const Face = ({ face, storey }: { face: 'N'|'S'|'E'|'W'; storey: 0|1 }) => {
    const y0 = storey === 0 ? LEVELS.groundFfl : LEVELS.firstFfl;
    const y1 = storey === 0 ? LEVELS.groundFcl : LEVELS.firstFcl;
    const h = y1 - y0;
    const bands = CLADDING_BANDS.filter(b => b.face === face && b.storey === storey);
    const box = storey === 0
      ? { x0: 6.6, x1: 28.03, z0: 0, z1: WID }
      : F1;
    const along = face === 'N' || face === 'S' ? box.x1 - box.x0 : box.z1 - box.z0;
    return (<group>
      {bands.map((b, i) => {
        const len = along * (b.to - b.from);
        const mid = (face === 'N' || face === 'S')
          ? box.x0 + along * (b.from + b.to) / 2
          : box.z0 + along * (b.from + b.to) / 2;
        const m = g[b.material];
        const p: [number, number, number] =
          face === 'N' ? [mid, y0 + h / 2, box.z1] :
          face === 'S' ? [mid, y0 + h / 2, box.z0] :
          face === 'E' ? [box.x1, y0 + h / 2, mid] : [box.x0, y0 + h / 2, mid];
        const w = (face === 'N' || face === 'S') ? len : 0.22;
        const d = (face === 'N' || face === 'S') ? 0.22 : len;
        return <Box key={i} w={w} h={h} d={d} c={m.colour} p={p} info={m.label} />;
      })}
    </group>);
  };

  /**
   * The first floor SLAB EDGE.
   *
   * Face() draws storey 0 from FFL 0 to FCL 2.740 and storey 1 from FFL 3.040 to
   * FCL 5.630 — which leaves the 300 mm of floor structure between them drawn by
   * nothing at all. From the street that is an open slot running the full length
   * of the house: you see daylight straight through the building at first floor
   * level. That is the "gap in the ceiling".
   *
   * It is a real element, not a patch: the edge of the suspended slab, expressed
   * on the elevations as a shadow line under the upper storey.
   */
  const SlabEdge = () => {
    const y0 = LEVELS.groundFcl, y1 = LEVELS.firstFfl;
    const h = y1 - y0, y = y0 + h / 2;
    const m = g.renderSecond;
    const runs: { w: number; d: number; p: [number, number, number] }[] = [
      { w: F1.x1 - F1.x0 + 0.24, d: 0.24, p: [(F1.x0 + F1.x1) / 2, y, F1.z1] },
      { w: F1.x1 - F1.x0 + 0.24, d: 0.24, p: [(F1.x0 + F1.x1) / 2, y, F1.z0] },
      { w: 0.24, d: F1.z1 - F1.z0, p: [F1.x1, y, (F1.z0 + F1.z1) / 2] },
      { w: 0.24, d: F1.z1 - F1.z0, p: [F1.x0, y, (F1.z0 + F1.z1) / 2] },
    ];
    return (<group>
      {runs.map((r, i) => (
        <Box key={i} w={r.w} h={h} d={r.d} c={m.colour} p={r.p}
          info="First floor slab edge, 300 mm" />
      ))}
    </group>);
  };

  /**
   * The single-storey parts of the ground floor plate run past the first floor
   * footprint. Without a lid they are open boxes seen from the street, so the
   * flat roof over each is drawn here — the same thing the plan shows as a
   * concealed-gutter roof over the porch and the rear.
   */
  const LowerLids = () => {
    const y = LEVELS.groundFcl + 0.08;
    const lids: { w: number; d: number; p: [number, number, number] }[] = [
      { w: 28.03 - 6.6, d: F1.z0, p: [(6.6 + 28.03) / 2, y, F1.z0 / 2] },
      { w: 28.03 - 6.6, d: GEOM.WID - F1.z1, p: [(6.6 + 28.03) / 2, y, (F1.z1 + GEOM.WID) / 2] },
      { w: 28.03 - F1.x1, d: F1.z1 - F1.z0, p: [(F1.x1 + 28.03) / 2, y, (F1.z0 + F1.z1) / 2] },
    ];
    return (<group>
      {lids.filter(l => l.w > 0.05 && l.d > 0.05).map((l, i) => (
        <Box key={i} w={l.w} h={0.16} d={l.d} c={g.renderFirst.colour} p={l.p}
          info="Roof over single storey" />
      ))}
    </group>);
  };

  /** Openings punched into the facade from the model's own schedule. */
  const Glazing = () => (<group>
    {ALL_OPENINGS.filter(o => {
      const w = WALLS.find(x => x.id === o.wallId);
      return w?.external || o.kind === 'garage';
    }).map(o => {
      const w = WALLS.find(x => x.id === o.wallId);
      const horiz = w ? Math.abs(w.z1 - w.z2) < 1e-6 : true;
      const base = o.floor === 0 ? LEVELS.groundFfl : LEVELS.firstFfl;
      const y = base + o.sill + o.h / 2;
      const isGlass = o.kind === 'window' || o.kind === 'slider';
      const col = o.kind === 'garage' ? M.wood : isGlass ? M.glass : M.wood;
      // Push the sash out to the OUTER face of the cladding. Left on the wall
      // centreline it sits inside the 220 mm build-up and is invisible from the
      // street, which is exactly why the facade read blank.
      const cx = 17.3, cz = GEOM.WID / 2;
      const off = 0.13;
      const ox = horiz ? 0 : Math.sign(o.x - cx) * off;
      const oz = horiz ? Math.sign(o.z - cz) * off : 0;
      return (
        <group key={o.id}>
          {/* Glass here matches the interior Openings() pane (Scene.tsx) — opaque,
              this was the reason the facade never showed anything happening inside. */}
          <Box w={horiz ? o.w : 0.05} h={o.h} d={horiz ? 0.05 : o.w}
            c={col} p={[o.x + ox, y, o.z + oz]} edge={false}
            transparent={isGlass} opacity={isGlass ? 0.35 : 1}
            info={`${o.kind} ${(o.w * 1000).toFixed(0)} × ${(o.h * 1000).toFixed(0)}`} />
          {[o.h / 2 + 0.045, -o.h / 2 - 0.045].map((dy, k) => (
            <Box key={k} w={horiz ? o.w + 0.14 : 0.09} h={0.09} d={horiz ? 0.09 : o.w + 0.14}
              c={M.render} p={[o.x + ox, y + dy, o.z + oz]} edge={false} />
          ))}
          {[-1, 1].map(sgn => (
            <Box key={sgn} w={horiz ? 0.08 : 0.09} h={o.h + 0.18} d={horiz ? 0.09 : 0.08}
              c={M.render} edge={false}
              p={[o.x + ox + (horiz ? sgn * (o.w / 2 + 0.04) : 0), y,
                  o.z + oz + (horiz ? 0 : sgn * (o.w / 2 + 0.04))]} />
          ))}
        </group>
      );
    })}
  </group>);

  return (<group>
    {(['N','S','E','W'] as const).map(f => (
      <group key={f}><Face face={f} storey={0} /><Face face={f} storey={1} /></group>
    ))}
    <SlabEdge />
    <LowerLids />
    <Glazing />
    <Roof />

    {/* porch: piers, roof and the entry threshold */}
    <Box w={2.1} h={0.16} d={3.0} c={M.render} p={[27.0, LEVELS.groundFcl, 5.0]} info="Porch roof" />
    {[3.7, 6.3].map(z => (
      <Box key={z} w={0.2} h={LEVELS.groundFcl} d={0.2} c={M.render}
        p={[27.9, LEVELS.groundFcl / 2, z]} info="Rendered porch pier" />
    ))}
    {/* cantilevered balcony, 4.44 m2, with a glass balustrade */}
    <Box w={1.5} h={0.16} d={3.1} c={M.render} p={[26.8, LEVELS.firstFfl - 0.08, 4.5]}
      info="Cantilevered balcony 4.44 m²" />
    <mesh position={[27.55, LEVELS.firstFfl + 0.5, 4.5]} rotation={[0, Math.PI / 2, 0]}>
      <boxGeometry args={[3.1, 1.0, 0.04]} />
      <meshStandardMaterial color={M.glass} transparent opacity={0.3} roughness={0.05} /></mesh>

    {/* downpipes at the corners, as the elevations show */}
    {[[6.7, 0.15], [6.7, 10.85], [27.9, 0.15], [27.9, 10.85]].map(([x, z], i) => (
      <Box key={i} w={0.09} h={LEVELS.firstFcl} d={0.09} c={M.metal}
        p={[x, LEVELS.firstFcl / 2, z]} edge={false} info="90 mm downpipe" />
    ))}
  </group>);
}

/** Landscaping — visible from the street AND through the windows from inside. */
export function Garden() {
  /** Boundary hedge positions, minus whatever the crossovers need clear. */
  const hedge = useMemo(() => {
    const gaps = ALL_OPENINGS
      .filter(o => o.floor === 0 && (o.kind === 'garage' || o.id === 'd_entry'))
      .map(o => ({
        z: o.z,
        // a car needs more than the door width to swing into a bay off a
        // driveway; a person needs a path
        half: o.w / 2 + (o.kind === 'garage' ? 1.3 : 0.7),
      }));
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      const z = -1 + i * 1.1;
      if (gaps.some(g => Math.abs(z - g.z) < g.half)) continue;
      out.push(z);
    }
    return out;
  }, []);
  const shrubs = useMemo(() => {
    const s: [number,number,number][] = [];
    for (let z=0.8; z<3.4; z+=1.1) s.push([28.9,z,0.45]);
    for (let x=8; x<26; x+=2.6) { s.push([x,11.5,0.45]); s.push([x,-0.5,0.45]); }
    for (let z=1; z<10; z+=1.8) s.push([-0.6,z,0.4]);
    return s;
  }, []);
  return (<group>
    <mesh position={[29.6,0.045,5.0]} receiveShadow><boxGeometry args={[1.4,0.06,6.2]}/>
      <meshStandardMaterial color={M.path}/></mesh>
    <mesh position={[31.0,0.04,8.6]} receiveShadow><boxGeometry args={[5.6,0.06,4.9]}/>
      <meshStandardMaterial color="#cfd0d1"/></mesh>
    <mesh position={[28.9,0.07,1.8]} receiveShadow><boxGeometry args={[1.2,0.14,3.4]}/>
      <meshStandardMaterial color={M.bed}/></mesh>
    <mesh position={[-4.0,0.18,5.4]} receiveShadow><boxGeometry args={[6.4,0.35,4.4]}/>
      <meshStandardMaterial color={M.water} roughness={0.15} metalness={0.2} transparent opacity={0.85}/></mesh>
    <mesh position={[-4.0,0.05,5.4]} receiveShadow><boxGeometry args={[7.6,0.1,5.6]}/>
      <meshStandardMaterial color={M.path}/></mesh>
    {shrubs.map(([x,z,r],i)=>(
      <mesh key={i} position={[x,r*0.8,z]} castShadow><icosahedronGeometry args={[r,0]}/>
        <meshStandardMaterial color={M.hedge} roughness={1}/></mesh>))}
    {/**
      * The front boundary hedge, with the crossovers cut out of it.
      *
      * It used to be twelve blocks marched straight down the boundary from
      * z = -1 to z = 11.1, which put a metre-high hedge across the mouth of the
      * driveway. Nobody drawing this by hand would do that; the hedge stops
      * where the vehicles and the people cross it, and it is the openings that
      * say where. So the gaps are taken from the model — the garage door's own
      * width plus a manoeuvring margin, and the front door's path — rather than
      * typed in, which means they stay right when the plan changes.
      */}
    {hedge.map((z,i)=>(
      <mesh key={`h${i}`} position={[33.6,0.45,z]} castShadow><boxGeometry args={[0.55,0.9,1.02]}/>
        <meshStandardMaterial color={M.hedge} roughness={1}/></mesh>))}
    <Tree x={31.5} z={13.2} h={5.4}/><Tree x={31.8} z={-2.6} h={6.0}/>
    <Tree x={-7.5} z={1.6} h={5.2}/><Tree x={-7.8} z={9.4} h={5.6}/>
    <Tree x={12} z={14.0} h={5.4}/><Tree x={21} z={-3.6} h={5.2}/>
  </group>);
}
export default function Exterior() {
  const { view } = useStore();
  if (view !== 'street') return null;
  return (<group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[14,-0.05,5.5]} receiveShadow>
      <planeGeometry args={[260,260]}/><meshStandardMaterial color={M.grass}/></mesh>
    <Subject/><Garden/>
    <mesh position={[39.5,0.02,5.5]} receiveShadow><boxGeometry args={[9,0.05,140]}/>
      <meshStandardMaterial color={M.road}/></mesh>
    <mesh position={[34.8,0.095,5.5]} receiveShadow><boxGeometry args={[0.3,0.19,140]}/>
      <meshStandardMaterial color={M.path}/></mesh>
    {[-3,-2,-1,1,2,3].map(i=>(
      <Neighbour key={i} x={49+(Math.abs(i)%2?1.5:0)} z={5.5+i*15} w={10} d={11}
                 h={4.8+(i%2?1.6:0)} ry={Math.PI}/>))}
    <Neighbour x={17} z={24} w={20} d={11} h={6.5}/>
    <Neighbour x={17} z={-13} w={20} d={11} h={6.2}/>
    {Array.from({length:9}).map((_,i)=>(<group key={`t${i}`}>
      <Tree x={32.9} z={-50+i*14} h={5.6}/><Tree x={48} z={-44+i*14} h={6.2}/></group>))}
    {/* true north indicator */}
    <group position={[34,0,-14]}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.2,0]}>
        <coneGeometry args={[0.85,3.2,3]}/><meshStandardMaterial color="#d9534f"/></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.15,0]}>
        <torusGeometry args={[2.9,0.11,8,40]}/><meshStandardMaterial color="#3a3d42"/></mesh>
    </group>
  </group>);
}
