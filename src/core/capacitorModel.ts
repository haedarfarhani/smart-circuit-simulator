/**
 * Polarized capacitor model.
 *
 * The component is solved by the same nodal engine as every other branch: at
 * each timestep it is stamped as a Norton companion of
 *
 *     ESR — ESL — C   (all in series)
 *
 * so ESR and ESL change the transient solution itself, not just a displayed
 * number. Backward Euler is used for both storage elements; that gives the
 * unconditionally stable companion
 *
 *     g    = 1 / (ESR + ESL/dt + dt/C)
 *     iHist = g · (Vc(n−1) − (ESL/dt)·Ic(n−1))
 *
 * with Vc(n) = Vc(n−1) + Ic(n)·dt/C. With ESL = 0 this reduces to the familiar
 * capacitor companion. Trapezoidal integration is available when ESL is 0:
 *
 *     Ic(n) = 2C/dt·(Vc(n) − Vc(n−1)) − Ic(n−1)
 *
 * A parallel leakage resistance and, in realistic mode, an approximate reverse
 * breakdown branch are stamped alongside. The reverse voltage is never clamped
 * to zero and the terminal polarity is never rewritten: a reverse-biased part
 * reports a negative Vc and a warning, which is what the physics says.
 */

import type { CircuitComponent, CircuitDoc, ComponentType } from '../models/circuit';

export type CapacitorTechnology =
  | 'aluminum-electrolytic'
  | 'tantalum'
  | 'polymer'
  | 'custom';

export type CapacitorModelMode = 'ideal' | 'realistic';
export type CapacitorIntegration = 'backward-euler' | 'trapezoidal';
export type CapacitorFailureBehavior = 'breakdown-conduction' | 'open' | 'short';
export type CapacitorPolarity = 'normal' | 'reverse' | 'unpowered';
export type CapacitorThermalState = 'normal' | 'warm' | 'hot' | 'over';
export type CapacitorReverseSeverity = 'none' | 'mild' | 'moderate' | 'severe';
export type CapacitorOperatingState =
  | 'charging'
  | 'discharging'
  | 'steady'
  | 'reverse'
  | 'breakdown'
  | 'idle';

export const CAPACITOR_TECHNOLOGY_LABELS: Record<CapacitorTechnology, string> = {
  'aluminum-electrolytic': 'Aluminum electrolytic',
  tantalum: 'Tantalum',
  polymer: 'Polymer electrolytic',
  custom: 'Custom polarized capacitor',
};

export interface CapacitorPreset {
  key: string;
  label: string;
  technology: CapacitorTechnology;
  /** farads */
  capacitance: number;
  /** volts */
  ratedVoltage: number;
  /** ohms */
  esr: number;
  /** henries */
  esl: number;
  /** leakage current at rated voltage, amps */
  leakageCurrent: number;
  /** magnitude of the reverse voltage the model starts conducting at, volts */
  reverseBreakdownVoltage: number;
  /** maximum allowed RMS ripple current, amps */
  maxRippleCurrent: number;
  /** frequency the ripple rating is specified at, Hz */
  rippleFrequency: number;
  /** °C/W */
  rth: number;
  /** J/°C */
  cth: number;
  /** °C */
  maxTemp: number;
  /** capacitance tolerance, percent */
  tolerance: number;
}

/** Datasheet-style presets. Reverse limits differ by chemistry by design. */
export const CAPACITOR_PRESETS: Record<string, CapacitorPreset> = {
  '1uF-50V': {
    key: '1uF-50V',
    label: '1 µF · 50 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 1e-6,
    ratedVoltage: 50,
    esr: 5,
    esl: 8e-9,
    leakageCurrent: 3e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.02,
    rippleFrequency: 120,
    rth: 120,
    cth: 0.03,
    maxTemp: 105,
    tolerance: 20,
  },
  '4u7-50V': {
    key: '4u7-50V',
    label: '4.7 µF · 50 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 4.7e-6,
    ratedVoltage: 50,
    esr: 3,
    esl: 8e-9,
    leakageCurrent: 4e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.035,
    rippleFrequency: 120,
    rth: 110,
    cth: 0.04,
    maxTemp: 105,
    tolerance: 20,
  },
  '10uF-25V': {
    key: '10uF-25V',
    label: '10 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 10e-6,
    ratedVoltage: 25,
    esr: 1.8,
    esl: 7e-9,
    leakageCurrent: 5e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.05,
    rippleFrequency: 120,
    rth: 100,
    cth: 0.05,
    maxTemp: 105,
    tolerance: 20,
  },
  '22uF-25V': {
    key: '22uF-25V',
    label: '22 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 22e-6,
    ratedVoltage: 25,
    esr: 1.2,
    esl: 7e-9,
    leakageCurrent: 6e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.08,
    rippleFrequency: 120,
    rth: 95,
    cth: 0.06,
    maxTemp: 105,
    tolerance: 20,
  },
  '47uF-25V': {
    key: '47uF-25V',
    label: '47 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 47e-6,
    ratedVoltage: 25,
    esr: 0.9,
    esl: 6e-9,
    leakageCurrent: 12e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.12,
    rippleFrequency: 120,
    rth: 90,
    cth: 0.08,
    maxTemp: 105,
    tolerance: 20,
  },
  '100uF-25V': {
    key: '100uF-25V',
    label: '100 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 100e-6,
    ratedVoltage: 25,
    esr: 0.6,
    esl: 6e-9,
    leakageCurrent: 25e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.2,
    rippleFrequency: 120,
    rth: 80,
    cth: 0.1,
    maxTemp: 105,
    tolerance: 20,
  },
  '220uF-25V': {
    key: '220uF-25V',
    label: '220 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 220e-6,
    ratedVoltage: 25,
    esr: 0.35,
    esl: 5e-9,
    leakageCurrent: 55e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.3,
    rippleFrequency: 120,
    rth: 70,
    cth: 0.15,
    maxTemp: 105,
    tolerance: 20,
  },
  '470uF-25V': {
    key: '470uF-25V',
    label: '470 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 470e-6,
    ratedVoltage: 25,
    esr: 0.22,
    esl: 5e-9,
    leakageCurrent: 110e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.45,
    rippleFrequency: 120,
    rth: 60,
    cth: 0.25,
    maxTemp: 105,
    tolerance: 20,
  },
  '1000uF-25V': {
    key: '1000uF-25V',
    label: '1000 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 1000e-6,
    ratedVoltage: 25,
    esr: 0.12,
    esl: 5e-9,
    leakageCurrent: 250e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 0.7,
    rippleFrequency: 120,
    rth: 50,
    cth: 0.4,
    maxTemp: 105,
    tolerance: 20,
  },
  '2200uF-25V': {
    key: '2200uF-25V',
    label: '2200 µF · 25 V electrolytic',
    technology: 'aluminum-electrolytic',
    capacitance: 2200e-6,
    ratedVoltage: 25,
    esr: 0.07,
    esl: 5e-9,
    leakageCurrent: 500e-6,
    reverseBreakdownVoltage: 1.5,
    maxRippleCurrent: 1.0,
    rippleFrequency: 120,
    rth: 45,
    cth: 0.6,
    maxTemp: 105,
    tolerance: 20,
  },
  '10uF-16V-tantalum': {
    key: '10uF-16V-tantalum',
    label: '10 µF · 16 V tantalum',
    technology: 'tantalum',
    capacitance: 10e-6,
    ratedVoltage: 16,
    esr: 1.5,
    esl: 4e-9,
    leakageCurrent: 1e-6,
    reverseBreakdownVoltage: 0.5,
    maxRippleCurrent: 0.1,
    rippleFrequency: 120,
    rth: 120,
    cth: 0.02,
    maxTemp: 125,
    tolerance: 10,
  },
  '22uF-16V-tantalum': {
    key: '22uF-16V-tantalum',
    label: '22 µF · 16 V tantalum',
    technology: 'tantalum',
    capacitance: 22e-6,
    ratedVoltage: 16,
    esr: 1.0,
    esl: 4e-9,
    leakageCurrent: 1.5e-6,
    reverseBreakdownVoltage: 0.5,
    maxRippleCurrent: 0.15,
    rippleFrequency: 120,
    rth: 110,
    cth: 0.03,
    maxTemp: 125,
    tolerance: 10,
  },
  '100uF-16V-polymer': {
    key: '100uF-16V-polymer',
    label: '100 µF · 16 V polymer',
    technology: 'polymer',
    capacitance: 100e-6,
    ratedVoltage: 16,
    esr: 0.02,
    esl: 3e-9,
    leakageCurrent: 30e-6,
    reverseBreakdownVoltage: 1.0,
    maxRippleCurrent: 1.2,
    rippleFrequency: 100000,
    rth: 40,
    cth: 0.05,
    maxTemp: 105,
    tolerance: 20,
  },
};

export const DEFAULT_CAPACITOR_PRESET = '100uF-25V';

/** Component-level preset applied from the inspector. */
export function applyCapacitorPreset(presetKey: string): Partial<CircuitComponent> {
  const p = CAPACITOR_PRESETS[presetKey] ?? CAPACITOR_PRESETS[DEFAULT_CAPACITOR_PRESET];
  return {
    preset: p.key,
    value: p.capacitance,
    technology: p.technology,
    ratedVoltage: p.ratedVoltage,
    esr: p.esr,
    esl: p.esl,
    leakageCurrent: p.leakageCurrent,
    reverseBreakdownVoltage: p.reverseBreakdownVoltage,
    maxRippleCurrent: p.maxRippleCurrent,
    rippleFrequency: p.rippleFrequency,
    thermalResistance: p.rth,
    thermalCapacitance: p.cth,
    maxTemp: p.maxTemp,
    tolerance: p.tolerance,
  };
}

export interface CapacitorParameters {
  capacitance: number;
  ratedVoltage: number;
  initialVoltage: number;
  initialCharge: number;
  initialConditionEnabled: boolean;
  tolerance: number;
  technology: CapacitorTechnology;
  model: CapacitorModelMode;
  integration: CapacitorIntegration;
  esr: number;
  esl: number;
  leakageCurrent: number;
  /** Ω; derived from the leakage current at rated voltage when not given. */
  leakageResistance: number;
  reverseBreakdownVoltage: number;
  failureBehavior: CapacitorFailureBehavior;
  maxRippleCurrent: number;
  rippleFrequency: number;
  ambientTemp: number;
  thermalResistance: number;
  thermalCapacitance: number;
  maxTemp: number;
  dynamicThermal: boolean;
  /** 0..1 — retained charge fraction after a full discharge (dielectric absorption) */
  dielectricAbsorption: number;
  preset: string;
}

const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function isCapacitorType(type: ComponentType): boolean {
  return type === 'capacitor' || type === 'polarized-capacitor';
}

export function isPolarizedCapacitor(type: ComponentType): boolean {
  return type === 'polarized-capacitor';
}

/**
 * Resolve the active parameters of a capacitor. Invalid values never reach the
 * solver: zero/negative capacitance, negative ESR and non-finite numbers fall
 * back to the preset, so a malformed document cannot poison the matrix.
 */
export function getCapacitorParameters(comp: Partial<CircuitComponent>): CapacitorParameters {
  const known = comp.preset ? CAPACITOR_PRESETS[comp.preset] : undefined;
  const p = known ?? CAPACITOR_PRESETS[DEFAULT_CAPACITOR_PRESET];

  const capacitance = finite(comp.value, p.capacitance);
  const ratedVoltage = finite(comp.ratedVoltage, p.ratedVoltage);
  const safeC = capacitance > 0 ? capacitance : p.capacitance;
  const safeVr = ratedVoltage > 0 ? ratedVoltage : p.ratedVoltage;

  const leakageCurrent = Math.max(0, finite(comp.leakageCurrent, p.leakageCurrent));
  const leakageResistance = Math.max(
    0,
    finite(
      comp.leakageResistance,
      leakageCurrent > 0 ? safeVr / leakageCurrent : Infinity,
    ),
  );

  const initialConditionEnabled = comp.initialConditionEnabled === true;
  const initialVoltage = initialConditionEnabled
    ? finite(comp.initialVoltage, 0)
    : 0;
  const initialCharge = finite(comp.initialCharge, safeC * initialVoltage);

  return {
    capacitance: safeC,
    ratedVoltage: safeVr,
    initialVoltage,
    initialCharge,
    initialConditionEnabled,
    tolerance: Math.max(0, finite(comp.tolerance, p.tolerance)),
    technology: comp.technology ?? p.technology,
    model: comp.capacitorModel === 'ideal' ? 'ideal' : 'realistic',
    integration:
      comp.capacitorIntegration === 'trapezoidal' ? 'trapezoidal' : 'backward-euler',
    esr: Math.max(0, finite(comp.esr, p.esr)),
    esl: Math.max(0, finite(comp.esl, p.esl)),
    leakageCurrent,
    leakageResistance,
    reverseBreakdownVoltage: Math.max(
      0,
      finite(comp.reverseBreakdownVoltage, p.reverseBreakdownVoltage),
    ),
    failureBehavior: comp.failureBehavior ?? 'breakdown-conduction',
    maxRippleCurrent: Math.max(0, finite(comp.maxRippleCurrent, p.maxRippleCurrent)),
    rippleFrequency: Math.max(0, finite(comp.rippleFrequency, p.rippleFrequency)),
    ambientTemp: finite(comp.ambientTemp, 25),
    thermalResistance: Math.max(1e-3, finite(comp.thermalResistance, p.rth)),
    thermalCapacitance: Math.max(1e-3, finite(comp.thermalCapacitance, p.cth)),
    maxTemp: Math.max(1, finite(comp.maxTemp, p.maxTemp)),
    dynamicThermal: comp.dynamicThermal === true,
    dielectricAbsorption: Math.min(
      1,
      Math.max(0, finite(comp.dielectricAbsorption, 0)),
    ),
    preset: comp.preset ?? 'custom',
  };
}

// ---------------------------------------------------------------------------
// Companion model of ESR + ESL + C
// ---------------------------------------------------------------------------

export interface CapacitorCompanion {
  /** Norton conductance between the terminals, siemens */
  conductance: number;
  /** Norton history current source, amps (current injected into the + node) */
  historyCurrent: number;
  /** integration actually used (ESL forces backward Euler) */
  integration: CapacitorIntegration;
}

/**
 * Build this timestep's companion. `previousVoltage` is the ideal capacitor
 * voltage (not the terminal voltage), `previousCurrent` the previous branch
 * current. The returned branch current is
 *   Ic = conductance·Vterminal + historyCurrent
 * flowing from terminal 0 (+) to terminal 1 (−).
 */
export function capacitorCompanion(
  params: CapacitorParameters,
  dt: number,
  previousVoltage: number,
  previousCurrent: number,
): CapacitorCompanion {
  const c = Math.max(params.capacitance, 1e-15);
  const h = Number.isFinite(dt) && dt > 0 ? dt : 1e-4;
  const esr = Math.max(0, params.esr);
  const esl = Math.max(0, params.esl);
  const vPrev = Number.isFinite(previousVoltage) ? previousVoltage : 0;
  const iPrev = Number.isFinite(previousCurrent) ? previousCurrent : 0;

  if (params.integration === 'trapezoidal' && esl === 0) {
    // Ic = k(Vt − Ic·ESR − Vc_prev) − Ic_prev,  k = 2C/dt
    const k = (2 * c) / h;
    const denom = 1 + k * esr;
    return {
      conductance: k / denom,
      historyCurrent: -(k * vPrev + iPrev) / denom,
      integration: 'trapezoidal',
    };
  }

  // Backward Euler on both C and L:
  // Vt = ESR·Ic + ESL·(Ic − Ic_prev)/dt + Vc_prev + Ic·dt/C
  const denom = esr + esl / h + h / c;
  const conductance = 1 / denom;
  // I = g·Vt + h with h = −g·(Vc_prev − ESL·Ic_prev/dt), matching the MNA
  // stamp (I[A] -= h) so a capacitor at rest keeps zero current and then
  // charges toward the source instead of running away.
  return {
    conductance,
    historyCurrent: -conductance * (vPrev - (esl / h) * iPrev),
    integration: 'backward-euler',
  };
}

/** Branch current for a solved terminal voltage. */
export function capacitorBranchCurrent(
  companion: CapacitorCompanion,
  terminalVoltage: number,
): number {
  const current = companion.conductance * terminalVoltage + companion.historyCurrent;
  return Number.isFinite(current) ? current : 0;
}

/**
 * Advance the ideal capacitor voltage with exactly the integration the
 * companion used, so the stored state stays consistent with the solve.
 */
export function advanceCapacitorVoltage(
  params: CapacitorParameters,
  dt: number,
  previousVoltage: number,
  previousCurrent: number,
  current: number,
): number {
  const c = Math.max(params.capacitance, 1e-15);
  const h = Number.isFinite(dt) && dt > 0 ? dt : 1e-4;
  const vPrev = Number.isFinite(previousVoltage) ? previousVoltage : 0;
  const iPrev = Number.isFinite(previousCurrent) ? previousCurrent : 0;
  const i = Number.isFinite(current) ? current : 0;

  let vNext: number;
  if (params.integration === 'trapezoidal' && params.esl === 0) {
    vNext = vPrev + (h * (i + iPrev)) / (2 * c);
  } else {
    vNext = vPrev + (i * h) / c;
  }
  if (!Number.isFinite(vNext)) return vPrev;
  // Fault-level guard only; ordinary charging is untouched.
  if (Math.abs(vNext) > 1e6) return Math.sign(vNext) * 1e6;
  return vNext;
}

/** Parallel leakage current at a terminal voltage (A). */
export function capacitorLeakageCurrent(
  params: CapacitorParameters,
  terminalVoltage: number,
): number {
  if (params.model !== 'realistic') return 0;
  if (!(params.leakageResistance > 0)) return 0;
  const i = terminalVoltage / params.leakageResistance;
  return Number.isFinite(i) ? i : 0;
}

/**
 * Reverse-breakdown conductance for realistic mode. Returns null when the
 * model is ideal, no breakdown is configured, or the part was not already
 * reverse biased past the limit at the previous timestep.
 *
 * The conduction branch is a piecewise-linear element:
 *   Id = g·(V + Vbd)   for V < −Vbd
 * evaluated as a Norton source (g·Vbd of history current).
 */
export function capacitorReverseBreakdown(
  params: CapacitorParameters,
  previousVoltage: number,
): { conductance: number; historyCurrent: number } | null {
  if (params.model !== 'realistic') return null;
  if (params.reverseBreakdownVoltage <= 0) return null;
  if (params.failureBehavior === 'open') return null;
  if (!(previousVoltage < -params.reverseBreakdownVoltage)) return null;

  if (params.failureBehavior === 'short') {
    return { conductance: 1, historyCurrent: 0 };
  }
  const g = 0.5; // ≈ 2 Ω breakdown path
  return { conductance: g, historyCurrent: g * params.reverseBreakdownVoltage };
}

// ---------------------------------------------------------------------------
// Thermal model
// ---------------------------------------------------------------------------

/**
 * Cth·dT/dt = P − (T − T_ambient)/Rth, solved with the exact exponential
 * step for unconditional stability:
 *   T(n+1) = T∞ + (T(n) − T∞)·exp(−dt/(Rth·Cth)),  T∞ = Ta + P·Rth
 */
export function stepCapacitorThermal(
  previousTemp: number,
  lossWatts: number,
  params: CapacitorParameters,
  dt: number,
): number {
  const ta = params.ambientTemp;
  if (!params.dynamicThermal) return ta;
  const h = Number.isFinite(dt) && dt > 0 ? dt : 1e-4;
  const p = Math.max(0, Number.isFinite(lossWatts) ? lossWatts : 0);
  const rth = Math.max(1e-3, params.thermalResistance);
  const cth = Math.max(1e-3, params.thermalCapacitance);
  const tau = Math.max(1e-9, rth * cth);
  const steady = ta + p * rth;
  const prev = Number.isFinite(previousTemp) ? previousTemp : ta;
  const next = steady + (prev - steady) * Math.exp(-h / tau);
  if (!Number.isFinite(next)) return ta;
  return Math.max(ta, Math.min(300, next));
}

/** ESR heating plus leakage heating (W). */
export function capacitorLoss(
  params: CapacitorParameters,
  current: number,
  terminalVoltage: number,
): { esrLoss: number; leakageLoss: number; total: number } {
  const i = Number.isFinite(current) ? current : 0;
  const esrLoss = i * i * params.esr;
  const leakageLoss = Math.abs(
    terminalVoltage * capacitorLeakageCurrent(params, terminalVoltage),
  );
  return { esrLoss, leakageLoss, total: esrLoss + leakageLoss };
}

// ---------------------------------------------------------------------------
// Operating readout
// ---------------------------------------------------------------------------

export interface CapacitorSolution {
  /** terminal voltage, V(+)-V(−) */
  terminalVoltage: number;
  /** ideal capacitor voltage (terminal voltage minus the ESR drop) */
  idealVoltage: number;
  current: number;
  charge: number;
  energy: number;
  esrVoltage: number;
  esrLoss: number;
  leakageCurrent: number;
  rmsCurrent: number;
  peakCurrent: number;
  rippleVoltage: number;
  rippleFrequency: number | null;
  temperature: number;
  polarity: CapacitorPolarity;
  reverseVoltage: number;
  reverseDuration: number;
  reverseSeverity: CapacitorReverseSeverity;
  overvoltage: boolean;
  voltageRatio: number;
  overRipple: boolean;
  rippleRatio: number;
  thermalState: CapacitorThermalState;
  breakdown: boolean;
  state: CapacitorOperatingState;
  stateText: string;
}

export interface CapacitorReadoutInput {
  terminalVoltage: number;
  current: number;
  temperature: number;
  rmsCurrent?: number;
  peakCurrent?: number;
  rippleVoltage?: number;
  rippleFrequency?: number | null;
  reverseDuration?: number;
}

/** Build the measurement object every UI layer reads. */
export function buildCapacitorReadout(
  params: CapacitorParameters,
  input: CapacitorReadoutInput,
): CapacitorSolution {
  const vt = Number.isFinite(input.terminalVoltage) ? input.terminalVoltage : 0;
  const i = Number.isFinite(input.current) ? input.current : 0;
  const temp = Number.isFinite(input.temperature) ? input.temperature : params.ambientTemp;

  const idealVoltage = vt - i * params.esr;
  const esrVoltage = i * params.esr;
  const charge = params.capacitance * idealVoltage;
  const energy = 0.5 * params.capacitance * idealVoltage * idealVoltage;
  const leakageCurrent = capacitorLeakageCurrent(params, vt);
  const losses = capacitorLoss(params, i, vt);

  const polarity: CapacitorPolarity =
    Math.abs(vt) < 1e-9 ? 'unpowered' : vt > 0 ? 'normal' : 'reverse';
  const reverseVoltage = Math.max(0, -vt);
  const breakdown =
    params.model === 'realistic' &&
    polarity === 'reverse' &&
    reverseVoltage >= params.reverseBreakdownVoltage &&
    params.reverseBreakdownVoltage > 0 &&
    params.failureBehavior !== 'open';
  // Severity is reported relative to this part's configured reverse limit;
  // it is never an assertion that the part is "safe up to" that voltage.
  const reverseSeverity: CapacitorReverseSeverity =
    reverseVoltage <= 0
      ? 'none'
      : params.reverseBreakdownVoltage > 0 &&
          reverseVoltage >= params.reverseBreakdownVoltage
        ? 'severe'
        : params.reverseBreakdownVoltage > 0 &&
            reverseVoltage >= 0.5 * params.reverseBreakdownVoltage
          ? 'moderate'
          : 'mild';

  const overvoltage = Math.abs(vt) > params.ratedVoltage;
  const voltageRatio =
    params.ratedVoltage > 0 ? Math.abs(vt) / params.ratedVoltage : 0;
  const peakCurrent = Math.abs(input.peakCurrent ?? Math.abs(i));
  const rippleRatio =
    params.maxRippleCurrent > 0 ? peakCurrent / params.maxRippleCurrent : 0;
  const overRipple = params.maxRippleCurrent > 0 && peakCurrent > params.maxRippleCurrent;

  const thermalState: CapacitorThermalState =
    temp >= params.maxTemp
      ? 'over'
      : temp >= params.maxTemp * 0.85
        ? 'hot'
        : temp > params.ambientTemp + 10
          ? 'warm'
          : 'normal';

  let state: CapacitorOperatingState;
  if (breakdown) state = 'breakdown';
  else if (polarity === 'reverse') state = 'reverse';
  else if (Math.abs(i) < 1e-7 && Math.abs(vt) < 1e-9) state = 'idle';
  else if (i > 1e-7) state = 'charging';
  else if (i < -1e-7) state = 'discharging';
  else state = 'steady';

  const stateText =
    state === 'charging'
      ? 'Charging'
      : state === 'discharging'
        ? 'Discharging'
        : state === 'steady'
          ? 'Steady (stored charge)'
          : state === 'reverse'
            ? 'Reverse biased'
            : state === 'breakdown'
              ? 'Reverse breakdown'
              : 'Idle';

  return {
    terminalVoltage: vt,
    idealVoltage,
    current: i,
    charge,
    energy,
    esrVoltage,
    esrLoss: losses.esrLoss,
    leakageCurrent,
    rmsCurrent: Math.abs(input.rmsCurrent ?? Math.abs(i)),
    peakCurrent,
    rippleVoltage: Math.abs(input.rippleVoltage ?? 0),
    rippleFrequency: input.rippleFrequency ?? null,
    temperature: temp,
    polarity,
    reverseVoltage,
    reverseSeverity,

    reverseDuration: Math.max(0, input.reverseDuration ?? 0),
    overvoltage,
    voltageRatio,
    overRipple,
    rippleRatio,
    thermalState,
    breakdown,
    state,
    stateText,
  };
}

// ---------------------------------------------------------------------------
// Runtime statistics (RMS / peak / ripple) from the simulated waveform
// ---------------------------------------------------------------------------

export interface CapacitorRuntimeStats {
  samples: number;
  sumCurrentSquared: number;
  sumCurrent: number;
  peakCurrent: number;
  minVoltage: number;
  maxVoltage: number;
  sumPower: number;
  lastVoltage: number;
  lastSlope: number;
  lastPeakTime: number | null;
  ripplePeriod: number | null;
  reverseDuration: number;
  windowStart: number;
}

export function createCapacitorStats(
  initialVoltage = 0,
  now = 0,
): CapacitorRuntimeStats {
  const v = Number.isFinite(initialVoltage) ? initialVoltage : 0;
  return {
    samples: 1,
    sumCurrentSquared: 0,
    sumCurrent: 0,
    peakCurrent: 0,
    minVoltage: v,
    maxVoltage: v,
    sumPower: 0,
    lastVoltage: v,
    lastSlope: 0,
    lastPeakTime: null,
    ripplePeriod: null,
    reverseDuration: 0,
    windowStart: now,
  };
}

export interface CapacitorStatsSample {
  t: number;
  voltage: number;
  current: number;
  power: number;
  dt: number;
}

/**
 * Accumulate one simulated instant into a rolling measurement window. Only
 * real solver output goes in; RMS, ripple and ripple frequency are derived
 * from it. The window (default 200 ms) bounds memory and lets the readouts
 * track slow changes instead of averaging from t = 0 forever.
 */
export function accumulateCapacitorStats(
  previous: CapacitorRuntimeStats,
  sample: CapacitorStatsSample,
  windowSeconds = 0.2,
): CapacitorRuntimeStats {
  const t = Number.isFinite(sample.t) ? sample.t : previous.windowStart;
  const v = Number.isFinite(sample.voltage) ? sample.voltage : 0;
  const i = Number.isFinite(sample.current) ? sample.current : 0;
  const p = Number.isFinite(sample.power) ? sample.power : 0;
  const dt = Number.isFinite(sample.dt) && sample.dt > 0 ? sample.dt : 0;

  const newWindow = t - previous.windowStart > windowSeconds;
  const samples = newWindow ? 0 : previous.samples;
  const sumCurrentSquared = (newWindow ? 0 : previous.sumCurrentSquared) + i * i;
  const sumCurrent = (newWindow ? 0 : previous.sumCurrent) + i;
  const sumPower = (newWindow ? 0 : previous.sumPower) + p;
  const peakCurrent = newWindow
    ? Math.abs(i)
    : Math.max(previous.peakCurrent, Math.abs(i));
  const minVoltage = newWindow ? v : Math.min(previous.minVoltage, v);
  const maxVoltage = newWindow ? v : Math.max(previous.maxVoltage, v);

  const slope = v - previous.lastVoltage;
  let lastPeakTime = previous.lastPeakTime;
  let ripplePeriod = previous.ripplePeriod;
  if (previous.lastSlope > 0 && slope <= 0) {
    if (lastPeakTime != null && t > lastPeakTime) {
      const period = t - lastPeakTime;
      if (Number.isFinite(period) && period > 0) ripplePeriod = period;
    }
    lastPeakTime = t;
  }

  return {
    samples: samples + 1,
    sumCurrentSquared,
    sumCurrent,
    peakCurrent,
    minVoltage,
    maxVoltage,
    sumPower,
    lastVoltage: v,
    lastSlope: slope,
    lastPeakTime,
    ripplePeriod,
    reverseDuration: previous.reverseDuration + (v < 0 ? dt : 0),
    windowStart: newWindow ? t : previous.windowStart,
  };
}

export interface CapacitorStatsReadout {
  rmsCurrent: number;
  averageCurrent: number;
  peakCurrent: number;
  averagePower: number;
  rippleVoltage: number;
  rippleFrequency: number | null;
  reverseDuration: number;
}

export function capacitorStatsReadout(
  stats: CapacitorRuntimeStats,
): CapacitorStatsReadout {
  const n = Math.max(1, stats.samples);
  const rippleVoltage =
    stats.samples > 1 ? Math.max(0, stats.maxVoltage - stats.minVoltage) : 0;
  const rippleFrequency =
    stats.ripplePeriod != null && stats.ripplePeriod > 0
      ? 1 / stats.ripplePeriod
      : null;
  return {
    rmsCurrent: Math.sqrt(stats.sumCurrentSquared / n),
    averageCurrent: stats.sumCurrent / n,
    peakCurrent: stats.peakCurrent,
    averagePower: stats.sumPower / n,
    rippleVoltage,
    rippleFrequency,
    reverseDuration: stats.reverseDuration,
  };
}

// ---------------------------------------------------------------------------
// Initial conditions and RC helpers
// ---------------------------------------------------------------------------

/** Seed the engine's stored capacitor voltage from component initial conditions. */
export function initialCapacitorVoltage(comp: CircuitComponent): number {
  const params = getCapacitorParameters(comp);
  if (!params.initialConditionEnabled) return 0;
  const fromCharge =
    params.capacitance > 0 ? params.initialCharge / params.capacitance : 0;
  if (comp.initialVoltage !== undefined && Number.isFinite(comp.initialVoltage)) {
    return comp.initialVoltage;
  }
  return Number.isFinite(fromCharge) ? fromCharge : 0;
}

export interface SeededCapacitorState {
  capacitorVoltage: Map<string, number>;
  capacitorCurrent: Map<string, number>;
  capacitorTemperature: Map<string, number>;
  capacitorStats: Map<string, CapacitorRuntimeStats>;
}

export function seedCapacitorState(doc: CircuitDoc): SeededCapacitorState {
  const capacitorVoltage = new Map<string, number>();
  const capacitorCurrent = new Map<string, number>();
  const capacitorTemperature = new Map<string, number>();
  const capacitorStats = new Map<string, CapacitorRuntimeStats>();
  for (const comp of doc.components) {
    if (!isCapacitorType(comp.type)) continue;
    const v = comp.type === 'polarized-capacitor' ? initialCapacitorVoltage(comp) : 0;
    capacitorVoltage.set(comp.id, v);
    capacitorCurrent.set(comp.id, 0);
    const params = getCapacitorParameters(comp);
    capacitorTemperature.set(comp.id, params.ambientTemp);
    capacitorStats.set(comp.id, createCapacitorStats(v));
  }
  return { capacitorVoltage, capacitorCurrent, capacitorTemperature, capacitorStats };
}

/** v(t) = Vs + (V0 − Vs)·e^(−t/RC) */
export function rcChargeVoltage(
  supplyVoltage: number,
  initialVoltage: number,
  resistance: number,
  capacitance: number,
  t: number,
): number {
  const tau = Math.abs(resistance * capacitance);
  if (!(tau > 0) || !Number.isFinite(t)) return supplyVoltage;
  return supplyVoltage + (initialVoltage - supplyVoltage) * Math.exp(-t / tau);
}

/** v(t) = V0·e^(−t/RC) */
export function rcDischargeVoltage(
  initialVoltage: number,
  resistance: number,
  capacitance: number,
  t: number,
): number {
  const tau = Math.abs(resistance * capacitance);
  if (!(tau > 0) || !Number.isFinite(t)) return initialVoltage;
  return initialVoltage * Math.exp(-t / tau);
}

/** Time to reach `fraction` of the final voltage: t = −τ·ln(1−f). */
export function rcChargeDuration(
  resistance: number,
  capacitance: number,
  fraction = 0.99,
): number {
  const tau = Math.abs(resistance * capacitance);
  const f = Math.min(0.999999, Math.max(0, fraction));
  if (!(tau > 0)) return 0;
  return -tau * Math.log(1 - f);
}

/** Time to fall to `fraction` of the initial voltage: t = −τ·ln(f). */
export function rcDischargeDuration(
  resistance: number,
  capacitance: number,
  fraction = 0.01,
): number {
  const tau = Math.abs(resistance * capacitance);
  const f = Math.min(1, Math.max(1e-6, fraction));
  if (!(tau > 0)) return 0;
  return -tau * Math.log(f);
}

export function chargePercentage(
  voltage: number,
  initialVoltage: number,
  finalVoltage: number,
): number {
  const span = finalVoltage - initialVoltage;
  if (Math.abs(span) < 1e-12) return 100;
  return Math.min(100, Math.max(0, ((voltage - initialVoltage) / span) * 100));
}

export function seriesCapacitance(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return 0;
  const inv = valid.reduce((sum, v) => sum + 1 / v, 0);
  return inv > 0 ? 1 / inv : 0;
}

export function parallelCapacitance(values: number[]): number {
  return values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
}

// ---------------------------------------------------------------------------
// Bilingual educational copy
// ---------------------------------------------------------------------------

export type CapacitorExplanationTopic =
  | 'capacitance'
  | 'charge'
  | 'energy'
  | 'esr'
  | 'esl'
  | 'leakage'
  | 'ripple'
  | 'timeConstant'
  | 'dielectricAbsorption'
  | 'polarization'
  | 'charging'
  | 'discharging'
  | 'reversePolarity'
  | 'overvoltage'
  | 'highRipple'
  | 'thermal';

export const CAPACITOR_EXPLANATIONS: Record<
  'en' | 'fa',
  Record<CapacitorExplanationTopic, string>
> = {
  en: {
    capacitance:
      'Capacitance C is the charge stored per volt: Q = C·V. A large electrolytic stores more charge for the same voltage, but real parts also carry ESR and leakage.',
    charge:
      'Charge is the accumulated electrical quantity on the plates: Q = C·Vc. Conventional current entering the positive terminal increases Q at the rate Ic = dQ/dt.',
    energy:
      'The stored energy is E = ½·C·Vc². It is released into the circuit during discharge; the energy readout in this simulator comes from the solved capacitor voltage, not from a timer.',
    esr:
      'Equivalent series resistance makes the terminal voltage differ from the ideal capacitor voltage: Vterminal = Vc + Ic·ESR. It causes I²·ESR heating and limits ripple-current capability.',
    esl:
      'Equivalent series inductance adds V = ESL·dIc/dt. It only matters at high frequencies and small timesteps; the solver includes it implicitly, and falls back to backward Euler when ESL is present to stay stable.',
    leakage:
      'A real dielectric slowly leaks: Ileak = Vc / Rleak. It makes a charged capacitor self-discharge over long periods and adds a small continuous loss.',
    ripple:
      'Ripple current is the alternating current a capacitor carries in a power supply. It is set by the source, load and capacitance, not by the capacitor alone. Compare the measured RMS/peak current with the part rating.',
    timeConstant:
      'For an RC circuit τ = R·C. After one τ the capacitor reaches 63.2% of the way to its final voltage; after five τ it is within about 1%.',
    dielectricAbsorption:
      'Dielectric absorption is the slow release of charge trapped in the dielectric. After a fast discharge the terminals recover part of their voltage; it is modelled with extra RC branches and is off by default.',
    polarization:
      'A polarized capacitor has a positive and a negative terminal. Vc is defined as V(+) − V(−); a negative Vc means reverse bias, which is unsafe for most electrolytic and tantalum parts.',
    charging:
      'The capacitor is accumulating electrical charge. Its voltage rises as conventional current flows into its positive terminal.',
    discharging:
      'The capacitor is releasing stored electrical energy into the connected circuit. Conventional current leaves the positive terminal and the voltage decays.',
    reversePolarity:
      'The capacitor is connected with reversed polarity. This is an unsafe condition for most polarized electrolytic and tantalum capacitors.',
    overvoltage:
      "The applied voltage exceeds the capacitor's rated voltage. The model reports the actual voltage and does not clamp it, so you can see the overload.",
    highRipple:
      'The capacitor is experiencing excessive ripple current, which may increase internal heating and shorten its operating life.',
    thermal:
      'Cth·dT/dt = P_loss − (T − Tambient)/Rth. ESR and leakage losses raise the body temperature above ambient; the thermal state is derived from the simulated loss, not a preset animation.',
  },
  fa: {
    capacitance:
      'ظرفیت خازن C برابر بار ذخیره‌شده به ازای هر ولت است: Q = C·V. خازن الکترولیتی بزرگ‌تر برای همان ولتاژ بار بیشتری ذخیره می‌کند، اما در عمل ESR و نشتی هم دارد.',
    charge:
      'بار، کمیت الکتریکی انباشته‌شده روی صفحات است: Q = C·Vc. جریان قراردادی که به پایه مثبت وارد می‌شود، بار را با نرخ Ic = dQ/dt افزایش می‌دهد.',
    energy:
      'انرژی ذخیره‌شده برابر E = ½·C·Vc² است و هنگام دشارژ به مدار بازمی‌گردد. مقدار نمایش‌داده‌شده از ولتاژ حل‌شدهٔ خازن می‌آید، نه از یک زمان‌سنج.',
    esr:
      'مقاومت سری معادل باعث می‌شود ولتاژ پایانه با ولتاژ ایده‌آل خازن متفاوت باشد: Vterminal = Vc + Ic·ESR. این مقاومت تلفات I²·ESR و گرمایش ایجاد می‌کند و توان جریان ریپل را محدود می‌سازد.',
    esl:
      'اندوکتانس سری معادل ولتاژ V = ESL·dIc/dt را اضافه می‌کند. اثر آن فقط در فرکانس بالا و گام زمانی کوچک مهم است؛ حل‌کننده آن را به‌صورت ضمنی مدل می‌کند و برای پایداری از اویلر پس‌رو استفاده می‌کند.',
    leakage:
      'دی‌الکتریک واقعی به‌آرامی نشتی دارد: Ileak = Vc / Rleak. این نشتی باعث دشارژ تدریجی خازن در مدت طولانی و تلفات پیوستهٔ کوچک می‌شود.',
    ripple:
      'جریان ریپل، جریان متناوبی است که خازن در منبع تغذیه حمل می‌کند و به منبع، بار و ظرفیت بستگی دارد. جریان مؤثر و اوج اندازه‌گیری‌شده را با مشخصهٔ قطعه مقایسه کنید.',
    timeConstant:
      'در مدار RC ثابت زمانی τ = R·C است. پس از یک τ خازن به ۶۳٫۲٪ ولتاژ نهایی می‌رسد و پس از پنج τ اختلاف آن حدود ۱٪ است.',
    dielectricAbsorption:
      'جذب دی‌الکتریک، آزادسازی کند بار به‌دام‌افتاده در دی‌الکتریک است. پس از دشارژ سریع، ولتاژ پایانه‌ها تا حدی بازمی‌گردد؛ این اثر با شاخه‌های RC اضافی مدل می‌شود و به‌طور پیش‌فرض خاموش است.',
    polarization:
      'خازن قطبی پایه مثبت و منفی دارد. ولتاژ خازن Vc = V(+) − V(−) تعریف می‌شود؛ Vc منفی یعنی بایاس معکوس که برای بیشتر خازن‌های الکترولیتی و تانتالیومی ناایمن است.',
    charging:
      'خازن در حال انباشتن بار الکتریکی است. با ورود جریان قراردادی به پایه مثبت، ولتاژ آن افزایش می‌یابد.',
    discharging:
      'خازن انرژی الکتریکی ذخیره‌شده را به مدار متصل بازمی‌گرداند. جریان قراردادی از پایه مثبت خارج می‌شود و ولتاژ کاهش می‌یابد.',
    reversePolarity:
      'خازن با قطبیت معکوس بسته شده است. این وضعیت برای بیشتر خازن‌های الکترولیتی قطبی و تانتالیومی ناایمن است.',
    overvoltage:
      'ولتاژ اعمال‌شده از ولتاژ نامی خازن بیشتر است. مدل ولتاژ واقعی را گزارش می‌کند و آن را محدود نمی‌کند تا اضافه‌ولتاژ دیده شود.',
    highRipple:
      'خازن جریان ریپل بیش از حد تحمل می‌کند که می‌تواند گرمایش داخلی را افزایش دهد و عمر آن را کوتاه کند.',
    thermal:
      'Cth·dT/dt = P_loss − (T − Tambient)/Rth. تلفات ESR و نشتی دمای بدنه را بالاتر از محیط می‌برد؛ وضعیت حرارتی از تلفات شبیه‌سازی‌شده محاسبه می‌شود.',
  },
};
