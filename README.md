# ⚡ Smart Circuit Simulator

<p align="center">
  <strong>Build. Simulate. Measure. Learn.</strong>
</p>

<p align="center">
  A modern, interactive electrical circuit simulator with real time-domain simulation,
  current-flow visualization, waveform analysis, and a professional oscilloscope.
</p>

<p align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=flat&logo=github&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</p>

---

## 🚀 Overview

**Smart Circuit Simulator** is a browser-based circuit simulation and education platform
for students, developers, and electronics enthusiasts.

Build circuits visually, run real-time simulation, observe current flow,
and analyze signals with an integrated oscilloscope.

No backend. No installation. No account. Just open it and start building.

> **Live demo:** `https://haedarfarhani.github.io/smart-circuit-simulator/`
> (enable **Settings → Pages → Source: GitHub Actions** after forking)

---

## ✨ Key Features

### 🔌 Interactive Circuit Builder

- Drag & drop components, click-to-place
- Wire with terminals, bend points, orthogonal auto-routing
- Infinite canvas: grid, snap, zoom (10%–400%), pan
- Move, marquee select, rotate (R), duplicate, copy/paste, undo/redo
- Inspector for designator, value, frequency, phase, color
- Autosave to `localStorage`, JSON export/import with validation
- Dark/light theme, English/Persian (RTL), keyboard accessible

### ⚡ Physics-Based Simulation

Real electrical relationships — not visual-only animation:

- Ohm's Law, KCL, KVL
- Nodal linear solver + time-domain integration (fixed `dt = 100 µs`, Backward Euler for L/C)
- DC / AC voltage sources (frequency, phase, offset), current source
- Capacitor, solenoid/inductor state, diode / LED forward drop, lamp, motors
- Fixed simulation clock independent of `requestAnimationFrame`
- Invalid circuits stop with a human-readable explanation

### 🔋 Polarized Capacitors

A first-class `polarized-capacitor` part shares the capacitor engine but adds the
real behaviour of electrolytic, tantalum and polymer parts:

- `Vc = V(+) − V(−)`; positive current enters the `+` terminal
- Datasheet presets (1 µF … 2200 µF) plus aluminum electrolytic, tantalum,
  polymer and custom technologies
- ESR and ESL inside the companion model (not display-only), so the transient
  solve sees the real terminal voltage; ESL forces backward Euler for stability
- Leakage/insulation resistance, tolerance, ripple-current rating and a
  first-order thermal model (`Cth·dT/dt = P_loss − ΔT/Rth`)
- Ideal and realistic safety models: reverse bias, overvoltage, over-ripple,
  reverse-breakdown conduction / open / short, and reverse-bias duration are
  reported from solved values — the voltage is never clamped or polarity
  silently flipped
- Live charge, energy, ESR drop/loss, RMS/peak/ripple, temperature and state in
  the inspector; Vc and Ic probes on CH1–CH4; canvas energy and warning badges
- Initial voltage/charge conditions, bilingual (EN/FA) explanations, and six
  editable examples: RC charge, RC discharge, bridge-rectifier reservoir,
  high-ripple ESR heating, reverse polarity, and a series/parallel bank

Measured values always come from the simulated waveform. RC helpers
(`τ = R·C`, charge to 63.2 %, series/parallel equivalents) are available for
learning and are used in the examples.

### 🌊 Real-Time Current Flow

- Direction follows calculated branch current (conventional current)
- Particle speed follows magnitude
- Junctions split according to actual branch currents
- No fake or pre-programmed animation — every layer reads the same `SimulationSnapshot`

### 📟 Professional Oscilloscope

Renders only the real probe ring buffers from the simulation store:

- CH1–CH4, voltage / current probes
- Time/Div, Volts/Div, Amps/Div, auto scale
- Trigger: auto / normal / single, rising / falling
- Live RMS, Vpp, frequency, period
- Real-time waveform rendering

Example:

```text
12 Vrms AC @ 50 Hz

Vpeak ≈ 16.97 V
Vpp   ≈ 33.94 V
Period ≈ 20 ms
```

---

## 💡 Components

| Component | Notes |
|---|---|
| Resistor | Ohmic, power readout |
| Capacitor | Time-domain state, blocks DC |
| Solenoid (L) | Winding R + L, stored-energy readout |
| Battery (DC source) | Ideal DC voltage |
| AC voltage source | `f`, phase, offset |
| Current source | Ideal DC |
| Switch | Open / closed |
| Diode | Forward drop model |
| Zener Diode | Complete piecewise-linear + Shockley-avalanche breakdown, thermal integration, presets |
| Transistor (BJT) | NPN/PNP, 3-terminal Ebers-Moll (default) or simplified model, operating-region detection, datasheet presets, thermal model, curve analyzer |
| LED | Forward drop + color emission |
| Lamp | Temperature-dependent R, glow |
| DC motor / AC motor | Electromechanical readout |
| Ground | 0 V reference |

---

## 🔌 Bipolar Junction Transistor (BJT)

The transistor is a **three-terminal nonlinear device** solved inside the same
MNA system as diodes, Zeners and the rest of the circuit. It is not a switch
approximation: each Newton iteration linearises the device around its actual
base, collector and emitter voltages.

### Terminals and polarity

| Terminal | Index | NPN | PNP |
|---|---|---|---|
| Base (B) | 0 | control current in | control current out |
| Collector (C) | 1 | controlled current in | controlled current out |
| Emitter (E) | 2 | total current out | total current in |

The symbol arrow follows the emitter: outward for NPN, inward for PNP.
Terminal currents are signed positive into the device, so
`IB + IC + IE = 0` holds numerically for both polarities.

### Models

- **Ebers-Moll transport model** (default): `IF = IS·(exp(VBE/(NF·VT)) − 1)`,
  `IR = IS·(exp(VBC/(NR·VT)) − 1)`, forward/reverse gains `BF`, `BR`,
  Early effect `VAF`, collector leakage, and temperature-scaled `IS` and β.
  Junction limiting (0.15 V per Newton step) and exponential clamping keep the
  solve stable.
- **Simplified educational model**: smooth tanh transitions between cutoff,
  active and saturation using β, turn-on VBE and VCE(sat). No hard switching.

Both models share the same 3×3 numerical Jacobian (`bjtLinearization`), used by
both the DC solver and the transient engine. The matrix rows satisfy KCL and are
translation-invariant, so a floating or grounded emitter is handled alike.

### Operating regions

Cutoff, forward active, saturation, reverse active and a **breakdown warning**.
The cutoff/active boundary is derived from the junction current (1 nA
conduction), not a fixed 0.7 V threshold, so IS, NF and temperature all shift it.
Ratings produce warnings; an exact avalanche model is intentionally not claimed.

### Measurements, power and thermal

The snapshot carries VBE, VBC, VCE, IB, IC, IE, β, forced β, power (`VBE·IB +
VCE·IC`, no double counting), junction temperature and thermal state. A
first-order model advances `Cth·dTj/dt = Pdiss − (Tj − Tamb)/Rth`; temperature
feeds back into IS and β. Exceeding Tj(max) is a warning, never an automatic
destruction of the part.

### Presets

NPN: 2N2222, 2N3904, BC547, BC548, BC337, TIP31C.
PNP: 2N2907, 2N3906, BC557, BC558, BC327, TIP32C.
Parameters follow common published SPICE/datasheet typical values; they are
educational, not guaranteed production specifications. Every field is editable.

### Inspector, analyzer, scope and examples

The inspector shows live cards, region badge, model/rating/thermal fields,
probe buttons and educational text (English/Persian). The characteristic
analyzer sweeps the real model for `IB–VBE`, `IC–VCE` (base-current family) and
`IC–IB`, with a live Q point, log scale, zoom/pan and CSV export. Transistor
base/collector/emitter currents, power and Tj can be assigned to oscilloscope
channels. Examples: NPN LED switch, PNP high-side switch, common emitter,
emitter follower, Darlington pair, common base and DC load line.

### Known limitations

- No Gummel-Poon high-current roll-off, base/collector/emitter resistances or
  junction capacitances; those parameters are not exposed because they are not
  simulated.
- Breakdown is a rating warning only.
- Reverse Early voltage is stored for model round-tripping but only the forward
  Early effect changes the current.

---

## ⚡ Zener Diode

The Zener is a two-terminal nonlinear device solved inside the same MNA system
as the other semiconductors. Its component id is `zenerDiode` (the hyphenated
`zener-diode` alias is accepted when loading older files), designator prefix
`DZ`, and terminals `0 = Anode (A)`, `1 = Cathode (K)`.

### Sign convention

`Vd = Va − Vk`, `Id > 0` flows Anode → Cathode (forward), `Id < 0` flows
Cathode → Anode (leakage / breakdown). Dissipated power is `|Vd · Id|`, so a
Zener regulating 5.1 V at 40 mA reports about 0.2 W regardless of polarity.

### Models

| Model | Behaviour |
|---|---|
| Ideal | Ideal clamp at `Vf` / `Vz`; useful for teaching, not for ripple analysis |
| Piecewise-linear (default) | `Id = (Vd − Vf)/rdf` forward; `J = Izk + (Vrev − Vzk)/rz` in breakdown with `Vzk = Vz − rz·(Izt − Izk)`; linear leakage below the knee |
| Advanced | Shockley forward junction plus a smooth avalanche term `Ib·exp((Vrev − Vz)/Vb)`, with exponential, current and voltage limiting |
| Custom | The same equations driven entirely by user-entered parameters |

Both nonlinear models are linearised every Newton iteration (differential
conductance + Norton current) and stamped into the existing matrix — no second
solver and no fixed-voltage-source shortcut. Junction step limiting and a
convergence check keep high-voltage sweeps stable.

### Operating regions and measurements

Forward conduction, reverse blocking with real leakage, Zener/avalanche
breakdown, and overload / thermal-warning states. The snapshot exposes terminal
voltage, current, power, power ratio, region (`forward`, `blocking`,
`breakdown`), effective dynamic resistance, temperature-corrected `Vz(Tj)`,
junction temperature and warning flags. The inspector adds a power-margin bar
and a live `Vz(Tj)` readout.

### Temperature

`Vz(Tj) = Vz + α·(Tj − 25 °C)`, where α can be entered as **mV/°C, V/°C or
%/°C**. Low-voltage true Zeners (e.g. BZX55C2V4) carry a negative coefficient;
avalanche-dominated parts are positive. Dynamic thermal simulation integrates
`Cth·dTj/dt = Pdiss − (Tj − Ta)/Rth` with the fixed simulation step; with it
disabled the junction stays at the configured ambient temperature. `Tj,max`
drives the thermal warning; exceeding a rating never destroys the part.

### Presets

1N4733A (5.1 V), 1N4734A (5.6 V), 1N4735A (6.2 V), 1N4736A (6.8 V),
1N4737A (7.5 V), 1N4738A (8.2 V), 1N4739A (9.1 V), 1N4740A (10 V),
1N4742A (12 V), 1N4744A (15 V), plus the 2.4 V and 3.3 V BZX55C low-voltage
parts. Values follow common published typical figures (`Izt`, `Izk`, `rz`,
leakage, 1 W or 500 mW rating); they are educational starting points, not
guaranteed manufacturer limits, and every field remains editable — including
arbitrary voltages such as 2.4 V, 4.7 V, 9.1 V or 24 V.

### Inspector, analyzer, scope and examples

The inspector provides preset/model selectors, electrical parameters, leakage,
power rating, temperature coefficient with unit, ambient temperature, dynamic
thermal settings and the embedded analyzer. The I-V analyzer sweeps the actual
model (forward, leakage and breakdown) with linear/log current scale, hover
readout, live operating point and CSV export. Zener voltage, currents, power and
junction temperature can be assigned to oscilloscope channels.

Bundled, editable examples: basic regulator, line regulation (6–24 V input),
load regulation, overvoltage protection, AC clipper, bidirectional clipper,
voltage reference and an I-V test bench.

### Known limitations

- The piecewise-linear model joins leakage to the knee in one step; the knee
  current `Izk` and the leakage current are separate parameters, so the curve
  has a small discontinuity at `Vzk`. The advanced model is smooth.
- The avalanche term in the advanced model is an educational calibration
  against `Izt`, `Izk` and `rz`, not a manufacturer-specific compact model.
- Frequency-domain AC analysis uses a fixed small-signal `rz` for the Zener
  (see `acSolver.ts`) rather than linearising around the DC operating point, so
  it does not distinguish blocking from breakdown.
- Series lead inductance, junction capacitance and reverse-recovery charge are
  not modelled.
- Temperature warnings are advisory; thermal failure is a display state, not a
  permanent device destruction.

---

## 🖼️ Screenshots

> Add your actual screenshots here (`docs/screenshots/` recommended).

- Circuit Builder
- Oscilloscope
- Real-time simulation
- Learning mode

---

## 🎨 Design System & Responsive Layout

The interface is built on a centralized design-token system (`src/styles/tokens.css`) with
separate palettes for interface chrome and electrical visualization.

### Themes

- **Dark / Light / System** — switched in the header or Settings dialog, persisted, with
  system-preference detection and a pre-paint boot script (no theme flash on load).
- Electrical visualization colors (current, +V/−V, AC, ground, overload, short, inactive)
  are user-customizable in **Settings → Visualization colors**, exposed as `--viz-*` tokens.
- A toggleable **color legend** (View menu or the canvas chip) explains every wire color.

### Responsive breakpoints

| Range | Layout |
|---|---|
| ≥ 1440px (`wide`) | Full toolbar, persistent library + inspector, resizable bottom panel |
| 1024–1439px (`desktop`) | Compact toolbar, narrower library, canvas priority |
| 640–1023px (`tablet`) | Drawer-based library/inspector over the canvas, bottom navigation dock |
| < 640px (`mobile`) | Compact header, component library & properties as full-height drawers, floating dock (Library · Wire · Run · Properties · Oscilloscope), bottom-panel as a sheet |

Touch is first-class on tablet/mobile: pinch-to-zoom and two-finger pan on the canvas,
44px minimum touch targets, and sheet overlays with backdrops.

### Internationalization

English (LTR) and Persian (RTL, Vazirmatn) with logical CSS properties throughout — the
whole workspace mirrors in RTL while circuit coordinates and electrical symbols stay
unchanged.

### Keyboard shortcuts

`V/W` tools · `R` rotate · `Shift+R` mirror · `Del` delete · `Ctrl+Z/Y` undo/redo ·
`Ctrl+C/V/D` copy/paste/duplicate · `Ctrl+A` select all · `Ctrl+N/S/O` new/export/import ·
`Ctrl±/0` zoom · `Space`+drag pan · `Esc` cancel · `?` shortcuts dialog

### Console, measurements & onboarding

The bottom panel has **Simulation / Oscilloscope / Measurements / Console** tabs. The
console aggregates solver errors and warnings (`role="log"`); the measurements tab shows
live V/I/P cards for the selection; a 6-step onboarding with a one-click sample circuit
runs on first visit.

---

## ⚡ Quick Start

```bash
git clone https://github.com/haedarfarhani/smart-circuit-simulator.git
cd smart-circuit-simulator
npm install
npm run dev
```

Open `http://localhost:3000`.

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm test` | Run unit tests (Vitest, 180+ tests) |
| `npm run typecheck` | TypeScript check only |

---

## 🧠 Architecture

Physics is separated from rendering. One snapshot drives everything:

```text
Circuit Builder
      ↓
Circuit Topology (geometry → nodes / branches)
      ↓
Circuit Solver (DC + AC instantaneous network)
      ↓
SimulationSnapshot (t, node V, branch I, component V/I/P)
      ↓
┌──────────────┬───────────────┐
│ Current Flow │ Oscilloscope  │
│ Lamp / Motor │ Analyzer      │
│ Energy layer │ Probes        │
└──────────────┴───────────────┘
```

```text
src/
  app/          # App shell
  components/   # canvas, layout, panels, dialogs
  core/         # solver, acSolver, simulationEngine, flow, analyzer,
                # routing, geometry, validation, learningEngine, practiceEngine
  models/       # circuit document, probe / oscilloscope model
  store/        # zustand: circuit + history, simulation, probes, ui
  hooks/        # keyboard shortcuts
  utils/        # clipboard, pointer tracking
```

Deployment: `.github/workflows/deploy.yml` builds, typechecks, tests,
and deploys `dist/` to GitHub Pages. Vite uses `base: './'` so it works
under any Pages path.

---

## 🎓 Learning & Practice

Early versions of guided learning are already in the codebase
(`learningEngine`, `practiceEngine`, Learning / Practice panels):

- Interactive tutorials and circuit explanations
- Guided experiments and measurement exercises
- Practice challenges and oscilloscope training
- Troubleshooting exercises

---

## 🗺️ Roadmap

- [x] **Phase 1 — Editor:** canvas, library, wiring, editing, persistence, i18n
- [x] **Phase 2 — Simulation core:** DC solver, AC time-domain engine, branch currents, probes, oscilloscope, analyzer
- [x] **Phase 2.5 — Visualization:** current flow, lamp glow, motor rotor, stored energy, live measurements
- [ ] **Phase 3 — Advanced components:** transistor model, improved motor/diode models, AC analysis views
- [ ] **Phase 4 — Education:** full lessons, challenges, auto-validation
- [ ] **Phase 5 — Tools:** save/load library, import/export sharing, frequency-domain views, Web Worker solver, perf tuning

Engineering rule: every visible control does something real. No placeholder buttons,
no fake currents.

---

## 🛠️ Tech Stack

React · TypeScript · Vite · Zustand · SVG / Canvas · Vitest · GitHub Pages

Runs entirely in the browser.

---

## 🎯 Project Goals

```text
Circuit Design
      +
Physics Simulation
      +
Real-Time Visualization
      +
Oscilloscope
      +
Interactive Learning
```

The goal is not to animate a circuit — the visualization is driven by the simulation itself.

---

## 🤝 Contributing

Contributions, ideas, bug reports, and feature requests are welcome.

Fork → Create Branch → Make Changes → Pull Request

Please run `npm run typecheck` and `npm test` before opening a PR.

---

## 📄 License

MIT — see `LICENSE` (or the license file in your fork).

<p align="center">Built for learning, experimentation, and understanding electronics.</p>
<p align="center">⚡ <strong>Build circuits. See the physics. Understand the signal.</strong></p>
