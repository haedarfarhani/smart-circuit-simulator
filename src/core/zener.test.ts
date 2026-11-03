import { describe, it, expect } from 'vitest';
import {
  ZENER_PRESETS,
  getZenerParameters,
  effectiveZenerVoltage,
  effectiveKneeVoltage,
  calculateZenerCurrent,
  getZenerLinearizedModel,
  stepZenerThermal,
  evaluateZenerStatus,
  generateZenerIVData,
  isZenerDiode,
  applyZenerPreset,
} from './zenerModel';
import { buildTopology, solveCircuit } from './solver';
import { stepSimulation, DEFAULT_DT } from './simulationEngine';
import type { CircuitDoc } from '../models/circuit';

describe('Zener Diode Mathematical Model & Presets', () => {
  it('correctly provides manufacturer presets and defaults', () => {
    expect(isZenerDiode('zenerDiode')).toBe(true);
    expect(isZenerDiode('zener-diode')).toBe(true);
    expect(isZenerDiode('resistor')).toBe(false);

    expect(ZENER_PRESETS['1N4733A']).toBeDefined();
    expect(ZENER_PRESETS['1N4733A'].vz).toBe(5.1);
    expect(ZENER_PRESETS['1N4733A'].rz).toBe(7);

    expect(ZENER_PRESETS['1N4734A'].vz).toBe(5.6);
    expect(ZENER_PRESETS['1N4740A'].vz).toBe(10.0);
    expect(ZENER_PRESETS['BZX55C2V4'].vz).toBe(2.4);
    // BZX55C2V4 is true quantum tunneling with negative tempCoeff
    expect(ZENER_PRESETS['BZX55C2V4'].tempCoeff).toBeLessThan(0);
    // 1N4735A (6.2V) is avalanche breakdown with positive tempCoeff
    expect(ZENER_PRESETS['1N4735A'].tempCoeff).toBeGreaterThan(0);

    const presetValues = applyZenerPreset('1N4733A');
    expect(presetValues.value).toBe(5.1);
    expect(presetValues.zenerResistance).toBe(7);
  });

  it('calculates effective breakdown and knee voltage', () => {
    const params = getZenerParameters({
      value: 5.1,
      zenerResistance: 7,
      zenerTestCurrent: 0.049,
      zenerKneeCurrent: 0.001,
      tempCoeff: 1.2, // +1.2 mV/°C
    });

    // At 25°C, effective Vz equals nominal Vz
    expect(effectiveZenerVoltage(params, 25)).toBeCloseTo(5.1, 4);

    // At 125°C (+100°C rise), Vz increases by alpha * 100 = 1.2 mV * 100 = 0.12 V
    expect(effectiveZenerVoltage(params, 125)).toBeCloseTo(5.1 + 0.12, 3);

    // Knee voltage Vzk = Vz - rz * (Izt - Izk) = 5.1 - 7 * (0.049 - 0.001) = 5.1 - 0.336 = 4.764 V
    expect(effectiveKneeVoltage(params, 25)).toBeCloseTo(5.1 - 7 * 0.048, 3);
  });

  it('negative temp coefficient decreases Vz for low-voltage true Zener', () => {
    const params = getZenerParameters({
      preset: 'BZX55C2V4',
      value: 2.4,
      tempCoeff: -1.6, // -1.6 mV/°C
    });

    expect(effectiveZenerVoltage(params, 25)).toBeCloseTo(2.4, 4);
    // At 75°C (+50°C), Vz drops by 1.6 mV * 50 = 0.08 V
    expect(effectiveZenerVoltage(params, 75)).toBeCloseTo(2.4 - 0.08, 3);
  });

  it('calculates current in forward, reverse blocking, and reverse breakdown', () => {
    const params = getZenerParameters({
      value: 5.1,
      zenerResistance: 7,
      zenerTestCurrent: 0.049,
      zenerKneeCurrent: 0.001,
      forwardVoltage: 0.75,
      forwardResistance: 0.8,
      reverseLeakage: 1e-5,
    });

    // 1. Forward bias: Vd = +0.85 V -> conducts forward current
    const iFwd = calculateZenerCurrent(0.85, params, 25);
    expect(iFwd).toBeGreaterThan(0.05); // > 50 mA

    // 2. Reverse blocking (below breakdown): Vd = -2.0 V -> tiny leakage
    const iBlock = calculateZenerCurrent(-2.0, params, 25);
    expect(iBlock).toBeLessThanOrEqual(0);
    expect(Math.abs(iBlock)).toBeLessThan(1e-4); // < 0.1 mA

    // 3. Reverse breakdown: Vd = -5.1 V -> at test current ~ 49 mA in reverse
    const iBreakdown = calculateZenerCurrent(-5.1, params, 25);
    expect(iBreakdown).toBeLessThan(0); // reverse current into cathode
    expect(Math.abs(iBreakdown)).toBeGreaterThan(0.03); // close to 49 mA
  });

  it('linearized companion model produces valid conductances and Norton current', () => {
    const params = getZenerParameters({ value: 5.1, zenerResistance: 7 });

    // In breakdown (Vd = -5.15 V)
    const model = getZenerLinearizedModel(-5.15, params, 25);
    expect(model.g).toBeGreaterThan(0.1); // g ~ 1/7 Ω ≈ 0.14 S
    expect(model.region).toBe('breakdown');

    // In blocking (Vd = -1.0 V)
    const blockModel = getZenerLinearizedModel(-1.0, params, 25);
    expect(blockModel.g).toBeLessThan(1e-4);
    expect(blockModel.region).toBe('blocking');
  });

  it('dynamic thermal step warms up with power and cools towards ambient', () => {
    const params = getZenerParameters({
      ambientTemp: 25,
      dynamicThermal: true,
      thermalResistance: 100, // °C/W
      thermalCapacitance: 0.1, // J/°C
    });

    // Apply 0.5 W dissipation for 1 second:
    let tj = 25;
    for (let t = 0; t < 100; t++) {
      tj = stepZenerThermal(tj, 0.5, params, 0.01);
    }
    // Tj should have increased above 25°C
    expect(tj).toBeGreaterThan(26);

    // Remove power (0 W) and let it cool for 40 seconds (4 thermal time constants):
    for (let t = 0; t < 4000; t++) {
      tj = stepZenerThermal(tj, 0.0, params, 0.01);
    }
    // Should cool back down towards ambient (25°C)
    expect(Math.abs(tj - 25)).toBeLessThan(0.1);
  });

  it('generates sweep I-V data points and evaluates operational status', () => {
    const params = getZenerParameters({ value: 5.1, zenerResistance: 7 });
    const sweep = generateZenerIVData(params, 25, -8, 1.2, 50);

    expect(sweep.length).toBe(50);
    expect(sweep[0].v).toBe(-8);
    expect(sweep[sweep.length - 1].v).toBeCloseTo(1.2, 2);

    const statusBreakdown = evaluateZenerStatus(-5.12, -0.04, 0.2, params, 25);
    expect(statusBreakdown.region).toBe('breakdown');
    expect(statusBreakdown.isOverloaded).toBe(false);

    const statusOverload = evaluateZenerStatus(-5.5, -0.5, 2.75, params, 25);
    expect(statusOverload.isOverloaded).toBe(true);
  });
});

describe('Circuit Solver Integration with Zener Diode', () => {
  it('accurately regulates DC voltage across a load resistor', () => {
    // 12V Battery -> R1 (220 Ω) -> Zener (5.1V, 1N4733A) in parallel with RL (1000 Ω)
    // Cathode is connected to Node 1 (junction of R1 and RL)
    // Anode is connected to Ground (Node 0)
    // In local space, Zener at rot=90 has Cathode (term 1) at top and Anode (term 0) at bottom.
    const doc: CircuitDoc = {
      components: [
        { id: 'v1', type: 'battery', x: 0, y: 0, rotation: 0, label: 'V1', value: 12 },
        { id: 'r1', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R1', value: 220 },
        {
          id: 'dz1',
          type: 'zenerDiode',
          x: 200,
          y: 0,
          rotation: 90,
          label: 'DZ1',
          value: 5.1,
          zenerVoltage: 5.1,
          zenerResistance: 7,
          preset: '1N4733A',
        },
        { id: 'rl', type: 'resistor', x: 300, y: 0, rotation: 90, label: 'RL', value: 1000 },
        { id: 'gnd', type: 'ground', x: 0, y: 100, rotation: 0, label: 'GND', value: 0 },
      ],
      wires: [
        // Battery + to R1 term 0
        { id: 'w1', start: { componentId: 'v1', terminalIndex: 0, point: null }, end: { componentId: 'r1', terminalIndex: 0, point: null }, waypoints: [] },
        // R1 term 1 to DZ1 Cathode (term 1 at rot=90)
        { id: 'w2', start: { componentId: 'r1', terminalIndex: 1, point: null }, end: { componentId: 'dz1', terminalIndex: 1, point: null }, waypoints: [] },
        // DZ1 Cathode to RL term 1
        { id: 'w3', start: { componentId: 'dz1', terminalIndex: 1, point: null }, end: { componentId: 'rl', terminalIndex: 1, point: null }, waypoints: [] },
        // RL term 0 to DZ1 Anode (term 0 at rot=90)
        { id: 'w4', start: { componentId: 'rl', terminalIndex: 0, point: null }, end: { componentId: 'dz1', terminalIndex: 0, point: null }, waypoints: [] },
        // DZ1 Anode to Battery - (term 1)
        { id: 'w5', start: { componentId: 'dz1', terminalIndex: 0, point: null }, end: { componentId: 'v1', terminalIndex: 1, point: null }, waypoints: [] },
        // Battery - to Ground
        { id: 'w6', start: { componentId: 'v1', terminalIndex: 1, point: null }, end: { componentId: 'gnd', terminalIndex: 0, point: null }, waypoints: [] },
      ],
    };

    const topology = buildTopology(doc);
    expect(topology.nodes.size).toBeGreaterThan(0);

    const result = solveCircuit(doc);
    expect(result.isValid).toBe(true);

    const dzSol = result.componentData.get('dz1');
    const rlSol = result.componentData.get('rl');
    const r1Sol = result.componentData.get('r1');

    expect(dzSol).toBeDefined();
    expect(rlSol).toBeDefined();
    expect(r1Sol).toBeDefined();

    // The load voltage across RL must be clamped at approximately 5.1 V (within 3% tolerance)
    const vLoad = Math.abs(rlSol!.voltage);
    expect(vLoad).toBeGreaterThan(4.90);
    expect(vLoad).toBeLessThan(5.35);

    // Zener diode terminal voltage Vd = Va - Vk.
    // Va is at GND (0V), Vk is at ~5.1V, so Vd should be near -5.1V
    expect(dzSol!.voltage).toBeCloseTo(-vLoad, 2);

    // Zener current is negative (entering cathode, exiting anode)
    expect(dzSol!.current).toBeLessThan(0);

    // Zener state is breakdown
    expect(dzSol!.zenerState).toBe('breakdown');

    // Kirchhoff's Current Law: Series current through R1 equals Zener current + Load current
    const iSeries = Math.abs(r1Sol!.current);
    const iZener = Math.abs(dzSol!.current);
    const iLoad = Math.abs(rlSol!.current);
    expect(iSeries).toBeCloseTo(iZener + iLoad, 3);
  });

  it('demonstrates line regulation when input voltage changes from 10V to 20V', () => {
    const makeRegulator = (vin: number): CircuitDoc => ({
      components: [
        { id: 'v1', type: 'battery', x: 0, y: 0, rotation: 0, label: 'V1', value: vin },
        { id: 'r1', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R1', value: 220 },
        { id: 'dz1', type: 'zenerDiode', x: 200, y: 0, rotation: 90, label: 'DZ1', value: 5.1, zenerVoltage: 5.1, zenerResistance: 7 },
        { id: 'rl', type: 'resistor', x: 300, y: 0, rotation: 90, label: 'RL', value: 1000 },
        { id: 'gnd', type: 'ground', x: 0, y: 100, rotation: 0, label: 'GND', value: 0 },
      ],
      wires: [
        { id: 'w1', start: { componentId: 'v1', terminalIndex: 0, point: null }, end: { componentId: 'r1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w2', start: { componentId: 'r1', terminalIndex: 1, point: null }, end: { componentId: 'dz1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w3', start: { componentId: 'dz1', terminalIndex: 1, point: null }, end: { componentId: 'rl', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w4', start: { componentId: 'rl', terminalIndex: 0, point: null }, end: { componentId: 'dz1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w5', start: { componentId: 'dz1', terminalIndex: 0, point: null }, end: { componentId: 'v1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w6', start: { componentId: 'v1', terminalIndex: 1, point: null }, end: { componentId: 'gnd', terminalIndex: 0, point: null }, waypoints: [] },
      ],
    });

    const doc10 = makeRegulator(10);
    const doc20 = makeRegulator(20);

    const res10 = solveCircuit(doc10);
    const res20 = solveCircuit(doc20);

    const vLoad10 = Math.abs(res10.componentData.get('rl')!.voltage);
    const vLoad20 = Math.abs(res20.componentData.get('rl')!.voltage);

    // Input changed by 10 V (100% increase), but load voltage changes by only a few tenths of a volt due to rz
    const deltaVLoad = Math.abs(vLoad20 - vLoad10);
    expect(deltaVLoad).toBeLessThan(0.4); // extremely tight line regulation
    expect(vLoad10).toBeGreaterThan(4.8);
    expect(vLoad20).toBeGreaterThan(4.8);
  });

  it('remains in reverse blocking when input voltage is below breakdown', () => {
    // 3V Battery with 5.1V Zener diode
    const doc: CircuitDoc = {
      components: [
        { id: 'v1', type: 'battery', x: 0, y: 0, rotation: 0, label: 'V1', value: 3 },
        { id: 'r1', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R1', value: 1000 },
        { id: 'dz1', type: 'zenerDiode', x: 200, y: 0, rotation: 90, label: 'DZ1', value: 5.1, zenerVoltage: 5.1, zenerResistance: 7 },
        { id: 'gnd', type: 'ground', x: 0, y: 100, rotation: 0, label: 'GND', value: 0 },
      ],
      wires: [
        { id: 'w1', start: { componentId: 'v1', terminalIndex: 0, point: null }, end: { componentId: 'r1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w2', start: { componentId: 'r1', terminalIndex: 1, point: null }, end: { componentId: 'dz1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w3', start: { componentId: 'dz1', terminalIndex: 0, point: null }, end: { componentId: 'v1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w4', start: { componentId: 'v1', terminalIndex: 1, point: null }, end: { componentId: 'gnd', terminalIndex: 0, point: null }, waypoints: [] },
      ],
    };

    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);

    const dzSol = res.componentData.get('dz1');
    expect(dzSol).toBeDefined();
    expect(dzSol!.zenerState).toBe('blocking');
    // In blocking mode, current is tiny leakage
    expect(Math.abs(dzSol!.current)).toBeLessThan(1e-4);
  });

  it('acts as standard forward silicon diode when forward biased', () => {
    // 5V Battery -> R1 (470 Ω) -> Zener connected in forward bias (Anode term 0 to positive, Cathode term 1 to negative)
    const doc: CircuitDoc = {
      components: [
        { id: 'v1', type: 'battery', x: 0, y: 0, rotation: 0, label: 'V1', value: 5 },
        { id: 'r1', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R1', value: 470 },
        { id: 'dz1', type: 'zenerDiode', x: 200, y: 0, rotation: 0, label: 'DZ1', value: 5.1, forwardVoltage: 0.75 },
        { id: 'gnd', type: 'ground', x: 0, y: 100, rotation: 0, label: 'GND', value: 0 },
      ],
      wires: [
        { id: 'w1', start: { componentId: 'v1', terminalIndex: 0, point: null }, end: { componentId: 'r1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w2', start: { componentId: 'r1', terminalIndex: 1, point: null }, end: { componentId: 'dz1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w3', start: { componentId: 'dz1', terminalIndex: 1, point: null }, end: { componentId: 'v1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w4', start: { componentId: 'v1', terminalIndex: 1, point: null }, end: { componentId: 'gnd', terminalIndex: 0, point: null }, waypoints: [] },
      ],
    };

    const res = solveCircuit(doc);
    expect(res.isValid).toBe(true);

    const dzSol = res.componentData.get('dz1');
    expect(dzSol).toBeDefined();
    expect(dzSol!.zenerState).toBe('forward');
    // Forward drop around 0.75V
    expect(dzSol!.voltage).toBeGreaterThan(0.65);
    expect(dzSol!.voltage).toBeLessThan(0.85);
    // Forward current > 0
    expect(dzSol!.current).toBeGreaterThan(0.005);
  });

  it('advances in time-domain transient simulation engine with thermal heating', () => {
    const doc: CircuitDoc = {
      components: [
        { id: 'v1', type: 'battery', x: 0, y: 0, rotation: 0, label: 'V1', value: 12 },
        { id: 'r1', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R1', value: 100 },
        {
          id: 'dz1',
          type: 'zenerDiode',
          x: 200,
          y: 0,
          rotation: 90,
          label: 'DZ1',
          value: 5.1,
          zenerVoltage: 5.1,
          zenerResistance: 7,
          dynamicThermal: true,
          thermalResistance: 100,
          thermalCapacitance: 0.05,
        },
        { id: 'gnd', type: 'ground', x: 0, y: 100, rotation: 0, label: 'GND', value: 0 },
      ],
      wires: [
        { id: 'w1', start: { componentId: 'v1', terminalIndex: 0, point: null }, end: { componentId: 'r1', terminalIndex: 0, point: null }, waypoints: [] },
        { id: 'w2', start: { componentId: 'r1', terminalIndex: 1, point: null }, end: { componentId: 'dz1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w3', start: { componentId: 'dz1', terminalIndex: 0, point: null }, end: { componentId: 'v1', terminalIndex: 1, point: null }, waypoints: [] },
        { id: 'w4', start: { componentId: 'v1', terminalIndex: 1, point: null }, end: { componentId: 'gnd', terminalIndex: 0, point: null }, waypoints: [] },
      ],
    };

    const topology = buildTopology(doc);
    const engineState = {
      doc,
      topology,
      capacitorVoltage: new Map<string, number>(),
      inductorCurrent: new Map<string, number>(),
      zenerJunctionTemp: new Map<string, number>(),
      simTime: 0,
      status: 'running' as const,
      snapshot: null,
      errors: [],
      warnings: [],
    };

    // Step simulation for 50 steps
    let lastSnap = null;
    for (let i = 0; i < 50; i++) {
      lastSnap = stepSimulation(doc, topology, engineState, DEFAULT_DT);
    }

    expect(lastSnap).toBeDefined();
    expect(lastSnap!.valid).toBe(true);

    const dzSnap = lastSnap!.componentData.get('dz1');
    expect(dzSnap).toBeDefined();
    expect(dzSnap!.zenerState).toBe('breakdown');
    expect(dzSnap!.voltage).toBeLessThan(-5.0);
    expect(dzSnap!.voltage).toBeGreaterThan(-5.4);
    expect(dzSnap!.power).toBeGreaterThan(0.2); // ~350 mW
    // Junction temp should have begun warming up
    expect(dzSnap!.junctionTemp).toBeDefined();
    expect(dzSnap!.junctionTemp!).toBeGreaterThan(25);
  });
});
