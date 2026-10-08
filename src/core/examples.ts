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
];

export function getExample(id: string): ExampleCircuit | undefined {
  return EXAMPLE_CIRCUITS.find((e) => e.id === id);
}
