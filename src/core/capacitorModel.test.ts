/**
 * Polarized capacitor model tests.
 *
 * These tests drive the real companion model and the real transient engine.
 * Every expected value is derived from the electrical equations, not from a
 * stored snapshot of previous behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  accumulateCapacitorStats,
  buildCapacitorReadout,
  capacitorBranchCurrent,
  capacitorCompanion,
  capacitorStatsReadout,
  createCapacitorStats,
  getCapacitorParameters,
  initialCapacitorVoltage,
  parallelCapacitance,
  rcChargeVoltage,
  seedCapacitorState,
  seriesCapacitance,
  stepCapacitorThermal,
} from './capacitorModel';
import { DEFAULT_DT, stepSimulation, type SimulationState } from './simulationEngine';
import { buildTopology, solveCircuit } from './solver';
import { validateDoc } from './validate';
import { getExample } from './examples';
import type {
  CircuitComponent,
  CircuitDoc,
  ComponentType,
  Wire,
} from '../models/circuit';

const comp = (
  id: string,
  type: ComponentType,
  value: number,
  x: number,
  y: number,
  extra: Partial<CircuitComponent> = {},
): CircuitComponent => ({
  id,
  type,
  value,
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

/** Ideal-ish capacitor: no ESR/ESL/leakage, no reverse breakdown. */
const idealCap = (extra: Partial<CircuitComponent> = {}) => ({
  esr: 0,
  esl: 0,
  leakageCurrent: 0,
  capacitorModel: 'ideal' as const,
  preset: 'custom',
  ...extra,
});

function newState(doc: CircuitDoc): SimulationState {
  const seeded = seedCapacitorState(doc);
  return {
    doc,
    topology: buildTopology(doc),
    capacitorVoltage: seeded.capacitorVoltage,
    capacitorCurrent: seeded.capacitorCurrent,
    capacitorTemperature: seeded.capacitorTemperature,
    capacitorStats: seeded.capacitorStats,
    inductorCurrent: new Map(),
    simTime: 0,
    status: 'running',
    snapshot: null,
    errors: [],
    warnings: [],
  };
}

function runLast(doc: CircuitDoc, state: SimulationState, steps: number) {
  const topology = state.topology!;
  let snap = stepSimulation(doc, topology, state, DEFAULT_DT);
  for (let i = 1; i < steps; i++) {
    snap = stepSimulation(doc, topology, state, DEFAULT_DT);
  }
  return snap;
}

/** 12 V → 1 kΩ → 1000 µF, closed loop. */
function rcChargeDoc(capExtra: Partial<CircuitComponent> = {}): CircuitDoc {
  return {
    components: [
      comp('v1', 'battery', 12, 0, 0),
      comp('r1', 'resistor', 1000, 200, 0),
      comp('c1', 'polarized-capacitor', 1000e-6, 400, 0, idealCap(capExtra)),
    ],
    wires: [
      wire('w1', ['v1', 0], ['r1', 0]),
      wire('w2', ['r1', 1], ['c1', 0]),
      wire('w3', ['c1', 1], ['v1', 1]),
    ],
  };
}

describe('companion model (implicit, not display-only)', () => {
  const params = getCapacitorParameters(
    comp('c1', 'polarized-capacitor', 1e-3, 0, 0, idealCap()),
  );

  it('has zero current at rest (backward Euler)', () => {
    const companion = capacitorCompanion(params, 1e-4, 0, 0);
    expect(companion.conductance).toBeCloseTo(10, 9); // C/dt
    expect(capacitorBranchCurrent(companion, 0)).toBeCloseTo(0, 12);

    // At the previous voltage the capacitor is not charging.
    const atPrev = capacitorCompanion(params, 1e-4, 1, 0);
    expect(capacitorBranchCurrent(atPrev, 1)).toBeCloseTo(0, 9);
    // One extra volt raises the current by g·1 V = 10 A.
    expect(capacitorBranchCurrent(atPrev, 2)).toBeCloseTo(10, 9);
  });

  it('uses trapezoidal integration when requested', () => {
    const trap = getCapacitorParameters(
      comp('c1', 'polarized-capacitor', 1e-3, 0, 0, {
        ...idealCap(),
        capacitorIntegration: 'trapezoidal',
      }),
    );
    const companion = capacitorCompanion(trap, 1e-4, 0, 0);
    expect(companion.integration).toBe('trapezoidal');
    expect(capacitorBranchCurrent(companion, 1)).toBeCloseTo(20, 6); // 2C/dt
  });

  it('forces backward Euler when ESL is present', () => {
    const withEsl = getCapacitorParameters(
      comp('c1', 'polarized-capacitor', 1e-3, 0, 0, {
        ...idealCap(),
        capacitorIntegration: 'trapezoidal',
        esl: 10e-9,
      }),
    );
    expect(capacitorCompanion(withEsl, 1e-4, 0, 0).integration).toBe(
      'backward-euler',
    );
  });
});

describe('RC charging and discharging (transient engine)', () => {
  it('reaches 63.2 % of the supply after one time constant', () => {
    const doc = rcChargeDoc();
    const state = newState(doc);
    const snap = runLast(doc, state, 10_000); // 1 s = τ = R·C

    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.idealVoltage).toBeGreaterThan(7.5);
    expect(sol.idealVoltage).toBeLessThan(7.65);
    expect(Math.abs(sol.idealVoltage - rcChargeVoltage(12, 0, 1000, 1e-3, 1))).toBeLessThan(
      0.02,
    );
    expect(sol.current).toBeGreaterThan(0.004);
    expect(sol.current).toBeLessThan(0.0047);
    expect(sol.charge).toBeCloseTo(1e-3 * sol.idealVoltage, 9);
    expect(sol.energy).toBeCloseTo(0.5 * 1e-3 * sol.idealVoltage ** 2, 9);
  });

  it('settles near the supply after several time constants', () => {
    const doc = rcChargeDoc();
    const state = newState(doc);
    const snap = runLast(doc, state, 30_000); // 3τ
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.idealVoltage).toBeGreaterThan(11.3);
    expect(sol.idealVoltage).toBeLessThanOrEqual(12);
    expect(Math.abs(sol.current)).toBeLessThan(0.001);
  });

  it('discharges from a stored initial voltage with τ = R·C', () => {
    const doc: CircuitDoc = {
      components: [
        comp('c1', 'polarized-capacitor', 1000e-6, 0, 0, {
          ...idealCap(),
          initialConditionEnabled: true,
          initialVoltage: 12,
        }),
        comp('r1', 'resistor', 1000, 200, 0),
        comp('g1', 'ground', 0, 200, 200),
      ],
      wires: [
        wire('w1', ['c1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 1]),
        wire('w3', ['g1', 0], ['c1', 1]),
      ],
    };
    expect(initialCapacitorVoltage(doc.components[0])).toBe(12);
    const state = newState(doc);
    const snap = runLast(doc, state, 10_000); // 1τ
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.idealVoltage).toBeGreaterThan(4.3);
    expect(sol.idealVoltage).toBeLessThan(4.55);
    expect(sol.current).toBeLessThan(0); // current leaves the + terminal
  });

  it('keeps the legacy non-polarized capacitor behaviour', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 5, 0, 0),
        comp('r1', 'resistor', 1000, 200, 0),
        comp('c1', 'capacitor', 100e-6, 400, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 0]),
        wire('w3', ['c1', 1], ['v1', 1]),
      ],
    };
    const state = newState(doc);
    const snap = runLast(doc, state, 10_000); // τ = 0.1 s → fully charged
    expect(snap.componentData.get('c1')!.voltage).toBeCloseTo(5, 2);
    expect(state.capacitorVoltage.get('c1')).toBeGreaterThan(4.9);
  });
});

describe('DC operating point', () => {
  it('opens the polarized capacitor while preserving its voltage', () => {
    const doc = rcChargeDoc();
    const result = solveCircuit(doc);
    const sol = result.componentData.get('c1')!.capacitor!;
    expect(sol.current).toBeCloseTo(0, 9);
    expect(sol.terminalVoltage).toBeCloseTo(12, 6);
    expect(sol.charge).toBeCloseTo(12e-3, 6);
    expect(sol.energy).toBeCloseTo(0.5 * 1e-3 * 144, 6);
    expect(sol.polarity).toBe('normal');
  });
});

describe('real parasitics in the solve', () => {
  it('includes ESR in the terminal voltage, not just the label', () => {
    const doc = rcChargeDoc({ esr: 1, capacitorModel: 'realistic' });
    const state = newState(doc);
    const snap = runLast(doc, state, 500);
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.esrVoltage).toBeCloseTo(sol.current * 1, 12);
    expect(sol.terminalVoltage).toBeCloseTo(
      sol.idealVoltage + sol.esrVoltage,
      12,
    );
    expect(sol.idealVoltage).toBeLessThan(sol.terminalVoltage);
    expect(sol.esrLoss).toBeCloseTo(sol.current ** 2 * 1, 12);
  });

  it('leaks and slowly self-discharges through the insulation resistance', () => {
    const doc: CircuitDoc = {
      components: [
        comp('c1', 'polarized-capacitor', 1000e-6, 0, 0, {
          ...idealCap(),
          capacitorModel: 'realistic',
          leakageResistance: 1e6,
          initialConditionEnabled: true,
          initialVoltage: 10,
        }),
        comp('g1', 'ground', 0, 0, 200),
      ],
      wires: [wire('w1', ['g1', 0], ['c1', 1])],
    };
    const state = newState(doc);
    const snap = runLast(doc, state, 100);
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.leakageCurrent).toBeCloseTo(1e-5, 8);
    expect(sol.terminalVoltage).toBeLessThan(10);
    expect(sol.terminalVoltage).toBeGreaterThan(9.999);
    expect(state.capacitorVoltage.get('c1')!).toBeLessThan(10);
  });
});

describe('polarity protection', () => {
  const reversedDoc = (): CircuitDoc => ({
    components: [
      comp('v1', 'battery', 12, 0, 0),
      comp('r1', 'resistor', 1000, 200, 0),
      comp('c1', 'polarized-capacitor', 100e-6, 400, 0, {
        ...idealCap(),
        capacitorModel: 'realistic',
        reverseBreakdownVoltage: 1.5,
        failureBehavior: 'breakdown-conduction',
      }),
    ],
    wires: [
      // battery + → resistor → capacitor −
      wire('w1', ['v1', 0], ['r1', 0]),
      wire('w2', ['r1', 1], ['c1', 1]),
      // capacitor + → battery −
      wire('w3', ['c1', 0], ['v1', 1]),
    ],
  });

  it('reports reverse bias without clamping the voltage', () => {
    const doc = reversedDoc();
    const state = newState(doc);
    const snap = runLast(doc, state, 200);
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.idealVoltage).toBeLessThan(0);
    expect(sol.polarity).toBe('reverse');
    expect(sol.reverseVoltage).toBeCloseTo(-sol.idealVoltage, 9);
    expect(Math.abs(sol.idealVoltage)).toBeLessThan(12); // real solved value
  });

  it('conducts through the dielectric after reverse breakdown (realistic mode)', () => {
    const doc = reversedDoc();
    const state = newState(doc);
    const snap = runLast(doc, state, 2500);
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.breakdown).toBe(true);
    expect(sol.reverseVoltage).toBeGreaterThan(1.4);
    expect(sol.reverseVoltage).toBeLessThan(2.2);
  });

  it('never conducts in ideal mode', () => {
    const doc = reversedDoc();
    doc.components[2].capacitorModel = 'ideal';
    const state = newState(doc);
    const snap = runLast(doc, state, 2500);
    const sol = snap.componentData.get('c1')!.capacitor!;
    expect(sol.breakdown).toBe(false);
    expect(sol.reverseVoltage).toBeGreaterThan(2);
  });

  it('flags overvoltage and excessive ripple from solved values', () => {
    const params = getCapacitorParameters(
      comp('c1', 'polarized-capacitor', 100e-6, 0, 0, {
        ...idealCap(),
        ratedVoltage: 25,
        maxRippleCurrent: 0.05,
      }),
    );
    const over = buildCapacitorReadout(params, {
      terminalVoltage: 30,
      current: 0,
      temperature: 25,
      peakCurrent: 0.08,
    });
    expect(over.overvoltage).toBe(true);
    expect(over.voltageRatio).toBeCloseTo(1.2, 9);
    expect(over.overRipple).toBe(true);
    expect(over.rippleRatio).toBeCloseTo(1.6, 9);
  });
});

describe('thermal model and RC helpers', () => {
  it('follows first-order heating from the simulated loss', () => {
    const params = getCapacitorParameters(
      comp('c1', 'polarized-capacitor', 1e-3, 0, 0, {
        ...idealCap(),
        dynamicThermal: true,
        ambientTemp: 25,
        thermalResistance: 50,
        thermalCapacitance: 1,
        maxTemp: 105,
      }),
    );
    const after1s = stepCapacitorThermal(25, 1, params, 1);
    // T∞ = 75 °C, τ = 50 s → T(1 s) ≈ 25.98 °C
    expect(after1s).toBeGreaterThan(25.9);
    expect(after1s).toBeLessThan(26.1);
    const afterLong = stepCapacitorThermal(25, 1, params, 500);
    expect(afterLong).toBeCloseTo(75, 2);
    // No heat → stays at ambient.
    expect(stepCapacitorThermal(90, 0, params, 10)).toBeLessThan(90);
  });

  it('combines series and parallel banks correctly', () => {
    expect(seriesCapacitance([470e-6, 470e-6])).toBeCloseTo(235e-6, 12);
    expect(parallelCapacitance([470e-6, 470e-6])).toBeCloseTo(940e-6, 12);
    expect(seriesCapacitance([])).toBe(0);
  });

  it('derives RMS, peak and ripple frequency from the waveform', () => {
    let stats = createCapacitorStats(0, 0);
    const dt = 1e-3;
    for (let k = 0; k < 200; k++) {
      const t = k * dt;
      const v = Math.sin(2 * Math.PI * 50 * t);
      stats = accumulateCapacitorStats(stats, {
        t,
        voltage: v,
        current: v,
        power: v * v,
        dt,
      });
    }
    const readout = capacitorStatsReadout(stats);
    expect(readout.rmsCurrent).toBeCloseTo(Math.SQRT1_2, 2);
    expect(readout.peakCurrent).toBeCloseTo(1, 2);
    expect(readout.rippleVoltage).toBeCloseTo(2, 1);
    expect(readout.rippleFrequency).toBeGreaterThan(45);
    expect(readout.rippleFrequency).toBeLessThan(55);
  });
});

describe('document validation', () => {
  it('preserves polarized capacitor parameters through JSON', () => {
    const doc: CircuitDoc = {
      components: [
        comp('c1', 'polarized-capacitor', 2200e-6, 0, 0, {
          technology: 'aluminum-electrolytic',
          capacitorModel: 'realistic',
          capacitorIntegration: 'trapezoidal',
          ratedVoltage: 25,
          initialVoltage: 3,
          initialCharge: 6.6e-3,
          initialConditionEnabled: true,
          tolerance: 20,
          esr: 0.05,
          esl: 5e-9,
          leakageCurrent: 1e-5,
          leakageResistance: 2.5e6,
          reverseBreakdownVoltage: 1,
          failureBehavior: 'open',
          maxRippleCurrent: 1.2,
          rippleFrequency: 100000,
          maxTemp: 105,
          dielectricAbsorption: 0.02,
        }),
      ],
      wires: [],
    };
    const result = validateDoc(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.doc) return;
    const c = result.doc.components[0];
    expect(c.type).toBe('polarized-capacitor');
    expect(c.technology).toBe('aluminum-electrolytic');
    expect(c.capacitorModel).toBe('realistic');
    expect(c.capacitorIntegration).toBe('trapezoidal');
    expect(c.initialConditionEnabled).toBe(true);
    expect(c.esr).toBeCloseTo(0.05, 12);
    expect(c.failureBehavior).toBe('open');
    expect(c.leakageResistance).toBeCloseTo(2.5e6, 3);
  });
});

describe('bundled polarized-capacitor examples', () => {
  const ids = [
    'cap-rc-charge',
    'cap-rc-discharge',
    'cap-psu-filter',
    'cap-high-ripple',
    'cap-reverse-polarity',
    'cap-bank',
  ];

  for (const id of ids) {
    it(`builds a solvable, fully connected circuit: ${id}`, () => {
      const example = getExample(id);
      expect(example).not.toBeNull();
      if (!example) return;
      const state = newState(example.doc);
      for (const c of state.topology!.components) {
        expect(c.nodeA).not.toBe('');
        expect(c.nodeB).not.toBe('');
      }
      const snap = runLast(example.doc, state, 100);
      expect(snap.valid, `${id}: ${snap.error ?? 'no error'} ${snap.warnings.join('; ')}`).toBe(true);
      expect(snap.error).toBeNull();
    });
  }

  it('splits voltage across the series pair in the bank example', () => {
    const example = getExample('cap-bank');
    expect(example).not.toBeNull();
    if (!example) return;
    const state = newState(example.doc);
    const snap = runLast(example.doc, state, 20_000); // 2 s
    const byLabel = (label: string) =>
      example.doc.components.find((c) => c.label === label);
    const c3 = byLabel('C3');
    const c4 = byLabel('C4');
    const v3 = c3
      ? (snap.componentData.get(c3.id)?.capacitor?.idealVoltage ?? 0)
      : 0;
    const v4 = c4
      ? (snap.componentData.get(c4.id)?.capacitor?.idealVoltage ?? 0)
      : 0;
    expect(v3 + v4, JSON.stringify({ v3, v4 })).toBeGreaterThan(10);
    expect(Math.abs(v3 - v4)).toBeLessThan(1.5);
  });
});
