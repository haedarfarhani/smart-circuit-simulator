/**
 * BJT electrical tests against the real solver and transient engine.
 * Every expected value is checked from the solved terminal quantities.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DT, stepSimulation, type SimulationState } from './simulationEngine';
import { EXAMPLE_CIRCUITS } from './examples';
import { channelValue, makeChannel } from '../models/probe';

const makeTestChannel = () => makeChannel('CH1');
import { buildTopology, solveCircuit } from './solver';
import {
  bjtLinearization,
  getBjtParameters,
  stepBjtThermal,
} from './bjtModel';
import type { CircuitComponent, CircuitDoc, ComponentType, Wire } from '../models/circuit';

const comp = (
  id: string,
  type: ComponentType,
  value: number,
  x: number,
  y: number,
  extra: Partial<CircuitComponent> = {},
): CircuitComponent => ({
  id, type, value, x, y, rotation: 0, label: id, ...extra,
});

const wire = (id: string, a: [string, number], b: [string, number]): Wire => ({
  id,
  start: { componentId: a[0], terminalIndex: a[1], point: null },
  end: { componentId: b[0], terminalIndex: b[1], point: null },
  waypoints: [],
});

function newState(doc: CircuitDoc): SimulationState {
  return {
    doc,
    topology: buildTopology(doc),
    capacitorVoltage: new Map(),
    capacitorCurrent: new Map(),
    capacitorTemperature: new Map(),
    capacitorStats: new Map(),
    inductorCurrent: new Map(),
    bjtJunctionTemp: new Map(),
    simTime: 0,
    status: 'running',
    snapshot: null,
    errors: [],
    warnings: [],
  };
}

function settle(doc: CircuitDoc, steps = 800) {
  const state = newState(doc);
  let snap = stepSimulation(doc, state.topology!, state, DEFAULT_DT);
  for (let i = 1; i < steps; i++) {
    snap = stepSimulation(doc, state.topology!, state, DEFAULT_DT);
  }
  return { snap, state };
}

const npnSwitch = (baseOhm: number, collectorOhm: number) : CircuitDoc => ({
  components: [
    comp('v1', 'battery', 5, 0, 0),
    comp('rb', 'resistor', baseOhm, 200, 0),
    comp('q1', 'bjtTransistor', 200, 400, 0, {
      transistorType: 'npn', preset: '2N2222', beta: 200, pMax: 100,
    }),
    comp('rc', 'resistor', collectorOhm, 600, 0),
    comp('gnd', 'ground', 0, 800, 0),
  ],
  wires: [
    wire('w1', ['v1', 0], ['rb', 0]),
    wire('w2', ['rb', 1], ['q1', 0]),
    wire('w3', ['q1', 1], ['rc', 0]),
    wire('w4', ['rc', 1], ['v1', 0]),
    wire('w5', ['q1', 2], ['v1', 1]),
    wire('w6', ['v1', 1], ['gnd', 0]),
  ],
});

describe('BJT model', () => {
  it('mirrors NPN and PNP currents while keeping KCL', () => {
    const npnParams = getBjtParameters(
      comp('q', 'bjtTransistor', 0, 0, 0, { transistorType: 'npn', is: 1e-14, bf: 100, br: 1 }),
    );
    const pnpParams = { ...npnParams, transistorType: 'pnp' as const };
    const npn = bjtLinearization(npnParams, 0.7, 2, 0, 25);
    const pnp = bjtLinearization(pnpParams, -0.7, -2, 0, 25);
    expect(npn.ic).toBeGreaterThan(1e-3);
    expect(pnp.ic).toBeLessThan(-1e-3);
    expect(npn.ic).toBeCloseTo(-pnp.ic, 9);
    expect(npn.ib).toBeCloseTo(-pnp.ib, 9);
    for (const r of [npn, pnp]) {
      expect(Math.abs(r.ib + r.ic + r.ie)).toBeLessThan(1e-12);
      expect(r.beta).toBeGreaterThan(10);
    }
  });

  it('detects cutoff, active and saturation from the junctions', () => {
    const params = getBjtParameters(
      comp('q', 'bjtTransistor', 0, 0, 0, { transistorType: 'npn', is: 1e-14, bf: 100 }),
    );
    expect(bjtLinearization(params, 0, 5, 0, 25).region).toBe('cutoff');
    expect(bjtLinearization(params, 0.65, 5, 0, 25).region).toBe('forward-active');
    expect(bjtLinearization(params, 0.8, 0.1, 0, 25).region).toBe('saturation');
  });

  it('heats according to Cth·dT/dt = P − ΔT/Rth', () => {
    const params = getBjtParameters(
      comp('q', 'bjtTransistor', 0, 0, 0, {
        rth: 50, cth: 1, tAmbient: 25, tMax: 150,
      }),
    );
    expect(stepBjtThermal(25, 1, params, 1)).toBeGreaterThan(25.9);
    expect(stepBjtThermal(25, 1, params, 500)).toBeCloseTo(75, 1);
  });
});

describe('BJT circuits (transient engine)', () => {
  it('saturates the NPN switch and conserves terminal current', () => {
    const doc = npnSwitch(10e3, 220);
    const { snap } = settle(doc, 400);
    const q = snap.componentData.get('q1')!;
    const bjt = q.bjt!;
    expect(bjt.region, JSON.stringify(bjt)).toBe('saturation');
    expect(bjt.ib).toBeGreaterThan(2e-4);
    expect(bjt.ic).toBeGreaterThan(0.01);
    expect(bjt.vce).toBeLessThan(0.6);
    expect(Math.abs(bjt.ib + bjt.ic + bjt.ie)).toBeLessThan(1e-6);
    expect(q.terminalCurrents).toBeDefined();
    expect(q.terminalCurrents![2]).toBeCloseTo(-(bjt.ib + bjt.ic), 9);
    expect(bjt.power).toBeGreaterThan(0);
  });

  it('runs in forward active with a moderate base drive', () => {
    const doc = npnSwitch(220e3, 470);
    const { snap } = settle(doc, 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('forward-active');
    expect(bjt.ic).toBeGreaterThan(1e-3);
    expect(bjt.ic / bjt.ib).toBeGreaterThan(50);
    expect(bjt.vce).toBeGreaterThan(1);
    expect(bjt.power).toBeGreaterThan(0);
  });

  it('cuts off when the base is tied to the emitter', () => {
    const doc = npnSwitch(10e3, 220);
    // replace the base resistor's source side with the emitter node
    doc.wires[0] = wire('w1', ['rb', 0], ['v1', 1]);
    const { snap } = settle(doc, 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('cutoff');
    expect(Math.abs(bjt.ic)).toBeLessThan(1e-5);
    expect(Math.abs(bjt.ib)).toBeLessThan(1e-5);
  });

  it('mirrors the PNP high-side switch', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('rb', 'resistor', 10e3, 200, 100),
        comp('q1', 'bjtTransistor', 50, 400, 0, {
          transistorType: 'pnp', preset: '2N2907', pMax: 100,
        }),
        comp('rl', 'resistor', 100, 600, 100),
        comp('gnd', 'ground', 0, 0, 200),
      ],
      wires: [
        wire('w1', ['v1', 0], ['q1', 2]), // +12 → emitter
        wire('w2', ['q1', 0], ['rb', 0]), // base → resistor
        wire('w3', ['rb', 1], ['v1', 1]), // resistor → ground
        wire('w4', ['q1', 1], ['rl', 0]), // collector → load
        wire('w5', ['rl', 1], ['v1', 1]),
        wire('w6', ['v1', 1], ['gnd', 0]),
      ],
    };
    const { snap } = settle(doc, 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region, JSON.stringify(bjt)).toBe('saturation');
    expect(bjt.ic).toBeLessThan(-0.05);
    expect(bjt.ib).toBeLessThan(0);
    expect(bjt.ie).toBeGreaterThan(0.05);
    expect(bjt.vce).toBeLessThan(0);
    expect(Math.abs(bjt.ib + bjt.ic + bjt.ie)).toBeLessThan(1e-6);
  });

  it('solves the DC operating point consistently', () => {
    const result = solveCircuit(npnSwitch(10e3, 220));
    expect(result.isValid).toBe(true);
    const q = result.componentData.get('q1')!;
    expect(q.bjt).toBeDefined();
    expect(q.bjt!.region, JSON.stringify(q.bjt)).toBe('saturation');
    expect(Math.abs(q.bjt!.ib + q.bjt!.ic + q.bjt!.ie)).toBeLessThan(1e-6);
  });
});

describe('BJT amplifier, switch and multi-device circuits', () => {
  it('identifies reverse-active operation from the junction currents', () => {
    const params = getBjtParameters(
      comp('q', 'bjtTransistor', 0, 0, 0, { transistorType: 'npn', is: 1e-14, bf: 100, br: 2 }),
    );
    // forward-biased base-collector, reverse-biased base-emitter
    expect(bjtLinearization(params, 0.7, 0, 5, 25).region).toBe('reverse-active');
    // 0.2 V is not enough base-emitter drive for noticeable conduction
    expect(bjtLinearization(params, 0.2, 5, 0, 25).region).toBe('cutoff');
  });

  it('conducts more at a higher junction temperature for the same VBE', () => {
    const cold = getBjtParameters(
      comp('q', 'bjtTransistor', 0, 0, 0, { transistorType: 'npn', is: 1e-14, bf: 100 }),
    );
    const hot = { ...cold, tAmbient: 100 };
    const icCold = bjtLinearization(cold, 0.65, 5, 0, 25).ic;
    const icHot = bjtLinearization(hot, 0.65, 5, 0, 100).ic;
    expect(icHot).toBeGreaterThan(icCold * 2);
  });

  it('reports forced beta below the model gain in saturation', () => {
    const { snap } = settle(npnSwitch(10e3, 220), 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('saturation');
    expect(bjt.vce).toBeLessThan(0.4);
    expect(bjt.betaForced).toBeLessThan(200);
    expect(bjt.betaForced).toBeGreaterThan(0);
  });

  it('drives the collector wire with the solved collector current', () => {
    const { snap } = settle(npnSwitch(10e3, 220), 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    // w3 runs from Q1 collector (terminal 1) to RC
    expect(snap.wireCurrents.get('w3') ?? 0).toBeCloseTo(bjt.ic, 6);
  });

  it('tracks the base with an emitter follower', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('r1', 'resistor', 100e3, 200, 0),
        comp('r2', 'resistor', 47e3, 200, 200),
        comp('q1', 'bjtTransistor', 200, 400, 0, {
          transistorType: 'npn', preset: '2N2222', pMax: 100,
        }),
        comp('re', 'resistor', 1e3, 600, 100),
        comp('gnd', 'ground', 0, 0, 400),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['q1', 0]),
        wire('w3', ['r2', 0], ['r1', 1]),
        wire('w4', ['r2', 1], ['v1', 1]),
        wire('w5', ['q1', 1], ['v1', 0]),
        wire('w6', ['q1', 2], ['re', 0]),
        wire('w7', ['re', 1], ['v1', 1]),
        wire('w8', ['v1', 1], ['gnd', 0]),
      ],
    };
    const { snap } = settle(doc, 800);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('forward-active');
    expect(bjt.vbe).toBeGreaterThan(0.5);
    expect(bjt.vbe).toBeLessThan(0.85);
    expect(bjt.ic).toBeGreaterThan(1e-3);
    expect(bjt.vce).toBeGreaterThan(3);
    expect(Math.abs(bjt.ib + bjt.ic + bjt.ie)).toBeLessThan(1e-6);
  });

  it('multiplies current gain in a Darlington pair', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('rb', 'resistor', 1e6, 200, 0),
        comp('q1', 'bjtTransistor', 200, 400, 0, {
          transistorType: 'npn', preset: '2N2222', pMax: 100,
        }),
        comp('q2', 'bjtTransistor', 200, 600, 100, {
          transistorType: 'npn', preset: '2N2222', pMax: 100,
        }),
        comp('rc', 'resistor', 100, 700, -200),
        comp('re', 'resistor', 100, 800, 200),
        comp('gnd', 'ground', 0, 0, 400),
      ],
      wires: [
        wire('w1', ['v1', 0], ['rb', 0]),
        wire('w2', ['rb', 1], ['q1', 0]),
        wire('w3', ['q1', 2], ['q2', 0]),
        wire('w4', ['q1', 1], ['v1', 0]),
        wire('w5', ['v1', 0], ['rc', 0]),
        wire('w5b', ['rc', 1], ['q2', 1]),
        wire('w6', ['q2', 2], ['re', 0]),
        wire('w7', ['re', 1], ['v1', 1]),
        wire('w8', ['v1', 1], ['gnd', 0]),
      ],
    };
    const { snap } = settle(doc, 1000);
    const first = snap.componentData.get('q1')!.bjt!;
    const second = snap.componentData.get('q2')!.bjt!;
    // The second device is driven hard into saturation by the first one's
    // emitter current, so the combined gain is far above a single β.
    expect(second.region).toBe('saturation');
    expect(second.ic).toBeGreaterThan(0.01);
    expect(second.ic / Math.abs(first.ib)).toBeGreaterThan(1000);
    const loop = second.ic * 100 + second.vce + -second.ie * 100;
    expect(Math.abs(loop - 12)).toBeLessThan(0.25);
  });

  it('cuts the PNP switch off when base and emitter share the rail', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('rb', 'resistor', 10e3, 200, 100),
        comp('q1', 'bjtTransistor', 50, 400, 0, {
          transistorType: 'pnp', preset: '2N2907', pMax: 100,
        }),
        comp('rl', 'resistor', 100, 600, 100),
        comp('gnd', 'ground', 0, 0, 200),
      ],
      wires: [
        wire('w1', ['v1', 0], ['q1', 2]),
        wire('w2', ['q1', 0], ['rb', 0]),
        wire('w3', ['rb', 1], ['v1', 0]),
        wire('w4', ['q1', 1], ['rl', 0]),
        wire('w5', ['rl', 1], ['v1', 1]),
        wire('w6', ['v1', 1], ['gnd', 0]),
      ],
    };
    const { snap } = settle(doc, 500);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('cutoff');
    expect(Math.abs(bjt.ic)).toBeLessThan(1e-5);
    expect(Math.abs(bjt.ib)).toBeLessThan(1e-5);
  });

  it('satisfies the DC load-line equation', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('rb', 'resistor', 220e3, 200, 0),
        comp('q1', 'bjtTransistor', 330, 400, 0, {
          transistorType: 'npn', preset: 'BC547', pMax: 100,
        }),
        comp('rc', 'resistor', 470, 600, -100),
        comp('re', 'resistor', 100, 600, 100),
        comp('gnd', 'ground', 0, 0, 400),
      ],
      wires: [
        wire('w1', ['v1', 0], ['rb', 0]),
        wire('w2', ['rb', 1], ['q1', 0]),
        wire('w3', ['v1', 0], ['rc', 0]),
        wire('w4', ['rc', 1], ['q1', 1]),
        wire('w5', ['q1', 2], ['re', 0]),
        wire('w6', ['re', 1], ['v1', 1]),
        wire('w7', ['v1', 1], ['gnd', 0]),
      ],
    };
    const { snap } = settle(doc, 800);
    const bjt = snap.componentData.get('q1')!.bjt!;
    expect(bjt.region).toBe('forward-active');
    const loop = bjt.ic * 470 + bjt.vce + -bjt.ie * 100;
    expect(Math.abs(loop - 12)).toBeLessThan(0.1);
  });

  it('exposes BJT terminal, power and temperature values to scope channels', () => {
    const { snap } = settle(npnSwitch(10e3, 220), 400);
    const bjt = snap.componentData.get('q1')!.bjt!;
    const base = {
      ...makeTestChannel(),
      type: 'current' as const,
      branchId: 'q1',
      branchKind: 'component' as const,
    };
    expect(channelValue({ ...base, branchTerminal: 0 }, snap)).toBeCloseTo(bjt.ib, 9);
    expect(channelValue({ ...base, branchTerminal: 1 }, snap)).toBeCloseTo(bjt.ic, 9);
    expect(channelValue({ ...base, branchTerminal: 2 }, snap)).toBeCloseTo(bjt.ie, 9);
    expect(channelValue({ ...base, branchTerminal: null, quantity: 'power' }, snap)).toBeCloseTo(
      bjt.power,
      9,
    );
    expect(
      channelValue({ ...base, branchTerminal: null, quantity: 'temperature' }, snap),
    ).toBeCloseTo(bjt.tj, 9);
  });

  it('runs every bundled BJT example circuit', () => {
    const examples = EXAMPLE_CIRCUITS.filter((e) => e.id.startsWith('bjt-'));
    expect(examples.length).toBeGreaterThanOrEqual(7);
    for (const example of examples) {
      const { snap } = settle(example.doc, 500);
      expect(snap.valid, example.id).toBe(true);
      const bjts = [...snap.componentData.entries()].filter(([, sol]) => sol.bjt);
      expect(bjts.length, example.id).toBeGreaterThan(0);
      for (const [, sol] of bjts) {
        expect(Number.isFinite(sol.bjt!.ic), example.id).toBe(true);
        expect(
          Math.abs(sol.bjt!.ib + sol.bjt!.ic + sol.bjt!.ie),
          `${example.id} KCL`,
        ).toBeLessThan(1e-6);
      }
      if (example.id === 'bjt-npn-switch') {
        // The LED must be forward biased: a reversed LED leaves the collector
        // floating, which silently hides the switch behind a 0 V / nA readout.
        const q1 = [...snap.componentData.values()].find((s) => s.bjt)!.bjt!;
        expect(q1.region, 'switch saturates').toBe('saturation');
        expect(q1.ic, 'LED conducts').toBeGreaterThan(5e-3);
        expect(q1.vce).toBeLessThan(0.5);
      }
    }
  });
});
