import { describe, expect, it } from 'vitest';
import { lampResistance, solveCircuit } from './solver';
import type { CircuitDoc, ComponentType, Wire } from '../models/circuit';

const comp = (
  id: string,
  type: ComponentType,
  value: number,
  x: number,
  y: number,
) => ({
  id,
  type,
  value,
  x,
  y,
  rotation: 0 as const,
  label: id,
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

describe('lampResistance', () => {
  it('follows from the watt rating at the supply voltage', () => {
    // a 60 W lamp rated at 9 V draws 6.67 A: R = V²/P
    expect(lampResistance(60, 9)).toBeCloseTo(1.35, 9);
  });

  it('falls back to the raw value when there is no supply to rate against', () => {
    expect(lampResistance(60, 0)).toBe(60);
  });

  it('blocks a lamp with no usable rating', () => {
    expect(lampResistance(0, 9)).toBe(Infinity);
    expect(lampResistance(-5, 9)).toBe(Infinity);
  });
});

describe('lamp in a circuit', () => {
  it('burns at its rated power when it sits across the supply', () => {
    const doc: CircuitDoc = {
      components: [comp('v1', 'battery', 9, 0, 0), comp('l1', 'lamp', 60, 300, 0)],
      wires: [wire('w1', ['v1', 0], ['l1', 0]), wire('w2', ['v1', 1], ['l1', 1])],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const lamp = res.componentData.get('l1')!;
    expect(Math.abs(lamp.voltage)).toBeCloseTo(9, 6);
    expect(Math.abs(lamp.current)).toBeCloseTo(60 / 9, 4);
    expect(Math.abs(lamp.power)).toBeCloseTo(60, 3);
  });

  it('dims when a series resistor takes part of the supply', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 9, 0, 0),
        comp('r1', 'resistor', 1.35, 150, 0),
        comp('l1', 'lamp', 60, 300, 0),
      ],
      wires: [wire('w1', ['v1', 0], ['r1', 0]), wire('w2', ['r1', 1], ['l1', 0]), wire('w3', ['l1', 1], ['v1', 1])],
    };
    const res = solveCircuit(doc);
    const lamp = res.componentData.get('l1')!;
    // an equal series resistance halves both voltage and current
    expect(Math.abs(lamp.voltage)).toBeCloseTo(4.5, 3);
    expect(Math.abs(lamp.power)).toBeCloseTo(15, 1);
  });
});

describe('capacitor in a circuit', () => {
  it('blocks at DC but still shows the voltage across it', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 9, 0, 0),
        comp('r1', 'resistor', 1000, 150, 0),
        comp('c1', 'capacitor', 1e-6, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['r1', 0]),
        wire('w2', ['r1', 1], ['c1', 0]),
        wire('w3', ['c1', 1], ['v1', 1]),
      ],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const cap = res.componentData.get('c1')!;
    expect(Math.abs(cap.current)).toBeLessThan(1e-9);
    expect(Math.abs(cap.voltage)).toBeCloseTo(9, 3);
    const resistor = res.componentData.get('r1')!;
    // no current, so the series resistor drops nothing
    expect(Math.abs(resistor.current)).toBeLessThan(1e-9);
  });
});

describe('diode in a circuit', () => {
  it('conducts when forward-biased with a series resistor', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 5, 0, 0),
        comp('d1', 'diode', 0.7, 150, 0),
        comp('r1', 'resistor', 100, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['d1', 0]), // v1+ to d1 anode
        wire('w2', ['d1', 1], ['r1', 0]), // d1 cathode to r1
        wire('w3', ['r1', 1], ['v1', 1]), // r1 to v1-
      ],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const diode = res.componentData.get('d1')!;
    // Forward biased: drops ~0.7V, current flows
    expect(diode.voltage).toBeGreaterThan(0.6);
    expect(diode.current).toBeGreaterThan(0.03); // (5 - 0.7) / 101 ≈ 0.042 A
  });

  it('blocks when reverse-biased', () => {
    const doc: CircuitDoc = {
      components: [
        comp('v1', 'battery', 5, 0, 0),
        comp('d1', 'diode', 0.7, 150, 0),
        comp('r1', 'resistor', 100, 300, 0),
      ],
      wires: [
        wire('w1', ['v1', 0], ['d1', 1]), // v1+ to d1 cathode (reverse bias)
        wire('w2', ['d1', 0], ['r1', 0]), // d1 anode to r1
        wire('w3', ['r1', 1], ['v1', 1]), // r1 to v1-
      ],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const diode = res.componentData.get('d1')!;
    expect(Math.abs(diode.current)).toBeLessThan(1e-5);
  });
});

describe('current source in a circuit', () => {
  it('injects prescribed current into a load resistor', () => {
    const doc: CircuitDoc = {
      components: [
        comp('i1', 'currentSource', 0.5, 0, 0),
        comp('r1', 'resistor', 20, 150, 0),
      ],
      wires: [
        wire('w1', ['i1', 0], ['r1', 0]),
        wire('w2', ['i1', 1], ['r1', 1]),
      ],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    const resistor = res.componentData.get('r1')!;
    // 0.5 A into 20 Ω produces 10 V
    expect(Math.abs(resistor.current)).toBeCloseTo(0.5, 4);
    expect(Math.abs(resistor.voltage)).toBeCloseTo(10, 3);
  });
});

describe('AC circuit with VAC, resistor, and acMotor with waypoints', () => {
  it('solves properly with intermediate wire waypoints and no ground component', () => {
    const doc: CircuitDoc = {
      components: [
        comp('vac1', 'acVoltageSource', 120, 0, 0),
        comp('r1', 'resistor', 100, 200, 0),
        comp('mac1', 'acMotor', 15, 100, 200),
      ],
      wires: [
        // Wire 1: vac1 term 1 -> r1 term 0
        wire('w1', ['vac1', 1], ['r1', 0]),
        // Wire 2: r1 term 1 -> mac1 term 1 (with corner bend point)
        {
          id: 'w2',
          start: { componentId: 'r1', terminalIndex: 1, point: null },
          end: { componentId: 'mac1', terminalIndex: 1, point: null },
          waypoints: [{ x: 300, y: 0 }, { x: 300, y: 200 }],
        },
        // Wire 3: mac1 term 0 -> vac1 term 0 (with corner bend point)
        {
          id: 'w3',
          start: { componentId: 'mac1', terminalIndex: 0, point: null },
          end: { componentId: 'vac1', terminalIndex: 0, point: null },
          waypoints: [{ x: -100, y: 200 }, { x: -100, y: 0 }],
        },
      ],
    };
    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);
    expect(res.error).toBeUndefined();
    const vac = res.componentData.get('vac1')!;
    const r = res.componentData.get('r1')!;
    const motor = res.componentData.get('mac1')!;
    // Total R = 100 + 15 = 115 Ω, I = 120 / 115 ≈ 1.043 A
    expect(Math.abs(vac.current)).toBeCloseTo(120 / 115, 3);
    expect(Math.abs(r.current)).toBeCloseTo(120 / 115, 3);
    expect(Math.abs(motor.current)).toBeCloseTo(120 / 115, 3);
  });
});

