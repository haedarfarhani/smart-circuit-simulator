import { describe, expect, it } from 'vitest';
import { buildTopology, solveCircuit } from './solver';
import { acFrequencies, hasAcSource, phasorAngle, solveAcSteadyState } from './acSolver';
import { DEFAULT_SOLENOID_INDUCTANCE, type CircuitComponent, type CircuitDoc, type ComponentType, type Wire } from '../models/circuit';

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

/** A source in series with one load, closed into a loop. */
function loop(source: ComponentType, load: CircuitComponent): CircuitDoc {
  const isAc = source === 'acVoltageSource';
  return {
    components: [
      comp('s1', source, 12, 0, 0, isAc ? { frequency: 50 } : {}),
      load,
    ],
    wires: [wire('w1', ['s1', 0], [load.id, 0]), wire('w2', [load.id, 1], ['s1', 1])],
  };
}

const OHM_50_HZ = 2 * Math.PI * 50;

describe('AC source detection', () => {
  it('recognises an AC supply and defaults its frequency to mains', () => {
    const doc = loop('acVoltageSource', comp('c1', 'capacitor', 1e-6, 300, 0));
    expect(hasAcSource(doc)).toBe(true);

    const noFrequency: CircuitDoc = {
      components: [comp('vac', 'acVoltageSource', 12, 0, 0)],
      wires: [],
    };
    expect(acFrequencies(noFrequency)).toEqual([50]);

    const twoFrequencies: CircuitDoc = {
      components: [
        comp('a', 'acVoltageSource', 12, 0, 0, { frequency: 60 }),
        comp('b', 'acVoltageSource', 12, 0, 200, { frequency: 50 }),
        comp('c', 'acVoltageSource', 12, 0, 400, { frequency: 60 }),
      ],
      wires: [],
    };
    expect(acFrequencies(twoFrequencies)).toEqual([60, 50]);
  });

  it('leaves a battery-only document on the DC operating point', () => {
    const doc = loop('battery', comp('r1', 'resistor', 100, 300, 0));
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    expect(hasAcSource(doc)).toBe(false);
    expect(res.frequencies).toBeUndefined();
    expect(res.componentData.get('r1')!.ac).toBeUndefined();
    expect(Math.abs(res.componentData.get('r1')!.current)).toBeCloseTo(0.12, 6);
  });
});

describe('reactance, which a DC operating point cannot show', () => {
  it('passes current through a capacitor that a battery cannot push through', () => {
    const ac = solveCircuit(loop('acVoltageSource', comp('c1', 'capacitor', 100e-6, 300, 0)));
    const dc = solveCircuit(loop('battery', comp('c1', 'capacitor', 100e-6, 300, 0)));

    const acCap = ac.componentData.get('c1')!;
    // I = V·ωC = 12 · 2π·50 · 100µF
    expect(Math.abs(acCap.current)).toBeCloseTo(12 * OHM_50_HZ * 100e-6, 4);
    expect(acCap.ac).toBe(true);
    expect(acCap.frequency).toBe(50);

    // A capacitor stores energy and returns it: it never dissipates power.
    expect(Math.abs(acCap.power)).toBeLessThan(1e-6);

    // The battery branch of the same circuit blocks completely.
    const dcCap = dc.componentData.get('c1')!;
    expect(Math.abs(dcCap.current)).toBeLessThan(1e-9);
    expect(Math.abs(dcCap.power)).toBeLessThan(1e-9);
  });

  it('opposes a coil with its impedance rather than its resistance alone', () => {
    const coil = comp('sol1', 'solenoid', 50, 300, 0);
    const ac = solveCircuit(loop('acVoltageSource', coil));
    const dc = solveCircuit(loop('battery', comp('sol1', 'solenoid', 50, 300, 0)));

    const impedance = Math.hypot(50, OHM_50_HZ * DEFAULT_SOLENOID_INDUCTANCE);
    const acCoil = ac.componentData.get('sol1')!;
    expect(Math.abs(acCoil.current)).toBeCloseTo(12 / impedance, 4);

    // The same winding carries more current on DC, so the coil burns hotter.
    const dcCoil = dc.componentData.get('sol1')!;
    expect(Math.abs(dcCoil.current)).toBeCloseTo(12 / 50, 4);
    expect(Math.abs(acCoil.power)).toBeLessThan(Math.abs(dcCoil.power));
    expect(Math.abs(acCoil.power)).toBeCloseTo((12 / impedance) ** 2 * 50, 3);
  });

  it('leads the capacitor current by a quarter cycle', () => {
    const doc = loop('acVoltageSource', comp('c1', 'capacitor', 100e-6, 300, 0));
    const ac = solveAcSteadyState(doc, buildTopology(doc), 50);
    expect(ac).not.toBeNull();
    expect(phasorAngle(ac!.voltage.get('c1')!)).toBeCloseTo(0, 6);
    expect(phasorAngle(ac!.current.get('c1')!)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('a DC supply beside an AC supply', () => {
  it('superposes both, combining RMS values and adding the powers', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 12, 0, 0),
        comp('vac1', 'acVoltageSource', 12, 0, 200, { frequency: 50 }),
        comp('r1', 'resistor', 100, 0, 400),
      ],
      wires: [
        wire('w1', ['v1', 1], ['vac1', 0]),
        wire('w2', ['vac1', 1], ['r1', 0]),
        wire('w3', ['r1', 1], ['v1', 0]),
      ],
    };

    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const resistor = res.componentData.get('r1')!;
    // 12 V DC and 12 V RMS each drive 0.12 A through 100 Ω; √(0.12² + 0.12²)
    expect(Math.abs(resistor.current)).toBeCloseTo(Math.hypot(0.12, 0.12), 4);
    expect(Math.abs(resistor.power)).toBeCloseTo(1.44 + 1.44, 3);
    // 12 V DC plus 12 V RMS adds in quadrature: √(12² + 12²)
    expect(Math.abs(resistor.voltage)).toBeCloseTo(Math.hypot(12, 12), 3);

    // The DC part still decides the polarity of the reading.
    const dcOnly: CircuitDoc = {
      components: [comp('v1', 'battery', 12, 0, 0), comp('r1', 'resistor', 100, 0, 400)],
      wires: [wire('w1', ['v1', 1], ['r1', 0]), wire('w2', ['r1', 1], ['v1', 0])],
    };
    const dcSign = Math.sign(solveCircuit(dcOnly).componentData.get('r1')!.voltage);
    expect(Math.sign(resistor.voltage)).toBe(dcSign);
  });
});
