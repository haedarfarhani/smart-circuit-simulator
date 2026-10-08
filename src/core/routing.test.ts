import { describe, expect, it } from 'vitest';
import {
  autoRoute,
  connectPoints,
  extendFrom,
  routeToTerminal,
  simplify,
} from './routing';
import type { Point } from '../models/circuit';

/** Every consecutive pair must be horizontal or vertical. */
function assertOrthogonal(pts: Point[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    expect(a.x === b.x || a.y === b.y, `segment ${i} not orthogonal`).toBe(true);
  }
}

describe('simplify', () => {
  it('removes duplicate consecutive points', () => {
    const out = simplify([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('removes collinear middle points', () => {
    const out = simplify([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
});

describe('autoRoute', () => {
  it('produces a straight line for facing collinear terminals', () => {
    const pts = autoRoute(
      { x: 0, y: 0, dx: 1, dy: 0 },
      { x: 100, y: 0, dx: -1, dy: 0 },
    );
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('routes horizontal terminals at different heights orthogonally', () => {
    const pts = autoRoute(
      { x: 0, y: 0, dx: 1, dy: 0 },
      { x: 100, y: 50, dx: -1, dy: 0 },
    );
    assertOrthogonal(pts);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 50 });
  });

  it('routes a horizontal terminal to a vertical (ground) terminal', () => {
    const pts = autoRoute(
      { x: 0, y: 0, dx: 1, dy: 0 },
      { x: 60, y: 80, dx: 0, dy: -1 },
    );
    assertOrthogonal(pts);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 60, y: 80 });
  });

  it('routes two vertical terminals', () => {
    const pts = autoRoute(
      { x: 0, y: 0, dx: 0, dy: -1 },
      { x: 40, y: 100, dx: 0, dy: -1 },
    );
    assertOrthogonal(pts);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 40, y: 100 });
  });
});

describe('routeToTerminal', () => {
  it('approaches a horizontal terminal along its axis', () => {
    const pts = routeToTerminal({ x: 0, y: 50 }, { x: 80, y: 0, dx: -1, dy: 0 });
    assertOrthogonal(pts);
    // final segment must be horizontal (terminal faces sideways)
    const n = pts.length;
    expect(pts[n - 1].y).toBe(pts[n - 2].y);
  });

  it('goes straight when already aligned', () => {
    const pts = routeToTerminal({ x: 0, y: 0 }, { x: 80, y: 0, dx: -1, dy: 0 });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ]);
  });
});

describe('connectPoints / extendFrom', () => {
  it('inserts a single elbow', () => {
    const pts = connectPoints({ x: 0, y: 0 }, { x: 30, y: 40 }, true);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
    ]);
  });

  it('extendFrom continues in the given direction', () => {
    const pts = extendFrom({ x: 0, y: 0 }, true, { x: 0, y: 40 });
    assertOrthogonal(pts);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 40 });
  });
});
