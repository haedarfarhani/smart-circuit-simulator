/**
 * Device truth-table tests: every combinational device over its full input
 * space (including X/Z), sequential behaviour over clock edges, reset /
 * load / shift / count sequences. These exercise the pure eval functions —
 * the kernel and electrical integration are covered separately.
 */
import { describe, expect, it } from 'vitest';
import {
  getDeviceDef,
  type DeviceEvalCtx,
  type DeviceEvalResult,
} from './devices';
import { resolveDigitalCompParams, type DigitalCompParams } from './types';
import type { CircuitComponent, ComponentType } from '../../models/circuit';
import type { LogicValue } from './logic';

const mkComp = (
  type: ComponentType,
  extra: Partial<CircuitComponent> = {},
): CircuitComponent => ({
  id: 't',
  type,
  x: 0,
  y: 0,
  rotation: 0,
  label: 'T',
  value: 0,
  ...extra,
});

interface EvalOpts {
  inputs?: Record<string, LogicValue>;
  prevInputs?: Record<string, LogicValue>;
  state?: Record<string, unknown>;
  inputChangedAt?: Record<string, number>;
  t?: number;
  dt?: number;
  timing?: boolean;
  comp?: Partial<CircuitComponent>;
}

function evalDevice(
  type: ComponentType,
  opts: EvalOpts = {},
): { result: DeviceEvalResult; params: DigitalCompParams } {
  const comp = mkComp(type, opts.comp ?? {});
  const params = resolveDigitalCompParams(comp);
  const def = getDeviceDef(type)!;
  const inputs = opts.inputs ?? {};
  const ctx: DeviceEvalCtx = {
    params,
    inputs,
    list: Object.keys(inputs).map((k) => inputs[k]),
    prevInputs: opts.prevInputs ?? inputs,
    inputChangedAt: opts.inputChangedAt ?? {},
    state: opts.state ?? def.initialState?.(params) ?? {},
    t: opts.t ?? 1e-3,
    dt: opts.dt ?? 1e-4,
    timing: opts.timing ?? true,
  };
  return { result: def.eval(ctx), params };
}

const out = (r: DeviceEvalResult, name: string): LogicValue =>
  r.outputs[name] ?? 'MISSING';

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe('gate devices', () => {
  it('AND gate: full 2-input truth table', () => {
    expect(out(evalDevice('and-gate', { inputs: { IN0: '0', IN1: '0' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('and-gate', { inputs: { IN0: '0', IN1: '1' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('and-gate', { inputs: { IN0: '1', IN1: '0' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('and-gate', { inputs: { IN0: '1', IN1: '1' } }).result, 'OUT')).toBe('1');
  });

  it('3-input AND configurable', () => {
    const r = evalDevice('and-gate', {
      inputs: { IN0: '1', IN1: '1', IN2: '1' },
      comp: { inputCount: 3 },
    });
    expect(out(r.result, 'OUT')).toBe('1');
    expect(r.params.inputCount).toBe(3);
  });

  it('OR / NAND / NOR / XOR / XNOR truth tables', () => {
    expect(out(evalDevice('or-gate', { inputs: { IN0: '0', IN1: '1' } }).result, 'OUT')).toBe('1');
    expect(out(evalDevice('or-gate', { inputs: { IN0: '0', IN1: '0' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('nand-gate', { inputs: { IN0: '1', IN1: '1' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('nand-gate', { inputs: { IN0: '0', IN1: '1' } }).result, 'OUT')).toBe('1');
    expect(out(evalDevice('nor-gate', { inputs: { IN0: '1', IN1: '0' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('nor-gate', { inputs: { IN0: '0', IN1: '0' } }).result, 'OUT')).toBe('1');
    expect(out(evalDevice('xor-gate', { inputs: { IN0: '1', IN1: '0' } }).result, 'OUT')).toBe('1');
    expect(out(evalDevice('xor-gate', { inputs: { IN0: '1', IN1: '1' } }).result, 'OUT')).toBe('0');
    expect(out(evalDevice('xnor-gate', { inputs: { IN0: '1', IN1: '1' } }).result, 'OUT')).toBe('1');
  });

  it('X propagates through gates', () => {
    expect(out(evalDevice('and-gate', { inputs: { IN0: 'X', IN1: '1' } }).result, 'OUT')).toBe('X');
    expect(out(evalDevice('xor-gate', { inputs: { IN0: 'Z', IN1: '0' } }).result, 'OUT')).toBe('X');
    expect(out(evalDevice('not-gate', { inputs: { IN0: 'X' } }).result, 'OUT')).toBe('X');
  });
});

// ---------------------------------------------------------------------------
// Multiplexer / demultiplexer / decoder / encoder
// ---------------------------------------------------------------------------

describe('multiplexer', () => {
  it('4:1 selects the addressed input (spec §5.1)', () => {
    const inputs: Record<string, LogicValue> = { D0: '1', D1: '0', D2: '1', D3: '0', S0: '0', S1: '0' };
    expect(out(evalDevice('multiplexer', { inputs }).result, 'Y')).toBe('1');
    expect(out(evalDevice('multiplexer', { inputs: { ...inputs, S0: '1' } }).result, 'Y')).toBe('0');
    expect(out(evalDevice('multiplexer', { inputs: { ...inputs, S0: '1', S1: '1' } }).result, 'Y')).toBe('0');
    expect(out(evalDevice('multiplexer', { inputs: { ...inputs, S1: '1' } }).result, 'Y')).toBe('1');
  });

  it('UNKNOWN select lines give an UNKNOWN output', () => {
    const r = evalDevice('multiplexer', {
      inputs: { D0: '1', D1: '0', D2: '1', D3: '0', S0: 'X', S1: '0' },
    });
    expect(out(r.result, 'Y')).toBe('X');
  });

  it('2:1 and 8:1 sizes configure the pin count', () => {
    const two = evalDevice('multiplexer', {
      inputs: { D0: '0', D1: '1', S0: '1' },
      comp: { inputCount: 2 },
    });
    expect(out(two.result, 'Y')).toBe('1');
    const eight = evalDevice('multiplexer', {
      inputs: { D5: '1', S0: '1', S1: '0', S2: '1' },
      comp: { inputCount: 8 },
    });
    expect(out(eight.result, 'Y')).toBe('1');
  });
});

describe('demultiplexer', () => {
  it('routes the data input to the selected output only', () => {
    const inputs: Record<string, LogicValue> = { D: '1', S0: '0', S1: '1' }; // → Y2 (S1 is bit 1)
    const r = evalDevice('demultiplexer', { inputs }).result;
    expect(out(r, 'Y2')).toBe('1');
    expect(out(r, 'Y0')).toBe('0');
    expect(out(r, 'Y1')).toBe('0');
    expect(out(r, 'Y3')).toBe('0');
  });

  it('X select → all outputs X (spec §5.2 UNKNOWN behaviour)', () => {
    const r = evalDevice('demultiplexer', { inputs: { D: '1', S0: 'X', S1: '0' } }).result;
    expect(out(r, 'Y0')).toBe('X');
    expect(out(r, 'Y3')).toBe('X');
  });
});

describe('decoder (spec §5.3)', () => {
  it('3-to-8 activates exactly the addressed output', () => {
    const inputs: Record<string, LogicValue> = { S0: '1', S1: '0', S2: '1', EN: '1' }; // → Y5
    const r = evalDevice('decoder', { inputs, comp: { inputCount: 3 } }).result;
    expect(out(r, 'Y5')).toBe('1');
    for (let i = 0; i < 8; i++) {
      if (i !== 5) expect(out(r, `Y${i}`)).toBe('0');
    }
  });

  it('disabled → all outputs inactive', () => {
    const r = evalDevice('decoder', {
      inputs: { S0: '0', S1: '0', S2: '0', EN: '0' },
      comp: { inputCount: 3 },
    }).result;
    expect(out(r, 'Y0')).toBe('0');
  });

  it('active-LOW outputs invert', () => {
    const r = evalDevice('decoder', {
      inputs: { S0: '1', S1: '0', EN: '1' },
      comp: { inputCount: 2, activeLow: true },
    }).result;
    expect(out(r, 'Y1')).toBe('0');
    expect(out(r, 'Y0')).toBe('1');
  });

  it('X select → X outputs', () => {
    const r = evalDevice('decoder', {
      inputs: { S0: 'X', S1: '0', EN: '1' },
      comp: { inputCount: 2 },
    }).result;
    expect(out(r, 'Y0')).toBe('X');
  });
});

describe('encoder (spec §5.4)', () => {
  it('standard encoder encodes a single active input', () => {
    const r = evalDevice('encoder', {
      inputs: { D3: '1' },
      comp: { inputCount: 8, priority: false },
    }).result;
    expect(out(r, 'Y0')).toBe('1');
    expect(out(r, 'Y1')).toBe('1');
    expect(out(r, 'Y2')).toBe('0');
    expect(out(r, 'V')).toBe('1');
  });

  it('standard encoder with no input → V = 0', () => {
    const r = evalDevice('encoder', {
      inputs: {},
      comp: { inputCount: 8, priority: false },
    }).result;
    expect(out(r, 'V')).toBe('0');
  });

  it('standard encoder with multiple active inputs → X', () => {
    const r = evalDevice('encoder', {
      inputs: { D1: '1', D4: '1' },
      comp: { inputCount: 8, priority: false },
    }).result;
    expect(out(r, 'V')).toBe('X');
    expect(out(r, 'Y0')).toBe('X');
  });

  it('priority encoder: highest index wins (spec §5.4 priority)', () => {
    const r = evalDevice('encoder', {
      inputs: { D1: '1', D4: '1', D6: '1' },
      comp: { inputCount: 8, priority: true },
    }).result;
    expect(out(r, 'Y2')).toBe('1');
    expect(out(r, 'Y1')).toBe('1');
    expect(out(r, 'Y0')).toBe('0');
    expect(out(r, 'V')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Adders / subtractor / comparator
// ---------------------------------------------------------------------------

const bit = (b: number): LogicValue => (b === 1 ? '1' : '0');
const bits = (n: number, w: number): Record<string, LogicValue> =>
  Object.fromEntries(
    Array.from({ length: w }, (_, i) => [`A${i}`, bit((n >> i) & 1)]),
  );
const bbits = (n: number, w: number): Record<string, LogicValue> =>
  Object.fromEntries(
    Array.from({ length: w }, (_, i) => [`B${i}`, bit((n >> i) & 1)]),
  );

function adderOut(type: 'adder' | 'subtractor', a: number, b: number, w = 4, ci = '0') {
  const r = evalDevice(type, {
    inputs: { ...bits(a, w), ...bbits(b, w), [type === 'adder' ? 'CI' : 'BIN']: ci as LogicValue },
    comp: { width: w },
  }).result;
  let sum = 0;
  for (let i = 0; i < w; i++) if (out(r, `R${i}`) === '1') sum += 1 << i;
  return { sum, carry: out(r, type === 'adder' ? 'CO' : 'BO'), ovf: out(r, 'OV') };
}

describe('multi-bit adder (spec §5.7)', () => {
  it('adds two 4-bit numbers with carry-out', () => {
    expect(adderOut('adder', 3, 4).sum).toBe(7);
    expect(adderOut('adder', 3, 4).carry).toBe('0');
    expect(adderOut('adder', 9, 8).sum).toBe(1); // 17 mod 16
    expect(adderOut('adder', 9, 8).carry).toBe('1');
  });

  it('carry-in propagates (ripple)', () => {
    expect(adderOut('adder', 2, 3, 4, '1').sum).toBe(6);
  });

  it('carry-out is NOT the signed overflow flag (spec: distinguish)', () => {
    // 7 + 1 = 8: carry-out 0, but signed 0111 + 0001 overflows → OV = 1
    const r = adderOut('adder', 7, 1);
    expect(r.carry).toBe('0');
    expect(r.ovf).toBe('1');
    // 8 + 8 = 0 mod 16: carry-out 1, signed -8 + -8 overflows → OV = 1
    const r2 = adderOut('adder', 8, 8);
    expect(r2.carry).toBe('1');
    expect(r2.ovf).toBe('1');
    // 1 + 2 = 3: neither
    const r3 = adderOut('adder', 1, 2);
    expect(r3.carry).toBe('0');
    expect(r3.ovf).toBe('0');
  });

  it('X input propagates through the carry chain', () => {
    const r = evalDevice('adder', {
      inputs: { A0: '1', A1: 'X', A2: '0', A3: '0', B0: '1', B1: '0', B2: '0', B3: '0', CI: '0' },
      comp: { width: 4 },
    }).result;
    expect(out(r, 'R0')).toBe('0'); // 1+1 resolved by carry
    expect(out(r, 'R1')).toBe('X');
  });
});

describe('subtractor (spec §5.8)', () => {
  it('computes A − B with borrow', () => {
    expect(adderOut('subtractor', 7, 3).sum).toBe(4);
    expect(adderOut('subtractor', 7, 3).carry).toBe('0'); // no borrow
    expect(adderOut('subtractor', 3, 7).sum).toBe(12); // 3-7 = -4 mod 16
    expect(adderOut('subtractor', 3, 7).carry).toBe('1'); // borrow out
  });
});

describe('comparator (spec §5.9)', () => {
  it('compares A > B, A = B, A < B', () => {
    const mk = (a: number, b: number) =>
      evalDevice('comparator', {
        inputs: { ...bits(a, 4), ...bbits(b, 4) },
        comp: { width: 4 },
      }).result;
    expect(out(mk(9, 4), 'GT')).toBe('1');
    expect(out(mk(9, 4), 'EQ')).toBe('0');
    expect(out(mk(9, 4), 'LT')).toBe('0');
    expect(out(mk(4, 4), 'EQ')).toBe('1');
    expect(out(mk(2, 9), 'LT')).toBe('1');
  });

  it('X above the highest known difference → X result', () => {
    const r = evalDevice('comparator', {
      inputs: { A3: 'X', A2: '0', A1: '1', A0: '0', B3: '1', B2: '0', B1: '0', B0: '0' },
      comp: { width: 4 },
    }).result;
    expect(out(r, 'GT')).toBe('X');
    expect(out(r, 'EQ')).toBe('X');
  });
});

// ---------------------------------------------------------------------------
// ALU (spec §5.10)
// ---------------------------------------------------------------------------

function aluEval(a: number, b: number, op: number, w = 4, ci = '0') {
  const opBits: Record<string, LogicValue> = {};
  for (let i = 0; i < 4; i++) opBits[`OP${i}`] = bit((op >> i) & 1);
  return evalDevice('alu', {
    inputs: { ...bits(a, w), ...bbits(b, w), ...opBits, CI: ci as LogicValue },
    comp: { width: w },
  }).result;
}

describe('ALU', () => {
  const read = (r: DeviceEvalResult, w = 4): number => {
    let v = 0;
    for (let i = 0; i < w; i++) if (out(r, `R${i}`) === '1') v += 1 << i;
    return v;
  };

  it('arithmetic and logic operations', () => {
    expect(read(aluEval(3, 5, 0))).toBe(8); // ADD
    expect(read(aluEval(9, 5, 1))).toBe(4); // SUB
    expect(read(aluEval(0b1100, 0b1010, 2))).toBe(0b1000); // AND
    expect(read(aluEval(0b1100, 0b1010, 3))).toBe(0b1110); // OR
    expect(read(aluEval(0b1100, 0b1010, 4))).toBe(0b0110); // XOR
    expect(read(aluEval(0b1100, 0, 5))).toBe(0b0011); // NOT A
    expect(read(aluEval(7, 0, 6))).toBe(8); // INC
    expect(read(aluEval(7, 0, 7))).toBe(6); // DEC
    expect(read(aluEval(0b0110, 0, 9))).toBe(0b1100); // SHL
    expect(read(aluEval(0b0110, 0, 10))).toBe(0b0011); // SHR
  });

  it('flags: zero, negative, carry, overflow (unsigned carry ≠ signed overflow)', () => {
    const z = aluEval(5, 5, 1); // 5-5 = 0
    expect(out(z, 'ZF')).toBe('1');
    const n = aluEval(2, 5, 1); // 2-5 = -3 → sign bit 1
    expect(out(n, 'NF')).toBe('1');
    const c = aluEval(15, 2, 0); // 15+2: carry-out 1
    expect(out(c, 'CO')).toBe('1');
    const v = aluEval(7, 1, 0); // signed overflow
    expect(out(v, 'VF')).toBe('1');
    expect(out(c, 'VF')).toBe('0');
  });

  it('CMP drives flags from A−B with a zeroed result', () => {
    const r = aluEval(4, 4, 8);
    expect(read(r)).toBe(0);
    expect(out(r, 'ZF')).toBe('1');
    const lt = aluEval(2, 5, 8);
    expect(out(lt, 'NF')).toBe('1');
  });

  it('X operand selects → X result and X flags', () => {
    const r = aluEval(1, 2, 0);
    // rebuild with an X op line
    const rx = evalDevice('alu', {
      inputs: { ...bits(1, 4), ...bbits(2, 4), OP0: 'X', OP1: '0', OP2: '0', OP3: '0', CI: '0' },
      comp: { width: 4 },
    }).result;
    expect(out(rx, 'R0')).toBe('X');
    expect(out(rx, 'ZF')).toBe('X');
    void r;
  });
});

// ---------------------------------------------------------------------------
// Sequential devices
// ---------------------------------------------------------------------------

describe('SR latch (spec §6.1)', () => {
  it('set / reset / hold', () => {
    const setR = evalDevice('sr-latch', { inputs: { S: '1', R: '0' }, state: { q: '0' } }).result;
    expect(out(setR, 'Q')).toBe('1');
    const hold = evalDevice('sr-latch', { inputs: { S: '0', R: '0' }, state: { q: '1' } }).result;
    expect(out(hold, 'Q')).toBe('1');
    const reset = evalDevice('sr-latch', { inputs: { S: '0', R: '1' }, state: { q: '1' } }).result;
    expect(out(reset, 'Q')).toBe('0');
    expect(out(reset, 'QN')).toBe('1');
  });

  it('invalid condition S=R=1 → X with warning', () => {
    const r = evalDevice('sr-latch', { inputs: { S: '1', R: '1' }, state: { q: '0' } }).result;
    expect(out(r, 'Q')).toBe('X');
    expect(r.warnings?.length).toBe(1);
  });

  it('NAND (active-LOW) variant', () => {
    const r = evalDevice('sr-latch', {
      inputs: { S: '0', R: '1' }, // active-low: S̄=0 sets
      state: { q: '0' },
      comp: { activeLow: true },
    }).result;
    expect(out(r, 'Q')).toBe('1');
  });
});

describe('D latch (spec §6.2)', () => {
  it('transparent while enabled, holds while disabled', () => {
    expect(out(evalDevice('d-latch', { inputs: { D: '1', EN: '1' }, state: { q: '0' } }).result, 'Q')).toBe('1');
    expect(out(evalDevice('d-latch', { inputs: { D: '1', EN: '0' }, state: { q: '0' } }).result, 'Q')).toBe('0');
  });
});

function edgeStep(
  type: ComponentType,
  d: LogicValue,
  clk: LogicValue,
  prevClk: LogicValue,
  state: Record<string, unknown>,
  extra: Partial<CircuitComponent> = {},
  jk?: [LogicValue, LogicValue],
) {
  const [j, k] = jk ?? [d, d === '1' ? '0' : '1'];
  return evalDevice(type, {
    inputs: { D: d, J: j, K: k, T: d, S: d, R: d === '1' ? '0' : '1', CLK: clk, PRE: '0', CLR: '0' },
    prevInputs: { D: d, J: j, K: k, T: d, S: d, R: d === '1' ? '0' : '1', CLK: prevClk, PRE: '0', CLR: '0' },
    state,
    t: 2e-3,
    comp: extra,
  }).result;
}

describe('D flip-flop (spec §6.4)', () => {
  it('captures D on the rising edge only', () => {
    const r = edgeStep('d-flip-flop', '1', '1', '0', { q: '0' });
    expect(out(r, 'Q')).toBe('1');
    const noEdge = edgeStep('d-flip-flop', '1', '1', '1', { q: '0' });
    expect(out(noEdge, 'Q')).toBe('0');
    const falling = edgeStep('d-flip-flop', '1', '0', '1', { q: '0' });
    expect(out(falling, 'Q')).toBe('0');
  });

  it('falling-edge configuration captures on ↓', () => {
    const r = edgeStep('d-flip-flop', '1', '0', '1', { q: '0' }, { edge: 'falling' });
    expect(out(r, 'Q')).toBe('1');
  });

  it('async preset / clear override the clock', () => {
    const pre = evalDevice('d-flip-flop', {
      inputs: { D: '0', CLK: '0', PRE: '1', CLR: '0' },
      state: { q: '0' },
    }).result;
    expect(out(pre, 'Q')).toBe('1');
    const clr = evalDevice('d-flip-flop', {
      inputs: { D: '1', CLK: '0', PRE: '0', CLR: '1' },
      state: { q: '1' },
    }).result;
    expect(out(clr, 'Q')).toBe('0');
  });

  it('setup violation: data changing with the edge → metastable X + warning', () => {
    const t = 2e-3;
    const dt = 1e-4;
    const r = evalDevice('d-flip-flop', {
      inputs: { D: '1', CLK: '1', PRE: '0', CLR: '0' },
      prevInputs: { D: '0', CLK: '0', PRE: '0', CLR: '0' },
      inputChangedAt: { D: t, CLK: t }, // D changed on the same step as CLK
      state: { q: '0' },
      t,
      dt,
    }).result;
    expect(out(r, 'Q')).toBe('X');
    expect(r.violation).toBe(true);
    expect(r.metastable).toBeGreaterThan(0);
  });
});

describe('JK flip-flop (spec §6.5)', () => {
  it('set / reset / hold / toggle on the edge', () => {
    expect(out(edgeStep('jk-flip-flop', '1', '1', '0', { q: '0' }, {}, ['1', '0']), 'Q')).toBe('1'); // set
    expect(out(edgeStep('jk-flip-flop', '0', '1', '0', { q: '1' }, {}, ['0', '1']), 'Q')).toBe('0'); // reset
    expect(out(edgeStep('jk-flip-flop', '0', '1', '0', { q: '0' }, {}, ['0', '0']), 'Q')).toBe('0'); // hold
    expect(out(edgeStep('jk-flip-flop', '1', '1', '0', { q: '1' }, {}, ['1', '1']), 'Q')).toBe('0'); // toggle
    expect(out(edgeStep('jk-flip-flop', '1', '1', '0', { q: '0' }, {}, ['1', '1']), 'Q')).toBe('1'); // toggle
  });
});

describe('T flip-flop (spec §6.6)', () => {
  it('toggles when T=1, holds when T=0', () => {
    expect(out(edgeStep('t-flip-flop', '1', '1', '0', { q: '0' }), 'Q')).toBe('1');
    expect(out(edgeStep('t-flip-flop', '1', '1', '0', { q: '1' }), 'Q')).toBe('0');
    expect(out(edgeStep('t-flip-flop', '0', '1', '0', { q: '1' }), 'Q')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Registers / shift registers / counters
// ---------------------------------------------------------------------------

const dInputs = (n: number, w: number): Record<string, LogicValue> => ({
  ...Object.fromEntries(Array.from({ length: w }, (_, i) => [`D${i}`, bit((n >> i) & 1)])),
  CLK: '1',
  EN: '1',
  CLR: '0',
  SER: '0',
  SL: '0',
  LOAD: '0',
});
const dPrev = (w: number): Record<string, LogicValue> => ({
  ...Object.fromEntries(Array.from({ length: w }, (_, i) => [`D${i}`, '0' as LogicValue])),
  CLK: '0',
  EN: '1',
  CLR: '0',
  SER: '0',
  SL: '0',
  LOAD: '0',
});
const readBits = (r: DeviceEvalResult, w: number): number => {
  let v = 0;
  for (let i = 0; i < w; i++) if (out(r, `Q${i}`) === '1') v += 1 << i;
  return v;
};

describe('register (spec §7)', () => {
  it('parallel-loads D on the edge when enabled, holds otherwise', () => {
    const loaded = evalDevice('register', {
      inputs: dInputs(0b1010, 4),
      prevInputs: dPrev(4),
      state: { q: ['0', '0', '0', '0'] },
    }).result;
    expect(readBits(loaded, 4)).toBe(0b1010);
    const held = evalDevice('register', {
      inputs: { ...dInputs(0b1010, 4), EN: '0' },
      prevInputs: { ...dPrev(4), EN: '0' },
      state: { q: ['0', '0', '1', '0'] },
    }).result;
    expect(readBits(held, 4)).toBe(0b0100);
  });

  it('async clear zeroes the register', () => {
    const r = evalDevice('register', {
      inputs: { ...dInputs(0b1010, 4), CLR: '1' },
      state: { q: ['1', '0', '1', '0'] },
    }).result;
    expect(readBits(r, 4)).toBe(0);
  });
});

describe('shift register (spec §7)', () => {
  it('SIPO shifts serial data in at bit 0 on the right', () => {
    // Right shift: SER enters Q0, each bit moves toward the MSB.
    const r1 = evalDevice('shift-register', {
      inputs: { ...dInputs(0, 4), SER: '1' },
      prevInputs: dPrev(4),
      state: { q: ['0', '1', '0', '0'] }, // Q=0100
      comp: { shiftMode: 'sipo' },
    }).result;
    expect(readBits(r1, 4)).toBe(0b0101); // SER=1 → Q0; old bits move up
    const r2 = evalDevice('shift-register', {
      inputs: { ...dInputs(0, 4), SER: '0' },
      prevInputs: dPrev(4),
      state: { q: ['0', '1', '0', '0'] },
      comp: { shiftMode: 'sipo' },
    }).result;
    expect(readBits(r2, 4)).toBe(0b0100);
  });

  it('PISO loads parallel data and shifts it out serially', () => {
    const loaded = evalDevice('shift-register', {
      inputs: { ...dInputs(0b1100, 4), SL: '1' },
      prevInputs: dPrev(4),
      state: { q: ['0', '0', '0', '0'] },
      comp: { shiftMode: 'piso' },
    }).result;
    expect(out(loaded, 'QSER')).toBe('1'); // MSB visible on serial out
  });
});

describe('counter (spec §8)', () => {
  const countEval = (
    mode: string,
    q: number,
    opts: { en?: LogicValue; ud?: LogicValue; load?: number; w?: number } = {},
  ) =>
    evalDevice('counter', {
      inputs: {
        ...dInputs(opts.load ?? 0, opts.w ?? 4),
        EN: opts.en ?? '1',
        UD: opts.ud ?? '1',
        LOAD: opts.load !== undefined ? '1' : '0',
      },
      prevInputs: dPrev(opts.w ?? 4),
      state: { q: Array.from({ length: opts.w ?? 4 }, (_, i) => bit((q >> i) & 1)) },
      comp: { counterMode: mode as CircuitComponent['counterMode'], width: opts.w ?? 4 },
    }).result;

  it('up counter increments and rolls over (overflow wraps)', () => {
    expect(readBits(countEval('up', 5), 4)).toBe(6);
    expect(readBits(countEval('up', 15), 4)).toBe(0);
  });

  it('down counter decrements and wraps at zero (underflow)', () => {
    expect(readBits(countEval('down', 5), 4)).toBe(4);
    expect(readBits(countEval('down', 0), 4)).toBe(15);
  });

  it('up/down counter follows the U/D control', () => {
    expect(readBits(countEval('updown', 5, { ud: '1' }), 4)).toBe(6);
    expect(readBits(countEval('updown', 5, { ud: '0' }), 4)).toBe(4);
  });

  it('terminal count output asserts at the roll point while enabled', () => {
    // countEval evaluates the NEXT state: state 14 → count 15 → RCO = 1.
    expect(out(countEval('up', 13), 'RCO')).toBe('0');
    expect(out(countEval('up', 14), 'RCO')).toBe('1');
    expect(out(countEval('down', 2), 'RCO')).toBe('0');
    expect(out(countEval('down', 1), 'RCO')).toBe('1');
  });

  it('parallel load has priority over counting', () => {
    const r = evalDevice('counter', {
      inputs: { ...dInputs(0b0110, 4), LOAD: '1', EN: '1' },
      prevInputs: dPrev(4),
      state: { q: ['1', '1', '1', '1'] },
      comp: { counterMode: 'up', width: 4 },
    }).result;
    expect(readBits(r, 4)).toBe(0b0110);
  });

  it('enable low freezes the count', () => {
    expect(readBits(countEval('up', 9, { en: '0' }), 4)).toBe(9);
  });

  it('ring counter rotates a one-hot bit', () => {
    expect(readBits(countEval('ring', 0b0001), 4)).toBe(0b0010);
    expect(readBits(countEval('ring', 0b1000), 4)).toBe(0b0001); // wraps
  });

  it('Johnson counter shifts with inverted feedback', () => {
    // LSB-first bit order (Q0 = bit 0): the 8-state cycle
    // 0 → 1 → 3 → 7 → 15 → 14 → 12 → 8 → 0
    expect(readBits(countEval('johnson', 0b0000), 4)).toBe(0b0001);
    expect(readBits(countEval('johnson', 0b0011), 4)).toBe(0b0111);
    expect(readBits(countEval('johnson', 0b1111), 4)).toBe(0b1110);
    expect(readBits(countEval('johnson', 0b1110), 4)).toBe(0b1100);
    expect(readBits(countEval('johnson', 0b1000), 4)).toBe(0b0000);
  });
});

// ---------------------------------------------------------------------------
// BCD → seven-segment decoder (spec §9.1)
// ---------------------------------------------------------------------------

describe('BCD → seven-segment decoder', () => {
  const seg = (n: number, hexMode = false) =>
    evalDevice('bcd-to-seven-segment-decoder', {
      inputs: {
        B0: bit((n >> 0) & 1),
        B1: bit((n >> 1) & 1),
        B2: bit((n >> 2) & 1),
        B3: bit((n >> 3) & 1),
      },
      comp: { hexMode },
    }).result;

  const litCount = (r: DeviceEvalResult): number =>
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((s) => out(r, s) === '1').length;

  it('digit 0 lights segments a–f, not g', () => {
    const r = seg(0);
    expect(out(r, 'A')).toBe('1');
    expect(out(r, 'G')).toBe('0');
    expect(litCount(r)).toBe(6);
  });

  it('digit 1 lights b and c only', () => {
    expect(litCount(seg(1))).toBe(2);
  });

  it('digit 8 lights all seven segments', () => {
    expect(litCount(seg(8))).toBe(7);
  });

  it('invalid BCD blanks (10–15) unless hex mode is on', () => {
    expect(litCount(seg(12))).toBe(0); // blank, NOT silently hex
    expect(litCount(seg(12, true))).toBe(4); // 'C' = a,d,e,f
    expect(litCount(seg(15, true))).toBe(4); // 'F' = a,e,f,g
  });

  it('X input → X segments', () => {
    const r = evalDevice('bcd-to-seven-segment-decoder', {
      inputs: { B0: 'X', B1: '0', B2: '0', B3: '0' },
    }).result;
    expect(out(r, 'A')).toBe('X');
  });

  it('common-anode mode inverts the outputs', () => {
    const r = evalDevice('bcd-to-seven-segment-decoder', {
      inputs: { B0: '0', B1: '0', B2: '0', B3: '0' },
      comp: { commonType: 'common-anode' },
    }).result;
    expect(out(r, 'A')).toBe('0');
    expect(out(r, 'G')).toBe('1');
  });
});
