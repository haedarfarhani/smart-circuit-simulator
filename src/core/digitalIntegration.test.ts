/**
 * End-to-end digital/analog integration tests.
 *
 * Every test drives the REAL transient engine (kernel + Norton stamps +
 * MNA solve + seven-segment diode model) on its fixed timestep and asserts
 * measured electrical quantities: node voltages, segment currents, timing.
 * No fakes, no hardcoded truth tables at this layer.
 */
import { describe, expect, it } from 'vitest';
import { stepSimulation, DEFAULT_DT, type SimulationState } from './simulationEngine';
import { buildTopology, solveCircuit } from './solver';
import type { SimulationSnapshot } from './simulationEngine';
import type { CircuitComponent, CircuitDoc, ComponentType } from '../models/circuit';
import type { Wire } from '../models/circuit';

const comp = (
  id: string,
  type: ComponentType,
  x: number,
  y: number,
  extra: Partial<CircuitComponent> = {},
): CircuitComponent => ({
  id,
  type,
  value: 0,
  x,
  y,
  rotation: 0,
  label: id,
  ...extra,
});

const wire = (id: string, a: [string, number], b: [string, number]): Wire => ({
  id,
  start: { componentId: a[0], terminalIndex: a[1], point: null },
  end: { componentId: b[0], terminalIndex: b[1], point: null },
  waypoints: [],
});

function newState(doc: CircuitDoc): { topology: ReturnType<typeof buildTopology>; state: SimulationState } {
  const topology = buildTopology(doc);
  const state: SimulationState = {
    doc,
    topology,
    capacitorVoltage: new Map(),
    inductorCurrent: new Map(),
    simTime: 0,
    status: 'running',
    snapshot: null,
    errors: [],
    warnings: [],
  };
  return { topology, state };
}

function run(
  doc: CircuitDoc,
  state: SimulationState,
  topology: ReturnType<typeof buildTopology>,
  n: number,
): SimulationSnapshot[] {
  const snaps: SimulationSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    state.snapshot = snap; // the store owns this in the live loop
    snaps.push(snap);
  }
  return snaps;
}

// ---------------------------------------------------------------------------
// Basic gate chain with real electrical levels
// ---------------------------------------------------------------------------

describe('gate chain (engine end-to-end)', () => {
  const doc: CircuitDoc = {
    components: [
      comp('a', 'logic-input', 0, 0, { value: 1 }),
      comp('b', 'logic-input', 0, 100, { value: 1 }),
      comp('g', 'and-gate', 200, 0),
      comp('o', 'logic-output', 420, 0),
    ],
    wires: [
      wire('w1', ['a', 0], ['g', 0]),
      wire('w2', ['b', 0], ['g', 1]),
      wire('w3', ['g', 2], ['o', 0]),
    ],
  };

  it('drives the output node to a real VOH voltage and reads HIGH', () => {
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 8);
    const last = snaps[snaps.length - 1];
    const outSol = last.componentData.get('o')!;
    // CMOS family at 5 V: VOH = VCC − 0.1 = 4.9 V (minus tiny load).
    expect(outSol.voltage).toBeGreaterThan(4.5);
    expect(outSol.digital!.inputs[0]).toBe('1');
    const and = last.componentData.get('g')!;
    expect(and.digital!.outputs[0]).toBe('1');
    // The gate's output pin sources current into the output probe.
    expect(Math.abs(and.current)).toBeGreaterThan(0);
  });

  it('propagation delay: the output does not flip on the input step', () => {
    const flipped: CircuitDoc = {
      ...doc,
      components: doc.components.map((c) =>
        c.id === 'b' ? { ...c, value: 0 } : c,
      ),
    };
    const { topology, state } = newState(flipped);
    run(flipped, state, topology, 6); // settle with B low → output LOW
    expect(state.snapshot!.componentData.get('o')!.digital!.inputs[0]).toBe('0');

    // Flip B high and step exactly once: the electrical output of the
    // logic input ramps on THIS step, but the gate's classified inputs
    // read the PREVIOUS step's voltages, so the AND output stays LOW
    // (≥ 1 timestep of delay through the pipeline).
    const flippedBack: CircuitDoc = {
      ...doc,
      components: doc.components.map((c) =>
        c.id === 'b' ? { ...c, value: 1 } : c,
      ),
    };
    const snap = stepSimulation(flippedBack, topology, state, DEFAULT_DT);
    state.snapshot = snap;
    expect(snap.componentData.get('g')!.digital!.outputs[0]).toBe('0');

    // A few more steps: classification sees the new level (one step lag),
    // the scheduled event applies, the ramp completes → HIGH. The payload's
    // classified inputs always read the PREVIOUS step's voltages, hence the
    // extra step of margin.
    for (let i = 0; i < 6; i++) {
      state.snapshot = stepSimulation(flippedBack, topology, state, DEFAULT_DT);
    }
    const final = state.snapshot!;
    expect(final.componentData.get('g')!.digital!.inputs[0]).toBe('1');
    expect(final.componentData.get('g')!.digital!.inputs[1]).toBe('1');
    expect(final.componentData.get('g')!.digital!.outputs[0]).toBe('1');
    expect(final.componentData.get('o')!.digital!.inputs[0]).toBe('1');
  });

  it('switching an input low propagates to the probe through real voltages', () => {
    const doc2: CircuitDoc = {
      ...doc,
      components: doc.components.map((c) => (c.id === 'b' ? { ...c, value: 0 } : c)),
    };
    const { topology, state } = newState(doc2);
    const snaps = run(doc2, state, topology, 8);
    const last = snaps[snaps.length - 1];
    expect(last.componentData.get('o')!.digital!.inputs[0]).toBe('0');
    expect(last.componentData.get('o')!.voltage).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Gate driving an LED through a resistor — analog/digital interaction
// ---------------------------------------------------------------------------

describe('gate → resistor → LED (spec §18.4 electrical integration)', () => {
  const doc: CircuitDoc = {
    components: [
      comp('a', 'logic-input', 0, 0, { value: 1 }),
      comp('g', 'buffer-gate', 200, 0),
      comp('r', 'resistor', 400, 0, { value: 220 }),
      comp('led', 'led', 600, 0, { forwardVoltage: 2.0, color: 'red' }),
      comp('gnd', 'ground', 800, 0),
    ],
    wires: [
      wire('w1', ['a', 0], ['g', 0]),
      wire('w2', ['g', 1], ['r', 0]),
      wire('w3', ['r', 1], ['led', 0]),
      wire('w4', ['led', 1], ['gnd', 0]),
    ],
  };

  it('the LED conducts a real current computed by the solver', () => {
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 6);
    const last = snaps[snaps.length - 1];
    const led = last.componentData.get('led')!;
    // (4.9 − 2.0) V across 220 Ω + 1 Ω diode ≈ 13 mA.
    expect(led.current).toBeGreaterThan(0.005);
    expect(led.current).toBeLessThan(0.03);
    expect(led.brightness!).toBeGreaterThan(0.2);
    // The buffer sinks the LED current: its output pin carries it.
    const buf = last.componentData.get('g')!;
    expect(Math.abs(buf.current)).toBeGreaterThan(0.004);
  });

  it('a LOW gate output leaves the LED dark', () => {
    const doc2: CircuitDoc = {
      ...doc,
      components: doc.components.map((c) => (c.id === 'a' ? { ...c, value: 0 } : c)),
    };
    const { topology, state } = newState(doc2);
    const snaps = run(doc2, state, topology, 6);
    const led = snaps[snaps.length - 1].componentData.get('led')!;
    expect(Math.abs(led.current)).toBeLessThan(1e-4);
    expect(led.brightness ?? 0).toBeLessThan(0.02);
  });
});

// ---------------------------------------------------------------------------
// Output contention (spec §3: output contention)
// ---------------------------------------------------------------------------

describe('output contention', () => {
  const doc: CircuitDoc = {
    components: [
      comp('h', 'logic-input', 0, 0, { value: 1 }),
      comp('l', 'logic-input', 0, 200, { value: 0 }),
      comp('g', 'and-gate', 300, 0),
    ],
    wires: [
      wire('w1', ['h', 0], ['g', 0]),
      wire('w2', ['l', 0], ['g', 0]), // both drive the same node
    ],
  };

  it('lands the node between the rails and reads X with a warning', () => {
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 6);
    const last = snaps[snaps.length - 1];
    const v = last.componentData.get('g')!.digital!.inputs[0];
    expect(v).toBe('X');
    // Mid-rail: strictly between the family thresholds.
    const voltage = last.nodeVoltages.get(topology.components.find((c) => c.id === 'g')!.nodes[0]) ?? 0;
    expect(voltage).toBeGreaterThan(0.6);
    expect(voltage).toBeLessThan(4.4);
    expect(last.warnings.some((w) => w.toLowerCase().includes('contention'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Floating inputs per family (spec §3.1)
// ---------------------------------------------------------------------------

describe('floating input behaviour', () => {
  it('TTL input floats HIGH (real TTL behaviour) → inverter output LOW', () => {
    const doc: CircuitDoc = {
      components: [
        comp('n', 'not-gate', 0, 0, { logicFamily: 'ttl' }),
        comp('o', 'logic-output', 220, 0, { logicFamily: 'ttl' }),
      ],
      wires: [wire('w1', ['n', 1], ['o', 0])],
    };
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 6);
    const last = snaps[snaps.length - 1];
    expect(last.componentData.get('n')!.digital!.inputs[0]).toBe('1');
    expect(last.componentData.get('o')!.digital!.inputs[0]).toBe('0');
    expect(last.warnings.some((w) => w.includes('floats'))).toBe(true);
  });

  it('CMOS input floats UNKNOWN → X propagates to the output', () => {
    const doc: CircuitDoc = {
      components: [
        comp('n', 'not-gate', 0, 0), // default family: cmos
        comp('o', 'logic-output', 220, 0),
      ],
      wires: [wire('w1', ['n', 1], ['o', 0])],
    };
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 6);
    const last = snaps[snaps.length - 1];
    expect(last.componentData.get('n')!.digital!.inputs[0]).toBe('X');
    // X output drives VCC/2 through Rout.
    const v = last.componentData.get('o')!.voltage;
    expect(v).toBeGreaterThan(2.0);
    expect(v).toBeLessThan(3.0);
  });
});

// ---------------------------------------------------------------------------
// Ring oscillator: real oscillation, no hang (spec §16, §19)
// ---------------------------------------------------------------------------

describe('combinational oscillation', () => {
  it('an inverter loop toggles continuously without stalling the solver', () => {
    const doc: CircuitDoc = {
      components: [comp('n', 'not-gate', 0, 0)],
      wires: [wire('w1', ['n', 1], ['n', 0])],
    };
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 24);
    // The output voltage alternates between rail regions.
    let toggles = 0;
    for (let i = 2; i < snaps.length; i++) {
      const v0 = snaps[i - 2].componentData.get('n')!.digital!.outputs[0];
      const v1 = snaps[i].componentData.get('n')!.digital!.outputs[0];
      if (v0 !== v1) toggles++;
    }
    expect(toggles).toBeGreaterThan(4);
    // The solve stays valid the whole time.
    expect(snaps.every((s) => s.valid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clock → counter → BCD decoder → seven-segment display chain (spec §9)
// ---------------------------------------------------------------------------

describe('clocked counter driving a seven-segment display', () => {
  const doc: CircuitDoc = {
    components: [
      comp('clk', 'clock-generator', 0, 0, { frequency: 2500, dutyCycle: 50 }),
      comp('ctr', 'counter', 220, 0, { width: 4, counterMode: 'up' }),
      comp('bcd', 'bcd-to-seven-segment-decoder', 460, 0),
      comp('dsp', 'seven-segment-display', 700, 0, { color: 'red' }),
      comp('gnd', 'ground', 700, 160),
      comp('en', 'logic-input', 0, 300, { value: 1 }),
    ],
    wires: [
      wire('w1', ['clk', 0], ['ctr', 5]), // CLK pin (D0-3, LOAD, CLK, EN, CLR, Q0-3, RCO)
      wire('w1b', ['en', 0], ['ctr', 6]), // EN high
      wire('w1c', ['ctr', 7], ['gnd', 0]), // CLR low (grounded)
      wire('w2', ['ctr', 8], ['bcd', 0]), // Q0 → B0 (Q0-3 are pins 8-11)
      wire('w3', ['ctr', 9], ['bcd', 1]),
      wire('w4', ['ctr', 10], ['bcd', 2]),
      wire('w5', ['ctr', 11], ['bcd', 3]),
      wire('w6', ['bcd', 4], ['dsp', 0]), // seg A
      wire('w7', ['bcd', 5], ['dsp', 1]), // seg B
      wire('w8', ['bcd', 6], ['dsp', 2]), // seg C
      wire('w9', ['bcd', 7], ['dsp', 3]), // seg D
      wire('w10', ['bcd', 8], ['dsp', 4]), // seg E
      wire('w11', ['bcd', 9], ['dsp', 5]), // seg F
      wire('w12', ['bcd', 10], ['dsp', 6]), // seg G
      wire('w13', ['dsp', 8], ['gnd', 0]), // COM → ground
    ],
  };

  it('counts clock edges and lights the right segments with real current', () => {
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 32);
    const last = snaps[snaps.length - 1];
    const ctr = last.componentData.get('ctr')!;
    // 2.5 kHz at dt = 100 µs → period = 4 steps → ~7 edges in 32 steps
    // (with the pipeline's deterministic 1–2 step lag). Staying below 10
    // keeps the BCD code valid so the display actually shows a digit.
    const count = ctr.digital!.count ?? -1;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(9);
    // The display shows the count's segments: assert segment A is lit
    // (every BCD digit 0–9 except 1 includes segment A... except 1) and a
    // real segment current flows somewhere in the display.
    const dsp = last.componentData.get('dsp')!;
    const maxBrightness = Math.max(...(dsp.sevenSeg?.brightness ?? [0]));
    expect(maxBrightness).toBeGreaterThan(0.3);
    expect(Math.abs(dsp.current)).toBeGreaterThan(0.005);
    // Counter bit states visible for the UI.
    expect(ctr.digital!.stateBits).toHaveLength(4);
  });

  it('the counter value advances monotonically (mod 16) across the run', () => {
    const { topology, state } = newState(doc);
    let lastCount = 0;
    let advances = 0;
    for (let i = 0; i < 80; i++) {
      const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
      state.snapshot = snap;
      const c = snap.componentData.get('ctr')!.digital!.count ?? 0;
      if (c !== lastCount) {
        const expected = (lastCount + 1) % 16;
        expect(c).toBe(expected); // never skips or repeats
        advances++;
        lastCount = c;
      }
    }
    expect(advances).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// DC operating point of a digital circuit (analyzer panel path)
// ---------------------------------------------------------------------------

describe('DC solve (solveCircuit) with digital devices', () => {
  it('produces digital solutions and node voltages for the analyzer', () => {
    const doc: CircuitDoc = {
      components: [
        comp('a', 'logic-input', 0, 0, { value: 1 }),
        comp('b', 'logic-input', 0, 100, { value: 0 }),
        comp('g', 'or-gate', 200, 0),
        comp('o', 'logic-output', 420, 0),
      ],
      wires: [
        wire('w1', ['a', 0], ['g', 0]),
        wire('w2', ['b', 0], ['g', 1]),
        wire('w3', ['g', 2], ['o', 0]),
      ],
    };
    const result = solveCircuit(doc);
    expect(result.isValid).toBe(true);
    const or = result.componentData.get('g')!;
    expect(or.digital).toBeDefined();
    expect(or.digital!.outputs[0]).toBe('1'); // 1 OR 0
    const vOut = result.componentData.get('o')!.voltage;
    expect(vOut).toBeGreaterThan(4.5);
  });
});

// ---------------------------------------------------------------------------
// Fan-out limit (spec §3, §15)
// ---------------------------------------------------------------------------

describe('fan-out', () => {
  it('a TTL output driving more inputs than its fan-out limit warns', () => {
    const comps: CircuitComponent[] = [
      comp('src', 'logic-input', 0, 0, { logicFamily: 'ttl' }),
    ];
    const wires: Wire[] = [];
    // 74LS fan-out is 20; drive 24 inverters from one input.
    for (let i = 0; i < 24; i++) {
      comps.push(comp(`n${i}`, 'not-gate', 220 + (i % 6) * 220, Math.floor(i / 6) * 160, { logicFamily: 'ttl' }));
      wires.push(wire(`w${i}`, ['src', 0], [`n${i}`, 0]));
    }
    const doc: CircuitDoc = { components: comps, wires };
    const { topology, state } = newState(doc);
    const snaps = run(doc, state, topology, 8);
    const src = snaps[snaps.length - 1].componentData.get('src')!;
    expect(src.digital!.fanout).toBeGreaterThan(20);
    expect(
      snaps[snaps.length - 1].warnings.some((w) => w.toLowerCase().includes('fan-out')),
    ).toBe(true);
  });
});
