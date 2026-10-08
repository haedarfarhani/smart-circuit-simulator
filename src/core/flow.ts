/**
 * Animation and stored-energy helpers.
 *
 * The current-flow animation follows the *calculated* current, so a branch
 * with more resistance (less current at the same voltage) visibly moves
 * slower. Energy values come from the solver's steady-state voltage/current
 * and are ramped with the physical time constant of the element.
 */

/** Speed of a dot moving along a conductor, in world units per second. */
export const MIN_FLOW_SPEED = 6;
export const MAX_FLOW_SPEED = 170;
/** Current at which a conductor animates at its nominal speed. */
export const FLOW_REFERENCE_CURRENT = 0.05;

/**
 * Monotonic in |current|: twice the current moves faster, and the square root
 * keeps huge fault currents from turning into an unreadable blur.
 */
export function flowSpeed(current: number, simulationSpeed = 1): number {
  const mag = Math.abs(current);
  if (!Number.isFinite(mag) || mag <= 0) return 0;
  const speed = 28 * Math.sqrt(mag / FLOW_REFERENCE_CURRENT);
  const clamped = Math.min(Math.max(speed, MIN_FLOW_SPEED), MAX_FLOW_SPEED);
  return clamped * Math.max(0, simulationSpeed);
}

/** Energy stored in a capacitor: ½CV². */
export function capacitorEnergy(capacitance: number, voltage: number): number {
  return 0.5 * capacitance * voltage * voltage;
}

/** Energy stored in an inductor / solenoid coil: ½LI². */
export function inductorEnergy(inductance: number, current: number): number {
  return 0.5 * inductance * current * current;
}

/** RC charging time constant (seconds). */
export function rcTimeConstant(resistance: number, capacitance: number): number {
  return Math.abs(resistance * capacitance);
}

/** RL current-rise time constant (seconds). */
export function rlTimeConstant(inductance: number, resistance: number): number {
  if (resistance === 0) return 0.5;
  return Math.abs(inductance / resistance);
}

/**
 * How far a first-order charge/discharge has progressed after `t` seconds with
 * time constant `tau` (0 → 1).
 */
export function chargeProgress(t: number, tau: number): number {
  if (tau <= 0) return 1;
  if (t <= 0) return 0;
  return 1 - Math.exp(-t / tau);
}

/**
 * Fraction of the steady-state stored energy reached at `t`: voltage and
 * current follow `chargeProgress`, and stored energy goes with their square.
 */
export function energyFraction(t: number, tau: number): number {
  const p = chargeProgress(t, tau);
  return p * p;
}

/**
 * Equivalent resistance seen by the source, used as the R of the RC/RL time
 * constant. Falls back to 1 Ω when the source current is not meaningful.
 */
export function equivalentResistance(
  sourceVoltage: number,
  sourceCurrent: number,
): number {
  const v = Math.abs(sourceVoltage);
  const i = Math.abs(sourceCurrent);
  if (!Number.isFinite(v) || !Number.isFinite(i) || i < 1e-9) return 1;
  const r = v / i;
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/**
 * Resistance to use in the charge time constant of an energy-storing element.
 *
 * When the source drives a real current, V/I measures the loop resistance
 * directly. Once a capacitor blocks (I = 0) that measurement disappears, so it
 * falls back to the sum of the circuit's resistive elements — the series
 * resistance a series RC/RL loop charges through.
 */
export function estimateLoopResistance(
  sourceVoltage: number,
  sourceCurrent: number,
  resistances: number[],
): number {
  const i = Math.abs(sourceCurrent);
  const v = Math.abs(sourceVoltage);
  if (Number.isFinite(i) && Number.isFinite(v) && i > 1e-6 && v > 0) {
    return equivalentResistance(sourceVoltage, sourceCurrent);
  }
  const sum = resistances.reduce((acc, r) => acc + (r > 0 ? r : 0), 0);
  return sum > 0 ? sum : 1;
}

/**
 * Time constant used for the charge animation. Real RC/RL constants are often
 * microseconds — far too fast to watch — so the animation is time-compressed
 * into a readable range while the τ shown to the user stays the physical one.
 */
export function visualTimeConstant(tau: number, min = 0.3, max = 3): number {
  if (!Number.isFinite(tau) || tau <= 0) return min;
  return Math.min(max, Math.max(min, tau));
}

/**
 * How hard a lamp is driven: its actual power as a share of its watt rating.
 * 1 means “burning exactly at rating”, values above 1 are overdriven.
 * Brightness follows power, which is what makes it follow voltage *and*
 * current — a lamp in series with a big resistor goes dim on both counts.
 */
export function lampLoad(power: number, ratedPower: number): number {
  const p = Math.abs(power);
  if (!Number.isFinite(p) || !Number.isFinite(ratedPower)) return 0;
  if (p <= 0 || ratedPower <= 0) return 0;
  return p / ratedPower;
}

/** 0..1 brightness for the glow, saturating once the lamp reaches its rating. */
export function lampBrightness(power: number, ratedPower: number): number {
  return Math.min(1, lampLoad(power, ratedPower));
}

/* ---------- current-flow pulse geometry ---------- */

/** Pulse geometry in screen pixels; every length is divided by the zoom. */
export const CORE_LEN = 4.5;
export const HEAD_LEN = 1.6;
export const TRAIL_LEN = 17;
export const PERIOD = 27;

/** Current at which a pulse reaches full size and glow. */
export const STRONG_CURRENT = 0.1;

export interface PulsePattern {
  coreLen: number;
  headLen: number;
  trailLen: number;
  period: number;
  /** dash offsets in world units, already phase-shifted */
  coreOffset: number;
  headOffset: number;
  trailOffset: number;
  coreWidth: number;
  headWidth: number;
  trailWidth: number;
  coreOpacity: number;
  headOpacity: number;
  trailOpacity: number;
}

/** 0..1 pulse weight: bigger and brighter pulses carry more current. */
export function pulseStrength(current: number): number {
  const mag = Math.abs(current);
  if (!Number.isFinite(mag) || mag <= 0) return 0;
  return Math.min(1, Math.sqrt(mag / STRONG_CURRENT));
}

/**
 * Dash geometry for one pulse: a wide soft trail, a solid core, and a small
 * bright head, all sharing one phase. The three dashes are deliberately offset
 * so their *leading* edges line up, which puts the head at the front of the
 * comet and the trail behind the core.
 */
export function pulsePattern(
  current: number,
  phase: number,
  zoom: number,
): PulsePattern {
  const strength = pulseStrength(current);
  const k = 1 / Math.max(zoom, 0.01);

  const coreLen = CORE_LEN * k;
  const headLen = HEAD_LEN * k;
  const trailLen = TRAIL_LEN * k;
  const period = PERIOD * k;

  // keep the phase inside one period so the pattern never jumps
  const wrapped = ((phase % period) + period) % period;
  const coreOffset = -wrapped;

  return {
    coreLen,
    headLen,
    trailLen,
    period,
    coreOffset,
    headOffset: coreOffset - (coreLen - headLen),
    trailOffset: coreOffset + (trailLen - coreLen),
    coreWidth: (2.1 + 1.9 * strength) * k,
    headWidth: (1.1 + 0.9 * strength) * k,
    trailWidth: (4.2 + 4.4 * strength) * k,
    coreOpacity: 0.9 + 0.1 * strength,
    headOpacity: 0.7 + 0.3 * strength,
    trailOpacity: 0.2 + 0.22 * strength,
  };
}

const ENERGY_UNITS: { limit: number; scale: number; unit: string }[] = [
  { limit: 1, scale: 1, unit: 'J' },
  { limit: 1e-3, scale: 1e-3, unit: 'mJ' },
  { limit: 1e-6, scale: 1e-6, unit: 'µJ' },
  { limit: 1e-9, scale: 1e-9, unit: 'nJ' },
  { limit: 1e-12, scale: 1e-12, unit: 'pJ' },
];

/** Energy with a readable SI prefix, e.g. "12.5 µJ". */
export function formatEnergy(joules: number): string {
  const mag = Math.abs(joules);
  if (!Number.isFinite(mag)) return '—';
  for (const { limit, scale, unit } of ENERGY_UNITS) {
    if (mag >= limit) {
      const scaled = joules / scale;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${scaled.toFixed(digits)} ${unit}`;
    }
  }
  return `${joules.toExponential(2)} J`;
}
