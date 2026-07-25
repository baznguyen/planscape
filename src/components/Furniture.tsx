'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { ROOMS, GEOM, STAIRS, roomHeight, roomCentre, type Room } from '@/lib/model/building';
import { doorZones, blockedFraction } from '@/lib/model/clearance';
import { useStore } from '@/store/useStore';

const y0 = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);
const C = { light:'#f4f2ee', mid:'#e4ded4', wood:'#cbb593', dark:'#b9bec3', black:'#3a3d42',
  metal:'#cfd2d5', glass:'#bfe0ec', stone:'#e8e6e1', green:'#8fc46a', fabric:'#e8e8e5' };

function B({ w, h, d, c, p, r, edge = true }:
  { w:number; h:number; d:number; c:string; p:[number,number,number]; r?:[number,number,number]; edge?:boolean }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={c} roughness={0.8} />
      {edge && <Edges color="#2b2b29" threshold={20} />}
    </mesh>
  );
}
const Cyl = ({ r1, r2, h, c, p, rot }:
  { r1:number; r2:number; h:number; c:string; p:[number,number,number]; rot?:[number,number,number] }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow>
    <cylinderGeometry args={[r1, r2, h, 16]} />
    <meshStandardMaterial color={c} roughness={0.7} />
  </mesh>
);
/** four legs so nothing floats or looks sunk */
const Legs = ({ w, d, h, c = C.wood, inset = 0.09 }: { w:number; d:number; h:number; c?:string; inset?:number }) => (
  <>{[[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b],i)=>(
    <B key={i} w={0.05} h={h} d={0.05} c={c} p={[a*(w/2-inset), h/2, b*(d/2-inset)]} edge={false}/>))}</>
);
/* ---------------- pieces ---------------- */
const Sofa = ({ len = 2.4 }: { len?: number }) => { const s = 0.42; return (<group>
  <B w={len} h={0.12} d={0.9} c={C.light} p={[0, s-0.06, 0.03]}/>
  <Legs w={len} d={0.9} h={s-0.12} inset={0.1}/>
  {Array.from({length:Math.max(2,Math.round(len/0.9))}).map((_,i,a)=>(
    <B key={i} w={len/a.length-0.06} h={0.16} d={0.72} c={C.fabric} p={[(i-(a.length-1)/2)*(len/a.length), s+0.05, 0.05]}/>))}
  <B w={len} h={0.5} d={0.16} c={C.light} p={[0, s+0.28, -0.37]}/>
  {[-1,1].map(k=><B key={k} w={0.14} h={0.4} d={0.9} c={C.light} p={[k*(len/2-0.07), s+0.1, 0.03]}/>)}
</group>); };
const Chair = () => (<group>
  <B w={0.44} h={0.05} d={0.44} c={C.light} p={[0,0.46,0]}/>
  <Legs w={0.44} d={0.44} h={0.46} inset={0.05}/>
  <B w={0.44} h={0.5} d={0.05} c={C.light} p={[0,0.72,-0.19]}/>
</group>);
const Dining = ({ len = 2.0 }: { len?: number }) => (<group>
  <B w={len} h={0.05} d={0.95} c={C.wood} p={[0,0.75,0]}/>
  {[-1,1].map(a=>[-1,1].map(b=>(
    <B key={`${a}${b}`} w={0.07} h={0.73} d={0.07} c={C.wood} p={[a*(len/2-0.18),0.37,b*0.36]} edge={false}/>)))}
  {Array.from({length:Math.max(2,Math.floor(len/0.68))}).map((_,i,a)=>[-1,1].map(k=>(
    <group key={`${i}${k}`} position={[(i-(a.length-1)/2)*(len/a.length), 0, k*0.72]} rotation={[0,k>0?Math.PI:0,0]}><Chair/></group>)))}
</group>);
const Bed = ({ w = 1.5 }: { w?: number }) => (<group>
  <B w={w} h={0.26} d={2.0} c={C.wood} p={[0,0.2,0.02]}/>
  <Legs w={w} d={2.0} h={0.14} inset={0.12}/>
  <B w={w} h={0.7} d={0.12} c={C.light} p={[0,0.5,-1.0]}/>
  <B w={w-0.1} h={0.18} d={1.85} c={C.light} p={[0,0.42,0.06]}/>
  <B w={w-0.18} h={0.14} d={1.2} c={C.mid} p={[0,0.56,0.32]}/>
  {[-1,1].map(k=><B key={k} w={0.5} h={0.16} d={0.34} c={C.light} p={[k*(w/2-0.32),0.58,-0.66]}/>)}
  {[-1,1].map(k=>(<group key={`n${k}`}>
    <B w={0.46} h={0.44} d={0.4} c={C.light} p={[k*(w/2+0.34),0.29,-0.78]}/>
    <Cyl r1={0.13} r2={0.16} h={0.24} c={C.mid} p={[k*(w/2+0.34),0.72,-0.78]}/></group>))}
</group>);
const Robe = ({ len = 1.8 }: { len?: number }) => (<group>
  <B w={len} h={2.2} d={0.62} c={C.light} p={[0,1.1,0]}/>
  {Array.from({length:Math.max(2,Math.round(len/0.6))}).map((_,i,a)=>(
    <B key={i} w={0.02} h={2.05} d={0.02} c={C.metal} p={[-len/2+len/a.length*(i+0.5),1.1,0.32]} edge={false}/>))}
</group>);
const Desk = () => (<group>
  <B w={1.4} h={0.05} d={0.62} c={C.wood} p={[0,0.74,0]}/>
  {[-1,1].map(k=><B key={k} w={0.05} h={0.73} d={0.6} c={C.metal} p={[k*0.66,0.37,0]} edge={false}/>)}
  <B w={0.5} h={0.32} d={0.03} c={C.black} p={[0,1.05,-0.26]}/>
  <group position={[0,0,0.55]} rotation={[0,Math.PI,0]}><Chair/></group>
</group>);
const Tv = ({ size = 65 }: { size?: number }) => { const w = size*0.0221; return (<group>
  <B w={1.9} h={0.4} d={0.42} c={C.light} p={[0,0.26,0]}/>
  <Legs w={1.9} d={0.42} h={0.06} c={C.metal} inset={0.12}/>
  <B w={w} h={w*0.56} d={0.05} c={C.black} p={[0,0.95+w*0.28,-0.16]}/>
</group>); };
const Rug = ({ w = 2.8, d = 2.0 }: { w?:number; d?:number }) => (
  <mesh position={[0,0.012,0]} receiveShadow><boxGeometry args={[w,0.015,d]}/>
    <meshStandardMaterial color={C.mid} roughness={1}/></mesh>);
const Bench = ({ len = 3.0, uppers = false }: { len?:number; uppers?:boolean }) => (<group>
  <B w={len} h={0.82} d={0.6} c={C.light} p={[0,0.48,0]}/>
  <B w={len} h={0.1} d={0.06} c={C.mid} p={[0,0.06,0.29]} edge={false}/>
  <B w={len+0.03} h={0.05} d={0.64} c={C.stone} p={[0,0.92,0]}/>
  <B w={len} h={0.5} d={0.04} c={C.glass} p={[0,1.25,-0.29]} edge={false}/>
  {uppers && <B w={len} h={0.7} d={0.34} c={C.light} p={[0,1.76,-0.24]}/>}
</group>);
const Island = ({ len = 2.6 }: { len?: number }) => (<group>
  <B w={len} h={0.82} d={1.0} c={C.light} p={[0,0.48,0]}/>
  <B w={len+0.06} h={0.06} d={1.06} c={C.stone} p={[0,0.93,0]}/>
  <B w={0.06} h={0.92} d={1.06} c={C.stone} p={[-len/2,0.47,0]}/>
  <B w={0.5} h={0.03} d={0.35} c={C.metal} p={[-len*0.2,0.97,0]} edge={false}/>
  {Array.from({length:Math.max(2,Math.floor(len/0.7))}).map((_,i)=>(
    <group key={i} position={[(i-0.5)*0.7, 0, 0.85]}>
      <B w={0.34} h={0.04} d={0.34} c={C.wood} p={[0,0.64,0]}/>
      <Legs w={0.34} d={0.34} h={0.64} c={C.metal} inset={0.04}/>
      <B w={0.34} h={0.28} d={0.04} c={C.wood} p={[0,0.9,-0.15]}/></group>))}
</group>);
const Fridge = () => (<group>
  <B w={0.9} h={1.85} d={0.72} c={C.metal} p={[0,0.93,0]}/>
  <B w={0.03} h={0.5} d={0.04} c={C.dark} p={[-0.36,1.3,0.37]} edge={false}/>
</group>);
const Oven = () => (<group>
  <B w={0.65} h={2.05} d={0.6} c={C.light} p={[0,1.03,0]}/>
  <B w={0.55} h={0.5} d={0.05} c={C.black} p={[0,1.15,-0.28]} edge={false}/>
  <B w={0.55} h={0.34} d={0.05} c={C.black} p={[0,1.6,-0.28]} edge={false}/>
</group>);
const Bathroom = () => (<group>
  <B w={0.38} h={0.4} d={0.6} c={C.light} p={[0,0.2,0.05]}/>
  <Cyl r1={0.19} r2={0.19} h={0.06} c={C.light} p={[0,0.42,0.1]}/>
  <B w={0.4} h={0.5} d={0.16} c={C.light} p={[0,0.55,-0.24]}/>
  <group position={[0.95,0,0]}>
    <B w={1.1} h={0.78} d={0.5} c={C.wood} p={[0,0.46,0]}/>
    <B w={1.13} h={0.05} d={0.54} c={C.stone} p={[0,0.87,0]}/>
    <B w={0.36} h={0.06} d={0.28} c={C.light} p={[0,0.92,0]} edge={false}/>
    <B w={0.9} h={0.9} d={0.04} c={C.glass} p={[0,1.55,-0.24]} edge={false}/></group>
</group>);
const Car = () => (<group>
  <B w={1.85} h={0.62} d={4.4} c={C.dark} p={[0,0.55,0]}/>
  <B w={1.7} h={0.5} d={2.1} c={C.glass} p={[0,1.05,-0.15]} edge={false}/>
  {[-1,1].map(a=>[-1,1].map(b=>(
    <Cyl key={`${a}${b}`} r1={0.34} r2={0.34} h={0.24} c={C.black}
         p={[a*0.9,0.34,b*1.45]} rot={[0,0,Math.PI/2]}/>)))}
</group>);
const Planter = ({ h = 1.4 }: { h?: number }) => (<group>
  <Cyl r1={0.19} r2={0.16} h={0.4} c={C.mid} p={[0,0.2,0]}/>
  <mesh position={[0,0.4+h*0.35,0]} scale={[1,1.3,1]} castShadow>
    <sphereGeometry args={[h*0.4,12,12]}/><meshStandardMaterial color={C.green} roughness={1}/></mesh>
</group>);
const Curtain = ({ len = 1.6 }: { len?: number }) => (
  <mesh position={[0,1.15,0]} castShadow><boxGeometry args={[len,2.2,0.06]}/>
    <meshStandardMaterial color={C.fabric} roughness={1}/></mesh>);
/* ---------------- placement ---------------- */
type Item = { el: JSX.Element; x: number; z: number; ry?: number };
function layout(r: Room): Item[] {
  const c = roomCentre(r), w = r.x1 - r.x0, d = r.z1 - r.z0, out: Item[] = [];
  const f = r.fixtures;
  const along = w >= d;
  const zones = doorZones(r.floor);
  /**
   * Nothing may stand in a door's swing. Anchors are tried in order and the
   * first clear one wins; if a piece cannot be placed clear anywhere it is
   * dropped rather than left blocking the door. The same zones are what the
   * reviewer checks against, so a regression here shows up as a finding.
   */
  const place = (el: JSX.Element, cands: [number, number, number][], fw: number, fd: number) => {
    for (const [x, z, ry] of cands) {
      const swap = Math.abs(Math.abs(ry) - Math.PI / 2) < 0.4;
      const hw = (swap ? fd : fw) / 2, hd = (swap ? fw : fd) / 2;
      const fp = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
      if (blockedFraction(fp, zones) < 0.06) { out.push({ el, x, z, ry }); return; }
    }
  };
  const add = (el: JSX.Element, x: number, z: number, ry = 0) => out.push({ el, x, z, ry });
  if (f.includes('rug')) add(<Rug w={Math.min(3.2,w*0.6)} d={Math.min(2.4,d*0.55)}/>, c.x, c.z);
  const sofas = f.filter(x => x === 'sofa').length;
  if (sofas) {
    add(<Sofa len={Math.min(2.6, (along?w:d)*0.5)}/>, along?c.x:r.x0+0.75, along?r.z1-0.75:c.z, along?Math.PI:Math.PI/2);
    if (sofas > 1) add(<Sofa len={Math.min(2.0,(along?w:d)*0.4)}/>, along?r.x0+0.8:c.x, along?c.z:r.z0+0.8, along?Math.PI/2:0);
  }
  if (f.includes('tv')) add(<Tv size={r.use==='living'?65:55}/>, along?c.x:r.x1-0.35, along?r.z0+0.35:c.z, along?0:-Math.PI/2);
  if (f.includes('dining')) add(<Dining len={Math.min(2.2, (along?w:d)*0.45)}/>,
    along?c.x+w*0.18:c.x, along?c.z:c.z+d*0.18, along?0:Math.PI/2);
  if (f.includes('bed')) {
    const bw = r.id === 'f_pri' ? 1.8 : 1.5;
    place(<Bed w={bw}/>, [[c.x, c.z+0.25, 0], [c.x, c.z-0.25, 0],
      [c.x, r.z1-1.2, 0], [c.x, r.z0+1.2, 0], [c.x, c.z, 0]], bw, 2.1);
  }
  if (f.includes('robe')) {
    const rl = Math.min(1.9, (along ? w : d) * 0.55);
    place(<Robe len={rl}/>, [
      [along ? c.x : r.x1 - 0.35, along ? r.z1 - 0.35 : c.z, along ? Math.PI : -Math.PI / 2],
      [along ? c.x : r.x0 + 0.35, along ? r.z0 + 0.35 : c.z, along ? 0 : Math.PI / 2],
      [r.x1 - 0.35, r.z0 + rl / 2 + 0.2, -Math.PI / 2],
      [r.x0 + 0.35, r.z1 - rl / 2 - 0.2, Math.PI / 2],
      [r.x0 + rl / 2 + 0.2, r.z1 - 0.35, Math.PI],
      [r.x1 - rl / 2 - 0.2, r.z0 + 0.35, 0],
    ], rl, 0.62);
  }
  if (f.includes('desk')) place(<Desk/>, [
    [r.x1-0.8, r.z0+0.6, -Math.PI/2], [r.x0+0.8, r.z1-0.6, Math.PI/2],
    [r.x0+0.8, r.z0+0.6, -Math.PI/2], [r.x1-0.8, r.z1-0.6, Math.PI/2]], 1.4, 0.7);
  if (f.includes('fridge')) place(<Fridge/>, [
    [r.x1-0.6, r.z0+0.5, 0], [r.x0+0.6, r.z0+0.5, 0], [r.x1-0.6, r.z1-0.5, 0]], 0.8, 0.75);
  if (f.includes('oven')) add(<Oven/>, r.x0+0.45, r.z0+0.4);
  if (r.use === 'kitchen') { add(<Island len={Math.min(2.8,w*0.6)}/>, c.x, c.z+1.0);
    add(<Bench len={Math.min(4.0,w*0.8)} uppers/>, c.x, r.z0+0.35); }
  if (r.use === 'laundry' || r.id === 'g_wip') add(<Bench len={Math.min(1.9,(along?w:d)*0.8)}/>, c.x, r.z1-0.35, Math.PI);
  if (f.includes('bath')) add(<Bathroom/>, r.x0+0.55, r.z0+0.45);
  const cars = f.filter(x => x === 'car').length;
  for (let i = 0; i < cars; i++) add(<Car/>, c.x + (i ? 1.45 : -1.45), c.z, Math.PI/2);
  if (f.includes('curtain')) add(<Curtain len={Math.min(1.8,(along?w:d)*0.4)}/>,
    along?c.x:r.x0+0.14, along?r.z0+0.14:c.z, along?0:Math.PI/2);
  return out;
}
/** Staircase, balustrades and the alfresco roof — structural fit-out. */
function Structure({ floor }: { floor: 0 | 1 }) {
  const S0 = STAIRS[0];
  const rise = GEOM.H0, n = S0.risers, sh = rise/n, run = S0.x1 - S0.x0, st = run/n;
  const base = floor === 0 ? 0 : -GEOM.H0;
  const rails: [number,number,number,number][] = floor === 1
    ? [[6.8,5.2,11.5,5.2],[11.5,5.2,11.5,10.1],[6.8,10.1,11.5,10.1],[6.8,5.2,6.8,10.1],
       [24.2,3.0,25.4,3.0],[25.4,3.0,25.4,6.7],[24.2,6.7,25.4,6.7]] : [];
  return (<group position={[0, y0(floor), 0]}>
    {Array.from({length:n}).map((_,i)=>(
      <B key={i} w={st} h={sh} d={S0.width} c={C.wood}
         p={[S0.x1-st*(i+0.5), base+sh*(i+0.5), (S0.z0+S0.z1)/2]}/>))}
    {rails.map((s,i)=>{ const dx=s[2]-s[0], dz=s[3]-s[1], L=Math.hypot(dx,dz);
      return (<group key={`r${i}`} position={[(s[0]+s[2])/2,0,(s[1]+s[3])/2]} rotation={[0,-Math.atan2(dz,dx),0]}>
        <mesh position={[0,0.5,0]}><boxGeometry args={[L,1.0,0.03]}/>
          <meshStandardMaterial color={C.glass} transparent opacity={0.3} roughness={0.05}/></mesh>
        <B w={L} h={0.05} d={0.05} c={C.metal} p={[0,1.02,0]} edge={false}/></group>); })}
    {floor === 0 && (<group>
      <B w={6.5} h={0.16} d={4.6} c={C.wood} p={[3.25, GEOM.H0+0.1, 5.35]}/>
      {[3.2,7.5].map(z=>[0.25,6.25].map(x=>(
        <B key={`${x}${z}`} w={0.15} h={GEOM.H0} d={0.15} c={C.wood} p={[x,GEOM.H0/2,z]}/>)))}
    </group>)}
  </group>);
}
export default function Furniture() {
  const { floor, view } = useStore();
  const items = useMemo(() => ROOMS.filter(r => r.floor === floor && !r.void)
    .flatMap(r => layout(r).map((it, i) => ({ ...it, key: `${r.id}_${i}` }))), [floor]);
  if (view === 'street') return null;
  return (<group>
    {items.map(it => (
      <group key={it.key} position={[it.x, y0(floor), it.z]} rotation={[0, it.ry ?? 0, 0]}>{it.el}</group>))}
    <Structure floor={floor}/>
  </group>);
}
