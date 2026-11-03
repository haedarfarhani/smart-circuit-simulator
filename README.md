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
| LED | Forward drop + color emission |
| Lamp | Temperature-dependent R, glow |
| DC motor / AC motor | Electromechanical readout |
| Ground | 0 V reference |

---

## 🖼️ Screenshots

> Add your actual screenshots here (`docs/screenshots/` recommended).

- Circuit Builder
- Oscilloscope
- Real-time simulation
- Learning mode

---

## ⚡ Quick Start

```bash
git clone https://github.com/haedarfarhani/smart-circuit-simulator.git
cd smart-circuit-simulator
npm install
npm run dev
```

Open `http://localhost:5173`.

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm test` | Run unit tests (Vitest, 150+ tests) |
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
