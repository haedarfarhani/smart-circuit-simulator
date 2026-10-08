import { describe, expect, it } from 'vitest';
import {
  capacitorEnergy,
  chargeProgress,
  energyFraction,
  equivalentResistance,
  estimateLoopResistance,
  flowSpeed,
  formatEnergy,
  inductorEnergy,
  lampBrightness,
  lampLoad,
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  pulsePattern,
  pulseStrength,
  rcTimeConstant,
  rlTimeConstant,
  visualTimeConstant,
} from './flow';

describe('flowSpeed', () => {
  it('is zero without current', () => {
    expect(flowSpeed(0)).toBe(0);
  });

  it('grows monotonically with current', () => {
    const speeds = [0.01, 0.05, 0.5, 5].map((i) => flowSpeed(i));
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    }
  });

  it('makes a high-resistance branch visibly slower at the same voltage', () => {
    const lowR = flowSpeed(9 / 100); // 9 V across 100 Ω
    const highR = flowSpeed(9 / 1000); // 9 V across 1 kΩ
    expect(highR).toBeLessThan(lowR);
  });

  it('clamps at both ends so faults do not blur and trickles still move', () => {
    expect(flowSpeed(1e9)).toBe(MAX_FLOW_SPEED);
    expect(flowSpeed(1e-12)).toBe(MIN_FLOW_SPEED);
  });

  it('scales with the simulation speed multiplier', () => {
    expect(flowSpeed(0.05, 2)).toBeCloseTo(flowSpeed(0.05, 1) * 2, 6);
  });
});

describe('pulseStrength', () => {
  it('is zero without current and saturates on a strong current', () => {
    expect(pulseStrength(0)).toBe(0);
    expect(pulseStrength(0.1)).toBe(1);
    expect(pulseStrength(1)).toBe(1);
  });

  it('rises with current', () => {
    expect(pulseStrength(0.045)).toBeGreaterThan(pulseStrength(0.01));
  });
});

describe('stored energy', () => {
  it('computes ½CV²', () => {
    expect(capacitorEnergy(1e-6, 9)).toBeCloseTo(40.5e-6, 12);
  });

  it('computes ½LI²', () => {
    expect(inductorEnergy(0.05, 0.2)).toBeCloseTo(0.001, 12);
  });
});

describe('time constants and charge progress', () => {
  it('uses τ = RC and τ = L/R', () => {
    expect(rcTimeConstant(1000, 1e-6)).toBeCloseTo(1e-3, 12);
    expect(rlTimeConstant(0.05, 50)).toBeCloseTo(1e-3, 12);
  });

  it('approaches 1 after several time constants', () => {
    expect(chargeProgress(0, 1)).toBe(0);
    expect(chargeProgress(1, 1)).toBeCloseTo(0.632, 3);
    expect(chargeProgress(6, 1)).toBeGreaterThan(0.997);
  });

  it('squares the progress for stored energy', () => {
    expect(energyFraction(1, 1)).toBeCloseTo(0.3996, 3);
    expect(energyFraction(0, 1)).toBe(0);
  });

  it('treats a zero time constant as instant', () => {
    expect(chargeProgress(0, 0)).toBe(1);
  });
});

describe('equivalentResistance', () => {
  it('divides source voltage by source current', () => {
    expect(equivalentResistance(9, 0.09)).toBeCloseTo(100, 6);
  });

  it('falls back to 1 Ω when there is no current', () => {
    expect(equivalentResistance(9, 0)).toBe(1);
    expect(equivalentResistance(0, 0)).toBe(1);
  });
});

describe('lamp brightness', () => {
  it('follows power relative to the watt rating', () => {
    expect(lampBrightness(30, 60)).toBeCloseTo(0.5, 9);
    expect(lampBrightness(60, 60)).toBe(1);
  });

  it('responds to voltage and current together', () => {
    // same lamp, less voltage across it means both V and I drop
    const bright = lampBrightness(9 * (9 / 60), 60);
    const dim = lampBrightness(4.5 * (4.5 / 60), 60);
    expect(dim).toBeLessThan(bright);
    expect(dim / bright).toBeCloseTo(0.25, 6);
  });

  it('is dark with no power and saturated past the rating', () => {
    expect(lampBrightness(0, 60)).toBe(0);
    expect(lampBrightness(120, 60)).toBe(1);
    expect(lampLoad(120, 60)).toBeCloseTo(2, 9);
  });

  it('guards against a missing rating', () => {
    expect(lampBrightness(10, 0)).toBe(0);
    expect(lampLoad(10, Number.NaN)).toBe(0);
  });
});

describe('pulsePattern', () => {
  /** position of the dash's leading edge along the path */
  const leadingEdge = (offset: number, len: number) => -offset + len;
  const trailingEdge = (offset: number) => -offset;

  it('puts the head at the front of the pulse and the trail behind it', () => {
    const p = pulsePattern(0.09, 0, 1);
    expect(leadingEdge(p.headOffset, p.headLen)).toBeCloseTo(
      leadingEdge(p.coreOffset, p.coreLen),
      9,
    );
    expect(leadingEdge(p.trailOffset, p.trailLen)).toBeCloseTo(
      leadingEdge(p.coreOffset, p.coreLen),
      9,
    );
    expect(trailingEdge(p.trailOffset)).toBeLessThan(
      trailingEdge(p.coreOffset),
    );
  });

  it('keeps all three dashes on one period so spacing matches', () => {
    const p = pulsePattern(0.5, 0, 1);
    expect(p.period).toBeGreaterThan(p.trailLen);
    expect(p.period).toBeGreaterThan(p.coreLen);
    expect(p.period).toBeGreaterThan(p.headLen);
  });

  it('scales with zoom so the look is screen constant', () => {
    const at1 = pulsePattern(0.09, 0, 1);
    const at2 = pulsePattern(0.09, 0, 2);
    expect(at2.coreLen).toBeCloseTo(at1.coreLen / 2, 9);
    expect(at2.coreWidth).toBeCloseTo(at1.coreWidth / 2, 9);
  });

  it('grows and brightens with current', () => {
    const weak = pulsePattern(0.01, 0, 1);
    const strong = pulsePattern(0.1, 0, 1);
    expect(strong.coreWidth).toBeGreaterThan(weak.coreWidth);
    expect(strong.trailOpacity).toBeGreaterThan(weak.trailOpacity);
  });

  it('advances the pulse forward with the phase', () => {
    const a = pulsePattern(0.09, 0, 1);
    const b = pulsePattern(0.09, 5, 1);
    expect(leadingEdge(b.coreOffset, b.coreLen)).toBeGreaterThan(
      leadingEdge(a.coreOffset, a.coreLen),
    );
  });

  it('wraps the phase so the pattern never jumps', () => {
    const p = pulsePattern(0.09, 27, 1);
    const zero = pulsePattern(0.09, 0, 1);
    expect(p.coreOffset).toBeCloseTo(zero.coreOffset, 9);
  });
});

describe('estimateLoopResistance', () => {
  it('measures the loop from the source while current flows', () => {
    expect(estimateLoopResistance(9, 0.09, [1000])).toBeCloseTo(100, 6);
  });

  it('falls back to the resistive elements once a capacitor blocks', () => {
    expect(estimateLoopResistance(9, 0, [1000, 100])).toBeCloseTo(1100, 6);
  });
});

describe('visualTimeConstant', () => {
  it('keeps the animation readable for microsecond constants', () => {
    expect(visualTimeConstant(1e-6)).toBe(0.3);
  });

  it('caps very slow charges', () => {
    expect(visualTimeConstant(60)).toBe(3);
    expect(visualTimeConstant(1.2)).toBeCloseTo(1.2, 6);
  });
});

describe('formatEnergy', () => {
  it('picks a readable SI prefix', () => {
    expect(formatEnergy(1.5)).toBe('1.50 J');
    expect(formatEnergy(40.5e-6)).toBe('40.5 µJ');
    expect(formatEnergy(0.001)).toBe('1.00 mJ');
  });
});
