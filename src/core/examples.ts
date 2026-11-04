import { type CircuitDoc, type Point, type WireEndpoint, type ComponentType } from '../models/circuit';
import { newId, GRID_SIZE } from '../models/circuit';
import { isDigitalType, applyDigitalDefaults } from './digital/types';
import { buildDigitalExamples } from './examplesDigital';

/**
 * Helper to build a CircuitDoc from a declarative description.
 * Coordinates are in grid units (multiplied by GRID_SIZE internally).
 */
export function makeDoc(
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
    /** any other component field (capacitor technology, ESR, initial V, …) */
    fields?: Partial<import('../models/circuit').CircuitComponent>;
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
    if (c.fields) Object.assign(comp, c.fields);
    if (isDigitalType(c.type)) applyDigitalDefaults(comp);
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

export const term = (compLabel: string, idx: number): WireEndpoint => ({
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
    id: 'cap-rc-charge',
    nameKey: 'example.capRcCharge.name',
    descKey: 'example.capRcCharge.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 12, label: 'V1' },
        { x: 20, y: 14, type: 'resistor', value: 1000, label: 'R1' },
        {
          x: 34,
          y: 14,
          type: 'polarized-capacitor',
          value: 1000e-6,
          label: 'C1',
          fields: { preset: '1000uF-25V', technology: 'aluminum-electrolytic', dynamicThermal: true },
        },
        { x: 10, y: 24, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [{ x: 2, y: 6 }, { x: 16, y: 6 }] },
        { from: term('R1', 1), to: term('C1', 0), waypoints: [] },
        { from: term('C1', 1), to: term('V1', 1), waypoints: [{ x: 38, y: 20 }, { x: 10, y: 20 }] },
      ],
    ),
  },
  {
    id: 'cap-rc-discharge',
    nameKey: 'example.capRcDischarge.name',
    descKey: 'example.capRcDischarge.desc',
    doc: makeDoc(
      [
        { x: 8, y: 14, type: 'polarized-capacitor', value: 1000e-6, label: 'C1', fields: {
          preset: '1000uF-25V',
          initialConditionEnabled: true,
          initialVoltage: 12,
          initialCharge: 1000e-6 * 12,
        } },
        { x: 22, y: 14, type: 'resistor', value: 1000, label: 'R1' },
        { x: 36, y: 14, type: 'switch', value: 1, label: 'SW1' },
        { x: 16, y: 18, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('C1', 1), to: term('R1', 0), waypoints: [{ x: 16, y: 14 }] },
        { from: term('R1', 1), to: term('SW1', 0), waypoints: [] },
        { from: term('SW1', 1), to: term('C1', 0), waypoints: [{ x: 40, y: 24 }, { x: 4, y: 24 }] },
      ],
    ),
  },
  {
    id: 'cap-psu-filter',
    nameKey: 'example.capPsuFilter.name',
    descKey: 'example.capPsuFilter.desc',
    doc: makeDoc(
      [
        { x: 10, y: 38, type: 'acVoltageSource', value: 12, label: 'VAC1', frequency: 50 },
        { x: 18, y: 12, type: 'diode', value: 0.7, label: 'D1', forwardVoltage: 0.7 },
        { x: 18, y: 28, type: 'diode', value: 0.7, label: 'D2', rotation: 180, forwardVoltage: 0.7 },
        { x: 30, y: 12, type: 'diode', value: 0.7, label: 'D3', rotation: 180, forwardVoltage: 0.7 },
        { x: 30, y: 28, type: 'diode', value: 0.7, label: 'D4', forwardVoltage: 0.7 },
        {
          x: 44,
          y: 12,
          type: 'polarized-capacitor',
          value: 2200e-6,
          label: 'C1',
          fields: { preset: '2200uF-25V', dynamicThermal: true },
        },
        { x: 56, y: 20, type: 'resistor', value: 100, label: 'RL', rotation: 90 },
        // ground the AC line: a real bridge output floats relative to it
        { x: 14, y: 32, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('VAC1', 1), to: term('D1', 0), waypoints: [{ x: 14, y: 28 }] },
        { from: term('VAC1', 0), to: term('D3', 0), waypoints: [{ x: 34, y: 38 }, { x: 34, y: 28 }] },
        { from: term('D1', 1), to: term('RL', 0), waypoints: [{ x: 26, y: 12 }, { x: 40, y: 12 }] },
        { from: term('D2', 0), to: term('RL', 1), waypoints: [{ x: 26, y: 28 }, { x: 48, y: 28 }, { x: 56, y: 28 }] },
        { from: term('C1', 1), to: { componentId: null, terminalIndex: 0, point: { x: 48, y: 28 } }, waypoints: [] },
      ],
    ),
  },
  {
    id: 'cap-high-ripple',
    nameKey: 'example.capHighRipple.name',
    descKey: 'example.capHighRipple.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'acVoltageSource', value: 12, label: 'VAC1', frequency: 50 },
        { x: 20, y: 14, type: 'resistor', value: 1, label: 'R1' },
        {
          x: 34,
          y: 14,
          type: 'polarized-capacitor',
          value: 47e-6,
          label: 'C1',
          fields: {
            preset: '47uF-25V',
            esr: 6,
            maxRippleCurrent: 0.05,
            dynamicThermal: true,
            ambientTemp: 40,
            thermalResistance: 60,
          },
        },
        { x: 10, y: 26, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('VAC1', 0), to: term('R1', 0), waypoints: [{ x: 2, y: 20 }, { x: 16, y: 20 }] },
        { from: term('R1', 1), to: term('C1', 0), waypoints: [] },
        { from: term('C1', 1), to: term('VAC1', 1), waypoints: [{ x: 38, y: 22 }, { x: 10, y: 22 }] },
      ],
    ),
  },
  {
    id: 'cap-reverse-polarity',
    nameKey: 'example.capReverse.name',
    descKey: 'example.capReverse.desc',
    doc: makeDoc(
      [
        { x: 6, y: 14, type: 'battery', value: 12, label: 'V1' },
        { x: 20, y: 14, type: 'resistor', value: 1000, label: 'R1' },
        {
          x: 34,
          y: 14,
          type: 'polarized-capacitor',
          value: 100e-6,
          label: 'C1',
          fields: {
            preset: '100uF-25V',
            capacitorModel: 'realistic',
            reverseBreakdownVoltage: 1.5,
            failureBehavior: 'breakdown-conduction',
            dynamicThermal: true,
          },
        },
        { x: 10, y: 18, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [{ x: 2, y: 8 }, { x: 16, y: 8 }] },
        // deliberately: battery + → resistor → capacitor NEGATIVE terminal
        { from: term('R1', 1), to: term('C1', 1), waypoints: [{ x: 24, y: 20 }, { x: 38, y: 20 }] },
        // capacitor POSITIVE terminal → battery −
        { from: term('C1', 0), to: term('V1', 1), waypoints: [{ x: 30, y: 10 }, { x: 10, y: 10 }] },
      ],
    ),
  },
  {
    id: 'cap-bank',
    nameKey: 'example.capBank.name',
    descKey: 'example.capBank.desc',
    doc: makeDoc(
      [
        { x: 6, y: 20, type: 'battery', value: 12, label: 'V1' },
        { x: 18, y: 20, type: 'resistor', value: 10, label: 'R1' },
        { x: 30, y: 12, type: 'polarized-capacitor', value: 470e-6, label: 'C1', rotation: 90, fields: { preset: '470uF-25V' } },
        { x: 38, y: 12, type: 'polarized-capacitor', value: 470e-6, label: 'C2', rotation: 90, fields: { preset: '470uF-25V' } },
        { x: 50, y: 8, type: 'polarized-capacitor', value: 470e-6, label: 'C3', rotation: 90, fields: { preset: '470uF-25V' } },
        { x: 50, y: 16, type: 'polarized-capacitor', value: 470e-6, label: 'C4', rotation: 90, fields: { preset: '470uF-25V' } },
        { x: 10, y: 32, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        // top rail: R1 → parallel pair → series pair
        { from: term('R1', 1), to: term('C3', 0), waypoints: [{ x: 22, y: 4 }, { x: 30, y: 4 }, { x: 38, y: 4 }] },
        { from: term('C1', 0), to: { componentId: null, terminalIndex: 0, point: { x: 30, y: 4 } }, waypoints: [] },
        { from: term('C2', 0), to: { componentId: null, terminalIndex: 0, point: { x: 38, y: 4 } }, waypoints: [] },
        // bottom rail
        { from: term('V1', 1), to: term('C4', 1), waypoints: [{ x: 10, y: 28 }, { x: 30, y: 28 }, { x: 38, y: 28 }, { x: 50, y: 28 }] },
        { from: term('C1', 1), to: { componentId: null, terminalIndex: 0, point: { x: 30, y: 28 } }, waypoints: [] },
        { from: term('C2', 1), to: { componentId: null, terminalIndex: 0, point: { x: 38, y: 28 } }, waypoints: [] },
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
  {
    id: 'bjt-npn-switch',
    nameKey: 'example.bjtSwitch.name',
    descKey: 'example.bjtSwitch.desc',
    doc: makeDoc(
      [
        { x: 6, y: 12, type: 'battery', value: 5, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 10e3, label: 'RB' },
        { x: 32, y: 14, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: '2N2222', transistorType: 'npn' } },
        { x: 44, y: 8, type: 'resistor', value: 220, label: 'RC' },
        { x: 58, y: 8, type: 'led', value: 2, label: 'LED1', forwardVoltage: 2, color: 'red' },
        { x: 36, y: 24, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('RB', 0), waypoints: [{ x: 6, y: 6 }, { x: 14, y: 6 }] },
        { from: term('RB', 1), to: term('Q1', 0), waypoints: [] },
        { from: term('Q1', 1), to: term('RC', 0), waypoints: [{ x: 32, y: 4 }, { x: 40, y: 4 }] },
        { from: term('RC', 1), to: term('LED1', 1), waypoints: [] },
        { from: term('LED1', 0), to: term('V1', 0), waypoints: [{ x: 64, y: 2 }, { x: 2, y: 2 }] },
        { from: term('Q1', 2), to: term('GND', 0), waypoints: [] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 20 }, { x: 36, y: 20 }] },
      ],
    ),
  },
  {
    id: 'bjt-pnp-highside',
    nameKey: 'example.bjtPnpHighSide.name',
    descKey: 'example.bjtPnpHighSide.desc',
    doc: makeDoc(
      [
        { x: 8, y: 6, type: 'battery', value: 12, label: 'V1' },
        { x: 28, y: 10, type: 'bjtTransistor', value: 180, label: 'Q1', fields: { preset: '2N2907', transistorType: 'pnp' } },
        { x: 20, y: 20, type: 'resistor', value: 10e3, label: 'RB' },
        { x: 44, y: 12, type: 'resistor', value: 100, label: 'RL' },
        { x: 12, y: 28, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('Q1', 2), waypoints: [{ x: 4, y: 2 }, { x: 32, y: 2 }] },
        { from: term('Q1', 0), to: term('RB', 0), waypoints: [] },
        { from: term('RB', 1), to: term('GND', 0), waypoints: [{ x: 24, y: 24 }, { x: 12, y: 24 }] },
        { from: term('Q1', 1), to: term('RL', 0), waypoints: [] },
        { from: term('RL', 1), to: term('GND', 0), waypoints: [{ x: 48, y: 24 }, { x: 12, y: 24 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 12, y: 4 }] },
      ],
    ),
  },
  {
    id: 'bjt-common-emitter',
    nameKey: 'example.bjtCommonEmitter.name',
    descKey: 'example.bjtCommonEmitter.desc',
    doc: makeDoc(
      [
        { x: 6, y: 8, type: 'battery', value: 12, label: 'V1' },
        { x: 18, y: 6, type: 'resistor', value: 47e3, label: 'R1' },
        { x: 18, y: 18, type: 'resistor', value: 10e3, label: 'R2' },
        { x: 34, y: 12, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: '2N3904', transistorType: 'npn' } },
        { x: 34, y: 3, type: 'resistor', value: 4.7e3, label: 'RC' },
        { x: 34, y: 22, type: 'resistor', value: 1e3, label: 'RE' },
        { x: 6, y: 12, type: 'acVoltageSource', value: 0.02, label: 'VIN', frequency: 1000 },
        { x: 16, y: 12, type: 'capacitor', value: 10e-6, label: 'CIN' },
        { x: 46, y: 3, type: 'capacitor', value: 10e-6, label: 'COUT' },
        { x: 58, y: 7, type: 'resistor', value: 10e3, label: 'RL' },
        { x: 6, y: 28, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('Q1', 0), waypoints: [{ x: 26, y: 6 }, { x: 26, y: 12 }] },
        { from: term('R2', 0), to: term('R1', 1), waypoints: [{ x: 22, y: 18 }, { x: 22, y: 6 }] },
        { from: term('R2', 1), to: term('GND', 0), waypoints: [{ x: 22, y: 24 }, { x: 6, y: 24 }] },
        { from: term('Q1', 1), to: term('RC', 0), waypoints: [{ x: 30, y: 3 }] },
        { from: term('RC', 1), to: term('V1', 0), waypoints: [{ x: 38, y: 1 }, { x: 2, y: 1 }] },
        { from: term('Q1', 2), to: term('RE', 0), waypoints: [{ x: 40, y: 22 }] },
        { from: term('RE', 1), to: term('GND', 0), waypoints: [{ x: 40, y: 26 }, { x: 6, y: 26 }] },
        { from: term('VIN', 0), to: term('CIN', 0), waypoints: [{ x: 6, y: 12 }] },
        { from: term('CIN', 1), to: term('Q1', 0), waypoints: [{ x: 26, y: 12 }] },
        { from: term('VIN', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 28 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 8 }, { x: 10, y: 28 }] },
        { from: term('Q1', 1), to: term('COUT', 0), waypoints: [{ x: 42, y: 3 }] },
        { from: term('COUT', 1), to: term('RL', 0), waypoints: [] },
        { from: term('RL', 1), to: term('GND', 0), waypoints: [{ x: 64, y: 28 }, { x: 6, y: 28 }] },
      ],
    ),
  },
  {
    id: 'bjt-emitter-follower',
    nameKey: 'example.bjtEmitterFollower.name',
    descKey: 'example.bjtEmitterFollower.desc',
    doc: makeDoc(
      [
        { x: 6, y: 8, type: 'battery', value: 12, label: 'V1' },
        { x: 18, y: 8, type: 'resistor', value: 100e3, label: 'R1' },
        { x: 18, y: 18, type: 'resistor', value: 47e3, label: 'R2' },
        { x: 34, y: 12, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: '2N2222', transistorType: 'npn' } },
        { x: 40, y: 22, type: 'resistor', value: 1e3, label: 'RE' },
        { x: 52, y: 22, type: 'resistor', value: 10e3, label: 'RL' },
        { x: 6, y: 28, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('R1', 0), waypoints: [] },
        { from: term('R1', 1), to: term('Q1', 0), waypoints: [{ x: 26, y: 8 }, { x: 26, y: 12 }] },
        { from: term('R2', 0), to: term('R1', 1), waypoints: [{ x: 22, y: 18 }, { x: 22, y: 8 }] },
        { from: term('R2', 1), to: term('GND', 0), waypoints: [{ x: 22, y: 26 }, { x: 6, y: 26 }] },
        { from: term('Q1', 1), to: term('V1', 0), waypoints: [{ x: 34, y: 2 }, { x: 2, y: 2 }] },
        { from: term('Q1', 2), to: term('RE', 0), waypoints: [{ x: 42, y: 20 }] },
        { from: term('RE', 1), to: term('GND', 0), waypoints: [{ x: 40, y: 28 }, { x: 6, y: 28 }] },
        { from: term('RE', 0), to: term('RL', 0), waypoints: [{ x: 48, y: 22 }] },
        { from: term('RL', 1), to: term('GND', 0), waypoints: [{ x: 58, y: 28 }, { x: 6, y: 28 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 28 }] },
      ],
    ),
  },
  {
    id: 'bjt-darlington',
    nameKey: 'example.bjtDarlington.name',
    descKey: 'example.bjtDarlington.desc',
    doc: makeDoc(
      [
        { x: 6, y: 8, type: 'battery', value: 12, label: 'V1' },
        { x: 16, y: 8, type: 'resistor', value: 1e6, label: 'RB' },
        { x: 28, y: 12, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: '2N2222', transistorType: 'npn', pMax: 100 } },
        { x: 42, y: 16, type: 'bjtTransistor', value: 200, label: 'Q2', fields: { preset: '2N2222', transistorType: 'npn', pMax: 100 } },
        { x: 52, y: 8, type: 'resistor', value: 100, label: 'RC' },
        { x: 52, y: 26, type: 'resistor', value: 100, label: 'RE' },
        { x: 6, y: 30, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('RB', 0), waypoints: [] },
        { from: term('RB', 1), to: term('Q1', 0), waypoints: [] },
        { from: term('Q1', 2), to: term('Q2', 0), waypoints: [] },
        { from: term('Q1', 1), to: term('V1', 0), waypoints: [{ x: 28, y: 2 }, { x: 2, y: 2 }] },
        { from: term('V1', 0), to: term('RC', 0), waypoints: [{ x: 2, y: 2 }, { x: 48, y: 2 }] },
        { from: term('RC', 1), to: term('Q2', 1), waypoints: [] },
        { from: term('Q2', 2), to: term('RE', 0), waypoints: [{ x: 56, y: 26 }] },
        { from: term('RE', 1), to: term('GND', 0), waypoints: [{ x: 52, y: 30 }, { x: 6, y: 30 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 30 }] },
      ],
    ),
  },
  {
    id: 'bjt-common-base',
    nameKey: 'example.bjtCommonBase.name',
    descKey: 'example.bjtCommonBase.desc',
    doc: makeDoc(
      [
        { x: 6, y: 8, type: 'battery', value: 12, label: 'V1' },
        { x: 30, y: 3, type: 'resistor', value: 4.7e3, label: 'RC' },
        { x: 44, y: 12, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: '2N3904', transistorType: 'npn' } },
        { x: 52, y: 24, type: 'resistor', value: 1e3, label: 'RE' },
        { x: 22, y: 24, type: 'acVoltageSource', value: 0.05, label: 'VIN', frequency: 1000 },
        { x: 6, y: 30, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('RC', 0), waypoints: [{ x: 26, y: 3 }] },
        { from: term('RC', 1), to: term('Q1', 1), waypoints: [{ x: 34, y: 3 }] },
        { from: term('Q1', 0), to: term('GND', 0), waypoints: [{ x: 40, y: 8 }, { x: 6, y: 8 }] },
        { from: term('Q1', 2), to: term('RE', 0), waypoints: [{ x: 48, y: 24 }] },
        { from: term('RE', 1), to: term('VIN', 0), waypoints: [{ x: 60, y: 28 }, { x: 22, y: 28 }] },
        { from: term('VIN', 1), to: term('GND', 0), waypoints: [{ x: 26, y: 30 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 30 }] },
      ],
    ),
  },
  {
    id: 'bjt-load-line',
    nameKey: 'example.bjtLoadLine.name',
    descKey: 'example.bjtLoadLine.desc',
    doc: makeDoc(
      [
        { x: 6, y: 10, type: 'battery', value: 12, label: 'V1' },
        { x: 22, y: 6, type: 'resistor', value: 220e3, label: 'RB' },
        { x: 38, y: 12, type: 'bjtTransistor', value: 200, label: 'Q1', fields: { preset: 'BC547', transistorType: 'npn', pMax: 100 } },
        { x: 38, y: 4, type: 'resistor', value: 470, label: 'RC' },
        { x: 38, y: 24, type: 'resistor', value: 100, label: 'RE' },
        { x: 6, y: 32, type: 'ground', value: 0, label: 'GND' },
      ],
      [
        { from: term('V1', 0), to: term('RB', 0), waypoints: [{ x: 18, y: 2 }] },
        { from: term('RB', 1), to: term('Q1', 0), waypoints: [{ x: 34, y: 6 }, { x: 34, y: 12 }] },
        { from: term('V1', 0), to: term('RC', 0), waypoints: [{ x: 2, y: 2 }, { x: 34, y: 2 }] },
        { from: term('RC', 1), to: term('Q1', 1), waypoints: [] },
        { from: term('Q1', 2), to: term('RE', 0), waypoints: [] },
        { from: term('RE', 1), to: term('GND', 0), waypoints: [{ x: 38, y: 32 }, { x: 6, y: 32 }] },
        { from: term('V1', 1), to: term('GND', 0), waypoints: [{ x: 10, y: 32 }] },
      ],
    ),
  },
];

// Digital example circuits (defined in examplesDigital.ts) share the same
// library array: they appear in the File menu alongside the analog ones.
EXAMPLE_CIRCUITS.push(...buildDigitalExamples());

export function getExample(id: string): ExampleCircuit | undefined {
  return EXAMPLE_CIRCUITS.find((e) => e.id === id);
}
