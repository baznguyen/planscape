# Architectural Analysis Engine — 101 Campbell Street, Fairfield East

A material-aware 3D building analysis app. One building model feeds every discipline
solver, so changing a wall build-up, a floor finish, or opening a window immediately
changes the thermal, acoustic, lighting, airflow, HVAC and WiFi results.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm test             # 12 physics tests (compile solvers first, see below)
```

Tests run against compiled solvers:

```bash
npx tsc --outDir dist-test --module commonjs --target ES2020 \
        --moduleResolution node --skipLibCheck --esModuleInterop \
        src/lib/model/*.ts src/lib/solvers/*.ts
node --test tests/solvers.test.mjs
```

## Architecture

```
src/lib/model/
  materials.ts   Material DB — every build-up carries U, kappa, alpha(125/500/2k),
                 Rw, RF attenuation per band, reflectance, SHGC. Fixtures carry
                 absorption area, RF blocking and internal heat gain.
  building.ts    Rooms, walls and openings for the actual house. Geometry verified
                 against the plan's dimension chains (28.14 x 11.0 m envelope).
src/lib/solvers/ Pure functions, no React — individually unit-testable.
  sun.ts         Solar position, clear-sky irradiance, eave + blind shading,
                 asymmetric diurnal outdoor temperature.
  thermal.ts     Transient lumped-capacitance (RC) model, one node per room, with
                 adaptive sub-stepping for numerical stability.
  acoustics.ts   Sabine/Eyring RT60 from real surface alpha + furniture + open
                 apertures; room modes; transmission loss; SPL interference.
  lighting.ts    Lumen method with utilisation factor from room index AND the
                 room's actual surface reflectances; AS/NZS 1680 targets.
  airflow.ts     Wind-driven cross ventilation + buoyancy stack from OPEN apertures,
                 with suburban terrain shielding; NCC 10.6 openable-area check.
  hvac.ts        Peak cooling load from fabric U-values, glazing SHGC and gains;
                 duct sizing, outlet count, throw.
  rf.ts          RSSI = EIRP - FSPL - sum(material attenuation along the actual ray),
                 with real wall-segment intersection.
src/store/       Zustand — building state, openings, lights, time, overlays.
src/components/  React Three Fiber scene + overlays + UI panels.
```

## How openings propagate

Opening a window or door changes, in the same frame:

| Discipline | Effect |
|---|---|
| Thermal   | ventilation flow term appears; solar gain switches to an open aperture |
| Acoustics | aperture becomes a perfect absorber (alpha = 1) so RT60 drops |
| Airflow   | cross-ventilation detected when apertures face different orientations |
| RF        | the ray no longer pays that wall's attenuation |
| HVAC      | infiltration load changes |

## Verified behaviour (tests)

- Geometry matches the plan schedule (alfresco exactly 29.25 m2).
- Jan noon solar altitude ~79 deg in Sydney; clear-sky DNI 850-1050 W/m2.
- North glass receives more sun in winter than summer (southern hemisphere).
- Sealed rooms overheat; fully open they track outdoor temperature.
- Tiled bathroom reverberates more than a carpeted bedroom; opening apertures
  shortens RT60; lowest axial mode equals c/2L.
- Auto lighting design meets AS/NZS 1680 targets.
- RSSI falls with distance and with intervening walls; 2.4 GHz penetrates
  better than 6 GHz.

## Known limits

- One thermal node per room (no intra-room stratification or explicit wall nodes).
- Acoustic SPL field is free-field: it models direct-path interference between
  sources, not modal room response or reflections.
- Services overlays are code-informed generative layouts, not consultant drawings.
- Clear-sky solar only; no cloud cover or weather file.
