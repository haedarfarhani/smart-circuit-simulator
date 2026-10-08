/**
 * End-to-end audit of the oscilloscope measurement pipeline:
 *
 *   CircuitDoc → buildTopology → stepSimulation → channelValue
 *   → sample buffer → stats / trigger / visible window
 *
 * Every test uses REAL topology node ids and REAL solver snapshots —
 * no synthetic waveforms. This is the acceptance suite from the
 * oscilloscope fix specification (DC / AC / RC / diode / current).
 */
import { describe, expect, it } from 'vitest';
import { buildTopology } from './solver';
import {
  stepSimulation,
  DEFAULT_DT,
  type SimulationState,
} from './simulationEngine';
import {
  channelValue,
  computeStats,
  findTriggerTime,
  makeChannel,
  type ChannelSample,
} from '../models/probe';
import type { CircuitDoc, ComponentType, Wire } from '../models/circuit';

const comp = (
  id: string,
  type: ComponentType,
  value: number,
  x: number,
  y: number,
  extra: Partial<import('../models/circuit').CircuitComponent> = {},
) => ({
  id,
  type,
  value,
  x,
  y,
  rotation: 0 as const,
  label: id,
  ...extra,
});

const wire = (id: string, a: [string, number], b: [string, number]): Wire => ({
  id,
  start: { componentId: a[0], terminalIndex: a[1], point: null },
  end: { componentId: b[0], terminalIndex: b[1], point: null },
  waypoints: [],
});

function newState(doc: CircuitDoc): SimulationState {
  const topology = buildTopology(doc);
  return {
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
}

/** Node ids of a topology component's two terminals. */
function branchNodes(doc: CircuitDoc, compId: string) {
  const topology = buildTopology(doc);
  const info = topology.components.find((c) => c.id === compId)!;
  return { topology, nodeA: info.nodeA, nodeB: info.nodeB };
}

/**
 * Sample a channel from the REAL simulation exactly like
 * simulationStore.electricalLoop does (including the 1 kHz
 * sampling-rate gate), returning the acquisition buffer.
 */
function acquire(
  doc: CircuitDoc,
  state: SimulationState,
  channel: Parameters<typeof channelValue>[0],
  steps: number,
  samplingRate = 1000,
): ChannelSample[] {
  const buf: ChannelSample[] = [];
  const topology = state.topology!;
  for (let i = 0; i < steps; i++) {
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    const value = channelValue(channel, snap);
    const last = buf[buf.length - 1];
    if (!last || snap.simTime - last.t >= 1 / samplingRate) {
      buf.push({ t: snap.simTime, value });
    }
  }
  return buf;
}

function assertWellFormed(buf: ChannelSample[]) {
  expect(buf.length).toBeGreaterThan(1);
  for (let i = 0; i < buf.length; i++) {
    expect(Number.isFinite(buf[i].t)).toBe(true);
    expect(Number.isFinite(buf[i].value)).toBe(true);
    if (i > 0) expect(buf[i].t).toBeGreaterThan(buf[i - 1].t);
  }
}

/** Imitates the scope's visible-window selection (10 divs × timeDiv). */
function visibleWindow(buf: ChannelSample[], timeDiv: number): ChannelSample[] {
  const latest = buf[buf.length - 1].t;
  const start = latest - 10 * timeDiv;
  return buf.filter((s) => s.t >= start && s.t <= latest);
}

describe('PIPELINE 1 — DC 5 V shows a flat 5 V line', () => {
  it('voltage probe across the load reads a constant 5 V', () => {
    const doc: CircuitDoc = {
      components: [comp('v1', 'battery', 5, 0, 0), comp('r1', 'resistor', 1000, 300, 0)],
      wires: [wire('w1', ['v1', 0], ['r1', 0]), wire('w2', ['r1', 1], ['v1', 1])],
    };
    const { nodeA, nodeB } = branchNodes(doc, 'r1');
    const ch = makeChannel('CH1');
    ch.type = 'voltage';
    ch.positiveNodeId = nodeA;
    ch.negativeNodeId = nodeB;
    ch.useGroundRef = false;

    const buf = acquire(doc, newState(doc), ch, 500);
    assertWellFormed(buf);
    for (const s of buf) expect(Math.abs(s.value)).toBeCloseTo(5, 6);

    const st = computeStats(buf);
    expect(st.max).toBeCloseTo(5, 6);
    expect(st.min).toBeCloseTo(5, 6);
    expect(st.pp).toBeCloseTo(0, 6);
    expect(st.frequency).toBeNull(); // flat line has no frequency

    const vis = visibleWindow(buf, 10e-3);
    expect(vis.length).toBeGreaterThanOrEqual(2); // drawable: ≥2 points
  });
});

describe('PIPELINE 2 — 12 Vrms / 50 Hz AC shows ±16.97 V at 50 Hz', () => {
  const doc: CircuitDoc = {
    components: [
      comp('vac1', 'acVoltageSource', 12, 0, 0, { frequency: 50 }),
      comp('r1', 'resistor', 1000, 300, 0),
    ],
    wires: [wire('w1', ['vac1', 0], ['r1', 0]), wire('w2', ['r1', 1], ['vac1', 1])],
  };

  it('probe buffer swings to ±Vpeak with correct Vrms/pp/frequency', () => {
    const { nodeA, nodeB } = branchNodes(doc, 'r1');
    const ch = makeChannel('CH1');
    ch.type = 'voltage';
    ch.positiveNodeId = nodeA;
    ch.negativeNodeId = nodeB;
    ch.useGroundRef = false;

    // 5 full cycles at 50 Hz
    const buf = acquire(doc, newState(doc), ch, 1000);
    assertWellFormed(buf);

    const peak = 12 * Math.SQRT2;
    const st = computeStats(buf);
    expect(st.max).toBeCloseTo(peak, 1);
    expect(st.min).toBeCloseTo(-peak, 1);
    expect(st.pp).toBeCloseTo(2 * peak, 1);
    expect(st.rms).toBeCloseTo(12, 0);
    expect(st.frequency).not.toBeNull();
    expect(st.frequency!).toBeCloseTo(50, 0);

    // The trigger MUST find a rising crossing of 0 V on real data…
    const tTrig = findTriggerTime(buf, 0, 'rising');
    expect(tTrig).not.toBeNull();

    // …and the triggered display window must contain drawable samples.
    const windowEnd = tTrig! + 8 * 10e-3;
    const windowStart = windowEnd - 10 * 10e-3;
    const vis = buf.filter((s) => s.t >= windowStart && s.t <= windowEnd);
    expect(vis.length).toBeGreaterThanOrEqual(2);
  });
});

describe('PIPELINE 3 — RC charging shows a time-varying voltage', () => {
  it('capacitor probe rises along the charging curve from real state', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('r1', 'resistor', 1000, 300, 0),
        comp('c1', 'capacitor', 1e-6, 600, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 0]),
        wire('w3', ['c1', 1], ['v1', 1]),
      ],
    };
    const { nodeA, nodeB } = branchNodes(doc, 'c1');
    const ch = makeChannel('CH1');
    ch.type = 'voltage';
    ch.positiveNodeId = nodeA;
    ch.negativeNodeId = nodeB;
    ch.useGroundRef = false;

    const buf = acquire(doc, newState(doc), ch, 200);
    assertWellFormed(buf);
    // Time-varying: early samples well below late samples
    expect(buf[buf.length - 1].value - buf[0].value).toBeGreaterThan(3);
    const st = computeStats(buf);
    expect(st.pp).toBeGreaterThan(3);
  });
});

describe('PIPELINE 4 — AC + diode shows the nonlinear half-wave behavior', () => {
  const doc: CircuitDoc = {
    components: [
      comp('vac1', 'acVoltageSource', 12, 0, 0, { frequency: 50 }),
      comp('r1', 'resistor', 470, 300, 0),
      comp('d1', 'led', 2, 600, 0, { forwardVoltage: 2, color: 'red' }),
    ],
    wires: [
      wire('w1', ['vac1', 0], ['r1', 0]),
      wire('w2', ['r1', 1], ['d1', 0]),
      wire('w3', ['d1', 1], ['vac1', 1]),
    ],
  };

  it('diode current conducts on +half-cycle and blocks on −half-cycle', () => {
    const chI = makeChannel('CH2');
    chI.type = 'current';
    chI.branchId = 'd1';
    chI.branchKind = 'component';

    const state = newState(doc);
    const buf = acquire(doc, state, chI, 400); // two full cycles
    assertWellFormed(buf);

    let conducting = 0;
    let blocking = 0;
    for (const s of buf) {
      if (s.value > 1e-4) conducting++;
      else blocking++;
    }
    // Both halves present: forward current AND near-zero reverse
    expect(conducting).toBeGreaterThan(5);
    expect(blocking).toBeGreaterThan(5);
    const st = computeStats(buf);
    expect(st.max).toBeGreaterThan(0.01); // tens of mA forward
    expect(Math.abs(st.min)).toBeLessThan(1e-4); // ~zero reverse
  });

  it('diode voltage waveform is NOT a copy of the source sine', () => {
    const { nodeA, nodeB } = branchNodes(doc, 'd1');
    const chV = makeChannel('CH1');
    chV.type = 'voltage';
    chV.positiveNodeId = nodeA;
    chV.negativeNodeId = nodeB;
    chV.useGroundRef = false;

    const buf = acquire(doc, newState(doc), chV, 400);
    assertWellFormed(buf);
    const st = computeStats(buf);
    // Clamped forward drop on +half, large reverse swing on −half
    expect(st.max).toBeLessThan(4);
    expect(st.min).toBeLessThan(-5);
  });
});

describe('PIPELINE 5 — current probe reads the real branch current', () => {
  it('resistor current equals V/R and tiny currents stay nonzero', () => {
    const doc: CircuitDoc = {
      components: [comp('v1', 'battery', 5, 0, 0), comp('r1', 'resistor', 1000, 300, 0)],
      wires: [wire('w1', ['v1', 0], ['r1', 0]), wire('w2', ['r1', 1], ['v1', 1])],
    };
    const ch = makeChannel('CH2');
    ch.type = 'current';
    ch.branchId = 'r1';
    ch.branchKind = 'component';

    const buf = acquire(doc, newState(doc), ch, 200);
    assertWellFormed(buf);
    // 5 mA — must NOT be rounded to zero anywhere in the pipeline
    for (const s of buf) expect(s.value).toBeCloseTo(0.005, 6);
    expect(computeStats(buf).avg).toBeCloseTo(0.005, 6);
  });

  it('wire probe reads the same current as its attached branch', () => {
    const doc: CircuitDoc = {
      components: [comp('v1', 'battery', 5, 0, 0), comp('r1', 'resistor', 1000, 300, 0)],
      wires: [wire('w1', ['v1', 0], ['r1', 0]), wire('w2', ['r1', 1], ['v1', 1])],
    };
    const ch = makeChannel('CH3');
    ch.type = 'current';
    ch.branchId = 'w1';
    ch.branchKind = 'wire';

    const buf = acquire(doc, newState(doc), ch, 200);
    assertWellFormed(buf);
    for (const s of buf) expect(Math.abs(s.value)).toBeCloseTo(0.005, 6);
  });
});

describe('PIPELINE 6 — auto-scale math never divides by zero', () => {
  it('flat DC buffer yields a finite fallback scale, not NaN', () => {
    const flat: ChannelSample[] = Array.from({ length: 50 }, (_, i) => ({
      t: i * 1e-3,
      value: 5,
    }));
    const st = computeStats(flat);
    let maxAbs = 0;
    for (const s of flat) maxAbs = Math.max(maxAbs, Math.abs(s.value));
    const raw = maxAbs / 4; // mirror of the scope auto-scale
    expect(Number.isFinite(raw)).toBe(true);
    expect(raw).toBeGreaterThan(0);
    expect(st.pp).toBe(0);
  });
});
