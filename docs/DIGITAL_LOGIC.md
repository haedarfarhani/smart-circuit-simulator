# Digital Logic Simulation System — Engineering Report

Complete hybrid analog/digital simulation for Smart Circuit Simulator. This
document covers the required deliverables: architecture, component inventory,
electrical model documentation, testing, and known limitations.

---

## A. Architecture Report

### A.1 Existing simulation architecture (Phase 1 audit findings)

- **Engine**: hand-rolled Modified Nodal Analysis (dense matrix,
  Gauss-Jordan with partial pivoting) in `src/core/solver.ts` (DC/steady
  state) and `src/core/simulationEngine.ts` (transient, Backward Euler,
  fixed timestep `dt`, default 100 µs). No external math libraries.
- **Components are plain data** (`models/circuit.ts`); the solver dispatches
  on `comp.type`. No component classes.
- **Topology**: geometric — a UnionFind merges component terminals, wire
  endpoints and wire waypoints on a 10-unit grid (`buildTopology`).
- **Nonlinear devices** (diode, zener, BJT) are solved by a fixed-point
  outer loop: build linearised network → solve → update device state → repeat.
- **Loop**: `electricalLoop()` in `simulationStore.ts` accumulates wall time,
  runs fixed-`dt` steps (≤ 4000 per frame), and publishes ONE Zustand update
  per frame. Renderers read snapshots; they never drive the engine.
- **No event scheduler existed** — digital timing required a new mechanism.

### A.2 Chosen integration strategy: co-scheduled event-driven kernel

A deterministic event-driven digital kernel (`src/core/digital/kernel.ts`)
runs **inside** each analog timestep. One kernel advance per step:

1. **Apply due events** — scheduled output transitions (propagation delays).
2. **Classify inputs** — each digital input pin reads its node voltage from
   the previous step's solved voltages and maps it through the family
   thresholds: `v < VIL → '0'`, `v > VIH → '1'`, between → `'X'`. An
   undriven node (driver analysis, §C.3) maps per family: TTL floats HIGH,
   CMOS is X, with a floating-input warning. Async PRE/CLR pins default
   inactive when floating (an unwired preset must not corrupt state).
3. **Evaluate devices** — pure functions (`devices.ts`): combinational
   logic, clock-edge detection for sequential devices, setup/hold checks.
4. **Schedule outputs** — any output change is queued at `t + max(1,
   round(tpd/dt))·dt` (deterministic, time-ordered, per-step stable sort).
5. **Advance clock generators** — time-driven from `simTime` (period,
   duty, initial phase, enable/pause).
6. **Compute electrical output volts** — VOH/VOL targets with linear
   rise/fall transitions; X drives VCC/2.

The minimum one-timestep propagation delay makes zero-delay feedback loops
impossible: an inverter loop oscillates at a measurable rate that the
event-storm guard observes (queue cap 2048 events; sustained switching
> 500 transitions/s raises an oscillation warning) instead of hanging.

### A.3 Electrical output modeling

Every digital output is a **Norton equivalent to ground** stamped into the
existing MNA build: conductance `g = 1/Rout` + current source `g·Vout`.
No extra matrix rows. Consequences emerge from the normal solve: voltage
sag under load, output contention landing between the rails (downstream
inputs read X), gate→resistor→LED current sharing, and real segment
currents in seven-segment displays (each segment is a piecewise-linear
diode, reusing the analog engine's diode model).

Inputs load their node per family: CMOS ≈ open + Cin; TTL presents its real
IIL/IIH currents — which makes TTL fan-out limits physically real.

### A.4 Timing model

- Propagation delays quantize to the analog timestep (min 1 step).
- Rise/fall: linear ramps of the stamped Norton voltage over the family
  tr/tf (quantized; sub-`dt` transitions settle in one step).
- Setup/hold: a data input changing on the same timestep as the active
  clock edge is flagged as a violation; outputs go X for 5·dt (documented
  metastability approximation, not a physical model). Checks engage only
  after a 6-step power-up window (first driver voltages all appear at once
  — not a real violation) and the hold check is one-shot per edge.
- The timestep `dt` is user-adjustable (1 µs–1 ms) in Simulation → clock.

---

## B. Component Inventory

All 32 types registered in `SYMBOLS`, whitelisted in `validate.ts`, and
translated in both `en` and `fa`.

| Category | Components |
|---|---|
| **Basic Gates** (8) | `and-gate`, `or-gate`, `not-gate`, `nand-gate`, `nor-gate`, `xor-gate`, `xnor-gate`, `buffer-gate` — configurable 2–4 inputs (NOT/buffer fixed 1) |
| **Combinational** (10) | `multiplexer` (2/4/8/16:1, optional multi-bit width), `demultiplexer` (1:2–1:16), `decoder` (2→4, 3→8, 4→16, EN, active-low option), `encoder` (4/8/16 inputs, standard + priority, valid flag), `half-adder`, `full-adder`, `adder` (1–32 bit ripple, CI/CO/overflow), `subtractor` (borrow + overflow), `comparator` (GT/EQ/LT), `alu` (16 ops, CO/ZF/NF/VF flags) |
| **Sequential** (9) | `sr-latch` (NOR/NAND via active-low), `d-latch`, `sr-flip-flop`, `d-flip-flop`, `jk-flip-flop`, `t-flip-flop` (edge-select, async preset/clear, setup/hold), `register` (parallel load/EN/clear), `shift-register` (SISO/SIPO/PISO/PIPO, left/right), `counter` (up/down/updown, ring, Johnson; load, EN, RCO terminal count) |
| **Displays** (2) | `seven-segment-display` (8 real LED segments + COM, common anode/cathode, per-segment brightness from actual current, color), `bcd-to-seven-segment-decoder` (BCD blanking on 10–15, optional hex mode, CA/CC output polarity) |
| **Logic I/O & Clock** (3) | `logic-input` (canvas click toggles, family-configurable output), `logic-output` (0/1/X/Z + measured voltage), `clock-generator` (frequency/duty/phase, enable, rise/fall) |

**Logic signal model** (`core/digital/logic.ts`): `0 / 1 / X / Z` with full
4-value truth tables. X and Z are never silently converted; the only Z→value
mapping is the explicit, documented family floating-input behaviour.
Driver resolution flags 0-vs-1 contention.

**Configuration** (Inspector, per component): logic family, implicit VCC,
propagation delay, bit width, data-line count, counter/shift modes, clock
edge, active-low polarity, priority, signed mode, hex mode, common type,
duty cycle, enable.

---

## C. Electrical Model Documentation

### C.1 Logic families (`core/digital/families.ts`)

Values are **datasheet-TYPICAL educational figures** (TI CMOS/74xx data-book
conventions), rounded. They are not device-specific guarantees; output
resistance in particular is a linearised approximation.

| Family | VCC (nom/range) | VIL/VIH | VOH/VOL | Rout H/L (Ω) | tpd | IIL/IIH | Fan-out | Float |
|---|---|---|---|---|---|---|---|---|
| CMOS (generic) | 5 V / 3–15 | 0.3/0.7·VCC | VCC−0.1 / 0.05 | 200/100 | 25 ns | ~±1 µA | 50 | X |
| CD4000 | 10 V / 3–15 | 0.3/0.7·VCC | VCC−0.05 / 0.05 | 500/300 | 100 ns | ~±1 µA | 50 | X |
| 74HC | 5 V / 2–6 | 0.3/0.7·VCC | VCC−0.1 / 0.1 | 60/45 | 10 ns | ~±1 µA | 50 | X |
| 74HCT | 5 V / 4.5–5.5 | 0.8 / 2.0 V | VCC−0.1 / 0.1 | 60/45 | 12 ns | ~±1 µA | 50 | X |
| 74AC | 5 V / 3–6 | 0.3/0.7·VCC | VCC−0.1 / 0.1 | 25/20 | 5 ns | ~±1 µA | 50 | X |
| TTL (74xx) | 5 V / 4.75–5.25 | 0.8 / 2.0 V | 3.4 / 0.2 | 130/12 | 11 ns | −1.6 mA / 40 µA | 10 | 1 |
| 74LS | 5 V / 4.75–5.25 | 0.8 / 2.0 V | 3.4 / 0.35 | 110/20 | 10 ns | −0.4 mA / 20 µA | 20 | 1 |
| 74ALS | 5 V / 4.75–5.25 | 0.8 / 2.0 V | 3.4 / 0.35 | 90/15 | 6 ns | −0.1 mA / 20 µA | 20 | 1 |

Every family also carries IOH/IOL limits, Cin, tr/tf, static power
per gate, and setup/hold windows. A supply outside the family range is
clamped and flagged with a warning.

### C.2 Supply model

**Implicit supply** (user-approved design decision): gates have no VCC/GND
pins. Each component carries a configurable VCC (family-nominal default);
outputs swing 0..VCC; power is computed from VCC. Circuit ground (0 V
reference) comes from a Ground component when present. A circuit with ONLY
digital devices and no Ground uses a **virtual reference rail** so no logic
node is clamped to 0 V. Mixed analog/digital circuits without a Ground
component fall back to the analyzer's node choice — the Console warns users
to add a Ground for well-defined levels in that case.

### C.3 Driver / floating analysis

Per topology (cached, invalidated when the document changes): sources,
ground, and every non-Z digital output seed a "driven" set that propagates
through resistive bridges (resistor, lamp, closed switch, motors, diodes).
Nodes outside the set are floating → family floating behaviour + warning.
Contention (0 and 1 drivers on one node) produces a warning and X.

### C.4 Power consumption (estimates, clearly labeled)

- **CMOS dynamic**: `P ≈ α·Cload·VCC²·f` where α comes from per-device
  tracked switching activity (transitions/s in a 1 s window) and
  `Cload = 10 pF stray + n·Cin`. This is the textbook estimate, not a
  measurement.
- **TTL static**: family staticPower per gate; CMOS static ≈ leakage-level.
- Displayed in the Inspector as "Supply power (est.)".

### C.5 Currents and loading

Per-pin currents (positive into the device) are computed from the solved
node voltages and feed telemetry and the wire-current animation through
`terminalCurrents`. TTL inputs source IIL toward a low driver — the
fan-out warning (`n loads > family max`) uses real connected input counts.

---

## D. Implementation Report

### New files

| File | Purpose |
|---|---|
| `src/core/digital/logic.ts` | LogicValue, 4-value tables, driver resolution, majority |
| `src/core/digital/families.ts` | 8 family specs, threshold/drive resolution |
| `src/core/digital/types.ts` | type registry, per-instance params, defaults |
| `src/core/digital/devices.ts` | pin layouts + evaluation for all 31 device kinds |
| `src/core/digital/kernel.ts` | event queue, classification, driver analysis, warnings, power |
| `src/core/digital/stamping.ts` | Norton stamps, pin currents, fan-out, 7-seg diodes, telemetry payloads |
| `src/core/digitalSymbols.tsx` | symbols, dynamic pin geometry, live body renderer |
| `src/components/canvas/DigitalOverlays.tsx` | per-pin state dots, display segments, bit readouts |
| `src/components/layout/DigitalInspector.tsx` | family/supply/config/telemetry panel |
| `src/core/examplesDigital.ts` | 18 example circuits |
| Tests | `logic.test.ts`, `devices.test.ts`, `digitalIntegration.test.ts`, `examplesDigital.test.ts` |

### Modified files

`models/circuit.ts` (32 types + 15 config fields), `core/geometry.ts`
(dynamic terminals, stale-index fallback), `core/symbols.tsx` (5 new
categories, dynamic `terminalsFor`, merged symbol table), `core/solver.ts`
(generalized N-pin `ComponentInfo.nodes`, digital DC operating point with
voltage-feedback passes, Norton stamps, digital solutions), `core/
simulationEngine.ts` (kernel advance per step, digital/seven-seg stamps,
telemetry, virtual reference rail), `core/acSolver.ts` (digital excluded
from small-signal AC, documented), `store/simulationStore.ts` (digital
state plumbing, `setDt`, warning dedup), `store/circuitStore.ts`
(digital defaults on add, dangling-wire pruning on width change),
`core/validate.ts` (whitelist), `store/probe.ts` (`logic` channels, duty/edge
stats), `components/panels/Oscilloscope.tsx` (step rendering), `components/
layout/Inspector.tsx` + `LibrarySidebar.tsx` (digital integration),
`components/panels/SimulationControls.tsx` (dt selector),
`styles/global.css`, `i18n.ts` (~110 new keys × 2 locales).

---

## E. Testing Report

**All 335 tests pass** (`npm test`): 229 pre-existing analog/store/UI tests
untouched and green, plus 106 new digital tests.

| Suite | Coverage |
|---|---|
| `logic.test.ts` (16) | AND/OR/XOR/NOT/NAND/NOR/XNOR/buffer full tables incl. X/Z; majority; driver contention |
| `devices.test.ts` (56) | Every gate truth table; MUX/DEMUX/decoder/encoder (incl. priority, X-select); ripple adder + carry≠overflow; subtractor borrow; comparator X-propagation; ALU ops + flags; SR latch incl. invalid; D latch; D/JK/T/SR FF edges, async preset/clear, setup/hold violation → metastable X; register load/hold/clear; shift SIPO/PISO; counter up/down/updown rollover+underflow, RCO, load, enable, ring + Johnson sequences; BCD decoder blanking/hex/anode |
| `digitalIntegration.test.ts` (13) | Full-engine: VOH voltages on real nodes, propagation delay ≥ 1 step, gate→resistor→LED real current, contention mid-rail + warning, TTL float-HIGH vs CMOS float-X, inverter-loop oscillation without stall, clock→counter→BCD→7-seg chain with real segment brightness, monotonic counting, DC solve, fan-out warning |
| `examplesDigital.test.ts` (19) | Every bundled digital example: DC solve valid, 40 transient steps valid, no contention, no X outputs |

CI (`npm run typecheck` → `npm test` → `npm run build`) passes; production
build succeeds. Live smoke test (browser): the Counter → Display example
runs with the count and display segments tracking the clock, per-pin state
dots and wire currents animating from real snapshot data.

---

## F. Known Limitations (approximations, documented on purpose)

1. **Delay quantization** — propagation delays and rise/fall times quantize
   to the analog timestep; a 10 ns delay at dt = 100 µs behaves as one
   step. Lower `dt` (Simulation tab) for fast clocks.
2. **Implicit supply** — no supply pins, no decoupling, no supply-rail
   bounce. VCC is a per-component parameter.
3. **Metastability** — a bounded X window after a setup/hold violation;
   it does not predict analog metastability behaviour.
4. **Power estimates** — CMOS dynamic power is the α·C·V²·f textbook
   estimate from tracked switching activity, not a measurement.
5. **No AC small-signal for digital** — AC analysis loads digital nodes
   with Cin only; logic thresholds are strongly nonlinear by nature.
6. **TTL input model** — two-state loading (IIL when low, IIH when high),
   not a full input-transistor characteristic.
7. **Ripple adders** — behaviorally correct with a single device tpd, not
   per-stage ripple timing.
8. **Floating control pins** — EN/LOAD/SL/UD follow family floating
   behaviour (TTL high, CMOS X + warning); async PRE/CLR default inactive
   so unwired pins cannot corrupt state.
9. **Datasheet-typical values** — family parameters are educational
   approximations, not device-specific guarantees; no DIP-package models
   (7400/7474 pin-accurate ICs deferred).
10. **Two-digit display** — not included; the single-digit counter→decoder→
    display chain demonstrates the full path (multi-digit = two chains).
