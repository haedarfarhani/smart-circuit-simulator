/**
 * Bipolar Junction Transistor (BJT) model.
 *
 * Ebers-Moll transport model with NPN/PNP mirroring, Early effect,
 * temperature-dependent IS/beta, junction limiting and a full 3-terminal
 * Jacobian for the circuit solver. This file contains no UI: the solver, the
 * transient engine, the inspector and the curve analyzer all read the same
 * model functions.
 */

import type { CircuitComponent } from '../models/circuit';

export type BjtModelType = 'simplified' | 'ebers-moll';
export type BjtType = 'npn' | 'pnp';
export type BjtRegion =
  | 'cutoff'
  | 'forward-active'
  | 'saturation'
  | 'reverse-active'
  | 'breakdown';
export type BjtThermalState = 'normal' | 'warm' | 'high' | 'critical';

export interface BjtParameters {
  modelType: BjtModelType;
  transistorType: BjtType;
  /** Nominal DC current gain (hFE) used by the simplified model */
  beta: number;
  /** Base-emitter turn-on voltage for the simplified model (V) */
  vbe: number;
  /** Approximate saturation voltage for the simplified model (V) */
  vceSat: number;
  /** Collector leakage current (A) */
  isLeak: number;
  /** Transport saturation current (A) */
  is: number;
  /** Ideal maximum forward current gain */
  bf: number;
  /** Ideal maximum reverse current gain */
  br: number;
  /** Forward emission coefficient */
  nf: number;
  /** Reverse emission coefficient */
  nr: number;
  /** Forward Early voltage (V); 0 disables the Early effect */
  vaf: number;
  /** Reverse Early voltage (V); 0 disables it */
  var_: number;
  /** Ambient temperature (°C) */
  tAmbient: number;
  /** Maximum junction temperature (°C) */
  tMax: number;
  /** Junction-to-ambient thermal resistance (°C/W) */
  rth: number;
  /** Thermal capacitance (J/°C) */
  cth: number;
  /** Maximum power dissipation (W) */
  pMax: number;
  /** Maximum collector-emitter voltage (V) */
  vceo: number;
  /** Maximum collector-base voltage (V) */
  vcbo: number;
  /** Maximum emitter-base voltage (V) */
  vebo: number;
  /** Maximum continuous collector current (A) */
  icMax: number;
  /** Temperature at which the model parameters are specified (°C) */
  nominalTemp: number;
  /** Beta temperature exponent: beta(T) = beta·(T/Tnom)^betaTempCoeff */
  betaTempCoeff: number;
  /** Human-readable source note for the preset */
  source?: string;
  preset?: string;
}

export interface BjtOperatingPoint {
  region: BjtRegion;
  /** Actual terminal voltages (not mirrored), V */
  vbe: number;
  vbc: number;
  vce: number;
  /** Terminal currents, positive into the terminal (NPN convention) */
  ic: number;
  ib: number;
  ie: number;
  /** Instantaneous IC/IB, 0 when IB is too small to divide safely */
  beta: number;
  /** IC/IB in saturation (also reported outside saturation) */
  betaForced: number;
  /** Total terminal dissipation (W) */
  power: number;
  /** VCE·IC contribution (W) */
  powerCE: number;
  tj: number;
  thermalState: BjtThermalState;
  breakdownWarning: boolean;
}

export interface BjtLinearization extends BjtOperatingPoint {
  /**
   * dI_terminal / dV_terminal, rows B,C,E and columns B,C,E.
   * Rows sum to zero (KCL), which keeps the MNA stamp translation-safe.
   */
  jacobian: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

type Preset = Partial<BjtParameters>;

const npn = (
  p: Omit<Preset, 'transistorType'>,
): Preset => ({ ...p, transistorType: 'npn' });
const pnp = (
  p: Omit<Preset, 'transistorType'>,
): Preset => ({ ...p, transistorType: 'pnp' });

/**
 * Educational presets. Model parameters follow common published SPICE
 * parameter sets (2N2222/2N2907/2N3904/2N3906); ratings are typical
 * datasheet values. They are not guaranteed production specifications.
 */
export const BJT_PRESETS: Record<string, Preset> = {
  '2N2222': npn({
    modelType: 'ebers-moll', is: 1e-14, bf: 200, br: 6, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 200, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.5, vceo: 40, vcbo: 75, vebo: 6, icMax: 0.8,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    source: 'typical 2N2222 SPICE / datasheet values', preset: '2N2222',
  }),
  '2N3904': npn({
    modelType: 'ebers-moll', is: 6.734e-15, bf: 416.4, br: 0.737, nf: 1,
    nr: 1, vaf: 74.03, var_: 0, beta: 200, vbe: 0.65, vceSat: 0.2,
    isLeak: 5e-11, pMax: 0.625, vceo: 40, vcbo: 60, vebo: 6, icMax: 0.2,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    source: 'typical 2N3904 SPICE / datasheet values', preset: '2N3904',
  }),
  'BC547': npn({
    modelType: 'ebers-moll', is: 1.8e-14, bf: 330, br: 3, nf: 1, nr: 1,
    vaf: 120, var_: 0, beta: 330, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.5, vceo: 45, vcbo: 50, vebo: 6, icMax: 0.1,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    source: 'typical BC547 datasheet values', preset: 'BC547',
  }),
  'BC548': npn({
    modelType: 'ebers-moll', is: 1.8e-14, bf: 400, br: 3, nf: 1, nr: 1,
    vaf: 120, var_: 0, beta: 400, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.5, vceo: 30, vcbo: 30, vebo: 6, icMax: 0.1,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    source: 'typical BC548 datasheet values', preset: 'BC548',
  }),
  'BC337': npn({
    modelType: 'ebers-moll', is: 2e-14, bf: 250, br: 3, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 250, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.625, vceo: 45, vcbo: 50, vebo: 5, icMax: 0.8,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    source: 'typical BC337 datasheet values', preset: 'BC337',
  }),
  'TIP31C': npn({
    modelType: 'ebers-moll', is: 1e-12, bf: 50, br: 1, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 50, vbe: 0.7, vceSat: 0.3, isLeak: 1e-7,
    pMax: 40, vceo: 100, vcbo: 100, vebo: 5, icMax: 3,
    tAmbient: 25, tMax: 150, rth: 3.1, cth: 5,
    source: 'typical TIP31C datasheet values (case-limited)', preset: 'TIP31C',
  }),
  '2N2907': pnp({
    modelType: 'ebers-moll', is: 1e-14, bf: 180, br: 4, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 180, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.4, vceo: 40, vcbo: 60, vebo: 5, icMax: 0.6,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    source: 'typical 2N2907 SPICE / datasheet values', preset: '2N2907',
  }),
  'BC557': pnp({
    modelType: 'ebers-moll', is: 1.8e-14, bf: 290, br: 3, nf: 1, nr: 1,
    vaf: 120, var_: 0, beta: 290, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.5, vceo: 45, vcbo: 50, vebo: 5, icMax: 0.1,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    source: 'typical BC557 datasheet values', preset: 'BC557',
  }),
  'BC558': pnp({
    modelType: 'ebers-moll', is: 1.8e-14, bf: 400, br: 3, nf: 1, nr: 1,
    vaf: 120, var_: 0, beta: 400, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.5, vceo: 30, vcbo: 30, vebo: 5, icMax: 0.1,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    source: 'typical BC558 datasheet values', preset: 'BC558',
  }),
  'BC327': pnp({
    modelType: 'ebers-moll', is: 2e-14, bf: 250, br: 3, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 250, vbe: 0.65, vceSat: 0.2, isLeak: 1e-9,
    pMax: 0.625, vceo: 45, vcbo: 50, vebo: 5, icMax: 0.8,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    source: 'typical BC327 datasheet values', preset: 'BC327',
  }),
  '2N3906': pnp({
    modelType: 'ebers-moll', is: 6.734e-15, bf: 200, br: 1, nf: 1, nr: 1,
    vaf: 60, var_: 0, beta: 200, vbe: 0.65, vceSat: 0.2, isLeak: 5e-11,
    pMax: 0.625, vceo: 40, vcbo: 40, vebo: 5, icMax: 0.2,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    source: 'typical 2N3906 SPICE / datasheet values', preset: '2N3906',
  }),
  'TIP32C': pnp({
    modelType: 'ebers-moll', is: 1e-12, bf: 50, br: 1, nf: 1, nr: 1,
    vaf: 100, var_: 0, beta: 50, vbe: 0.7, vceSat: 0.3, isLeak: 1e-7,
    pMax: 40, vceo: 100, vcbo: 100, vebo: 5, icMax: 3,
    tAmbient: 25, tMax: 150, rth: 3.1, cth: 5,
    source: 'typical TIP32C datasheet values (case-limited)', preset: 'TIP32C',
  }),
};

export const DEFAULT_BJT_PARAMS: BjtParameters = {
  modelType: 'ebers-moll',
  transistorType: 'npn',
  beta: 200,
  vbe: 0.65,
  vceSat: 0.2,
  isLeak: 1e-9,
  is: 1e-14,
  bf: 200,
  br: 2,
  nf: 1,
  nr: 1,
  vaf: 100,
  var_: 0,
  tAmbient: 25,
  tMax: 150,
  rth: 200,
  cth: 0.5,
  pMax: 0.5,
  vceo: 40,
  vcbo: 60,
  vebo: 6,
  icMax: 0.5,
  nominalTemp: 25,
  betaTempCoeff: 1.5,
  source: 'generic educational NPN',
};

export function applyBjtPreset(presetKey: string): Partial<CircuitComponent> {
  const p = BJT_PRESETS[presetKey];
  if (!p) return { preset: 'custom' };
  return {
    preset: presetKey,
    modelType: p.modelType,
    transistorType: p.transistorType,
    beta: p.beta,
    vbe: p.vbe,
    vceSat: p.vceSat,
    isLeak: p.isLeak,
    is: p.is,
    bf: p.bf,
    br: p.br,
    nf: p.nf,
    nr: p.nr,
    vaf: p.vaf,
    var_: p.var_,
    tAmbient: p.tAmbient,
    tMax: p.tMax,
    rth: p.rth,
    cth: p.cth,
    pMax: p.pMax,
    vceo: p.vceo,
    vcbo: p.vcbo,
    vebo: p.vebo,
    icMax: p.icMax,
    nominalTemp: p.nominalTemp ?? 25,
    betaTempCoeff: p.betaTempCoeff ?? 1.5,
  };
}

/* ------------------------------------------------------------------ */
/* Parameter validation                                                */
/* ------------------------------------------------------------------ */

const positive = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

export function getBjtParameters(comp: Partial<CircuitComponent>): BjtParameters {
  const p = comp as Partial<CircuitComponent> & Partial<BjtParameters>;
  const preset =
    p.preset && BJT_PRESETS[p.preset] ? BJT_PRESETS[p.preset] : {};
  const d = DEFAULT_BJT_PARAMS;
  const pick = <K extends keyof BjtParameters>(key: K): BjtParameters[K] => {
    const own = p[key];
    if (own !== undefined && typeof own === typeof d[key] && own !== null) {
      return own as BjtParameters[K];
    }
    const fromPreset = preset[key];
    return (fromPreset !== undefined ? fromPreset : d[key]) as BjtParameters[K];
  };

  const type = pick('transistorType') === 'pnp' ? 'pnp' : 'npn';
  const model = pick('modelType') === 'simplified' ? 'simplified' : 'ebers-moll';
  const tMax = Math.max(30, positive(pick('tMax'), 150));
  const tAmbient = Math.min(
    tMax - 1,
    typeof p.tAmbient === 'number' && Number.isFinite(p.tAmbient)
      ? p.tAmbient
      : (preset.tAmbient ?? 25),
  );
  return {
    modelType: model,
    transistorType: type,
    beta: Math.max(1, positive(pick('beta'), 200)),
    vbe: Math.max(0.1, positive(pick('vbe'), 0.65)),
    vceSat: Math.max(0.01, positive(pick('vceSat'), 0.2)),
    isLeak: Math.max(0, Number.isFinite(pick('isLeak')) ? pick('isLeak') : 1e-9),
    is: Math.max(1e-20, positive(pick('is'), 1e-14)),
    bf: Math.max(1, positive(pick('bf'), 200)),
    br: Math.max(1, positive(pick('br'), 2)),
    nf: Math.max(0.1, positive(pick('nf'), 1)),
    nr: Math.max(0.1, positive(pick('nr'), 1)),
    vaf: Math.max(0, Number.isFinite(pick('vaf')) ? pick('vaf') : 100),
    var_: Math.max(0, Number.isFinite(pick('var_')) ? pick('var_') : 0),
    tAmbient,
    tMax,
    rth: Math.max(1e-3, positive(pick('rth'), 200)),
    cth: Math.max(1e-3, positive(pick('cth'), 0.5)),
    pMax: Math.max(1e-3, positive(pick('pMax'), 0.5)),
    vceo: Math.max(1, positive(pick('vceo'), 40)),
    vcbo: Math.max(1, positive(pick('vcbo'), 60)),
    vebo: Math.max(0.5, positive(pick('vebo'), 6)),
    icMax: Math.max(1e-3, positive(pick('icMax'), 0.5)),
    nominalTemp:
      typeof pick('nominalTemp') === 'number' && Number.isFinite(pick('nominalTemp'))
        ? pick('nominalTemp')
        : 25,
    betaTempCoeff:
      typeof pick('betaTempCoeff') === 'number' &&
      Number.isFinite(pick('betaTempCoeff'))
        ? pick('betaTempCoeff')
        : 1.5,
    source: pick('source'),
    preset: p.preset,
  };
}

export function getVt(tj: number): number {
  const tK = Math.max(1, tj + 273.15);
  return (1.380649e-23 * tK) / 1.602176634e-19;
}

/** Prevent exponential overflow while keeping the derivative finite. */
function expLimited(arg: number, max = 40): number {
  return Math.exp(Math.max(-max, Math.min(max, arg)));
}

/** IS(T) scaling — the dominant reason VBE falls with temperature. */
function isAtTemperature(params: BjtParameters, tj: number): number {
  const t = Math.max(1, tj + 273.15);
  const tnom = Math.max(1, params.nominalTemp + 273.15);
  const vt = getVt(tj);
  const eg = 1.11;
  return (
    params.is *
    Math.pow(t / tnom, 3) *
    Math.exp((eg / vt) * (t / tnom - 1))
  );
}

function betaAtTemperature(base: number, params: BjtParameters, tj: number): number {
  const t = Math.max(1, tj + 273.15);
  const tnom = Math.max(1, params.nominalTemp + 273.15);
  return Math.max(1, base * Math.pow(t / tnom, params.betaTempCoeff));
}

/* ------------------------------------------------------------------ */
/* Core transport equations                                            */
/* ------------------------------------------------------------------ */

interface DeviceCurrents {
  ib: number;
  ic: number;
  ie: number;
}

/**
 * Unsigned internal (NPN-style) currents for a device. Terminal currents are
 * multiplied by `sign` (+1 NPN, −1 PNP) so that IB+IC+IE=0 always holds.
 */
function transportCurrents(
  vbeEff: number,
  vbcEff: number,
  params: BjtParameters,
  tj: number,
): DeviceCurrents {
  const vt = getVt(tj);
  const is = isAtTemperature(params, tj);
  const nf = Math.max(0.1, params.nf);
  const nr = Math.max(0.1, params.nr);
  const bf = Math.max(1, betaAtTemperature(params.bf, params, tj));
  const br = Math.max(1, betaAtTemperature(params.br, params, tj));
  const alphaF = bf / (bf + 1);
  const alphaR = br / (br + 1);

  const ifwd = is * (expLimited(vbeEff / (nf * vt)) - 1);
  const irev = is * (expLimited(vbcEff / (nr * vt)) - 1);

  let ic = alphaF * ifwd - irev;
  const ib = (1 - alphaF) * ifwd + (1 - alphaR) * irev;

  // Forward Early effect: IC rises with VCE in the active region. It is
  // disabled when VAF is zero (the educational default for the simplified
  // model), and only applied for forward collector voltage.
  const vce = vbeEff - vbcEff;
  if (params.vaf > 0.1 && vce > 0) {
    ic *= 1 + vce / params.vaf;
  }
  // Reverse Early effect is intentionally not applied as a second multiplier:
  // it would double-count the base-width modulation already in the forward
  // term. The parameter is kept for model round-tripping.

  // Collector leakage is a real current, not a fake offset: it flows C→E when
  // the collector is positive. Keep KCL exact after adding it.
  const leakage = params.isLeak * Math.max(0, Math.tanh(vce / 0.05));
  const icLeak = ic + leakage;
  const ibLeak = ib + leakage / Math.max(1, bf);
  return { ib: ibLeak, ic: icLeak, ie: -(icLeak + ibLeak) };
}

/** Simplified educational model with smooth cutoff/saturation transitions. */
function simplifiedCurrents(
  vbeEff: number,
  vbcEff: number,
  params: BjtParameters,
  tj: number,
): DeviceCurrents {
  const vt = getVt(tj);
  const vce = vbeEff - vbcEff;
  const beta = Math.max(1, betaAtTemperature(params.beta, params, tj));
  const knee = params.vbe;
  const active = 0.5 * (1 + Math.tanh((vbeEff - knee) / 0.06));
  const sat = 0.5 * (1 + Math.tanh((vce - params.vceSat) / 0.04));
  const baseDrive = params.isLeak + params.beta * params.isLeak;
  const icActive =
    baseDrive * 8 + beta * params.isLeak * expLimited((vbeEff - knee) / (2 * vt), 18);
  const ic = active * (icActive * sat) + params.isLeak;
  const ib = active * (ic / beta) + params.isLeak / beta;
  return { ib, ic, ie: -(ic + ib) };
}

const actualVoltages = (
  type: BjtType,
  vb: number,
  vc: number,
  ve: number,
): { vbe: number; vbc: number; vce: number; vbeEff: number; vbcEff: number } => {
  const vbe = vb - ve;
  const vbc = vb - vc;
  const sign = type === 'npn' ? 1 : -1;
  return { vbe, vbc, vce: vc - ve, vbeEff: sign * vbe, vbcEff: sign * vbc };
};

function currentsAt(
  params: BjtParameters,
  vb: number,
  vc: number,
  ve: number,
  tj: number,
): DeviceCurrents {
  const v = actualVoltages(params.transistorType, vb, vc, ve);
  const internal =
    params.modelType === 'simplified'
      ? simplifiedCurrents(v.vbeEff, v.vbcEff, params, tj)
      : transportCurrents(v.vbeEff, v.vbcEff, params, tj);
  const sign = params.transistorType === 'npn' ? 1 : -1;
  return {
    ib: sign * internal.ib,
    ic: sign * internal.ic,
    ie: sign * internal.ie,
  };
}

/** Raw NPN-convention currents (kept for API compatibility and tests). */
export function calculateEbersMoll(
  vbe: number,
  vbc: number,
  vce: number,
  params: BjtParameters,
  tj = 25,
): { ic: number; ib: number; ie: number; gbe: number; gbc: number; gce: number } {
  void vce;
  const internal = transportCurrents(vbe, vbc, params, tj);
  const sign = params.transistorType === 'npn' ? 1 : -1;
  return {
    ic: sign * internal.ic,
    ib: sign * internal.ib,
    ie: sign * internal.ie,
    // Compatibility fields for older callers; the solver now uses the full
    // Jacobian from bjtLinearization().
    gbe: Math.abs(internal.ib) > 1e-12 ? Math.abs(internal.ic / internal.ib) * 1e-3 : 1e-6,
    gbc: 1e-9,
    gce: 1e-9,
  };
}

/* ------------------------------------------------------------------ */
/* Operating point                                                     */
/* ------------------------------------------------------------------ */

export function detectOperatingRegion(
  vbe: number,
  vbc: number,
  vce: number,
  params: BjtParameters,
): BjtRegion {
  const sign = params.transistorType === 'npn' ? 1 : -1;
  const vbeEff = sign * vbe;
  const vbcEff = sign * vbc;
  const vt = getVt(params.tAmbient);
  const nf = Math.max(0.1, params.nf);
  const nr = Math.max(0.1, params.nr);

  // Ratings are warnings, not a fabricated avalanche model.
  if (
    Math.abs(vce) > params.vceo * 0.98 ||
    Math.abs(vbc) > params.vcbo * 0.98 ||
    Math.abs(vbe) > params.vebo * 0.98
  ) {
    return 'breakdown';
  }

  // Region boundaries come from the junction currents, not a hardcoded
  // voltage: a junction counts as forward biased once its Ebers-Moll current
  // rises above the 1 nA conduction threshold. That makes the transition
  // follow IS, NF and temperature automatically.
  const isT = isAtTemperature(params, params.tAmbient);
  const junctionCurrent = (v: number, n: number): number =>
    isT * (expLimited(v / (n * vt)) - 1);
  const forwardBE = junctionCurrent(vbeEff, nf) > 1e-9;
  const forwardBC = junctionCurrent(vbcEff, nr) > 1e-9;

  if (forwardBE && forwardBC) return 'saturation';
  if (forwardBE) return 'forward-active';
  if (forwardBC) return 'reverse-active';
  return 'cutoff';
}

export function estimateThermalState(
  _power: number,
  tj: number,
  params: BjtParameters,
): BjtThermalState {
  const ratio = params.tMax > 0 ? tj / params.tMax : 0;
  if (ratio > 0.96 || tj > params.tMax - 5) return 'critical';
  if (ratio > 0.85) return 'high';
  if (ratio > 0.7 || tj > params.tAmbient + 25) return 'warm';
  return 'normal';
}

/** Full operating point and numerical Jacobian for the solver. */
export function bjtLinearization(
  params: BjtParameters,
  vb: number,
  vc: number,
  ve: number,
  tj: number,
): BjtLinearization {
  const currents = currentsAt(params, vb, vc, ve, tj);
  const h = 1e-5;
  const j: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let col = 0; col < 3; col++) {
    const dv = [0, 0, 0];
    dv[col] = h;
    const plus = currentsAt(params, vb + dv[0], vc + dv[1], ve + dv[2], tj);
    const minus = currentsAt(params, vb - dv[0], vc - dv[1], ve - dv[2], tj);
    const p = [plus.ib, plus.ic, plus.ie];
    const m = [minus.ib, minus.ic, minus.ie];
    for (let row = 0; row < 3; row++) {
      j[row][col] = (p[row] - m[row]) / (2 * h);
    }
  }
  // Enforce KCL in the Jacobian: the third row is the negative sum of the
  // first two, and every row is translation-invariant (columns sum to zero).
  for (let col = 0; col < 3; col++) {
    j[2][col] = -(j[0][col] + j[1][col]);
  }
  for (let row = 0; row < 3; row++) {
    const sum = j[row][0] + j[row][1] + j[row][2];
    j[row][0] -= sum / 3;
    j[row][1] -= sum / 3;
    j[row][2] -= sum / 3;
  }

  const v = actualVoltages(params.transistorType, vb, vc, ve);
  const sign = params.transistorType === 'npn' ? 1 : -1;
  const vbeEff = sign * v.vbe;
  const vbcEff = sign * v.vbc;
  const vceEff = sign * v.vce;
  const beta = Math.abs(currents.ib) > 1e-15 ? currents.ic / currents.ib : 0;
  const betaForced = Math.abs(currents.ib) > 1e-15 ? currents.ic / currents.ib : 0;
  // Passive-sign dissipation: P = VBE·IB + VCE·IC. This is positive for both
  // NPN and PNP conduction and avoids double-counting the base term.
  const power = v.vbe * currents.ib + v.vce * currents.ic;
  void vbeEff;
  void vbcEff;
  void vceEff;
  const region = detectOperatingRegion(v.vbe, v.vbc, v.vce, params);
  return {
    region,
    vbe: v.vbe,
    vbc: v.vbc,
    vce: v.vce,
    ic: currents.ic,
    ib: currents.ib,
    ie: currents.ie,
    beta: Math.max(-1e6, Math.min(1e6, beta)),
    betaForced: Math.max(-1e6, Math.min(1e6, betaForced)),
    power,
    powerCE: v.vce * currents.ic,
    tj,
    thermalState: estimateThermalState(power, tj, params),
    breakdownWarning:
      Math.abs(v.vce) > params.vceo ||
      Math.abs(v.vbc) > params.vcbo ||
      Math.abs(v.vbe) > params.vebo,
    jacobian: j as BjtLinearization['jacobian'],
  };
}

/**
 * Limit the change of a junction voltage between Newton iterations. This is
 * the numerical equivalent of SPICE's pnjlim: it prevents the exponential
 * from overshooting when the initial guess is far from the solution.
 */
export function limitJunctionStep(
  previous: number,
  next: number,
  maxStep = 0.2,
): number {
  if (!Number.isFinite(next)) return previous;
  const delta = Math.max(-maxStep, Math.min(maxStep, next - previous));
  return previous + delta;
}

/** Exact exponential update of the first-order thermal network. */
export function stepBjtThermal(
  previousTj: number,
  power: number,
  params: BjtParameters,
  dt: number,
): number {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 1e-4;
  const p = Math.max(0, Number.isFinite(power) ? power : 0);
  const tau = Math.max(1e-9, params.rth * params.cth);
  const steady = params.tAmbient + p * params.rth;
  const prev = Number.isFinite(previousTj) ? previousTj : params.tAmbient;
  const next = steady + (prev - steady) * Math.exp(-h / tau);
  return Math.max(params.tAmbient, Math.min(params.tMax + 50, next));
}

/* ------------------------------------------------------------------ */
/* Snapshot payload                                                    */
/* ------------------------------------------------------------------ */

export interface BjtSolution {
  region: BjtRegion;
  vbe: number;
  vbc: number;
  vce: number;
  ib: number;
  ic: number;
  ie: number;
  beta: number;
  betaForced: number;
  power: number;
  powerCE: number;
  powerRatio: number;
  tj: number;
  thermalState: BjtThermalState;
  breakdownWarning: boolean;
  overload: boolean;
  vceSat: number;
}

export function buildBjtSolution(
  params: BjtParameters,
  lin: BjtLinearization,
  tj: number,
): BjtSolution {
  const powerRatio = params.pMax > 0 ? Math.abs(lin.power) / params.pMax : 0;
  return {
    region: lin.region,
    vbe: lin.vbe,
    vbc: lin.vbc,
    vce: lin.vce,
    ib: lin.ib,
    ic: lin.ic,
    ie: lin.ie,
    beta: lin.beta,
    betaForced: lin.betaForced,
    power: lin.power,
    powerCE: lin.powerCE,
    powerRatio,
    tj,
    thermalState: estimateThermalState(lin.power, tj, params),
    breakdownWarning: lin.breakdownWarning,
    overload:
      powerRatio > 1 ||
      Math.abs(lin.ic) > params.icMax ||
      Math.abs(lin.vce) > params.vceo ||
      Math.abs(lin.vbe) > params.vebo,
    vceSat: params.vceSat,
  };
}
