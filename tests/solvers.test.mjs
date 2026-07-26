import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, ALL_OPENINGS, roomArea, roomById, GEOM } from '../dist-test/model/building.js';
import { solarState, outdoorTemp, surfaceIrradiance } from '../dist-test/solvers/sun.js';
import { settle, stepThermal, initialState, ventilationFlow, roomCapacitance } from '../dist-test/solvers/thermal.js';
import { analyseRoom, absorption } from '../dist-test/solvers/acoustics.js';
import { autoDesign, roomIlluminance, LUX_TARGET, utilisationFactor } from '../dist-test/solvers/lighting.js';
import { rssiAt, DEFAULT_APS, pathLossObstacles } from '../dist-test/solvers/rf.js';
import { systemSummary, roomLoad } from '../dist-test/solvers/hvac.js';
import { analyseAirflow } from '../dist-test/solvers/airflow.js';

const NONE = new Set();
const ctx = (o = {}) => ({
  month: 0, minutes: 900, openIds: NONE, lightingW: {}, hvacOn: false,
  setpointCool: 24, setpointHeat: 20, windSpeed: 4.6, occupancyScale: 1, ...o,
});

test('geometry matches the plan schedule', () => {
  const g = ROOMS.filter(r => r.floor === 0 && !r.outdoor && !r.void).reduce((s, r) => s + roomArea(r), 0);
  const f = ROOMS.filter(r => r.floor === 1 && !r.outdoor && !r.void).reduce((s, r) => s + roomArea(r), 0);
  assert.ok(g > 180 && g < 205, `ground internal ${g.toFixed(1)} m2 should be ~198.6`);
  // Widened from 105-125 (~119.1): the first floor is actively being
  // re-measured off SK1 room by room (PLANS.md — it was never verified),
  // and each real correction moves this number. 105-150 catches a genuine
  // regression without failing on every legitimate re-measurement.
  assert.ok(f > 105 && f < 150, `first internal ${f.toFixed(1)} m2 outside the plausible re-measurement band`);
  assert.equal(GEOM.LEN, 28.14);
  // 6.5 x 1.55 m, re-measured off SK1's beam+post line at z=4.64 (the old
  // z1=7.6 straddled across the Living/Meals divide into Living's side —
  // this 29.25 m2 figure was never a schedule value, just whatever the
  // unmeasured geometry computed to).
  const alf = roomArea(roomById('g_alf'));
  assert.ok(Math.abs(alf - 10.075) < 0.01, `alfresco ${alf} should be exactly 10.075`);
});

test('solar position and clear-sky irradiance are physical', () => {
  const noonSummer = solarState(0, 12 * 60);
  const altDeg = (noonSummer.alt * 180) / Math.PI;
  assert.ok(altDeg > 70 && altDeg < 85, `Jan noon altitude ${altDeg.toFixed(1)}° should be ~79° in Sydney`);
  assert.ok(noonSummer.dni > 850 && noonSummer.dni < 1050, `DNI ${noonSummer.dni.toFixed(0)} W/m2 out of clear-sky range`);
  const noonWinter = solarState(5, 12 * 60);
  assert.ok(noonWinter.alt < noonSummer.alt, 'winter sun must be lower than summer');
  assert.equal(solarState(0, 60).isDay, false, '01:00 must be night');
  // north-facing glass gets more winter sun than summer in the southern hemisphere
  const wN = surfaceIrradiance(solarState(5, 12 * 60), 'N');
  const sN = surfaceIrradiance(solarState(0, 12 * 60), 'N');
  assert.ok(wN > sN, `winter N glass ${wN.toFixed(0)} should exceed summer ${sN.toFixed(0)}`);
});

test('outdoor temperature follows the diurnal profile', () => {
  const dawn = outdoorTemp(0, 6 * 60), mid = outdoorTemp(0, 15 * 60);
  assert.ok(mid > dawn, 'afternoon must be warmer than dawn');
  assert.ok(mid > 27 && mid < 32, `Jan 15:00 ${mid.toFixed(1)}C should be near the 30.2 mean max`);
  assert.ok(outdoorTemp(6, 15 * 60) < outdoorTemp(0, 15 * 60), 'July cooler than January');
});

test('thermal model settles and responds to opening windows', () => {
  const closed = settle(ctx(), 36, 15);
  const liv = closed['g_liv'];
  assert.ok(liv > 15 && liv < 50, `living temp ${liv.toFixed(1)}C is unphysical`);
  // open every external opening on the living room
  const openable = ALL_OPENINGS.filter(o => (o.a === 'g_liv' || o.b === 'g_liv') && (o.a === null || o.b === null));
  assert.ok(openable.length > 0, 'living room must have external openings');
  const open = settle(ctx({ openIds: new Set(openable.map(o => o.id)) }), 36, 15);
  const Tout = outdoorTemp(0, 900);
  // with windows open the room must track outdoor more closely than when sealed
  assert.ok(Math.abs(open['g_liv'] - Tout) < Math.abs(closed['g_liv'] - Tout) + 0.001,
    `open ${open['g_liv'].toFixed(1)} should be nearer outdoor ${Tout.toFixed(1)} than closed ${closed['g_liv'].toFixed(1)}`);
});

test('ventilation flow is zero when sealed and positive when open', () => {
  const r = roomById('g_liv');
  assert.equal(ventilationFlow(r, ctx(), 26, 30), 0);
  const ids = new Set(ALL_OPENINGS.filter(o => (o.a === 'g_liv' || o.b === 'g_liv') && o.b === null).map(o => o.id));
  const q = ventilationFlow(r, ctx({ openIds: ids }), 26, 30);
  assert.ok(q > 0, 'open apertures must produce flow');
});

test('thermal mass: heavy slab damps swing more than lightweight floor', () => {
  const heavy = roomById('g_gar');      // slab on ground, kappa 211
  const light = roomById('f_bd2');      // carpet on joists, kappa 26
  assert.ok(roomCapacitance(heavy) / roomArea(heavy) > roomCapacitance(light) / roomArea(light),
    'slab-on-ground must have higher areal capacitance than a carpeted upper floor');
});

test('acoustics respond to floor finish and open apertures', () => {
  const carpeted = analyseRoom(roomById('f_bd2'), NONE);   // carpet
  const tiled = analyseRoom(roomById('f_bth'), NONE);      // tile
  assert.ok(carpeted.rt60Mid < 1.2, `carpeted bedroom RT60 ${carpeted.rt60Mid.toFixed(2)}s too high`);
  assert.ok(tiled.rt60Mid > carpeted.rt60Mid, 'a tiled bathroom must reverberate more than a carpeted bedroom');
  // opening a window adds absorption -> shorter RT60
  const liv = roomById('g_liv');
  const shut = analyseRoom(liv, NONE).rt60Mid;
  const openIds = new Set(ALL_OPENINGS.filter(o => o.a === 'g_liv' || o.b === 'g_liv').map(o => o.id));
  const open = analyseRoom(liv, openIds).rt60Mid;
  assert.ok(open < shut, `open apertures must shorten RT60 (${open.toFixed(2)} vs ${shut.toFixed(2)})`);
  // modes: first axial = c/2L
  const m = carpeted.modes[0];
  const L = Math.max(roomById('f_bd2').x1 - roomById('f_bd2').x0, roomById('f_bd2').z1 - roomById('f_bd2').z0);
  assert.ok(Math.abs(m.f - 343 / (2 * L)) < 1.5, `lowest mode ${m.f.toFixed(1)}Hz should be c/2L = ${(343/(2*L)).toFixed(1)}`);
});

test('lighting auto-design meets the AS/NZS 1680 target', () => {
  for (const id of ['g_liv', 'g_kit', 'f_bd2', 'f_std']) {
    const r = roomById(id);
    const lights = autoDesign(r);
    const res = roomIlluminance(r, lights);
    assert.ok(res.lux >= res.target * 0.9,
      `${r.name}: ${res.lux.toFixed(0)} lx below target ${res.target}`);
    assert.ok(res.lux <= res.target * 2.6, `${r.name}: ${res.lux.toFixed(0)} lx wildly over target`);
  }
});

test('utilisation factor rises with reflectance and room index', () => {
  const big = roomById('g_fam'), small = roomById('g_pdr');
  assert.ok(utilisationFactor(big) > utilisationFactor(small), 'larger room index -> higher UF');
  assert.ok(utilisationFactor(big) > 0.2 && utilisationFactor(big) < 0.9);
});

test('RF: signal falls with distance and with intervening walls', () => {
  const near = rssiAt(DEFAULT_APS, 10, 5.5, 0, '5', NONE).rssi;
  const far = rssiAt(DEFAULT_APS, 27, 1.0, 0, '5', NONE).rssi;
  assert.ok(near > far, `near ${near.toFixed(0)} dBm must beat far ${far.toFixed(0)}`);
  assert.ok(near < 0 && near > -60, `near RSSI ${near.toFixed(0)} unphysical`);
  // opening a door on the path removes its attenuation
  const shut = pathLossObstacles(24.5, 5.15, 20, 5.15, 0, '5', NONE);
  const open = pathLossObstacles(24.5, 5.15, 20, 5.15, 0, '5', new Set(ALL_OPENINGS.map(o => o.id)));
  assert.ok(open <= shut, `opening doors must not increase path loss (${open} vs ${shut})`);
  // 6 GHz attenuates more than 2.4 GHz through the same fabric
  const g24 = rssiAt(DEFAULT_APS, 26, 2, 0, '2.4', NONE).rssi;
  const g6 = rssiAt(DEFAULT_APS, 26, 2, 0, '6', NONE).rssi;
  assert.ok(g24 > g6, '2.4 GHz must penetrate better than 6 GHz');
});

test('HVAC peak load is engineering-plausible per square metre', () => {
  /**
   * This used to assert an absolute 14-34 kW, and it broke the day the window
   * generator was corrected — the old one placed a window every 3.2 m of
   * external wall regardless of what was behind it, which over-glazed the house
   * and inflated the solar gain. Fixing it dropped the load 60%, and a
   * hard-coded band turns that into a failure instead of an improvement.
   *
   * So the assertion is per square metre of conditioned floor, against the range
   * a services engineer would accept for detached housing in NCC climate zone 6:
   * roughly 40 W/m2 for a well-shaded, well-insulated house up to 120 W/m2 for a
   * heavily glazed one. Wide on purpose — its job is to catch a broken solver,
   * not to pin a design that is still being measured off the drawing.
   */
  const s = systemSummary();
  const floor = ROOMS
    .filter(r => !r.outdoor && !r.void && r.use !== 'garage')
    .reduce((a, r) => a + roomArea(r), 0);
  const wPerM2 = (s.installedKw * 1000) / floor;
  assert.ok(wPerM2 > 35 && wPerM2 < 130,
    `${wPerM2.toFixed(0)} W/m2 over ${floor.toFixed(0)} m2 is outside the plausible band`);

  // Invariants that do NOT move when the geometry gets more accurate.
  const kit = roomLoad(roomById('g_kit'));
  assert.ok(kit.outlets >= 1 && kit.outlets <= 4, 'kitchen outlet count is sane');
  assert.ok(kit.lps > 0, 'kitchen gets air');
  // g_gst, not g_bd5: Bedroom 5 was missing its east wall entirely until it
  // was re-measured off SK1, so it went from an interior-reading room to a
  // real corner room with two external faces — which now plausibly loads
  // HARDER per m2 than the kitchen (two exposed walls beat one). g_gst is an
  // unrelated single-aspect bedroom and keeps the comparison meaningful.
  const bed = roomLoad(roomById('g_gst'));
  const density = (l, id) => (l.totalKw * 1000) / roomArea(roomById(id));
  assert.ok(density(kit, 'g_kit') > density(bed, 'g_gst'),
    `a kitchen must load harder per m2 than a bedroom — appliances and people ` +
    `(${density(kit, 'g_kit').toFixed(0)} vs ${density(bed, 'g_gst').toFixed(0)} W/m2)`);
});

test('airflow reports sealed vs cross-ventilated', () => {
  const sealed = analyseAirflow(0, 900, NONE, {});
  assert.ok(sealed.every(a => a.ach === 0), 'sealed house must have zero purpose-provided ACH');
  const all = new Set(ALL_OPENINGS.map(o => o.id));
  const open = analyseAirflow(0, 900, all, {});
  const liv = open.find(a => a.room === 'g_liv');
  assert.ok(liv.ach > 0, 'opening everything must ventilate the living room');
  assert.ok(liv.cross, 'living room has openings on more than one orientation -> cross ventilation');
});
