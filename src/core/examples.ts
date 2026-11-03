import { type CircuitDoc, type Point, type WireEndpoint, type ComponentType } from '../models/circuit';
import { newId, GRID_SIZE } from '../models/circuit';

/**
 * Helper to build a CircuitDoc from a declarative description.
 * Coordinates are in grid units (multiplied by GRID_SIZE internally).
 */
function makeDoc(
  comps: {
    x: number;
    y: number;
    type: ComponentType;
    value: number;
    label: string;
    rotation?: number;
    frequency?: number;
    forwardVoltage?: number;
    color?: import('../models/circuit').LedColor;
    preset?: string;
    zenerVoltage?: number;
    zenerResistance?: number;
    ratedPower?: number;
    dynamicThermal?: boolean;
    tempCoeff?: number;
  }[],
  wires: { from: WireEndpoint; to: WireEndpoint; waypoints?: Point[] }[],
): CircuitDoc {
  const scale = GRID_SIZE;
  const components = comps.map((c) => {
    const comp: import('../models/circuit').CircuitComponent = {
      id: newId(c.type.substring(0, 2)),
      type: c.type,
      x: c.x * scale,
      y: c.y * scale,
      rotation: (c.rotation ?? 0) as 0 | 90 | 180 | 270,
      label: c.label,
      value: c.value,
    };
    if (c.frequency !== undefined) comp.frequency = c.frequency;
    if (c.forwardVoltage !== undefined)
      comp.forwardVoltage = c.forwardVoltage;
    if (c.color !== undefined) comp.color = c.color;
    if (c.preset !== undefined) comp.preset = c.preset;
    if (c.zenerVoltage !== undefined) comp.zenerVoltage = c.zenerVoltage;
    if (c.zenerResistance !== undefined) comp.zenerResistance = c.zenerResistance;
    if (c.ratedPower !== undefined) comp.ratedPower = c.ratedPower;
    if (c.dynamicThermal !== undefined) comp.dynamicThermal = c.dynamicThermal;
    if (c.tempCoeff !== undefined) comp.tempCoeff = c.tempCoeff;
    return comp;
  });

  const idByLabel = new Map(components.map((c) => [c.label, c.id]));

  const resolve = (e: WireEndpoint): WireEndpoint => {
    if (e.componentId) {
      return { componentId: idByLabel.get(e.componentId) ?? e.componentId, terminalIndex: e.terminalIndex, point: null };
    }
    if (e.point) {
      return { componentId: null, terminalIndex: 0, point: { x: e.point.x * scale, y: e.point.y * scale } };
    }
    return e;
  };

  const wires2 = wires.map((w) => ({
    id: newId('wire'),
    start: resolve(w.from),
    end: resolve(w.to),
    waypoints: (w.waypoints ?? []).map((p) => ({ x: p.x * scale, y: p.y * scale })),
  }));

  return { components, wires: wires2 };
}

const term = (compLabel: string, idx: number): WireEndpoint => ({
  componentId: compLabel,
  terminalIndex: idx,
  point: null,
});

export interface ExampleCircuit {
  id: string;
  nameKey: string;
  descKey: string;
  doc: CircuitDoc;
}

export const EXAMPLE_CIRCUITS: ExampleCircuit[] = [
  {
    id: 'ac-led',
    nameKey: 'example.acLed.name',
    descKey: 'example.acLed.desc',
    doc: makeDoc(
      [
        { x: 4, y: 12, type: 'acVoltageSource', value: 12, label: 'VAC1', frequency: 50 },
        { x: 16, y: 12, type: 'resistor', value: 470, label: 'R1' },
        { x: 28, y: 12, type: 'led', value: 2, label: 'LED1', forwardVoltage: 2, color: 'red' },
        { x: 4, y: 20, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('VAC1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('LED1', 0), waypoints: [] },
        { from: term('LED1', 1), to: term('VAC1', 1), waypoints: [] },
        { from: term('VAC1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'rc-charge',
    nameKey: 'example.rcCharge.name',
    descKey: 'example.rcCharge.desc',
    doc: makeDoc(
      [
        { x: 4, y: 12, type: 'battery', value: 12, label: 'V1' },
        { x: 16, y: 12, type: 'resistor', value: 1000, label: 'R1' },
        { x: 28, y: 12, type: 'capacitor', value: 0.000001, label: 'C1' },
        { x: 4, y: 20, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('C1', 0), waypoints: [] },
        { from: term('C1', 1), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'dc-motor-solenoid',
    nameKey: 'example.dcMotor.name',
    descKey: 'example.dcMotor.desc',
    doc: makeDoc(
      [
        { x: 6, y: 12, type: 'battery', value: 12, label: 'V1' },
        { x: 18, y: 12, type: 'dcMotor', value: 10, label: 'M1' },
        { x: 30, y: 12, type: 'solenoid', value: 50, label: 'SOL1' },
        { x: 34, y: 16, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('M1', 0), waypoints: [] },
        { from: term('M1', 1), to: term('SOL1', 0), waypoints: [] },
        { from: term('SOL1', 1), to: term('V1', 1), waypoints: [] },
        { from: term('SOL1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'dc-motor-parallel',
    nameKey: 'example.dcMotorParallel.name',
    descKey: 'example.dcMotorParallel.desc',
    doc: makeDoc(
      [
        { x: 10, y: 12, type: 'battery', value: 12, label: 'V1' },
        { x: 34, y: 6, type: 'dcMotor', value: 10, label: 'M1' },
        { x: 34, y: 18, type: 'solenoid', value: 50, label: 'SOL1' },
        { x: 10, y: 24, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('M1', 0), waypoints: [] },
        { from: term('V1', 0), to: term('SOL1', 0), waypoints: [] },
        { from: term('M1', 1), to: term('SOL1', 1), waypoints: [] },
        { from: term('SOL1', 1), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-regulator-basic',
    nameKey: 'example.zenerBasic.name',
    descKey: 'example.zenerBasic.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 12, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 220, label: 'R1' },
        { x: 28, y: 14, type: 'zenerDiode', value: 5.1, label: 'DZ1', rotation: 90, preset: '1N4733A' },
        { x: 38, y: 14, type: 'resistor', value: 1000, label: 'RL', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-line-regulation',
    nameKey: 'example.zenerLineReg.name',
    descKey: 'example.zenerLineReg.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 18, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 330, label: 'R1' },
        { x: 28, y: 14, type: 'zenerDiode', value: 5.1, label: 'DZ1', rotation: 90, preset: '1N4733A' },
        { x: 38, y: 14, type: 'resistor', value: 470, label: 'RL', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-load-regulation',
    nameKey: 'example.zenerLoadReg.name',
    descKey: 'example.zenerLoadReg.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 12, label: 'V1' },
        { x: 16, y: 8, type: 'resistor', value: 150, label: 'R1' },
        { x: 26, y: 14, type: 'zenerDiode', value: 5.6, label: 'DZ1', rotation: 90, preset: '1N4734A' },
        { x: 34, y: 14, type: 'resistor', value: 500, label: 'RL1', rotation: 90 },
        { x: 42, y: 8, type: 'switch', value: 1, label: 'SW1' },
        { x: 48, y: 14, type: 'resistor', value: 500, label: 'RL2', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('RL1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('SW1', 0), waypoints: [] },
        { from: term('SW1', 1), to: term('RL2', 1), waypoints: [] },
        { from: term('RL2', 0), to: term('RL1', 0), waypoints: [] },
        { from: term('RL1', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-overvoltage-protection',
    nameKey: 'example.zenerProtection.name',
    descKey: 'example.zenerProtection.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 15, label: 'V1' },
        { x: 16, y: 8, type: 'resistor', value: 100, label: 'R1' },
        { x: 26, y: 14, type: 'zenerDiode', value: 5.1, label: 'DZ1', rotation: 90, preset: '1N4733A' },
        { x: 34, y: 12, type: 'led', value: 2, label: 'LED1', rotation: 90, color: 'green', forwardVoltage: 2 },
        { x: 34, y: 20, type: 'resistor', value: 470, label: 'R2', rotation: 90 },
        { x: 44, y: 14, type: 'resistor', value: 2200, label: 'RL', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('LED1', 1), waypoints: [] },
        { from: term('LED1', 0), to: term('R2', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('R2', 0), waypoints: [] },
        { from: term('R2', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-ac-clipper',
    nameKey: 'example.zenerAcClipper.name',
    descKey: 'example.zenerAcClipper.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'acVoltageSource', value: 10, label: 'VAC1', frequency: 50 },
        { x: 18, y: 8, type: 'resistor', value: 1000, label: 'R1' },
        { x: 28, y: 14, type: 'zenerDiode', value: 5.1, label: 'DZ1', rotation: 90, preset: '1N4733A' },
        { x: 38, y: 14, type: 'resistor', value: 10000, label: 'RL', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('VAC1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('VAC1', 1), waypoints: [] },
        { from: term('VAC1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-bidirectional-clipper',
    nameKey: 'example.zenerDoubleClipper.name',
    descKey: 'example.zenerDoubleClipper.desc',
    doc: makeDoc(
      [
        { x: 6, y: 16, type: 'acVoltageSource', value: 12, label: 'VAC1', frequency: 50 },
        { x: 18, y: 8, type: 'resistor', value: 1000, label: 'R1' },
        { x: 28, y: 12, type: 'zenerDiode', value: 6.2, label: 'DZ1', rotation: 90, preset: '1N4735A' },
        { x: 28, y: 20, type: 'zenerDiode', value: 6.2, label: 'DZ2', rotation: 270, preset: '1N4735A' },
        { x: 38, y: 16, type: 'resistor', value: 20000, label: 'RL', rotation: 90 },
        { x: 6, y: 26, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('VAC1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 0), to: term('DZ2', 0), waypoints: [] },
        { from: term('DZ2', 1), to: term('VAC1', 1), waypoints: [] },
        { from: term('R1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('DZ2', 1), waypoints: [] },
        { from: term('VAC1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-voltage-reference',
    nameKey: 'example.zenerRef.name',
    descKey: 'example.zenerRef.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 24, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 680, label: 'R1' },
        { x: 28, y: 14, type: 'zenerDiode', value: 10, label: 'DZ1', rotation: 90, preset: '1N4740A' },
        { x: 36, y: 14, type: 'capacitor', value: 0.00001, label: 'C1', rotation: 90 },
        { x: 44, y: 14, type: 'resistor', value: 10000, label: 'RL', rotation: 90 },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 1), to: term('C1', 1), waypoints: [] },
        { from: term('C1', 1), to: term('RL', 1), waypoints: [] },
        { from: term('RL', 0), to: term('C1', 0), waypoints: [] },
        { from: term('C1', 0), to: term('DZ1', 0), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
  {
    id: 'zener-test-bench',
    nameKey: 'example.zenerTestBench.name',
    descKey: 'example.zenerTestBench.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 15, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 100, label: 'R1' },
        { x: 28, y: 14, type: 'zenerDiode', value: 5.1, label: 'DZ1', rotation: 90, preset: '1N4733A', dynamicThermal: true },
        { x: 6, y: 22, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('DZ1', 1), waypoints: [] },
        { from: term('DZ1', 0), to: term('V1', 1), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [] },
      ],
    ),
  },
];

export function getExample(id: string): ExampleCircuit | undefined {
  return EXAMPLE_CIRCUITS.find((e) => e.id === id);
}
