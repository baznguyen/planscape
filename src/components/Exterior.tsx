'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { GEOM } from '@/lib/model/building';
import { useStore } from '@/store/useStore';

const M = { brick:'#e6d9c8', render:'#f2efe8', clad:'#e2ddd2', roof:'#b9bec3', wood:'#c2a074',
  glass:'#bfe0ec', metal:'#cfd2d5', grass:'#9cc76f', road:'#b0b3b6', path:'#d6d3cb',
  bed:'#8a7a52', hedge:'#74ab55', trunk:'#b59a74', water:'#5bb4d0', ghost:'#ccd1d6' };

const Box = ({ w,h,d,c,p,r,info,edge=true,soft=false }:
  { w:number;h:number;d:number;c:string;p:[number,number,number];r?:[number,number,number];info?:string;edge?:boolean;soft?:boolean }) => (
  <mesh position={p} rotation={r} castShadow receiveShadow userData={info?{info}:undefined}>
    <boxGeometry args={[w,h,d]}/><meshStandardMaterial color={c} roughness={0.85}/>
    {edge && <Edges color={soft?'#777a7e':'#2b2b29'} threshold={20}/>}
  </mesh>);
const Ghost = ({ w,h,d,p,r }: { w:number;h:number;d:number;p:[number,number,number];r?:[number,number,number] }) => (
  <mesh position={p} rotation={r} castShadow receiveShadow>
    <boxGeometry args={[w,h,d]}/>
    <meshStandardMaterial color={M.ghost} transparent opacity={0.28} roughness={1} depthWrite={false}/>
    <Edges color="#777a7e" threshold={20}/>
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
function Subject() {
  const { H0, H1, LEN, WID } = GEOM;
  return (<group>
    <Box w={21.64} h={H0} d={WID} c={M.brick} p={[17.32,H0/2,5.5]} info="Ground floor — face brick as selected"/>
    <Box w={18.8} h={H1} d={9.56} c={M.clad} p={[16.0,H0+H1/2,5.5]} info="First floor — render + grid panel cladding"/>
    <Box w={21.8} h={0.35} d={11.2} c={M.roof} p={[17.32,H0+H1+0.2,5.5]} info="Colorbond roof — 12.6° pitch"/>
    <Box w={18.8} h={0.5} d={9.56} c={M.render} p={[16.0,H0+H1+0.3,5.5]} info="Parapet"/>
    <Box w={0.3} h={H0+H1} d={2.0} c={M.render} p={[28.12,(H0+H1)/2,2.4]} info="Rendered entry pier"/>
    <Box w={0.12} h={2.143} d={4.81} c={M.wood} p={[28.09,1.07,8.6]} info="Panel lift garage door 4810 × 2143"/>
    <Box w={0.1} h={2.34} d={1.1} c={M.wood} p={[28.09,1.17,5.0]} info="Front entry door"/>
    <Box w={2.13} h={0.16} d={3.0} c={M.render} p={[29.1,H0,5.0]} info="Porch roof"/>
    {[3.6,6.4].map(z=><Box key={z} w={0.14} h={H0} d={0.14} c={M.render} p={[29.9,H0/2,z]} info="Porch post"/>)}
    <Box w={1.2} h={0.14} d={3.7} c={M.render} p={[28.7,H0+0.02,4.85]} info="Cantilevered balcony 4.44 m²"/>
    <mesh position={[29.28,H0+0.55,4.85]} rotation={[0,Math.PI/2,0]}>
      <boxGeometry args={[3.7,1.0,0.04]}/>
      <meshStandardMaterial color={M.glass} transparent opacity={0.3} roughness={0.05}/></mesh>
    <Box w={1.5} h={0.12} d={3.9} c={M.roof} p={[28.7,H0+H1,4.85]} info="Feature cantilevered awning"/>
    {/* glazing to each elevation */}
    {[1.6,3.9,6.2,8.5].map(z=>(<group key={`e${z}`}>
      <Box w={0.05} h={1.25} d={1.5} c={M.glass} p={[28.10,1.55,z]} edge={false} info="Window"/>
      <Box w={0.05} h={1.25} d={1.5} c={M.glass} p={[25.36,H0+1.45,z]} edge={false} info="Window"/></group>))}
    {[8,11,14,17,20,23].map(x=>(<group key={`n${x}`}>
      <Box w={1.5} h={1.25} d={0.05} c={M.glass} p={[x,1.55,10.97]} edge={false} info="Window"/>
      <Box w={1.5} h={1.25} d={0.05} c={M.glass} p={[x,1.55,0.03]} edge={false} info="Window"/>
      <Box w={1.5} h={1.25} d={0.05} c={M.glass} p={[x,H0+1.45,10.25]} edge={false} info="Window"/>
      <Box w={1.5} h={1.25} d={0.05} c={M.glass} p={[x,H0+1.45,0.75]} edge={false} info="Window"/></group>))}
  </group>);
}
/** Landscaping — visible from the street AND through the windows from inside. */
export function Garden() {
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
    {Array.from({length:12}).map((_,i)=>(
      <mesh key={`h${i}`} position={[33.6,0.45,-1+i*1.1]} castShadow><boxGeometry args={[0.55,0.9,1.02]}/>
        <meshStandardMaterial color={M.hedge} roughness={1}/></mesh>))}
    <Tree x={31.5} z={1.6} h={5.4}/><Tree x={31.8} z={10.6} h={6.0}/>
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
