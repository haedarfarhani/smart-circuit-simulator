/**
 * Bipolar Junction Transistor (BJT) Mathematical Model
 *
 * Supports Ebers-Moll and Simplified Educational models.
 * Provides operating-region detection, temperature effects,
 * and numerical stability protections.
 */

import type { CircuitComponent } from '../models/circuit';

export type BjtModelType = 'simplified' | 'ebers-moll';
export type BjtType = 'npn' | 'pnp';

export interface BjtParameters {
  modelType: BjtModelType;
  transistorType: BjtType;
  // Simplified / Educational
  beta: number;          // DC current gain (hFE)
  vbe: number;           // Base-emitter forward voltage (V)
  vceSat: number;        // Saturation voltage (V)
  isLeak: number;        // Leakage current (A)
  // Ebers-Moll
  is: number;            // Transport saturation current (A)
  bf: number;            // Ideal maximum forward gain
  br: number;            // Ideal maximum reverse gain
  nf: number;            // Forward emission coefficient
  nr: number;            // Reverse emission coefficient
  vaf: number;           // Forward Early voltage (V, 0 = disable)
  var_: number;          // Reverse Early voltage (V, 0 = disable)
  // Thermal / Ratings
  tAmbient: number;      // Ambient temperature (°C)
  tMax: number;          // Max junction temperature (°C)
  rth: number;           // Thermal resistance (°C/W)
  cth: number;           // Thermal capacitance (J/°C)
  pMax: number;          // Max power dissipation (W)
  // Preset identification
  preset?: string;
}

export interface BjtOperatingPoint {
  region: 'cutoff' | 'forward-active' | 'saturation' | 'reverse-active' | 'breakdown';
  vbe: number;           // VBE = VB - VE (NPN convention)
  vbc: number;           // VBC = VB - VC
  vce: number;           // VCE = VC - VE
  ic: number;            // Collector current (positive into C for NPN)
  ib: number;            // Base current (positive into B for NPN)
  ie: number;            // Emitter current (positive into E for NPN)
  beta: number;          // Instantaneous current gain (IC/IB)
  betaForced: number;    // Forced beta in saturation
  power: number;         // Instantaneous dissipated power
  tj: number;            // Junction temperature (°C)
  thermalState: 'normal' | 'warm' | 'high' | 'critical';
  breakdownWarning: boolean;
}

/* ================================================================
   Default presets (validated against manufacturer datasheet ranges)
   ================================================================ */

export const BJT_PRESETS: Record<string, Partial<BjtParameters>> = {
  '2N2222': {
    modelType: 'ebers-moll', transistorType: 'npn',
    is: 1e-14, bf: 200, br: 2, nf: 1.0, nr: 1.0,
    vaf: 100, var_: 0,
    beta: 200, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.5,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    preset: '2N2222',
  },
  '2N3904': {
    modelType: 'ebers-moll', transistorType: 'npn',
    is: 6.734e-15, bf: 416.4, br: 0.737, nf: 1.0, nr: 1.0,
    vaf: 74.03, var_: 0,
    beta: 200, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.625,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    preset: '2N3904',
  },
  'BC547': {
    modelType: 'ebers-moll', transistorType: 'npn',
    is: 1.8e-14, bf: 330, br: 3, nf: 1.0, nr: 1.0,
    vaf: 120, var_: 0,
    beta: 330, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.5,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    preset: 'BC547',
  },
  '2N2907': {
    modelType: 'ebers-moll', transistorType: 'pnp',
    is: 1e-14, bf: 180, br: 2, nf: 1.0, nr: 1.0,
    vaf: 100, var_: 0,
    beta: 180, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.5,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    preset: '2N2907',
  },
  '2N3906': {
    modelType: 'ebers-moll', transistorType: 'pnp',
    is: 6.734e-15, bf: 200, br: 1, nf: 1.0, nr: 1.0,
    vaf: 60, var_: 0,
    beta: 200, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.625,
    tAmbient: 25, tMax: 150, rth: 200, cth: 0.5,
    preset: '2N3906',
  },
  'BC557': {
    modelType: 'ebers-moll', transistorType: 'pnp',
    is: 1.8e-14, bf: 290, br: 3, nf: 1.0, nr: 1.0,
    vaf: 120, var_: 0,
    beta: 290, vbe: 0.65, vceSat: 0.2,
    isLeak: 1e-9, pMax: 0.5,
    tAmbient: 25, tMax: 150, rth: 250, cth: 0.5,
    preset: 'BC557',
  },
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
  nf: 1.0,
  nr: 1.0,
  vaf: 100,
  var_: 0,
  tAmbient: 25,
  tMax: 150,
  rth: 200,
  cth: 0.5,
  pMax: 0.5,
};

/* ================================================================
   Utilities
   ================================================================ */

export function getVt(tj: number): number {
  const tK = tj + 273.15;
  return (1.380649e-23 * tK) / 1.602176634e-19;
}

export function getBjtParameters(comp: CircuitComponent): BjtParameters {
  const p = comp as CircuitComponent & Partial<BjtParameters>;
  const preset = p.preset && BJT_PRESETS[p.preset] ? BJT_PRESETS[p.preset] : {};
  return {
    modelType: (p.modelType as BjtModelType) || preset.modelType || 'ebers-moll',
    transistorType: (p.transistorType as BjtType) || preset.transistorType || 'npn',
    beta: p.beta ?? preset.beta ?? 200,
    vbe: p.vbe ?? preset.vbe ?? 0.65,
    vceSat: p.vceSat ?? preset.vceSat ?? 0.2,
    isLeak: p.isLeak ?? preset.isLeak ?? 1e-9,
    is: p.is ?? preset.is ?? 1e-14,
    bf: p.bf ?? preset.bf ?? 200,
    br: p.br ?? preset.br ?? 2,
    nf: p.nf ?? preset.nf ?? 1.0,
    nr: p.nr ?? preset.nr ?? 1.0,
    vaf: p.vaf ?? preset.vaf ?? 100,
    var_: p.var_ ?? preset.var_ ?? 0,
    tAmbient: p.tAmbient ?? preset.tAmbient ?? 25,
    tMax: p.tMax ?? preset.tMax ?? 150,
    rth: p.rth ?? preset.rth ?? 200,
    cth: p.cth ?? preset.cth ?? 0.5,
    pMax: p.pMax ?? preset.pMax ?? 0.5,
    preset: p.preset ?? preset.preset,
  };
}

/* ================================================================
   Ebers-Moll terminal currents (NPN convention: positive into terminal)
   For PNP, flip all voltages and currents accordingly.
   ================================================================ */

function limitExp(arg: number): number {
  if (arg > 700) return Math.exp(700);   // prevent overflow
  if (arg < -700) return Math.exp(-700);
  return Math.exp(arg);
}

export function calculateEbersMoll(
  vbe: number, vbc: number, vce: number, params: BjtParameters, tj: number
): { ic: number; ib: number; ie: number; gbe: number; gbc: number; gce: number } {
  const vt = getVt(tj);
  const is = params.is;
  const bf = Math.max(0.1, params.bf);
  const br = Math.max(0.1, params.br);
  const nf = Math.max(0.1, params.nf);
  const nr = Math.max(0.1, params.nr);
  const alphaF = bf / (bf + 1);
  const alphaR = br / (br + 1);

  // For numerical stability, clamp junction voltages
  const vBE = Math.max(-3.0, Math.min(3.0, vbe));
  const vBC = Math.max(-3.0, Math.min(3.0, vbc));

  const expBE = limitExp(vBE / (nf * vt));
  const expBC = limitExp(vBC / (nr * vt));

  const IF = is * (expBE - 1);
  const IR = is * (expBC - 1);

  // Transport model
  let ic = alphaF * IF - IR;
  let ib = (1 - alphaF) * IF + (1 - alphaR) * IR;
  let ie = -(ic + ib);

  // Early effect approximation (optional, simplified)
  if (params.vaf > 10 && vce > 0) {
    const va = params.vaf;
    const factor = 1 + vce / va;
    ic *= factor;
    // Adjust base current slightly for early effect on alpha
    // (simplified: only scale collector)
  }

  // Leakage approximation for very low forward bias
  if (vBE < 0.2 && vBE > -0.2 && Math.abs(ic) < 1e-12) {
    ic = params.isLeak;
    ib = params.isLeak / Math.max(params.beta, 1);
    ie = -(ic + ib);
  }

  // Numerical derivatives (conductances)
  // Partial derivatives of IF and IR wrt vBE and vBC
  const dIF_dvBE = is / (nf * vt) * expBE;
  const dIR_dvBC = is / (nr * vt) * expBC;

  const dIC_dvBE = alphaF * dIF_dvBE;
  const dIC_dvBC = -dIR_dvBC;

  const dIB_dvBE = (1 - alphaF) * dIF_dvBE;
  const dIB_dvBC = (1 - alphaR) * dIR_dvBC;

  // Map to terminal voltages: B=base, C=collector, E=emitter
  // vBE = vb - ve => dvBE/dvb = 1, dvBE/dve = -1
  // vBC = vb - vc => dvBC/dvb = 1, dvBC/dvc = -1
  // Conductance matrix element: G_ij = dI_i / dV_j (negative for off-diagonal stamps)
  // We return partials wrt vBE and vBC, then solver stamps accordingly.

  // For solver stamping we need conductances between terminals.
  // Simplified: provide diagonal and cross partials.
  // I_B = f(vB,vC,vE); I_C = g(vB,vC,vE); I_E = -(I_B+I_C)
  const dIB_dVB = dIB_dvBE + dIB_dvBC;
  const dIB_dVC = -dIB_dvBC;

  const dIC_dVB = dIC_dvBE + dIC_dvBC;
  const dIC_dVC = -dIC_dvBC; // kept for derivation consistency

  // We return a simplified conductance matrix representation:
  // gbe = dIB/dVB (approx), gbc = dIC/dVC (approx), gce = dIC/dVB
  // The solver will use these to build the Jacobian stamps.
  const gbe = Math.abs(dIB_dVB) + Math.abs(dIB_dVC) * 0.01 + 1e-12;
  const gbc = Math.abs(dIC_dVC) + 1e-12;
  const gce = Math.abs(dIC_dVB) + 1e-12;

  return { ic, ib, ie, gbe, gbc, gce };
}

/* ================================================================
   Operating region detection
   ================================================================ */

export function detectOperatingRegion(
  vbe: number, vbc: number, vce: number, params: BjtParameters
): BjtOperatingPoint['region'] {
  // For PNP, flip voltage definitions: VBE = VB-VE (always), but for PNP
  // active region means VEB > 0 => VBE < 0, and VCB > 0 => VBC > 0 (since VB-VC > 0)
  // We'll use the convention that for PNP, we evaluate using inverted voltages.
  // For simplicity in this model, detect based on absolute conditions with type awareness.

  const isNpn = params.transistorType === 'npn';
  const vBE_eff = isNpn ? vbe : -vbe;
  const vBC_eff = isNpn ? vbc : -vbc;
  const vCE_eff = isNpn ? vce : -vce;

  // Breakdown approximation: if VCE exceeds ~80% of breakdown rating
  // or VBE exceeds ~5V (approx emitter-base breakdown ~6-7V)
  if (vCE_eff > 40 || vBE_eff > 5.0 || vBE_eff < -5.0) {
    return 'breakdown';
  }

  if (vBE_eff < 0.3) {
    return 'cutoff';
    // Also handle reverse active if VBC forward biased and VBE reverse biased
  }
  if (vBE_eff > 0.3 && vBC_eff < 0) {
    return 'forward-active';
  }
  if (vBE_eff > 0.3 && vBC_eff > 0) {
    return 'saturation';
  }
  if (vBE_eff < 0.3 && vBC_eff > 0 && Math.abs(vce) > 0.5) {
    return 'reverse-active';
  }
  return 'cutoff';
}

/* ================================================================
   Simplified model (educational smooth transition)
   ================================================================ */

export function calculateSimplified(
  vbe: number, vbc: number, params: BjtParameters, tj: number
): { ic: number; ib: number; ie: number; region: BjtOperatingPoint['region'] } {
  const vt = getVt(tj);
  // Use smooth logistic transition for cutoff-to-active
  const vBE = vbe;
  const vCE = vbc + vbe; // vce = vb-ve = vbc + vce? Wait: vbc = vb-vc, vce = vc-ve => vbe = vb-ve = vbc+vce
  // Actually vbe = vbc + vce is wrong: vbc = vb - vc, vce = vc - ve => vbe = vb - ve = vbc + vce. Yes correct.

  const isNpn = params.transistorType === 'npn';
  const vBE_eff = isNpn ? vBE : -vBE;
  const vCE_eff = isNpn ? vCE : -vCE;

  const beta = Math.max(1, params.beta);
  const vbeTh = params.vbe;

  // Smooth transition from cutoff to active using tanh-like soft threshold
  const activeFactor = 0.5 * (1 + Math.tanh((vBE_eff - vbeTh) / 0.05));

  // Active region current
  const icActive = beta * params.isLeak * Math.exp(Math.max(0, (vBE_eff - vbeTh) / vt));

  // Saturation reduction when vCE_eff < vceSat
  const satFactor = 0.5 * (1 + Math.tanh((vCE_eff - params.vceSat) / 0.02));

  let ic = icActive * satFactor + params.isLeak;
  let ib = ic / beta * activeFactor + params.isLeak / beta;

  // PNP mirror
  if (!isNpn) {
    ic = -ic;
    ib = -ib;
  }

  const ie = -(ic + ib);
  const region = detectOperatingRegion(vBE, vbc, vCE, params);
  return { ic, ib, ie, region };
}

/* ================================================================
   Thermal state estimation
   ================================================================ */

export function estimateThermalState(
  _power: number, tj: number, params: BjtParameters
): BjtOperatingPoint['thermalState'] {
  const ratio = params.tMax > 0 ? tj / params.tMax : 0;
  if (ratio > 0.95 || tj > params.tMax - 5) return 'critical';
  if (ratio > 0.85 || tj > 125) return 'high';
  if (ratio > 0.6 || tj > 85) return 'warm';
  return 'normal';
}
