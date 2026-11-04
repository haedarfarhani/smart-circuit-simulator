/**
 * Four-value digital logic semantics.
 *
 * Digital signals in this simulator carry one of four states, mirroring the
 * educational standard set by IEEE 1164 (simplified to four values):
 *
 *   '0' — driven LOW
 *   '1' — driven HIGH
 *   'X' — UNKNOWN: the voltage sits in the indeterminate band between the
 *         family thresholds, or a driver disagrees with another driver
 *         (contention), or a metastability event is in progress.
 *   'Z' — HIGH_IMPEDANCE: nothing is driving this point (floating input,
 *         tri-state output, unconnected pin).
 *
 * X and Z are never silently converted to 0 or 1. Gates propagate them with
 * the tables below; the only place Z becomes a definite value is the
 * family-specific floating-input behaviour (TTL inputs really do float HIGH,
 * CMOS inputs really are undefined), and that mapping is explicit in
 * `families.ts` / `kernel.ts`, not hidden inside a gate.
 */

export type LogicValue = '0' | '1' | 'X' | 'Z';

/** True when the value is a definite Boolean level. */
export function isKnown(v: LogicValue): boolean {
  return v === '0' || v === '1';
}

/**
 * AND over any number of inputs. A known 0 dominates; otherwise any X or Z
 * makes the result unknown; all known 1s give 1.
 */
export function logicAnd(values: LogicValue[]): LogicValue {
  let unknown = false;
  for (const v of values) {
    if (v === '0') return '0';
    if (v === 'X' || v === 'Z') unknown = true;
  }
  return unknown ? 'X' : '1';
}

/** OR over any number of inputs. A known 1 dominates; else X/Z → X. */
export function logicOr(values: LogicValue[]): LogicValue {
  let unknown = false;
  for (const v of values) {
    if (v === '1') return '1';
    if (v === 'X' || v === 'Z') unknown = true;
  }
  return unknown ? 'X' : '0';
}

/** Inversion. X and Z invert to X — we cannot know the complement of an
 * unknown or undriven level. */
export function logicNot(v: LogicValue): LogicValue {
  if (v === '0') return '1';
  if (v === '1') return '0';
  return 'X';
}

/** NAND / NOR / XNOR are the basic tables followed by one inversion. */
export function logicNand(values: LogicValue[]): LogicValue {
  return logicNot(logicAnd(values));
}

export function logicNor(values: LogicValue[]): LogicValue {
  return logicNot(logicOr(values));
}

/**
 * XOR over any number of inputs: 1 when an odd number of known-1 inputs.
 * Any X or Z input makes the parity unknowable, so the result is X.
 */
export function logicXor(values: LogicValue[]): LogicValue {
  let ones = 0;
  for (const v of values) {
    if (v === 'X' || v === 'Z') return 'X';
    if (v === '1') ones++;
  }
  return ones % 2 === 1 ? '1' : '0';
}

export function logicXnor(values: LogicValue[]): LogicValue {
  return logicNot(logicXor(values));
}

/** Buffer: passes the value through unchanged, Z included. */
export function logicBuf(v: LogicValue): LogicValue {
  return v;
}

/**
 * Resolve multiple drivers fighting over one electrical node.
 *
 * Z yields to anything (an undriven output does not fight). Two drivers
 * with the same definite value agree. A 0 and a 1 on the same node is real
 * electrical contention — the solver will land the node somewhere between
 * the rails and downstream inputs will read X; we flag it so the user gets
 * a warning instead of a silent mystery.
 */
export function resolveDrivers(values: LogicValue[]): {
  value: LogicValue;
  contention: boolean;
} {
  let result: LogicValue = 'Z';
  let contention = false;
  for (const v of values) {
    if (v === 'Z') continue;
    if (result === 'Z') {
      result = v;
    } else if (result !== v) {
      contention = true;
      result = 'X';
    }
  }
  return { value: result, contention };
}

/**
 * Majority function with 4-value semantics (used for carry-out): if at
 * least two inputs are known 1 the carry is 1 regardless of the rest; if at
 * least two are known 0 the carry is 0; otherwise unknown.
 */
export function logicMajority(a: LogicValue, b: LogicValue, c: LogicValue): LogicValue {
  const vals = [a, b, c];
  let ones = 0;
  let zeros = 0;
  for (const v of vals) {
    if (v === '1') ones++;
    else if (v === '0') zeros++;
  }
  if (ones >= 2) return '1';
  if (zeros >= 2) return '0';
  return 'X';
}

/**
 * Convert a LogicValue to a numeric bit, or null when unknown. Used by
 * arithmetic devices that need definite bits; callers decide how to handle
 * null (usually propagate X to the affected outputs).
 */
export function asBit(v: LogicValue): number | null {
  if (v === '0') return 0;
  if (v === '1') return 1;
  return null;
}

/** Format a value for compact UI display (never collapses X or Z). */
export function logicGlyph(v: LogicValue): string {
  return v;
}
