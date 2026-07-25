'use client';
import dynamic from 'next/dynamic';
import Ui from '@/components/Ui';
const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });
export default function Page() {
  return <main><div className="canvasWrap"><Scene /></div><Ui /></main>;
}
