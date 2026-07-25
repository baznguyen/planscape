import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '101 Campbell Street — Architectural Analysis Engine',
  description: 'Material-aware 3D building analysis: thermal, lighting, acoustics, airflow, HVAC and WiFi.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
