import { describe, it, expect } from 'vitest';
import {
  calculateEbersMoll,
  detectOperatingRegion,
  DEFAULT_BJT_PARAMS,
} from './bjtModel';

describe('BJT Model', () => {
  it('should detect cutoff for low VBE', () => {
    const params = DEFAULT_BJT_PARAMS;
    const result = calculateEbersMoll(0.1, -0.5, 0.5, params, 25);
    expect(result.ib).toBeGreaterThanOrEqual(0);
    expect(Math.abs(result.ic)).toBeLessThan(1e-8);
  });

  it('should have positive collector current in forward active', () => {
    const params = DEFAULT_BJT_PARAMS;
    const result = calculateEbersMoll(0.7, -1.5, 1.0, params, 25);
    expect(result.ic).toBeGreaterThan(1e-6);
    expect(result.ib).toBeGreaterThan(1e-9);
    expect(Math.abs(result.ie)).toBeCloseTo(Math.abs(result.ic + result.ib), 1);
  });

  it('should detect saturation when VBC > 0', () => {
    const params = DEFAULT_BJT_PARAMS;
    const region = detectOperatingRegion(0.8, 0.3, -0.5, params);
    expect(region).toBe('saturation');
  });

  it('should keep KCL within numerical tolerance', () => {
    const params = DEFAULT_BJT_PARAMS;
    for (const vBE of [0.1, 0.5, 0.7, 1.0]) {
      const result = calculateEbersMoll(vBE, -1.0, 1.0, params, 25);
      const kcl = result.ib + result.ic + result.ie;
      expect(Math.abs(kcl)).toBeLessThan(1e-6);
    }
  });
});
