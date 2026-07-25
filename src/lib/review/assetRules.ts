/**
 * Asset engineering checks.
 *
 * Placing an asset changes the physics, so it has to be checked like any other
 * design decision. These run over whatever is actually in the model — they are
 * not tied to this house — and they are the reason the catalogue carries specs
 * rather than just icons.
 */
import { ROOMS, GEOM, roomArea, roomHeight, roomCentre } from '@/lib/model/building';
import {
  assetById, EIRP_LIMIT_DBM, NCC_LIGHTING_DENSITY_W_M2, HEATING_W_PER_M2, BS775_ANGLES,
  type RfBandKey,
} from '@/lib/model/assets';
import type { RuleFinding } from './draftingRules';
import type { PlacedItem, Speaker } from '@/store/useStore';
import type { Light } from '@/lib/solvers/lighting';
import type { AP } from '@/lib/solvers/rf';

export interface AssetScene {
  items: PlacedItem[];
  speakers: Speaker[];
  lights: Light[];
  aps: AP[];
  rfBand: RfBandKey;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function runAssetRules(scene: AssetScene): RuleFinding[] {
  const out: RuleFinding[] = [];

  /* -------- mounting: is each asset actually on the surface it needs? -------- */
  for (const it of scene.items) {
    const spec = assetById(it.asset || it.type);
    if (!spec) continue;
    if (spec.mount === 'wall' && !it.wallId) {
      out.push({
        rule: 'assets/mount-surface', severity: 'major',
        title: `${spec.label} is not fixed to a wall`,
        detail: 'It is a wall-mounted fitting but nothing was found to fix it to, so it is floating in the room.',
        authority: 'Manufacturer mounting requirement',
        subject: it.id,
      });
    }
    const room = ROOMS.find(r => r.id === it.room);
    if (room && (spec.mount === 'ceiling' || spec.mount === 'ceiling-recessed') && room.void) {
      out.push({
        rule: 'assets/mount-surface', severity: 'major',
        title: `${spec.label} has no ceiling above it`,
        detail: `${room.name} is a void. A recessed or surface ceiling fitting needs a ceiling plane.`,
        authority: 'Manufacturer mounting requirement',
        subject: it.id,
      });
    }
  }

  /* -------- NCC illumination power density, a hard cap for dwellings -------- */
  const byRoom = new Map<string, number>();
  for (const l of scene.lights) {
    if (!l.asset) continue;
    const spec = assetById(l.asset);
    if (!spec?.light) continue;
    byRoom.set(l.room, (byRoom.get(l.room) ?? 0) + spec.light.watts * l.bulbs);
  }
  for (const [roomId, watts] of byRoom) {
    const r = ROOMS.find(x => x.id === roomId);
    if (!r) continue;
    const density = watts / roomArea(r);
    if (density > NCC_LIGHTING_DENSITY_W_M2) {
      out.push({
        rule: 'assets/lighting-density', severity: 'major',
        title: `${r.name} exceeds the lighting power density limit`,
        detail: `${watts.toFixed(0)} W over ${roomArea(r).toFixed(1)} m² is ${density.toFixed(1)} W/m² against a ${NCC_LIGHTING_DENSITY_W_M2} W/m² cap. Note this clause is not adopted in NSW.`,
        authority: 'NCC 2022 Volume Two 13.7.6 — illumination power density, Class 1',
        subject: roomId,
      });
    }
  }

  /* -------- downlight spacing against the beam the fitting actually has -------- */
  const dlByRoom = new Map<string, Light[]>();
  for (const l of scene.lights) {
    const spec = l.asset ? assetById(l.asset) : null;
    if (!spec?.light || spec.mount !== 'ceiling-recessed') continue;
    if (!dlByRoom.has(l.room)) dlByRoom.set(l.room, []);
    dlByRoom.get(l.room)!.push(l);
  }
  for (const [roomId, ls] of dlByRoom) {
    const r = ROOMS.find(x => x.id === roomId);
    if (!r || ls.length < 2) continue;
    const spec = assetById(ls[0].asset!)!;
    // SHR is measured above the WORK PLANE, not floor to ceiling — a common slip
    const mountingHeight = roomHeight(r) - 0.75;
    const maxSpacing = spec.light!.shr * mountingHeight;
    let worst = 0;
    for (let i = 0; i < ls.length; i++) {
      let nearest = Infinity;
      for (let j = 0; j < ls.length; j++) {
        if (i === j) continue;
        nearest = Math.min(nearest, Math.hypot(ls[i].x - ls[j].x, ls[i].z - ls[j].z));
      }
      worst = Math.max(worst, nearest);
    }
    if (worst > maxSpacing * 1.15) {
      out.push({
        rule: 'assets/downlight-spacing', severity: 'minor',
        title: `${r.name} downlights are spaced too far apart`,
        detail: `Widest gap ${worst.toFixed(2)} m against ${maxSpacing.toFixed(2)} m for a ${spec.light!.beamDeg}° beam (SHR ${spec.light!.shr} × ${mountingHeight.toFixed(2)} m above the work plane). Expect scalloping between fittings.`,
        authority: 'Spacing-to-mounting-height ratio; IES definition measures it above the work plane',
        subject: roomId,
      });
    }
  }

  /* -------- subwoofer placement -------- */
  for (const sp of scene.speakers) {
    const spec = assetById(sp.asset ?? '');
    if (!spec?.audio?.isSub) continue;
    const r = ROOMS.find(x => x.id === sp.room);
    if (!r) continue;
    const c = roomCentre(r);
    const midX = near(sp.x, c.x, 0.5), midZ = near(sp.z, c.z, 0.5);
    if (midX || midZ) {
      out.push({
        rule: 'assets/sub-placement', severity: 'minor',
        title: `Subwoofer sits on a room mid-line in ${r.name}`,
        detail: 'The midpoint of a dimension is the pressure null of that room mode, so the sub will excite it weakly and sound thin at some seats. Move it toward a corner for boundary gain, or use two subs at opposing wall midpoints.',
        authority: 'Welti & Devantier, JAES 54(5) 2006 — multi-sub spatial variance',
        subject: sp.id,
      });
    } else if ((sp.boundaries ?? 1) >= 3) {
      out.push({
        rule: 'assets/sub-placement', severity: 'pass',
        title: `Subwoofer is corner loaded in ${r.name}`,
        detail: `Coupled to ${sp.boundaries} surfaces, worth about +${((sp.boundaries! - 1) * 6).toFixed(0)} dB of boundary gain below 80 Hz. Verify by seat — corner loading raises output but also excites every mode.`,
        authority: 'Coherent image-source loading, +6 dB per boundary below ~80 Hz',
        subject: sp.id,
      });
    }
  }

  /* -------- 5.1 layout against ITU-R BS.775 -------- */
  const mains = scene.speakers.filter(s => {
    const a = assetById(s.asset ?? '');
    return a?.audio && !a.audio.isSub;
  });
  if (mains.length >= 5) {
    const byRoomSpk = new Map<string, Speaker[]>();
    for (const s of mains) {
      if (!byRoomSpk.has(s.room)) byRoomSpk.set(s.room, []);
      byRoomSpk.get(s.room)!.push(s);
    }
    for (const [roomId, ss] of byRoomSpk) {
      if (ss.length < 5) continue;
      const r = ROOMS.find(x => x.id === roomId);
      if (!r) continue;
      const c = roomCentre(r);
      const angles = ss.map(s => {
        const deg = (Math.atan2(s.x - c.x, s.z - c.z) * 180) / Math.PI;
        return Math.abs(deg);
      }).sort((a, b) => a - b);
      const hasFront = angles.some(a => near(a, BS775_ANGLES.front, 12));
      const hasSurround = angles.some(a => a >= BS775_ANGLES.surroundMin - 15 && a <= BS775_ANGLES.surroundMax + 15);
      if (!hasFront || !hasSurround) {
        out.push({
          rule: 'assets/speaker-layout', severity: 'minor',
          title: `${r.name} speaker angles are outside the reference layout`,
          detail: `BS.775 puts front left and right at ±30° and surrounds between ±100° and ±120° from the listening position. Measured from the room centre: ${angles.map(a => a.toFixed(0) + '°').join(', ')}.`,
          authority: 'ITU-R BS.775-4 — multichannel loudspeaker layout',
          subject: roomId,
        });
      }
    }
  }

  /* -------- wall speaker height against seated ear height -------- */
  for (const sp of scene.speakers) {
    const spec = assetById(sp.asset ?? '');
    if (!spec || spec.mount !== 'wall' || spec.audio?.isSub) continue;
    const above = sp.y - (sp.floor === 0 ? 0 : GEOM.F1Y);
    if (spec.id === 'spk_wall' && Math.abs(above - BS775_ANGLES.earHeightM) > 0.45) {
      out.push({
        rule: 'assets/speaker-height', severity: 'minor',
        title: `Front channel is off ear height`,
        detail: `Acoustic centre at ${(above * 1000).toFixed(0)} mm against the ${(BS775_ANGLES.earHeightM * 1000).toFixed(0)} mm seated reference.`,
        authority: 'EBU Tech 3276 / ITU-R BS.1116 — seated ear height 1.2 m',
        subject: sp.id,
      });
    }
  }

  /* -------- access points against the ACMA EIRP ceiling -------- */
  for (const ap of scene.aps) {
    const spec = assetById(ap.asset ?? 'ap_ceiling');
    if (!spec?.rf) continue;
    const band = scene.rfBand;
    const eirp = spec.rf.txDbm[band] + spec.rf.gainDbi[band];
    const limit = EIRP_LIMIT_DBM[band];
    if (eirp > limit) {
      out.push({
        rule: 'assets/rf-eirp', severity: 'major',
        title: `${ap.name} exceeds the permitted EIRP at ${band} GHz`,
        detail: `${spec.rf.txDbm[band]} dBm conducted plus ${spec.rf.gainDbi[band]} dBi is ${eirp.toFixed(1)} dBm EIRP against a ${limit} dBm ceiling. Reduce transmit power.`,
        authority: 'ACMA Radiocommunications (LIPD) Class Licence 2025, Schedule 1 Part 8',
        subject: ap.id,
      });
    }
  }
  // AP spacing — plasterboard construction plans at 10-15 m
  for (let i = 0; i < scene.aps.length; i++) {
    for (let j = i + 1; j < scene.aps.length; j++) {
      const a = scene.aps[i], b = scene.aps[j];
      if (a.floor !== b.floor) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 6) {
        out.push({
          rule: 'assets/ap-spacing', severity: 'minor',
          title: `${a.name} and ${b.name} are too close`,
          detail: `${d.toFixed(1)} m apart. Cells this tight overlap heavily and co-channel interference costs more throughput than the extra coverage returns; 10-15 m is the planning figure in plasterboard.`,
          authority: 'Aruba and Cisco RF design guidance — 10-15 m AP spacing, -65 dBm cell edge',
          // the PAIR is the subject: one AP close to two others produced two
          // findings with the same id, and React keys on that id
          subject: `${a.id}~${b.id}`,
        });
      }
    }
  }

  /* -------- heater output against the room it is in -------- */
  const heatByRoom = new Map<string, number>();
  for (const it of scene.items) {
    const spec = assetById(it.asset || it.type);
    if (!spec?.thermal || spec.thermal.kind !== 'convection') continue;
    heatByRoom.set(it.room, (heatByRoom.get(it.room) ?? 0) + spec.thermal.outputKw);
  }
  for (const [roomId, kw] of heatByRoom) {
    const r = ROOMS.find(x => x.id === roomId);
    if (!r) continue;
    const need = (roomArea(r) * HEATING_W_PER_M2) / 1000;
    const ratio = kw / need;
    if (ratio < 0.7) {
      out.push({
        rule: 'assets/heater-sizing', severity: 'minor',
        title: `${r.name} is under-heated`,
        detail: `${kw.toFixed(1)} kW installed against roughly ${need.toFixed(1)} kW for ${roomArea(r).toFixed(1)} m². The room will not hold the 20 °C design temperature on a cold day.`,
        authority: 'Trade convention 100 W/m² (Sustainability Victoria, Noirot); NCC H6 design temperature 20 °C',
        subject: roomId,
      });
    } else if (ratio > 1.6) {
      out.push({
        rule: 'assets/heater-sizing', severity: 'minor',
        title: `${r.name} is over-heated`,
        detail: `${kw.toFixed(1)} kW against roughly ${need.toFixed(1)} kW needed. Oversized heating short-cycles and wastes standby energy.`,
        authority: 'Trade convention 100 W/m² of floor area',
        subject: roomId,
      });
    }
  }

  return out;
}
