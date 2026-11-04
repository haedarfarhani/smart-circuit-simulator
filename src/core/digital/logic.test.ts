/**
 * Four-value logic semantics (spec §2.1): every table over {0, 1, X, Z},
 * including the X/Z behaviours required by the spec — X and Z are never
 * silently converted to Boolean values.
 */
import { describe, expect, it } from 'vitest';
import {
  logicAnd,
  logicBuf,
  logicMajority,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicXnor,
  logicXor,
  resolveDrivers,
  type LogicValue,
} from './logic';

const FOUR: LogicValue[] = ['0', '1', 'X', 'Z'];

describe('AND (4-value)', () => {
  it('matches the Boolean truth table for known values', () => {
    expect(logicAnd(['0', '0'])).toBe('0');
    expect(logicAnd(['0', '1'])).toBe('0');
    expect(logicAnd(['1', '0'])).toBe('0');
    expect(logicAnd(['1', '1'])).toBe('1');
  });

  it('a known 0 dominates, X and Z propagate as unknown', () => {
    for (const v of FOUR) {
      expect(logicAnd(['0', v])).toBe('0'); // 0 AND anything = 0
      if (v === '0' || v === '1') {
        expect(logicAnd(['1', v])).toBe(v === '1' ? '1' : '0');
      } else {
        expect(logicAnd(['1', v])).toBe('X');
      }
    }
    expect(logicAnd(['X', 'Z'])).toBe('X');
    expect(logicAnd(['1', '1', 'X'])).toBe('X');
  });
});

describe('OR (4-value)', () => {
  it('matches the Boolean truth table for known values', () => {
    expect(logicOr(['0', '0'])).toBe('0');
    expect(logicOr(['0', '1'])).toBe('1');
    expect(logicOr(['1', '0'])).toBe('1');
    expect(logicOr(['1', '1'])).toBe('1');
  });

  it('a known 1 dominates, X and Z propagate as unknown', () => {
    for (const v of FOUR) {
      expect(logicOr(['1', v])).toBe('1'); // 1 OR anything = 1
      if (v === '1') continue; // covered by the dominance line above
      expect(logicOr(['0', v])).toBe(v === '0' ? '0' : 'X');
    }
    expect(logicOr(['X', 'Z'])).toBe('X');
  });
});

describe('NOT / NAND / NOR / XNOR', () => {
  it('NOT inverts known values only', () => {
    expect(logicNot('0')).toBe('1');
    expect(logicNot('1')).toBe('0');
    expect(logicNot('X')).toBe('X');
    expect(logicNot('Z')).toBe('X');
  });

  it('NAND / NOR are inverted AND / OR', () => {
    expect(logicNand(['1', '1'])).toBe('0');
    expect(logicNand(['0', '1'])).toBe('1');
    expect(logicNand(['1', 'X'])).toBe('X');
    expect(logicNor(['0', '0'])).toBe('1');
    expect(logicNor(['1', '0'])).toBe('0');
    expect(logicNor(['0', 'Z'])).toBe('X');
  });

  it('XNOR inverts XOR', () => {
    expect(logicXnor(['0', '0'])).toBe('1');
    expect(logicXnor(['1', '0'])).toBe('0');
    expect(logicXnor(['1', '1'])).toBe('1');
    expect(logicXnor(['1', 'X'])).toBe('X');
  });
});

describe('XOR (spec §4.6: odd parity, UNKNOWN handling)', () => {
  it('is 1 for an odd number of 1 inputs', () => {
    expect(logicXor(['0', '0'])).toBe('0');
    expect(logicXor(['0', '1'])).toBe('1');
    expect(logicXor(['1', '0'])).toBe('1');
    expect(logicXor(['1', '1'])).toBe('0');
    expect(logicXor(['1', '1', '1'])).toBe('1');
    expect(logicXor(['1', '1', '0'])).toBe('0');
  });

  it('any X or Z input makes parity unknowable', () => {
    for (const v of ['X', 'Z'] as LogicValue[]) {
      expect(logicXor([v, '0'])).toBe('X');
      expect(logicXor([v, '1'])).toBe('X');
    }
  });
});

describe('buffer (spec §4.8)', () => {
  it('preserves the logic state, Z included', () => {
    for (const v of FOUR) expect(logicBuf(v)).toBe(v);
  });
});

describe('majority (carry-out semantics)', () => {
  it('two known 1s win over anything', () => {
    expect(logicMajority('1', '1', 'X')).toBe('1');
    expect(logicMajority('1', 'X', '1')).toBe('1');
    expect(logicMajority('1', '1', '0')).toBe('1');
  });

  it('two known 0s force 0', () => {
    expect(logicMajority('0', '0', 'X')).toBe('0');
    expect(logicMajority('0', '0', '1')).toBe('0');
  });

  it('otherwise unknown', () => {
    expect(logicMajority('0', '1', 'X')).toBe('X');
    expect(logicMajority('X', 'X', '1')).toBe('X');
  });
});

describe('driver resolution (contention)', () => {
  it('Z yields to a driven value', () => {
    expect(resolveDrivers(['Z', '1']).value).toBe('1');
    expect(resolveDrivers(['0', 'Z']).value).toBe('0');
    expect(resolveDrivers(['Z']).value).toBe('Z');
  });

  it('agreeing drivers resolve to their common value', () => {
    expect(resolveDrivers(['1', '1', '1']).value).toBe('1');
    expect(resolveDrivers(['0', '0']).contention).toBe(false);
  });

  it('0 vs 1 is real contention: X + flagged', () => {
    const r = resolveDrivers(['0', '1']);
    expect(r.value).toBe('X');
    expect(r.contention).toBe(true);
  });
});
