/**
 * Comprehensive Semiconductor Mathematical Model and Presets for Zener Diodes.
 *
 * Supports:
 *   - Piecewise Linear Model with Knee Voltage and Dynamic Resistance
 *   - Advanced Shockley + Avalanche Breakdown Model with Numerical Guarding
 *   - First-order Dynamic Thermal Simulation (Cth * dTj/dt = P - (Tj - Ta)/Rth)
 *   - Temperature Coefficient effects on breakdown voltage (DeltaVz = alpha * DeltaT)
 *   - Real manufacturer datasheet presets (1N4728A - 1N4744A, BZX55 series)
 *   - I-V characteristic curve generator for interactive analysis
 */

import type { CircuitComponent, ZenerModelType } from '../models/circuit';

export interface ZenerPreset {
  name: string;
  vz: number; // Nominal Zener breakdown voltage at Izt (V)
  izt: number; // Test current (A)
  izk: number; // Knee current (A)
  rz: number; // Dynamic resistance at test current (Ω)
  rzk: number; // Dynamic resistance at knee (Ω)
  vf: number; // Forward voltage drop (V)
  rdf: number; // Forward dynamic resistance (Ω)
  ileak: number; // Reverse leakage current at Vr (A)
  vr: number; // Voltage at which leakage is specified (V)
  pmax: number; // Maximum rated power dissipation (W)
  tempCoeff: number; // Temperature coefficient alpha (mV/°C)
  rth: number; // Thermal resistance junction to ambient (°C/W)
  cth: number; // Thermal capacitance (J/°C)
  category: 'low-voltage' | 'standard' | 'high-voltage';
  description: string;
}

export const ZENER_PRESETS: Record<string, ZenerPreset> = {
  '1N4733A': {
    name: '1N4733A (5.1V)',
    vz: 5.1,
    izt: 0.049, // 49 mA
    izk: 0.001, // 1 mA
    rz: 7, // 7 Ω
    rzk: 550, // 550 Ω
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5, // 10 µA at 1.0 V
    vr: 1.0,
    pmax: 1.0, // 1 W
    tempCoeff: 1.2, // +1.2 mV/°C
    rth: 100, // 100 °C/W
    cth: 0.08, // 80 mJ/°C
    category: 'standard',
    description: '1N4733A — 5.1V 1W Silicon Zener Diode (common reference)',
  },
  '1N4734A': {
    name: '1N4734A (5.6V)',
    vz: 5.6,
    izt: 0.045, // 45 mA
    izk: 0.001,
    rz: 5,
    rzk: 600,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 2.0,
    pmax: 1.0,
    tempCoeff: 2.5, // +2.5 mV/°C
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4734A — 5.6V 1W Silicon Zener Diode (near-zero TC region)',
  },
  '1N4735A': {
    name: '1N4735A (6.2V)',
    vz: 6.2,
    izt: 0.041,
    izk: 0.001,
    rz: 2,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 3.0,
    pmax: 1.0,
    tempCoeff: 3.5,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4735A — 6.2V 1W Silicon Zener Diode (low dynamic resistance)',
  },
  '1N4736A': {
    name: '1N4736A (6.8V)',
    vz: 6.8,
    izt: 0.037,
    izk: 0.001,
    rz: 3.5,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 4.0,
    pmax: 1.0,
    tempCoeff: 4.0,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4736A — 6.8V 1W Silicon Zener Diode',
  },
  '1N4737A': {
    name: '1N4737A (7.5V)',
    vz: 7.5,
    izt: 0.034,
    izk: 0.0005,
    rz: 4,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 5.0,
    pmax: 1.0,
    tempCoeff: 4.5,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4737A — 7.5V 1W Silicon Zener Diode',
  },
  '1N4738A': {
    name: '1N4738A (8.2V)',
    vz: 8.2,
    izt: 0.031,
    izk: 0.0005,
    rz: 4.5,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 6.0,
    pmax: 1.0,
    tempCoeff: 5.0,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4738A — 8.2V 1W Silicon Zener Diode',
  },
  '1N4739A': {
    name: '1N4739A (9.1V)',
    vz: 9.1,
    izt: 0.028,
    izk: 0.0005,
    rz: 5,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 7.0,
    pmax: 1.0,
    tempCoeff: 5.5,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4739A — 9.1V 1W Silicon Zener Diode',
  },
  '1N4740A': {
    name: '1N4740A (10V)',
    vz: 10.0,
    izt: 0.025,
    izk: 0.00025,
    rz: 7,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 1e-5,
    vr: 7.6,
    pmax: 1.0,
    tempCoeff: 6.5,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4740A — 10V 1W Silicon Zener Diode',
  },
  '1N4742A': {
    name: '1N4742A (12V)',
    vz: 12.0,
    izt: 0.021,
    izk: 0.00025,
    rz: 9,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 5e-6,
    vr: 9.1,
    pmax: 1.0,
    tempCoeff: 8.0,
    rth: 100,
    cth: 0.08,
    category: 'standard',
    description: '1N4742A — 12V 1W Silicon Zener Diode',
  },
  '1N4744A': {
    name: '1N4744A (15V)',
    vz: 15.0,
    izt: 0.017,
    izk: 0.00025,
    rz: 16,
    rzk: 700,
    vf: 0.75,
    rdf: 0.8,
    ileak: 5e-6,
    vr: 11.4,
    pmax: 1.0,
    tempCoeff: 10.5,
    rth: 100,
    cth: 0.08,
    category: 'high-voltage',
    description: '1N4744A — 15V 1W Silicon Zener Diode',
  },
  'BZX55C2V4': {
    name: 'BZX55C2V4 (2.4V)',
    vz: 2.4,
    izt: 0.005, // 5 mA
    izk: 0.001,
    rz: 85,
    rzk: 600,
    vf: 0.7,
    rdf: 1.0,
    ileak: 5e-5,
    vr: 1.0,
    pmax: 0.5, // 500 mW
    tempCoeff: -1.6, // Negative temperature coefficient! True quantum tunneling Zener effect
    rth: 300,
    cth: 0.05,
    category: 'low-voltage',
    description: 'BZX55C2V4 — 2.4V 500mW Low-Voltage True Zener (negative TC)',
  },
  'BZX55C3V3': {
    name: 'BZX55C3V3 (3.3V)',
    vz: 3.3,
    izt: 0.005,
    izk: 0.001,
    rz: 80,
    rzk: 500,
    vf: 0.7,
    rdf: 1.0,
    ileak: 2e-5,
    vr: 1.0,
    pmax: 0.5,
    tempCoeff: -1.2, // Negative temperature coefficient
    rth: 300,
    cth: 0.05,
    category: 'low-voltage',
    description: 'BZX55C3V3 — 3.3V 500mW True Zener Diode (negative TC)',
  },
};

export const DEFAULT_ZENER_PRESET = '1N4733A';

export function applyZenerPreset(presetKey: string): Partial<CircuitComponent> {
  const p = ZENER_PRESETS[presetKey] || ZENER_PRESETS[DEFAULT_ZENER_PRESET];
  return {
    preset: presetKey,
    value: p.vz,
    zenerVoltage: p.vz,
    zenerTestCurrent: p.izt,
    zenerKneeCurrent: p.izk,
    zenerResistance: p.rz,
    forwardVoltage: p.vf,
    forwardResistance: p.rdf,
    reverseLeakage: p.ileak,
    ratedPower: p.pmax,
    tempCoeff: p.tempCoeff,
    tempCoeffUnit: 'mV',
    thermalResistance: p.rth,
    thermalCapacitance: p.cth,
  };
}

export interface ZenerParameters {
  vzNominal: number; // Vz at Izt (V)
  izt: number; // Test current (A)
  izk: number; // Knee current (A)
  rz: number; // Dynamic breakdown resistance (Ω)
  vf: number; // Forward voltage (V)
  rdf: number; // Forward dynamic resistance (Ω)
  ileak: number; // Reverse leakage current (A)
  pmax: number; // Maximum power rating (W)
  model: ZenerModelType;
  tempCoeff: number; // expressed in tempCoeffUnit
  tempCoeffUnit: 'mV' | 'V' | 'percent';
  maxJunctionTemp: number; // °C
  ambientTemp: number; // °C
  thermalResistance: number; // °C/W
  thermalCapacitance: number; // J/°C
  dynamicThermal: boolean;
}

/** Check if a component is a Zener diode */
export function isZenerDiode(type: string): boolean {
  return type === 'zenerDiode' || type === 'zener-diode';
}

/**
 * Extract active Zener parameters from a CircuitComponent,
 * falling back to preset values or default 1N4733A values.
 */
export function getZenerParameters(comp: Partial<CircuitComponent>): ZenerParameters {
  const presetKey = comp.preset && ZENER_PRESETS[comp.preset] ? comp.preset : DEFAULT_ZENER_PRESET;
  const p = ZENER_PRESETS[presetKey] || ZENER_PRESETS[DEFAULT_ZENER_PRESET];

  const vzNominal = comp.value && comp.value > 0 ? comp.value : p.vz;
  const izt = comp.zenerTestCurrent && comp.zenerTestCurrent > 0 ? comp.zenerTestCurrent : p.izt;
  const izk = comp.zenerKneeCurrent && comp.zenerKneeCurrent > 0 ? comp.zenerKneeCurrent : p.izk;
  const rz = comp.zenerResistance && comp.zenerResistance > 0 ? comp.zenerResistance : p.rz;
  const vf = comp.forwardVoltage && comp.forwardVoltage > 0 ? comp.forwardVoltage : p.vf;
  const rdf = comp.forwardResistance && comp.forwardResistance > 0 ? comp.forwardResistance : p.rdf;
  const ileak = comp.reverseLeakage && comp.reverseLeakage > 0 ? comp.reverseLeakage : p.ileak;
  const pmax = comp.ratedPower && comp.ratedPower > 0 ? comp.ratedPower : p.pmax;
  const tempCoeff = comp.tempCoeff !== undefined ? comp.tempCoeff : p.tempCoeff;
  const tempCoeffUnit =
    comp.tempCoeffUnit === 'V' || comp.tempCoeffUnit === 'percent'
      ? comp.tempCoeffUnit
      : 'mV';
  const maxJunctionTemp =
    comp.maxJunctionTemp && comp.maxJunctionTemp > 0 ? comp.maxJunctionTemp : 150;
  const ambientTemp = comp.ambientTemp !== undefined ? comp.ambientTemp : 25;
  const thermalResistance = comp.thermalResistance && comp.thermalResistance > 0 ? comp.thermalResistance : p.rth;
  const thermalCapacitance = comp.thermalCapacitance && comp.thermalCapacitance > 0 ? comp.thermalCapacitance : p.cth;
  const dynamicThermal = comp.dynamicThermal ?? false;
  const model = comp.zenerModel || 'piecewise-linear';

  return {
    vzNominal,
    izt,
    izk,
    rz,
    vf,
    rdf,
    ileak,
    pmax,
    model,
    tempCoeff,
    tempCoeffUnit,
    maxJunctionTemp,
    ambientTemp,
    thermalResistance,
    thermalCapacitance,
    dynamicThermal,
  };
}

/**
 * Convert the configured temperature coefficient to V/°C.
 * Low-voltage true Zeners can be negative; avalanche-dominated parts are
 * commonly positive. The unit is user-selectable (mV/°C, V/°C, %/°C).
 */
export function tempCoeffVperC(params: ZenerParameters): number {
  if (params.tempCoeffUnit === 'percent') {
    return (params.tempCoeff / 100) * params.vzNominal;
  }
  if (params.tempCoeffUnit === 'V') return params.tempCoeff;
  return params.tempCoeff * 1e-3;
}

/**
 * Calculate effective breakdown voltage accounting for temperature:
 * Vz(Tj) = Vz_nominal + alpha * (Tj - 25°C)
 */
export function effectiveZenerVoltage(params: ZenerParameters, tj: number = 25): number {
  const deltaT = tj - 25;
  const deltaVz = tempCoeffVperC(params) * deltaT;
  return Math.max(0.5, params.vzNominal + deltaVz);
}

/**
 * Knee voltage calculated from nominal Zener voltage at test current:
 * Vzk = Vz(Tj) - rz * (Izt - Izk)
 */
export function effectiveKneeVoltage(params: ZenerParameters, tj: number = 25): number {
  const vz = effectiveZenerVoltage(params, tj);
  const vzk = vz - params.rz * (params.izt - params.izk);
  return Math.max(0.4, vzk);
}

/**
 * Calculate diode current Id as a function of Vd = Va - Vk.
 * Convention:
 *   Id > 0: current flows Anode -> Cathode (forward bias)
 *   Id < 0: current flows Cathode -> Anode (reverse breakdown / leakage)
 */
export function calculateZenerCurrent(
  vd: number,
  params: ZenerParameters,
  tj: number = 25,
): number {
  if (params.model === 'ideal') {
    const vz = effectiveZenerVoltage(params, tj);
    if (vd >= params.vf) return (vd - params.vf) / 0.01;
    if (vd <= -vz) return (vd + vz) / 0.01;
    return 0;
  }

  if (params.model === 'advanced') {
    return calculateAdvancedZenerCurrent(vd, params, tj);
  }

  // Piecewise Linear Model with Knee and Dynamic Resistance (Default)
  const vzk = effectiveKneeVoltage(params, tj);

  // 1. Forward bias: Vd >= Vf
  if (vd >= params.vf) {
    return (vd - params.vf) / params.rdf;
  }

  // 2. Reverse breakdown: Vd <= -vzk (i.e. Vrev = -Vd >= Vzk)
  const vrev = -vd;
  if (vrev >= vzk) {
    // Reverse current magnitude J:
    // J = Izk + (Vrev - Vzk) / rz
    const j = params.izk + (vrev - vzk) / params.rz;
    return -j; // Id is negative
  }

  // 3. Reverse blocking / leakage region: -vzk < Vd < Vf
  // Smooth linear leakage transition between forward knee and reverse breakdown
  const rLeak = vzk / Math.max(params.ileak, 1e-8);
  return vd / rLeak;
}

/**
 * Advanced Shockley + Avalanche Breakdown model.
 * Forward:
 *   Ifwd = Is * (exp(Vd / (n * Vt)) - 1)
 * Reverse Breakdown:
 *   Irev = -Ileak - Ib * exp((-Vd - Vz) / Vb)
 * With strict numerical guarding against exponential overflow.
 */
export function calculateAdvancedZenerCurrent(
  vd: number,
  params: ZenerParameters,
  tj: number = 25,
): number {
  const tk = tj + 273.15;
  const k = 1.380649e-23;
  const q = 1.602176634e-19;
  const vt = (k * tk) / q; // ~25.8 mV at 300K
  const n = 1.5; // Ideality factor
  const nVt = n * vt;

  const vz = effectiveZenerVoltage(params, tj);
  const is = 1e-12; // Reverse saturation current

  // Forward conduction with exponential limiting
  if (vd > 0) {
    const expArg = Math.min(vd / nVt, 40); // Guard max e^40
    const iShockley = is * (Math.exp(expArg) - 1);
    // Linear series resistance transition
    const rSeries = params.rdf;
    return vd > params.vf ? (vd - params.vf) / rSeries + iShockley * 0.1 : iShockley;
  }

  // Reverse breakdown:
  const vrev = -vd;
  const vb = Math.max(0.05, params.rz * params.izt); // Scale factor
  if (vrev > vz * 0.8) {
    const expBreak = Math.min((vrev - vz) / vb, 30);
    const iBreakdown = params.izt * Math.exp(expBreak);
    return -(params.ileak + iBreakdown);
  }

  // Reverse leakage
  return -params.ileak * (vrev / vz);
}

/**
 * Linearized Companion Model for Newton-Raphson or Iterative Conductance Solver:
 * Returns equivalent conductance `g` and current offset `iEq` such that:
 *   I_branch = g * (Va - Vb) - iEq
 * For node stamping:
 *   G[A][A] += g, G[A][B] -= g, I[A] += iEq
 *   G[B][B] += g, G[B][A] -= g, I[B] -= iEq
 */
export function getZenerLinearizedModel(
  vd: number,
  params: ZenerParameters,
  tj: number = 25,
): {
  g: number;
  iEq: number;
  region: 'forward' | 'blocking' | 'breakdown';
  effectiveRz: number;
} {
  const vzk = effectiveKneeVoltage(params, tj);

  // 1. Forward Region
  if (vd >= params.vf - 0.05) {
    const gOn = 1 / params.rdf;
    // Id = (Vd - Vf) / rdf = gOn * Vd - gOn * Vf
    // Current leaving node A: +Id = gOn*(Va - Vb) - gOn*Vf
    // Current source into node A: I[A] += gOn * Vf
    return {
      g: gOn,
      iEq: gOn * params.vf,
      region: 'forward',
      effectiveRz: params.rdf,
    };
  }

  // 2. Reverse Breakdown Region
  const vrev = -vd;
  if (vrev >= vzk - 0.05) {
    // In breakdown, Vrev = Vb - Va >= Vzk
    // Reverse current J = Izk + (Vb - Va - Vzk) / rz
    // Conventional current Id (Anode to Cathode) = -J:
    // Id = -(Izk + (Vb - Va - Vzk) / rz)
    //    = (Va - Vb) / rz + (Vzk / rz - Izk)
    // Let Vz0 = Vzk - rz * Izk. Note that Vzk - rz*Izk = Vz - rz*Izt.
    // Then Id = (Va - Vb) / rz + Vz0 / rz = gz * (Va - Vb) + gz * Vz0.
    // In KCL at node A (current leaving):
    // +Id = gz*(Va - Vb) + gz*Vz0 = 0  =>  gz*(Va - Vb) = - gz*Vz0
    // So current injected into node A is - gz * Vz0.
    // Current injected into node B is + gz * Vz0.
    const gz = 1 / Math.max(params.rz, 0.1);
    const vz0 = vzk - params.rz * params.izk;
    return {
      g: gz,
      iEq: -gz * vz0,
      region: 'breakdown',
      effectiveRz: params.rz,
    };
  }

  // 3. Reverse Blocking Region
  const rOff = Math.max(1e6, vzk / Math.max(params.ileak, 1e-7));
  const gOff = 1 / rOff;
  return {
    g: gOff,
    iEq: 0,
    region: 'blocking',
    effectiveRz: rOff,
  };
}

/**
 * Step dynamic thermal simulation for one time step dt:
 * Cth * dTj/dt = P - (Tj - Ta) / Rth
 * Uses Backward Euler for unconditional numerical stability:
 * Tj(n+1) = (Tj(n) + dt/Cth * P + dt/(Rth*Cth) * Ta) / (1 + dt/(Rth*Cth))
 */
export function stepZenerThermal(
  prevTj: number,
  powerWatts: number,
  params: ZenerParameters,
  dt: number,
): number {
  if (!params.dynamicThermal) return params.ambientTemp;

  const safeDt = Math.max(1e-6, dt);
  const p = Math.max(0, powerWatts);
  const rth = Math.max(10, params.thermalResistance);
  const cth = Math.max(0.01, params.thermalCapacitance);
  const ta = params.ambientTemp;

  const alpha = safeDt / (rth * cth);
  const beta = safeDt / cth;

  const tjNext = (prevTj + beta * p + alpha * ta) / (1 + alpha);
  // Clamping to avoid extreme unphysical runaway
  return Math.max(ta, Math.min(250, tjNext));
}

/**
 * Generate a complete, high-resolution I-V characteristic dataset
 * for the analyzer graph.
 */
export function generateZenerIVData(
  params: ZenerParameters,
  tj: number = 25,
  vMin: number = -15,
  vMax: number = 2.0,
  points: number = 200,
): Array<{
  v: number;
  i: number; // in mA
  iAmps: number;
  logI: number;
  region: 'forward' | 'blocking' | 'breakdown';
}> {
  const data: Array<{
    v: number;
    i: number;
    iAmps: number;
    logI: number;
    region: 'forward' | 'blocking' | 'breakdown';
  }> = [];

  const vzk = effectiveKneeVoltage(params, tj);
  const step = (vMax - vMin) / (points - 1);

  for (let idx = 0; idx < points; idx++) {
    const v = vMin + idx * step;
    const iAmps = calculateZenerCurrent(v, params, tj);
    const iMilliAmps = iAmps * 1000;

    let region: 'forward' | 'blocking' | 'breakdown' = 'blocking';
    if (v >= params.vf) {
      region = 'forward';
    } else if (-v >= vzk) {
      region = 'breakdown';
    }

    // Signed log for log-scale visualization
    const absI = Math.max(Math.abs(iMilliAmps), 1e-4);
    const logVal = Math.log10(absI) * Math.sign(iMilliAmps);

    data.push({
      v: parseFloat(v.toFixed(3)),
      i: parseFloat(iMilliAmps.toFixed(4)),
      iAmps,
      logI: parseFloat(logVal.toFixed(3)),
      region,
    });
  }

  return data;
}

/**
 * Operating State and Safety Analysis for a Zener Diode
 */
export interface ZenerOperatingStatus {
  vd: number; // Anode to Cathode voltage (V)
  id: number; // Branch current (A)
  power: number; // Dissipated power (W)
  powerRatio: number; // P / Pmax
  region: 'forward' | 'blocking' | 'breakdown';
  statusText: string;
  isOverloaded: boolean;
  isThermalWarning: boolean;
  effectiveRz: number;
  tj: number;
  vzEffective: number;
}

export function evaluateZenerStatus(
  vd: number,
  id: number,
  power: number,
  params: ZenerParameters,
  tj: number = 25,
): ZenerOperatingStatus {
  const vzEffective = effectiveZenerVoltage(params, tj);
  const vzk = effectiveKneeVoltage(params, tj);
  const p = Math.abs(power);
  const pRatio = params.pmax > 0 ? p / params.pmax : 0;

  let region: 'forward' | 'blocking' | 'breakdown' = 'blocking';
  let statusText = 'Reverse Blocking (Idle / Leakage)';

  if (vd >= params.vf - 0.05 && id > 1e-4) {
    region = 'forward';
    statusText = 'Forward Conduction';
  } else if (-vd >= vzk - 0.1 && id < -1e-4) {
    region = 'breakdown';
    statusText = 'Zener Breakdown (Regulating)';
  } else if (Math.abs(id) <= 1e-4) {
    region = 'blocking';
    statusText = 'Reverse Blocking';
  }

  const isOverloaded = pRatio > 1.0;
  const tmax = params.maxJunctionTemp > 0 ? params.maxJunctionTemp : 150;
  const isThermalWarning = pRatio > 0.8 || tj > tmax * 0.85;

  if (isOverloaded) {
    statusText = 'OVERLOAD — Exceeds Rated Power!';
  } else if (isThermalWarning) {
    statusText = `${statusText} — Elevated Temperature / Near Tj,max`;
  }

  // Small-signal dynamic resistance
  let effectiveRz = params.rz;
  if (region === 'forward') {
    effectiveRz = params.rdf;
  } else if (region === 'blocking') {
    effectiveRz = Math.max(1e6, vzk / Math.max(params.ileak, 1e-7));
  } else {
    effectiveRz = params.rz;
  }

  return {
    vd,
    id,
    power: p,
    powerRatio: pRatio,
    region,
    statusText,
    isOverloaded,
    isThermalWarning,
    effectiveRz,
    tj,
    vzEffective,
  };
}
