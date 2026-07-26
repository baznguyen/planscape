'use client';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GEOM } from '@/lib/model/building';
import { useStore } from '@/store/useStore';

const yOf = (f: 0 | 1) => (f === 0 ? 0 : GEOM.F1Y);

/**
 * The actual drawing, laid over the model.
 *
 * The old overlay drew my own transcription of the plan. That is useful — it is
 * an independent check on the geometry — but it is not what you asked for and it
 * cannot answer the question you are really asking. If the transcription is
 * wrong, the trace and the model agree with each other and both are wrong. Only
 * the sheet itself is the authority.
 *
 * So this puts the rendered PDF page over the level you are looking at, ink
 * only, paper knocked out, at whatever opacity you set. Line up the two and
 * every discrepancy is visible at once.
 */

/**
 * Registration.
 *
 * The first version of this fitted the scale by eye against the model envelope
 * and got 28.65 pt/m, which put the drawing 1% out — three hundred millimetres
 * across the length of the house, and enough that you would blame the model for
 * a mismatch the overlay had invented.
 *
 * The sheet does not need fitting. It is plotted at 1:100, so one metre is one
 * centimetre of paper, which is exactly 28.3465 PostScript points. Two features
 * confirm it independently: the panel lift door measures 136.35 pt against its
 * "4,810" label (28.346 pt/m) and the numbered stair treads sit at a 7.087 pt
 * pitch against a 250 mm going (28.348 pt/m).
 *
 * With the scale fixed, each page needs only an origin, and the two pages do
 * NOT share one — the first floor plan is drawn 5.93 pt west and 24.43 pt north
 * of the ground floor plan on its own sheet. That offset was measured from the
 * tread numbers the two sheets have in common (treads 2 through 6 appear on
 * both), which is the only feature guaranteed to be the same physical object in
 * both drawings.
 */
const PT_PER_M = 28.3465;
/** the crop exported to public/plans, in PDF points */
const CROP = { x0: 150, y0: 180, x1: 1120, y1: 700 };
/** pdfX = ox + PT_PER_M * modelX ; pdfY = oz - PT_PER_M * modelZ */
const ORIGIN: Record<0 | 1, { ox: number; oz: number }> = {
  0: { ox: 172.60, oz: 593.10 },
  1: { ox: 166.67, oz: 568.67 },
};

export default function PlanSheet() {
  const floor = useStore(s => s.floor);
  const on = useStore(s => s.overlays.plan);
  const cal = useStore(s => s.planCal);
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  const src = floor === 0 ? '/plans/ground.png' : '/plans/first.png';
  useEffect(() => {
    if (!on) return;
    let dead = false;
    new THREE.TextureLoader().load(src, t => {
      if (dead) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      /**
       * Orientation. The plane is laid flat by rotating -90 degrees about X.
       *
       * I reasoned this one out and got it backwards, which put the sheet on
       * the model upside down north for south — the garage printed over
       * bedroom 5 and vice versa — and it was not obvious, because the building
       * happens to sit close to the middle of the crop, so the ink still landed
       * ON the house. Only the text reading backwards gave it away.
       *
       * So it is asserted rather than derived: tests/planoverlay.test.mjs picks
       * a note whose position is known on both the sheet and the model (the
       * garage slab level, which can only be in the garage) and fails if the
       * mapping puts it anywhere else. Change the rotation or this flag and
       * that test tells you immediately.
       *
       * The value: the crop's TOP row is the sheet's smallest PDF y, which is
       * the largest model z — north. Rotating -90 about X sends the plane's own
       * -Y to world +Z, and -Y is where v = 0 lives, so the image's top row has
       * to land on v = 0. That is flipY off; three's default of on would put the
       * top row at v = 1 and print the plan upside down.
       */
      t.flipY = false;
      setTex(t);
    });
    return () => { dead = true; };
  }, [src, on]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  /** Map the exported crop into model metres for the level being viewed. */
  const fit = useMemo(() => {
    const { ox, oz } = ORIGIN[floor];
    const s = PT_PER_M * cal.scale;
    return {
      w: (CROP.x1 - CROP.x0) / s,
      h: (CROP.y1 - CROP.y0) / s,
      cx: ((CROP.x0 + CROP.x1) / 2 - ox) / s + cal.dx,
      cz: (oz - (CROP.y0 + CROP.y1) / 2) / s + cal.dz,
    };
  }, [cal, floor]);

  if (!on || !tex) return null;
  // Above the level you are viewing, not on the floor: you are comparing the
  // drawing with what is under it, so it has to hover clear of the furniture.
  const y = yOf(floor) + 1.9;

  return (
    <mesh position={[fit.cx, y, fit.cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={38}
      frustumCulled={false}>
      <planeGeometry args={[fit.w, fit.h]} />
      <meshBasicMaterial map={tex} transparent opacity={cal.opacity}
        depthTest={false} depthWrite={false} toneMapped={false}
        side={THREE.DoubleSide} />
    </mesh>
  );
}
