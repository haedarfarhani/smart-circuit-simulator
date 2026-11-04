/**
 * Digital device definitions: pin layouts and behaviour.
 *
 * A device is a PURE function from (classified inputs, previous state,
 * parameters) to (desired outputs, next state). All timing — propagation
 * delay, edge detection bookkeeping, metastability windows — is applied by
 * the kernel (`kernel.ts`), not here, so truth tables can be tested
 * directly.
 *
 * Pin geometry note: the ordered pin list defines terminal indices in the
 * document model, so `pins()` output order must be stable — the symbol
 * renderer, `buildTopology`, hit-testing and the kernel all index the same
 * array.
 */

import {
  asBit,
  logicAnd,
  logicBuf,
  logicMajority,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicXnor,
  logicXor,
  type LogicValue,
} from './logic';
import {
  isGateType,
  type DigitalCompParams,
} from './types';
import type { ComponentType } from '../../models/circuit';

// ---------------------------------------------------------------------------
// Pin model
// ---------------------------------------------------------------------------

export interface DevicePinDef {
  name: string;
  dir: 'in' | 'out';
  x: number;
  y: number;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  /**
   * Control pins (enables, loads, async preset/clear) treat a floating (Z)
   * input as INACTIVE rather than unknown — an unwired enable should not
   * corrupt a sequential device. Documented educational deviation: real
   * floating control pins follow the family floating-input behaviour.
   */
  control?: boolean;
}

/** Device-internal state: sequential bits, counters, edge timestamps. */
export type DeviceState = Record<string, unknown>;

export interface DeviceEvalCtx {
  params: DigitalCompParams;
  /** classified inputs by pin name (Z already mapped per pin kind) */
  inputs: Record<string, LogicValue>;
  /** same inputs in pin order (gates iterate this) */
  list: LogicValue[];
  /** classified inputs of the previous simulation step, by name */
  prevInputs: Record<string, LogicValue>;
  /** sim time of the most recent change per input pin, by name */
  inputChangedAt: Record<string, number>;
  /** state as of the previous step — must not be mutated */
  state: DeviceState;
  /** current simulation time (s) */
  t: number;
  /** electrical timestep (s) */
  dt: number;
  /**
   * false during the static (DC) evaluation pass, where there is no time
   * base: edge detectors and setup/hold checks must not fire.
   */
  timing: boolean;
}

export interface DeviceEvalResult {
  /** desired value for every output pin, by name */
  outputs: Record<string, LogicValue>;
  /** new internal state, if the device is sequential */
  state?: DeviceState;
  /** a setup/hold violation was detected at this evaluation */
  violation?: boolean;
  /** request a metastability window: outputs X for this many seconds */
  metastable?: number;
  warnings?: string[];
}

export interface DeviceDef {
  pins: (p: DigitalCompParams) => DevicePinDef[];
  initialState?: (p: DigitalCompParams) => DeviceState;
  eval: (ctx: DeviceEvalCtx) => DeviceEvalResult;
  /** output computed purely from sim time (clock generator) — kernel-driven */
  timeDriven?: boolean;
}

// ---------------------------------------------------------------------------
// Layout helpers (all coordinates are multiples of the 10-unit grid)
// ---------------------------------------------------------------------------

const IN_X = -50;
const OUT_X = 50;

function leftPins(names: string[], opts: { control?: boolean[] } = {}): DevicePinDef[] {
  const n = names.length;
  const start = -((n - 1) * 20) / 2;
  return names.map((name, i) => ({
    name,
    dir: 'in' as const,
    x: IN_X,
    y: start + i * 20,
    dx: -1 as const,
    dy: 0 as const,
    control: opts.control?.[i],
  }));
}

function rightPins(names: string[]): DevicePinDef[] {
  const n = names.length;
  const start = -((n - 1) * 20) / 2;
  return names.map((name, i) => ({
    name,
    dir: 'out' as const,
    x: OUT_X,
    y: start + i * 20,
    dx: 1 as const,
    dy: 0 as const,
  }));
}

function topBottomPair(top: string, bottom: string): DevicePinDef[] {
  return [
    { name: top, dir: 'in', x: 0, y: -50, dx: 0, dy: -1, control: true },
    { name: bottom, dir: 'in', x: 0, y: 50, dx: 0, dy: 1, control: true },
  ];
}

const CONTROL = { control: true };

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

type Bits = LogicValue[];

const zeroBits = (w: number): Bits => new Array(w).fill('0');
const oneHot = (w: number): Bits => {
  const b = zeroBits(w);
  b[0] = '1';
  return b;
};

/** Numeric value of a bit vector, or null when any bit is X/Z. */
function bitsToValue(bits: Bits): number | null {
  let v = 0;
  for (let i = 0; i < bits.length; i++) {
    const b = asBit(bits[i]);
    if (b === null) return null;
    v += b * (1 << i);
  }
  return v;
}

const valueToBits = (v: number, w: number): Bits =>
  Array.from({ length: w }, (_, i): LogicValue => ((v >> i) & 1) === 1 ? '1' : '0');

function invertBits(bits: Bits): Bits {
  return bits.map(logicNot);
}

/** Ripple-carry one-bit stage built from the 4-value primitives. */
function addBits(a: LogicValue, b: LogicValue, c: LogicValue): { s: LogicValue; c: LogicValue } {
  return { s: logicXor([a, b, c]), c: logicMajority(a, b, c) };
}

function rippleAdd(
  a: Bits,
  b: Bits,
  cIn: LogicValue,
  w: number,
): { sum: Bits; carry: LogicValue; carryBeforeMsb: LogicValue } {
  const sum: Bits = [];
  let c = cIn;
  let carryBeforeMsb: LogicValue = cIn;
  for (let i = 0; i < w; i++) {
    if (i === w - 1) carryBeforeMsb = c;
    const r = addBits(a[i], b[i], c);
    sum.push(r.s);
    c = r.c;
  }
  return { sum, carry: c, carryBeforeMsb };
}

// ---------------------------------------------------------------------------
// Combinational device: helpers
// ---------------------------------------------------------------------------

/** Decode select lines into an index, or null when any line is X/Z. */
function selectIndex(selects: LogicValue[]): number | null {
  let v = 0;
  for (let i = 0; i < selects.length; i++) {
    const b = asBit(selects[i]);
    if (b === null) return null;
    v += b * (1 << i);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function gatePins(inputCount: number): DevicePinDef[] {
  return [
    ...leftPins(Array.from({ length: inputCount }, (_, i) => `IN${i}`)),
    ...rightPins(['OUT']),
  ];
}

function gateDef(fn: (list: LogicValue[]) => LogicValue): DeviceDef {
  return {
    pins: (p) => gatePins(p.inputCount),
    eval: (ctx) => ({ outputs: { OUT: fn(ctx.list) } }),
  };
}

// ---------------------------------------------------------------------------
// Multiplexer / demultiplexer
// ---------------------------------------------------------------------------

function muxPins(p: DigitalCompParams): DevicePinDef[] {
  const n = p.inputCount;
  const k = Math.log2(n);
  const w = p.width;
  const dataNames: string[] = [];
  for (let i = 0; i < n; i++) {
    if (w === 1) dataNames.push(`D${i}`);
    else for (let j = 0; j < w; j++) dataNames.push(`D${i}b${j}`);
  }
  const pins: DevicePinDef[] = [...leftPins(dataNames)];
  for (let i = 0; i < k; i++) {
    pins.push({ name: `S${i}`, dir: 'in', x: -20 + i * 20, y: 60, dx: 0, dy: 1, ...CONTROL });
  }
  const outNames: string[] = [];
  if (w === 1) outNames.push('Y');
  else for (let j = 0; j < w; j++) outNames.push(`Yb${j}`);
  pins.push(...rightPins(outNames));
  return pins;
}

const muxDef: DeviceDef = {
  pins: muxPins,
  eval: (ctx) => {
    const { params } = ctx;
    const n = params.inputCount;
    const k = Math.round(Math.log2(n));
    const w = params.width;
    const selects: LogicValue[] = [];
    for (let i = 0; i < k; i++) selects.push(ctx.inputs[`S${i}`] ?? 'X');
    const sel = selectIndex(selects);
    const outputs: Record<string, LogicValue> = {};
    for (let j = 0; j < w; j++) {
      const outName = w === 1 ? 'Y' : `Yb${j}`;
      if (sel === null) {
        // UNKNOWN select: the routed input itself is unknowable.
        outputs[outName] = 'X';
      } else {
        outputs[outName] = ctx.inputs[w === 1 ? `D${sel}` : `D${sel}b${j}`] ?? 'X';
      }
    }
    return { outputs };
  },
};

function demuxPins(p: DigitalCompParams): DevicePinDef[] {
  const n = p.inputCount;
  const k = Math.round(Math.log2(n));
  const w = p.width;
  const dataNames: string[] = [];
  if (w === 1) dataNames.push('D');
  else for (let j = 0; j < w; j++) dataNames.push(`Db${j}`);
  const pins: DevicePinDef[] = [...leftPins(dataNames)];
  for (let i = 0; i < k; i++) {
    pins.push({ name: `S${i}`, dir: 'in', x: -20 + i * 20, y: 60, dx: 0, dy: 1, ...CONTROL });
  }
  const outNames: string[] = [];
  for (let i = 0; i < n; i++) {
    if (w === 1) outNames.push(`Y${i}`);
    else for (let j = 0; j < w; j++) outNames.push(`Y${i}b${j}`);
  }
  pins.push(...rightPins(outNames));
  return pins;
}

const demuxDef: DeviceDef = {
  pins: demuxPins,
  eval: (ctx) => {
    const { params } = ctx;
    const n = params.inputCount;
    const k = Math.round(Math.log2(n));
    const w = params.width;
    const selects: LogicValue[] = [];
    for (let i = 0; i < k; i++) selects.push(ctx.inputs[`S${i}`] ?? 'X');
    const sel = selectIndex(selects);
    const d = (j: number) => ctx.inputs[w === 1 ? 'D' : `Db${j}`] ?? 'X';
    const outputs: Record<string, LogicValue> = {};
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < w; j++) {
        const name = w === 1 ? `Y${i}` : `Y${i}b${j}`;
        if (sel === null) outputs[name] = 'X';
        else if (i === sel) outputs[name] = d(j);
        else outputs[name] = '0';
      }
    }
    return { outputs };
  },
};

// ---------------------------------------------------------------------------
// Decoder / encoder
// ---------------------------------------------------------------------------

function decoderPins(p: DigitalCompParams): DevicePinDef[] {
  const k = p.inputCount;
  const n = 1 << k;
  const pins: DevicePinDef[] = [
    ...leftPins([...Array.from({ length: k }, (_, i) => `S${i}`), 'EN']),
  ];
  pins[pins.length - 1].control = true;
  pins.push(
    ...rightPins(Array.from({ length: n }, (_, i) => `Y${i}`)),
  );
  return pins;
}

const decoderDef: DeviceDef = {
  pins: decoderPins,
  eval: (ctx) => {
    const { params } = ctx;
    const k = params.inputCount;
    const n = 1 << k;
    const selects: LogicValue[] = [];
    for (let i = 0; i < k; i++) selects.push(ctx.inputs[`S${i}`] ?? 'X');
    const en = ctx.inputs.EN;
    const sel = selectIndex(selects);
    const on = params.activeLow ? '0' : '1';
    const off = params.activeLow ? '1' : '0';
    const outputs: Record<string, LogicValue> = {};
    const all = (v: LogicValue): void => {
      for (let i = 0; i < n; i++) outputs[`Y${i}`] = v;
    };
    if (en === 'X') all('X');
    else if (en !== '1') all(off); // disabled (EN is a control pin: Z→inactive)
    else if (sel === null) all('X');
    else {
      all(off);
      outputs[`Y${sel}`] = on;
    }
    return { outputs };
  },
};

function encoderPins(p: DigitalCompParams): DevicePinDef[] {
  const n = p.inputCount;
  const k = Math.round(Math.log2(n));
  return [
    ...leftPins(Array.from({ length: n }, (_, i) => `D${i}`)),
    ...rightPins([...Array.from({ length: k }, (_, i) => `Y${i}`), 'V']),
  ];
}

const encoderDef: DeviceDef = {
  pins: encoderPins,
  eval: (ctx) => {
    const { params } = ctx;
    const n = params.inputCount;
    const k = Math.round(Math.log2(n));
    const active = (v: LogicValue) => (params.activeLow ? (v === '0' ? 1 : v === 'X' ? null : 0) : v === '1' ? 1 : v === 'X' ? null : 0);
    const actLevel = params.activeLow ? '0' : '1';
    const inactLevel = params.activeLow ? '1' : '0';
    const outputs: Record<string, LogicValue> = {};

    const code = (idx: number): void => {
      const bits = valueToBits(idx, k);
      for (let i = 0; i < k; i++) outputs[`Y${i}`] = params.activeLow ? logicNot(bits[i]) : bits[i];
    };
    const allX = (): void => {
      for (let i = 0; i < k; i++) outputs[`Y${i}`] = 'X';
    };

    if (params.priority) {
      // Scan from the highest-priority (highest-index) input down. The
      // first ACTIVE input decides; an unknown input above every known
      // inactive one makes the result unknowable.
      for (let i = n - 1; i >= 0; i--) {
        const a = active(ctx.inputs[`D${i}`] ?? 'Z');
        if (a === 1) {
          code(i);
          outputs.V = actLevel;
          return { outputs };
        }
        if (a === null) {
          allX();
          outputs.V = 'X';
          return { outputs };
        }
      }
      for (let i = 0; i < k; i++) outputs[`Y${i}`] = inactLevel;
      outputs.V = inactLevel;
      return { outputs };
    }

    // Standard encoder: exactly one active input is valid.
    let ones = 0;
    let idx = -1;
    let unknown = false;
    for (let i = 0; i < n; i++) {
      const a = active(ctx.inputs[`D${i}`] ?? 'Z');
      if (a === 1) {
        ones++;
        idx = i;
      } else if (a === null) unknown = true;
    }
    if (unknown || ones > 1) {
      allX();
      outputs.V = 'X';
    } else if (ones === 1) {
      code(idx);
      outputs.V = actLevel;
    } else {
      for (let i = 0; i < k; i++) outputs[`Y${i}`] = inactLevel;
      outputs.V = inactLevel;
    }
    return { outputs };
  },
};

// ---------------------------------------------------------------------------
// Adders / subtractor / comparator / ALU
// ---------------------------------------------------------------------------

function widthInputOutputPins(
  p: DigitalCompParams,
  extraIns: DevicePinDef[],
  extraOuts: string[],
): { pins: DevicePinDef[]; inNames: string[]; outNames: string[] } {
  const w = p.width;
  const inNames = [
    ...Array.from({ length: w }, (_, i) => `A${i}`),
    ...Array.from({ length: w }, (_, i) => `B${i}`),
  ];
  const outNames = Array.from({ length: w }, (_, i) => `R${i}`);
  return {
    pins: [
      ...leftPins([...inNames, ...extraIns.map((e) => e.name)]),
      ...rightPins([...outNames, ...extraOuts]),
    ],
    inNames,
    outNames,
  };
}

function adderDef(extraIns: DevicePinDef[], extraOuts: string[], kind: 'add' | 'sub'): DeviceDef {
  return {
    pins: (p) => widthInputOutputPins(p, extraIns, extraOuts).pins,
    eval: (ctx) => {
      const w = ctx.params.width;
      const a: Bits = [];
      const b: Bits = [];
      for (let i = 0; i < w; i++) {
        a.push(ctx.inputs[`A${i}`] ?? 'X');
        b.push(ctx.inputs[`B${i}`] ?? 'X');
      }
      const operands = kind === 'sub' ? invertBits(b) : b;
      let cIn: LogicValue = '0';
      if (kind === 'add') cIn = ctx.inputs.CI ?? '0';
      else {
        // A − B − BIN = A + ~B + (1 − BIN)
        const bin = ctx.inputs.BIN ?? '0';
        cIn = logicNot(bin);
      }
      const { sum, carry, carryBeforeMsb } = rippleAdd(a, operands, cIn, w);
      const outputs: Record<string, LogicValue> = {};
      for (let i = 0; i < w; i++) outputs[`R${i}`] = sum[i];
      if (kind === 'add') outputs.CO = carry;
      else outputs.BO = logicNot(carry);
      // Signed overflow: carry INTO the MSB differs from carry OUT of it.
      outputs.OV = logicXor([carry, carryBeforeMsb]);
      return { outputs };
    },
  };
}

const comparatorDef: DeviceDef = {
  pins: (p) => widthInputOutputPins(p, [], ['GT', 'EQ', 'LT']).pins,
  eval: (ctx) => {
    const w = ctx.params.width;
    // Scan from the MSB down: the highest bit position where A and B
    // differ (both known) decides the comparison. An unknown bit above
    // every known difference makes the result unknowable.
    let decision: 'gt' | 'lt' | 'eq' | 'x' = 'eq';
    for (let i = w - 1; i >= 0; i--) {
      const a = ctx.inputs[`A${i}`] ?? 'X';
      const b = ctx.inputs[`B${i}`] ?? 'X';
      if (!isKnownPair(a, b)) {
        decision = 'x';
        break;
      }
      if (a !== b) {
        decision = a === '1' ? 'gt' : 'lt';
        break;
      }
    }
    const outputs: Record<string, LogicValue> = {
      GT: decision === 'gt' ? '1' : decision === 'x' ? 'X' : '0',
      EQ: decision === 'eq' ? '1' : decision === 'x' ? 'X' : '0',
      LT: decision === 'lt' ? '1' : decision === 'x' ? 'X' : '0',
    };
    return { outputs };
  },
};

function isKnownPair(a: LogicValue, b: LogicValue): boolean {
  return (
    (a === '0' || a === '1') &&
    (b === '0' || b === '1')
  );
}

/** ALU operation table (selected by OP0..OP3, documented in the Inspector). */
export const ALU_OPS = [
  'ADD',
  'SUB',
  'AND',
  'OR',
  'XOR',
  'NOT A',
  'INC A',
  'DEC A',
  'CMP',
  'SHL',
  'SHR',
  'SAR',
  'NAND',
  'NOR',
  'XNOR',
  'CLEAR',
] as const;

const aluDef: DeviceDef = {
  pins: (p) =>
    widthInputOutputPins(
      p,
      [
        { name: 'OP0', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0, ...CONTROL },
        { name: 'OP1', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0, ...CONTROL },
        { name: 'OP2', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0, ...CONTROL },
        { name: 'OP3', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0, ...CONTROL },
        { name: 'CI', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0 },
      ],
      ['CO', 'ZF', 'NF', 'VF'],
    ).pins,
  eval: (ctx) => {
    const w = ctx.params.width;
    const a: Bits = [];
    const b: Bits = [];
    for (let i = 0; i < w; i++) {
      a.push(ctx.inputs[`A${i}`] ?? 'X');
      b.push(ctx.inputs[`B${i}`] ?? 'X');
    }
    const op = selectIndex([ctx.inputs.OP0 ?? 'X', ctx.inputs.OP1 ?? 'X', ctx.inputs.OP2 ?? 'X', ctx.inputs.OP3 ?? 'X']);
    const r: Bits = [];
    let co: LogicValue = '0';
    let vf: LogicValue = '0';
    /** CMP: flags are read from the real difference, not the zeroed bus */
    let flagR: Bits | null = null;

    if (op === null) {
      for (let i = 0; i < w; i++) r.push('X');
      co = 'X';
      vf = 'X';
    } else {
      switch (op) {
        case 0: {
          const { sum, carry, carryBeforeMsb } = rippleAdd(a, b, ctx.inputs.CI ?? '0', w);
          sum.forEach((s) => r.push(s));
          co = carry;
          vf = logicXor([carry, carryBeforeMsb]);
          break;
        }
        case 1: {
          // SUB ignores CI: A − B = A + ~B + 1
          const { sum, carry, carryBeforeMsb } = rippleAdd(a, invertBits(b), '1', w);
          sum.forEach((s) => r.push(s));
          co = logicNot(carry); // borrow bar
          vf = logicXor([carry, carryBeforeMsb]);
          break;
        }
        case 2:
          for (let i = 0; i < w; i++) r.push(logicAnd([a[i], b[i]]));
          break;
        case 3:
          for (let i = 0; i < w; i++) r.push(logicOr([a[i], b[i]]));
          break;
        case 4:
          for (let i = 0; i < w; i++) r.push(logicXor([a[i], b[i]]));
          break;
        case 5:
          for (let i = 0; i < w; i++) r.push(logicNot(a[i]));
          break;
        case 6: {
          const one = valueToBits(1, w);
          const { sum, carry, carryBeforeMsb } = rippleAdd(a, one, '0', w);
          sum.forEach((s) => r.push(s));
          co = carry;
          vf = logicXor([carry, carryBeforeMsb]);
          break;
        }
        case 7: {
          const one = valueToBits(1, w);
          const { sum, carry, carryBeforeMsb } = rippleAdd(a, invertBits(one), '1', w);
          sum.forEach((s) => r.push(s));
          co = logicNot(carry);
          vf = logicXor([carry, carryBeforeMsb]);
          break;
        }
        case 8: {
          // CMP: flags come from the real difference, the result bus is
          // forced to zero (the flag bits are read from `flagR` below).
          const { sum } = rippleAdd(a, invertBits(b), '1', w);
          flagR = sum;
          zeroBits(w).forEach((z) => r.push(z));
          break;
        }
        case 9: {
          // SHL: LSB in = CI, MSB out = CO
          r.push(ctx.inputs.CI ?? '0');
          for (let i = 1; i < w; i++) r.push(a[i - 1]);
          co = a[w - 1];
          break;
        }
        case 10: {
          // SHR logical: each bit moves down, CI fills the MSB, LSB out = CO
          for (let i = 0; i < w - 1; i++) r.push(a[i + 1]);
          r.push(ctx.inputs.CI ?? '0');
          co = a[0];
          break;
        }
        case 11: {
          // SAR: like SHR but the sign bit replicates into the MSB
          for (let i = 0; i < w - 1; i++) r.push(a[i + 1]);
          r.push(a[w - 1]);
          co = a[0];
          break;
        }
        case 12:
          for (let i = 0; i < w; i++) r.push(logicNand([a[i], b[i]]));
          break;
        case 13:
          for (let i = 0; i < w; i++) r.push(logicNor([a[i], b[i]]));
          break;
        case 14:
          for (let i = 0; i < w; i++) r.push(logicXnor([a[i], b[i]]));
          break;
        case 15:
          zeroBits(w).forEach((z) => r.push(z));
          break;
      }
    }

    const outputs: Record<string, LogicValue> = {};
    for (let i = 0; i < w; i++) outputs[`R${i}`] = r[i];
    outputs.CO = co;
    // Zero flag: 1 when every result bit is 0; X when any bit is unknown.
    const flagSrc = flagR ?? r;
    let zero: LogicValue = '1';
    let neg: LogicValue = '0';
    for (let i = 0; i < w; i++) {
      if (flagSrc[i] === '1') zero = '0';
      else if (flagSrc[i] === 'X' || flagSrc[i] === 'Z') zero = 'X';
    }
    neg = flagSrc[w - 1] ?? 'X';
    outputs.ZF = zero;
    outputs.NF = neg;
    outputs.VF = vf;
    return { outputs };
  },
};

// ---------------------------------------------------------------------------
// Latches and flip-flops
// ---------------------------------------------------------------------------

/** Map a control input to active/inactive with polarity + X handling. */
function ctrlActive(v: LogicValue, activeLow: boolean): 1 | 0 | null {
  const b = asBit(v);
  if (b === null) return null;
  return (activeLow ? 1 - b : b) as 1 | 0;
}

const latchOutPins = (): DevicePinDef[] => rightPins(['Q', 'QN']);

const srLatchDef: DeviceDef = {
  pins: () => [...leftPins(['S', 'R']), ...latchOutPins()],
  initialState: () => ({ q: '0' }),
  eval: (ctx) => {
    const { params } = ctx;
    const s = ctx.inputs.S ?? 'Z';
    const r = ctx.inputs.R ?? 'Z';
    const sAct = params.activeLow ? logicNot(s) : s;
    const rAct = params.activeLow ? logicNot(r) : r;
    const q = (ctx.state.q as LogicValue) ?? '0';
    let next: LogicValue;
    if (sAct === 'X' || rAct === 'X' || sAct === 'Z' || rAct === 'Z') {
      next = 'X';
    } else if (sAct === '1' && rAct === '1') {
      next = 'X'; // invalid condition (both latches) — warning from kernel
    } else if (sAct === '1') next = '1';
    else if (rAct === '1') next = '0';
    else next = q;
    const invalid = sAct === '1' && rAct === '1';
    return {
      outputs: { Q: next, QN: logicNot(next) },
      state: { q: next },
      warnings: invalid ? ['SR invalid'] : undefined,
    };
  },
};

const dLatchDef: DeviceDef = {
  pins: () => [
    ...leftPins(['D', 'EN']).map((p) =>
      p.name === 'EN' ? { ...p, control: true } : p,
    ),
    ...latchOutPins(),
  ],
  initialState: () => ({ q: '0' }),
  eval: (ctx) => {
    const d = ctx.inputs.D ?? 'Z';
    const en = ctx.inputs.EN ?? '0';
    const q = (ctx.state.q as LogicValue) ?? '0';
    let next: LogicValue;
    if (en === '1') next = d === 'Z' ? 'X' : d;
    else if (en === 'X') next = 'X';
    else next = q;
    return { outputs: { Q: next, QN: logicNot(next) }, state: { q: next } };
  },
};

interface FfState extends DeviceState {
  q: LogicValue;
  /** sim time of the last active clock edge (hold-time checks) */
  edgeAt?: number;
  /** the edge whose hold window was already evaluated (one-shot check) */
  holdCheckedAt?: number;
}

/** Shared edge-triggered flip-flop machinery: async preset/clear, edge
 * detection, setup/hold violation + metastability approximation. */
function edgeFlopEval(
  ctx: DeviceEvalCtx,
  sample: (q: LogicValue) => { next: LogicValue; warn?: string },
): DeviceEvalResult {
  const { params } = ctx;
  const st = ctx.state as FfState;
  const q = st.q ?? '0';
  const clk = ctx.inputs.CLK ?? 'Z';
  const prevClk = ctx.prevInputs.CLK ?? 'Z';

  // Asynchronous preset / clear: override everything (both = invalid).
  const pre = ctrlActive(ctx.inputs.PRE ?? 'Z', params.activeLow);
  const clr = ctrlActive(ctx.inputs.CLR ?? 'Z', params.activeLow);
  if (pre === 1 && clr === 1) {
    return {
      outputs: { Q: 'X', QN: 'X' },
      state: { q: 'X' as LogicValue },
      warnings: ['PRE/CLR both active'],
    };
  }
  if (pre === 1) return { outputs: { Q: '1', QN: '0' }, state: { q: '1' as LogicValue } };
  if (clr === 1) return { outputs: { Q: '0', QN: '1' }, state: { q: '0' as LogicValue } };

  const rising = params.edge === 'rising';
  const triggered = ctx.timing
    ? rising
      ? prevClk === '0' && clk === '1'
      : prevClk === '1' && clk === '0'
    : false;

  // Power-up exemption: during the first few steps every driver's voltage
  // appears at once, so the first clock edge always coincides with every
  // input's first classified change. That is not a real setup/hold
  // violation — checks engage only after the circuit has settled in.
  const pastPowerUp = ctx.t > 6 * ctx.dt;

  if (!triggered) {
    // Hold-time check: data changed within one timestep after the edge.
    // ONE-SHOT per edge — the condition (dAt − edgeAt ≤ dt) stays true
    // forever once satisfied, so without the guard the violation would
    // re-fire on every subsequent evaluation.
    const edge = st.edgeAt ?? -Infinity;
    const alreadyChecked = st.holdCheckedAt === st.edgeAt;
    if (pastPowerUp && !alreadyChecked && edge > 0) {
      const dAt = ctx.inputChangedAt.D ?? ctx.inputChangedAt.J ?? ctx.inputChangedAt.T ?? ctx.inputChangedAt.S ?? -Infinity;
      const kAt = ctx.inputChangedAt.K;
      const changedAfterEdge = dAt > edge && dAt - edge <= ctx.dt;
      const kAfter =
        kAt !== undefined && kAt > edge && kAt - edge <= ctx.dt;
      if (changedAfterEdge || kAfter) {
        return {
          outputs: { Q: 'X', QN: 'X' },
          state: { q: 'X' as LogicValue, edgeAt: st.edgeAt, holdCheckedAt: st.edgeAt },
          violation: true,
          metastable: 5 * ctx.dt,
        };
      }
      return {
        outputs: { Q: q, QN: logicNot(q) },
        state: { ...st, holdCheckedAt: st.edgeAt },
      };
    }
    return { outputs: { Q: q, QN: logicNot(q) }, state: st };
  }

  // Setup check: data moved on the same simulation step as the edge.
  const dataAt = ctx.inputChangedAt.D ?? ctx.inputChangedAt.J ?? ctx.inputChangedAt.T ?? ctx.inputChangedAt.S ?? -Infinity;
  const kDataAt = ctx.inputChangedAt.K;
  const sameStep =
    pastPowerUp &&
    (ctx.t - dataAt <= ctx.dt ||
      (kDataAt !== undefined && ctx.t - kDataAt <= ctx.dt));
  const newState: FfState = { q: q, edgeAt: ctx.t };
  if (sameStep) {
    newState.q = 'X';
    return {
      outputs: { Q: 'X', QN: 'X' },
      state: newState,
      violation: true,
      metastable: 5 * ctx.dt,
    };
  }
  const { next, warn } = sample(q);
  newState.holdCheckedAt = ctx.t;
  newState.q = next;
  return {
    outputs: { Q: next, QN: logicNot(next) },
    state: newState,
    warnings: warn ? [warn] : undefined,
  };
}

const dFlipFlopDef: DeviceDef = {
  pins: () => [
    ...leftPins(['D', 'CLK']),
    ...topBottomPair('PRE', 'CLR'),
    ...latchOutPins(),
  ],
  initialState: () => ({ q: '0' }),
  eval: (ctx) =>
    edgeFlopEval(ctx, () => {
      const d = ctx.inputs.D ?? 'Z';
      return { next: d === 'Z' ? 'X' : d };
    }),
};

const jkFlipFlopDef: DeviceDef = {
  pins: () => [
    ...leftPins(['J', 'K', 'CLK']),
    ...topBottomPair('PRE', 'CLR'),
    ...latchOutPins(),
  ],
  initialState: () => ({ q: '0' }),
  eval: (ctx) =>
    edgeFlopEval(ctx, (q) => {
      const j = ctx.inputs.J ?? 'Z';
      const k = ctx.inputs.K ?? 'Z';
      if (j === 'Z') return { next: 'X' };
      if (k === 'Z') return { next: 'X' };
      if (j === 'X' || k === 'X') return { next: 'X' };
      if (j === '0' && k === '0') return { next: q };
      if (j === '1' && k === '0') return { next: '1' };
      if (j === '0' && k === '1') return { next: '0' };
      return { next: logicNot(q) };
    }),
};

const tFlipFlopDef: DeviceDef = {
  pins: () => [
    ...leftPins(['T', 'CLK']),
    ...topBottomPair('PRE', 'CLR'),
    ...latchOutPins(),
  ],
  initialState: () => ({ q: '0' }),
  eval: (ctx) =>
    edgeFlopEval(ctx, (q) => {
      const tv = ctx.inputs.T ?? 'Z';
      if (tv === 'Z' || tv === 'X') return { next: 'X' };
      return { next: tv === '1' ? logicNot(q) : q };
    }),
};

const srFlipFlopDef: DeviceDef = {
  pins: () => [
    ...leftPins(['S', 'R', 'CLK']),
    ...topBottomPair('PRE', 'CLR'),
    ...latchOutPins(),
  ],
  initialState: () => ({ q: '0' }),
  // The invalid S=R=1 condition is sampled at the active edge and reported
  // through edgeFlopEval's warning channel.
  eval: (ctx) =>
    edgeFlopEval(ctx, (q) => {
      const s = ctx.inputs.S ?? 'Z';
      const r = ctx.inputs.R ?? 'Z';
      if (s === 'Z' || r === 'Z' || s === 'X' || r === 'X') return { next: 'X' };
      if (s === '1' && r === '1') return { next: 'X', warn: 'SR invalid' };
      if (s === '1') return { next: '1' };
      if (r === '1') return { next: '0' };
      return { next: q };
    }),
};

// ---------------------------------------------------------------------------
// Registers / shift registers / counters
// ---------------------------------------------------------------------------

function registerPins(p: DigitalCompParams): DevicePinDef[] {
  const w = p.width;
  const pins = leftPins([
    ...Array.from({ length: w }, (_, i) => `D${i}`),
    'CLK',
    'EN',
    'CLR',
  ]);
  for (const pin of pins) {
    if (pin.name === 'EN' || pin.name === 'CLR') pin.control = true;
  }
  return [...pins, ...rightPins(Array.from({ length: w }, (_, i) => `Q${i}`))];
}

const registerDef: DeviceDef = {
  pins: registerPins,
  initialState: (p) => ({ q: zeroBits(p.width) }),
  eval: (ctx) => {
    const w = ctx.params.width;
    const st = (ctx.state.q as Bits) ?? zeroBits(w);
    // Async clear (active high by default).
    const clr = ctrlActive(ctx.inputs.CLR ?? 'Z', ctx.params.activeLow);
    if (clr === 1) {
      const q = zeroBits(w);
      return { outputs: outBits(q, w), state: { q } };
    }
    if (clr === null) {
      const q = allX(w);
      return { outputs: outBits(q, w), state: { q } };
    }
    const clk = ctx.inputs.CLK ?? 'Z';
    const prevClk = ctx.prevInputs.CLK ?? 'Z';
    const triggered =
      ctx.params.edge === 'rising'
        ? prevClk === '0' && clk === '1'
        : prevClk === '1' && clk === '0';
    if (!triggered) return { outputs: outBits(st, w), state: { q: st } };

    const en = ctx.inputs.EN ?? '0';
    let q: Bits;
    if (en === '1') {
      q = Array.from({ length: w }, (_, i) => {
        const d = ctx.inputs[`D${i}`] ?? 'Z';
        return d === 'Z' ? 'X' : d;
      });
    } else if (en === 'X') {
      q = allX(w);
    } else {
      q = st;
    }
    return { outputs: outBits(q, w), state: { q } };
  },
};

function outBits(q: Bits, w: number): Record<string, LogicValue> {
  const o: Record<string, LogicValue> = {};
  for (let i = 0; i < w; i++) o[`Q${i}`] = q[i];
  return o;
}

function allX(w: number): Bits {
  return new Array(w).fill('X') as Bits;
}

function shiftPins(p: DigitalCompParams): DevicePinDef[] {
  const w = p.width;
  const mode = p.shiftMode;
  const names: string[] = [];
  if (mode === 'piso' || mode === 'pipo') {
    for (let i = 0; i < w; i++) names.push(`D${i}`);
  }
  names.push('SER', 'SL', 'CLK', 'EN', 'CLR');
  const pins = leftPins(names);
  for (const pin of pins) {
    if (pin.name === 'SL' || pin.name === 'EN' || pin.name === 'CLR') pin.control = true;
  }
  const outs: string[] = [];
  if (mode === 'siso' || mode === 'piso') outs.push('QSER');
  else for (let i = 0; i < w; i++) outs.push(`Q${i}`);
  return [...pins, ...rightPins(outs)];
}

const shiftRegisterDef: DeviceDef = {
  pins: shiftPins,
  initialState: (p) => ({ q: zeroBits(p.width) }),
  eval: (ctx) => {
    const { params } = ctx;
    const w = params.width;
    const mode = params.shiftMode;
    const st = (ctx.state.q as Bits) ?? zeroBits(w);
    const clr = ctrlActive(ctx.inputs.CLR ?? 'Z', ctx.params.activeLow);
    if (clr === 1) {
      const q = zeroBits(w);
      return { outputs: shiftOutputs(q, mode, w), state: { q } };
    }
    const clk = ctx.inputs.CLK ?? 'Z';
    const prevClk = ctx.prevInputs.CLK ?? 'Z';
    const triggered =
      params.edge === 'rising' ? prevClk === '0' && clk === '1' : prevClk === '1' && clk === '0';
    if (!triggered) return { outputs: shiftOutputs(st, mode, w), state: { q: st } };

    const en = ctx.inputs.EN ?? '0';
    if (en === 'X') {
      const q = allX(w);
      return { outputs: shiftOutputs(q, mode, w), state: { q } };
    }
    if (en !== '1') return { outputs: shiftOutputs(st, mode, w), state: { q: st } };

    const sl = ctx.inputs.SL ?? '0';
    const serIn = ctx.inputs.SER ?? '0';
    if ((mode === 'piso' || mode === 'pipo') && sl === '1') {
      const q: Bits = Array.from({ length: w }, (_, i) => {
        const d = ctx.inputs[`D${i}`] ?? 'Z';
        return d === 'Z' ? 'X' : d;
      });
      return { outputs: shiftOutputs(q, mode, w), state: { q } };
    }
    if (sl === 'X') {
      const q = allX(w);
      return { outputs: shiftOutputs(q, mode, w), state: { q } };
    }

    // Shift one position. Serial-in for piso shift mode is SER (always
    // present on the symbol); documented simplification.
    let q: Bits;
    if (params.shiftDirection === 'right') {
      q = [serIn, ...st.slice(0, w - 1)];
    } else {
      q = [...st.slice(1), serIn];
    }
    return { outputs: shiftOutputs(q, mode, w), state: { q } };
  },
};

function shiftOutputs(
  q: Bits,
  mode: string,
  w: number,
): Record<string, LogicValue> {
  if (mode === 'siso' || mode === 'piso') {
    // Serial out: the bit that would fall off next (right shift → MSB).
    return { QSER: q[w - 1] };
  }
  return outBits(q, w);
}

function counterPins(p: DigitalCompParams): DevicePinDef[] {
  const w = p.width;
  const mode = p.counterMode;
  if (mode === 'ring' || mode === 'johnson') {
    const pins = leftPins(['CLK', 'EN', 'CLR']);
    for (const pin of pins) if (pin.name !== 'CLK') pin.control = true;
    return [...pins, ...rightPins(Array.from({ length: w }, (_, i) => `Q${i}`))];
  }
  const names: string[] = [];
  for (let i = 0; i < w; i++) names.push(`D${i}`);
  names.push('LOAD', 'CLK', 'EN', 'CLR');
  if (mode === 'updown') names.push('UD');
  const pins = leftPins(names);
  for (const pin of pins) {
    if (pin.name === 'LOAD' || pin.name === 'EN' || pin.name === 'CLR' || pin.name === 'UD') {
      pin.control = true;
    }
  }
  return [
    ...pins,
    ...rightPins([...Array.from({ length: w }, (_, i) => `Q${i}`), 'RCO']),
  ];
}

function counterResetState(p: DigitalCompParams): DeviceState {
  if (p.counterMode === 'ring') return { q: oneHot(p.width) };
  return { q: zeroBits(p.width) };
}

const counterDef: DeviceDef = {
  pins: counterPins,
  initialState: counterResetState,
  eval: (ctx) => {
    const { params } = ctx;
    const w = params.width;
    const mode = params.counterMode;
    const st = (ctx.state.q as Bits) ?? zeroBits(w);
    const clr = ctrlActive(ctx.inputs.CLR ?? 'Z', ctx.params.activeLow);
    if (clr === 1) {
      const q = counterResetState(params).q as Bits;
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }
    const clk = ctx.inputs.CLK ?? 'Z';
    const prevClk = ctx.prevInputs.CLK ?? 'Z';
    const triggered =
      params.edge === 'rising' ? prevClk === '0' && clk === '1' : prevClk === '1' && clk === '0';
    if (!triggered) {
      return { outputs: counterOutputs(st, mode, w, ctx, undefined), state: { q: st } };
    }
    const en = ctx.inputs.EN ?? '0';
    if (en === 'X') {
      const q = allX(w);
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }
    if (en !== '1') {
      return { outputs: counterOutputs(st, mode, w, ctx, undefined), state: { q: st } };
    }

    if (mode === 'ring') {
      const q =
        params.shiftDirection === 'right'
          ? [st[w - 1], ...st.slice(0, w - 1)]
          : [...st.slice(1), st[0]];
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }
    if (mode === 'johnson') {
      const q =
        params.shiftDirection === 'right'
          ? [logicNot(st[w - 1]), ...st.slice(0, w - 1)]
          : [...st.slice(1), logicNot(st[0])];
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }

    // Binary counting modes.
    const load = ctrlActive(ctx.inputs.LOAD ?? 'Z', ctx.params.activeLow);
    if (load === 1) {
      const q: Bits = Array.from({ length: w }, (_, i) => {
        const d = ctx.inputs[`D${i}`] ?? 'Z';
        return d === 'Z' ? 'X' : d;
      });
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }
    let direction: 1 | -1 | null = 1;
    if (mode === 'down') direction = -1;
    if (mode === 'updown') {
      const ud = ctx.inputs.UD ?? 'Z';
      if (ud === '1') direction = 1;
      else if (ud === '0') direction = -1;
      else direction = null;
    }
    if (direction === null) {
      const q = allX(w);
      return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
    }
    const v = bitsToValue(st);
    let q: Bits;
    if (v === null) {
      // Once the count is unknown it stays unknown until loaded or cleared.
      q = allX(w);
    } else {
      const next = (v + direction + (1 << w)) % (1 << w);
      q = valueToBits(next, w);
    }
    return { outputs: counterOutputs(q, mode, w, ctx, '0'), state: { q } };
  },
};

function counterOutputs(
  q: Bits,
  mode: string,
  w: number,
  ctx: DeviceEvalCtx,
  rcoDefault: LogicValue | undefined,
): Record<string, LogicValue> {
  const o = outBits(q, w);
  if (mode === 'ring' || mode === 'johnson') return o;
  // Terminal count: all ones (up) / all zeros (down) while enabled.
  const en = ctx.inputs.EN ?? '0';
  const v = bitsToValue(q);
  let rco: LogicValue = rcoDefault ?? '0';
  if (rco === '0' && en === '1' && v !== null) {
    const up = mode !== 'down' && !(mode === 'updown' && (ctx.inputs.UD ?? '1') === '0');
    const atEnd = up ? v === (1 << w) - 1 : v === 0;
    rco = atEnd ? '1' : '0';
  }
  o.RCO = rco;
  return o;
}

// ---------------------------------------------------------------------------
// BCD → seven-segment decoder
// ---------------------------------------------------------------------------

/** Active-high segment patterns, bits = a,b,c,d,e,f,g. */
const SEG_PATTERNS: number[] = [
  0b0111111, // 0
  0b0000110, // 1
  0b1011011, // 2
  0b1001111, // 3
  0b1100110, // 4
  0b1101101, // 5
  0b1111101, // 6
  0b0000111, // 7
  0b1111111, // 8
  0b1101111, // 9
  0b1110111, // A
  0b0011111, // b
  0b1001110, // C
  0b0111101, // d
  0b1001111, // E
  0b1000111, // F
];

const SEG_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const bcdDecoderDef: DeviceDef = {
  pins: () => [
    ...leftPins(['B0', 'B1', 'B2', 'B3']),
    ...rightPins([...SEG_NAMES]),
  ],
  eval: (ctx) => {
    const bits: LogicValue[] = [
      ctx.inputs.B0 ?? 'X',
      ctx.inputs.B1 ?? 'X',
      ctx.inputs.B2 ?? 'X',
      ctx.inputs.B3 ?? 'X',
    ];
    const outputs: Record<string, LogicValue> = {};
    const v = bitsToValue(bits);
    const anode = ctx.params.commonType === 'common-anode';
    const on = anode ? '0' : '1';
    const off = anode ? '1' : '0';
    if (v === null) {
      for (const s of SEG_NAMES) outputs[s] = 'X';
      return { outputs };
    }
    let pattern: number | null = SEG_PATTERNS[v] ?? null;
    if (v > 9 && !ctx.params.hexMode) {
      // Invalid BCD: blank the display (4511-style), never reinterpret
      // as hexadecimal unless hex mode is explicitly enabled.
      pattern = null;
    }
    for (let i = 0; i < 7; i++) {
      const bitOn = pattern !== null && ((pattern >> i) & 1) === 1;
      outputs[SEG_NAMES[i]] = bitOn ? on : off;
    }
    return {
      outputs,
      warnings:
        v > 9 && !ctx.params.hexMode ? ['Invalid BCD input blanked'] : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Sources / sinks
// ---------------------------------------------------------------------------

const logicInputDef: DeviceDef = {
  pins: () => rightPins(['OUT']),
  eval: (ctx) => ({
    outputs: { OUT: ctx.params.value === 1 ? '1' : '0' },
  }),
};

const logicOutputDef: DeviceDef = {
  pins: () => leftPins(['IN']),
  // A pure measurement sink: no outputs to drive. The kernel exposes the
  // classified input through the component telemetry instead.
  eval: () => ({ outputs: {} }),
};

const clockGeneratorDef: DeviceDef = {
  pins: () => rightPins(['CK']),
  eval: () => ({ outputs: {} }),
  timeDriven: true,
};

/**
 * Seven-segment display: NOT a kernel device (it is purely electrical —
 * eight segment diodes + a common terminal), but it needs a pin layout so
 * terminals, wires and topology index the same ordered pin list as
 * everything else: A,B,C,D,E,F,G,DP then COM.
 */
const sevenSegDisplayDef: DeviceDef = {
  pins: () => [
    ...leftPins(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']),
    { name: 'COM', dir: 'in', x: 0, y: 90, dx: 0, dy: 1 },
  ],
  eval: () => ({ outputs: {} }),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const DEFS: Partial<Record<ComponentType, DeviceDef>> = {
  'and-gate': gateDef((list) => logicAnd(list)),
  'or-gate': gateDef((list) => logicOr(list)),
  'not-gate': gateDef((list) => logicNot(list[0] ?? 'Z')),
  'nand-gate': gateDef((list) => logicNand(list)),
  'nor-gate': gateDef((list) => logicNor(list)),
  'xor-gate': gateDef((list) => logicXor(list)),
  'xnor-gate': gateDef((list) => logicXnor(list)),
  'buffer-gate': gateDef((list) => logicBuf(list[0] ?? 'Z')),
  multiplexer: muxDef,
  demultiplexer: demuxDef,
  decoder: decoderDef,
  encoder: encoderDef,
  'half-adder': {
    pins: () => [...leftPins(['A', 'B']), ...rightPins(['S', 'C'])],
    eval: (ctx) => ({
      outputs: {
        S: logicXor([ctx.inputs.A ?? 'Z', ctx.inputs.B ?? 'Z']),
        C: logicAnd([ctx.inputs.A ?? 'Z', ctx.inputs.B ?? 'Z']),
      },
    }),
  },
  'full-adder': {
    pins: () => [...leftPins(['A', 'B', 'CI']), ...rightPins(['S', 'CO'])],
    eval: (ctx) => {
      const a = ctx.inputs.A ?? 'Z';
      const b = ctx.inputs.B ?? 'Z';
      const ci = ctx.inputs.CI ?? 'Z';
      return {
        outputs: {
          S: logicXor([a, b, ci]),
          CO: logicMajority(a, b, ci),
        },
      };
    },
  },
  adder: adderDef([{ name: 'CI', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0 }], ['CO', 'OV'], 'add'),
  subtractor: adderDef([{ name: 'BIN', dir: 'in', x: IN_X, y: 0, dx: -1, dy: 0 }], ['BO', 'OV'], 'sub'),
  comparator: comparatorDef,
  alu: aluDef,
  'sr-latch': srLatchDef,
  'd-latch': dLatchDef,
  'd-flip-flop': dFlipFlopDef,
  'jk-flip-flop': jkFlipFlopDef,
  't-flip-flop': tFlipFlopDef,
  'sr-flip-flop': srFlipFlopDef,
  register: registerDef,
  'shift-register': shiftRegisterDef,
  counter: counterDef,
  'bcd-to-seven-segment-decoder': bcdDecoderDef,
  'seven-segment-display': sevenSegDisplayDef,
  'logic-input': logicInputDef,
  'logic-output': logicOutputDef,
  'clock-generator': clockGeneratorDef,
};

export function getDeviceDef(type: ComponentType): DeviceDef | null {
  return DEFS[type] ?? null;
}

/** Convenience for symbol rendering: pin list of a component instance. */
export function devicePins(type: ComponentType, params: DigitalCompParams): DevicePinDef[] {
  const def = DEFS[type];
  return def ? def.pins(params) : [];
}

/** Gate input count used by the Inspector to advertise options. */
export function gateAllowsInputCount(type: ComponentType): boolean {
  return isGateType(type) && type !== 'not-gate' && type !== 'buffer-gate';
}
