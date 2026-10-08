/**
 * Validation tests for the real time-domain simulation engine.
 *
 * Every test drives the actual electrical solver on its fixed
 * timestep and asserts the calculated electrical state — never
 * a timer, animation frame or predefined behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  stepSimulation,
  DEFAULT_DT,
  ledBrightness,
  motorRpm,
  type SimulationState,
} from './simulationEngine';
import { buildTopology } from './solver';
import { acInstantaneous, acPeakFromRms } from './solver';
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

const wire = (
  id: string,
  a: [string, number],
  b: [string, number],
): Wire => ({
  id,
  start: { componentId: a[0], terminalIndex: a[1], point: null },
  end: { componentId: b[0], terminalIndex: b[1], point: null },
  waypoints: [],
});

/** Build a fresh engine state for a document. */
function newState(doc: CircuitDoc) {
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

/** Advance the simulation by `n` timesteps, returning every snapshot. */
function run(doc: CircuitDoc, state: SimulationState, n: number) {
  const topology = state.topology!;
  const snaps = [];
  for (let i = 0; i < n; i++) {
    snaps.push(stepSimulation(doc, topology, state, DEFAULT_DT));
  }
  return snaps;
}

describe('DC operating point (spec §15.1: 12 V DC + 6 Ω → I = 2 A)', () => {
  it('solves I = V/R exactly', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('r1', 'resistor', 6, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);

    expect(snap.valid).toBe(true);
    const resistor = snap.componentData.get('r1')!;
    const source = snap.componentData.get('v1')!;
    // I = 12 V / 6 Ω = 2 A
    expect(Math.abs(resistor.current)).toBeCloseTo(2, 6);
    expect(Math.abs(source.current)).toBeCloseTo(2, 6);
    expect(Math.abs(resistor.voltage)).toBeCloseTo(12, 6);
    expect(resistor.power).toBeCloseTo(24, 6); // P = V·I = 24 W
  });
});

describe('AC source (spec §2: 12 Vrms, 50 Hz → Vpeak ≈ 16.97 V)', () => {
  it('derives the peak from the RMS value', () => {
    expect(acPeakFromRms(12)).toBeCloseTo(12 * Math.SQRT2, 12);
    expect(acPeakFromRms(12)).toBeCloseTo(16.97, 2);
  });

  it('produces a real sinusoid that swings to ±16.97 V, not ±12 V', () => {
    const doc: CircuitDoc = {
      components: [
        comp('vac1', 'acVoltageSource', 12, 0, 0, { frequency: 50 }),
        comp('r1', 'resistor', 1000, 300, 0),
      ],
      wires: [
        wire('w1', ['vac1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['vac1', 1]),
      ],
    };
    const { topology, state } = newState(doc);

    let maxV = 0;
    let minV = 0;
    // One full cycle = 20 ms = 200 steps of 100 µs
    for (let i = 0; i < 200; i++) {
      const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
      const v = snap.componentData.get('vac1')!.voltage;
      maxV = Math.max(maxV, v);
      minV = Math.min(minV, v);
    }
    const peak = 12 * Math.SQRT2;
    expect(maxV).toBeCloseTo(peak, 2); // ≈ +16.97 V
    expect(minV).toBeCloseTo(-peak, 2); // ≈ −16.97 V
    // The waveform must NOT be a ±12 V square-ish toggle
    expect(maxV).toBeGreaterThan(12.5);
    expect(minV).toBeLessThan(-12.5);
  });

  it('honours phase and offset: v(t) = Voffset + Vpeak·sin(2πft + φ)', () => {
    // phase = 90° → v(0) = peak; offset = 1 V shifts everything up
    expect(acInstantaneous(12, 50, Math.PI / 2, 1, 0)).toBeCloseTo(
      12 * Math.SQRT2 + 1,
      9,
    );
    expect(acInstantaneous(12, 50, 0, 0, 0)).toBeCloseTo(0, 9);

    const doc: CircuitDoc = {
      components: [
        comp('vac1', 'acVoltageSource', 12, 0, 0, {
          frequency: 50,
          phaseDeg: 90,
          offset: 1,
        }),
        comp('r1', 'resistor', 1000, 300, 0),
      ],
      wires: [
        wire('w1', ['vac1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['vac1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    // t = 100 µs: v = 1 + 16.97·sin(2π·50·1e-4 + π/2) ≈ 1 + 16.97·cos(0.0314)
    const expected = 1 + 12 * Math.SQRT2 * Math.cos(2 * Math.PI * 50 * 1e-4);
    expect(snap.componentData.get('vac1')!.voltage).toBeCloseTo(expected, 6);
  });
});

describe('RC charging (spec §15.3: voltage follows the charging curve)', () => {
  it('charges exponentially with τ = R·C, never jumping instantly', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('r1', 'resistor', 1000, 300, 0),
        comp('c1', 'capacitor', 1e-6, 600, 0), // τ = 1 ms
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 0]),
        wire('w3', ['c1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);

    // t = 0: the capacitor starts discharged. One 100 µs step is
    // 10% of τ = 1 ms, so Vc is still a small fraction of 12 V.
    const snap0 = stepSimulation(doc, topology, state, DEFAULT_DT);
    expect(Math.abs(snap0.componentData.get('c1')!.voltage)).toBeLessThan(2);

    // t ≈ τ (1 ms = 10 steps): Vc ≈ 12·(1 − e⁻¹) ≈ 7.6 V
    // (Backward Euler gives 7.37 V — first order, still ~63%)
    let snap = snap0;
    for (let i = 0; i < 9; i++) {
      snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    }
    const vcTau = snap.componentData.get('c1')!.voltage;
    expect(vcTau).toBeGreaterThan(6.0);
    expect(vcTau).toBeLessThan(8.6);

    // t = 5τ (5 ms = 50 steps): Vc > 99% of the supply
    for (let i = 0; i < 40; i++) {
      snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    }
    expect(snap.componentData.get('c1')!.voltage).toBeGreaterThan(11.5);

    // Current decays as the capacitor charges
    const iEnd = snap.componentData.get('r1')!.current;
    expect(Math.abs(iEnd)).toBeLessThan(0.005); // < 5 mA at 5τ
  });
});

describe('RL circuit (spec §15.4: current evolves continuously)', () => {
  it('rises with τ = L/R toward V/R and never jumps', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('l1', 'solenoid', 2, 300, 0, { inductance: 0.01 }), // τ = 5 ms
      ],
      wires: [
        wire('w1', ['v1', 0], ['l1', 0]),
        wire('w2', ['l1', 1], ['v1', 1]),
      ],
    };
    const { state } = newState(doc);

    const snaps = run(doc, state, 500); // 50 ms = 10τ
    const currents = snaps.map((s) => s.componentData.get('l1')!.current);

    // Starts near zero (inductor opposes a sudden change)
    expect(Math.abs(currents[0])).toBeLessThan(0.5);
    // Rises monotonically — no discontinuity, no oscillation
    for (let i = 1; i < currents.length; i++) {
      expect(currents[i]).toBeGreaterThanOrEqual(currents[i - 1] - 1e-9);
    }
    // τ = 5 ms = step 50: I ≈ (12/2)·(1 − e⁻¹) ≈ 3.8 A
    const iTau = currents[49];
    expect(iTau).toBeGreaterThan(3.0);
    expect(iTau).toBeLessThan(4.6);
    // Steady state: I = V/R = 6 A
    expect(currents[499]).toBeGreaterThan(5.9);
    expect(currents[499]).toBeLessThan(6.1);
  });
});

describe('LED / diode model (spec §3: state from actual voltage/current)', () => {
  it('stays OFF below the forward threshold', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 1.5, 0, 0), // below a 2 V LED
        comp('d1', 'led', 2, 300, 0, { forwardVoltage: 2, color: 'red' }),
      ],
      wires: [
        wire('w1', ['v1', 0], ['d1', 0]),
        wire('w2', ['d1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    const led = snap.componentData.get('d1')!;
    expect(Math.abs(led.current)).toBeLessThan(1e-5); // essentially zero
    expect(led.brightness).toBe(0);
  });

  it('turns ON with brightness driven by the forward current', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 5, 0, 0),
        comp('r1', 'resistor', 1000, 300, 0),
        comp('d1', 'led', 2, 600, 0, { forwardVoltage: 2, color: 'green' }),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['d1', 0]),
        wire('w3', ['d1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    const led = snap.componentData.get('d1')!;
    // I = (5 − 2) / 1001 ≈ 3 mA → dim but clearly on
    expect(led.current).toBeGreaterThan(0.002);
    expect(led.current).toBeLessThan(0.004);
    expect(led.brightness).toBeGreaterThan(0.1);
    expect(led.brightness).toBeCloseTo(ledBrightness(led.current), 9);
    expect(led.overload).toBe(false);
  });

  it('flags overload above the rated current', () => {
    expect(ledBrightness(0)).toBe(0);
    expect(ledBrightness(0.002)).toBeCloseTo(0.1, 9); // 2 mA → dim
    expect(ledBrightness(0.01)).toBeCloseTo(0.5, 9); // 10 mA → normal
    expect(ledBrightness(0.02)).toBeCloseTo(1, 9); // 20 mA → bright
    expect(ledBrightness(0.1)).toBe(1); // saturates
  });

  it('blocks in reverse bias', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 5, 0, 0),
        comp('d1', 'diode', 0.7, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['d1', 1]), // cathode to +
        wire('w2', ['d1', 0], ['v1', 1]),
      ],
    };
    const { state } = newState(doc);
    const snap = stepSimulation(doc, state.topology!, state, DEFAULT_DT);
    const diode = snap.componentData.get('d1')!;
    expect(Math.abs(diode.current)).toBeLessThan(1e-5);
  });
});

describe('AC + LED (spec §3/§12: conduction follows the AC polarity)', () => {
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

  it('conducts on the positive half-cycle and blocks on the negative one', () => {
    const { topology, state } = newState(doc);

    // Advance to the positive peak: t = 5 ms (step 50)
    let snap = null as ReturnType<typeof stepSimulation> | null;
    for (let i = 0; i < 50; i++) {
      snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    }
    const positivePeak = snap!;
    const ledPos = positivePeak.componentData.get('d1')!;
    const vPos = positivePeak.componentData.get('vac1')!.voltage;
    expect(vPos).toBeGreaterThan(16); // ≈ +16.97 V
    // LED conducts: I ≈ (16.97 − 2) / 471 ≈ 31.8 mA
    expect(ledPos.current).toBeGreaterThan(0.01);
    expect(ledPos.brightness).toBeGreaterThan(0.5);

    // Advance to the negative peak: t = 15 ms (another 100 steps)
    for (let i = 0; i < 100; i++) {
      snap = stepSimulation(doc, topology, state, DEFAULT_DT);
    }
    const negativePeak = snap!;
    const ledNeg = negativePeak.componentData.get('d1')!;
    const vNeg = negativePeak.componentData.get('vac1')!.voltage;
    expect(vNeg).toBeLessThan(-16); // ≈ −16.97 V
    // LED blocks: only µA leakage
    expect(Math.abs(ledNeg.current)).toBeLessThan(1e-4);
    expect(ledNeg.brightness).toBe(0);
  });

  it('conducts once per cycle — the current waveform follows v(t)', () => {
    const { topology, state } = newState(doc);
    let conducting = 0;
    let blocking = 0;
    for (let i = 0; i < 200; i++) {
      // one full cycle
      const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
      const iLed = snap.componentData.get('d1')!.current;
      const vSrc = snap.componentData.get('vac1')!.voltage;
      if (iLed > 1e-4) {
        conducting++;
        // conduction only while the source is positively biased
        expect(vSrc).toBeGreaterThan(1);
      } else {
        blocking++;
      }
    }
    // Roughly the positive part of the sine wave above 2 V
    expect(conducting).toBeGreaterThan(40);
    expect(conducting).toBeLessThan(120);
    expect(blocking).toBeGreaterThan(80);
  });
});

describe('motor model (spec §7: RPM from the electrical state)', () => {
  it('stops with no supply and speeds up with power', () => {
    expect(motorRpm(0, 0)).toBe(0);
    expect(motorRpm(12, 0)).toBe(0);
    expect(motorRpm(0, 2)).toBe(0);
    const low = motorRpm(6, 0.6); // 3.6 W
    const high = motorRpm(12, 1.2); // 14.4 W
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(1000);
  });

  it('derives shaft speed from the solved operating point', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('m1', 'dcMotor', 10, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['m1', 0]),
        wire('w2', ['m1', 1], ['v1', 1]),
      ],
    };
    const { state } = newState(doc);
    // The motor winding carries the default 50 mH, so the
    // current rises with τ = L/R = 5 ms; run to steady state.
    const snaps = run(doc, state, 2000); // 200 ms = 40τ
    const motor = snaps[snaps.length - 1].componentData.get('m1')!;
    expect(Math.abs(motor.current)).toBeCloseTo(1.2, 4); // 12 V / 10 Ω
    expect(motor.rpm).toBeGreaterThan(1000);

    // Half the supply → roughly a quarter of the power → slower
    const doc2: CircuitDoc = {
      components: [
        comp('v1', 'battery', 6, 0, 0),
        comp('m1', 'dcMotor', 10, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['m1', 0]),
        wire('w2', ['m1', 1], ['v1', 1]),
      ],
    };
    const s2 = newState(doc2);
    // run to steady state there as well
    const snaps2 = run(doc2, s2.state, 2000);
    const motor2 = snaps2[snaps2.length - 1].componentData.get('m1')!;
    expect(Math.abs(motor2.current)).toBeCloseTo(0.6, 4);
    expect(motor2.rpm!).toBeLessThan(motor.rpm!);
  });
});

describe('simulation clock (spec §10: independent of wall time)', () => {
  it('advances simulation time by exactly dt per step', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('r1', 'resistor', 6, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    const snap1 = stepSimulation(doc, topology, state, DEFAULT_DT);
    const snap2 = stepSimulation(doc, topology, state, DEFAULT_DT);
    expect(snap1.simTime).toBeCloseTo(DEFAULT_DT, 12);
    expect(snap2.simTime).toBeCloseTo(2 * DEFAULT_DT, 12);
    expect(state.simTime).toBeCloseTo(2 * DEFAULT_DT, 12);
  });
});

describe('numerical stability (spec §13)', () => {
  it('stays finite under an extreme supply and never produces NaN', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 1e6, 0, 0),
        comp('r1', 'resistor', 1, 300, 0),
        comp('c1', 'capacitor', 1e-6, 600, 0),
        comp('l1', 'solenoid', 0.001, 900, 0, { inductance: 1e-6 }),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 0]),
        wire('w3', ['c1', 1], ['l1', 0]),
        wire('w4', ['l1', 1], ['v1', 1]),
      ],
    };
    const { topology, state } = newState(doc);
    for (let i = 0; i < 100; i++) {
      const snap = stepSimulation(doc, topology, state, DEFAULT_DT);
      for (const [, sol] of snap.componentData) {
        expect(Number.isFinite(sol.voltage)).toBe(true);
        expect(Number.isFinite(sol.current)).toBe(true);
        expect(Number.isFinite(sol.power)).toBe(true);
      }
      for (const v of state.capacitorVoltage.values()) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1e6 + 1);
      }
      for (const c of state.inductorCurrent.values()) {
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  });
});
