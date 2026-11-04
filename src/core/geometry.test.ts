import { describe, it, expect } from 'vitest';
import { terminalWorld, allTerminals } from './geometry';
import type { CircuitComponent } from '../models/circuit';

const base: CircuitComponent = {
  id: 'r1',
  type: 'resistor',
  x: 100,
  y: 50,
  rotation: 0,
  label: 'R1',
  value: 1000,
};

describe('terminalWorld mirroring', () => {
  it('leaves terminals unchanged when not mirrored', () => {
    const plain = terminalWorld(base, 0);
    expect(plain.x).toBeCloseTo(base.x + terminalLocalX(base, 0));
  });

  it('mirrors terminal x in local space (horizontal flip)', () => {
    const mirrored = { ...base, mirrored: true };
    const a = terminalWorld(base, 0);
    const b = terminalWorld(mirrored, 0);
    // mirror around the component center: x' = 2*cx - x
    expect(b.x).toBeCloseTo(2 * base.x - a.x);
    expect(b.y).toBeCloseTo(a.y);
  });

  it('keeps mirrored terminals distinct (left/right swap)', () => {
    const mirrored = { ...base, mirrored: true };
    const t0 = terminalWorld(base, 0);
    const t1 = terminalWorld(base, 1);
    const m0 = terminalWorld(mirrored, 0);
    const m1 = terminalWorld(mirrored, 1);
    // each mirrored terminal lands where the opposite one was
    expect(m0.x).toBeCloseTo(t1.x);
    expect(m1.x).toBeCloseTo(t0.x);
  });

  it('composes mirror with rotation (90°): x holds, y flips about center', () => {
    const rotated: CircuitComponent = { ...base, rotation: 90 };
    const mirroredRotated: CircuitComponent = { ...base, rotation: 90, mirrored: true };
    const t = terminalWorld(rotated, 0);
    const m = terminalWorld(mirroredRotated, 0);
    // local (Lx, Ly) → rotate90: (-Ly, Lx); mirrored then rotated: (-Ly, -Lx)
    expect(m.x).toBeCloseTo(t.x);
    expect(m.y).toBeCloseTo(2 * base.y - t.y);
  });

  it('mirrors the outward direction together with the position', () => {
    const mirrored = { ...base, mirrored: true };
    for (let i = 0; i < allTerminals(base).length; i++) {
      const a = terminalWorld(base, i);
      const b = terminalWorld(mirrored, i);
      expect(b.dx).toBeCloseTo(-a.dx);
      expect(b.dy).toBeCloseTo(a.dy);
    }
  });
});

/** local terminal x of terminal i for the base (rotation 0) component */
function terminalLocalX(comp: CircuitComponent, index: number): number {
  return terminalWorld(comp, index).x - comp.x;
}
