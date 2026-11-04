import { describe, it, expect } from 'vitest';
import { parseEngineeringValue, formatEngineering } from './units';

describe('parseEngineeringValue', () => {
  it('parses plain numbers', () => {
    expect(parseEngineeringValue('100')).toBe(100);
    expect(parseEngineeringValue('0.1')).toBeCloseTo(0.1);
    expect(parseEngineeringValue('-2.5')).toBe(-2.5);
    expect(parseEngineeringValue('1e-6')).toBeCloseTo(1e-6);
    expect(parseEngineeringValue(' 42 ')).toBe(42);
    expect(parseEngineeringValue('3,5')).toBeCloseTo(3.5);
  });

  it('parses SI prefixes', () => {
    expect(parseEngineeringValue('10k')).toBe(10000);
    expect(parseEngineeringValue('10K')).toBe(10000);
    expect(parseEngineeringValue('10M')).toBe(1e7);
    expect(parseEngineeringValue('100u')).toBeCloseTo(1e-4);
    expect(parseEngineeringValue('100µ')).toBeCloseTo(1e-4);
    expect(parseEngineeringValue('4m')).toBeCloseTo(0.004);
    expect(parseEngineeringValue('2n')).toBeCloseTo(2e-9);
    expect(parseEngineeringValue('5p')).toBeCloseTo(5e-12);
    expect(parseEngineeringValue('1G')).toBe(1e9);
    expect(parseEngineeringValue('2meg')).toBe(2e6);
  });

  it('parses compact notation (4m7 = 4.7m)', () => {
    expect(parseEngineeringValue('4m7')).toBeCloseTo(0.0047);
    expect(parseEngineeringValue('1k5')).toBe(1500);
    expect(parseEngineeringValue('100n')).toBeCloseTo(1e-7);
  });

  it('rejects invalid input', () => {
    expect(parseEngineeringValue('')).toBeNull();
    expect(parseEngineeringValue('abc')).toBeNull();
    expect(parseEngineeringValue('10x')).toBeNull();
    expect(parseEngineeringValue('--5')).toBeNull();
  });
});

describe('formatEngineering', () => {
  it('formats with SI prefixes', () => {
    expect(formatEngineering(10000)).toBe('10k');
    expect(formatEngineering(1e-4)).toBe('100u');
    expect(formatEngineering(0.0047)).toBe('4.7m');
    expect(formatEngineering(0)).toBe('0');
    expect(formatEngineering(1500)).toBe('1.5k');
    expect(formatEngineering(4700)).toBe('4.7k');
    expect(formatEngineering(470)).toBe('470');
  });

  it('round-trips through the parser', () => {
    for (const v of [10, 4700, 1e-6, 0.0047, 3.3, 1e9]) {
      expect(parseEngineeringValue(formatEngineering(v))).toBeCloseTo(v);
    }
  });
});
