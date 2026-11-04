/**
 * Configurable logic families.
 *
 * Every digital component carries a logic family. The family supplies the
 * electrical contract the analog solver sees: input thresholds, output
 * drive, propagation delay, input loading and power behaviour.
 *
 * IMPORTANT — where these numbers come from:
 * Values below are datasheet-TYPICAL educational figures for the classic
 * families (TI CMOS/74xx data books), rounded for clarity. They are not
 * tied to one manufacturer part number and must not be read as guaranteed
 * device limits. Where a real datasheet specifies a range (e.g. VOL max
 * 0.5 V, typ 0.25 V) we use the typical value so a solved circuit shows
 * realistic voltages rather than worst-case corners. Anything not directly
 * specified by a datasheet (output resistance, in particular) is a
 * linearised approximation and is marked as such below.
 */

export type LogicFamilyId =
  | 'cmos'
  | 'cd4000'
  | '74hc'
  | '74hct'
  | '74ac'
  | 'ttl'
  | '74ls'
  | '74als';

export type LogicTechnology = 'cmos' | 'ttl';

export interface LogicFamilySpec {
  id: LogicFamilyId;
  /** display name */
  label: string;
  technology: LogicTechnology;
  /** nominal supply voltage (V) used when the user has not overridden it */
  vccNominal: number;
  vccMin: number;
  vccMax: number;

  /**
   * Input thresholds. CMOS families define them as ratios of the actual
   * supply (real CMOS thresholds track VDD); TTL families use absolute
   * volts (the 2.0 V / 0.8 V TTL convention), independent of supply.
   */
  vilRatio?: number;
  vihRatio?: number;
  vilAbs?: number;
  vihAbs?: number;

  /**
   * Output levels at the nominal supply, light load (V).
   * CMOS outputs track the supply, so VOH/VOL are also expressed relative
   * to VDD and re-scaled by resolveDigitalParams.
   */
  vohAbs?: number;
  volAbs?: number;
  vohDrop?: number;

  /**
   * Linearised output resistance (Ω) — an APPROXIMATION. Real totem-pole /
   * CMOS output stages are strongly nonlinear; a single small resistance
   * reproduces the observable behaviour (voltage sag under load) inside
   * the range educational circuits operate in. TTL uses separate values
   * for the pull-up (high) and pull-down (low) structures.
   */
  routHigh: number;
  routLow: number;

  /** Max continuous output currents (A). Positive = sink, negative = source. */
  iohMax: number;
  iolMax: number;

  /**
   * Input loading currents (A). IIL is the current the input pulls OUT of
   * a low driver (negative), IIH the current it absorbs from a high
   * driver. These give TTL its real fan-out behaviour; CMOS inputs are
   * essentially open at DC.
   */
  iil: number;
  iih: number;

  /** Input capacitance (F), used for the dynamic-power estimate. */
  cin: number;

  /** Propagation delay (s) — input transition to output transition. */
  tpd: number;
  /** Output rise/fall times (s) under light load. */
  tr: number;
  tf: number;

  /**
   * Static supply power per gate (W). TTL inputs/outputs burn real static
   * current; CMOS static power is leakage-level and its dominant term is
   * dynamic (estimated from switching activity by the kernel).
   */
  staticPower: number;

  /** Maximum DC fan-out (standard loads of the same family). */
  fanout: number;

  /**
   * What a FLOATING (Z) input reads as. Real TTL inputs float HIGH
   * (unwired TTL inputs behave as logic 1); real CMOS inputs are
   * genuinely undefined and read X with a floating-input warning.
   */
  floatingInput: 'X' | '1';

  /** Setup / hold windows (s) used by edge-triggered devices. */
  tsu: number;
  th: number;

  /** Output leakage when tri-stated / undriven (S) — very small. */
  zLeakage: number;
}

const SPECS: Record<LogicFamilyId, LogicFamilySpec> = {
  // Generic educational CMOS: 3–15 V capable, threshold ratios 30/70 %.
  cmos: {
    id: 'cmos',
    label: 'CMOS (generic)',
    technology: 'cmos',
    vccNominal: 5,
    vccMin: 3,
    vccMax: 15,
    vilRatio: 0.3,
    vihRatio: 0.7,
    vohDrop: 0.1,
    volAbs: 0.05,
    routHigh: 200,
    routLow: 100,
    iohMax: -0.004,
    iolMax: 0.004,
    iil: -0.000001,
    iih: 0.000001,
    cin: 5e-12,
    tpd: 25e-9,
    tr: 20e-9,
    tf: 15e-9,
    staticPower: 5e-6,
    fanout: 50,
    floatingInput: 'X',
    tsu: 5e-9,
    th: 5e-9,
    zLeakage: 1e-9,
  },

  // CD4000 "4000 series" metal-gate CMOS: slow, wide supply, weak drive.
  cd4000: {
    id: 'cd4000',
    label: 'CD4000',
    technology: 'cmos',
    vccNominal: 10,
    vccMin: 3,
    vccMax: 15,
    vilRatio: 0.3,
    vihRatio: 0.7,
    vohDrop: 0.05,
    volAbs: 0.05,
    routHigh: 500,
    routLow: 300,
    iohMax: -0.001,
    iolMax: 0.001,
    iil: -0.000001,
    iih: 0.000001,
    cin: 5e-12,
    tpd: 100e-9,
    tr: 60e-9,
    tf: 50e-9,
    staticPower: 10e-6,
    fanout: 50,
    floatingInput: 'X',
    tsu: 20e-9,
    th: 20e-9,
    zLeakage: 1e-9,
  },

  // 74HC high-speed CMOS: 2–6 V, thresholds 30/70 % of VCC.
  '74hc': {
    id: '74hc',
    label: '74HC',
    technology: 'cmos',
    vccNominal: 5,
    vccMin: 2,
    vccMax: 6,
    vilRatio: 0.3,
    vihRatio: 0.7,
    vohDrop: 0.1,
    volAbs: 0.1,
    routHigh: 60,
    routLow: 45,
    iohMax: -0.004,
    iolMax: 0.004,
    iil: -0.000001,
    iih: 0.000001,
    cin: 3.5e-12,
    tpd: 10e-9,
    tr: 6e-9,
    tf: 6e-9,
    staticPower: 2.5e-6,
    fanout: 50,
    floatingInput: 'X',
    tsu: 3e-9,
    th: 3e-9,
    zLeakage: 1e-9,
  },

  // 74HCT: HC output stages with TTL-compatible 2.0/0.8 V input levels.
  '74hct': {
    id: '74hct',
    label: '74HCT',
    technology: 'cmos',
    vccNominal: 5,
    vccMin: 4.5,
    vccMax: 5.5,
    vilAbs: 0.8,
    vihAbs: 2.0,
    vohDrop: 0.1,
    volAbs: 0.1,
    routHigh: 60,
    routLow: 45,
    iohMax: -0.004,
    iolMax: 0.004,
    iil: -0.000001,
    iih: 0.000001,
    cin: 3.5e-12,
    tpd: 12e-9,
    tr: 6e-9,
    tf: 6e-9,
    staticPower: 2.5e-6,
    fanout: 50,
    floatingInput: 'X',
    tsu: 3e-9,
    th: 3e-9,
    zLeakage: 1e-9,
  },

  // 74AC advanced CMOS: fastest, strongest drive of the CMOS set.
  '74ac': {
    id: '74ac',
    label: '74AC',
    technology: 'cmos',
    vccNominal: 5,
    vccMin: 3,
    vccMax: 6,
    vilRatio: 0.3,
    vihRatio: 0.7,
    vohDrop: 0.1,
    volAbs: 0.1,
    routHigh: 25,
    routLow: 20,
    iohMax: -0.024,
    iolMax: 0.024,
    iil: -0.000001,
    iih: 0.000001,
    cin: 4.5e-12,
    tpd: 5e-9,
    tr: 3e-9,
    tf: 3e-9,
    staticPower: 5e-6,
    fanout: 50,
    floatingInput: 'X',
    tsu: 2e-9,
    th: 2e-9,
    zLeakage: 1e-9,
  },

  // Generic standard TTL (74xx): totem-pole outputs, real input currents.
  ttl: {
    id: 'ttl',
    label: 'TTL (74xx)',
    technology: 'ttl',
    vccNominal: 5,
    vccMin: 4.75,
    vccMax: 5.25,
    vilAbs: 0.8,
    vihAbs: 2.0,
    vohAbs: 3.4,
    volAbs: 0.2,
    routHigh: 130,
    routLow: 12,
    iohMax: -0.0004,
    iolMax: 0.016,
    iil: -0.0016,
    iih: 0.00004,
    cin: 5e-12,
    tpd: 11e-9,
    tr: 5e-9,
    tf: 5e-9,
    staticPower: 0.02,
    fanout: 10,
    floatingInput: '1',
    tsu: 15e-9,
    th: 5e-9,
    zLeakage: 1e-8,
  },

  // 74LS low-power Schottky.
  '74ls': {
    id: '74ls',
    label: '74LS',
    technology: 'ttl',
    vccNominal: 5,
    vccMin: 4.75,
    vccMax: 5.25,
    vilAbs: 0.8,
    vihAbs: 2.0,
    vohAbs: 3.4,
    volAbs: 0.35,
    routHigh: 110,
    routLow: 20,
    iohMax: -0.0004,
    iolMax: 0.008,
    iil: -0.0004,
    iih: 0.00002,
    cin: 5e-12,
    tpd: 10e-9,
    tr: 8e-9,
    tf: 6e-9,
    staticPower: 0.005,
    fanout: 20,
    floatingInput: '1',
    tsu: 20e-9,
    th: 5e-9,
    zLeakage: 1e-8,
  },

  // 74ALS advanced low-power Schottky.
  '74als': {
    id: '74als',
    label: '74ALS',
    technology: 'ttl',
    vccNominal: 5,
    vccMin: 4.75,
    vccMax: 5.25,
    vilAbs: 0.8,
    vihAbs: 2.0,
    vohAbs: 3.4,
    volAbs: 0.35,
    routHigh: 90,
    routLow: 15,
    iohMax: -0.0004,
    iolMax: 0.008,
    iil: -0.0001,
    iih: 0.00002,
    cin: 5e-12,
    tpd: 6e-9,
    tr: 5e-9,
    tf: 4e-9,
    staticPower: 0.002,
    fanout: 20,
    floatingInput: '1',
    tsu: 15e-9,
    th: 5e-9,
    zLeakage: 1e-8,
  },
};

export const LOGIC_FAMILY_IDS = Object.keys(SPECS) as LogicFamilyId[];

export function getFamilySpec(id: LogicFamilyId | string | undefined): LogicFamilySpec {
  if (id && id in SPECS) return SPECS[id as LogicFamilyId];
  return SPECS.cmos;
}

/** The family a component resolves to, given its own override. */
export function componentFamily(family: string | undefined): LogicFamilySpec {
  return getFamilySpec(family);
}

/**
 * Fully-resolved electrical parameters for one digital component instance:
 * family spec + user supply/delay overrides collapsed into concrete volts.
 */
export interface ResolvedDigitalParams {
  spec: LogicFamilySpec;
  vcc: number;
  vil: number;
  vih: number;
  voh: number;
  vol: number;
  tpd: number;
  tr: number;
  tf: number;
  /** supply voltage outside the family's supported range */
  vccOutOfRange: boolean;
}

/**
 * Resolve the electrical contract of a digital component.
 *
 * `vccOverride` / `tpdOverride` come from component properties (0/undefined
 * = use the family default). A supply outside the family range is clamped
 * to the nearest rail and flagged so the kernel can warn the user.
 */
export function resolveDigitalParams(
  familyId: string | undefined,
  vccOverride?: number,
  tpdOverride?: number,
): ResolvedDigitalParams {
  const spec = getFamilySpec(familyId);
  let vcc = spec.vccNominal;
  let vccOutOfRange = false;
  if (vccOverride && Number.isFinite(vccOverride) && vccOverride > 0) {
    if (vccOverride < spec.vccMin) {
      vcc = spec.vccMin;
      vccOutOfRange = true;
    } else if (vccOverride > spec.vccMax) {
      vcc = spec.vccMax;
      vccOutOfRange = true;
    } else {
      vcc = vccOverride;
    }
  }

  const vil = spec.vilAbs ?? (spec.vilRatio ?? 0.3) * vcc;
  const vih = spec.vihAbs ?? (spec.vihRatio ?? 0.7) * vcc;
  // CMOS output levels track the supply; TTL levels are fixed structures.
  const voh =
    spec.vohAbs ??
    Math.max(vcc - (spec.vohDrop ?? 0.1), (spec.vihRatio ?? 0.7) * vcc + 0.05);
  const vol = spec.volAbs ?? 0.1;

  const tpd =
    tpdOverride && Number.isFinite(tpdOverride) && tpdOverride > 0
      ? tpdOverride
      : spec.tpd;

  return { spec, vcc, vil, vih, voh, vol, tpd, tr: spec.tr, tf: spec.tf, vccOutOfRange };
}

/**
 * Estimated load capacitance seen by one output driving `n` same-family
 * inputs plus stray wiring. Used only for the CMOS dynamic-power estimate
 * (P ≈ α·C·V²·f) — it does not affect the electrical solve, which is
 * resistive at these frequencies. Clearly an approximation.
 */
export function estimateLoadCapacitance(spec: LogicFamilySpec, nInputs: number): number {
  return 10e-12 + Math.max(0, nInputs) * spec.cin;
}
