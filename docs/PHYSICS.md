# The solvers

What each one computes, what the tests prove, and — more usefully — where each
one stops being trustworthy. Everything here lives in `src/lib/solvers/` as pure
functions with no React, no store and no DOM, which is why the limits can be
stated this precisely.

---

## `sun.ts` — solar position and irradiance

Solar position from `suncalc`; clear-sky direct and diffuse irradiance derived
from air mass; shading from eaves and blinds computed against each opening's
own geometry and orientation. Outdoor temperature follows an asymmetric diurnal
curve — the afternoon lag is real and matters for the thermal model.

Site: latitude −33.8686, longitude 150.9648, UTC+10.

**Proven by test:** January noon solar altitude ≈ 79° in Sydney; clear-sky DNI
between 850 and 1050 W/m²; north-facing glass receives *more* sun in winter than
in summer, which is the southern-hemisphere behaviour that catches people out.

**Limits:** clear sky only. No cloud cover, no weather file, no ground-reflected
component beyond a fixed albedo.

---

## `thermal.ts` — transient lumped capacitance

One RC node per room. Conductance from each surface's U value and area,
capacitance from each material's κ; solar gain through glazing by SHGC and the
shaded fraction; internal gains from occupants and fixtures; ventilation when an
aperture is open. Adaptive sub-stepping keeps it stable when a door opens and
the time constant collapses.

**Proven by test:** a sealed room overheats; the same room fully open tracks the
outdoor curve.

**Limits:** one node per room means no intra-room stratification and no explicit
wall nodes, so the thermal mass of a wall is lumped rather than distributed. It
will get the shape and the timing of a day right, and will understate the phase
lag of a heavy wall.

---

## `acoustics.ts` — RT60, modes, transmission, SPL

Sabine and Eyring reverberation from real surface absorption coefficients at
125 Hz, 500 Hz and 2 kHz, plus furniture absorption area and open apertures
(an open aperture is a perfect absorber, α = 1). Axial room modes. Transmission
loss between rooms from each partition's Rw. Direct-field SPL with interference
between multiple sources.

**Proven by test:** a tiled bathroom reverberates more than a carpeted bedroom;
opening apertures shortens RT60; the lowest axial mode equals c/2L.

**Limits:** the SPL field is free-field. It models direct-path interference
between sources, not modal room response or reflections — so it is honest about
where two speakers cancel and silent about what the room does to that.

---

## `lighting.ts` — lux and beams

Lumen method with a utilisation factor derived from the room index *and* the
room's actual surface reflectances — which is why repainting a room changes its
lux. Targets from AS/NZS 1680 via the active standards pack. Beam cones per
luminaire for the overlay.

**Proven by test:** auto lighting design meets AS/NZS 1680 targets for each room
use.

**Limits:** average illuminance, not a point-by-point grid. It will tell you a
room is under-lit; it will not tell you the corner behind the sofa is.

---

## `airflow.ts` — cross ventilation and stack

Wind-driven cross ventilation plus buoyancy stack, from apertures that are
actually open, with suburban terrain shielding. Checks the NCC 10.6 openable-area
requirement.

**Limits:** an envelope-level model. No CFD, no room-to-room path resistance
beyond aperture area and orientation.

---

## `hvac.ts` — load and duty

Peak cooling load from fabric U values, glazing SHGC, and internal gains; duct
sizing, outlet count and throw from the load.

**Limits:** peak load, not annual energy. Sizing guidance, not a mechanical
design.

---

## `rf.ts` — WiFi coverage

RSSI = EIRP − free-space path loss − the sum of material attenuations along the
actual ray, with real wall-segment intersection rather than a distance
heuristic. Per-band, because attenuation is frequency-dependent.

**Proven by test:** RSSI falls with distance and with intervening walls; 2.4 GHz
penetrates better than 6 GHz.

**Limits:** single-path. No multipath, no reflection gain, no antenna pattern
beyond an isotropic EIRP.

---

## What "material-aware" actually means

`src/lib/model/materials.ts` is the reason the whole thing hangs together. Every
build-up carries, in one record:

* U value and κ, for `thermal.ts`;
* absorption α at 125 / 500 / 2 k and Rw, for `acoustics.ts`;
* RF attenuation per band, for `rf.ts`;
* reflectance, for `lighting.ts`;
* SHGC, for `thermal.ts` and `hvac.ts`.

Fixtures carry absorption area, RF blocking and internal heat gain. So a change
of wall build-up is a single edit that every solver reads, which is the property
that makes "one model, every discipline, one edit" true rather than aspirational.

---

## Standards packs

Nothing in a solver hard-codes a threshold. They ask the active pack in
`src/lib/standards/` (AU / GB / US) or `src/lib/planning/` (NSW / England).
That is why a Redline finding can cite "NCC Volume Two Part 11.2" rather than a
magic number, and why the same engine could review a British house without the
physics changing.
