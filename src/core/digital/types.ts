/**
 * Digital component catalogue: which component types are digital, the
 * per-instance parameters they carry, and their library defaults.
 *
 * This module is the dependency-free bridge between the document model
 * (`models/circuit.ts`) and the digital kernel — everything else in
 * `core/digital` imports from here, and the solvers import only this
 * file for type filtering.
 */

import type { CircuitComponent, ComponentType } from '../../models/circuit';

/** Every purely digital component type (kernel-evaluated devices). */
export const DIGITAL_DEVICE_TYPES = [
  'and-gate',
  'or-gate',
  'not-gate',
  'nand-gate',
  'nor-gate',
  'xor-gate',
  'xnor-gate',
  'buffer-gate',
  'multiplexer',
  'demultiplexer',
  'decoder',
  'encoder',
  'half-adder',
  'full-adder',
  'adder',
  'subtractor',
  'comparator',
  'alu',
  'sr-latch',
  'd-latch',
  'sr-flip-flop',
  'd-flip-flop',
  'jk-flip-flop',
  't-flip-flop',
  'register',
  'shift-register',
  'counter',
  'bcd-to-seven-segment-decoder',
  'logic-input',
  'logic-output',
  'clock-generator',
] as const satisfies readonly ComponentType[];

/** The seven-segment display is digital-adjacent but purely electrical:
 * eight LED segments driven through real nodes, stamped by the analog
 * engine's diode model — not a logic device. */
export const SEVEN_SEGMENT_TYPE = 'seven-segment-display' as const;

export const DIGITAL_TYPES: ReadonlySet<ComponentType> = new Set([
  ...DIGITAL_DEVICE_TYPES,
  SEVEN_SEGMENT_TYPE,
]);

export function isDigitalType(type: ComponentType): boolean {
  return DIGITAL_TYPES.has(type);
}

export function isDigitalDeviceType(type: ComponentType): boolean {
  return (DIGITAL_DEVICE_TYPES as readonly string[]).includes(type);
}

export function isSevenSegmentType(type: ComponentType): boolean {
  return type === SEVEN_SEGMENT_TYPE;
}

/** Modes / options shared by the digital components. */
export type CounterMode = 'up' | 'down' | 'updown' | 'ring' | 'johnson';
export type ShiftMode = 'siso' | 'sipo' | 'piso' | 'pipo';
export type ShiftDirection = 'right' | 'left';
export type ClockEdge = 'rising' | 'falling';
export type SevenSegCommon = 'common-cathode' | 'common-anode';

/**
 * Per-instance digital parameters, resolved from a component's document
 * fields with per-type defaults. The kernel and devices never read the raw
 * document component — they see this resolved, normalized view.
 */
export interface DigitalCompParams {
  type: ComponentType;
  family: string;
  /** supply override (0 = family nominal) */
  vcc: number;
  /** propagation-delay override (0 = family value) */
  tpd: number;
  /** bit width (adders, registers, counters, ALU, …) */
  width: number;
  /** data-line count (gate inputs, mux data, decoder selects, …) */
  inputCount: number;
  counterMode: CounterMode;
  shiftMode: ShiftMode;
  shiftDirection: ShiftDirection;
  edge: ClockEdge;
  /** active-LOW variant (decoder outputs, encoder latch polarity, SR inputs) */
  activeLow: boolean;
  /** encoder priority mode */
  priority: boolean;
  /** signed (two's-complement) arithmetic / comparison */
  signed: boolean;
  /** hexadecimal decoding instead of BCD */
  hexMode: boolean;
  commonType: SevenSegCommon;
  /** clock duty cycle, percent */
  dutyCycle: number;
  /** clock enable (pause) */
  enabled: boolean;
  /** raw numeric value (logic-input level) */
  value: number;
  /** clock frequency (Hz) */
  frequency: number;
  /** clock initial phase, degrees of one period */
  phaseDeg: number;
}

const clampInt = (v: number | undefined, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(v ?? dflt);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Per-type parameter defaults. Anything a component does not set falls back
 * to the values here; `resolveDigitalCompParams` normalizes the result.
 */
export const DIGITAL_DEFAULTS: Partial<
  Record<ComponentType, Partial<DigitalCompParams> & Record<string, unknown>>
> = {
  'and-gate': { inputCount: 2 },
  'or-gate': { inputCount: 2 },
  'not-gate': { inputCount: 1 },
  'nand-gate': { inputCount: 2 },
  'nor-gate': { inputCount: 2 },
  'xor-gate': { inputCount: 2 },
  'xnor-gate': { inputCount: 2 },
  'buffer-gate': { inputCount: 1 },
  multiplexer: { inputCount: 4, width: 1 },
  demultiplexer: { inputCount: 4, width: 1 },
  decoder: { inputCount: 3 },
  encoder: { inputCount: 8, priority: true },
  'half-adder': {},
  'full-adder': {},
  adder: { width: 4 },
  subtractor: { width: 4 },
  comparator: { width: 4 },
  alu: { width: 4 },
  'sr-latch': { activeLow: false },
  'd-latch': {},
  'sr-flip-flop': { edge: 'rising' },
  'd-flip-flop': { edge: 'rising' },
  'jk-flip-flop': { edge: 'rising' },
  't-flip-flop': { edge: 'rising' },
  register: { width: 4 },
  'shift-register': { width: 4, shiftMode: 'sipo', shiftDirection: 'right' },
  counter: { width: 4, counterMode: 'up' },
  'bcd-to-seven-segment-decoder': { commonType: 'common-cathode' },
  'logic-input': { value: 0 },
  'logic-output': {},
  'clock-generator': { frequency: 10, dutyCycle: 50, phaseDeg: 0, enabled: true },
  'seven-segment-display': { commonType: 'common-cathode' },
};

/** Resolve a component's digital parameters with per-type defaults. */
export function resolveDigitalCompParams(comp: CircuitComponent): DigitalCompParams {
  const d = DIGITAL_DEFAULTS[comp.type] ?? {};
  const num = (key: string): number | undefined => {
    const v = (comp as unknown as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const bool = (key: string): boolean | undefined => {
    const v = (comp as unknown as Record<string, unknown>)[key];
    return typeof v === 'boolean' ? v : undefined;
  };
  const str = (key: string): string | undefined => {
    const v = (comp as unknown as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  };

  const width = clampInt(num('width') ?? (d.width as number | undefined), 1, 32, 1);
  let inputCount = clampInt(
    num('inputCount') ?? (d.inputCount as number | undefined),
    1,
    16,
    2,
  );
  // Gate input counts: only NOT and BUFFER are fixed at 1; others allow 2–4.
  if (isGateType(comp.type)) {
    if (comp.type === 'not-gate' || comp.type === 'buffer-gate') inputCount = 1;
    else inputCount = clampInt(inputCount, 2, 4, 2);
  }
  // MUX / DEMUX data lines must be a power of two ≥ 2 (select-line math).
  if (comp.type === 'multiplexer' || comp.type === 'demultiplexer') {
    const allowed = [2, 4, 8, 16];
    inputCount = allowed.reduce(
      (best, a) => (Math.abs(a - inputCount) < Math.abs(best - inputCount) ? a : best),
      4,
    );
  }
  // Decoder select lines: 2, 3 or 4 (→ 4/8/16 outputs).
  if (comp.type === 'decoder') inputCount = clampInt(inputCount, 2, 4, 3);
  // Encoder data lines: snap to a power of two, 4/8/16 (→ 2/3/4 outputs).
  if (comp.type === 'encoder') {
    const allowed = [4, 8, 16];
    inputCount = allowed.reduce(
      (best, a) => (Math.abs(a - inputCount) < Math.abs(best - inputCount) ? a : best),
      8,
    );
  }

  return {
    type: comp.type,
    family:
      str('logicFamily') ?? ((d.family as string | undefined) || 'cmos'),
    vcc: num('vcc') ?? (d.vcc as number | undefined) ?? 0,
    tpd: num('tpd') ?? (d.tpd as number | undefined) ?? 0,
    width,
    inputCount,
    counterMode: (str('counterMode') ?? ((d.counterMode as string) || 'up')) as CounterMode,
    shiftMode: (str('shiftMode') ?? ((d.shiftMode as string) || 'sipo')) as ShiftMode,
    shiftDirection: (str('shiftDirection') ??
      ((d.shiftDirection as string) || 'right')) as ShiftDirection,
    edge: (str('edge') ?? ((d.edge as string) || 'rising')) as ClockEdge,
    activeLow: bool('activeLow') ?? ((d.activeLow as boolean | undefined) ?? false),
    priority: bool('priority') ?? ((d.priority as boolean | undefined) ?? false),
    signed: bool('signed') ?? ((d.signed as boolean | undefined) ?? false),
    hexMode: bool('hexMode') ?? ((d.hexMode as boolean | undefined) ?? false),
    commonType: (str('commonType') ??
      ((d.commonType as string) || 'common-cathode')) as SevenSegCommon,
    dutyCycle: clampInt(num('dutyCycle') ?? ((d.dutyCycle as number) ?? 50), 1, 99, 50),
    enabled: bool('enabled') ?? ((d.enabled as boolean | undefined) ?? true),
    value: num('value') ?? 0,
    frequency: num('frequency') ?? ((d.frequency as number) ?? 10),
    phaseDeg: num('phaseDeg') ?? ((d.phaseDeg as number) ?? 0),
  };
}

export function isGateType(type: ComponentType): boolean {
  return [
    'and-gate',
    'or-gate',
    'not-gate',
    'nand-gate',
    'nor-gate',
    'xor-gate',
    'xnor-gate',
    'buffer-gate',
  ].includes(type);
}

/**
 * Apply the per-type digital defaults to a NEW component instance
 * (translates DigitalCompParams keys onto document field names).
 */
export function applyDigitalDefaults(comp: CircuitComponent): void {
  const d = DIGITAL_DEFAULTS[comp.type];
  if (!d) return;
  if (d.family !== undefined) comp.logicFamily = d.family as string;
  if (d.inputCount !== undefined) comp.inputCount = d.inputCount as number;
  if (d.width !== undefined) comp.width = d.width as number;
  if (d.counterMode !== undefined) {
    comp.counterMode = d.counterMode as CircuitComponent['counterMode'];
  }
  if (d.shiftMode !== undefined) {
    comp.shiftMode = d.shiftMode as CircuitComponent['shiftMode'];
  }
  if (d.shiftDirection !== undefined) {
    comp.shiftDirection = d.shiftDirection as CircuitComponent['shiftDirection'];
  }
  if (d.edge !== undefined) comp.edge = d.edge as CircuitComponent['edge'];
  if (d.activeLow !== undefined) comp.activeLow = d.activeLow as boolean;
  if (d.priority !== undefined) comp.priority = d.priority as boolean;
  if (d.signed !== undefined) comp.signed = d.signed as boolean;
  if (d.hexMode !== undefined) comp.hexMode = d.hexMode as boolean;
  if (d.commonType !== undefined) {
    comp.commonType = d.commonType as CircuitComponent['commonType'];
  }
  if (d.dutyCycle !== undefined) comp.dutyCycle = d.dutyCycle as number;
  if (d.enabled !== undefined) comp.enabled = d.enabled as boolean;
}
